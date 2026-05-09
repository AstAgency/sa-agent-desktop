import { translate } from "../../lib/i18n";
import type { AppLanguage, ProjectAgentRecord, ProjectSummary } from "../../lib/types";
import { IconCommand, IconSparkles } from "./TablerIcons";

type WorkspaceTopBarProps = {
  language: AppLanguage;
  project: ProjectSummary | null;
  projectAgents?: ProjectAgentRecord[];
  activeProjectAgentId?: string | null;
  onSelectProjectAgent?: (projectAgentId: string) => void;
  runtimeHealthy: boolean;
  onOpenAssistantOverlay?: (mode: "ask-assistant" | "run-command") => void;
  onOpenSettings: () => void;
  assistantActionsDisabled?: boolean;
};

export function WorkspaceTopBar({
  language,
  project,
  projectAgents = [],
  activeProjectAgentId = null,
  onSelectProjectAgent,
  runtimeHealthy,
  onOpenAssistantOverlay,
  onOpenSettings,
  assistantActionsDisabled = false,
}: WorkspaceTopBarProps) {
  return (
    <header
      data-testid="workspace-shell-topbar"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 240px) auto",
        alignItems: "center",
        gap: "14px",
        padding: "10px 14px",
        borderRadius: "14px",
        background: "color-mix(in srgb, var(--theme-color-panel-end) 80%, transparent)",
        borderBottom: "1px solid var(--theme-color-border-secondary)",
      }}
    >
      <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
        <span style={eyebrowStyle}>{translate(language, "workspace.label")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flexWrap: "wrap" }}>
          <strong style={titleStyle}>{project?.name ?? translate(language, "workspace.home.title")}</strong>
          {project && projectAgents.length > 0 ? (
            <label style={projectAgentLabelStyle}>
              <span>{translate(language, "workspace.agents.title")}</span>
              <select
                data-testid="workspace-project-agent-select"
                value={activeProjectAgentId ?? projectAgents[0]?.id ?? ""}
                onChange={(event) => onSelectProjectAgent?.(event.target.value)}
                style={projectAgentSelectStyle}
              >
                {projectAgents.map((projectAgent) => (
                  <option key={projectAgent.id} value={projectAgent.id}>
                    {projectAgent.display_name ?? projectAgent.agent_key ?? projectAgent.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span data-testid="workspace-runtime-badge" style={runtimeBadgeStyle(runtimeHealthy)}>
            <span style={runtimeDotStyle(runtimeHealthy)} />
            {translate(language, runtimeHealthy ? "workspace.runtime.nominal" : "workspace.runtime.attention")}
          </span>
        </div>
      </div>

      <div
        data-testid="workspace-search-slot"
        aria-label={translate(language, "workspace.search")}
        style={searchSlotStyle}
      >
        <span style={{ color: "var(--theme-color-text-muted)" }}>{translate(language, "workspace.search.slot")}</span>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "end" }}>
        <button
          type="button"
          data-testid="assistant-trigger-ask"
          onClick={() => onOpenAssistantOverlay?.("ask-assistant")}
          aria-disabled={assistantActionsDisabled}
          style={secondaryButtonStyle(assistantActionsDisabled)}
          title={assistantActionsDisabled ? translate(language, "workspace.assistant.disabled.onboarding") : undefined}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <IconSparkles size={14} />
            <span>{translate(language, "workspace.assistant.ask")}</span>
          </span>
        </button>
        <button
          type="button"
          data-testid="assistant-trigger-command"
          onClick={() => onOpenAssistantOverlay?.("run-command")}
          aria-disabled={assistantActionsDisabled}
          style={secondaryButtonStyle(assistantActionsDisabled)}
          title={assistantActionsDisabled ? translate(language, "workspace.assistant.disabled.onboarding") : undefined}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <IconCommand size={14} />
            <span>{translate(language, "workspace.assistant.command")}</span>
          </span>
        </button>
        <button type="button" onClick={onOpenSettings} style={ghostButtonStyle}>
          {translate(language, "workspace.settings")}
        </button>
      </div>
    </header>
  );
}

function runtimeBadgeStyle(runtimeHealthy: boolean) {
  return {
    minHeight: "24px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "0 8px",
    borderRadius: "999px",
    background: runtimeHealthy
      ? "color-mix(in srgb, var(--theme-color-panel-muted) 82%, transparent)"
      : "rgba(245, 158, 11, 0.12)",
    color: "var(--theme-color-text-secondary)",
    fontSize: "12px",
  };
}

function runtimeDotStyle(runtimeHealthy: boolean) {
  return {
    width: "6px",
    height: "6px",
    borderRadius: "999px",
    background: runtimeHealthy ? "var(--theme-color-accent-primary)" : "#f59e0b",
  };
}

const eyebrowStyle = {
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const titleStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  fontSize: "15px",
  fontWeight: 560,
  color: "var(--theme-color-text-primary)",
};

const searchSlotStyle = {
  minHeight: "34px",
  display: "grid",
  placeItems: "center start",
  padding: "0 12px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 70%, transparent)",
  border: "1px solid var(--theme-color-border-secondary)",
  fontSize: "13px",
};

function secondaryButtonStyle(isLocked: boolean) {
  return {
    minHeight: "32px",
    padding: "0 12px",
    borderRadius: "8px",
    border: "1px solid var(--theme-color-border-secondary)",
    background: "transparent",
    color: "var(--theme-color-text-primary)",
    opacity: isLocked ? 0.72 : 1,
    fontSize: "12px",
  };
}

const ghostButtonStyle = {
  minHeight: "32px",
  padding: "0 10px",
  borderRadius: "8px",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const projectAgentLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const projectAgentSelectStyle = {
  minHeight: "28px",
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 82%, transparent)",
  color: "var(--theme-color-text-primary)",
  padding: "0 8px",
  fontSize: "12px",
};
