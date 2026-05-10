import { translate } from "../../lib/i18n";
import type { ViewerProfile } from "../../lib/types";
import { IconDots, IconFiles, IconUser } from "../workspace/TablerIcons";

export function SidebarFooter(props: {
  language: "ru" | "en";
  collapsed: boolean;
  profile: ViewerProfile | null;
  onFilesClick: () => void;
  onProfileClick: () => void;
}) {
  const displayName = props.profile?.display_name ?? props.profile?.preferred_user_name ?? null;
  const email = props.profile?.email ?? null;

  return (
    <div
      aria-label={translate(props.language, "sidebar.footer.label")}
      style={{
        borderTop: "1px solid var(--theme-color-border-secondary)",
        flexShrink: 0,
      }}
    >
      {/* Files button */}
      <button
        type="button"
        className="sa-sidebar-item"
        aria-label={translate(props.language, "sidebar.files")}
        onClick={props.onFilesClick}
        title={translate(props.language, "sidebar.files")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: props.collapsed ? "center" : "flex-start",
          gap: "10px",
          width: "100%",
          padding: props.collapsed ? "10px 0" : "10px 12px",
          border: "none",
          borderBottom: "1px solid var(--theme-color-border-secondary)",
          background: "transparent",
          color: "var(--theme-color-text-secondary)",
          fontSize: "var(--theme-font-size-caption)",
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <IconFiles size={18} style={{ flexShrink: 0 }} />
        {!props.collapsed && (
          <span style={{ lineHeight: 1 }}>
            {translate(props.language, "sidebar.files")}
          </span>
        )}
      </button>

      {/* User card */}
      <button
        type="button"
        className="sa-sidebar-item"
        aria-label={translate(props.language, "sidebar.profile.label")}
        onClick={props.onProfileClick}
        title={displayName ?? email ?? undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: props.collapsed ? "center" : "flex-start",
          gap: "10px",
          width: "100%",
          padding: props.collapsed ? "10px 0" : "10px 12px",
          border: "none",
          background: "transparent",
          color: "var(--theme-color-text-primary)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "var(--theme-color-panel-muted)",
            border: "1px solid var(--theme-color-border-secondary)",
            flexShrink: 0,
          }}
        >
          <IconUser size={18} style={{ color: "var(--theme-color-text-muted)" }} />
        </div>
        {!props.collapsed && (
          <>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "1px",
              }}
            >
              <span
                style={{
                  fontSize: "var(--theme-font-size-caption)",
                  fontWeight: 500,
                  color: "var(--theme-color-text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName ?? translate(props.language, "profile.unknown")}
              </span>
              {email && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--theme-color-text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {email}
                </span>
              )}
            </div>
            <IconDots size={14} style={{ flexShrink: 0, color: "var(--theme-color-text-muted)", opacity: 0.6 }} />
          </>
        )}
      </button>
    </div>
  );
}
