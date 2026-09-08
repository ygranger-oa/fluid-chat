"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  FileText,
  Hash,
  Info,
  Lock,
  Pin,
  Plus,
  Star,
  UserPlus,
  Users
} from "lucide-react";
import type { BookmarkDto } from "@/shared/types";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { conversationTitle, useApp, useDirectory } from "../../store";
import { Avatar, IconButton, MenuDivider, MenuItem, Popover } from "../ui/primitives";
import { Composer } from "../message/composer";
import { MessageList } from "../message/message-list";

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const conversation = state.bootstrap?.conversations.find((entry) => entry.id === conversationId);
  const channel = conversation?.channel;
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
  const title = conversationTitle(conversation ?? null, directory, state.session?.id);
  const joined = conversation?.membership?.joined ?? false;
  const dmPartnerId =
    conversation?.type === "dm" ? conversation.memberIds.find((id) => id !== state.session?.id) : undefined;

  useEffect(() => {
    if (!channel) {
      setBookmarks([]);
      return;
    }
    api.channels
      .bookmarks(channel.id)
      .then(({ bookmarks: list }) => setBookmarks(list))
      .catch(() => setBookmarks([]));
  }, [channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!conversation) {
    return (
      <section className="conversation">
        <div className="conversation-empty">{t("conversation.unavailable")}</div>
      </section>
    );
  }

  const memberAvatars = conversation.memberIds.slice(0, 4);

  return (
    <section className="conversation">
      <header className="conversation-header">
        <div className="conversation-title">
          <h1>
            {channel ? (
              channel.visibility === "private" ? (
                <Lock size={16} />
              ) : (
                <Hash size={18} />
              )
            ) : dmPartnerId ? (
              <Avatar user={directory.get(dmPartnerId)} size={22} />
            ) : (
              <Users size={16} />
            )}
            {title}
          </h1>
          <button
            type="button"
            className={`star-toggle ${conversation.membership?.starred ? "is-on" : ""}`}
            aria-label={conversation.membership?.starred ? t("conversation.unstar") : t("conversation.star")}
            onClick={async () => {
              await api.conversations.updateMembership(conversationId, { starred: !conversation.membership?.starred });
              await actions.refreshConversations();
            }}
          >
            <Star size={14} />
          </button>
          {channel?.topic ? (
            <button
              type="button"
              className="conversation-topic"
              onClick={() => actions.setRightPanel({ kind: "details", conversationId })}
            >
              {channel.topic}
            </button>
          ) : channel ? (
            <button
              type="button"
              className="conversation-topic is-empty"
              onClick={() => actions.setRightPanel({ kind: "details", conversationId })}
            >
              {t("conversation.addTopic")}
            </button>
          ) : null}
        </div>

        <div className="conversation-actions">
          <button
            type="button"
            className="member-facepile"
            onClick={() => actions.setRightPanel({ kind: "details", conversationId })}
            aria-label={t("conversation.memberCount", { count: conversation.memberIds.length })}
          >
            {memberAvatars.map((id) => (
              <Avatar key={id} user={directory.get(id)} size={22} presence={false} />
            ))}
            <span>{conversation.memberIds.length}</span>
          </button>

          <label className="jump-date" title={t("conversation.jumpDate")}>
            <CalendarDays size={17} />
            <span className="sr-only">{t("conversation.jumpDate")}</span>
            <input
              type="date"
              onChange={(event) => {
                if (event.target.value) void actions.jumpToDate(conversationId, event.target.value);
              }}
            />
          </label>

          <IconButton label={t("conversation.pinnedMessages")} onClick={() => actions.setRightPanel({ kind: "pins", conversationId })}>
            <Pin size={17} />
          </IconButton>
          <IconButton label={t("common.files")} onClick={() => actions.setRightPanel({ kind: "files", conversationId })}>
            <FileText size={17} />
          </IconButton>
          <IconButton
            label={conversation.membership?.muted ? t("conversation.unmute") : t("conversation.mute")}
            onClick={async () => {
              await api.conversations.updateMembership(conversationId, { muted: !conversation.membership?.muted });
              await actions.refreshConversations();
            }}
          >
            {conversation.membership?.muted ? <BellOff size={17} /> : <Bell size={17} />}
          </IconButton>
          {channel ? (
            <IconButton label={t("conversation.addPeople")} onClick={() => actions.setModal({ kind: "add-people", conversationId })}>
              <UserPlus size={17} />
            </IconButton>
          ) : null}
          <IconButton label={t("conversation.details")} onClick={() => actions.setRightPanel({ kind: "details", conversationId })}>
            <Info size={17} />
          </IconButton>
        </div>
      </header>

      {channel ? (
        <div className="bookmark-bar">
          {bookmarks.map((bookmark) => (
            <a key={bookmark.id} href={bookmark.url} target="_blank" rel="noopener noreferrer" className="bookmark">
              {bookmark.emoji ? <span aria-hidden>{bookmark.emoji}</span> : null}
              {bookmark.title}
            </a>
          ))}
          <Popover
            width={320}
            trigger={({ toggle, ref }) => (
              <button type="button" className="bookmark add" ref={ref} onClick={toggle}>
                <Plus size={13} /> {t("conversation.addBookmark")}
              </button>
            )}
          >
            {(close) => (
              <form
                className="stack-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    const { bookmark } = await api.channels.addBookmark(channel.id, {
                      title: String(form.get("title")),
                      url: String(form.get("url"))
                    });
                    setBookmarks((current) => [...current, bookmark]);
                    close();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                <label>
                  {t("common.title")}
                  <input name="title" required maxLength={120} placeholder={t("conversation.runbook")} />
                </label>
                <label>
                  {t("common.link")}
                  <input name="url" type="url" required placeholder="https://" />
                </label>
                <button className="button primary" type="submit">
                  {t("conversation.addBookmarkSubmit")}
                </button>
              </form>
            )}
          </Popover>
        </div>
      ) : null}

      <MessageList conversationId={conversationId} />

      {channel?.archivedAt ? (
        <div className="composer-locked">
          {t("conversation.archivedReadOnly")}
          {state.bootstrap?.role !== "member" ? (
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                await api.channels.unarchive(channel.id);
                await actions.refreshBootstrap();
              }}
            >
              {t("conversation.unarchive")}
            </button>
          ) : null}
        </div>
      ) : !joined && channel ? (
        <div className="composer-locked">
          {t("conversation.previewing", { channel: channel.name })}
          <button
            type="button"
            className="button primary"
            onClick={async () => {
              try {
                await api.channels.join(channel.id);
                await actions.refreshBootstrap();
                await actions.openConversation(conversationId);
              } catch (error) {
                actions.fail(error);
              }
            }}
          >
            {t("conversation.joinChannel")}
          </button>
        </div>
      ) : (
        <Composer
          conversationId={conversationId}
          placeholder={channel ? t("conversation.messageChannel", { channel: channel.name }) : t("conversation.messageConversation", { title })}
        />
      )}
    </section>
  );
}

export function ConversationMenuItems({ conversationId }: { conversationId: string }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const conversation = state.bootstrap?.conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return null;
  return (
    <>
      <MenuItem onClick={() => actions.setRightPanel({ kind: "details", conversationId })}>{t("conversation.openDetails")}</MenuItem>
      <MenuDivider />
      <MenuItem
        onClick={async () => {
          await api.conversations.updateMembership(conversationId, {
            notificationLevel: conversation.membership?.notificationLevel === "all" ? "mentions" : "all"
          });
          await actions.refreshConversations();
        }}
      >
        {t("conversation.notifyAbout", {
          level: conversation.membership?.notificationLevel === "all" ? t("conversation.mentionsOnlyLower") : t("conversation.everyMessageLower")
        })}
      </MenuItem>
    </>
  );
}
