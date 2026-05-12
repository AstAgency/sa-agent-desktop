import { useEffect, useMemo, useRef, useState } from "react";
import { abortActiveTurn, sendMessage, setSelectedAgent } from "../state/controller";
import { selectActiveProject, selectActiveSession, useClientState } from "../state/store";
import { translate, type AppLanguage } from "../lib/i18n";
import type { Message } from "../lib/types";

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

  return (
    <main className="workspace chat-view">
      <header className="chat-header">
        <h2>{title}</h2>
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
        {showTypingIndicator ? <TypingIndicator language={language} /> : null}
        {!isLoading &&
        visibleMessages.length === 0 &&
        streamingText.length === 0 &&
        !showTypingIndicator ? (
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
      <div className="message-bubble">{message.content}</div>
    </div>
  );
}

function StreamingMessage({ text, language }: { text: string; language: AppLanguage }) {
  return (
    <div className="message-row assistant">
      <span className="message-role">{translate(language, "chat.role.assistant")}</span>
      <div className="message-bubble">{text}</div>
    </div>
  );
}

function TypingIndicator({ language }: { language: AppLanguage }) {
  return (
    <div className="message-row assistant" aria-live="polite">
      <span className="message-role">{translate(language, "chat.role.thinking")}</span>
      <div className="typing-bubble" aria-label={translate(language, "chat.role.thinking")}>
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
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
