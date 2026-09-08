"use client";

import { useState } from "react";
import { Clock, HelpCircle, LogOut, Menu, Moon, Search, Settings, Smile, UserCircle } from "lucide-react";
import { useI18n } from "../../i18n";
import { useApp } from "../../store";
import { Avatar, MenuDivider, MenuItem, Popover } from "../ui/primitives";

export function TopBar() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const session = state.session;
  // The label follows what is on screen, which may be the OS theme.
  const resolvedTheme = typeof document === "undefined" ? "light" : document.documentElement.dataset.theme ?? "light";

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button
          type="button"
          className="icon-button menu-toggle"
          aria-label={t("topBar.toggleNavigation")}
          aria-expanded={state.sidebarOpen}
          onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
        >
          <Menu size={18} />
        </button>
        <span className="brand">Fluid Chat</span>
      </div>

      <form
        className="top-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) actions.setView({ kind: "search", query: query.trim() });
        }}
      >
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("topBar.searchWorkspace", { workspace: state.bootstrap?.workspace.name ?? t("app.workspace") })}
          aria-label={t("topBar.searchMessages")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
            if (event.key === "Enter" && query.trim()) {
              event.preventDefault();
              actions.setView({ kind: "search", query: query.trim() });
            }
          }}
        />
        <kbd>⌘K</kbd>
      </form>

      <div className="top-bar-right">
        <button type="button" className="icon-button" onClick={() => actions.setModal({ kind: "shortcuts" })} aria-label={t("topBar.keyboardShortcuts")}>
          <HelpCircle size={18} />
        </button>

        <Popover
          width={300}
          align="end"
          trigger={({ toggle, ref }) => (
            <button type="button" className="avatar-button" ref={ref} onClick={toggle} aria-label={t("topBar.you")}>
              <Avatar user={session ?? undefined} size={30} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              <div className="menu-heading">
                <strong>{session?.displayName}</strong>
                <span>{session?.statusText ? `${session.statusEmoji ? "" : ""} ${session.statusText}` : t("topBar.setStatus")}</span>
              </div>
              <MenuItem
                onClick={() => {
                  actions.setModal({ kind: "status" });
                  close();
                }}
              >
                <Smile size={14} /> {t("topBar.updateStatus")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void actions.setPresence(session?.presence === "away" ? "active" : "away");
                  close();
                }}
              >
                <UserCircle size={14} /> {t("topBar.setPresence", { presence: session?.presence === "away" ? t("app.active").toLowerCase() : t("app.away").toLowerCase() })}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void actions.setPresence("dnd", new Date(Date.now() + 60 * 60_000).toISOString());
                  close();
                }}
              >
                <Clock size={14} /> {t("topBar.pauseNotifications")}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  actions.setModal({ kind: "profile-editor" });
                  close();
                }}
              >
                <UserCircle size={14} /> {t("topBar.editProfile")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  actions.setModal({ kind: "preferences" });
                  close();
                }}
              >
                <Settings size={14} /> {t("common.preferences")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void actions.updatePreferences({ theme: resolvedTheme === "dark" ? "light" : "dark" });
                  close();
                }}
              >
                <Moon size={14} /> {t("topBar.switchTheme", { theme: resolvedTheme === "dark" ? t("topBar.light") : t("topBar.dark") })}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                danger
                onClick={() => {
                  void actions.signOut();
                  close();
                }}
              >
                <LogOut size={14} /> {t("auth.signOut")}
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
