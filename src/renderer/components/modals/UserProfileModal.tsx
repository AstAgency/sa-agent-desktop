import { useEffect, useRef } from "react";
import { translate } from "../../lib/i18n";
import type { ViewerProfile } from "../../lib/types";
import { IconUser } from "../workspace/TablerIcons";

export function UserProfileModal(props: {
  language: "ru" | "en";
  profile: ViewerProfile;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        props.onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [props.onClose]);

  // Focus trap on mount
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const displayName = props.profile.display_name ?? props.profile.preferred_user_name ?? translate(props.language, "profile.unknown");
  const email = props.profile.email ?? translate(props.language, "profile.unknown");

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={translate(props.language, "profile.title")}
      onClick={(e) => {
        if (e.target === backdropRef.current) {
          props.onClose();
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        animation: "saFadeIn 160ms ease",
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          width: "min(90vw, 380px)",
          padding: "32px 28px 24px",
          borderRadius: "var(--theme-radius-xlarge)",
          background: "linear-gradient(160deg, var(--theme-color-panel-start), var(--theme-color-panel-end))",
          border: "1px solid var(--theme-color-border-primary)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          animation: "saFadeInScale 200ms ease",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "var(--theme-color-panel-muted)",
            border: "2px solid var(--theme-color-border-secondary)",
            marginBottom: "16px",
          }}
        >
          <IconUser size={36} style={{ color: "var(--theme-color-text-muted)" }} />
        </div>

        {/* Name & Email */}
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: "20px",
            fontWeight: 600,
            color: "var(--theme-color-text-primary)",
          }}
        >
          {displayName}
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: "var(--theme-font-size-caption)",
            color: "var(--theme-color-text-muted)",
          }}
        >
          {email}
        </p>

        {/* Details */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "16px 0",
            borderTop: "1px solid var(--theme-color-border-secondary)",
            borderBottom: "1px solid var(--theme-color-border-secondary)",
            marginBottom: "20px",
          }}
        >
          {props.profile.activity_domain && (
            <DetailRow
              label={translate(props.language, "profile.domain")}
              value={props.profile.activity_domain}
            />
          )}
          <DetailRow
            label={translate(props.language, "profile.userId")}
            value={props.profile.user_id}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
          <button
            type="button"
            className="sa-sidebar-btn"
            onClick={() => {
              props.onClose();
              props.onOpenSettings();
            }}
            style={actionButtonStyle}
          >
            {translate(props.language, "profile.settings")}
          </button>
          <button
            type="button"
            className="sa-sidebar-btn"
            onClick={props.onClose}
            style={{ ...actionButtonStyle, ...actionSecondaryStyle }}
          >
            {translate(props.language, "profile.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      <span
        style={{
          fontSize: "var(--theme-font-size-caption)",
          color: "var(--theme-color-text-muted)",
          fontWeight: 500,
        }}
      >
        {props.label}
      </span>
      <span
        style={{
          fontSize: "var(--theme-font-size-caption)",
          color: "var(--theme-color-text-secondary)",
          fontFamily: "var(--theme-font-mono)",
          maxWidth: "180px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {props.value}
      </span>
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  height: "40px",
  padding: "0 16px",
  border: "1px solid var(--theme-color-border-primary)",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const actionSecondaryStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--theme-color-border-secondary)",
  color: "var(--theme-color-text-secondary)",
};
