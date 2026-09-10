"use client";

import { useMemo, useState } from "react";
import {
  AtSign,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Compass,
  FileText,
  FolderPlus,
  Hash,
  Inbox,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  PenSquare,
  Plus,
  Send,
  Smile,
  Trash2,
  ArrowDown,
  ArrowUp,
  Users
} from "lucide-react";
import type { ConversationSummary, PublicUser } from "@/shared/types";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { conversationTitle, useApp, useDirectory, type View } from "../../store";
import { EmojiPicker } from "../ui/emoji-picker";
import { Avatar, Badge, MenuDivider, MenuItem, Modal, Popover } from "../ui/primitives";

type RenameTarget =
  | { kind: "category"; id: string; name: string }
  | { kind: "channel"; id: string; name: string };

export function Sidebar() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const workspace = state.bootstrap?.workspace;
  const conversations = state.bootstrap?.conversations ?? [];
  const isAdmin = state.bootstrap?.role === "owner" || state.bootstrap?.role === "admin";
  const compactNavViews: View["kind"][] = ["unreads", "drafts", "saved", "files", "people"];
  const compactNavActive = compactNavViews.includes(state.view.kind);
  const compactNavCollapsed = !compactNavActive && collapsed.shortcuts !== false;

  const groups = useMemo(() => {
    const visible = conversations.filter(
      (conversation) => !conversation.membership?.hidden || conversation.unreadCount > 0
    );
    const starred = visible.filter((conversation) => conversation.membership?.starred);
    const rest = visible.filter((conversation) => !conversation.membership?.starred);
    // Channels read best alphabetically; DMs are most useful most-recent-first.
    const channels = rest
      .filter((conversation) => conversation.type === "channel")
      .sort((a, b) => (a.channel?.name ?? "").localeCompare(b.channel?.name ?? ""));
    const dms = rest
      .filter((conversation) => conversation.type !== "channel")
      .sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
    const byPosition = (fallback: (a: ConversationSummary, b: ConversationSummary) => number) => (a: ConversationSummary, b: ConversationSummary) => {
      const position = (a.membership?.position ?? 0) - (b.membership?.position ?? 0);
      if (position !== 0) return position;
      return fallback(a, b);
    };
    const byTitle = (a: ConversationSummary, b: ConversationSummary) =>
      conversationTitle(a, directory, state.session?.id).localeCompare(conversationTitle(b, directory, state.session?.id));
    const byRecent = (a: ConversationSummary, b: ConversationSummary) =>
      new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
    const sections = (state.bootstrap?.sections ?? []).map((section) => ({
      section,
      items: rest.filter((conversation) => conversation.membership?.sectionId === section.id).sort(byPosition(byTitle))
    }));
    const sectioned = new Set(sections.flatMap((entry) => entry.items.map((item) => item.id)));
    return {
      starred: starred.sort(byPosition(byTitle)),
      sections,
      channels: channels.filter((conversation) => !sectioned.has(conversation.id)).sort(byPosition(byTitle)),
      dms: dms.filter((conversation) => !sectioned.has(conversation.id)).sort(byPosition(byRecent))
    };
  }, [conversations, directory, state.bootstrap?.sections, state.session?.id]);

  const navItem = (view: View, label: string, icon: React.ReactNode, badge?: number) => {
    const active = state.view.kind === view.kind;
    return (
      <button type="button" className={`side-nav-item ${active ? "is-active" : ""}`} onClick={() => actions.setView(view)}>
        {icon}
        <span>{label}</span>
        {badge ? <Badge count={badge} mention /> : null}
      </button>
    );
  };

  return (
    <nav className="sidebar" aria-label={t("sidebar.navigation")}>
      <Popover
        width={280}
        trigger={({ toggle, ref }) => (
          <button type="button" className="workspace-button" onClick={toggle} ref={ref}>
            <span className="workspace-name">
              {workspace?.iconEmoji ? <span aria-hidden>{workspace.iconEmoji}</span> : null}
              {workspace?.name ?? t("app.workspaceFallback")}
            </span>
            <ChevronDown size={16} />
          </button>
        )}
      >
        {(close) => (
          <div className="menu">
            <div className="menu-heading">
              <strong>{workspace?.name}</strong>
              <span>{workspace?.slug}</span>
            </div>
            <MenuItem
              onClick={() => {
                actions.setModal({ kind: "invite" });
                close();
              }}
            >
              <Users size={14} /> {t("sidebar.invitePeople")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                actions.setModal({ kind: "new-channel" });
                close();
              }}
            >
              <Hash size={14} /> {t("sidebar.createChannel")}
            </MenuItem>
            {isAdmin ? (
              <MenuItem
                onClick={() => {
                  actions.setModal({ kind: "admin" });
                  close();
                }}
              >
                <MoreHorizontal size={14} /> {t("sidebar.workspaceSettings")}
              </MenuItem>
            ) : null}
            <MenuDivider />
            <div className="menu-heading">
              <span>{t("sidebar.switchWorkspace")}</span>
            </div>
            {state.memberships.map((membership) => (
              <MenuItem
                key={membership.workspace.id}
                onClick={() => {
                  void actions.selectWorkspace(membership.workspace.id);
                  close();
                }}
              >
                <span className="workspace-chip" aria-hidden>
                  {membership.workspace.name.slice(0, 1).toUpperCase()}
                </span>
                {membership.workspace.name}
              </MenuItem>
            ))}
            <MenuItem
              onClick={() => {
                actions.setModal({ kind: "create-workspace" });
                close();
              }}
            >
              <Plus size={14} /> {t("sidebar.createWorkspace")}
            </MenuItem>
          </div>
        )}
      </Popover>

      <div className="side-nav">
        {navItem({ kind: "threads" }, t("sidebar.threads"), <MessageSquare size={16} />)}
        {navItem({ kind: "activity" }, t("sidebar.activity"), <AtSign size={16} />, state.unreadNotifications)}
        <div className="side-nav-group">
          <button
            type="button"
            className="side-nav-toggle"
            onClick={() => setCollapsed((value) => ({ ...value, shortcuts: !compactNavCollapsed }))}
            aria-expanded={!compactNavCollapsed}
          >
            {compactNavCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            <span>{t("sidebar.shortcuts")}</span>
          </button>
          {!compactNavCollapsed ? (
            <div className="side-nav-group-body">
              {navItem({ kind: "unreads" }, t("sidebar.allUnreads"), <Inbox size={16} />)}
              {navItem({ kind: "drafts" }, t("sidebar.draftsSent"), <PenSquare size={16} />)}
              {navItem({ kind: "saved" }, t("sidebar.later"), <Bookmark size={16} />)}
              {navItem({ kind: "files" }, t("common.files"), <FileText size={16} />)}
              {navItem({ kind: "people" }, t("sidebar.people"), <Users size={16} />)}
            </div>
          ) : null}
        </div>
      </div>

      <div className="side-scroll">
        {groups.starred.length > 0 ? (
          <SidebarSection
            title={t("sidebar.starred")}
            collapsed={collapsed.starred}
            onToggle={() => setCollapsed((value) => ({ ...value, starred: !value.starred }))}
          >
            {groups.starred.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                siblings={groups.starred}
                onRenameChannel={setRenameTarget}
              />
            ))}
          </SidebarSection>
        ) : null}

        {groups.sections.map(({ section, items }) => (
          <SidebarSection
            key={section.id}
            title={section.name}
            collapsed={collapsed[section.id]}
            onToggle={() => setCollapsed((value) => ({ ...value, [section.id]: !value[section.id] }))}
            action={isAdmin ? <SectionMenu section={section} onRename={setRenameTarget} /> : undefined}
          >
            {items.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} siblings={items} onRenameChannel={setRenameTarget} />
            ))}
            {items.length === 0 ? <p className="side-empty">{t("sidebar.emptySection")}</p> : null}
          </SidebarSection>
        ))}

        <SidebarSection
          title={t("sidebar.channels")}
          collapsed={collapsed.channels}
          onToggle={() => setCollapsed((value) => ({ ...value, channels: !value.channels }))}
          action={
            <Popover
              width={240}
              align="end"
              trigger={({ toggle, ref }) => (
                <button type="button" className="section-action" ref={ref} onClick={toggle} aria-label={t("sidebar.addChannels")}>
                  <Plus size={14} />
                </button>
              )}
            >
              {(close) => (
                <div className="menu">
                  <MenuItem
                    onClick={() => {
                      actions.setView({ kind: "browse" });
                      close();
                    }}
                  >
                    <Compass size={14} /> {t("sidebar.browseChannels")}
                  </MenuItem>
                  {isAdmin ? (
                    <MenuItem
                      onClick={async () => {
                        const name = window.prompt(t("sidebar.categoryNamePrompt"));
                        if (!name?.trim() || !workspace) {
                          close();
                          return;
                        }
                        close();
                        try {
                          await api.workspaces.createSection(workspace.id, name.trim());
                          await actions.refreshBootstrap();
                        } catch (error) {
                          actions.fail(error);
                        }
                      }}
                    >
                      <FolderPlus size={14} /> {t("sidebar.createCategory")}
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    onClick={() => {
                      actions.setModal({ kind: "new-channel" });
                      close();
                    }}
                  >
                    <Plus size={14} /> {t("sidebar.createChannel")}
                  </MenuItem>
                </div>
              )}
            </Popover>
          }
        >
          {groups.channels.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              siblings={groups.channels}
              onRenameChannel={setRenameTarget}
            />
          ))}
          <button type="button" className="side-row is-muted" onClick={() => actions.setView({ kind: "browse" })}>
            <Plus size={15} />
            <span className="side-label">{t("sidebar.addChannels")}</span>
          </button>
        </SidebarSection>

        <SidebarSection
          title={t("sidebar.directMessages")}
          collapsed={collapsed.dms}
          onToggle={() => setCollapsed((value) => ({ ...value, dms: !value.dms }))}
          action={
            <button
              type="button"
              className="section-action"
              onClick={() => actions.setModal({ kind: "new-dm" })}
              aria-label={t("sidebar.newDirectMessage")}
            >
              <Plus size={14} />
            </button>
          }
        >
          {groups.dms.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} siblings={groups.dms} onRenameChannel={setRenameTarget} />
          ))}
          {groups.dms.length === 0 ? (
            <button type="button" className="side-row is-muted" onClick={() => actions.setModal({ kind: "new-dm" })}>
              <Send size={15} />
              <span className="side-label">{t("sidebar.startConversation")}</span>
            </button>
          ) : null}
        </SidebarSection>
      </div>

      {state.session ? (
        <div className="sidebar-footer">
          <Avatar user={state.session} size={26} />
          <span className="side-label">{state.session.displayName}</span>
          {!state.connected ? <span className="connection-dot" title={t("sidebar.reconnecting")} /> : null}
        </div>
      ) : null}

      {renameTarget ? (
        <RenameSidebarItemModal
          key={`${renameTarget.kind}:${renameTarget.id}`}
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
        />
      ) : null}
    </nav>
  );
}

function SectionMenu({ section, onRename }: { section: { id: string; name: string }; onRename: (target: RenameTarget) => void }) {
  const { actions } = useApp();
  const { t } = useI18n();

  return (
    <Popover
      width={240}
      align="end"
      trigger={({ toggle, ref }) => (
        <button type="button" className="section-action" ref={ref} onClick={toggle} aria-label={t("sidebar.categoryOptions", { title: section.name })}>
          <MoreHorizontal size={14} />
        </button>
      )}
    >
      {(close) => (
        <div className="menu">
          <MenuItem
            onClick={() => {
              close();
              onRename({ kind: "category", id: section.id, name: section.name });
            }}
          >
            <Pencil size={14} /> {t("sidebar.renameCategory")}
          </MenuItem>
          <MenuItem
            danger
            onClick={async () => {
              if (!window.confirm(t("sidebar.deleteCategoryConfirm", { title: section.name }))) return;
              close();
              try {
                await api.workspaces.deleteSection(section.id);
                await actions.refreshBootstrap();
              } catch (error) {
                actions.fail(error);
              }
            }}
          >
            <Trash2 size={14} /> {t("sidebar.deleteCategory")}
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

function SidebarSection({
  title,
  children,
  collapsed,
  onToggle,
  action
}: {
  title: string;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <section className="side-section">
      <div className="side-section-head">
        <button type="button" onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {title}
        </button>
        {action}
      </div>
      {!collapsed ? <div className="side-section-body">{children}</div> : null}
    </section>
  );
}

function ConversationRow({
  conversation,
  siblings,
  onRenameChannel
}: {
  conversation: ConversationSummary;
  siblings: ConversationSummary[];
  onRenameChannel: (target: RenameTarget) => void;
}) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const isAdmin = state.bootstrap?.role === "owner" || state.bootstrap?.role === "admin";
  const active = state.view.kind === "conversation" && state.view.conversationId === conversation.id;
  const unread = conversation.unreadCount > 0;
  const title = sidebarConversationTitle(conversation, directory, state.session?.id);
  const otherId = conversation.memberIds.find((id) => id !== state.session?.id);
  const other = conversation.type === "dm" && otherId ? directory.get(otherId) : undefined;
  const draft = state.drafts[`${conversation.id}:root`];
  const canManageWorkspacePlacement = isAdmin && conversation.type === "channel";
  const currentIndex = siblings.findIndex((item) => item.id === conversation.id);
  const move = async (direction: -1 | 1) => {
    const nextIndex = currentIndex + direction;
    const target = siblings[nextIndex];
    if (!target) return;
    try {
      await Promise.all([
        api.conversations.updateMembership(conversation.id, { position: nextIndex * 1000 }),
        api.conversations.updateMembership(target.id, { position: currentIndex * 1000 })
      ]);
      await actions.refreshBootstrap();
    } catch (error) {
      actions.fail(error);
    }
  };

  return (
    <div className={`side-row-wrap ${active ? "is-active" : ""}`}>
      <button
        type="button"
        className={`side-row ${unread ? "is-unread" : ""}`}
        onClick={() => void actions.openConversation(conversation.id)}
      >
        {conversation.channel ? (
          conversation.channel.visibility === "private" ? (
            <Lock size={14} />
          ) : (
            <Hash size={15} />
          )
        ) : conversation.type === "group_dm" ? (
          <Users size={15} />
        ) : (
          <Avatar user={other} size={20} />
        )}
        <span className="side-label">{title}</span>
        {draft?.trim() ? <span className="draft-dot" title={t("sidebar.unsentDraft")} /> : null}
        {conversation.mentionCount > 0 ? (
          <Badge count={conversation.mentionCount} mention />
        ) : conversation.unreadCount > 0 ? (
          <Badge count={conversation.unreadCount} />
        ) : null}
      </button>

      <Popover
        width={240}
        align="end"
        trigger={({ toggle, ref }) => (
          <button type="button" className="side-row-menu" ref={ref} onClick={toggle} aria-label={t("sidebar.optionsFor", { title })}>
            <MoreHorizontal size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="menu">
            <MenuItem
              onClick={async () => {
                close();
                await api.conversations.updateMembership(conversation.id, {
                  starred: !conversation.membership?.starred
                });
                await actions.refreshConversations();
              }}
            >
              {conversation.membership?.starred ? t("sidebar.removeFromStarred") : t("sidebar.starConversation")}
            </MenuItem>
            <MenuItem
              onClick={async () => {
                close();
                await api.conversations.updateMembership(conversation.id, { muted: !conversation.membership?.muted });
                await actions.refreshConversations();
              }}
            >
              {conversation.membership?.muted ? t("sidebar.unmuteConversation") : t("sidebar.muteConversation")}
            </MenuItem>
            <MenuItem
              onClick={async () => {
                close();
                await api.conversations.markRead(conversation.id);
                await actions.refreshConversations();
              }}
            >
              {t("sidebar.markAsRead")}
            </MenuItem>
            <MenuItem
              onClick={async () => {
                close();
                await api.conversations.markUnread(conversation.id);
                await actions.refreshConversations();
              }}
            >
              {t("sidebar.markAsUnread")}
            </MenuItem>
            {canManageWorkspacePlacement && state.bootstrap?.sections.length ? <MenuDivider /> : null}
            {canManageWorkspacePlacement
              ? state.bootstrap?.sections.map((section) => (
                  <MenuItem
                    key={section.id}
                    onClick={async () => {
                      close();
                      await api.conversations.updateMembership(conversation.id, { sectionId: section.id, position: Date.now() % 1_000_000 });
                      await actions.refreshBootstrap();
                    }}
                  >
                    {t("sidebar.moveTo", { section: section.name })}
                  </MenuItem>
                ))
              : null}
            {canManageWorkspacePlacement && conversation.membership?.sectionId ? (
              <MenuItem
                onClick={async () => {
                  close();
                  await api.conversations.updateMembership(conversation.id, { sectionId: null });
                  await actions.refreshBootstrap();
                }}
              >
                {t("sidebar.removeFromCategory")}
              </MenuItem>
            ) : null}
            {canManageWorkspacePlacement ? <MenuDivider /> : null}
            {canManageWorkspacePlacement ? (
              <>
                <MenuItem
                  disabled={currentIndex <= 0}
                  onClick={async () => {
                    close();
                    await move(-1);
                  }}
                >
                  <ArrowUp size={14} /> {t("sidebar.moveUp")}
                </MenuItem>
                <MenuItem
                  disabled={currentIndex < 0 || currentIndex >= siblings.length - 1}
                  onClick={async () => {
                    close();
                    await move(1);
                  }}
                >
                  <ArrowDown size={14} /> {t("sidebar.moveDown")}
                </MenuItem>
              </>
            ) : null}
            {canManageWorkspacePlacement ? <MenuDivider /> : null}
            {isAdmin && conversation.type === "channel" && conversation.channel ? (
              <MenuItem
                onClick={() => {
                  close();
                  onRenameChannel({ kind: "channel", id: conversation.channel!.id, name: conversation.channel!.name });
                }}
              >
                <Pencil size={14} /> {t("sidebar.renameChannel")}
              </MenuItem>
            ) : null}
            {conversation.type === "channel" && conversation.channel ? (
              <MenuItem
                danger
                onClick={async () => {
                  close();
                  try {
                    await api.channels.leave(conversation.channel!.id);
                    await actions.refreshBootstrap();
                  } catch (error) {
                    actions.fail(error);
                  }
                }}
              >
                {t("sidebar.leaveChannel")}
              </MenuItem>
            ) : (
              <MenuItem
                onClick={async () => {
                  close();
                  await api.conversations.updateMembership(conversation.id, { hidden: true });
                  await actions.refreshConversations();
                }}
              >
                {t("sidebar.closeConversation")}
              </MenuItem>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}

function sidebarConversationTitle(
  conversation: ConversationSummary,
  directory: Map<string, PublicUser>,
  currentUserId?: string
) {
  if (conversation.channel) return conversation.channel.name;
  if (conversation.name) return conversation.name;
  const others = conversation.memberIds.filter((id) => id !== currentUserId);
  if (others.length === 0) return "You";
  const identifiers = others.map((id) => {
    const user = directory.get(id);
    return user?.handle ? `@${user.handle}` : user?.displayName ?? "Someone";
  });
  if (identifiers.length <= 3) return identifiers.join(", ");
  return `${identifiers.slice(0, 3).join(", ")} +${identifiers.length - 3}`;
}

function RenameSidebarItemModal({ target, onClose }: { target: RenameTarget; onClose: () => void }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState(target.name);
  const [busy, setBusy] = useState(false);
  const title = target.kind === "channel" ? t("sidebar.renameChannel") : t("sidebar.renameCategory");
  const trimmed = name.trim();

  const insertEmoji = (value: string) => {
    setName((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${value}`);
  };

  const submit = async () => {
    if (!trimmed || trimmed === target.name || busy) return;
    setBusy(true);
    try {
      if (target.kind === "channel") {
        await api.channels.update(target.id, { name: trimmed });
      } else {
        await api.workspaces.updateSection(target.id, { name: trimmed });
      }
      await actions.refreshBootstrap();
      onClose();
    } catch (error) {
      actions.fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="button primary" onClick={() => void submit()} disabled={!trimmed || busy}>
            {t("common.saveChanges")}
          </button>
        </>
      }
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          {t("sidebar.displayName")}
          <div className="inline-field">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />
            <Popover
              width={360}
              align="end"
              trigger={({ toggle, ref }) => (
                <button type="button" className="icon-button" ref={ref} onClick={toggle} aria-label={t("sidebar.insertEmoji")}>
                  <Smile size={18} />
                </button>
              )}
            >
              {(close) => <EmojiPicker onPick={insertEmoji} onClose={close} />}
            </Popover>
          </div>
        </label>
        <p className="notice">
          {target.kind === "channel" ? <Hash size={14} aria-hidden /> : <span aria-hidden>▾</span>}
          <strong>{trimmed || target.name}</strong>
        </p>
      </form>
    </Modal>
  );
}
