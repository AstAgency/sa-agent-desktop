import { translate } from "../../lib/i18n";
import type { AppLanguage, WorkspaceMode } from "../../lib/types";

type ContextPanelProps = {
  language: AppLanguage;
  mode: WorkspaceMode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  profileDisplayName: string | null;
  profileEmail: string | null;
  preferredUserName: string | null;
  preferredAgentName: string | null;
  activityDomain: string | null;
  onboardingCompleted: boolean;
};

export function ContextPanel({
  language,
  mode,
  collapsed,
  onToggleCollapsed,
  profileDisplayName,
  profileEmail,
  preferredUserName,
  preferredAgentName,
  activityDomain,
  onboardingCompleted,
}: ContextPanelProps) {
  if (collapsed) {
    return (
      <aside data-testid="workspace-shell-context-panel" style={collapsedRailStyle}>
        <button
          aria-label={translate(language, "workspace.context.expand")}
          data-testid="workspace-context-toggle"
          type="button"
          onClick={onToggleCollapsed}
          style={railButtonStyle}
        >
          <span aria-hidden="true">◀</span>
        </button>
        <div data-testid="workspace-context-collapsed" style={collapsedIndicatorStyle}>
          <span style={collapsedDotStyle} />
        </div>
      </aside>
    );
  }

  return (
    <aside data-testid="workspace-shell-context-panel" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={eyebrowStyle}>{translate(language, "workspace.context.inspector")}</span>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 560 }}>{translate(language, "workspace.context.title")}</h3>
        </div>
        <button
          aria-label={translate(language, "workspace.context.collapse")}
          data-testid="workspace-context-toggle"
          type="button"
          onClick={onToggleCollapsed}
          style={collapseButtonStyle}
        >
          <span aria-hidden="true">▶</span>
        </button>
      </div>

      <section data-testid="workspace-context-default-state" style={summaryStripStyle}>
        <StatusChip label={translate(language, `workspace.${mode}` as never)} />
        <StatusChip
          label={translate(language, onboardingCompleted ? "workspace.profile.completed" : "workspace.profile.pending")}
          tone={onboardingCompleted ? "active" : "attention"}
        />
      </section>

      <section style={groupStyle}>
        <header style={groupHeaderStyle}>
          <span style={groupLabelStyle}>{translate(language, "workspace.profile")}</span>
          <span style={groupMetaStyle}>{translate(language, "workspace.context.defaultState")}</span>
        </header>
        <dl style={kvGridStyle}>
          <KeyValue label={translate(language, "workspace.profile.displayName")} value={profileDisplayName} language={language} />
          <KeyValue label={translate(language, "workspace.profile.email")} value={profileEmail} language={language} />
          <KeyValue label={translate(language, "workspace.runtime.user")} value={preferredUserName} language={language} />
          <KeyValue label={translate(language, "workspace.runtime.agent")} value={preferredAgentName} language={language} />
          <KeyValue label={translate(language, "workspace.runtime.domain")} value={activityDomain} language={language} />
        </dl>
      </section>

      <section style={groupStyle}>
        <header style={groupHeaderStyle}>
          <span style={groupLabelStyle}>{translate(language, "workspace.context.operationalNotes")}</span>
          <span style={groupMetaStyle}>{translate(language, "workspace.context.pinnedContext")}</span>
        </header>
        <div style={{ display: "grid", gap: "8px" }}>
          <SummaryRow
            title={translate(language, "workspace.context.assistantAccess.title")}
            meta={translate(language, "workspace.context.assistantAccess.meta")}
          />
          <SummaryRow
            title={translate(language, "workspace.context.scope.title")}
            meta={translate(language, "workspace.context.scope.meta")}
          />
        </div>
      </section>
    </aside>
  );
}

function KeyValue({ label, value, language }: { label: string; value: string | null; language: AppLanguage }) {
  return (
    <>
      <dt style={keyStyle}>{label}</dt>
      <dd style={valueStyle}>{value ?? translate(language, "workspace.notSet")}</dd>
    </>
  );
}

function StatusChip({ label, tone = "muted" }: { label: string; tone?: "active" | "attention" | "muted" }) {
  return (
    <span
      style={{
        minHeight: "24px",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 8px",
        borderRadius: "999px",
        background: tone === "active"
          ? "color-mix(in srgb, var(--theme-color-accent-primary) 14%, transparent)"
          : tone === "attention"
            ? "rgba(245, 158, 11, 0.16)"
            : "var(--theme-color-panel-muted)",
        color: "var(--theme-color-text-primary)",
        fontSize: "12px",
      }}
    >
      {label}
    </span>
  );
}

function SummaryRow({ title, meta }: { title: string; meta: string }) {
  return (
    <article style={summaryRowStyle}>
      <strong style={{ fontSize: "13px", fontWeight: 520 }}>{title}</strong>
      <span style={{ color: "var(--theme-color-text-secondary)", fontSize: "12px" }}>{meta}</span>
    </article>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "12px",
  padding: "14px",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--theme-color-rail) 84%, var(--theme-color-panel-end) 16%)",
  height: "100%",
  minHeight: 0,
  overflow: "hidden" as const,
};

const collapsedRailStyle = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "12px",
  padding: "10px 6px",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--theme-color-rail) 84%, var(--theme-color-panel-end) 16%)",
  height: "100%",
  overflow: "hidden" as const,
};

const railButtonStyle = {
  width: "40px",
  minWidth: "40px",
  height: "40px",
  minHeight: "40px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: "12px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-secondary)",
  fontSize: "14px",
};

const collapseButtonStyle = {
  width: "28px",
  minWidth: "28px",
  height: "28px",
  minHeight: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const collapsedIndicatorStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  opacity: 1,
  pointerEvents: "none" as const,
};

const collapsedDotStyle = {
  width: "6px",
  height: "6px",
  borderRadius: "999px",
  background: "var(--theme-color-accent-primary)",
  opacity: 0.9,
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const summaryStripStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  paddingBottom: "4px",
  borderBottom: "1px solid var(--theme-color-border-secondary)",
};

const groupStyle = {
  display: "grid",
  gap: "10px",
  paddingTop: "2px",
};

const groupHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const groupLabelStyle = {
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--theme-color-text-muted)",
};

const groupMetaStyle = {
  fontSize: "12px",
  color: "var(--theme-color-text-muted)",
};

const kvGridStyle = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "4px 0",
};

const keyStyle = {
  margin: 0,
  fontSize: "12px",
  color: "var(--theme-color-text-muted)",
};

const valueStyle = {
  margin: "0 0 8px",
  fontSize: "14px",
  color: "var(--theme-color-text-primary)",
};

const summaryRowStyle = {
  display: "grid",
  gap: "4px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 80%, transparent)",
};
