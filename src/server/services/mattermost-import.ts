import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  channels,
  conversationMembers,
  conversations,
  files,
  messageReactions,
  messages,
  users,
  workspaceMembers,
  workspaces
} from "@/db/schema";
import type { Conversation, User, Workspace } from "@/db/schema";
import { emojiChar } from "@/client/emoji";
import { normalizeEmail } from "@/lib/security";
import { fileExpiresAt } from "./file-policy";
import { buildStorageKey, putObject } from "./storage";

export type MattermostImportOptions = {
  workspaceId?: string;
  workspaceSlug?: string;
  exportPath: string;
  attachmentsDir?: string;
  dryRun?: boolean;
};

export type MattermostImportSummary = {
  workspaceName: string;
  dryRun: boolean;
  usersCreated: number;
  usersMatched: number;
  channelsCreated: number;
  channelsMatched: number;
  directConversationsCreated: number;
  directConversationsMatched: number;
  groupConversationsCreated: number;
  groupConversationsMatched: number;
  membershipsCreated: number;
  messagesCreated: number;
  messagesSkipped: number;
  reactionsCreated: number;
  reactionsSkipped: number;
  ignoredReactionEmoji: Record<string, number>;
  filesCreated: number;
  missingFilesCount: number;
  messagesSkippedDetails: Array<{ postId: string | null; reason: string; channel?: string | null; user?: string | null }>;
};

type MattermostUser = {
  username?: string;
  email?: string;
  nickname?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  timezone?: { automaticTimezone?: string; manualTimezone?: string; useAutomaticTimezone?: string };
  create_at?: number;
  update_at?: number;
};

type MattermostTeam = {
  name?: string;
  display_name?: string;
};

type MattermostChannel = {
  name?: string;
  display_name?: string;
  header?: string;
  purpose?: string;
  type?: string;
  team?: string;
  members?: Array<{ username?: string; roles?: string } | string>;
};

type MattermostDirectChannel = {
  participants?: Array<{ username?: string } | string>;
  shown_by?: string[];
  header?: string;
};

type MattermostPost = {
  id?: string;
  post_id?: string;
  user?: string;
  username?: string;
  channel?: string;
  channel_members?: string[];
  team?: string;
  message?: string;
  create_at?: number;
  update_at?: number;
  edit_at?: number;
  delete_at?: number;
  root_id?: string;
  original_id?: string;
  props?: Record<string, unknown>;
  reactions?: Array<{ user?: string; username?: string; emoji_name?: string; create_at?: number }>;
  /** Real field name in a Mattermost bulk export post: `{ path: "<team>/.../image.png" }`, no id/name/mime_type. */
  attachments?: MattermostFile[];
  files?: MattermostFile[];
  file_ids?: string[];
};

type MattermostFile = {
  id?: string;
  path?: string;
  name?: string;
  extension?: string;
  mime_type?: string;
  size?: number;
};

type MattermostExport = {
  teams: MattermostTeam[];
  users: MattermostUser[];
  channels: MattermostChannel[];
  directChannels: MattermostDirectChannel[];
  posts: MattermostPost[];
  channelMembers: Array<{ channel: string; user: string; roles?: string }>;
};

type MattermostConversationTarget = {
  key: string;
  type: "dm" | "group_dm";
  userIds: string[];
};

const DEFAULT_SUMMARY: MattermostImportSummary = {
  workspaceName: "",
  dryRun: false,
  usersCreated: 0,
  usersMatched: 0,
  channelsCreated: 0,
  channelsMatched: 0,
  directConversationsCreated: 0,
  directConversationsMatched: 0,
  groupConversationsCreated: 0,
  groupConversationsMatched: 0,
  membershipsCreated: 0,
  messagesCreated: 0,
  messagesSkipped: 0,
  reactionsCreated: 0,
  reactionsSkipped: 0,
  ignoredReactionEmoji: {},
  filesCreated: 0,
  missingFilesCount: 0,
  messagesSkippedDetails: []
};

export function mattermostChannelName(name: string | undefined) {
  const normalized = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized === "town-square" ? "general" : normalized;
}

export function mattermostDisplayName(user: MattermostUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return user.nickname?.trim() || fullName || user.username?.trim() || user.email?.trim() || "Imported user";
}

export function mattermostPostKey(post: MattermostPost) {
  const explicitId = post.id?.trim() || post.post_id?.trim();
  if (explicitId) return explicitId;

  const stableParts = [
    post.team ?? "",
    post.channel ?? "",
    post.user ?? post.username ?? "",
    String(post.create_at ?? ""),
    post.root_id ?? post.original_id ?? "",
    post.message ?? ""
  ];
  if (post.channel_members && post.channel_members.length > 0) {
    stableParts.splice(2, 0, mattermostConversationMemberKey(post.channel_members));
  }
  if (stableParts.every((part) => !part)) return null;
  return `generated:${createHash("sha256").update(JSON.stringify(stableParts)).digest("hex").slice(0, 32)}`;
}

export function mattermostReactionEmoji(name: string | undefined) {
  const normalized = name?.trim().toLowerCase().replace(/^:+|:+$/g, "");
  if (!normalized) return null;
  return emojiChar(normalized) ?? null;
}

export function mattermostConversationMemberKey(userIds: string[]) {
  return [...new Set(userIds)].sort().join(":");
}

export function mattermostConversationType(memberCount: number) {
  return memberCount === 2 ? "dm" : "group_dm";
}

export async function importMattermostExport(options: MattermostImportOptions): Promise<MattermostImportSummary> {
  const workspace = await resolveWorkspace(options);
  const parsed = await parseMattermostExport(options.exportPath);
  const teamName = parsed.teams[0]?.display_name?.trim() || parsed.teams[0]?.name?.trim();
  if (teamName && teamName !== workspace.name) {
    throw new Error(`Mattermost team "${teamName}" does not match workspace "${workspace.name}"`);
  }

  const summary: MattermostImportSummary = { ...DEFAULT_SUMMARY, workspaceName: workspace.name, dryRun: !!options.dryRun };
  if (options.dryRun) {
    await previewMattermostImport(workspace, parsed, options.attachmentsDir, summary);
    return summary;
  }

  const importer = await importActor(workspace);
  const userByMattermostName = await upsertUsers(workspace, parsed.users, summary);
  const conversationByMattermostChannel = await upsertConversations(workspace, importer, parsed, userByMattermostName, summary);
  await upsertMessages(workspace, parsed, userByMattermostName, conversationByMattermostChannel, options.attachmentsDir, summary);
  return summary;
}

async function previewMattermostImport(
  workspace: Workspace,
  parsed: MattermostExport,
  attachmentsDir: string | undefined,
  summary: MattermostImportSummary
) {
  const userEmails = parsed.users.flatMap((user) => (user.email ? [normalizeEmail(user.email)] : []));
  const existingUserRows =
    userEmails.length === 0
      ? []
      : await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.email, userEmails));
  const existingUsers = new Set(existingUserRows.map((user) => user.email));
  summary.usersMatched = parsed.users.filter((user) => user.email && existingUsers.has(normalizeEmail(user.email))).length;
  summary.usersCreated = parsed.users.filter((user) => user.email && !existingUsers.has(normalizeEmail(user.email))).length;

  const channelNames = uniqueChannelNames(parsed.channels.filter((channel) => !isMattermostDirectChannel(channel)));
  const existingChannels = new Set(
    channelNames.length === 0
      ? []
      : (
          await db
            .select({ name: channels.name })
            .from(channels)
            .where(and(eq(channels.workspaceId, workspace.id), inArray(channels.name, channelNames)))
        ).map((channel) => channel.name)
  );
  summary.channelsMatched = channelNames.filter((name) => existingChannels.has(name)).length;
  summary.channelsCreated = channelNames.filter((name) => !existingChannels.has(name)).length;
  summary.membershipsCreated = parsed.channelMembers.length;

  const existingUserIdsByMattermostName = new Map(
    parsed.users.flatMap((user) => {
      if (!user.username || !user.email) return [];
      const email = normalizeEmail(user.email);
      const existing = existingUserRows.find((row) => row.email === email);
      return existing ? [[user.username, existing.id] as const] : [];
    })
  );
  const directTargets = previewDirectConversationTargets(parsed, existingUserIdsByMattermostName);
  const directKeys = directTargets.map((target) => target.key);
  const existingDirectConversationKeys = new Set(
    directKeys.length === 0
      ? []
      : (
          await db
            .select({ memberKey: conversations.memberKey })
            .from(conversations)
            .where(and(eq(conversations.workspaceId, workspace.id), inArray(conversations.memberKey, directKeys)))
        ).flatMap((conversation) => conversation.memberKey ?? [])
  );
  for (const target of directTargets) {
    const matched = existingDirectConversationKeys.has(target.key);
    if (target.type === "dm") {
      matched ? (summary.directConversationsMatched += 1) : (summary.directConversationsCreated += 1);
    } else {
      matched ? (summary.groupConversationsMatched += 1) : (summary.groupConversationsCreated += 1);
    }
  }

  const postIds = parsed.posts.flatMap((post) => {
    const postKey = mattermostPostKey(post);
    return postKey ? [`mattermost:${postKey}`] : [];
  });
  const existingMessageIds = new Set(
    postIds.length === 0
      ? []
      : (
          await db.select({ clientMessageId: messages.clientMessageId }).from(messages).where(inArray(messages.clientMessageId, postIds))
        ).flatMap((message) => message.clientMessageId ?? [])
  );
  for (const post of parsed.posts) {
    const postKey = mattermostPostKey(post);
    if (!postKey) {
      skipMessage(summary, post, "missing_id");
    } else if (existingMessageIds.has(`mattermost:${postKey}`)) {
      skipMessage(summary, post, "already_imported");
    } else {
      summary.messagesCreated += 1;
    }
  }
  for (const post of parsed.posts) {
    for (const reaction of post.reactions ?? []) {
      if (mattermostReactionEmoji(reaction.emoji_name)) summary.reactionsCreated += 1;
      else skipReaction(summary, reaction.emoji_name);
    }
  }
  await previewFiles(parsed.posts, attachmentsDir, summary);
}

async function resolveWorkspace(options: MattermostImportOptions) {
  const where = options.workspaceId
    ? eq(workspaces.id, options.workspaceId)
    : options.workspaceSlug
      ? eq(workspaces.slug, options.workspaceSlug)
      : undefined;
  if (!where) throw new Error("Pass --workspace-id or --workspace-slug");
  const [workspace] = await db.select().from(workspaces).where(where).limit(1);
  if (!workspace) throw new Error("Workspace not found");
  return workspace;
}

export async function parseMattermostExport(exportPath: string): Promise<MattermostExport> {
  const raw = await readFile(exportPath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return { teams: [], users: [], channels: [], directChannels: [], posts: [], channelMembers: [] };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return normalizeExport(JSON.parse(trimmed));
    } catch {
      // Mattermost bulk exports are commonly JSONL: each line is a JSON object,
      // so the file still starts with "{" even though it is not one JSON value.
    }
  }

  const parsed: MattermostExport = { teams: [], users: [], channels: [], directChannels: [], posts: [], channelMembers: [] };
  const input = createReadStream(exportPath, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    appendMattermostRecord(parsed, JSON.parse(line));
  }
  return parsed;
}

function normalizeExport(value: unknown): MattermostExport {
  const parsed: MattermostExport = { teams: [], users: [], channels: [], directChannels: [], posts: [], channelMembers: [] };
  const records = Array.isArray(value) ? value : [value];
  for (const record of records) appendMattermostRecord(parsed, record);
  return parsed;
}

function appendMattermostRecord(parsed: MattermostExport, record: unknown) {
  if (!record || typeof record !== "object") return;
  const item = record as Record<string, unknown>;
  if (Array.isArray(item.teams)) parsed.teams.push(...(item.teams as MattermostTeam[]));
  if (Array.isArray(item.users)) parsed.users.push(...(item.users as MattermostUser[]));
  if (Array.isArray(item.channels)) parsed.channels.push(...(item.channels as MattermostChannel[]));
  if (Array.isArray(item.direct_channels)) parsed.directChannels.push(...(item.direct_channels as MattermostDirectChannel[]));
  if (Array.isArray(item.posts)) parsed.posts.push(...(item.posts as MattermostPost[]));
  if (Array.isArray(item.direct_posts)) parsed.posts.push(...(item.direct_posts as MattermostPost[]));
  if (item.type === "team" && item.team) parsed.teams.push(item.team as MattermostTeam);
  if (item.type === "user" && item.user) parsed.users.push(item.user as MattermostUser);
  if (item.type === "channel" && item.channel) parsed.channels.push(item.channel as MattermostChannel);
  if (item.type === "direct_channel" && item.direct_channel) {
    parsed.directChannels.push(item.direct_channel as MattermostDirectChannel);
  }
  if (item.type === "post" && item.post) parsed.posts.push(item.post as MattermostPost);
  if (item.type === "direct_post" && item.direct_post) parsed.posts.push(item.direct_post as MattermostPost);
  if (item.type === "channel_member" && item.channel_member) {
    parsed.channelMembers.push(item.channel_member as { channel: string; user: string; roles?: string });
  }
}

async function importActor(workspace: Workspace) {
  const [member] = await db
    .select({ user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.role, "owner")))
    .limit(1);
  if (member) return member.user;
  const [fallback] = await db.select().from(users).where(eq(users.id, workspace.createdByUserId)).limit(1);
  if (!fallback) throw new Error("Workspace creator not found");
  return fallback;
}

async function upsertUsers(workspace: Workspace, mattermostUsers: MattermostUser[], summary: MattermostImportSummary) {
  const result = new Map<string, User>();
  for (const source of mattermostUsers) {
    const email = source.email ? normalizeEmail(source.email) : "";
    const username = source.username?.trim();
    if (!email || !username) continue;

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user =
      existing ??
      (
        await db
          .insert(users)
          .values({
            email,
            emailVerifiedAt: new Date(),
            displayName: mattermostDisplayName(source),
            handle: username,
            title: source.position ?? null,
            timezone: source.timezone?.manualTimezone || source.timezone?.automaticTimezone || "UTC"
          })
          .returning()
      )[0];

    existing ? (summary.usersMatched += 1) : (summary.usersCreated += 1);
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "member",
        status: "active",
        joinedAt: dateFromMs(source.create_at) ?? new Date()
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { status: "active", removedAt: null }
      });
    result.set(username, user);
  }
  return result;
}

async function upsertConversations(
  workspace: Workspace,
  importer: User,
  parsed: MattermostExport,
  usersByName: Map<string, User>,
  summary: MattermostImportSummary
) {
  const result = await upsertChannels(workspace, importer, parsed, usersByName, summary);
  const directConversations = await upsertDirectConversations(workspace, importer, parsed, usersByName, summary);
  for (const [channelName, conversation] of directConversations) {
    result.set(channelName, conversation);
  }
  return result;
}

async function upsertChannels(
  workspace: Workspace,
  importer: User,
  parsed: MattermostExport,
  usersByName: Map<string, User>,
  summary: MattermostImportSummary
) {
  const result = new Map<string, Conversation>();
  const channelNames = uniqueChannelNames(parsed.channels.filter((channel) => !isMattermostDirectChannel(channel)));
  for (const channelName of channelNames) {
    const source = parsed.channels.find((channel) => mattermostChannelName(channel.name) === channelName);
    const [existing] = await db
      .select({ channel: channels, conversation: conversations })
      .from(channels)
      .innerJoin(conversations, eq(conversations.channelId, channels.id))
      .where(and(eq(channels.workspaceId, workspace.id), eq(channels.name, channelName)))
      .limit(1);

    let conversation = existing?.conversation;
    if (!conversation) {
      const [channel] = await db
        .insert(channels)
        .values({
          workspaceId: workspace.id,
          name: channelName,
          description: source?.purpose ?? source?.display_name ?? null,
          topic: source?.header ?? null,
          visibility: source?.type === "P" ? "private" : "public",
          createdByUserId: importer.id
        })
        .returning();
      [conversation] = await db
        .insert(conversations)
        .values({ workspaceId: workspace.id, type: "channel", channelId: channel.id, createdByUserId: importer.id })
        .returning();
      summary.channelsCreated += 1;
    } else {
      summary.channelsMatched += 1;
    }
    result.set(channelName, conversation);

    const memberUserIds = channelMemberUserIds(channelName, source, parsed, usersByName);
    if (memberUserIds.length > 0) {
      await db
        .insert(conversationMembers)
        .values(
          memberUserIds.map((userId) => ({
            workspaceId: workspace.id,
            conversationId: conversation.id,
            userId,
            joinedAt: new Date()
          }))
        )
        .onConflictDoNothing();
      summary.membershipsCreated += memberUserIds.length;
    }
  }
  return result;
}

async function upsertDirectConversations(
  workspace: Workspace,
  importer: User,
  parsed: MattermostExport,
  usersByName: Map<string, User>,
  summary: MattermostImportSummary
) {
  const result = new Map<string, Conversation>();
  for (const memberNames of uniqueDirectConversationMemberSets(parsed)) {
    const target = mattermostConversationTarget(memberNames, parsed, usersByName);
    if (!target || target.userIds.length < 2) continue;

    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.workspaceId, workspace.id), eq(conversations.memberKey, target.key)))
      .limit(1);

    let conversation = existing;
    if (!conversation) {
      [conversation] = await db
        .insert(conversations)
        .values({
          workspaceId: workspace.id,
          type: target.type,
          memberKey: target.key,
          createdByUserId: importer.id
        })
        .returning();
      if (target.type === "dm") summary.directConversationsCreated += 1;
      else summary.groupConversationsCreated += 1;
    } else if (target.type === "dm") {
      summary.directConversationsMatched += 1;
    } else {
      summary.groupConversationsMatched += 1;
    }

    await db
      .insert(conversationMembers)
      .values(
        target.userIds.map((userId) => ({
          workspaceId: workspace.id,
          conversationId: conversation.id,
          userId,
          joinedAt: new Date()
        }))
      )
      .onConflictDoUpdate({
        target: [conversationMembers.conversationId, conversationMembers.userId],
        set: { leftAt: null, hiddenAt: null, joinedAt: new Date() }
      });
    summary.membershipsCreated += target.userIds.length;

    result.set(target.key, conversation);
  }
  return result;
}

function uniqueChannelNames(channelsToImport: MattermostChannel[]) {
  return Array.from(new Set(channelsToImport.map((channel) => mattermostChannelName(channel.name)).filter(Boolean)));
}

function isMattermostDirectChannel(channel: MattermostChannel) {
  return channel.type === "D" || channel.type === "G";
}

function previewDirectConversationTargets(parsed: MattermostExport, userIdsByMattermostName: Map<string, string>) {
  return uniqueDirectConversationMemberSets(parsed).flatMap((names) => {
    const userIds = names.flatMap((name) => userIdsByMattermostName.get(name) ?? []);
    if (userIds.length < 2) return [];
    return [{ key: mattermostConversationMemberKey(userIds), type: mattermostConversationType(userIds.length) }];
  });
}

function mattermostConversationTarget(
  memberNames: string[],
  parsed: MattermostExport,
  usersByName: Map<string, User>
): MattermostConversationTarget | null {
  const userIds = Array.from(new Set(memberNames.flatMap((name) => usersByName.get(name)?.id ?? [])));
  if (userIds.length < 2) return null;
  return {
    key: mattermostConversationMemberKey(userIds),
    type: mattermostConversationType(userIds.length),
    userIds
  };
}

function uniqueDirectConversationMemberSets(parsed: MattermostExport) {
  const byKey = new Map<string, string[]>();
  for (const channel of parsed.channels.filter(isMattermostDirectChannel)) {
    const names = mattermostConversationMemberNames(channel.name ?? "", channel, parsed);
    if (names.length >= 2) byKey.set(mattermostConversationMemberKey(names), names);
  }
  for (const channel of parsed.directChannels) {
    const names = mattermostDirectChannelMemberNames(channel);
    if (names.length >= 2) byKey.set(mattermostConversationMemberKey(names), names);
  }
  for (const post of parsed.posts) {
    const names = post.channel_members ?? [];
    if (names.length >= 2) byKey.set(mattermostConversationMemberKey(names), names);
  }
  return Array.from(byKey.values());
}

function mattermostDirectChannelMemberNames(channel: MattermostDirectChannel) {
  return Array.from(
    new Set(
      (channel.participants ?? []).flatMap((participant) =>
        typeof participant === "string" ? [participant] : participant.username ? [participant.username] : []
      )
    )
  );
}

function channelMemberUserIds(
  channelName: string,
  channel: MattermostChannel | undefined,
  parsed: MattermostExport,
  usersByName: Map<string, User>
) {
  return mattermostConversationMemberNames(channelName, channel, parsed).flatMap((name) => usersByName.get(name)?.id ?? []);
}

function mattermostConversationMemberNames(
  channelName: string,
  channel: MattermostChannel | undefined,
  parsed: MattermostExport
) {
  const names = new Set<string>();
  const sourceChannelName = channel?.name;
  for (const member of channel?.members ?? []) {
    if (typeof member === "string") names.add(member);
    else if (member.username) names.add(member.username);
  }
  for (const member of parsed.channelMembers) {
    if (member.channel === sourceChannelName || mattermostChannelName(member.channel) === channelName) {
      names.add(member.user);
    }
  }
  for (const post of parsed.posts) {
    if ((post.channel === sourceChannelName || mattermostChannelName(post.channel) === channelName) && post.user) {
      names.add(post.user);
    }
  }
  return Array.from(names);
}

async function upsertMessages(
  workspace: Workspace,
  parsed: MattermostExport,
  usersByName: Map<string, User>,
  conversationsByChannel: Map<string, Conversation>,
  attachmentsDir: string | undefined,
  summary: MattermostImportSummary
) {
  const parentIds = new Map<string, string>();
  const orderedPosts = [...parsed.posts].sort((left, right) => (left.create_at ?? 0) - (right.create_at ?? 0));
  for (const post of orderedPosts) {
    const postKey = mattermostPostKey(post);
    const sender = usersByName.get(post.user ?? post.username ?? "");
    const conversation = conversationsByChannel.get(mattermostPostConversationKey(post, parsed, usersByName));
    if (!postKey) {
      skipMessage(summary, post, "missing_id");
      continue;
    }
    if (!sender) {
      skipMessage(summary, post, "missing_user");
      continue;
    }
    if (!conversation) {
      skipMessage(summary, post, "missing_channel");
      continue;
    }

    const rootId = post.root_id || post.original_id;
    const [message] = await db
      .insert(messages)
      .values({
        workspaceId: workspace.id,
        conversationId: conversation.id,
        senderId: sender.id,
        parentMessageId: rootId ? parentIds.get(rootId) ?? null : null,
        clientMessageId: `mattermost:${postKey}`,
        bodyText: post.message ?? "",
        metadata: { mattermostPostId: post.id ?? post.post_id ?? null, mattermostPostKey: postKey },
        editedAt: dateFromMs(post.edit_at),
        deletedAt: dateFromMs(post.delete_at),
        createdAt: dateFromMs(post.create_at) ?? new Date()
      })
      .onConflictDoNothing()
      .returning();

    if (!message) {
      skipMessage(summary, post, "already_imported");
      const [existing] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.senderId, sender.id), eq(messages.clientMessageId, `mattermost:${postKey}`)))
        .limit(1);
      if (existing) {
        parentIds.set(postKey, existing.id);
        // A prior run may have imported this message before --attachments-dir was
        // available (or before the files existed on disk); back-fill them now.
        await backfillFiles(workspace.id, conversation.id, existing.id, sender.id, post, attachmentsDir, summary);
      }
      continue;
    }

    parentIds.set(postKey, message.id);
    summary.messagesCreated += 1;
    await importReactions(workspace.id, message.id, post, usersByName, summary);
    await importFiles(workspace.id, conversation.id, message.id, sender.id, post, attachmentsDir, summary);
    await db
      .update(conversations)
      .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
  }
}

function mattermostPostConversationKey(
  post: MattermostPost,
  parsed: MattermostExport,
  usersByName: Map<string, User>
) {
  if (post.channel_members && post.channel_members.length >= 2) {
    const userIds = post.channel_members.flatMap((name) => usersByName.get(name)?.id ?? []);
    return userIds.length >= 2 ? mattermostConversationMemberKey(userIds) : "";
  }
  const source = parsed.channels.find((channel) => channel.name === post.channel);
  if (source && isMattermostDirectChannel(source)) {
    return mattermostConversationTarget(mattermostConversationMemberNames(source.name ?? "", source, parsed), parsed, usersByName)?.key ?? post.channel ?? "";
  }
  return mattermostChannelName(post.channel);
}

function skipMessage(summary: MattermostImportSummary, post: MattermostPost, reason: string) {
  summary.messagesSkipped += 1;
  if (reason === "already_imported") return;
  summary.messagesSkippedDetails.push({
    postId: mattermostPostKey(post),
    reason,
    channel: post.channel ?? null,
    user: post.user ?? post.username ?? null
  });
}

async function importReactions(
  workspaceId: string,
  messageId: string,
  post: MattermostPost,
  usersByName: Map<string, User>,
  summary: MattermostImportSummary
) {
  for (const reaction of post.reactions ?? []) {
    const user = usersByName.get(reaction.user ?? reaction.username ?? "");
    const emoji = mattermostReactionEmoji(reaction.emoji_name);
    if (!user || !emoji) {
      skipReaction(summary, reaction.emoji_name);
      continue;
    }
    const [inserted] = await db
      .insert(messageReactions)
      .values({
        workspaceId,
        messageId,
        userId: user.id,
        emoji,
        createdAt: dateFromMs(reaction.create_at) ?? new Date()
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) summary.reactionsCreated += 1;
  }
}

function skipReaction(summary: MattermostImportSummary, emojiName: string | undefined) {
  summary.reactionsSkipped += 1;
  const key = emojiName?.trim() || "unknown";
  summary.ignoredReactionEmoji[key] = (summary.ignoredReactionEmoji[key] ?? 0) + 1;
}

/** Import files for an already-existing message, but only if it has none yet — keeps reruns idempotent. */
async function backfillFiles(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  uploaderId: string,
  post: MattermostPost,
  attachmentsDir: string | undefined,
  summary: MattermostImportSummary
) {
  if (!attachmentsDir || mattermostFileRefs(post).length === 0) return;
  const [existing] = await db.select({ id: files.id }).from(files).where(eq(files.messageId, messageId)).limit(1);
  if (existing) return;
  await importFiles(workspaceId, conversationId, messageId, uploaderId, post, attachmentsDir, summary);
}

async function importFiles(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  uploaderId: string,
  post: MattermostPost,
  attachmentsDir: string | undefined,
  summary: MattermostImportSummary
) {
  if (!attachmentsDir) return;
  for (const fileRef of mattermostFileRefs(post)) {
    const diskPath = await resolveAttachmentPath(attachmentsDir, fileRef);
    if (!diskPath) {
      summary.missingFilesCount += 1;
      continue;
    }
    const data = await readFile(diskPath);
    const name = fileRef.name || path.basename(diskPath);
    const storageKey = buildStorageKey(workspaceId, name);
    await putObject(storageKey, data, { contentType: fileRef.mime_type ?? mimeTypeFromName(name), expiresAt: fileExpiresAt() });
    await db.insert(files).values({
      workspaceId,
      uploaderId,
      conversationId,
      messageId,
      name,
      mimeType: fileRef.mime_type ?? mimeTypeFromName(name),
      size: data.byteLength,
      storageKey,
      expiresAt: fileExpiresAt()
    });
    summary.filesCreated += 1;
  }
}

async function previewFiles(posts: MattermostPost[], attachmentsDir: string | undefined, summary: MattermostImportSummary) {
  const filesPreview = await previewMattermostFiles(posts, attachmentsDir);
  summary.filesCreated = filesPreview.filesFound;
  summary.missingFilesCount += filesPreview.missingFilesCount;
}

export async function previewMattermostFiles(posts: MattermostPost[], attachmentsDir: string | undefined) {
  const preview = { filesFound: 0, missingFilesCount: 0 };
  if (!attachmentsDir) return preview;
  for (const post of posts) {
    for (const fileRef of mattermostFileRefs(post)) {
      const diskPath = await resolveAttachmentPath(attachmentsDir, fileRef);
      if (diskPath) preview.filesFound += 1;
      else preview.missingFilesCount += 1;
    }
  }
  return preview;
}

function mattermostFileRefs(post: MattermostPost): MattermostFile[] {
  return [
    ...(post.attachments ?? []),
    ...(post.files ?? []),
    ...(post.file_ids ?? []).map((id) => ({ id }))
  ];
}

async function resolveAttachmentPath(root: string, fileRef: MattermostFile) {
  const candidates = [fileRef.path, fileRef.id].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const resolved = path.resolve(root, candidate);
    if (!resolved.startsWith(path.resolve(root))) continue;
    try {
      const info = await stat(resolved);
      if (info.isFile()) return resolved;
    } catch {
      // Try the next Mattermost file reference.
    }
  }
  return null;
}

function dateFromMs(value: number | undefined) {
  return value && value > 0 ? new Date(value) : null;
}

function mimeTypeFromName(name: string) {
  const extension = path.extname(name).toLowerCase();
  return (
    {
      ".gif": "image/gif",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".txt": "text/plain",
      ".webp": "image/webp"
    }[extension] ?? "application/octet-stream"
  );
}
