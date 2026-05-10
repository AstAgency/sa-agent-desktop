import { useCallback, useEffect, useRef, useState } from "react";
import { translate } from "../../lib/i18n";
import { IconSend, IconSparkles } from "../workspace/TablerIcons";

export function WelcomeScreen(props: {
  language: "ru" | "en";
  workspaceName: string;
  onSendMessage: (message: string) => void;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus textarea on mount
  useEffect(() => {
    if (!props.isSending) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [props.isSending]);

  const handleSubmit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || props.isSending) {
      return;
    }
    props.onSendMessage(trimmed);
    setDraft("");
  }, [draft, props]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <section aria-label={translate(props.language, "welcome.title")} style={containerStyle}>
      <div style={contentStyle}>
        <div style={iconCircleStyle}>
          <IconSparkles size={36} style={{ color: "var(--theme-color-accent-primary)" }} />
        </div>

        <h1 style={titleStyle}>{translate(props.language, "welcome.title")}</h1>

        <p style={descriptionStyle}>
          {translate(props.language, "welcome.description")}
        </p>

        <div style={hintsContainerStyle}>
          <span style={hintStyle}>
            {translate(props.language, "welcome.hintGlobal")}
          </span>
          <span style={hintStyle}>
            {translate(props.language, "welcome.hintProjects")}
          </span>
        </div>
      </div>

      <div style={inputContainerStyle}>
        <div className="sa-composer-row" style={inputWrapperStyle}>
          <textarea
            ref={textareaRef}
            className="sa-composer-input"
            aria-label={translate(props.language, "welcome.input.placeholder")}
            placeholder={translate(props.language, "welcome.input.placeholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={props.isSending}
            style={textareaStyle}
          />
          <button
            type="button"
            className="sa-send-btn"
            aria-label={translate(props.language, "chat.send")}
            onClick={handleSubmit}
            disabled={draft.trim().length === 0 || props.isSending}
            style={{
              ...sendButtonStyle,
              ...(draft.trim().length === 0 || props.isSending ? sendButtonDisabledStyle : {}),
            }}
          >
            <IconSend size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "40px 24px",
  gap: "32px",
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  maxWidth: "560px",
};

const iconCircleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  background:
    "radial-gradient(circle, var(--theme-color-accent-primary)22, transparent 70%)",
  marginBottom: "20px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "var(--theme-color-text-primary)",
};

const descriptionStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-secondary)",
};

const hintsContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginTop: "16px",
};

const hintStyle: React.CSSProperties = {
  fontSize: "var(--theme-font-size-caption)",
  color: "var(--theme-color-text-muted)",
};

const inputContainerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "680px",
};

const inputWrapperStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: "8px",
  padding: "8px 12px",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-muted)",
  border: "1px solid var(--theme-color-border-secondary)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
  transition: "border-color 150ms ease, box-shadow 150ms ease",
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: "28px",
  maxHeight: "160px",
  padding: "6px 4px",
  border: "none",
  background: "transparent",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-body)",
  fontFamily: "inherit",
  lineHeight: 1.5,
  outline: "none",
  resize: "none",
  overflowY: "auto",
};

const sendButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  padding: 0,
  border: "none",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-accent-primary)",
  color: "var(--theme-color-text-inverse)",
  cursor: "pointer",
  flexShrink: 0,
};

const sendButtonDisabledStyle: React.CSSProperties = {
  background: "var(--theme-color-border-secondary)",
  color: "var(--theme-color-text-muted)",
  cursor: "not-allowed",
};
