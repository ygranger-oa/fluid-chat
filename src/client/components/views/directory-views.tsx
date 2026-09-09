"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Hash, Lock, Search } from "lucide-react";
import type { ChannelSummary, FileSummary, MessageDto } from "@/shared/types";
import { api } from "../../api";
import { track } from "../../analytics";
import { formatBytes, formatRelative } from "../../format";
import { useI18n } from "../../i18n";
import { useApp, useDirectory } from "../../store";
import { Avatar, EmptyState, Spinner } from "../ui/primitives";
import { MessageItem } from "../message/message-item";
import { HighlightProvider } from "../message/rich-text";

type DirectoryChannel = ChannelSummary & { conversationId: string; joined: boolean };

export function BrowseChannelsView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [channels, setChannels] = useState<DirectoryChannel[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "joined" | "unjoined" | "archived">("all");

  useEffect(() => {
    if (!state.workspaceId) return;
    api.channels
      .list(state.workspaceId, { includeArchived: filter === "archived" })
      .then(({ channels: list }) => setChannels(list))
      .catch(() => setChannels([]));
  }, [state.workspaceId, filter]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (channels ?? [])
      .filter((channel) => (term ? channel.name.includes(term) || channel.description?.toLowerCase().includes(term) : true))
      .filter((channel) => {
        if (filter === "joined") return channel.joined;
        if (filter === "unjoined") return !channel.joined;
        if (filter === "archived") return !!channel.archivedAt;
        return !channel.archivedAt;
      });
  }, [channels, filter, query]);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>{t("sidebar.channels")}</h1>
          <p>{t("views.channelsCount", { count: visible.length })}</p>
        </div>
        <button type="button" className="button primary" onClick={() => actions.setModal({ kind: "new-channel" })}>
          {t("views.createChannel")}
        </button>
      </header>

      <div className="view-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("views.searchChannels")} />
        </div>
        <div className="view-filters">
          {(["all", "joined", "unjoined", "archived"] as const).map((entry) => (
            <button key={entry} type="button" className={filter === entry ? "is-active" : ""} onClick={() => setFilter(entry)}>
              {entry === "all" ? t("common.all") : entry === "joined" ? t("views.myChannels") : entry === "unjoined" ? t("views.notJoined") : t("views.archivedFilter")}
            </button>
          ))}
        </div>
      </div>

      <div className="view-scroll">
        {!channels ? (
          <Spinner label={t("views.loadingChannels")} />
        ) : visible.length === 0 ? (
          <EmptyState title={t("views.noChannelsFound")} body={t("views.noChannelsFoundBody")} />
        ) : (
          visible.map((channel) => (
            <div key={channel.id} className="channel-row">
              <button type="button" className="channel-row-main" onClick={() => void actions.openConversation(channel.conversationId)}>
                <span className="channel-row-name">
                  {channel.visibility === "private" ? <Lock size={14} /> : <Hash size={15} />}
                  {channel.name}
                  {channel.archivedAt ? <span className="pill">{t("views.archived")}</span> : null}
                </span>
                <span className="channel-row-meta">
                  {t("views.membersCount", { count: channel.memberCount ?? 0 })}
                  {channel.description ? ` · ${channel.description}` : ""}
                </span>
              </button>
              {channel.joined ? (
                <span className="pill">{t("views.joined")}</span>
              ) : (
                <button
                  type="button"
                  className="button ghost"
                  onClick={async () => {
                    try {
                      await api.channels.join(channel.id);
                      await actions.refreshBootstrap();
                      await actions.openConversation(channel.conversationId);
                    } catch (error) {
                      actions.fail(error);
                    }
                  }}
                >
                  {t("common.join")}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function PeopleView() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const members = (state.bootstrap?.members ?? []).filter((member) => member.status === "active");

  const visible = members.filter((member) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return `${member.user.displayName} ${member.user.handle ?? ""} ${member.user.title ?? ""}`
      .toLowerCase()
      .includes(term);
  });

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>{t("sidebar.people")}</h1>
          <p>{t("views.peopleCount", { count: members.length })}</p>
        </div>
        <button type="button" className="button primary" onClick={() => actions.setModal({ kind: "invite" })}>
          {t("sidebar.invitePeople")}
        </button>
      </header>

      <div className="view-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("views.searchPeople")} />
        </div>
      </div>

      <div className="people-grid">
        {visible.map((member) => (
          <button
            key={member.user.id}
            type="button"
            className="person-card"
            onClick={() => actions.setRightPanel({ kind: "profile", userId: member.user.id })}
          >
            <Avatar user={member.user} size={56} />
            <strong>{member.user.displayName}</strong>
            <span>{member.user.title ?? (member.role === "owner" ? t("views.workspaceOwner") : member.role)}</span>
            {member.user.statusText ? <small>{member.user.statusText}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function FilesView() {
  const { state } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const [files, setFiles] = useState<FileSummary[] | null>(null);

  useEffect(() => {
    if (!state.workspaceId) return;
    api.activity
      .files(state.workspaceId)
      .then(({ files: list }) => setFiles(list))
      .catch(() => setFiles([]));
  }, [state.workspaceId]);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>{t("common.files")}</h1>
          <p>{t("views.filesSubtitle")}</p>
        </div>
      </header>
      <div className="view-scroll">
        {!files ? (
          <Spinner label={t("views.loadingFiles")} />
        ) : files.length === 0 ? (
          <EmptyState title={t("views.noFiles")} body={t("views.noFilesBody")} />
        ) : (
          <div className="file-grid wide">
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
                  <small>
                    {formatBytes(file.size)} · {directory.get(file.uploaderId)?.displayName ?? t("app.someone")} ·{" "}
                    {formatRelative(file.createdAt)}
                  </small>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function SearchView({ query }: { query: string }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [term, setTerm] = useState(query);
  // Highlight the free-text words, not the operator tokens.
  const highlightTerms = useMemo(
    () =>
      term
        .split(/\s+/)
        .filter((word) => word && !/^\w+:/.test(word))
        .map((word) => word.replace(/^["']|["']$/g, "")),
    [term]
  );
  const [sort, setSort] = useState<"recent" | "relevant">("recent");
  const [results, setResults] = useState<Array<{ message: MessageDto; conversationId: string; channelName: string | null }> | null>(
    null
  );

  useEffect(() => setTerm(query), [query]);

  useEffect(() => {
    if (!state.workspaceId || !term.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setResults(null);
    api.activity
      .search(state.workspaceId, term, sort)
      .then(({ results: list }) => {
        if (cancelled) return;
        setResults(list);
        // Only the committed query counts as a search. `term` changes on every keystroke,
        // so tracking unconditionally here would emit one event per character typed.
        if (term === query) {
          track("search_performed", { sort, query_length: term.trim().length, result_count: list.length });
        }
      })
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [state.workspaceId, term, sort, query]);

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>{t("views.searchTitle")}</h1>
          <p>
            {t("views.searchOperators")} <code>in:#channel</code> <code>from:@person</code> <code>has:file</code> <code>before:2026-01-01</code>
          </p>
        </div>
      </header>

      <div className="view-toolbar">
        <form
          className="search-field grow"
          onSubmit={(event) => {
            event.preventDefault();
            actions.setView({ kind: "search", query: term });
          }}
        >
          <Search size={15} />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t("topBar.searchMessages")} autoFocus />
        </form>
        <div className="view-filters">
          {(["recent", "relevant"] as const).map((entry) => (
            <button key={entry} type="button" className={sort === entry ? "is-active" : ""} onClick={() => setSort(entry)}>
              {entry === "recent" ? t("views.mostRecent") : t("views.mostRelevant")}
            </button>
          ))}
        </div>
      </div>

      <div className="view-scroll">
        {!results ? (
          <Spinner label={t("common.searching")} />
        ) : results.length === 0 ? (
          <EmptyState title={t("views.noMatches")} body={t("views.noMatchesBody")} />
        ) : (
          <HighlightProvider terms={highlightTerms}>
            {results.map((result) => (
              <div key={result.message.id} className="search-result">
                <button
                  type="button"
                  className="search-result-head"
                  onClick={() => void actions.openConversation(result.conversationId)}
                >
                  {result.channelName ? `#${result.channelName}` : t("app.directMessage")}
                  <time>{formatRelative(result.message.createdAt)}</time>
                </button>
                <MessageItem message={result.message} context="list" />
              </div>
            ))}
          </HighlightProvider>
        )}
      </div>
    </section>
  );
}
