import type { ReactNode } from "react";
import { translate } from "../../lib/i18n";
import type { AppLanguage, ProjectSummary, WorkspaceMode } from "../../lib/types";
import {
  IconActivity,
  IconBolt,
  IconChecklist,
  IconFolder,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMessage,
  IconPlus,
  IconUsers,
} from "./TablerIcons";

type WorkspaceNavProps = {
  language: AppLanguage;
  mode: WorkspaceMode;
  isCollapsed?: boolean;
  onToggleCollapsed: () => void;
  onSelectMode: (mode: WorkspaceMode) => void;
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
  lockedModes?: WorkspaceMode[];
};

const navModes: Array<{ mode: WorkspaceMode; key: string; icon: (props: { size?: number }) => ReactNode }> = [
  { mode: "home", key: "workspace.home", icon: IconHome },
  { mode: "activity", key: "workspace.activity", icon: IconActivity },
  { mode: "thread", key: "workspace.thread", icon: IconMessage },
  { mode: "tasks", key: "workspace.tasks", icon: IconChecklist },
  { mode: "agents", key: "workspace.agents", icon: IconUsers },
  { mode: "files", key: "workspace.files.title", icon: IconFolder },
  { mode: "executions", key: "workspace.executions", icon: IconBolt },
];

export function WorkspaceNav({
  language,
  mode,
  isCollapsed = false,
  onToggleCollapsed,
  onSelectMode,
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  lockedModes = [],
}: WorkspaceNavProps) {
  return (
    <nav
      data-testid="workspace-shell-nav"
      data-collapsed={isCollapsed ? "true" : "false"}
      style={{
        display: "grid",
        gap: "6px",
        padding: isCollapsed ? "10px 6px" : "10px 8px",
        borderRadius: "14px",
        background: "color-mix(in srgb, var(--theme-color-rail) 82%, var(--theme-color-panel-end) 18%)",
        alignContent: "start",
        overflow: "hidden",
      }}
    >
      <div style={navHeaderStyle(isCollapsed)}>
        {isCollapsed ? null : <span style={eyebrowStyle}>{translate(language, "workspace.label")}</span>}
        <button
          type="button"
          data-testid="workspace-nav-toggle"
          onClick={onToggleCollapsed}
          title={isCollapsed ? translate(language, "workspace.context.expand") : translate(language, "workspace.context.collapse")}
          style={navToggleButtonStyle(isCollapsed)}
        >
          {isCollapsed ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />}
        </button>
      </div>
      {navModes.map((item) => (
        <button
          key={item.mode}
          data-testid={`workspace-nav-${item.mode}`}
          type="button"
          onClick={() => onSelectMode(item.mode)}
          title={lockedModes.includes(item.mode) ? translate(language, "workspace.nav.locked.onboarding") : undefined}
          style={{
            minHeight: "36px",
            textAlign: "left",
            padding: isCollapsed ? "0" : "0 12px",
            borderRadius: "9px",
            border: "none",
            borderLeft: item.mode === mode ? "1px solid var(--theme-color-accent-primary)" : "1px solid transparent",
            background: item.mode === mode
              ? "color-mix(in srgb, var(--theme-color-panel-muted) 78%, transparent)"
              : "transparent",
            color: item.mode === mode ? "var(--theme-color-text-primary)" : "var(--theme-color-text-secondary)",
            fontSize: "13px",
            fontWeight: item.mode === mode ? 520 : 450,
            display: "grid",
            placeItems: isCollapsed ? "center" : undefined,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", justifyContent: isCollapsed ? "center" : undefined }}>
            <item.icon size={15} />
            {isCollapsed ? null : <span>{translate(language, item.key as never)}</span>}
          </span>
        </button>
      ))}
      {isCollapsed ? null : (
      <div data-testid="workspace-nav-projects-section" style={projectsSectionStyle}>
        <div style={projectsHeaderStyle}>
          <span style={eyebrowStyle}>{translate(language, "workspace.projects")}</span>
          <button
            type="button"
            data-testid="workspace-project-create"
            onClick={onCreateProject}
            style={projectCreateButtonStyle}
          >
            <IconPlus size={14} />
          </button>
        </div>
        <button
          type="button"
          data-testid="workspace-project-global"
          onClick={() => onSelectProject(null)}
          style={projectItemStyle(selectedProjectId === null)}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <IconMessage size={15} />
            <span>{translate(language, "workspace.assistant.ask")}</span>
          </span>
        </button>
        {projects.length > 0 ? (
          <div style={{ display: "grid", gap: "4px" }}>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                data-testid={`workspace-project-${project.id}`}
                onClick={() => onSelectProject(project.id)}
                style={projectItemStyle(selectedProjectId === project.id)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {project.name}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p style={projectsEmptyStyle}>{translate(language, "workspace.projects.empty")}</p>
        )}
      </div>
      )}
    </nav>
  );
}

function navHeaderStyle(isCollapsed: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: isCollapsed ? "center" : "space-between",
    gap: "6px",
    minHeight: "28px",
  };
}

const eyebrowStyle = {
  padding: "4px 12px 8px",
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const projectsSectionStyle = {
  display: "grid",
  gap: "6px",
  marginTop: "14px",
  paddingTop: "10px",
  borderTop: "1px solid var(--theme-color-border-secondary)",
};

const projectsHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

function navToggleButtonStyle(isCollapsed: boolean) {
  return {
    minHeight: "28px",
    minWidth: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    border: "1px solid var(--theme-color-border-secondary)",
    background: "transparent",
    color: "var(--theme-color-text-secondary)",
    justifySelf: isCollapsed ? "center" : undefined,
  };
}

function projectItemStyle(isActive: boolean) {
  return {
    minHeight: "34px",
    textAlign: "left" as const,
    padding: "0 12px",
    borderRadius: "9px",
    border: "none",
    background: isActive ? "color-mix(in srgb, var(--theme-color-panel-muted) 78%, transparent)" : "transparent",
    color: isActive ? "var(--theme-color-text-primary)" : "var(--theme-color-text-secondary)",
    fontSize: "13px",
    fontWeight: isActive ? 520 : 450,
  };
}

const projectCreateButtonStyle = {
  minHeight: "28px",
  minWidth: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-secondary)",
};

const projectsEmptyStyle = {
  margin: 0,
  padding: "0 12px",
  color: "var(--theme-color-text-muted)",
  fontSize: "12px",
  lineHeight: 1.5,
};
