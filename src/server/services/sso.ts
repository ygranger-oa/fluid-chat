import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  channels,
  conversationMembers,
  conversations,
  ssoAccounts,
  ssoStates,
  users,
  workspaceMembers,
  workspaces
} from "@/db/schema";
import { enforceSeatLimit } from "@/lib/billing";
import { HttpError } from "@/lib/http";
import { addHours, normalizeEmail, slugify, tokenHash } from "@/lib/security";
import { avatarColorFor } from "./serializers";

const PROVIDER = "authentik";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

type UserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
};

export function ssoConfigured() {
  return !!(process.env.AUTHENTIK_ISSUER && process.env.AUTHENTIK_CLIENT_ID && process.env.AUTHENTIK_CLIENT_SECRET);
}

export function ssoCallbackUrl() {
  return `${appUrl()}/api/auth/sso/callback`;
}

export async function ssoLoginUrl(workspaceId: string | undefined, redirectTo?: string) {
  if (!ssoConfigured()) throw new HttpError(503, "SSO is not configured", "sso_not_configured");
  const workspace = workspaceId ? await enabledSsoWorkspace(workspaceId) : await publicLoginSsoWorkspace();
  if (!workspace) throw new HttpError(404, "SSO is not enabled for this workspace", "sso_workspace_disabled");

  const discovery = await oidcDiscovery();
  const state = randomToken();
  const codeVerifier = randomToken(64);
  await db.insert(ssoStates).values({
    stateHash: tokenHash(state),
    codeVerifier,
    workspaceId: workspace.id,
    redirectTo: safeRedirectPath(redirectTo),
    expiresAt: addHours(1)
  });

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", process.env.AUTHENTIK_CLIENT_ID!);
  url.searchParams.set("redirect_uri", ssoCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", process.env.AUTHENTIK_SCOPES ?? "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", base64Url(createHash("sha256").update(codeVerifier).digest()));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function publicSsoAvailable() {
  if (!ssoConfigured()) return false;
  return !!(await publicLoginSsoWorkspace());
}

export async function completeSsoLogin(input: {
  code: string;
  state: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  if (!ssoConfigured()) throw new HttpError(503, "SSO is not configured", "sso_not_configured");
  const [stateRecord] = await db
    .select()
    .from(ssoStates)
    .where(and(eq(ssoStates.stateHash, tokenHash(input.state)), isNull(ssoStates.usedAt)))
    .limit(1);
  if (!stateRecord || stateRecord.expiresAt < new Date()) {
    throw new HttpError(400, "SSO state is invalid or expired", "invalid_sso_state");
  }

  const discovery = await oidcDiscovery();
  const tokenResponse = await exchangeCode(discovery, input.code, stateRecord.codeVerifier);
  const profile = await fetchUserInfo(discovery.userinfo_endpoint, tokenResponse.access_token);
  if (!profile.sub || !profile.email) throw new HttpError(400, "SSO profile is missing an email", "invalid_sso_profile");

  const email = normalizeEmail(profile.email);
  const displayName = (profile.name || profile.preferred_username || email.split("@")[0] || "Member").trim().slice(0, 120);
  const user = await db.transaction(async (tx) => {
    await tx.update(ssoStates).set({ usedAt: new Date() }).where(eq(ssoStates.id, stateRecord.id));

    const [linked] = await tx
      .select({ user: users })
      .from(ssoAccounts)
      .innerJoin(users, eq(users.id, ssoAccounts.userId))
      .where(and(eq(ssoAccounts.provider, PROVIDER), eq(ssoAccounts.issuer, discovery.issuer), eq(ssoAccounts.subject, profile.sub!)))
      .limit(1);

    let current = linked?.user;
    if (!current) {
      const [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      current = existing;
    }
    if (!current) {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          emailVerifiedAt: profile.email_verified === false ? null : new Date(),
          displayName,
          handle: await uniqueHandle(displayName),
          avatarUrl: profile.picture?.slice(0, 500) ?? null,
          presence: "active",
          lastActiveAt: new Date(),
          preferences: { theme: "system", language: "system", enterToSend: true, timeFormat: "12h", notificationSound: true }
        })
        .returning();
      await tx.update(users).set({ avatarColor: avatarColorFor(created.id) }).where(eq(users.id, created.id));
      current = { ...created, avatarColor: avatarColorFor(created.id) };
    }

    await tx
      .insert(ssoAccounts)
      .values({ provider: PROVIDER, issuer: discovery.issuer, subject: profile.sub!, userId: current.id, email, lastLoginAt: new Date() })
      .onConflictDoUpdate({
        target: [ssoAccounts.provider, ssoAccounts.issuer, ssoAccounts.subject],
        set: { email, lastLoginAt: new Date() }
      });

    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, stateRecord.workspaceId), eq(workspaces.ssoEnabled, true), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!workspace) throw new HttpError(404, "SSO is not enabled for this workspace", "sso_workspace_disabled");

    const [membership] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, current.id)))
      .limit(1);

    if (membership?.status !== "active") await enforceSeatLimit(workspace.id, 1);

    if (membership) {
      await tx
        .update(workspaceMembers)
        .set({ status: "active", removedAt: null, joinedAt: new Date() })
        .where(eq(workspaceMembers.id, membership.id));
    } else {
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId: current.id, role: workspace.ssoAutoJoinRole });
    }

    const autoJoin = await tx
      .select({ conversation: conversations })
      .from(channels)
      .innerJoin(conversations, eq(conversations.channelId, channels.id))
      .where(
        and(
          eq(channels.workspaceId, workspace.id),
          eq(channels.autoJoin, true),
          eq(channels.visibility, "public"),
          isNull(channels.archivedAt)
        )
      );
    if (autoJoin.length > 0) {
      await tx
        .insert(conversationMembers)
        .values(
          autoJoin.map(({ conversation }) => ({
            workspaceId: workspace.id,
            conversationId: conversation.id,
            userId: current.id,
            lastReadAt: new Date()
          }))
        )
        .onConflictDoNothing();
    }
    if (!membership) {
      await tx.insert(auditEvents).values({
        workspaceId: workspace.id,
        actorUserId: current.id,
        type: "sso.member_joined",
        entityType: "workspace_member",
        metadata: { provider: PROVIDER }
      });
    }

    return current;
  });

  return { user, workspaceId: stateRecord.workspaceId, redirectTo: stateRecord.redirectTo };
}

async function oidcDiscovery(): Promise<Discovery> {
  const issuer = process.env.AUTHENTIK_ISSUER?.replace(/\/$/, "");
  if (!issuer) throw new HttpError(503, "SSO issuer is not configured", "sso_not_configured");
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) throw new HttpError(502, "SSO provider discovery failed", "sso_discovery_failed");
  const discovery = (await response.json()) as Discovery;
  if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.userinfo_endpoint) {
    throw new HttpError(502, "SSO provider discovery is incomplete", "sso_discovery_failed");
  }
  return discovery;
}

async function exchangeCode(discovery: Discovery, code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: ssoCallbackUrl(),
    client_id: process.env.AUTHENTIK_CLIENT_ID!,
    client_secret: process.env.AUTHENTIK_CLIENT_SECRET!,
    code_verifier: codeVerifier
  });
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new HttpError(502, "SSO token exchange failed", "sso_token_failed");
  return { access_token: payload.access_token };
}

async function fetchUserInfo(endpoint: string, accessToken: string): Promise<UserInfo> {
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new HttpError(502, "SSO profile fetch failed", "sso_profile_failed");
  return (await response.json()) as UserInfo;
}

async function uniqueHandle(base: string) {
  const root = slugify(base).replace(/-/g, ".").slice(0, 30) || "member";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}${attempt + 1}`;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${root}.${Date.now().toString(36)}`;
}

function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function randomToken(bytes = 32) {
  return base64Url(randomBytes(bytes));
}

function base64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeRedirectPath(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.slice(0, 500);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function enabledSsoWorkspace(workspaceId: string) {
  if (!isUuid(workspaceId)) throw new HttpError(400, "Invalid workspaceId", "invalid_workspace");
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ssoEnabled, true), isNull(workspaces.deletedAt)))
    .limit(1);
  return workspace ?? null;
}

async function publicLoginSsoWorkspace() {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.ssoEnabled, true), eq(workspaces.ssoShowOnLogin, true), isNull(workspaces.deletedAt)))
    .orderBy(workspaces.name)
    .limit(1);
  return workspace ?? null;
}
