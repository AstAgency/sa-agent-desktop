import { translate } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";

type AuthGateProps = {
  language: AppLanguage;
  onContinue: () => void;
};

export function AuthGate({ language, onContinue }: AuthGateProps) {
  return (
    <section aria-label="Authentication" style={panelStyle}>
      <p style={eyebrowStyle}>{translate(language, "app.name")}</p>
      <h1 style={titleStyle}>{translate(language, "auth.title")}</h1>
      <p style={bodyStyle}>{translate(language, "auth.description")}</p>
      <button type="button" onClick={onContinue} style={ctaStyle}>
        {translate(language, "auth.cta")}
      </button>
      <div style={socialStackStyle}>
        <button type="button" onClick={onContinue} style={secondaryButtonStyle}>
          {translate(language, "auth.github")}
        </button>
        <button type="button" onClick={onContinue} style={secondaryButtonStyle}>
          {translate(language, "auth.google")}
        </button>
        <button type="button" onClick={onContinue} style={secondaryButtonStyle}>
          {translate(language, "auth.yandex")}
        </button>
      </div>
    </section>
  );
}

const panelStyle = {
  width: "min(92vw, 540px)",
  display: "grid",
  gap: 24,
  padding: 32,
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto" as const,
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  boxShadow: "var(--theme-shadow-panel)",
  border: "1px solid var(--theme-color-border-primary)",
  boxSizing: "border-box" as const,
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-eyebrow)",
  lineHeight: 1.4,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const titleStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-title)",
  lineHeight: 1.05,
  color: "var(--theme-color-text-primary)",
};

const bodyStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-secondary)",
};

const ctaStyle = {
  appearance: "none" as const,
  minHeight: 48,
  border: "1px solid var(--theme-color-accent-primary)",
  background: "var(--theme-color-accent-primary)",
  color: "var(--theme-color-text-inverse)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px 16px",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
};

const socialStackStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const secondaryButtonStyle = {
  appearance: "none" as const,
  minHeight: 48,
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px 16px",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 600,
  fontFamily: "inherit",
  textAlign: "left" as const,
  cursor: "pointer",
};
