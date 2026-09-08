"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Hash, Lock } from "lucide-react";
import { api } from "../../api";
import { track } from "../../analytics";
import { EMOJI_CATEGORIES } from "../../emoji";
import { useI18n } from "../../i18n";
import { conversationTitle, useApp, useDirectory } from "../../store";
import { Avatar, Modal } from "../ui/primitives";
import { RichText } from "../message/rich-text";

/* -------------------------------------------------------------------------- */
/* Invite                                                                      */
/* -------------------------------------------------------------------------- */

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "guest">("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      title={t("modals.invitePeopleTo", { workspace: state.bootstrap?.workspace.name ?? t("app.workspace") })}
      onClose={onClose}
      footer={
        <button type="button" className="button ghost" onClick={onClose}>
          {t("modals.done")}
        </button>
      }
    >
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!state.workspaceId) return;
          const list = emails
            .split(/[\s,;]+/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (list.length === 0) return;
          try {
            const { invites, skipped } = await api.invites.send(state.workspaceId, list, role);
            track("invites_sent", { count: invites.length, skipped_count: skipped.length, role });
            setSent(invites.map((invite) => invite.inviteUrl));
            setEmails("");
            actions.toast(
              t("modals.invitesSent", { count: invites.length, skipped: skipped.length ? t("modals.alreadyPending", { count: skipped.length }) : "" }),
              "success"
            );
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        <label className="field">
          {t("modals.emailAddresses")}
          <textarea
            value={emails}
            onChange={(event) => setEmails(event.target.value)}
            rows={3}
            placeholder="ada@example.com, grace@example.com"
          />
        </label>
        <label className="field">
          {t("modals.role")}
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="member">{t("modals.roleMember")}</option>
            <option value="admin">{t("modals.roleAdmin")}</option>
            <option value="guest">{t("modals.roleGuest")}</option>
          </select>
        </label>
        <button type="submit" className="button primary">
          {t("modals.sendInvitations")}
        </button>
      </form>

      {sent.length > 0 ? (
        <div className="invite-links">
          <h4>{t("modals.invitationLinks")}</h4>
          {sent.map((link) => (
            <code key={link}>{link}</code>
          ))}
        </div>
      ) : null}

      <div className="modal-section">
        <h4>{t("modals.shareInviteLink")}</h4>
        <p className="muted">{t("modals.inviteLinkHint")}</p>
        {inviteLink ? (
          <div className="copy-row">
            <code>{inviteLink}</code>
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                void navigator.clipboard.writeText(inviteLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              if (!state.workspaceId) return;
              try {
                const { inviteUrl } = await api.invites.createLink(state.workspaceId, { expiresInDays: 30 });
                track("invite_link_created", {});
                setInviteLink(inviteUrl);
              } catch (error) {
                actions.fail(error);
              }
            }}
          >
            {t("modals.createInviteLink")}
          </button>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* New channel                                                                 */
/* -------------------------------------------------------------------------- */

export function NewChannelModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={t("modals.createChannel")} onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!state.workspaceId || busy) return;
          setBusy(true);
          try {
            const { conversationId } = await api.channels.create(state.workspaceId, {
              name,
              visibility,
              description: description || undefined
            });
            track("channel_created", { visibility, has_description: description.trim().length > 0 });
            await actions.refreshBootstrap();
            await actions.openConversation(conversationId);
            onClose();
          } catch (error) {
            actions.fail(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {t("modals.name")}
          <div className="prefixed-input">
            <span>{visibility === "private" ? <Lock size={14} /> : <Hash size={15} />}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="plan-budget"
              required
              maxLength={80}
              autoFocus
            />
          </div>
        </label>
        <label className="field">
          {t("panels.description")} <span className="optional">{t("modals.optional")}</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("panels.description")}
            maxLength={500}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={visibility === "private"}
            onChange={(event) => setVisibility(event.target.checked ? "private" : "public")}
          />
          <span>
            <strong>{t("modals.makePrivate")}</strong>
            <small>{t("modals.makePrivateHint")}</small>
          </span>
        </label>
        <button type="submit" className="button primary" disabled={!name.trim() || busy}>
          {t("views.createChannel")}
        </button>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* New direct message                                                          */
/* -------------------------------------------------------------------------- */

export function NewDmModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const members = (state.bootstrap?.members ?? []).filter((member) => member.user.id !== state.session?.id);
  const visible = members.filter((member) =>
    `${member.user.displayName} ${member.user.handle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Modal
      title={t("modals.newMessage")}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="button primary"
          disabled={selected.length === 0}
          onClick={async () => {
            if (!state.workspaceId) return;
            try {
              const { conversation } = await api.conversations.openDm(state.workspaceId, selected);
              track("dm_started", { participant_count: selected.length });
              await actions.refreshBootstrap();
              await actions.openConversation(conversation.id);
              onClose();
            } catch (error) {
              actions.fail(error);
            }
          }}
        >
          {t("sidebar.startConversation")}
        </button>
      }
    >
      <div className="chips">
        {selected.map((id) => {
          const member = members.find((entry) => entry.user.id === id);
          return (
            <button key={id} type="button" className="chip" onClick={() => setSelected((current) => current.filter((entry) => entry !== id))}>
              {member?.user.displayName} ✕
            </button>
          );
        })}
      </div>
      <input
        className="modal-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("modals.searchPeople")}
        autoFocus
      />
      <div className="picker-list">
        {visible.map((member) => (
          <button
            key={member.user.id}
            type="button"
            className={selected.includes(member.user.id) ? "is-selected" : ""}
            onClick={() =>
              setSelected((current) =>
                current.includes(member.user.id)
                  ? current.filter((entry) => entry !== member.user.id)
                  : [...current, member.user.id]
              )
            }
          >
            <Avatar user={member.user} size={28} />
            <span>
              <strong>{member.user.displayName}</strong>
              <small>{member.user.title ?? member.user.email}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Add people to a channel                                                     */
/* -------------------------------------------------------------------------- */

export function AddPeopleModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const conversation = state.bootstrap?.conversations.find((entry) => entry.id === conversationId);
  const channel = conversation?.channel;

  const candidates = (state.bootstrap?.members ?? []).filter(
    (member) => !conversation?.memberIds.includes(member.user.id)
  );
  const visible = candidates.filter((member) =>
    `${member.user.displayName} ${member.user.handle ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Modal
      title={channel ? t("modals.addPeopleToChannel", { channel: channel.name }) : t("modals.addPeople")}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="button primary"
          disabled={selected.length === 0 || !channel}
          onClick={async () => {
            if (!channel) return;
            try {
              await api.channels.addMembers(channel.id, selected);
              await actions.refreshBootstrap();
              actions.toast(t("modals.addedPeople", { count: selected.length, label: selected.length === 1 ? t("modals.person") : t("modals.people") }), "success");
              onClose();
            } catch (error) {
              actions.fail(error);
            }
          }}
        >
          {t("modals.add")}
        </button>
      }
    >
      {!channel ? (
        <p className="muted">{t("modals.addPeopleChannelsOnly")}</p>
      ) : (
        <>
          <div className="chips">
            {selected.map((id) => {
              const member = candidates.find((entry) => entry.user.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  onClick={() => setSelected((current) => current.filter((entry) => entry !== id))}
                >
                  {member?.user.displayName} ✕
                </button>
              );
            })}
          </div>
          <input
            className="modal-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("modals.searchPeople")}
            autoFocus
          />
          <div className="picker-list">
            {visible.map((member) => (
              <button
                key={member.user.id}
                type="button"
                className={selected.includes(member.user.id) ? "is-selected" : ""}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(member.user.id)
                      ? current.filter((entry) => entry !== member.user.id)
                      : [...current, member.user.id]
                  )
                }
              >
                <Avatar user={member.user} size={28} />
                <span>
                  <strong>{member.user.displayName}</strong>
                  <small>{member.user.title ?? member.user.email}</small>
                </span>
              </button>
            ))}
            {visible.length === 0 ? <p className="muted">{t("modals.everyoneAlreadyHere")}</p> : null}
          </div>
        </>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

const STATUS_PRESETS = [
  { emoji: "calendar", text: "In a meeting", minutes: 60 },
  { emoji: "bus", text: "Commuting", minutes: 30 },
  { emoji: "face_with_thermometer", text: "Out sick", minutes: 60 * 24 },
  { emoji: "beach_umbrella", text: "Vacationing", minutes: 60 * 24 * 7 },
  { emoji: "house", text: "Working remotely", minutes: 60 * 8 }
];

export function StatusModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [emoji, setEmoji] = useState(state.session?.statusEmoji ?? "speech_balloon");
  const [text, setText] = useState(state.session?.statusText ?? "");
  const [minutes, setMinutes] = useState<number | null>(null);

  const emojiOptions = useMemo(
    () => EMOJI_CATEGORIES.flatMap((category) => category.emoji.slice(0, 12).map(([name, char]) => ({ name, char }))),
    []
  );

  return (
    <Modal
      title={t("modals.setStatus")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              await actions.setStatus({ emoji: null, text: null, expiresAt: null });
              onClose();
            }}
          >
            {t("modals.clearStatus")}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={async () => {
              await actions.setStatus({
                emoji,
                text: text || null,
                expiresAt: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null
              });
              onClose();
            }}
          >
            {t("modals.save")}
          </button>
        </>
      }
    >
      <div className="status-row">
        <select value={emoji} onChange={(event) => setEmoji(event.target.value)} aria-label={t("modals.statusEmoji")}>
          {emojiOptions.map((option) => (
            <option key={option.name} value={option.name}>
              {option.char} :{option.name}:
            </option>
          ))}
        </select>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={t("modals.statusPlaceholder")} maxLength={140} />
      </div>

      <label className="field">
        {t("modals.clearAfter")}
        <select value={minutes ?? ""} onChange={(event) => setMinutes(event.target.value ? Number(event.target.value) : null)}>
          <option value="">{t("modals.doNotClear")}</option>
          <option value="30">{t("modals.minutes30")}</option>
          <option value="60">{t("modals.hour1")}</option>
          <option value="240">{t("modals.hours4")}</option>
          <option value="480">{t("modals.today")}</option>
          <option value="10080">{t("modals.thisWeek")}</option>
        </select>
      </label>

      <div className="status-presets">
        {STATUS_PRESETS.map((preset) => (
          <button
            key={preset.text}
            type="button"
            onClick={() => {
              setEmoji(preset.emoji);
              setText(preset.text);
              setMinutes(preset.minutes);
            }}
          >
            {preset.text}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile editor                                                              */
/* -------------------------------------------------------------------------- */

export function ProfileEditorModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const session = state.session;
  const [form, setForm] = useState({
    displayName: session?.displayName ?? "",
    handle: session?.handle ?? "",
    title: session?.title ?? "",
    pronouns: session?.pronouns ?? "",
    phone: session?.phone ?? "",
    timezone: session?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={t("modals.editProfile")} onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await actions.updateProfile({
              displayName: form.displayName,
              handle: form.handle || undefined,
              title: form.title || null,
              pronouns: form.pronouns || null,
              phone: form.phone || null,
              timezone: form.timezone
            });
            actions.toast(t("modals.profileUpdated"), "success");
            onClose();
          } catch (error) {
            actions.fail(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="profile-editor">
          <Avatar user={session ?? undefined} size={92} presence={false} />
          <div className="stack-form grow">
            <label className="field">
              {t("auth.fullName")}
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
            </label>
            <label className="field">
              {t("modals.handle")}
              <input value={form.handle} onChange={(event) => setForm({ ...form, handle: event.target.value })} placeholder="ada" />
            </label>
          </div>
        </div>
        <label className="field">
          {t("modals.whatIDo")}
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("modals.productEngineer")} />
        </label>
        <label className="field">
          {t("panels.pronouns")}
          <input value={form.pronouns} onChange={(event) => setForm({ ...form, pronouns: event.target.value })} placeholder={t("modals.pronounsPlaceholder")} />
        </label>
        <label className="field">
          {t("modals.phone")}
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        <label className="field">
          {t("modals.timeZone")}
          <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
        </label>
        <div className="upload-avatar">
          <span>{t("modals.profilePhoto")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !state.workspaceId) return;
              try {
                const { file: uploaded } = await api.files.upload(state.workspaceId, file);
                await actions.updateProfile({ avatarUrl: uploaded.url });
                actions.toast(t("modals.photoUpdated"), "success");
              } catch (error) {
                actions.fail(error);
              }
            }}
          />
        </div>
        <button type="submit" className="button primary" disabled={busy}>
          {t("common.saveChanges")}
        </button>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                 */
/* -------------------------------------------------------------------------- */

export function PreferencesModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const { languageOptions, t } = useI18n();
  const preferences = state.session?.preferences ?? {};
  const [tab, setTab] = useState<"appearance" | "notifications" | "advanced">("appearance");
  const [keywords, setKeywords] = useState(((preferences as { keywords?: string[] }).keywords ?? []).join(", "));

  const set = (input: Record<string, unknown>) => void actions.updatePreferences(input);

  return (
    <Modal title={t("preferences.title")} onClose={onClose} width={640}>
      <div className="panel-tabs" role="tablist">
        {(["appearance", "notifications", "advanced"] as const).map((entry) => (
          <button key={entry} type="button" role="tab" aria-selected={tab === entry} className={tab === entry ? "is-active" : ""} onClick={() => setTab(entry)}>
            {entry === "appearance" ? t("preferences.appearance") : entry === "notifications" ? t("common.notifications") : t("preferences.advanced")}
          </button>
        ))}
      </div>

      {tab === "appearance" ? (
        <div className="stack-form">
          <label className="field">
            {t("preferences.theme")}
            <select value={preferences.theme ?? "system"} onChange={(event) => set({ theme: event.target.value })}>
              <option value="system">{t("preferences.matchSystem")}</option>
              <option value="light">{t("preferences.light")}</option>
              <option value="dark">{t("preferences.dark")}</option>
            </select>
          </label>
          <label className="field">
            {t("preferences.language")}
            <select value={preferences.language ?? "system"} onChange={(event) => set({ language: event.target.value })}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("preferences.messageDensity")}
            <select value={preferences.messageDensity ?? "comfortable"} onChange={(event) => set({ messageDensity: event.target.value })}>
              <option value="comfortable">{t("preferences.comfortable")}</option>
              <option value="compact">{t("preferences.compact")}</option>
            </select>
          </label>
          <label className="field">
            {t("preferences.timeFormat")}
            <select value={preferences.timeFormat ?? "12h"} onChange={(event) => set({ timeFormat: event.target.value })}>
              <option value="12h">{t("preferences.hour12")}</option>
              <option value="24h">{t("preferences.hour24")}</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={preferences.enterToSend !== false} onChange={(event) => set({ enterToSend: event.target.checked })} />
            <span>
              <strong>{t("preferences.enterToSend")}</strong>
              <small>{t("preferences.enterToSendHint")}</small>
            </span>
          </label>
        </div>
      ) : null}

      {tab === "notifications" ? (
        <div className="stack-form">
          <label className="field">
            {t("preferences.desktopNotifications")}
            <select value={preferences.desktopNotifications ?? "mentions"} onChange={(event) => set({ desktopNotifications: event.target.value })}>
              <option value="all">{t("common.everyNewMessage")}</option>
              <option value="mentions">{t("common.directMessagesAndMentions")}</option>
              <option value="none">{t("common.nothing")}</option>
            </select>
          </label>
          <label className="field">
            {t("preferences.emailNotifications")}
            <select value={preferences.emailNotifications ?? "mentions"} onChange={(event) => set({ emailNotifications: event.target.value })}>
              <option value="all">{t("preferences.everythingMissed")}</option>
              <option value="mentions">{t("common.directMessagesAndMentions")}</option>
              <option value="none">{t("common.nothing")}</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={preferences.notificationSound !== false} onChange={(event) => set({ notificationSound: event.target.checked })} />
            <span>
              <strong>{t("preferences.notificationSound")}</strong>
              <small>{t("preferences.notificationSoundHint")}</small>
            </span>
          </label>
          <label className="field">
            {t("preferences.highlightWords")}
            <input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              onBlur={() =>
                set({
                  keywords: keywords
                    .split(",")
                    .map((word) => word.trim())
                    .filter(Boolean)
                })
              }
              placeholder={t("preferences.highlightPlaceholder")}
            />
          </label>

          <div className="field">
            {t("preferences.notificationSchedule")}
            <p className="muted small">{t("preferences.scheduleHint")}</p>
            <div className="inline-field">
              <input
                type="time"
                value={preferences.quietHoursStart ?? ""}
                onChange={(event) => set({ quietHoursStart: event.target.value || null })}
                aria-label={t("preferences.quietStart")}
              />
              <span className="muted small">{t("preferences.to")}</span>
              <input
                type="time"
                value={preferences.quietHoursEnd ?? ""}
                onChange={(event) => set({ quietHoursEnd: event.target.value || null })}
                aria-label={t("preferences.quietEnd")}
              />
              {preferences.quietHoursStart || preferences.quietHoursEnd ? (
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => set({ quietHoursStart: null, quietHoursEnd: null })}
                >
                  {t("common.clear")}
                </button>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              if (typeof Notification === "undefined") return;
              const permission = await Notification.requestPermission();
              actions.toast(permission === "granted" ? t("preferences.browserNotificationsEnabled") : t("preferences.permissionDenied"));
            }}
          >
            {t("preferences.enableBrowserNotifications")}
          </button>
        </div>
      ) : null}

      {tab === "advanced" ? (
        <div className="stack-form">
          <label className="checkbox-field">
            <input type="checkbox" checked={preferences.showUnreadsFirst === true} onChange={(event) => set({ showUnreadsFirst: event.target.checked })} />
            <span>
              <strong>{t("preferences.showUnreadsFirst")}</strong>
            </span>
          </label>
          <div className="field">
            {t("preferences.sessions")}
            <SessionList />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function SessionList() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<Array<{ id: string; userAgent: string | null; createdAt: string }>>([]);

  useEffect(() => {
    api.auth
      .sessions()
      .then(({ sessions: list }) => setSessions(list))
      .catch(() => undefined);
  }, []);

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <div key={session.id} className="session-row">
          <span>{session.userAgent?.slice(0, 60) ?? t("app.unknownDevice")}</span>
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              await api.auth.revokeSession(session.id);
              setSessions((current) => current.filter((entry) => entry.id !== session.id));
            }}
          >
            {t("common.revoke")}
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schedule and share                                                          */
/* -------------------------------------------------------------------------- */

export function ScheduleModal({
  conversationId,
  bodyText,
  parentMessageId,
  onClose
}: {
  conversationId: string;
  bodyText: string;
  parentMessageId: string | null;
  onClose: () => void;
}) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [when, setWhen] = useState(() => {
    const date = new Date(Date.now() + 60 * 60_000);
    date.setSeconds(0, 0);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  return (
    <Modal title={t("modals.scheduleMessage")} onClose={onClose}>
      <p className="muted">{t("modals.scheduleHint")}</p>
      <blockquote className="schedule-preview">
        <RichText text={bodyText} />
      </blockquote>
      <label className="field">
        {t("modals.sendAt")}
        <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
      </label>
      <button
        type="button"
        className="button primary"
        onClick={async () => {
          try {
            await api.conversations.schedule(conversationId, {
              bodyText,
              sendAt: new Date(when).toISOString(),
              parentMessageId
            });
            track("message_scheduled", {});
            actions.toast(t("modals.messageScheduled"), "success");
            onClose();
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        {t("modals.schedule")}
      </button>
    </Modal>
  );
}

export function ShareModal({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const directory = useDirectory();
  const [target, setTarget] = useState("");
  const [comment, setComment] = useState("");

  return (
    <Modal title={t("modals.shareMessage")} onClose={onClose}>
      <label className="field">
        {t("modals.shareTo")}
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t("modals.pickConversation")}</option>
          {(state.bootstrap?.conversations ?? []).map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.channel ? `#${conversation.channel.name}` : conversationTitle(conversation, directory, state.session?.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t("modals.addComment")} <span className="optional">{t("modals.optional")}</span>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} />
      </label>
      <button
        type="button"
        className="button primary"
        disabled={!target}
        onClick={async () => {
          try {
            const { conversationId } = await api.messages.share(messageId, { conversationId: target, comment });
            await actions.openConversation(conversationId);
            onClose();
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        {t("modals.share")}
      </button>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Shortcuts and workspace creation                                            */
/* -------------------------------------------------------------------------- */

const SHORTCUTS = [
  ["⌘K / Ctrl+K", "modals.jumpConversation"],
  ["⌘/ / Ctrl+/", "modals.showShortcuts"],
  ["⌘⇧K", "modals.startDirectMessage"],
  ["⌘⇧A", "modals.goUnreads"],
  ["⌘⇧T", "modals.goThreads"],
  ["Alt+↑ / Alt+↓", "modals.previousNextConversation"],
  ["⇧Esc", "modals.markEverythingRead"],
  ["⌘B / ⌘I", "modals.boldItalic"],
  ["Enter", "modals.sendMessage"],
  ["Shift+Enter", "modals.newLine"],
  ["↑", "modals.editLastMessage"],
  ["Esc", "modals.closePanelModalThread"]
] as const;

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t("modals.keyboardShortcuts")} onClose={onClose}>
      <ul className="shortcut-list">
        {SHORTCUTS.map(([keys, description]) => (
          <li key={keys}>
            <kbd>{keys}</kbd>
            <span>{t(description)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const { actions } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState("");

  return (
    <Modal title={t("workspaceRail.createWorkspace")} onClose={onClose}>
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const { workspace } = await api.workspaces.create(name);
            track("workspace_created", {});
            const { user, workspaces } = await api.auth.me();
            actions.setSession(user, workspaces);
            await actions.selectWorkspace(workspace.id);
            onClose();
          } catch (error) {
            actions.fail(error);
          }
        }}
      >
        <label className="field">
          {t("auth.workspaceName")}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Inc" required autoFocus />
        </label>
        <button type="submit" className="button primary" disabled={name.trim().length < 2}>
          {t("auth.createWorkspace")}
        </button>
      </form>
    </Modal>
  );
}
