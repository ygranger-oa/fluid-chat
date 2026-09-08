"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/client/api";
import { I18nProvider, useI18n } from "@/client/i18n";

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
}

export function InviteAccept({ token }: { token: string }) {
  return (
    <I18nProvider preferences={null}>
      <InviteAcceptContent token={token} />
    </I18nProvider>
  );
}

function InviteAcceptContent({ token }: { token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(t("tokens.checkingInvite"));
  const [workspaceName, setWorkspaceName] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    api.invites
      .preview(token)
      .then((data) => {
        setWorkspaceName(data.workspace.name);
        if (data.invite.email) setEmail(data.invite.email);
        setMessage(t("tokens.invitedToJoin", { workspace: data.workspace.name }));
      })
      .catch((error) => setMessage(errorText(error, t("tokens.invalidInvite"))));
    api.auth
      .me()
      .then((data) => setSignedIn(!!data.user))
      .catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    try {
      await api.invites.accept(token);
      setAccepted(true);
      setMessage(t("tokens.invitationAcceptedMessage"));
    } catch (error) {
      setMessage(errorText(error, t("tokens.acceptFailed")));
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    try {
      if (mode === "signup") await api.auth.signup({ email, password, displayName });
      else await api.auth.login(email, password);
      setSignedIn(true);
      await accept();
    } catch (error) {
      setMessage(errorText(error, t("tokens.authFailed")));
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">{t("tokens.invitationEyebrow")}</p>
        <h1>{workspaceName || t("tokens.invitedTitle")}</h1>
        <p className="lede">{message}</p>
      </section>
      <section className="auth-panel">
        {signedIn ? (
          <div className="stack-form">
            <button type="button" className="button primary" onClick={accept} disabled={accepted}>
              {accepted ? t("tokens.invitationAccepted") : t("tokens.acceptInvitation")}
            </button>
            <a className="link-button" href="/">
              {t("tokens.openFluidChat")}
            </a>
          </div>
        ) : (
          <form className="stack-form" onSubmit={submitAuth}>
            <div className="segmented">
              <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
                {t("auth.createAccount")}
              </button>
              <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
                {t("auth.signIn")}
              </button>
            </div>
            {mode === "signup" ? (
              <label className="field">
                {t("auth.fullName")}
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
            ) : null}
            <label className="field">
              {t("auth.email")}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="field">
              {t("auth.password")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="button primary">
              {mode === "signup" ? t("tokens.createAccountJoin") : t("tokens.signInJoin")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export function ResetPassword({ token }: { token: string }) {
  return (
    <I18nProvider preferences={null}>
      <ResetPasswordContent token={token} />
    </I18nProvider>
  );
}

function ResetPasswordContent({ token }: { token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
      setMessage(t("tokens.passwordUpdated"));
      setPassword("");
    } catch (error) {
      setMessage(errorText(error, t("tokens.invalidReset")));
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Fluid Chat</p>
        <h1>{t("tokens.choosePassword")}</h1>
        <p className="lede">{t("tokens.resetHint")}</p>
      </section>
      <section className="auth-panel">
        <form className="stack-form" onSubmit={submit}>
          <label className="field">
            {t("tokens.newPassword")}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="button primary" disabled={done}>
            {t("tokens.resetPassword")}
          </button>
          {message ? <p className="notice">{message}</p> : null}
          {done ? (
            <a className="link-button" href="/">
              {t("tokens.goSignIn")}
            </a>
          ) : null}
        </form>
      </section>
    </main>
  );
}

export function VerifyEmail({ token }: { token: string }) {
  return (
    <I18nProvider preferences={null}>
      <VerifyEmailContent token={token} />
    </I18nProvider>
  );
}

function VerifyEmailContent({ token }: { token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState(t("tokens.verifyingEmail"));

  useEffect(() => {
    api.auth
      .verifyEmail(token)
      .then(() => setMessage(t("tokens.emailVerified")))
      .catch((error) => setMessage(errorText(error, t("tokens.invalidVerification"))));
  }, [token]);

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Fluid Chat</p>
        <h1>{t("tokens.emailVerification")}</h1>
        <p className="lede">{message}</p>
      </section>
      <section className="auth-panel">
        <a className="button primary" href="/">
          {t("tokens.openFluidChat")}
        </a>
      </section>
    </main>
  );
}
