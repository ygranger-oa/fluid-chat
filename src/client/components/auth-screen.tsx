"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { identifyUser, track } from "../analytics";
import { useI18n } from "../i18n";
import { useApp } from "../store";

export function AuthScreen() {
  const { actions } = useApp();
  const { t } = useI18n();
  const [ssoWorkspaceId, setSsoWorkspaceId] = useState<string | null>(null);
  const [showGlobalSso, setShowGlobalSso] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSsoWorkspaceId(new URLSearchParams(window.location.search).get("workspaceId"));
    api.auth
      .me()
      .then(({ sso }) => setShowGlobalSso(!!sso?.showOnLogin))
      .catch(() => setShowGlobalSso(false));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (mode === "forgot") {
        const { resetToken } = await api.auth.forgotPassword(email);
        setNotice(
          resetToken
            ? t("auth.resetLinkFallback", { token: resetToken })
            : t("auth.resetSent")
        );
        setBusy(false);
        return;
      }

      const result =
        mode === "signup"
          ? await api.auth.signup({ email, password, displayName })
          : await api.auth.login(email, password);
      actions.setSession(result.user, result.workspaces);
      // Identify before capturing so the conversion lands on the person, not the anonymous id.
      identifyUser(result.user);
      track(mode === "signup" ? "signed_up" : "signed_in", { workspace_count: result.workspaces.length });
      if (result.workspaces[0]) await actions.selectWorkspace(result.workspaces[0].workspace.id);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Fluid Chat</p>
        <h1>{t("auth.headline")}</h1>
        <p className="lede">{t("auth.lede")}</p>
        <ul className="auth-points">
          <li>{t("auth.points.channels")}</li>
          <li>{t("auth.points.threads")}</li>
          <li>{t("auth.points.presence")}</li>
          <li>{t("auth.points.search")}</li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="segmented">
          <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
            {t("auth.signIn")}
          </button>
          <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
            {t("auth.createAccount")}
          </button>
        </div>

        <form className="stack-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label className="field">
              {t("auth.fullName")}
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required autoComplete="name" />
            </label>
          ) : null}
          <label className="field">
            {t("auth.email")}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </label>
          {mode !== "forgot" ? (
            <label className="field">
              {t("auth.password")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
          ) : null}

          <button type="submit" className="button primary" disabled={busy}>
            {mode === "signup" ? t("auth.createAccount") : mode === "forgot" ? t("auth.sendResetLink") : t("auth.signIn")}
          </button>

          {mode === "login" ? (
            <button type="button" className="link-button" onClick={() => setMode("forgot")}>
              {t("auth.forgotPassword")}
            </button>
          ) : null}
          {mode === "forgot" ? (
            <button type="button" className="link-button" onClick={() => setMode("login")}>
              {t("auth.backToSignIn")}
            </button>
          ) : null}
          {notice ? <p className="notice">{notice}</p> : null}
        </form>
        {ssoWorkspaceId || showGlobalSso ? (
          <a className="button ghost full-width" href={ssoWorkspaceId ? `/api/auth/sso/start?workspaceId=${encodeURIComponent(ssoWorkspaceId)}` : "/api/auth/sso/start"}>
            {t("auth.signInWithSso")}
          </a>
        ) : null}
      </section>
    </main>
  );
}

export function WorkspaceSetupScreen() {
  const { state, actions } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">{t("auth.welcome", { name: state.session?.displayName ?? "" })}</p>
        <h1>{t("auth.createFirstWorkspace")}</h1>
        <p className="lede">{t("auth.workspaceLede")}</p>
      </section>
      <section className="auth-panel">
        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const { workspace } = await api.workspaces.create(name);
              track("workspace_created", {});
              const { user, workspaces } = await api.auth.me();
              actions.setSession(user, workspaces);
              await actions.selectWorkspace(workspace.id);
            } catch (error) {
              actions.fail(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            {t("auth.workspaceName")}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Inc" required autoFocus />
          </label>
          <button type="submit" className="button primary" disabled={busy || name.trim().length < 2}>
            {t("auth.createWorkspace")}
          </button>
          <button type="button" className="link-button" onClick={() => void actions.signOut()}>
            {t("auth.signOut")}
          </button>
        </form>
      </section>
    </main>
  );
}
