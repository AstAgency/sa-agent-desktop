import { useEffect, useMemo, useRef, useState } from "react";
import { abortActiveTurn, refreshBilling, sendMessage, setSelectedAgent } from "../state/controller";
import {
  selectActiveProject,
  selectActiveSession,
  setLastStreamError,
  useClientState,
} from "../state/store";
import { THINKING_WORDS, translate, type AppLanguage } from "../lib/i18n";
import type { Billing, Message, OpenAIToolCallRecord } from "../lib/types";
import type { RuntimeTraceEvent } from "../agent/runtime";
import { Markdown } from "./Markdown";

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TRACE: RuntimeTraceEvent[] = [];

/**
 * One user → assistant cycle. Intermediate assistant turns (those with
 * tool_calls) and tool result messages live inside `traceMessages` and are
 * surfaced via the collapsible "Ход выполнения" block. Only `userMessage`
 * and `finalAssistant` are shown in the main chat thread.
 */
type ChatTurn = {
  key: string;
  userMessage: Message | null;
  traceMessages: Message[];
  finalAssistant: Message | null;
};

function groupTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  const flush = () => {
    if (current) turns.push(current);
    current = null;
  };
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      flush();
      current = {
        key: `turn-${message.id}`,
        userMessage: message,
        traceMessages: [],
        finalAssistant: null,
      };
      continue;
    }
    if (!current) {
      current = {
        key: `turn-orphan-${message.id}`,
        userMessage: null,
        traceMessages: [],
        finalAssistant: null,
      };
    }
    if (message.role === "tool") {
      current.traceMessages.push(message);
      continue;
    }
    if (message.role === "assistant") {
      const hasToolCalls = (message.tool_calls?.length ?? 0) > 0;
      if (hasToolCalls) {
        current.traceMessages.push(message);
      } else {
        if (current.finalAssistant !== null) {
          current.traceMessages.push(current.finalAssistant);
        }
        current.finalAssistant = message;
      }
    }
  }
  flush();
  return turns;
}

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
  const streamingFinalText = useClientState((state) => state.streamingFinalText);
  const runtimeTrace = useClientState((state) => state.runtimeTrace ?? EMPTY_TRACE);
  const sending = useClientState((state) => state.sendingMessage);
  const loadingSessionId = useClientState((state) => state.loadingSessionId);
  const billing = useClientState((state) => state.billing);
  const lastStreamError = useClientState((state) => state.lastStreamError);

  const turns = useMemo(() => groupTurns(rawMessages), [rawMessages]);

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
        {turns.map((turn) => (
          <TurnView key={turn.key} turn={turn} language={language} />
        ))}
        {sending ? (
          <LiveTurn
            trace={runtimeTrace}
            streamingFinalText={streamingFinalText}
            language={language}
          />
        ) : null}
        {showError ? (
          <StreamErrorBubble
            message={lastStreamError!.message}
            language={language}
            onDismiss={() => setLastStreamError(null)}
          />
        ) : null}
        {!isLoading &&
        turns.length === 0 &&
        !sending &&
        !showError ? (
          <p style={{ color: "var(--text-muted)" }}>
            {translate(language, "chat.typeToStart")}
            {isNewSession ? translate(language, "chat.derivedName") : ""}
          </p>
        ) : null}
        <BottomAnchor
          turnsLength={turns.length}
          streamingFinalText={streamingFinalText}
          traceLength={runtimeTrace.length}
          sending={sending}
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

function TurnView({ turn, language }: { turn: ChatTurn; language: AppLanguage }) {
  const trace = useMemo(() => buildHistoricalTrace(turn.traceMessages), [turn.traceMessages]);
  return (
    <div className="chat-turn">
      {turn.userMessage ? <MessageView message={turn.userMessage} language={language} /> : null}
      {trace.length > 0 ? (
        <RuntimeBlock
          trace={trace}
          language={language}
          live={false}
          defaultExpanded={false}
        />
      ) : null}
      {turn.finalAssistant ? (
        <MessageView message={turn.finalAssistant} language={language} />
      ) : null}
    </div>
  );
}

function LiveTurn({
  trace,
  streamingFinalText,
  language,
}: {
  trace: RuntimeTraceEvent[];
  streamingFinalText: string;
  language: AppLanguage;
}) {
  return (
    <div className="chat-turn live">
      <RuntimeBlock trace={trace} language={language} live defaultExpanded={trace.length > 0} />
      {streamingFinalText.length > 0 ? (
        <div className="message-row assistant">
          <span className="message-role">{translate(language, "chat.role.assistant")}</span>
          <div className="message-bubble">
            <Markdown content={streamingFinalText} />
          </div>
        </div>
      ) : (
        <LiveThinkingIndicator language={language} />
      )}
    </div>
  );
}

function LiveThinkingIndicator({ language }: { language: AppLanguage }) {
  const word = useThinkingWord(language);
  return (
    <div className="message-row assistant" aria-live="polite">
      <span className="message-role">{translate(language, "chat.role.thinking")}</span>
      <div className="typing-bubble">
        <span className="thinking-word">{word}…</span>
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}

function RuntimeBlock({
  trace,
  language,
  live,
  defaultExpanded,
}: {
  trace: RuntimeTraceEvent[];
  language: AppLanguage;
  live: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className={`runtime-block${live ? " live" : ""}`} aria-live={live ? "polite" : undefined}>
      <button
        type="button"
        className="runtime-block-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={`chevron ${expanded ? "open" : ""}`} aria-hidden="true" />
        <span className="runtime-block-title">
          {translate(language, "chat.runtime.title")}
        </span>
        <span className="runtime-block-count">{trace.length}</span>
      </button>
      {expanded ? (
        <div className="runtime-block-body">
          {trace.length === 0 ? (
            <span className="runtime-empty">
              {translate(language, "chat.runtime.empty")}
            </span>
          ) : (
            trace.map((event) => (
              <RuntimeEvent key={event.id} event={event} language={language} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeEvent({
  event,
  language,
}: {
  event: RuntimeTraceEvent;
  language: AppLanguage;
}) {
  if (event.kind === "reasoning") {
    return (
      <div className="runtime-event reasoning">
        <span className="runtime-event-label">
          {translate(language, "chat.runtime.reasoning")}
        </span>
        <div className="runtime-event-body">
          <Markdown content={event.text} />
        </div>
      </div>
    );
  }
  return (
    <div className={`runtime-event tool status-${event.status}`}>
      <div className="runtime-event-header">
        <span className="runtime-event-label">
          {translate(language, "chat.runtime.tool")}
        </span>
        <code className="runtime-event-name">{event.name}</code>
        <span className={`status-badge status-${event.status}`}>
          {translate(language, `chat.runtime.status.${event.status}` as never)}
        </span>
      </div>
      {event.argsJson.length > 0 ? (
        <details className="runtime-args">
          <summary>{translate(language, "chat.runtime.args")}</summary>
          <pre>{event.argsJson}</pre>
        </details>
      ) : null}
      {event.result !== undefined && event.result.length > 0 ? (
        <details className="runtime-result">
          <summary>{translate(language, "chat.runtime.result")}</summary>
          <pre>{event.result}</pre>
        </details>
      ) : null}
      {event.error !== undefined && event.error.length > 0 ? (
        <div className="runtime-error">
          <span className="runtime-event-label">
            {translate(language, "chat.runtime.toolError")}
          </span>
          <pre>{event.error}</pre>
        </div>
      ) : null}
    </div>
  );
}

/**
 * For previously-completed turns we don't have the live trace anymore — it's
 * not persisted. But we can reconstruct a useful approximation from the
 * stored intermediate assistant messages + their tool_calls + tool results.
 */
function buildHistoricalTrace(traceMessages: Message[]): RuntimeTraceEvent[] {
  const events: RuntimeTraceEvent[] = [];
  const resultsByCallId = new Map<string, { text: string; isError: boolean }>();
  for (const message of traceMessages) {
    if (message.role !== "tool") continue;
    const callId = message.tool_call_id ?? "";
    if (!callId) continue;
    resultsByCallId.set(callId, {
      text: message.content,
      isError: false,
    });
  }
  let counter = 0;
  for (const message of traceMessages) {
    if (message.role !== "assistant") continue;
    if (message.content.trim().length > 0) {
      counter += 1;
      events.push({
        kind: "reasoning",
        id: `hist-reasoning-${message.id}`,
        round: counter,
        text: message.content,
        at: Date.parse(message.created_at) || 0,
      });
    }
    const toolCalls: OpenAIToolCallRecord[] = message.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      counter += 1;
      const result = resultsByCallId.get(toolCall.id);
      events.push({
        kind: "tool_call",
        id: `hist-tool-${toolCall.id}`,
        round: counter,
        toolCallId: toolCall.id,
        name: toolCall.function?.name ?? "",
        argsJson: prettifyJson(toolCall.function?.arguments ?? ""),
        status: result ? (result.isError ? "error" : "success") : "success",
        result: result ? result.text : undefined,
        at: Date.parse(message.created_at) || 0,
      });
    }
  }
  return events;
}

function prettifyJson(value: string): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
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

function BottomAnchor({
  turnsLength,
  streamingFinalText,
  traceLength,
  sending,
}: {
  turnsLength: number;
  streamingFinalText: string;
  traceLength: number;
  sending: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnsLength, streamingFinalText, traceLength, sending]);
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
            <option key="__default__" value="">
              {translate(props.language, "chat.agent.default")}
            </option>
            {props.agents.map((agent, index) => (
              <option key={agent.agent_key || `agent-${index}`} value={agent.agent_key}>
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
