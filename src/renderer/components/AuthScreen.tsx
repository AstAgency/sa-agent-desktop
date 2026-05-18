import { useState } from "react";
import {
  requestEmailCode,
  signInWithDevFallback,
  verifyEmailCode,
} from "../state/auth-controller";
import { AuthApiError } from "../lib/auth-api";
import { translate, type AppLanguage } from "../lib/i18n";
import { useClientState } from "../state/store";

type Stage =
  | { kind: "email" }
  | { kind: "code"; email: string };

const PLATFORM_URL =
  "https://astanov.systems/?utm_source=sa_agent_desktop&utm_medium=desktop_app&utm_campaign=auth_screen";

const LANDING_CARDS = [
  "agent",
  "learning",
  "context",
  "desktop",
  "multi",
] as const;

export function AuthScreen() {
  const isDev = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
  const language = useClientState((state) => state.language);
  const [stage, setStage] = useState<Stage>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError(translate(language, "auth.email.error.invalid"));
      return;
    }
    setBusy(true);
    try {
      await requestEmailCode(trimmed);
      setStage({ kind: "code", email: trimmed });
    } catch (err) {
      setError(formatEmailError(err, language));
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (stage.kind !== "code") return;
    setError(null);
    if (code.trim().length === 0) {
      setError(translate(language, "auth.code.error.invalid"));
      return;
    }
    setBusy(true);
    try {
      await verifyEmailCode({ email: stage.email, code, name: nameFromEmail(stage.email) });
    } catch (err) {
      setError(formatVerifyError(err, language));
    } finally {
      setBusy(false);
    }
  }

  function handleDevFallback() {
    setError(null);
    setBusy(true);
    try {
      const devEmail = email.trim() || "dev@example.com";
      signInWithDevFallback({
        email: devEmail,
        name: nameFromEmail(devEmail) || "Dev User",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-screen">
      <aside className="auth-pitch">
        <div className="auth-pitch-inner">
          <span className="auth-pitch-eyebrow">{translate(language, "app.title")}</span>
          <h2 className="auth-pitch-title">
            {translate(language, "auth.landing.title")}
          </h2>
          <p className="auth-pitch-subtitle">
            {translate(language, "auth.landing.subtitle")}
          </p>
          <p className="auth-pitch-description">
            {translate(language, "auth.landing.description")}
          </p>
          <ul className="auth-pitch-cards">
            {LANDING_CARDS.map((card) => (
              <li key={card} className="auth-pitch-card">
                <strong>
                  {translate(language, `auth.landing.card.${card}.title`)}
                </strong>
                <span>
                  {translate(language, `auth.landing.card.${card}.body`)}
                </span>
              </li>
            ))}
          </ul>
          <blockquote className="auth-pitch-highlight">
            <strong>{translate(language, "auth.landing.highlight.title")}</strong>
            <span>{translate(language, "auth.landing.highlight.body")}</span>
          </blockquote>
        </div>
      </aside>

      <div className="auth-panel">
        <header className="auth-hero">
          <h1>{translate(language, "app.title")}</h1>
          <p className="auth-hero-sub">
            {translate(language, "auth.hero.subtitle")}
          </p>
        </header>

        <div className="auth-card">
        <p className="auth-intro">{translate(language, "auth.intro")}</p>
        {stage.kind === "email" ? (
          <form className="auth-form" onSubmit={handleEmailSubmit}>
            <h2>{translate(language, "auth.title")}</h2>
            <p className="auth-sub">{translate(language, "auth.subtitle")}</p>
            <label className="auth-field">
              <span>{translate(language, "auth.email.label")}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder={translate(language, "auth.email.placeholder")}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            <button type="submit" className="primary" disabled={busy || email.trim().length === 0}>
              {busy
                ? translate(language, "auth.email.sending")
                : translate(language, "auth.email.submit")}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleCodeSubmit}>
            <h2>{translate(language, "auth.code.title")}</h2>
            <p className="auth-sub">
              {translate(language, "auth.code.subtitle", { email: stage.email })}
            </p>
            <label className="auth-field">
              <span>{translate(language, "auth.code.label")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={translate(language, "auth.code.placeholder")}
                value={code}
                disabled={busy}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            <button
              type="submit"
              className="primary"
              disabled={busy || code.trim().length === 0}
            >
              {busy
                ? translate(language, "auth.code.verifying")
                : translate(language, "auth.code.submit")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setStage({ kind: "email" });
                setCode("");
                setError(null);
              }}
            >
              {translate(language, "auth.back")}
            </button>
          </form>
        )}

        {isDev ? (
          <div className="auth-dev">
            <h3>{translate(language, "auth.dev.title")}</h3>
            <p>{translate(language, "auth.dev.description")}</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={handleDevFallback}
            >
              {translate(language, "auth.dev.submit")}
            </button>
          </div>
        ) : null}
        </div>

        <a
          className="auth-platform-link"
          href={PLATFORM_URL}
          target="_blank"
          rel="noreferrer"
        >
          {translate(language, "auth.platformLink")}
        </a>
      </div>
    </section>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function nameFromEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

function formatEmailError(err: unknown, language: AppLanguage): string {
  if (err instanceof AuthApiError) {
    if (err.code === "invalid_email") return translate(language, "auth.email.error.invalid");
    return translate(language, "auth.email.error.generic", { message: err.code });
  }
  const message = err instanceof Error ? err.message : String(err);
  return translate(language, "auth.email.error.generic", { message });
}

function formatVerifyError(err: unknown, language: AppLanguage): string {
  if (err instanceof AuthApiError) {
    if (err.code === "invalid_code" || err.status === 401) {
      return translate(language, "auth.code.error.invalid");
    }
    return translate(language, "auth.code.error.generic", { message: err.code });
  }
  const message = err instanceof Error ? err.message : String(err);
  return translate(language, "auth.code.error.generic", { message });
}
