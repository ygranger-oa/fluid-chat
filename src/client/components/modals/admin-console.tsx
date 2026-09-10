"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Lock, RefreshCw, Trash2 } from "lucide-react";
import type { ChannelSummary, CustomEmojiDto, PublicUser } from "@/shared/types";
import { api } from "../../api";
import type { ApiKeyDto } from "../../api";
import { formatRelative } from "../../format";
import { useI18n } from "../../i18n";
import { useApp } from "../../store";
import { Avatar, Modal, Spinner } from "../ui/primitives";

type Tab = "overview" | "members" | "invitations" | "channels" | "emoji" | "api" | "settings" | "audit" | "export";

type MemberRow = { memberId: string; role: string; status: string; user: PublicUser };
type InviteRow = {
  id: string;
  email: string | null;
  role: string;
  inviteType: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  useCount: number;
  maxUses: number | null;
};

export function AdminConsole({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const workspaceId = state.workspaceId;
  const isOwner = state.bootstrap?.role === "owner";

  return (
    <Modal title={t("admin.settingsTitle", { workspace: state.bootstrap?.workspace.name ?? t("app.workspaceFallback") })} onClose={onClose} width={860}>
      <div className="panel-tabs wrap" role="tablist">
        {(
          [
            ["overview", t("admin.overview")],
            ["members", t("admin.members")],
            ["invitations", t("admin.invitations")],
            ["channels", t("admin.channels")],
            ["emoji", t("admin.emoji")],
            ["api", t("admin.apiKeys")],
            ["settings", t("admin.settings")],
            ["audit", t("admin.auditLog")],
            ["export", t("admin.export")]
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {!workspaceId ? null : (
        <div className="admin-body">
          {tab === "overview" ? <Overview workspaceId={workspaceId} /> : null}
          {tab === "members" ? <Members workspaceId={workspaceId} isOwner={isOwner} /> : null}
          {tab === "invitations" ? <Invitations workspaceId={workspaceId} /> : null}
          {tab === "channels" ? <Channels workspaceId={workspaceId} /> : null}
          {tab === "emoji" ? <Emoji workspaceId={workspaceId} /> : null}
          {tab === "api" ? <ApiKeys workspaceId={workspaceId} /> : null}
          {tab === "settings" ? <Settings workspaceId={workspaceId} isOwner={isOwner} /> : null}
          {tab === "audit" ? <AuditLog workspaceId={workspaceId} /> : null}
          {tab === "export" ? <Exports workspaceId={workspaceId} isOwner={isOwner} /> : null}
          <p className="admin-note">
            {t("admin.signedInAs", { email: state.session?.email ?? "", role: state.bootstrap?.role ?? "" })}
          </p>
        </div>
      )}
    </Modal>
  );
}

function Overview({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const [usage, setUsage] = useState<{ activeMembers: number; pendingInvites: number; fileCount: number } | null>(null);
  const { state } = useApp();

  useEffect(() => {
    api.workspaces
      .usage(workspaceId)
      .then(({ usage: value }) => setUsage(value))
      .catch(() => setUsage(null));
  }, [workspaceId]);

  const workspace = state.bootstrap?.workspace;

  return (
    <div className="admin-grid">
      <div className="stat-card">
        <span>{t("admin.members")}</span>
        <strong>{usage?.activeMembers ?? "—"}</strong>
        <small>{t("admin.seats", { count: workspace?.seatLimit ?? 0 })}</small>
      </div>
      <div className="stat-card">
        <span>{t("admin.pendingInvites")}</span>
        <strong>{usage?.pendingInvites ?? "—"}</strong>
      </div>
      <div className="stat-card">
        <span>{t("common.files")}</span>
        <strong>{usage?.fileCount ?? "—"}</strong>
      </div>
      <div className="stat-card">
        <span>{t("admin.plan")}</span>
        <strong className="capitalize">{workspace?.plan ?? "free"}</strong>
        <small className="capitalize">{workspace?.subscriptionStatus}</small>
      </div>
    </div>
  );
}

function Members({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [members, setMembers] = useState<MemberRow[] | null>(null);

  const load = useCallback(() => {
    api.workspaces
      .members(workspaceId, true)
      .then(({ members: list }) => setMembers(list as MemberRow[]))
      .catch(() => setMembers([]));
  }, [workspaceId]);

  useEffect(load, [load]);

  if (!members) return <Spinner label={t("admin.loadingMembers")} />;

  return (
    <div className="admin-list">
      {members.map((member) => (
        <div key={member.memberId} className="admin-row">
          <div className="admin-row-main">
            <Avatar user={member.user} size={32} />
            <span>
              <strong>{member.user.displayName}</strong>
              <small>
                {member.user.email} · {member.status}
              </small>
            </span>
          </div>
          <div className="admin-row-actions">
            {isOwner ? (
              <select
                value={member.role}
                onChange={async (event) => {
                  try {
                    await api.workspaces.updateMember(workspaceId, member.memberId, { role: event.target.value });
                    load();
                    await actions.refreshBootstrap();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                <option value="owner">{t("admin.owner")}</option>
                <option value="admin">{t("admin.admin")}</option>
                <option value="member">{t("admin.member")}</option>
                <option value="guest">{t("admin.guest")}</option>
              </select>
            ) : (
              <span className="pill capitalize">{member.role}</span>
            )}
            {member.status === "active" ? (
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  if (!window.confirm(t("admin.removeConfirm", { name: member.user.displayName }))) return;
                  try {
                    await api.workspaces.removeMember(workspaceId, member.memberId);
                    load();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("admin.remove")}
              </button>
            ) : (
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  try {
                    await api.workspaces.updateMember(workspaceId, member.memberId, { status: "active" });
                    load();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("admin.reactivate")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Invitations({ workspaceId }: { workspaceId: string }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [invites, setInvites] = useState<InviteRow[] | null>(null);

  const load = useCallback(() => {
    api.invites
      .list(workspaceId)
      .then(({ invites: list }) => setInvites(list as InviteRow[]))
      .catch(() => setInvites([]));
  }, [workspaceId]);

  useEffect(load, [load]);

  if (!invites) return <Spinner label={t("admin.loadingInvitations")} />;
  const pending = invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt) > new Date());

  return (
    <div className="admin-list">
      {pending.length === 0 ? <p className="muted">{t("admin.noPendingInvitations")}</p> : null}
      {pending.map((invite) => (
        <div key={invite.id} className="admin-row">
          <div className="admin-row-main">
            <span>
              <strong>{invite.email ?? t("admin.shareableInviteLink")}</strong>
              <small>
                {invite.role} · {t("admin.expires", { time: formatRelative(invite.expiresAt) })}
                {invite.maxUses ? ` · ${t("admin.uses", { used: invite.useCount, max: invite.maxUses })}` : ""}
              </small>
            </span>
          </div>
          <div className="admin-row-actions">
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                try {
                  const { inviteUrl } = await api.invites.resend(invite.id);
                  void navigator.clipboard.writeText(inviteUrl);
                  actions.toast(t("admin.newInviteCopied"), "success");
                  load();
                } catch (error) {
                  actions.fail(error);
                }
              }}
            >
              <RefreshCw size={13} /> {t("admin.resend")}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                await api.invites.revoke(invite.id);
                load();
              }}
            >
              {t("common.revoke")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Channels({ workspaceId }: { workspaceId: string }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [channels, setChannels] = useState<Array<ChannelSummary & { conversationId: string }> | null>(null);

  const load = useCallback(() => {
    api.channels
      .list(workspaceId, { includeArchived: true })
      .then(({ channels: list }) => setChannels(list))
      .catch(() => setChannels([]));
  }, [workspaceId]);

  useEffect(load, [load]);

  if (!channels) return <Spinner label={t("views.loadingChannels")} />;

  return (
    <div className="admin-list">
      {channels.map((channel) => (
        <div key={channel.id} className="admin-row">
          <div className="admin-row-main">
            {channel.visibility === "private" ? <Lock size={14} /> : <Hash size={15} />}
            <span>
              <strong>{channel.name}</strong>
              <small>
                {t("views.membersCount", { count: channel.memberCount ?? 0 })}{channel.archivedAt ? ` · ${t("views.archived")}` : ""}
              </small>
            </span>
          </div>
          <div className="admin-row-actions">
            {channel.archivedAt ? (
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  await api.channels.unarchive(channel.id);
                  load();
                  await actions.refreshBootstrap();
                }}
              >
                {t("conversation.unarchive")}
              </button>
            ) : channel.name !== "general" ? (
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  if (!window.confirm(t("panels.archiveConfirm", { channel: channel.name }))) return;
                  await api.channels.archive(channel.id);
                  load();
                  await actions.refreshBootstrap();
                }}
              >
                {t("admin.archive")}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Emoji({ workspaceId }: { workspaceId: string }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [emoji, setEmoji] = useState<CustomEmojiDto[] | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(() => {
    api.workspaces
      .emoji(workspaceId)
      .then(({ emoji: list }) => setEmoji(list))
      .catch(() => setEmoji([]));
  }, [workspaceId]);

  useEffect(load, [load]);

  return (
    <div className="stack-form">
      <label className="field">
        {t("admin.addCustomEmoji")}
        <div className="emoji-upload">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="party-parrot" />
          <input
            type="file"
            accept="image/*"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !name.trim()) {
                actions.toast(t("admin.nameEmojiFirst"), "error");
                return;
              }
              try {
                const { file: uploaded } = await api.files.upload(workspaceId, file);
                await api.workspaces.createEmoji(workspaceId, name.trim().toLowerCase(), uploaded.id);
                setName("");
                load();
                await actions.refreshBootstrap();
              } catch (error) {
                actions.fail(error);
              }
            }}
          />
        </div>
      </label>
      <div className="emoji-admin-grid">
        {(emoji ?? []).map((entry) => (
          <div key={entry.id} className="emoji-admin-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.imageUrl} alt={`:${entry.name}:`} width={28} height={28} />
            <code>:{entry.name}:</code>
            <button
              type="button"
              className="icon-button"
              aria-label={t("admin.deleteEmoji", { name: entry.name })}
              onClick={async () => {
                await api.workspaces.deleteEmoji(entry.id);
                load();
                await actions.refreshBootstrap();
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {emoji?.length === 0 ? <p className="muted">{t("admin.noCustomEmoji")}</p> : null}
      </div>
    </div>
  );
}

const DEFAULT_SCOPES = ["messages:read", "messages:write", "channels:read", "conversations:read"];

function ApiKeys({ workspaceId }: { workspaceId: string }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKeyDto[] | null>(null);
  const [catalogue, setCatalogue] = useState<Array<{ scope: string; summary: string }>>([]);
  const [secret, setSecret] = useState<{ token: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    identity: "bot" as "bot" | "self",
    botRole: "member" as "member" | "admin",
    scopes: DEFAULT_SCOPES,
    rateLimitPerMinute: 120,
    messageLimitPerMinute: 60,
    expiresInDays: ""
  });

  const load = useCallback(() => {
    api.apiKeys
      .list(workspaceId)
      .then(({ apiKeys }) => setKeys(apiKeys))
      .catch(() => setKeys([]));
  }, [workspaceId]);

  useEffect(load, [load]);
  useEffect(() => {
    api.apiKeys
      .scopes()
      .then(({ scopes }) => setCatalogue(scopes))
      .catch(() => setCatalogue([]));
  }, []);

  const toggleScope = (scope: string) =>
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope]
    }));

  return (
    <div className="stack-form">
      <p className="muted">
        {t("admin.apiIntro")} <code>/api/meta/routes</code>.
      </p>

      {secret ? (
        <div className="api-key-reveal">
          <strong>{t("admin.copyKeyNow", { name: secret.name })}</strong>
          <code>{secret.token}</code>
          <div className="admin-row-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => {
                void navigator.clipboard.writeText(secret.token);
                actions.toast(t("admin.apiKeyCopied"), "success");
              }}
            >
              {t("messages.copyLink")}
            </button>
            <button type="button" className="button ghost" onClick={() => setSecret(null)}>
              {t("modals.done")}
            </button>
          </div>
          <small>
            {t("admin.tryIt")} <code>curl -H &quot;Authorization: Bearer {secret.token.slice(0, 14)}…&quot; {location.origin}/api/auth/me</code>
          </small>
        </div>
      ) : null}

      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (form.scopes.length === 0) {
            actions.toast(t("admin.grantScope"), "error");
            return;
          }
          try {
            const { apiKey, token } = await api.apiKeys.create(workspaceId, {
              name: form.name.trim(),
              scopes: form.scopes,
              identity: form.identity,
              botRole: form.botRole,
              rateLimitPerMinute: form.rateLimitPerMinute,
              messageLimitPerMinute: form.messageLimitPerMinute,
              expiresInDays: form.expiresInDays === "" ? null : Number(form.expiresInDays)
            });
            setSecret({ token, name: apiKey.name });
            setForm({ ...form, name: "" });
            load();
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        <label className="field">
          {t("admin.keyName")}
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Release bot"
            required
          />
        </label>

        <div className="api-key-row">
          <label className="field">
            {t("admin.actsAs")}
            <select
              value={form.identity}
              onChange={(event) => setForm({ ...form, identity: event.target.value as "bot" | "self" })}
            >
              <option value="bot">{t("admin.ownBotIdentity")}</option>
              <option value="self">{t("admin.me")}</option>
            </select>
          </label>
          {form.identity === "bot" ? (
            <label className="field">
              {t("admin.botRole")}
              <select
                value={form.botRole}
                onChange={(event) => setForm({ ...form, botRole: event.target.value as "member" | "admin" })}
              >
                <option value="member">{t("admin.member")}</option>
                <option value="admin">{t("admin.admin")}</option>
              </select>
            </label>
          ) : null}
          <label className="field">
            {t("admin.requestsMinute")}
            <input
              type="number"
              min={1}
              max={6000}
              value={form.rateLimitPerMinute}
              onChange={(event) => setForm({ ...form, rateLimitPerMinute: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            {t("admin.messagesMinute")}
            <input
              type="number"
              min={1}
              max={6000}
              value={form.messageLimitPerMinute}
              onChange={(event) => setForm({ ...form, messageLimitPerMinute: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            {t("admin.expiresDays")}
            <input
              type="number"
              min={1}
              value={form.expiresInDays}
              placeholder={t("admin.never")}
              onChange={(event) => setForm({ ...form, expiresInDays: event.target.value })}
            />
          </label>
        </div>

        <fieldset className="scope-grid">
          <legend>{t("admin.scopes")}</legend>
          {catalogue.map((entry) => (
            <label key={entry.scope} className="checkbox-field">
              <input
                type="checkbox"
                checked={form.scopes.includes(entry.scope)}
                onChange={() => toggleScope(entry.scope)}
              />
              <span>
                <strong>{entry.scope}</strong>
                <small>{entry.summary}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <button type="submit" className="button primary">
          {t("admin.createApiKey")}
        </button>
      </form>

      {!keys ? (
        <Spinner label={t("admin.loadingApiKeys")} />
      ) : (
        <div className="admin-list">
          {keys.length === 0 ? <p className="muted">{t("admin.noApiKeys")}</p> : null}
          {keys.map((key) => (
            <div key={key.id} className="admin-row">
              <div className="admin-row-main">
                <span>
                  <strong>
                    {key.name} <code>{key.prefix}…</code>
                  </strong>
                  <small>
                    {t("admin.asActor", { actor: key.actor.displayName })}
                    {key.actor.isBot ? ` ${t("admin.bot")}` : ""} · {t("admin.scopesCount", { count: key.scopes.length })} · {key.rateLimitPerMinute}/min ·{" "}
                    {t("admin.calls", { count: key.requestCount })} ·{" "}
                    {key.lastUsedAt ? t("panels.lastUsed", { time: formatRelative(key.lastUsedAt) }) : t("panels.neverUsed")}
                    {key.expiresAt ? ` · expires ${formatRelative(key.expiresAt)}` : ""}
                  </small>
                </span>
              </div>
              <div className="admin-row-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={async () => {
                    if (!window.confirm(t("admin.rotateConfirm", { name: key.name }))) return;
                    try {
                      const { token } = await api.apiKeys.rotate(key.id);
                      setSecret({ token, name: key.name });
                      load();
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                >
                  <RefreshCw size={13} /> {t("admin.rotate")}
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={async () => {
                    if (!window.confirm(t("admin.revokeKeyConfirm", { name: key.name }))) return;
                    try {
                      await api.apiKeys.revoke(key.id);
                      load();
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                >
                  {t("common.revoke")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Settings({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const workspace = state.bootstrap?.workspace;
  const [form, setForm] = useState({
    name: workspace?.name ?? "",
    description: workspace?.description ?? "",
    iconEmoji: workspace?.iconEmoji ?? "",
    membersCanInvite: workspace?.membersCanInvite ?? true,
    membersCanCreateChannels: workspace?.membersCanCreateChannels ?? true,
    ssoEnabled: workspace?.ssoEnabled ?? false,
    ssoShowOnLogin: workspace?.ssoShowOnLogin ?? false,
    ssoAutoJoinRole: workspace?.ssoAutoJoinRole ?? "member",
    ssoIssuer: workspace?.ssoIssuer ?? "",
    ssoClientId: workspace?.ssoClientId ?? "",
    ssoClientSecret: "",
    ssoScopes: workspace?.ssoScopes ?? "openid email profile",
    retentionDays: workspace?.retentionDays ?? "",
    seatLimit: workspace?.seatLimit ?? 50,
    maxUploadMb: workspace?.maxUploadMb ?? 10,
    storageLimitMb: workspace?.storageLimitMb ?? 10000,
    fileRetentionDays: workspace?.fileRetentionDays ?? 0
  });
  const ssoUrl = typeof window === "undefined" ? "" : `${window.location.origin}/?workspaceId=${workspaceId}`;

  return (
    <form
      className="stack-form"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const update: Record<string, unknown> = {
            name: form.name,
            description: form.description || null,
            iconEmoji: form.iconEmoji || null,
            membersCanInvite: form.membersCanInvite,
            membersCanCreateChannels: form.membersCanCreateChannels,
            seatLimit: Number(form.seatLimit),
            maxUploadMb: Number(form.maxUploadMb),
            storageLimitMb: Number(form.storageLimitMb),
            fileRetentionDays: Number(form.fileRetentionDays)
          };
          if (isOwner) {
            Object.assign(update, {
              ssoEnabled: form.ssoEnabled,
              ssoShowOnLogin: form.ssoShowOnLogin,
              ssoAutoJoinRole: form.ssoAutoJoinRole,
              ssoIssuer: form.ssoIssuer || null,
              ssoClientId: form.ssoClientId || null,
              ssoScopes: form.ssoScopes || null,
              retentionDays: form.retentionDays === "" ? null : Number(form.retentionDays)
            });
            if (form.ssoClientSecret.trim()) update.ssoClientSecret = form.ssoClientSecret;
          }
          await api.workspaces.update(workspaceId, update);
          await actions.refreshBootstrap();
          actions.toast(t("admin.workspaceUpdated"), "success");
        } catch (error) {
          actions.fail(error);
        }
      }}
    >
      <label className="field">
        {t("admin.workspaceName")}
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </label>
      <label className="field">
        {t("panels.description")}
        <textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
      </label>
      <label className="field">
        {t("admin.iconEmoji")}
        <input value={form.iconEmoji ?? ""} onChange={(event) => setForm({ ...form, iconEmoji: event.target.value })} placeholder="🚀" />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={form.membersCanInvite} onChange={(event) => setForm({ ...form, membersCanInvite: event.target.checked })} />
        <span>
          <strong>{t("admin.membersCanInvite")}</strong>
        </span>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.membersCanCreateChannels}
          onChange={(event) => setForm({ ...form, membersCanCreateChannels: event.target.checked })}
        />
        <span>
          <strong>{t("admin.membersCanCreateChannels")}</strong>
        </span>
      </label>
      <label className="field">
        {t("admin.seatLimit")}
        <input
          type="number"
          min={1}
          value={form.seatLimit}
          onChange={(event) => setForm({ ...form, seatLimit: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        {t("admin.maxUploadMb")}
        <input
          type="number"
          min={1}
          max={1024}
          value={form.maxUploadMb}
          onChange={(event) => setForm({ ...form, maxUploadMb: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        {t("admin.storageLimitMb")}
        <input
          type="number"
          min={1}
          max={102400}
          value={form.storageLimitMb}
          onChange={(event) => setForm({ ...form, storageLimitMb: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        {t("admin.fileRetentionDays")}
        <input
          type="number"
          min={0}
          max={3650}
          value={form.fileRetentionDays}
          onChange={(event) => setForm({ ...form, fileRetentionDays: Number(event.target.value) })}
        />
        <small>{t("admin.fileRetentionHint")}</small>
      </label>
      {isOwner ? (
        <>
          <label className="field">
            {t("admin.retention")}
            <input
              type="number"
              min={1}
              value={form.retentionDays ?? ""}
              onChange={(event) => setForm({ ...form, retentionDays: event.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.ssoEnabled}
              onChange={(event) =>
                setForm({ ...form, ssoEnabled: event.target.checked, ssoShowOnLogin: event.target.checked ? form.ssoShowOnLogin : false })
              }
            />
            <span>
              <strong>{t("admin.ssoEnabled")}</strong>
              <small>{t("admin.ssoEnabledHint")}</small>
            </span>
          </label>
          <label className="field">
            {t("admin.ssoIssuer")}
            <input
              type="url"
              value={form.ssoIssuer}
              onChange={(event) => setForm({ ...form, ssoIssuer: event.target.value })}
              placeholder="https://auth.example.com/application/o/fluid-chat"
            />
          </label>
          <label className="field">
            {t("admin.ssoClientId")}
            <input value={form.ssoClientId} onChange={(event) => setForm({ ...form, ssoClientId: event.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            {t("admin.ssoClientSecret")}
            <input
              type="password"
              value={form.ssoClientSecret}
              onChange={(event) => setForm({ ...form, ssoClientSecret: event.target.value })}
              placeholder={workspace?.ssoClientSecretSet ? t("admin.ssoClientSecretConfigured") : ""}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            {t("admin.ssoScopes")}
            <input value={form.ssoScopes} onChange={(event) => setForm({ ...form, ssoScopes: event.target.value })} placeholder="openid email profile" />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.ssoShowOnLogin}
              onChange={(event) =>
                setForm({ ...form, ssoShowOnLogin: event.target.checked, ssoEnabled: event.target.checked ? true : form.ssoEnabled })
              }
            />
            <span>
              <strong>{t("admin.ssoShowOnLogin")}</strong>
              <small>{t("admin.ssoShowOnLoginHint")}</small>
            </span>
          </label>
          <label className="field">
            {t("admin.ssoAutoJoinRole")}
            <select value={form.ssoAutoJoinRole} onChange={(event) => setForm({ ...form, ssoAutoJoinRole: event.target.value as "admin" | "member" | "guest" })}>
              <option value="member">{t("admin.member")}</option>
              <option value="admin">{t("admin.admin")}</option>
              <option value="guest">{t("admin.guest")}</option>
            </select>
          </label>
          <label className="field">
            {t("admin.ssoLoginUrl")}
            <input value={ssoUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          </label>
        </>
      ) : null}
      <button type="submit" className="button primary">
        {t("admin.saveSettings")}
      </button>
    </form>
  );
}

function AuditLog({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n();
  const [events, setEvents] = useState<Array<{ id: string; type: string; createdAt: string; actor: { displayName: string } | null }> | null>(
    null
  );

  useEffect(() => {
    api.workspaces
      .auditEvents(workspaceId)
      .then(({ auditEvents }) => setEvents(auditEvents))
      .catch(() => setEvents([]));
  }, [workspaceId]);

  if (!events) return <Spinner label={t("admin.loadingAuditLog")} />;

  return (
    <div className="admin-list">
      {events.map((event) => (
        <div key={event.id} className="admin-row compact">
          <span>
            <strong>{event.type}</strong>
            <small>{event.actor?.displayName ?? t("admin.system")}</small>
          </span>
          <time>{formatRelative(event.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function Exports({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Array<{ id: string; status: string; createdAt: string; fileUrl: string | null }> | null>(null);

  const load = useCallback(() => {
    api.workspaces
      .exports(workspaceId)
      .then(({ exportJobs }) => setJobs(exportJobs))
      .catch(() => setJobs([]));
  }, [workspaceId]);

  useEffect(load, [load]);

  if (!isOwner) return <p className="muted">{t("admin.ownersOnlyExport")}</p>;

  return (
    <div className="stack-form">
      <p className="muted">
        {t("admin.exportHint")}
      </p>
      <button
        type="button"
        className="button primary"
        onClick={async () => {
          try {
            await api.workspaces.requestExport(workspaceId);
            actions.toast(t("admin.exportQueued"), "success");
            setTimeout(load, 2000);
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        {t("admin.startExport")}
      </button>
      <div className="admin-list">
        {(jobs ?? []).map((job) => (
          <div key={job.id} className="admin-row compact">
            <span>
              <strong className="capitalize">{job.status}</strong>
              <small>{job.fileUrl ?? t("admin.preparing")}</small>
            </span>
            <time>{formatRelative(job.createdAt)}</time>
          </div>
        ))}
      </div>
    </div>
  );
}
