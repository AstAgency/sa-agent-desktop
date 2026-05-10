import { useState } from "react";
import { translate } from "../../lib/i18n";
import type { ProjectSummary, SessionSummary } from "../../lib/types";
import { IconChevronDown, IconChevronRight, IconFolder, IconMessage, IconPlus } from "../workspace/TablerIcons";

type ProjectSessionGroup = {
  project: ProjectSummary;
  sessions: SessionSummary[];
};

export function ProjectsSection(props: {
  language: "ru" | "en";
  collapsed: boolean;
  projectGroups: ProjectSessionGroup[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onProjectClick: (projectId: string) => void;
  onSessionClick: (sessionId: string, projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <div
      aria-label={translate(props.language, "sidebar.projects.title")}
      style={{
        display: "flex",
        flexDirection: "column",
        borderBottom: "1px solid var(--theme-color-border-secondary)",
        flexShrink: 0,
        maxHeight: "50%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {!props.collapsed ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px 4px",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--theme-color-text-muted)",
            }}
          >
            {translate(props.language, "sidebar.projects.title")}
          </span>
          <button
            type="button"
            className="sa-sidebar-btn"
            aria-label={translate(props.language, "sidebar.projects.create")}
            onClick={props.onCreateProject}
            title={translate(props.language, "sidebar.projects.create")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              padding: 0,
              border: "none",
              borderRadius: "var(--theme-radius-medium)",
              background: "transparent",
              color: "var(--theme-color-text-muted)",
              cursor: "pointer",
            }}
          >
            <IconPlus size={14} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <IconFolder size={18} style={{ color: "var(--theme-color-text-muted)" }} />
        </div>
      )}

      {!props.collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px 8px", minHeight: 0 }}>
          {props.projectGroups.map((group) => (
            <ProjectGroup
              key={group.project.id}
              language={props.language}
              project={group.project}
              sessions={group.sessions}
              isSelected={group.project.id === props.selectedProjectId}
              selectedSessionId={props.selectedSessionId}
              onProjectClick={props.onProjectClick}
              onSessionClick={props.onSessionClick}
            />
          ))}
          {props.projectGroups.length === 0 && (
            <div
              style={{
                padding: "12px 8px",
                fontSize: "var(--theme-font-size-caption)",
                color: "var(--theme-color-text-muted)",
                textAlign: "center",
              }}
            >
              {translate(props.language, "sidebar.projects.empty")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectGroup(props: {
  language: "ru" | "en";
  project: ProjectSummary;
  sessions: SessionSummary[];
  isSelected: boolean;
  selectedSessionId: string | null;
  onProjectClick: (projectId: string) => void;
  onSessionClick: (sessionId: string, projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const MAX_VISIBLE = 3;
  const [showAll, setShowAll] = useState(false);
  const visibleSessions = showAll ? props.sessions : props.sessions.slice(0, MAX_VISIBLE);

  return (
    <div style={{ marginBottom: "6px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          width: "100%",
        }}
      >
        <button
          type="button"
          aria-label={expanded ? translate(props.language, "sidebar.projects.hide") : translate(props.language, "sidebar.projects.showAll")}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            padding: 0,
            border: "none",
            borderRadius: "4px",
            background: "transparent",
            color: "var(--theme-color-text-muted)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </button>
        <button
          type="button"
          className="sa-sidebar-item"
          aria-expanded={expanded}
          aria-label={props.project.name}
          onClick={() => {
            props.onProjectClick(props.project.id);
          }}
          title={`${props.project.name}${props.project.description ? `\n${props.project.description}` : ""}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            minWidth: 0,
            padding: "8px 10px",
            border: "none",
            borderRadius: "var(--theme-radius-medium)",
            background: props.isSelected ? "var(--theme-color-status-info)" : "transparent",
            color: "var(--theme-color-text-primary)",
            fontSize: "var(--theme-font-size-caption)",
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          <IconFolder size={16} style={{ flexShrink: 0, color: "var(--theme-color-accent-primary)", opacity: 0.8 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {props.project.name}
          </span>
        </button>
      </div>

      {expanded && (
        <div style={{ display: "grid", gap: "4px", paddingLeft: "22px", paddingTop: "4px" }}>
          {visibleSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className="sa-sidebar-item"
              onClick={() => props.onSessionClick(session.id, props.project.id)}
              title={session.title ?? undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "calc(100% - 12px)",
                marginLeft: "12px",
                padding: "7px 8px",
                border: "none",
                borderRadius: "var(--theme-radius-medium)",
                background: session.id === props.selectedSessionId ? "var(--theme-color-status-info)" : "transparent",
                color: session.id === props.selectedSessionId ? "var(--theme-color-accent-primary-bright)" : "var(--theme-color-text-secondary)",
                fontSize: "var(--theme-font-size-caption)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <IconMessage size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {session.title ?? session.id}
              </span>
            </button>
          ))}
          {props.sessions.length === 0 && (
            <div style={{ padding: "6px 8px 6px 12px", fontSize: "11px", color: "var(--theme-color-text-muted)", fontStyle: "italic" }}>
              {translate(props.language, "sidebar.projects.noSessions")}
            </div>
          )}
          {props.sessions.length > MAX_VISIBLE && !showAll && (
            <button
              type="button"
              className="sa-sidebar-item"
              onClick={() => setShowAll(true)}
              style={{
                display: "block",
                width: "calc(100% - 12px)",
                marginLeft: "12px",
                padding: "6px 8px",
                border: "none",
                borderRadius: "var(--theme-radius-medium)",
                background: "transparent",
                color: "var(--theme-color-accent-primary-bright)",
                fontSize: "11px",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              {translate(props.language, "sidebar.projects.showAll")} ({props.sessions.length - MAX_VISIBLE})
            </button>
          )}
          {showAll && props.sessions.length > MAX_VISIBLE && (
            <button
              type="button"
              className="sa-sidebar-item"
              onClick={() => setShowAll(false)}
              style={{
                display: "block",
                width: "calc(100% - 12px)",
                marginLeft: "12px",
                padding: "6px 8px",
                border: "none",
                borderRadius: "var(--theme-radius-medium)",
                background: "transparent",
                color: "var(--theme-color-accent-primary-bright)",
                fontSize: "11px",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              {translate(props.language, "sidebar.projects.hide")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
