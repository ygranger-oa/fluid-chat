"use client";

import { useEffect, useState } from "react";
import { AtSign, Bell, Bookmark, Clock, Inbox, MessageSquare, PenSquare, Trash2 } from "lucide-react";
import type { DraftDto, MessageDto, NotificationDto, ReminderDto, ScheduledMessageDto } from "@/shared/types";
import { api } from "../../api";
import { formatRelative, compactTimestamp } from "../../format";
import { useI18n } from "../../i18n";
import { conversationTitle, useApp, useDirectory } from "../../store";
import { Avatar, EmptyState, Spinner } from "../ui/primitives";
import { MessageItem } from "../message/message-item";
import { RichText } from "../message/rich-text";

function ViewHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="view-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function useConversationLabel() {
  const { state } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  return (conversationId: string | null) => {
    if (!conversationId) return "";
    const conversation = state.bootstrap?.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) return t("app.aConversation");
    return conversation.channel
      ? `#${conversation.channel.name}`
      : conversationTitle(conversation, directory, state.session?.id);
  };
}

export function ActivityView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const label = useConversationLabel();
  const [notifications, setNotifications] = useState<NotificationDto[] | null>(null);
  const [filter, setFilter] = useState<"all" | "mention" | "thread_reply" | "reaction">("all");

  useEffect(() => {
    if (!state.workspaceId) return;
    api.activity
      .notifications(state.workspaceId)
      .then(({ notifications: list }) => setNotifications(list))
      .catch(() => setNotifications([]));
  }, [state.workspaceId, state.notifications.length]);

  const visible = (notifications ?? []).filter((entry) => filter === "all" || entry.type === filter);

  return (
    <section className="view">
      <ViewHeader
        title={t("views.activityTitle")}
        subtitle={t("views.activitySubtitle")}
        action={
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              if (!state.workspaceId) return;
              await api.activity.markNotificationsRead(state.workspaceId);
              await actions.loadNotifications();
              setNotifications((current) =>
                (current ?? []).map((entry) => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() }))
              );
            }}
          >
            {t("views.markAllRead")}
          </button>
        }
      />
      <div className="view-filters">
        {(
          [
            ["all", t("common.all"), <Bell key="a" size={14} />],
            ["mention", t("views.mentions"), <AtSign key="b" size={14} />],
            ["thread_reply", t("views.threads"), <MessageSquare key="c" size={14} />],
            ["reaction", t("views.reactions"), <Bookmark key="d" size={14} />]
          ] as const
        ).map(([value, text, icon]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "is-active" : ""}
            onClick={() => setFilter(value as typeof filter)}
          >
            {icon}
            {text}
          </button>
        ))}
      </div>

      <div className="view-scroll">
        {!notifications ? (
          <Spinner label={t("views.loadingActivity")} />
        ) : visible.length === 0 ? (
          <EmptyState title={t("views.caughtUp")} body={t("views.activityEmpty")} />
        ) : (
          visible.map((notification) => {
            const actor = notification.actorUserId ? directory.get(notification.actorUserId) : undefined;
            return (
              <button
                key={notification.id}
                type="button"
                className={`activity-row ${notification.readAt ? "" : "is-unread"}`}
                onClick={() => {
                  if (notification.conversationId) void actions.openConversation(notification.conversationId);
                }}
              >
                <Avatar user={actor} size={34} />
                <div>
                  <div className="activity-meta">
                    <strong>{actor?.displayName ?? t("app.fluidFallback")}</strong>
                    <span>{describeNotification(notification.type, t)}</span>
                    <span className="muted">{label(notification.conversationId)}</span>
                    <time>{formatRelative(notification.createdAt)}</time>
                  </div>
                  {notification.body ? <p className="activity-body">{notification.body}</p> : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function describeNotification(type: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (type) {
    case "mention":
      return t("views.mentionedYouIn");
    case "dm":
      return t("views.sentMessage");
    case "thread_reply":
      return t("views.repliedThread");
    case "reaction":
      return t("views.reactedMessage");
    case "invite_accepted":
      return t("views.joinedWorkspace");
    case "reminder":
      return t("views.reminder");
    case "keyword":
      return t("views.saidKeyword");
    case "channel_invite":
      return t("views.addedChannel");
    default:
      return type;
  }
}

export function ThreadsView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const label = useConversationLabel();
  const [threads, setThreads] = useState<Array<{ root: MessageDto; replies: MessageDto[] }> | null>(null);

  useEffect(() => {
    if (!state.workspaceId) return;
    api.activity
      .threads(state.workspaceId)
      .then(({ threads: list }) => setThreads(list))
      .catch(() => setThreads([]));
  }, [state.workspaceId]);

  return (
    <section className="view">
      <ViewHeader title={t("views.threads")} subtitle={t("views.threadsSubtitle")} />
      <div className="view-scroll">
        {!threads ? (
          <Spinner label={t("views.loadingThreads")} />
        ) : threads.length === 0 ? (
          <EmptyState title={t("views.noThreads")} body={t("views.noThreadsBody")} />
        ) : (
          threads.map(({ root, replies }) => (
            <div key={root.id} className="thread-card">
              <button type="button" className="thread-card-head" onClick={() => void actions.openThread(root.id)}>
                {label(root.conversationId)}
                <span>
                  {root.thread.replyCount} {root.thread.replyCount === 1 ? t("views.reply") : t("views.replies")}
                </span>
              </button>
              <MessageItem message={root} context="list" />
              {replies.map((reply) => (
                <MessageItem key={reply.id} message={reply} context="list" />
              ))}
              <button type="button" className="button ghost" onClick={() => void actions.openThread(root.id)}>
                {t("views.openThread")}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function SavedView() {
  const { state } = useApp();
  const { t } = useI18n();
  const [saved, setSaved] = useState<Array<{ message: MessageDto; savedAt: string }> | null>(null);

  useEffect(() => {
    if (!state.workspaceId) return;
    api.activity
      .saved(state.workspaceId)
      .then(({ saved: list }) => setSaved(list))
      .catch(() => setSaved([]));
  }, [state.workspaceId]);

  return (
    <section className="view">
      <ViewHeader title={t("sidebar.later")} subtitle={t("views.laterSubtitle")} />
      <div className="view-scroll">
        {!saved ? (
          <Spinner label={t("views.loadingSaved")} />
        ) : saved.length === 0 ? (
          <EmptyState title={t("views.nothingSaved")} body={t("views.nothingSavedBody")} />
        ) : (
          saved.map(({ message, savedAt }) => (
            <div key={message.id} className="panel-card">
              <div className="panel-card-head">
                <Bookmark size={13} /> {t("views.saved", { time: formatRelative(savedAt) })}
              </div>
              <MessageItem message={message} context="list" />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function DraftsView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const label = useConversationLabel();
  const [drafts, setDrafts] = useState<DraftDto[] | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledMessageDto[]>([]);
  const [reminders, setReminders] = useState<ReminderDto[]>([]);

  const load = () => {
    if (!state.workspaceId) return;
    void api.activity.drafts(state.workspaceId).then(({ drafts: list }) => setDrafts(list));
    void api.activity.scheduled(state.workspaceId).then(({ scheduled: list }) => setScheduled(list));
    void api.activity.reminders(state.workspaceId).then(({ reminders: list }) => setReminders(list));
  };

  useEffect(load, [state.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="view">
      <ViewHeader title={t("sidebar.draftsSent")} subtitle={t("views.draftsSubtitle")} />
      <div className="view-scroll">
        <h3 className="view-subhead">
          <PenSquare size={14} /> {t("views.drafts")}
        </h3>
        {!drafts ? (
          <Spinner label={t("views.loadingDrafts")} />
        ) : drafts.filter((draft) => draft.bodyText.trim()).length === 0 ? (
          <EmptyState title={t("views.noDrafts")} body={t("views.noDraftsBody")} />
        ) : (
          drafts
            .filter((draft) => draft.bodyText.trim())
            .map((draft) => (
              <button
                key={draft.id}
                type="button"
                className="list-row"
                onClick={() => void actions.openConversation(draft.conversationId)}
              >
                <div className="list-row-head">
                  <strong>{label(draft.conversationId)}</strong>
                  <time>{formatRelative(draft.updatedAt)}</time>
                </div>
                <RichText text={draft.bodyText} />
              </button>
            ))
        )}

        <h3 className="view-subhead">
          <Clock size={14} /> {t("views.scheduled")}
        </h3>
        {scheduled.length === 0 ? (
          <p className="muted padded">{t("views.nothingScheduled")}</p>
        ) : (
          scheduled.map((entry) => (
            <div key={entry.id} className="list-row is-static">
              <div className="list-row-head">
                <strong>{label(entry.conversationId)}</strong>
                <time>{t("views.sendsAt", { time: compactTimestamp(entry.sendAt) })}</time>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("views.cancelScheduled")}
                  onClick={async () => {
                    await api.activity.cancelScheduled(entry.id);
                    load();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <RichText text={entry.bodyText} />
            </div>
          ))
        )}

        <h3 className="view-subhead">
          <Bell size={14} /> {t("views.reminders")}
        </h3>
        {reminders.length === 0 ? (
          <p className="muted padded">{t("views.noReminders")}</p>
        ) : (
          reminders.map((reminder) => (
            <div key={reminder.id} className="list-row is-static">
              <div className="list-row-head">
                <strong>{reminder.text}</strong>
                <time>{compactTimestamp(reminder.remindAt)}</time>
                <button
                  type="button"
                  className="button ghost"
                  onClick={async () => {
                    await api.activity.completeReminder(reminder.id);
                    load();
                  }}
                >
                  {t("views.complete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function UnreadsView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const label = useConversationLabel();
  const [unreads, setUnreads] = useState<Array<{ conversationId: string; messages: MessageDto[] }> | null>(null);

  const load = () => {
    if (!state.workspaceId) return;
    api.activity
      .unreads(state.workspaceId)
      .then(({ unreads: list }) => setUnreads(list))
      .catch(() => setUnreads([]));
  };

  useEffect(load, [state.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="view">
      <ViewHeader
        title={t("sidebar.allUnreads")}
        subtitle={t("views.unreadsSubtitle")}
        action={
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              for (const entry of unreads ?? []) {
                await api.conversations.markRead(entry.conversationId, entry.messages.at(-1)?.id);
              }
              await actions.refreshConversations();
              load();
            }}
          >
            <Inbox size={14} /> {t("views.markAllRead")}
          </button>
        }
      />
      <div className="view-scroll">
        {!unreads ? (
          <Spinner label={t("views.loadingUnreads")} />
        ) : unreads.length === 0 ? (
          <EmptyState title={t("views.caughtUp")} body={t("views.noUnreadMessages")} />
        ) : (
          unreads.map((entry) => (
            <div key={entry.conversationId} className="unread-group">
              <button type="button" className="unread-group-head" onClick={() => void actions.openConversation(entry.conversationId)}>
                {label(entry.conversationId)}
                <span>{t("views.newCount", { count: entry.messages.length })}</span>
              </button>
              {entry.messages.map((message) => (
                <MessageItem key={message.id} message={message} context="list" />
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
