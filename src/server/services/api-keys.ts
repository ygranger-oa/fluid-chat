import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, users, workspaceMembers } from "@/db/schema";
import type { ApiKey, User } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { assertCanGrantScopes, newApiToken } from "@/lib/api-auth";
import { normalizeScopes } from "@/lib/api-scopes";
import { addDays } from "@/lib/security";
import { avatarColorFor } from "./serializers";

export const DEFAULT_RATE_LIMIT = 120;
export const MAX_RATE_LIMIT = 6_000;
export const DEFAULT_MESSAGE_LIMIT = 60;
export const MAX_KEYS_PER_WORKSPACE = 50;

export type CreateApiKeyInput = {
  workspaceId: string;
  name: string;
  scopes: string[];
  /** `bot` gives the key its own identity in the member list; `self` acts as the admin. */
  identity: "bot" | "self";
  botRole: "member" | "admin";
  rateLimitPerMinute: number;
  messageLimitPerMinute: number;
  expiresInDays: number | null;
  creator: User;
};

export function serializeApiKey(key: ApiKey, actor?: Pick<User, "id" | "displayName" | "handle" | "avatarUrl" | "avatarColor" | "isBot"> | null) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    workspaceId: key.workspaceId,
    actor: actor
      ? { id: actor.id, displayName: actor.displayName, handle: actor.handle, avatarUrl: actor.avatarUrl, avatarColor: actor.avatarColor, isBot: actor.isBot }
      : { id: key.actorUserId, displayName: "Unknown", handle: null, avatarUrl: null, avatarColor: null, isBot: key.actorIsBot },
    rateLimitPerMinute: key.rateLimitPerMinute,
    messageLimitPerMinute: key.messageLimitPerMinute,
    requestCount: key.requestCount,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: key.lastUsedIp,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdByUserId: key.createdByUserId,
    createdAt: key.createdAt.toISOString()
  };
}

export async function listApiKeys(workspaceId: string, options?: { includeRevoked?: boolean }) {
  const rows = await db
    .select({ key: apiKeys, actor: users })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.actorUserId))
    .where(eq(apiKeys.workspaceId, workspaceId))
    .orderBy(desc(apiKeys.createdAt));

  return rows
    .filter((row) => options?.includeRevoked || !row.key.revokedAt)
    .map((row) => serializeApiKey(row.key, row.actor));
}

export async function loadApiKey(keyId: string) {
  const [row] = await db
    .select({ key: apiKeys, actor: users })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.actorUserId))
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  if (!row) throw new HttpError(404, "API key not found", "not_found");
  return row;
}

/**
 * Creating a key is the one moment the secret exists in plaintext; callers get it
 * back once and we keep only a hash.
 */
export async function createApiKey(input: CreateApiKeyInput) {
  const scopes = parseScopes(input.scopes);
  assertCanGrantScopes(scopes);
  const name = input.name.trim();

  const live = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, input.workspaceId), isNull(apiKeys.revokedAt)));
  if (live.length >= MAX_KEYS_PER_WORKSPACE) {
    throw new HttpError(409, `A workspace may hold ${MAX_KEYS_PER_WORKSPACE} active API keys`, "api_key_limit");
  }

  const { token, prefix, hash } = newApiToken();

  const created = await db.transaction(async (tx) => {
    let actorUserId = input.creator.id;

    if (input.identity === "bot") {
      await assertBotDisplayNameAvailable(tx, input.workspaceId, name);
      const handle = slugForBot(name);
      await assertBotHandleAvailable(tx, handle);
      const [bot] = await tx
        .insert(users)
        .values({
          email: `${handle}@bots.fluidchat.invalid`,
          displayName: name,
          handle,
          isBot: true,
          presence: "active",
          timezone: "UTC"
        })
        .returning();
      await tx.update(users).set({ avatarColor: avatarColorFor(bot.id) }).where(eq(users.id, bot.id));
      await tx.insert(workspaceMembers).values({
        workspaceId: input.workspaceId,
        userId: bot.id,
        role: input.botRole,
        status: "active"
      });
      actorUserId = bot.id;
    }

    const [key] = await tx
      .insert(apiKeys)
      .values({
        workspaceId: input.workspaceId,
        name,
        prefix,
        tokenHash: hash,
        actorUserId,
        actorIsBot: input.identity === "bot",
        createdByUserId: input.creator.id,
        scopes,
        rateLimitPerMinute: input.rateLimitPerMinute,
        messageLimitPerMinute: input.messageLimitPerMinute,
        expiresAt: input.expiresInDays ? addDays(input.expiresInDays) : null
      })
      .returning();
    return key;
  });

  const [actor] = await db.select().from(users).where(eq(users.id, created.actorUserId)).limit(1);
  return { key: created, token, serialized: serializeApiKey(created, actor) };
}

export async function updateApiKey(
  keyId: string,
  input: {
    name?: string;
    scopes?: string[];
    rateLimitPerMinute?: number;
    messageLimitPerMinute?: number;
    expiresInDays?: number | null;
    actorDisplayName?: string;
    actorAvatarUrl?: string | null;
  }
) {
  const scopes = input.scopes ? parseScopes(input.scopes) : undefined;
  if (scopes) assertCanGrantScopes(scopes);
  const actorDisplayName = input.actorDisplayName?.trim();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (!current) throw new HttpError(404, "API key not found or already revoked", "not_found");

    if ((input.actorDisplayName !== undefined || input.actorAvatarUrl !== undefined) && !current.actorIsBot) {
      throw new HttpError(400, "Only bot API keys can edit actor branding", "actor_not_bot");
    }
    if (actorDisplayName !== undefined) {
      await assertBotDisplayNameAvailable(tx, current.workspaceId, actorDisplayName, current.actorUserId);
    }

    const [updated] = await tx
      .update(apiKeys)
      .set({
        name: input.name,
        scopes,
        rateLimitPerMinute: input.rateLimitPerMinute,
        messageLimitPerMinute: input.messageLimitPerMinute,
        expiresAt: input.expiresInDays === undefined ? undefined : input.expiresInDays ? addDays(input.expiresInDays) : null,
        updatedAt: new Date()
      })
      .where(eq(apiKeys.id, current.id))
      .returning();

    if (input.actorDisplayName !== undefined || input.actorAvatarUrl !== undefined) {
      await tx
        .update(users)
        .set({
          displayName: actorDisplayName,
          avatarUrl: input.actorAvatarUrl,
          updatedAt: new Date()
        })
        .where(eq(users.id, current.actorUserId));
    }

    return updated;
  });
}

/** Rotation keeps the key's identity and scopes, and invalidates the old secret. */
export async function rotateApiKey(keyId: string) {
  const { token, prefix, hash } = newApiToken();
  const [updated] = await db
    .update(apiKeys)
    .set({ tokenHash: hash, prefix, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning();
  if (!updated) throw new HttpError(404, "API key not found or already revoked", "not_found");
  return { key: updated, token };
}

export async function revokeApiKey(keyId: string, revokedByUserId: string) {
  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), revokedByUserId, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning();
  if (!revoked) throw new HttpError(404, "API key not found or already revoked", "not_found");

  // A bot identity exists only to carry keys: once the last one is gone, retire
  // the member so it stops appearing in the directory.
  if (revoked.actorIsBot) {
    const [remaining] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.actorUserId, revoked.actorUserId), isNull(apiKeys.revokedAt), ne(apiKeys.id, keyId)))
      .limit(1);
    if (!remaining) {
      await db
        .update(workspaceMembers)
        .set({ status: "removed", removedAt: new Date() })
        .where(and(
          eq(workspaceMembers.workspaceId, revoked.workspaceId),
          eq(workspaceMembers.userId, revoked.actorUserId)
        ));
    }
  }

  return revoked;
}

function parseScopes(requested: string[]) {
  try {
    const scopes = normalizeScopes(requested);
    if (scopes.length === 0) throw new Error("Grant at least one scope");
    return scopes;
  } catch (error) {
    throw new HttpError(400, (error as Error).message, "invalid_scope");
  }
}

function slugForBot(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "api";
}

async function assertBotDisplayNameAvailable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workspaceId: string,
  displayName: string,
  exceptUserId?: string
) {
  const [existing] = await tx
    .select({ id: users.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
        eq(users.isBot, true),
        sql`lower(trim(${users.displayName})) = lower(trim(${displayName}))`,
        exceptUserId ? ne(users.id, exceptUserId) : undefined
      )
    )
    .limit(1);

  if (existing) throw new HttpError(409, "Display name already used", "bot_display_name_taken");
}

async function assertBotHandleAvailable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  handle: string
) {
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (existing) throw new HttpError(409, "Bot identifier already used", "bot_handle_taken");
}
