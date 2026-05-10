import { translate } from "../../lib/i18n";
import type { SessionSummary } from "../../lib/types";
import { IconMessage, IconPlus } from "../workspace/TablerIcons";

export function GlobalSessionsSection(props: {
  language: "ru" | "en";
  collapsed: boolean;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSessionClick: (sessionId: string) => void;
  onNewChat: () => void;
}) {
  return (
    <div
      aria-label={translate(props.language, "sidebar.globalSessions.title")}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
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
            {translate(props.language, "sidebar.globalSessions.title")}
          </span>
          <button
            type="button"
            className="sa-sidebar-btn"
            aria-label={translate(props.language, "sidebar.globalSessions.newChat")}
            onClick={props.onNewChat}
            title={translate(props.language, "sidebar.globalSessions.newChat")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              height: "24px",
              padding: "0 8px",
              border: "1px solid var(--theme-color-border-secondary)",
              borderRadius: "var(--theme-radius-medium)",
              background: "transparent",
              color: "var(--theme-color-accent-primary)",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
            }}
          >
            <IconPlus size={14} />
            <span style={{ lineHeight: 1 }}>
              {translate(props.language, "sidebar.globalSessions.newChat")}
            </span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
          <IconMessage size={18} style={{ color: "var(--theme-color-text-muted)" }} />
        </div>
      )}

      {!props.collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px 8px", minHeight: 0 }}>
          {props.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className="sa-sidebar-item"
              onClick={() => props.onSessionClick(session.id)}
              title={session.title ?? undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
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
            <div
              style={{
                padding: "12px 8px",
                fontSize: "var(--theme-font-size-caption)",
                color: "var(--theme-color-text-muted)",
                textAlign: "center",
              }}
            >
              {translate(props.language, "sidebar.globalSessions.empty")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
