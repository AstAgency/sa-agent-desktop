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

export function AuthScreen() {
  const language = useClientState((state) => state.language);
  const [stage, setStage] = useState<Stage>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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
      await verifyEmailCode({ email: stage.email, code, name });
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
      signInWithDevFallback({
        email: email.trim() || "dev@example.com",
        name: name.trim() || "Dev User",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <h1>{translate(language, "app.title")}</h1>
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
              <span>{translate(language, "auth.name.label")}</span>
              <input
                type="text"
                autoComplete="name"
                placeholder={translate(language, "auth.name.placeholder")}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
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
      </div>
    </section>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
