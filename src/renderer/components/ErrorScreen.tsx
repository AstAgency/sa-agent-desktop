import { translate } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";

type ErrorScreenProps = {
  language: AppLanguage;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  detail?: string | null;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function ErrorScreen({
  language,
  title,
  description,
  actionLabel,
  onAction,
  detail,
  secondaryActionLabel,
  onSecondaryAction,
}: ErrorScreenProps) {
  return (
    <section aria-label="Application error" style={panelStyle}>
      <div style={headerStyle}>
        <p style={eyebrowStyle}>{translate(language, "app.name")}</p>
        <span style={badgeStyle}>{translate(language, "error.recoverable")}</span>
      </div>
      <h1 style={titleStyle}>{title}</h1>
      <p style={bodyStyle}>{description}</p>
      {detail ? <pre style={detailStyle}>{detail}</pre> : null}
      <div style={actionsStyle}>
        <button style={buttonStyle} type="button" onClick={onAction}>
          {actionLabel}
        </button>
        {secondaryActionLabel && onSecondaryAction ? (
          <button style={secondaryButtonStyle} type="button" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const panelStyle = {
  width: "min(92vw, 540px)",
  display: "grid",
  gap: "var(--theme-spacing-lg)",
  padding: "var(--theme-spacing-xl)",
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
  gap: "var(--theme-spacing-md)",
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
  borderRadius: "var(--theme-radius-pill)",
  background: "var(--theme-color-status-danger)",
  color: "var(--theme-color-status-danger-text)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 700,
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

const detailStyle = {
  margin: 0,
  padding: "16px",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-secondary)",
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
};

const actionsStyle = {
  display: "flex",
  gap: "var(--theme-spacing-sm)",
  flexWrap: "wrap" as const,
};

const buttonStyle = {
  minHeight: 48,
  border: "1px solid var(--theme-color-accent-primary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px 16px",
  background: "var(--theme-color-accent-primary)",
  color: "var(--theme-color-text-inverse)",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  minHeight: 48,
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px 16px",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 600,
  cursor: "pointer",
};
