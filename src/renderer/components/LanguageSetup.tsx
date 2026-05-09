import { translate } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";

type LanguageSetupProps = {
  language: AppLanguage | null;
  onSelectLanguage: (language: AppLanguage) => void;
};

export function LanguageSetup({ language, onSelectLanguage }: LanguageSetupProps) {
  const activeLanguage = language ?? "en";

  return (
    <section aria-label={translate(activeLanguage, "languageSetup.title")} style={panelStyle}>
      <p style={eyebrowStyle}>{translate(activeLanguage, "app.name")}</p>
      <h1 style={titleStyle}>{translate(activeLanguage, "languageSetup.title")}</h1>
      <p style={bodyStyle}>{translate(activeLanguage, "languageSetup.description")}</p>
      <div style={buttonStackStyle}>
        <button type="button" onClick={() => onSelectLanguage("ru")} style={buttonStyle(language === "ru")}>
          Русский
        </button>
        <button type="button" onClick={() => onSelectLanguage("en")} style={buttonStyle(language === "en")}>
          {activeLanguage === "ru" ? "Английский" : "English"}
        </button>
      </div>
      {language ? (
        <p style={selectedStyle}>
          {translate(language, language === "ru" ? "languageSetup.selected.ru" : "languageSetup.selected.en")}
        </p>
      ) : null}
      {/*<div style={ctaStyle}>{translate(activeLanguage, "languageSetup.cta")}</div>*/}
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

function buttonStyle(isSelected: boolean) {
  return {
    appearance: "none" as const,
    minHeight: 48,
    border: isSelected
      ? "1px solid var(--theme-color-accent-primary-bright)"
      : "1px solid var(--theme-color-border-secondary)",
    background: isSelected ? "var(--theme-color-accent-primary)" : "var(--theme-color-panel-muted)",
    color: "var(--theme-color-text-primary)",
    borderRadius: "var(--theme-radius-medium)",
    padding: "12px 16px",
    fontSize: "var(--theme-font-size-body)",
    fontWeight: isSelected ? 700 : 600,
    fontFamily: "inherit",
    textAlign: "left" as const,
    cursor: "pointer",
    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
  };
}

const buttonStackStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const selectedStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.5,
  color: "var(--theme-color-text-secondary)",
};

const ctaStyle = {
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.5,
  color: "var(--theme-color-text-muted)",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};
