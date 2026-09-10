"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, MessageSquare, Pin, Trash2, X } from "lucide-react";
import type { FileSummary, MessageDto, PublicUser } from "@/shared/types";
import { api } from "../../api";
import { formatBytes, formatDateTime, formatRelative, localTimeIn } from "../../format";
import { useI18n } from "../../i18n";
import { conversationTitle, useApp, useDirectory } from "../../store";
import { Avatar, EmptyState, IconButton, Spinner } from "../ui/primitives";
import { Composer } from "../message/composer";
import { MessageItem } from "../message/message-item";
import { MessageStack, TypingIndicator } from "../message/message-list";

export function RightPanel() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const panel = state.rightPanel;
  if (!panel) return null;

  const close = () => actions.setRightPanel(null);

  return (
    <aside className="right-panel" aria-label={t("panels.detailsPanel")}>
      {panel.kind === "thread" ? <ThreadPanel messageId={panel.messageId} onClose={close} /> : null}
      {panel.kind === "profile" ? <ProfilePanel userId={panel.userId} onClose={close} /> : null}
      {panel.kind === "details" ? <DetailsPanel conversationId={panel.conversationId} onClose={close} /> : null}
      {panel.kind === "pins" ? <PinsPanel conversationId={panel.conversationId} onClose={close} /> : null}
      {panel.kind === "files" ? <FilesPanel conversationId={panel.conversationId} onClose={close} /> : null}
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
  action
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  action?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="panel-header-actions">
        {action}
        <IconButton label={t("common.closePanel")} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </header>
  );
}

function ThreadPanel({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const messages = state.threads[messageId];
  const root = messages?.[0];
  const conversation = state.bootstrap?.conversations.find((entry) => entry.id === root?.conversationId);

  useEffect(() => {
    if (!state.threads[messageId]) void actions.openThread(messageId);
  }, [messageId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PanelHeader
        title={t("panels.thread")}
        subtitle={conversation ? conversationTitle(conversation, directory, state.session?.id) : undefined}
        onClose={onClose}
        action={
          root ? (
            <button
              type="button"
              className="button ghost small"
              onClick={async () => {
                const next = root.thread.following ? "muted" : "following";
                try {
                  await api.messages.follow(root.id, next);
                  actions.upsertMessage({ ...root, thread: { ...root.thread, following: next === "following" } });
                } catch (error) {
                  actions.fail(error);
                }
              }}
            >
              {root.thread.following ? t("panels.following") : t("panels.follow")}
            </button>
          ) : null
        }
      />
      <div className="panel-scroll">
        {!messages ? (
          <Spinner label={t("panels.loadingThread")} />
        ) : (
          <>
            <MessageItem message={messages[0]} context="thread" />
            {messages.length > 1 ? (
              <div className="thread-divider">
                {messages.length - 1} {messages.length === 2 ? t("messages.reply") : t("messages.replies")}
              </div>
            ) : null}
            <MessageStack messages={messages.slice(1)} context="thread" />
          </>
        )}
      </div>
      {root ? <TypingIndicator conversationId={root.conversationId} parentMessageId={root.id} /> : null}
      {root && conversation ? (
        <Composer
          conversationId={root.conversationId}
          parentMessageId={root.id}
          placeholder={t("messages.replyThread")}
          autoFocus
          onSent={() => void actions.openThread(messageId)}
        />
      ) : null}
    </>
  );
}

function ProfilePanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const [user, setUser] = useState<PublicUser | undefined>(directory.get(userId));
  const timeFormat = state.session?.preferences?.timeFormat ?? "12h";
  const isSelf = state.session?.id === userId;

  useEffect(() => {
    if (!directory.get(userId)) {
      api.users
        .profile(userId)
        .then(({ user: fetched }) => setUser(fetched))
        .catch(() => undefined);
    } else {
      setUser(directory.get(userId));
    }
  }, [userId, directory]);

  if (!user) return <PanelHeader title={t("panels.profile")} onClose={onClose} />;

  const localTime = localTimeIn(user.timezone, timeFormat);
  const unavailableStatus =
    user.workspaceStatus === "removed"
      ? t("panels.removedMember")
      : user.workspaceStatus === "suspended"
        ? t("panels.suspendedMember")
        : null;
  const canMessage = !isSelf && !unavailableStatus;

  return (
    <>
      <PanelHeader title={t("panels.profile")} onClose={onClose} />
      <div className="panel-scroll profile-panel">
        <div className="profile-avatar">
          <Avatar user={user} size={160} presence={false} />
        </div>
        <h3>{user.displayName}</h3>
        {user.handle ? <p className="muted">@{user.handle}</p> : null}
        {user.title ? <p className="profile-title">{user.title}</p> : null}
        {user.statusText ? (
          <p className="profile-status">
            {user.statusEmoji ? <span aria-hidden>:{user.statusEmoji}:</span> : null} {user.statusText}
          </p>
        ) : null}
        <dl className="profile-facts">
          {user.pronouns ? (
            <>
              <dt>{t("panels.pronouns")}</dt>
              <dd>{user.pronouns}</dd>
            </>
          ) : null}
          <dt>{t("panels.email")}</dt>
          <dd>
            <a href={`mailto:${user.email}`}>{user.email}</a>
          </dd>
          {localTime ? (
            <>
              <dt>{t("panels.localTime")}</dt>
              <dd>{localTime}</dd>
            </>
          ) : null}
          <dt>{t("panels.presence")}</dt>
          <dd className="capitalize">{user.presence}</dd>
          {unavailableStatus ? (
            <>
              <dt>{t("panels.memberStatus")}</dt>
              <dd>
                <span className="pill unavailable-pill">{unavailableStatus}</span>
              </dd>
            </>
          ) : null}
        </dl>
        <div className="profile-actions">
          {isSelf ? (
            <button type="button" className="button primary" onClick={() => actions.setModal({ kind: "profile-editor" })}>
              {t("topBar.editProfile")}
            </button>
          ) : canMessage ? (
            <button
              type="button"
              className="button primary"
              onClick={async () => {
                if (!state.workspaceId) return;
                try {
                  const { conversation } = await api.conversations.openDm(state.workspaceId, [userId]);
                  await actions.refreshBootstrap();
                  await actions.openConversation(conversation.id);
                } catch (error) {
                  actions.fail(error);
                }
              }}
            >
              <MessageSquare size={15} /> {t("common.message")}
            </button>
          ) : (
            <p className="profile-unavailable-note">{t("panels.unavailableMemberMessage")}</p>
          )}
        </div>
      </div>
    </>
  );
}

function DetailsPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const conversation = state.bootstrap?.conversations.find((entry) => entry.id === conversationId);
  const channel = conversation?.channel;
  const [tab, setTab] = useState<"about" | "members" | "settings">("about");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [description, setDescription] = useState(channel?.description ?? "");
  const isAdmin = state.bootstrap?.role === "owner" || state.bootstrap?.role === "admin";

  useEffect(() => {
    setTopic(channel?.topic ?? "");
    setDescription(channel?.description ?? "");
  }, [channel?.id, channel?.topic, channel?.description]);

  if (!conversation) return <PanelHeader title={t("panels.details")} onClose={onClose} />;

  return (
    <>
      <PanelHeader
        title={conversationTitle(conversation, directory, state.session?.id)}
        subtitle={channel ? t("conversation.memberCount", { count: conversation.memberIds.length }) : t("app.directMessage")}
        onClose={onClose}
      />
      <div className="panel-tabs" role="tablist">
        {(["about", "members", ...(channel ? (["settings"] as const) : [])] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            className={tab === entry ? "is-active" : ""}
            onClick={() => setTab(entry)}
          >
            {entry === "about" ? t("panels.about") : entry === "members" ? t("panels.members") : t("panels.settings")}
          </button>
        ))}
      </div>

      <div className="panel-scroll">
        {tab === "about" ? (
          channel ? (
            <div className="panel-section">
              <label className="field">
                {t("panels.topic")}
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onBlur={async () => {
                    if (topic === (channel.topic ?? "")) return;
                    try {
                      await api.channels.update(channel.id, { topic: topic || null });
                      await actions.refreshBootstrap();
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                  placeholder={t("conversation.addTopic")}
                />
              </label>
              <label className="field">
                {t("panels.description")}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={async () => {
                    if (description === (channel.description ?? "")) return;
                    try {
                      await api.channels.update(channel.id, { description: description || null });
                      await actions.refreshBootstrap();
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                  rows={4}
                  placeholder={t("panels.description")}
                />
              </label>
              <p className="muted">
                {t("panels.createdBy", { date: formatDateTime(channel.createdAt), name: directory.get(channel.createdByUserId)?.displayName ?? t("app.someone") })}
              </p>
            </div>
          ) : (
            <div className="panel-section">
              <p className="muted">{t("panels.directMessagePrivate")}</p>
            </div>
          )
        ) : null}

        {tab === "members" ? (
          <div className="panel-section member-list">
            {conversation.memberIds.map((id) => {
              const member = directory.get(id);
              return (
                <div key={id} className="member-row">
                  <button type="button" onClick={() => actions.setRightPanel({ kind: "profile", userId: id })}>
                    <Avatar user={member} size={30} />
                    <span>
                      <strong>{member?.displayName ?? t("app.unknown")}</strong>
                      {member?.title ? <small>{member.title}</small> : null}
                    </span>
                  </button>
                  {channel && isAdmin && id !== state.session?.id ? (
                    <IconButton
                      label={t("modals.removeMember", { name: member?.displayName ?? t("app.member") })}
                      onClick={async () => {
                        try {
                          await api.channels.removeMember(channel.id, id);
                          await actions.refreshBootstrap();
                        } catch (error) {
                          actions.fail(error);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  ) : null}
                </div>
              );
            })}
            {channel ? (
              <button
                type="button"
                className="button ghost"
                onClick={() => actions.setModal({ kind: "add-people", conversationId })}
              >
                {t("conversation.addPeople")}
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === "settings" && channel ? (
          <div className="panel-section">
            {isAdmin ? (
              <form
                className="field"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const name = new FormData(event.currentTarget).get("name");
                  try {
                    await api.channels.update(channel.id, { name: String(name) });
                    await actions.refreshBootstrap();
                    actions.toast(t("panels.channelRenamed"), "success");
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("panels.channelName")}
                <div className="inline-field">
                  <input name="name" defaultValue={channel.name} maxLength={80} />
                  <button type="submit" className="button ghost">
                    {t("panels.rename")}
                  </button>
                </div>
              </form>
            ) : null}

            <label className="field">
              {t("common.notifications")}
              <select
                value={conversation.membership?.notificationLevel ?? "all"}
                onChange={async (event) => {
                  await api.conversations.updateMembership(conversationId, {
                    notificationLevel: event.target.value as "all" | "mentions" | "none"
                  });
                  await actions.refreshConversations();
                }}
              >
                <option value="all">{t("common.everyNewMessage")}</option>
                <option value="mentions">{t("common.mentionsOnly")}</option>
                <option value="none">{t("common.nothing")}</option>
              </select>
            </label>

            {isAdmin ? (
              <>
                <label className="field">
                  {t("panels.whoCanPost")}
                  <select
                    value={channel.postingPolicy}
                    onChange={async (event) => {
                      await api.channels.update(channel.id, { postingPolicy: event.target.value });
                      await actions.refreshBootstrap();
                    }}
                  >
                    <option value="everyone">{t("panels.everyone")}</option>
                    <option value="admins">{t("panels.adminsOnly")}</option>
                  </select>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={channel.autoJoin}
                    disabled={channel.visibility === "private"}
                    onChange={async (event) => {
                      try {
                        await api.channels.update(channel.id, { autoJoin: event.target.checked });
                        await actions.refreshBootstrap();
                      } catch (error) {
                        actions.fail(error);
                      }
                    }}
                  />
                  <span>
                    <strong>{t("panels.addNewMembers")}</strong>
                    <small>{t("panels.addNewMembersHint")}</small>
                  </span>
                </label>

                <label className="field">
                  {t("panels.keepMessagesFor")}
                  <select
                    value={channel.retentionDays ?? ""}
                    onChange={async (event) => {
                      const value = event.target.value;
                      try {
                        await api.channels.update(channel.id, {
                          retentionDays: value === "" ? null : Number(value)
                        });
                        await actions.refreshBootstrap();
                        actions.toast(t("panels.retentionUpdated"), "success");
                      } catch (error) {
                        actions.fail(error);
                      }
                    }}
                  >
                    <option value="">{t("common.foreverWorkspaceDefault")}</option>
                    <option value="30">{t("common.days30")}</option>
                    <option value="90">{t("common.days90")}</option>
                    <option value="365">{t("common.year1")}</option>
                  </select>
                </label>

                <WebhookSettings channelId={channel.id} />
              </>
            ) : null}

            {isAdmin && channel.visibility === "public" ? (
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  if (!window.confirm(t("panels.makePrivateConfirm", { channel: channel.name }))) return;
                  try {
                    await api.channels.update(channel.id, { visibility: "private" });
                    await actions.refreshBootstrap();
                    actions.toast(t("panels.nowPrivate"), "success");
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("panels.makePrivate")}
              </button>
            ) : null}

            <div className="panel-danger">
              <button
                type="button"
                className="button ghost"
                onClick={async () => {
                  try {
                    await api.channels.leave(channel.id);
                    await actions.refreshBootstrap();
                    onClose();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("sidebar.leaveChannel")}
              </button>
              {isAdmin && channel.name !== "general" ? (
                <button
                  type="button"
                  className="button danger"
                  onClick={async () => {
                    if (!window.confirm(t("panels.archiveConfirm", { channel: channel.name }))) return;
                    try {
                      await api.channels.archive(channel.id);
                      await actions.refreshBootstrap();
                      onClose();
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                >
                  {t("panels.archiveChannel")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Incoming webhooks for a channel: create, copy once, revoke. */
function WebhookSettings({ channelId }: { channelId: string }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [hooks, setHooks] = useState<Array<{ id: string; name: string; lastUsedAt: string | null }>>([]);
  const [name, setName] = useState("");
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    api.channels
      .webhooks(channelId)
      .then(({ webhooks }) => setHooks(webhooks))
      .catch(() => setHooks([]));
  }, [channelId]);

  useEffect(load, [load]);

  return (
    <div className="field">
      {t("panels.incomingWebhooks")}
      <p className="muted small">{t("panels.webhooksHint")}</p>
      <div className="inline-field">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("panels.deployBot")} maxLength={60} />
        <button
          type="button"
          className="button ghost"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              const { url } = await api.channels.createWebhook(channelId, name.trim());
              setFreshUrl(url);
              setName("");
              load();
            } catch (error) {
              actions.fail(error);
            }
          }}
        >
          {t("common.create")}
        </button>
      </div>

      {freshUrl ? (
        <div className="copy-row">
          <code>{freshUrl}</code>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              void navigator.clipboard.writeText(freshUrl);
              actions.toast(t("panels.webhookCopied"), "success");
            }}
          >
            {t("common.copy")}
          </button>
        </div>
      ) : null}

      <div className="webhook-list">
        {hooks.map((hook) => (
          <div key={hook.id} className="webhook-row">
            <span>
              <strong>{hook.name}</strong>
              <small>{hook.lastUsedAt ? t("panels.lastUsed", { time: formatRelative(hook.lastUsedAt) }) : t("panels.neverUsed")}</small>
            </span>
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                if (!window.confirm(t("panels.revokeConfirm", { name: hook.name }))) return;
                await api.channels.deleteWebhook(hook.id);
                load();
              }}
            >
              {t("common.revoke")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PinsPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [pins, setPins] = useState<Array<{ message: MessageDto; pinnedAt: string }> | null>(null);

  useEffect(() => {
    api.conversations
      .pins(conversationId)
      .then(({ pins: list }) => setPins(list))
      .catch(() => setPins([]));
  }, [conversationId]);

  return (
    <>
      <PanelHeader title={t("panels.pinned")} subtitle={t("panels.pinnedSubtitle")} onClose={onClose} />
      <div className="panel-scroll">
        {!pins ? (
          <Spinner label={t("panels.loadingPins")} />
        ) : pins.length === 0 ? (
          <EmptyState title={t("panels.nothingPinned")} body={t("panels.nothingPinnedBody")} />
        ) : (
          pins.map(({ message }) => (
            <div key={message.id} className="panel-card">
              <div className="panel-card-head">
                <Pin size={13} /> {t("panels.pinned")}
              </div>
              <MessageItem message={message} context="list" />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function FilesPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<FileSummary[] | null>(null);

  useEffect(() => {
    api.conversations
      .files(conversationId)
      .then(({ files: list }) => setFiles(list))
      .catch(() => setFiles([]));
  }, [conversationId]);

  return (
    <>
      <PanelHeader title={t("common.files")} subtitle={t("panels.filesSubtitle")} onClose={onClose} />
      <div className="panel-scroll">
        {!files ? (
          <Spinner label={t("views.loadingFiles")} />
        ) : files.length === 0 ? (
          <EmptyState title={t("views.noFiles")} body={t("panels.noFilesBody")} />
        ) : (
          <div className="file-grid">
            {files.map((file) => (
              <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" className="file-card">
                {file.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt="" loading="lazy" />
                ) : (
                  <Download size={18} />
                )}
                <span>
                  <strong>{file.name}</strong>
                  <small>{formatBytes(file.size)}</small>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
