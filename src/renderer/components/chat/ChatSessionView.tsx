import { useCallback, useEffect, useRef } from "react";
import { translate } from "../../lib/i18n";
import type { ConversationScope, SessionMessage } from "../../lib/types";
import { IconSend } from "../workspace/TablerIcons";
import { MessageBody } from "../workspace-shell/markdown";

export function ChatSessionView(props: {
  language: "ru" | "en";
  scope: ConversationScope;
  activeSession: { id: string; title?: string | null } | null;
  onboardingKind: "user" | "project" | null;
  visibleMessages: SessionMessage[];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  isCreatingSession: boolean;
  isSendingMessage: boolean;
  errorMessage: string | null;
  toolMessage: string | null;
  isSendDisabled: boolean;
  sendDisabledReason: string | null;
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onSend: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus textarea when session becomes active and not in loading state
  useEffect(() => {
    if (props.activeSession && !props.isCreatingSession && !props.isSendingMessage) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [props.activeSession?.id, props.isCreatingSession, props.isSendingMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!props.isSendDisabled && !props.isSendingMessage) {
          props.onSend();
        }
      }
    },
    [props.isSendDisabled, props.isSendingMessage, props.onSend],
  );

  return (
    <section
      data-testid="chat-session-view"
      aria-label={translate(props.language, "chat.session.label")}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: "contain",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            padding: "24px 0",
            maxWidth: "780px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          {props.visibleMessages.length === 0 && !props.streamingAssistantText && !props.isLoadingMessages ? (
            <article style={bubbleStyle()}>
              <p style={metaStyle}>
                {translate(props.language, "chat.assistant")}
              </p>
              <div style={emptyContentStyle}>
                {props.onboardingKind
                  ? translate(
                      props.language,
                      props.onboardingKind === "user"
                        ? "userOnboarding.message"
                        : "projectOnboarding.message",
                    )
                  : translate(
                      props.language,
                      props.scope === "global"
                        ? "workspace.welcome"
                        : "workspace.projectWelcome",
                    )}
              </div>
            </article>
          ) : null}

          {props.visibleMessages.map((message) => (
            <article
              key={message.id}
              style={bubbleStyle(
                message.role === "user"
                  ? "user"
                  : message.role === "assistant"
                    ? "assistant"
                    : "system",
              )}
            >
              <p style={metaStyle}>
                {translate(
                  props.language,
                  message.role === "user" ? "chat.you" : "chat.assistant",
                )}
              </p>
              <MessageBody role={message.role} content={message.content_markdown} />
            </article>
          ))}

          {props.streamingAssistantText ? (
            <article style={bubbleStyle("assistant")}>
              <p style={metaStyle}>
                {translate(props.language, "chat.assistant")}
              </p>
              <MessageBody role="assistant" content={props.streamingAssistantText} />
            </article>
          ) : null}

          {props.isAwaitingAssistantStream && !props.streamingAssistantText ? (
            <article
              aria-label={translate(props.language, "chat.streaming.label")}
              style={bubbleStyle("assistant")}
            >
              <p style={metaStyle}>
                {translate(props.language, "chat.assistant")}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "24px" }}>
                <span style={dotStyle} />
                <span style={dotStyle} />
                <span style={dotStyle} />
              </div>
            </article>
          ) : null}

          {props.isLoadingMessages ? (
            <p style={statusStyle}>
              {translate(props.language, "chat.loading")}
            </p>
          ) : null}

          {props.isCreatingSession ? (
            <p style={statusStyle}>
              {translate(props.language, "chat.starting")}
            </p>
          ) : null}

          {props.errorMessage ? (
            <p style={errorStyle}>{props.errorMessage}</p>
          ) : null}

          <div ref={props.messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 16px 16px",
          borderTop: "1px solid var(--theme-color-border-secondary)",
          background: "linear-gradient(0deg, var(--theme-color-panel-start), transparent)",
        }}
      >
        {props.toolMessage ? (
          <p style={statusStyle}>{props.toolMessage}</p>
        ) : null}

        {props.isSendDisabled && props.sendDisabledReason ? (
          <p
            style={{
              margin: 0,
              marginBottom: "4px",
              fontSize: "var(--theme-font-size-caption)",
              color: "var(--theme-color-text-muted)",
              textAlign: "center",
            }}
          >
            {props.sendDisabledReason}
          </p>
        ) : null}

        <div
          className="sa-composer-row"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            maxWidth: "780px",
            margin: "0 auto",
            width: "100%",
            padding: "8px 14px",
            borderRadius: "var(--theme-radius-large)",
            background: "var(--theme-color-panel-muted)",
            border: "1px solid var(--theme-color-border-secondary)",
            transition: "border-color 150ms ease, box-shadow 150ms ease",
          }}
        >
          <textarea
            ref={textareaRef}
            className="sa-composer-input"
            aria-label={translate(props.language, "chat.input.placeholder")}
            value={props.draftMessage}
            onChange={(event) => props.onDraftMessageChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={props.isSendingMessage}
            placeholder={translate(
              props.language,
              props.onboardingKind
                ? "chat.placeholder.onboarding"
                : props.scope === "global"
                  ? "chat.placeholder.global"
                  : "chat.placeholder.project",
            )}
            style={{
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
            }}
          />
          <button
            type="button"
            className="sa-send-btn"
            aria-label={translate(props.language, "chat.send")}
            onClick={props.onSend}
            disabled={props.isSendDisabled || props.isSendingMessage}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              padding: 0,
              border: "none",
              borderRadius: "var(--theme-radius-medium)",
              background: props.isSendDisabled || props.isSendingMessage ? "var(--theme-color-border-secondary)" : "var(--theme-color-accent-primary)",
              color: props.isSendDisabled || props.isSendingMessage ? "var(--theme-color-text-muted)" : "var(--theme-color-text-inverse)",
              cursor: props.isSendDisabled || props.isSendingMessage ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <IconSend size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

function bubbleStyle(role?: "user" | "assistant" | "system"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "grid",
    gap: "8px",
    padding: "16px",
    borderRadius: "var(--theme-radius-large)",
    background: "var(--theme-color-panel-muted)",
    border: "1px solid var(--theme-color-border-secondary)",
  };
  if (role === "user") {
    return { ...base, background: "color-mix(in srgb, var(--theme-color-panel-start) 88%, transparent)" };
  }
  if (role === "system") {
    return { ...base, background: "color-mix(in srgb, var(--theme-color-status-info) 78%, transparent)" };
  }
  return base;
}

const metaStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "11px",
  color: "var(--theme-color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
};

const emptyContentStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.55,
  color: "var(--theme-color-text-primary)",
};

const dotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "var(--theme-color-accent-primary)",
  opacity: 0.7,
};

const statusStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 14px",
  borderRadius: "10px",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: "10px",
  background: "var(--theme-color-status-danger)",
  color: "var(--theme-color-status-danger-text)",
  fontSize: "12px",
};
