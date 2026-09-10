"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bookmark,
  BookmarkCheck,
  Clock,
  Copy,
  Download,
  Link2,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Smile,
  Trash2
} from "lucide-react";
import type { FileSummary, MessageDto } from "@/shared/types";
import { toMentionDisplay, toMentionWire } from "@/shared/mention-text";
import { api } from "../../api";
import { formatBytes, formatDateTime, formatRelative, formatTime } from "../../format";
import { useI18n } from "../../i18n";
import { useApp, useDirectory, useMentionDirectory } from "../../store";
import { Avatar, IconButton, MenuDivider, MenuItem, Popover } from "../ui/primitives";
import { EmojiPicker } from "../ui/emoji-picker";
import { ImagePreview } from "./image-preview";
import { PollMessage } from "./poll-message";
import { MessageReactions, QuickReactions } from "./reactions";
import { EmojiValue, RichText } from "./rich-text";

export function MessageItem({
  message,
  grouped,
  context = "channel",
  highlight
}: {
  message: MessageDto;
  grouped?: boolean;
  context?: "channel" | "thread" | "list";
  highlight?: boolean;
}) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const mentions = useMentionDirectory();
  const [localEditing, setLocalEditing] = useState(false);
  // Edited text is held in display form, same as the composer.
  const [editText, setEditText] = useState(() => toMentionDisplay(message.bodyText, mentions));
  const [previewFile, setPreviewFile] = useState<FileSummary | null>(null);
  // ↑ in the composer asks the store to edit the last message you sent.
  const editing = localEditing || state.editingMessageId === message.id;
  const setEditing = (value: boolean) => {
    setLocalEditing(value);
    if (!value && state.editingMessageId === message.id) actions.setEditingMessage(null);
    if (value) setEditText(toMentionDisplay(message.bodyText, mentions));
  };
  const sender = directory.get(message.senderId);
  const timeFormat = state.session?.preferences?.timeFormat ?? "12h";
  const isAuthor = message.senderId === state.session?.id;
  const role = state.bootstrap?.role;
  const canModerate = role === "owner" || role === "admin";
  const pending = (message.metadata as { pending?: boolean } | null)?.pending === true;
  const isMeMessage = (message.metadata as { subtype?: string } | null)?.subtype === "me_message";
  const isPoll = (message.metadata as { kind?: string } | null)?.kind === "poll";
  const sharedId = (message.metadata as { sharedMessageId?: string } | null)?.sharedMessageId;
  const unavailable = sender?.workspaceStatus === "removed" || sender?.workspaceStatus === "suspended";

  useEffect(() => {
    if (state.editingMessageId === message.id) setEditText(toMentionDisplay(message.bodyText, mentions));
    // Only reload when the store starts an edit. `mentions` changes identity on
    // every presence event, which must not discard what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.editingMessageId, message.id, message.bodyText]);

  if (message.type !== "user") {
    return (
      <div className="system-message" data-message-id={message.id}>
        <span className="system-dot" />
        <RichText text={message.bodyText} />
        <time dateTime={message.createdAt}>{formatTime(message.createdAt, timeFormat)}</time>
      </div>
    );
  }

  if (message.deletedAt) {
    return (
      <article className="message is-deleted" data-message-id={message.id}>
        <div className="message-gutter" />
        <div className="message-content">
          <p className="deleted-note">{t("messages.deleted")}</p>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`message ${grouped ? "is-grouped" : ""} ${highlight ? "is-highlight" : ""} ${pending ? "is-pending" : ""}`}
      data-message-id={message.id}
    >
      <div className="message-gutter">
        {grouped ? (
          <time className="hover-time" dateTime={message.createdAt}>
            {formatTime(message.createdAt, timeFormat)}
          </time>
        ) : (
          <button
            type="button"
            className="avatar-button"
            onClick={() => actions.setRightPanel({ kind: "profile", userId: message.senderId })}
            aria-label={t("messages.openProfile", { name: sender?.displayName ?? t("common.profile") })}
          >
            <Avatar user={sender} size={36} />
          </button>
        )}
      </div>

      <div className="message-content">
        {!grouped ? (
          <div className="message-head">
            <button
              type="button"
              className="sender-name"
              onClick={() => actions.setRightPanel({ kind: "profile", userId: message.senderId })}
            >
              {sender?.displayName ?? t("app.unknown")}
            </button>
            {sender?.isBot ? <span className="pill app-pill">{t("messages.app")}</span> : null}
            {unavailable ? <span className="pill unavailable-pill">{t("messages.unavailableUser")}</span> : null}
            {sender?.statusEmoji ? <EmojiValue value={`:${sender.statusEmoji}:`} /> : null}
            <time dateTime={message.createdAt} title={formatDateTime(message.createdAt, timeFormat)}>
              {formatTime(message.createdAt, timeFormat)}
            </time>
            {message.editedAt ? <span className="edited">{t("messages.edited")}</span> : null}
            {message.pinned ? (
              <span className="pill">
                <Pin size={11} /> {t("messages.pinned")}
              </span>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                const { message: updated } = await api.messages.update(message.id, toMentionWire(editText, mentions));
                actions.upsertMessage(updated);
                setEditing(false);
              } catch (error) {
                actions.fail(error);
              }
            }}
          >
            <textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              rows={Math.min(8, editText.split("\n").length + 1)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="edit-actions">
              <button type="button" className="button ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="button primary" disabled={!editText.trim()}>
                {t("common.saveChanges")}
              </button>
            </div>
          </form>
        ) : (
          <div className={isMeMessage ? "message-body is-action" : "message-body"}>
            {isPoll ? <PollMessage message={message} /> : <RichText text={message.bodyText} />}
          </div>
        )}

        {sharedId ? <SharedMessage messageId={sharedId} /> : null}

        {message.files.length > 0 ? (
          <div className="attachments">
            {message.files.map((file) =>
              file.mimeType.startsWith("image/") ? (
                <button
                  key={file.id}
                  type="button"
                  className="attachment-image"
                  aria-label={t("messages.previewFile", { name: file.name })}
                  onClick={() => setPreviewFile(file)}
                >
                  {/* Known dimensions keep the scroll position stable while images load. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
                    alt={file.name}
                    loading="lazy"
                    width={file.width ?? undefined}
                    height={file.height ?? undefined}
                  />
                </button>
              ) : (
                <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" className="attachment-file">
                  <Download size={16} />
                  <span>
                    <strong>{file.name}</strong>
                    <small>{formatBytes(file.size)}</small>
                  </span>
                </a>
              )
            )}
          </div>
        ) : null}

        {message.links.map((link) => (
          <a key={link.url} className="link-preview" href={link.url} target="_blank" rel="noopener noreferrer">
            {link.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={link.imageUrl} alt="" loading="lazy" />
            ) : null}
            <span>
              {link.siteName ? <small>{link.siteName}</small> : null}
              <strong>{link.title ?? link.url}</strong>
              {link.description ? <p>{link.description}</p> : null}
            </span>
          </a>
        ))}

        <MessageReactions message={message} />

        {context !== "thread" && message.thread.replyCount > 0 ? (
          <button type="button" className="thread-summary" onClick={() => void actions.openThread(message.id)}>
            <span className="thread-avatars">
              {message.thread.participantIds.slice(0, 4).map((id) => (
                <Avatar key={id} user={directory.get(id)} size={20} presence={false} />
              ))}
            </span>
            <span className="thread-count">
              {message.thread.replyCount} {message.thread.replyCount === 1 ? t("messages.reply") : t("messages.replies")}
            </span>
            {message.thread.lastReplyAt ? (
              <span className="thread-time">{t("messages.lastReply", { time: formatRelative(message.thread.lastReplyAt) })}</span>
            ) : null}
          </button>
        ) : null}
      </div>

      <div className="message-toolbar" role="toolbar" aria-label={t("messages.actions")}>
        <QuickReactions message={message} />
        <Popover
          width={340}
          align="end"
          trigger={({ toggle, ref }) => (
            <button type="button" ref={ref} onClick={toggle} title={t("messages.addReaction")}>
              <Smile size={16} />
            </button>
          )}
        >
          {(close) => <EmojiPicker onPick={(value) => void actions.toggleReaction(message, value)} onClose={close} />}
        </Popover>

        {context !== "thread" ? (
          <button type="button" title={t("messages.replyThread")} onClick={() => void actions.openThread(message.id)}>
            <MessageSquare size={16} />
          </button>
        ) : null}

        <button type="button" title={t("messages.share")} onClick={() => actions.setModal({ kind: "share", messageId: message.id })}>
          <Share2 size={16} />
        </button>

        <button
          type="button"
          title={message.saved ? t("messages.removeSaved") : t("messages.saveLater")}
          onClick={async () => {
            try {
              if (message.saved) await api.messages.unsave(message.id);
              else await api.messages.save(message.id);
              actions.upsertMessage({ ...message, saved: !message.saved });
            } catch (error) {
              actions.fail(error);
            }
          }}
        >
          {message.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        </button>

        <Popover
          width={230}
          align="end"
          trigger={({ toggle, ref }) => (
            <button type="button" ref={ref} onClick={toggle} title={t("messages.moreActions")}>
              <MoreVertical size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              {isAuthor ? (
                <MenuItem
                  onClick={() => {
                    if (isPoll) actions.setModal({ kind: "poll", conversationId: message.conversationId, messageId: message.id });
                    else setEditing(true);
                    close();
                  }}
                >
                  <Pencil size={14} /> {t("messages.edit")}
                </MenuItem>
              ) : null}
              <MenuItem
                onClick={async () => {
                  close();
                  try {
                    if (message.pinned) await api.messages.unpin(message.id);
                    else await api.messages.pin(message.id);
                    actions.upsertMessage({ ...message, pinned: !message.pinned });
                    actions.toast(message.pinned ? t("messages.unpinnedToast") : t("messages.pinnedToast"));
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {message.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                {message.pinned ? t("messages.unpin") : t("messages.pin")}
              </MenuItem>
              {message.thread.replyCount > 0 || context === "thread" ? (
                <MenuItem
                  onClick={async () => {
                    close();
                    const next = message.thread.following ? "muted" : "following";
                    try {
                      await api.messages.follow(message.id, next);
                      actions.upsertMessage({
                        ...message,
                        thread: { ...message.thread, following: next === "following" }
                      });
                      actions.toast(next === "following" ? t("messages.followingToast") : t("messages.mutedToast"));
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                >
                  <Bell size={14} /> {message.thread.following ? t("messages.unfollowThread") : t("messages.followThread")}
                </MenuItem>
              ) : null}
              <div className="menu-submenu">
                <span className="menu-submenu-label">
                  <Clock size={14} /> {t("messages.remindMe")}
                </span>
                <div className="menu-submenu-options">
                  {(
                    [
                      ["in 20 minutes", t("messages.in20")],
                      ["in 1 hour", t("messages.in1h")],
                      ["in 3 hours", t("messages.in3h")],
                      ["tomorrow at 9am", t("messages.tomorrow")],
                      ["next week at 9am", t("messages.nextWeek")]
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={async () => {
                        close();
                        try {
                          const { reminder } = await api.messages.remind(message.id, value);
                          actions.toast(t("messages.reminderSet", { time: new Date(reminder.remindAt).toLocaleString() }), "success");
                        } catch (error) {
                          actions.fail(error);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <MenuItem
                onClick={() => {
                  close();
                  void navigator.clipboard.writeText(message.bodyText);
                  actions.toast(t("messages.copiedText"), "success");
                }}
              >
                <Copy size={14} /> {t("messages.copyText")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  const url = `${window.location.origin}/?conversation=${message.conversationId}&message=${message.id}`;
                  void navigator.clipboard.writeText(url);
                  actions.toast(t("messages.copiedLink"), "success");
                }}
              >
                <Link2 size={14} /> {t("messages.copyLink")}
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  close();
                  await api.conversations.markUnread(message.conversationId, message.id);
                  await actions.refreshConversations();
                  actions.toast(t("messages.markedUnread"));
                }}
              >
                <MessageSquare size={14} /> {t("messages.markUnreadHere")}
              </MenuItem>
              {isAuthor || canModerate ? (
                <>
                  <MenuDivider />
                  <MenuItem
                    danger
                    onClick={async () => {
                      close();
                      if (!window.confirm(t("messages.deleteConfirm"))) return;
                      try {
                        await api.messages.remove(message.id);
                      } catch (error) {
                        actions.fail(error);
                      }
                    }}
                  >
                    <Trash2 size={14} /> {t("messages.delete")}
                  </MenuItem>
                </>
              ) : null}
            </div>
          )}
        </Popover>
      </div>
      {previewFile ? <ImagePreview file={previewFile} onClose={() => setPreviewFile(null)} /> : null}
    </article>
  );
}

function SharedMessage({ messageId }: { messageId: string }) {
  const [message, setMessage] = useState<MessageDto | null>(null);
  const directory = useDirectory();
  const { state } = useApp();
  const { t } = useI18n();
  const timeFormat = state.session?.preferences?.timeFormat ?? "12h";

  useEffect(() => {
    let cancelled = false;
    api.messages
      .thread(messageId)
      .then(({ messages }) => {
        if (!cancelled) setMessage(messages.find((entry) => entry.id === messageId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const sender = useMemo(() => (message ? directory.get(message.senderId) : undefined), [directory, message]);
  if (!message) return <div className="quoted-message is-loading">{t("messages.loadingShared")}</div>;

  return (
    <div className="quoted-message">
      <div className="quoted-head">
        <Avatar user={sender} size={20} presence={false} />
        <strong>{sender?.displayName ?? t("app.unknown")}</strong>
        <time>{formatDateTime(message.createdAt, timeFormat)}</time>
      </div>
      <RichText text={message.bodyText} />
    </div>
  );
}
