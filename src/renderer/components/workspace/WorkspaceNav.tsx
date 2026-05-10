import { translate } from "../../lib/i18n";
import type { AppLanguage, WorkspaceMode } from "../../lib/types";
import type { SidebarSessionTree } from "../workspace-shell/types";
import { IconFolder, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "./TablerIcons";
import { WorkspaceSessionTree } from "./WorkspaceSessionTree";

export function WorkspaceNav(props: {
  language: AppLanguage;
  mode: WorkspaceMode;
  sessionTree: SidebarSessionTree;
  isCollapsed?: boolean;
  onToggleCollapsed: () => void;
  onSelectMode: (mode: WorkspaceMode) => void;
  onSelectSession: (sessionId: string, projectId: string | null) => Promise<void>;
  onCreateSession: () => Promise<void>;
  onCreateProject: () => void;
  onSelectProject: (projectId: string | null) => void;
}) {
  const isCollapsed = props.isCollapsed ?? false;

  return (
    <nav data-testid="workspace-shell-nav" data-collapsed={isCollapsed ? "true" : "false"} style={{ display: "grid", gap: "6px", padding: isCollapsed ? "10px 6px" : "10px 8px", borderRadius: "14px", background: "color-mix(in srgb, var(--theme-color-rail) 82%, var(--theme-color-panel-end) 18%)", alignContent: "start", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: isCollapsed ? "center" : "space-between", minHeight: "28px" }}>
        {isCollapsed ? null : <span style={eyebrowStyle}>{translate(props.language, "workspace.label")}</span>}
        <button type="button" data-testid="workspace-nav-toggle" onClick={props.onToggleCollapsed} title={isCollapsed ? translate(props.language, "workspace.context.expand") : translate(props.language, "workspace.context.collapse")} style={{ minHeight: "28px", minWidth: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "1px solid var(--theme-color-border-secondary)", background: "transparent", color: "var(--theme-color-text-secondary)" }}>
          {isCollapsed ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />}
        </button>
      </div>
      <button type="button" data-testid="workspace-nav-files" onClick={() => props.onSelectMode("files")} style={{ minHeight: "36px", textAlign: "left", padding: isCollapsed ? "0" : "0 12px", borderRadius: "9px", border: "none", borderLeft: props.mode === "files" ? "1px solid var(--theme-color-accent-primary)" : "1px solid transparent", background: props.mode === "files" ? "color-mix(in srgb, var(--theme-color-panel-muted) 78%, transparent)" : "transparent", color: props.mode === "files" ? "var(--theme-color-text-primary)" : "var(--theme-color-text-secondary)", fontSize: "13px", fontWeight: props.mode === "files" ? 520 : 450, display: "grid", placeItems: isCollapsed ? "center" : undefined }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", justifyContent: isCollapsed ? "center" : undefined }}><IconFolder size={15} />{isCollapsed ? null : <span>{translate(props.language, "workspace.files.title")}</span>}</span>
      </button>
      <WorkspaceSessionTree language={props.language} isCollapsed={isCollapsed} sessionTree={props.sessionTree} onCreateSession={() => void props.onCreateSession()} onCreateProject={props.onCreateProject} onSelectProject={props.onSelectProject} onSelectSession={(sessionId, projectId) => void props.onSelectSession(sessionId, projectId)} />
    </nav>
  );
}

const eyebrowStyle = { padding: "4px 12px 8px", fontSize: "11px", lineHeight: 1.1, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--theme-color-text-muted)" };
