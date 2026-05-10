import type { ReactNode } from "react";
import { translate } from "../../lib/i18n";
import type { AppLanguage } from "../../lib/types";
import type { SidebarSessionTree } from "../workspace-shell/types";
import { IconFolder, IconMessage, IconPlus } from "./TablerIcons";

export function WorkspaceSessionTree(props: {
  language: AppLanguage;
  isCollapsed: boolean;
  sessionTree: SidebarSessionTree;
  onCreateSession: () => void;
  onCreateProject: () => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectSession: (sessionId: string, projectId: string | null) => void;
}) {
  if (props.isCollapsed) {
    return (
      <div style={{ display: "grid", gap: "6px" }}>
        <IconButton testId="workspace-session-create" title={translate(props.language, "workspace.sessions.new")} onClick={props.onCreateSession}><IconPlus size={15} /></IconButton>
        {props.sessionTree.globalGroup.sessions.map((item) => (
          <IconButton key={item.session.id} testId={`workspace-global-session-${item.session.id}`} title={item.session.title ?? translate(props.language, "workspace.sessions.global")} onClick={() => props.onSelectSession(item.session.id, null)}><IconMessage size={15} /></IconButton>
        ))}
        {props.sessionTree.projectGroups.map((group) => (
          <IconButton key={group.project.id} testId={`workspace-project-${group.project.id}`} title={group.project.name} onClick={() => props.onSelectProject(group.project.id)}><IconFolder size={15} /></IconButton>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px", marginTop: "14px", paddingTop: "10px", borderTop: "1px solid var(--theme-color-border-secondary)" }}>
      <button type="button" data-testid="workspace-session-create" onClick={props.onCreateSession} style={primaryActionStyle}>
        <IconPlus size={14} />
        <span>{translate(props.language, "workspace.sessions.new")}</span>
      </button>
      <section data-testid="workspace-nav-global-sessions" style={{ display: "grid", gap: "4px" }}>
        <span style={eyebrowStyle}>{translate(props.language, "workspace.sessions.global")}</span>
        {props.sessionTree.globalGroup.sessions.length > 0
          ? props.sessionTree.globalGroup.sessions.map((item) => (
              <SessionButton key={item.session.id} testId={`workspace-global-session-${item.session.id}`} active={item.isSelected} label={item.session.title ?? translate(props.language, "workspace.assistant.ask")} icon={<IconMessage size={15} />} onClick={() => props.onSelectSession(item.session.id, null)} />
            ))
          : <p style={emptyStyle}>{translate(props.language, "workspace.noSessions")}</p>}
      </section>
      <section data-testid="workspace-nav-projects-section" style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={eyebrowStyle}>{translate(props.language, "workspace.projects")}</span>
          <IconButton testId="workspace-project-create" title={translate(props.language, "workspace.projects")} onClick={props.onCreateProject}><IconPlus size={14} /></IconButton>
        </div>
        {props.sessionTree.projectGroups.map((group) => (
          <div key={group.project.id} style={{ display: "grid", gap: "4px" }}>
            <SessionButton testId={`workspace-project-${group.project.id}`} active={group.isSelected} label={group.project.name} icon={<IconFolder size={15} />} onClick={() => props.onSelectProject(group.project.id)} />
            {group.sessions.map((item) => (
              <SessionButton key={item.session.id} testId={`workspace-project-session-${item.session.id}`} active={item.isSelected} indent label={item.session.title ?? translate(props.language, "workspace.sessions")} icon={<IconMessage size={14} />} onClick={() => props.onSelectSession(item.session.id, group.project.id)} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function IconButton(props: { testId: string; title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" data-testid={props.testId} title={props.title} onClick={props.onClick} style={{ minHeight: "30px", minWidth: "30px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "1px solid var(--theme-color-border-secondary)", background: "transparent", color: "var(--theme-color-text-secondary)" }}>{props.children}</button>;
}

function SessionButton(props: { testId: string; active: boolean; label: string; icon: ReactNode; indent?: boolean; onClick: () => void }) {
  return <button type="button" data-testid={props.testId} onClick={props.onClick} style={{ minHeight: "34px", textAlign: "left", padding: props.indent ? "0 12px 0 28px" : "0 12px", borderRadius: "9px", border: "none", background: props.active ? "color-mix(in srgb, var(--theme-color-panel-muted) 78%, transparent)" : "transparent", color: props.active ? "var(--theme-color-text-primary)" : "var(--theme-color-text-secondary)", fontSize: "13px", fontWeight: props.active ? 520 : 450, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "10px", maxWidth: "100%" }}>{props.icon}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.label}</span></span></button>;
}

const eyebrowStyle = { padding: "4px 12px 0", fontSize: "11px", lineHeight: 1.1, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--theme-color-text-muted)" };
const emptyStyle = { margin: 0, padding: "0 12px", fontSize: "12px", color: "var(--theme-color-text-muted)" };
const primaryActionStyle = { minHeight: "34px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--theme-color-border-secondary)", background: "color-mix(in srgb, var(--theme-color-panel-muted) 78%, transparent)", color: "var(--theme-color-text-primary)", fontSize: "13px", fontWeight: 520 };
