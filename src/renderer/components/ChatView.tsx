import { useEffect, useMemo, useRef, useState } from "react";
import { abortActiveTurn, refreshBilling, sendMessage, setSelectedAgent } from "../state/controller";
import {
  selectActiveProject,
  selectActiveSession,
  setLastStreamError,
  useClientState,
} from "../state/store";
import { THINKING_WORDS, translate, type AppLanguage } from "../lib/i18n";
import type { Billing, Message } from "../lib/types";
import { Markdown } from "./Markdown";

const EMPTY_MESSAGES: Message[] = [];

export function ChatView() {
  const selection = useClientState((state) => state.selection);
  const session = useClientState(selectActiveSession);
  const project = useClientState(selectActiveProject);
  const agents = useClientState((state) => state.agents);
  const selectedAgentKey = useClientState((state) => state.selectedAgentKey);
  const language = useClientState((state) => state.language);
  const rawMessages = useClientState((state) =>
    state.selection.kind === "session"
      ? state.messagesBySession[state.selection.sessionId] ?? EMPTY_MESSAGES
      : EMPTY_MESSAGES,
  );
  const streamingText = useClientState((state) => state.streamingAssistantText);
  const sending = useClientState((state) => state.sendingMessage);
  const loadingSessionId = useClientState((state) => state.loadingSessionId);
  const billing = useClientState((state) => state.billing);
  const lastStreamError = useClientState((state) => state.lastStreamError);

  const visibleMessages = useMemo(() => filterVisibleMessages(rawMessages), [rawMessages]);

  if (selection.kind === "none") {
    return (
      <main className="workspace workspace-empty">
        <h1>{translate(language, "chat.selectSession")}</h1>
        <p>{translate(language, "chat.selectSessionHint")}</p>
      </main>
    );
  }

  const isNewSession = selection.kind === "new-global" || selection.kind === "new-project";
  const title = isNewSession
    ? selection.kind === "new-project"
      ? translate(language, "chat.newProject", { project: project?.name ?? "" })
      : translate(language, "chat.newGlobal")
    : session?.display_name ?? translate(language, "chat.loading");
  const isLoading = selection.kind === "session" && loadingSessionId === selection.sessionId;
  const sessionLabel = selection.kind === "session" ? selection.sessionId : "—";
  const scopeLabel = project
    ? translate(language, "chat.scope.project", { project: project.name })
    : translate(language, "chat.scope.global");

  const showTypingIndicator = sending && streamingText.length === 0;

  const showError =
    lastStreamError && selection.kind === "session" && lastStreamError.sessionId === selection.sessionId;

  return (
    <main className="workspace chat-view">
      <header className="chat-header">
        <div className="chat-header-top">
          <h2>{title}</h2>
          <BillingBadge billing={billing} language={language} />
        </div>
        <span className="meta">
          {scopeLabel} · {translate(language, "chat.session.id")}: {sessionLabel}
        </span>
      </header>

      <div className="chat-history">
        {isLoading ? <em>{translate(language, "chat.loadingHistory")}</em> : null}
        {visibleMessages.map((message) => (
          <MessageView key={message.id} message={message} language={language} />
        ))}
        {streamingText.length > 0 ? (
          <StreamingMessage text={streamingText} language={language} />
        ) : null}
        {showTypingIndicator ? <ThinkingIndicator language={language} /> : null}
        {showError ? (
          <StreamErrorBubble
            message={lastStreamError!.message}
            language={language}
            onDismiss={() => setLastStreamError(null)}
          />
        ) : null}
        {!isLoading &&
        visibleMessages.length === 0 &&
        streamingText.length === 0 &&
        !showTypingIndicator &&
        !showError ? (
          <p style={{ color: "var(--text-muted)" }}>
            {translate(language, "chat.typeToStart")}
            {isNewSession ? translate(language, "chat.derivedName") : ""}
          </p>
        ) : null}
        <BottomAnchor
          messages={visibleMessages}
          streamingText={streamingText}
          typing={showTypingIndicator}
        />
      </div>

      <Composer
        sending={sending}
        agents={agents}
        selectedAgentKey={selectedAgentKey}
        onSelectAgent={setSelectedAgent}
        language={language}
      />
    </main>
  );
}

function BillingBadge({
  billing,
  language,
}: {
  billing: Billing | null;
  language: AppLanguage;
}) {
  if (!billing) return null;
  return (
    <button
      type="button"
      className="billing-badge"
      onClick={() => {
        void refreshBilling();
      }}
      title={translate(language, "usage.refresh")}
    >
      <span className="billing-cell">
        <span className="label">{translate(language, "usage.hourly")}</span>
        <span className="value">
          {billing.hourly_usage}/{billing.max_hourly}
        </span>
      </span>
      <span className="billing-cell">
        <span className="label">{translate(language, "usage.daily")}</span>
        <span className="value">
          {billing.daily_usage}/{billing.max_daily}
        </span>
      </span>
      <span className="billing-cell">
        <span className="label">{translate(language, "usage.weekly")}</span>
        <span className="value">
          {billing.weekly_usage}/{billing.max_weekly}
        </span>
      </span>
    </button>
  );
}

function StreamErrorBubble({
  message,
  language,
  onDismiss,
}: {
  message: string;
  language: AppLanguage;
  onDismiss: () => void;
}) {
  return (
    <div className="message-row assistant" role="alert">
      <span className="message-role error">{translate(language, "chat.error.dismiss")}</span>
      <div className="message-bubble error-bubble">
        <span>{message}</span>
        <button type="button" className="link" onClick={onDismiss}>
          {translate(language, "chat.error.dismiss")}
        </button>
      </div>
    </div>
  );
}

function ThinkingIndicator({ language }: { language: AppLanguage }) {
  const word = useThinkingWord(language);
  return (
    <div className="message-row assistant" aria-live="polite">
      <span className="message-role">{translate(language, "chat.role.thinking")}</span>
      <div className="typing-bubble" aria-label={translate(language, "chat.role.thinking")}>
        <span className="thinking-word">{word}…</span>
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}

function useThinkingWord(language: AppLanguage): string {
  const list = THINKING_WORDS[language] ?? THINKING_WORDS.en;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    setIndex(Math.floor(Math.random() * list.length));
  }, [language, list.length]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % list.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [list.length]);
  return list[index] ?? list[0] ?? "";
}

function filterVisibleMessages(messages: Message[]): Message[] {
  return messages.filter((message) => {
    if (message.role === "tool" || message.role === "system") return false;
    if (message.content.trim().length === 0) return false;
    return true;
  });
}

function MessageView({ message, language }: { message: Message; language: AppLanguage }) {
  const roleLabel =
    message.role === "user"
      ? translate(language, "chat.role.user")
      : translate(language, "chat.role.assistant");
  return (
    <div className={`message-row ${message.role}`}>
      <span className="message-role">{roleLabel}</span>
      <div className="message-bubble">
        {message.role === "assistant" ? (
          <Markdown content={message.content} />
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}

function StreamingMessage({ text, language }: { text: string; language: AppLanguage }) {
  return (
    <div className="message-row assistant">
      <span className="message-role">{translate(language, "chat.role.assistant")}</span>
      <div className="message-bubble">
        <Markdown content={text} />
      </div>
    </div>
  );
}

function BottomAnchor({
  messages,
  streamingText,
  typing,
}: {
  messages: Message[];
  streamingText: string;
  typing: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText, typing]);
  return <div ref={ref} />;
}

function Composer(props: {
  sending: boolean;
  agents: Array<{ agent_key: string; display_name: string }>;
  selectedAgentKey: string | null;
  onSelectAgent: (agentKey: string | null) => void;
  language: AppLanguage;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const text = value.trim();
    if (text.length === 0) return;
    try {
      setValue("");
      await sendMessage(text);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setValue(text);
    }
  }

  return (
    <footer className="chat-composer">
      <textarea
        value={value}
        placeholder={translate(props.language, "chat.placeholder")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      {error ? <div className="error">{error}</div> : null}
      <div className="row">
        <label className="agent-select">
          {translate(props.language, "chat.agent")}
          <select
            value={props.selectedAgentKey ?? ""}
            onChange={(event) => props.onSelectAgent(event.target.value || null)}
          >
            <option value="">{translate(props.language, "chat.agent.default")}</option>
            {props.agents.map((agent) => (
              <option key={agent.agent_key} value={agent.agent_key}>
                {agent.display_name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {props.sending ? (
            <button className="secondary" onClick={abortActiveTurn}>
              {translate(props.language, "chat.stop")}
            </button>
          ) : null}
          <button disabled={props.sending || value.trim().length === 0} onClick={submit}>
            {props.sending
              ? translate(props.language, "chat.sending")
              : translate(props.language, "chat.sendHint")}
          </button>
        </div>
      </div>
    </footer>
  );
}
