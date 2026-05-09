import { MessageBody } from "./markdown";
import { translate } from "../../lib/i18n";
import type { AppLanguage, ConversationScope, SessionMessage } from "../../lib/types";
import {
  assistantMessageStyle,
  chatStyle,
  composerHintStyle,
  composerStyle,
  errorStyle,
  messageMetaStyle,
  messagesStyle,
  primaryButtonStyle,
  statusStyle,
  streamingDotStyle,
  streamingLoaderStyle,
  systemMessageStyle,
  textareaStyle,
  threadEyebrowStyle,
  threadHeaderCopyStyle,
  threadHeaderRowStyle,
  threadHeaderStyle,
  threadMetaPillStyle,
  threadPillsRowStyle,
  threadTitleStyle,
  threadViewStyle,
  userMessageStyle,
} from "./threadStyles";

export function ThreadWorkspace(props: {
  language: AppLanguage;
  scope: ConversationScope;
  title: string;
  executionStatusLabel: string;
  scopeLabel: string;
  onboardingKind: "user" | "project" | null;
  visibleMessages: SessionMessage[];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  isCreatingSession: boolean;
  errorMessage: string | null;
  toolMessage: string | null;
  isSendDisabled: boolean;
  sendDisabledReason: string | null;
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onSend: () => void;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section data-testid="workspace-thread-view" style={threadViewStyle}>
      <header style={threadHeaderStyle}>
        <div style={threadHeaderRowStyle}>
          <div style={threadHeaderCopyStyle}>
            <p style={threadEyebrowStyle}>{translate(props.language, "workspace.thread.eyebrow")}</p>
            <h2 style={threadTitleStyle}>{props.title}</h2>
          </div>
          <div style={threadPillsRowStyle}>
            <span data-testid="thread-execution-state" style={threadMetaPillStyle}>{props.executionStatusLabel}</span>
            <span data-testid="thread-memory-scope" style={threadMetaPillStyle}>{props.scopeLabel}</span>
          </div>
        </div>
      </header>
      <div style={chatStyle}>
        <div data-testid="workspace-thread-stream" ref={props.messagesContainerRef} style={messagesStyle}>
          {props.visibleMessages.length === 0 && !props.streamingAssistantText ? (
            <article style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(props.language, "chat.assistant")}</p>
              <div style={{ margin: 0, fontSize: "14px", lineHeight: 1.55, color: "var(--theme-color-text-primary)" }}>
                {props.onboardingKind
                  ? translate(props.language, props.onboardingKind === "user" ? "userOnboarding.message" : "projectOnboarding.message")
                  : translate(props.language, props.scope === "global" ? "workspace.welcome" : "workspace.projectWelcome")}
              </div>
            </article>
          ) : null}
          {props.visibleMessages.map((message) => (
            <article key={message.id} style={message.role === "user" ? userMessageStyle : message.role === "assistant" ? assistantMessageStyle : systemMessageStyle}>
              <p style={messageMetaStyle}>{translate(props.language, message.role === "user" ? "chat.you" : "chat.assistant")}</p>
              <MessageBody role={message.role} content={message.content_markdown} />
            </article>
          ))}
          {props.streamingAssistantText ? (
            <article style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(props.language, "chat.assistant")}</p>
              <MessageBody role="assistant" content={props.streamingAssistantText} />
            </article>
          ) : null}
          {props.isAwaitingAssistantStream && !props.streamingAssistantText ? (
            <article aria-label="Assistant is streaming" style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(props.language, "chat.assistant")}</p>
              <div style={streamingLoaderStyle}><span style={streamingDotStyle} /><span style={streamingDotStyle} /><span style={streamingDotStyle} /></div>
            </article>
          ) : null}
          {props.isLoadingMessages ? <p style={statusStyle}>{translate(props.language, "chat.loading")}</p> : null}
          {props.isCreatingSession ? <p style={statusStyle}>{translate(props.language, "chat.starting")}</p> : null}
          {props.errorMessage ? <p style={errorStyle}>{props.errorMessage}</p> : null}
          <div ref={props.messagesEndRef} />
        </div>
        <div data-testid="workspace-thread-composer" style={composerStyle}>
          {props.toolMessage ? <p style={statusStyle}>{props.toolMessage}</p> : null}
          {props.isSendDisabled && props.sendDisabledReason ? <p style={composerHintStyle}>{props.sendDisabledReason}</p> : null}
          <textarea
            value={props.draftMessage}
            onChange={(event) => props.onDraftMessageChange(event.target.value)}
            placeholder={translate(props.language, props.onboardingKind ? "chat.placeholder.onboarding" : props.scope === "global" ? "chat.placeholder.global" : "chat.placeholder.project")}
            style={textareaStyle}
          />
          <button type="button" onClick={props.onSend} disabled={props.isSendDisabled} style={primaryButtonStyle(props.isSendDisabled)}>
            {translate(props.language, "chat.send")}
          </button>
        </div>
      </div>
    </section>
  );
}
