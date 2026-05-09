import { translate } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";

type BootstrapScreenProps = {
  language?: AppLanguage;
  stageLabel: string;
  description: string;
};

export function BootstrapScreen({ language = "en", stageLabel, description }: BootstrapScreenProps) {
  return (
    <section aria-label={translate(language, "bootstrap.badge")} style={panelStyle}>
      <div style={headerStyle}>
        <p style={eyebrowStyle}>{translate(language, "app.name")}</p>
        <span style={badgeStyle}>{translate(language, "bootstrap.badge")}</span>
      </div>
      <h1 style={titleStyle}>{stageLabel}</h1>
      <div aria-hidden="true" style={progressTrackStyle}>
        <div style={progressFillStyle} />
      </div>
      <p style={stageStyle}>{stageLabel}</p>
      <p style={bodyStyle}>{description}</p>
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

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-eyebrow)",
  lineHeight: 1.4,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "0 16px",
  borderRadius: 999,
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-secondary)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 700,
};

const titleStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-title)",
  lineHeight: 1.05,
  color: "var(--theme-color-text-primary)",
};

const progressTrackStyle = {
  width: "100%",
  height: 4,
  borderRadius: "var(--theme-radius-pill)",
  background: "var(--theme-color-panel-muted)",
  overflow: "hidden",
};

const progressFillStyle = {
  width: "40%",
  height: "100%",
  borderRadius: 999,
  background: "var(--theme-color-accent-primary)",
};

const stageStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const bodyStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-secondary)",
};
