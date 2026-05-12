import { useEffect, useRef, useState } from "react";
import { abortActiveTurn, sendMessage, setSelectedAgent } from "../state/controller";
import { selectActiveProject, selectActiveSession, useClientState } from "../state/store";
import type { Message } from "../lib/types";

const EMPTY_MESSAGES: Message[] = [];

export function ChatView() {
  const selection = useClientState((state) => state.selection);
  const session = useClientState(selectActiveSession);
  const project = useClientState(selectActiveProject);
  const agents = useClientState((state) => state.agents);
  const selectedAgentKey = useClientState((state) => state.selectedAgentKey);
  const messages = useClientState((state) =>
    state.selection.kind === "session"
      ? state.messagesBySession[state.selection.sessionId] ?? EMPTY_MESSAGES
      : EMPTY_MESSAGES,
  );
  const streamingText = useClientState((state) => state.streamingAssistantText);
  const sending = useClientState((state) => state.sendingMessage);
  const loadingSessionId = useClientState((state) => state.loadingSessionId);

  if (selection.kind === "none") {
    return (
      <main className="workspace workspace-empty">
        <h1>Select a session</h1>
        <p>Pick a global session, open a project, or start a new chat from the sidebar.</p>
      </main>
    );
  }

  const isNewSession = selection.kind === "new-global" || selection.kind === "new-project";
  const title = isNewSession
    ? selection.kind === "new-project"
      ? `New chat in ${project?.name ?? "project"}`
      : "New global chat"
    : session?.display_name ?? "Loading…";
  const isLoading = selection.kind === "session" && loadingSessionId === selection.sessionId;

  return (
    <main className="workspace chat-view">
      <header className="chat-header">
        <h2>{title}</h2>
        <span className="meta">
          {project ? `project: ${project.name}` : "global"} · session-id: {selection.kind === "session" ? selection.sessionId : "—"}
        </span>
      </header>

      <div className="chat-history">
        {isLoading ? <em>loading history…</em> : null}
        {messages.map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {streamingText.length > 0 ? <StreamingMessage text={streamingText} /> : null}
        {!isLoading && messages.length === 0 && streamingText.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            Type a message below to start.{isNewSession ? " The display name will be derived from your first message." : ""}
          </p>
        ) : null}
        <BottomAnchor messages={messages} streamingText={streamingText} />
      </div>

      <Composer
        sending={sending}
        agents={agents}
        selectedAgentKey={selectedAgentKey}
        onSelectAgent={setSelectedAgent}
      />
    </main>
  );
}

function MessageView({ message }: { message: Message }) {
  return (
    <div className={`message-row ${message.role}`}>
      <span className="message-role">{message.role}</span>
      <div className="message-bubble">{message.content}</div>
    </div>
  );
}

function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="message-row assistant">
      <span className="message-role">assistant · streaming</span>
      <div className="message-bubble">{text}</div>
    </div>
  );
}

function BottomAnchor({ messages, streamingText }: { messages: Message[]; streamingText: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);
  return <div ref={ref} />;
}

function Composer(props: {
  sending: boolean;
  agents: Array<{ agent_key: string; display_name: string }>;
  selectedAgentKey: string | null;
  onSelectAgent: (agentKey: string | null) => void;
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
        placeholder="Send a message…"
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
          Agent
          <select
            value={props.selectedAgentKey ?? ""}
            onChange={(event) => props.onSelectAgent(event.target.value || null)}
          >
            <option value="">(default)</option>
            {props.agents.map((agent) => (
              <option key={agent.agent_key} value={agent.agent_key}>
                {agent.display_name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {props.sending ? (
            <button onClick={abortActiveTurn} style={{ background: "var(--bg-elevated-strong)" }}>
              Stop
            </button>
          ) : null}
          <button disabled={props.sending || value.trim().length === 0} onClick={submit}>
            {props.sending ? "Sending…" : "Send (⌘/Ctrl + ↵)"}
          </button>
        </div>
      </div>
    </footer>
  );
}
