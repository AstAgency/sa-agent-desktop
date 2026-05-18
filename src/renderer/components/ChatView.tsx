import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import {
  abortActiveTurn,
  refreshBilling,
  sendMessage,
  setSelectedAgent,
  startNewGlobalSession,
} from "../state/controller";
import { getBridge } from "../lib/bridge";
import {
  selectActiveProject,
  selectActiveSession,
  setLastStreamError,
  useClientState,
} from "../state/store";
import { THINKING_WORDS, translate, type AppLanguage } from "../lib/i18n";
import type { Billing, Message } from "../lib/types";
import type { RuntimeTraceEvent } from "../agent/runtime";
import { Markdown } from "./Markdown";
import {
  buildHistoricalTrace,
  DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS,
  extractRenderedUserMessageParts,
  getVisibleTurns,
  groupTurns,
  isAtBottom,
  MAX_COMBINED_MESSAGE_BYTES,
  parseAllowedAttachmentExtensions,
  type ComposerAttachment,
  validateAttachmentSizes,
  validateAttachmentTypes,
  type ChatTurn,
} from "./chat-view-helpers";
import { IconArrowDown, IconPaperclip } from "./icons";

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TRACE: RuntimeTraceEvent[] = [];

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
  const visibleTurns = useMemo(() => getVisibleTurns(turns, sending), [turns, sending]);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const selectionKey =
    selection.kind === "session"
      ? `session:${selection.sessionId}`
      : selection.kind === "new-project"
        ? `new-project:${selection.projectId}`
        : selection.kind;
  const { isPinnedToBottom, scrollToBottom } = useStickyBottom(historyRef, {
    selectionKey,
    sending,
    contentVersion: `${visibleTurns.length}:${runtimeTrace.length}:${streamingFinalText.length}:${Number(Boolean(lastStreamError))}`,
  });
  const showLanding = selection.kind === "none";

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
      {!showLanding ? (
        <header className="chat-header">
          <div className="chat-header-top">
            <h2>{title}</h2>
            <BillingBadge billing={billing} language={language} />
          </div>
          <span className="meta">
            {scopeLabel} · {translate(language, "chat.session.id")}: {sessionLabel}
          </span>
        </header>
      ) : null}

      <div ref={historyRef} className="chat-history">
        {showLanding ? (
          <div className="workspace-empty landing-state">
            <h1>{translate(language, "chat.empty.greeting")}</h1>
            <p>{translate(language, "chat.selectSessionHint")}</p>
          </div>
        ) : (
          <>
            {isLoading ? <em>{translate(language, "chat.loadingHistory")}</em> : null}
            {visibleTurns.map((turn) => (
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
            visibleTurns.length === 0 &&
            !sending &&
            !showError ? (
              <p style={{ color: "var(--text-muted)" }}>
                {translate(language, "chat.typeToStart")}
                {isNewSession ? translate(language, "chat.derivedName") : ""}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="chat-composer-shell">
        {!isPinnedToBottom ? (
          <button
            type="button"
            className="scroll-to-latest"
            onClick={scrollToBottom}
            aria-label={translate(language, "chat.scrollToLatest")}
            title={translate(language, "chat.scrollToLatest")}
          >
            <IconArrowDown />
            <span>{translate(language, "chat.scrollToLatest")}</span>
          </button>
        ) : null}
        <Composer
          sending={sending}
          agents={agents}
          selectedAgentKey={selectedAgentKey}
          onSelectAgent={setSelectedAgent}
          language={language}
          hideStop={showLanding}
          onSubmitMessage={
            showLanding
              ? async (text, attachments) => {
                  startNewGlobalSession();
                  await sendMessage(text, attachments);
                }
              : undefined
          }
        />
      </div>
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
      {turn.reasoningMessages.map((message) => (
        <MessageView key={message.id} message={message} language={language} />
      ))}
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

function useThinkingWord(language: AppLanguage): string {
  const list = THINKING_WORDS[language] ?? THINKING_WORDS.en;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => {
    setIndex(Math.floor(Math.random() * list.length));
  }, [language, list.length]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % list.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [list.length]);
  return list[index] ?? list[0] ?? "";
}

function MessageView({ message, language }: { message: Message; language: AppLanguage }) {
  const rendered =
    message.role === "user"
      ? extractRenderedUserMessageParts(message.content)
      : { attachments: [], text: message.content };
  const roleLabel =
    message.role === "user"
      ? translate(language, "chat.role.user")
      : translate(language, "chat.role.assistant");
  return (
    <div className={`message-row ${message.role}`}>
      <span className="message-role">{roleLabel}</span>
      {message.role === "user" && rendered.attachments.length > 0 ? (
        <div className="message-bubble attachment-bubble">
          {rendered.attachments.map((attachment) => (
            <div key={`${attachment.workspacePath}-${attachment.name}`} className="attachment-bubble-item">
              <strong>{attachment.name}</strong> ({attachment.size} bytes, {attachment.mime})
            </div>
          ))}
        </div>
      ) : null}
      {rendered.text.length > 0 ? (
        <div className="message-bubble">
          {message.role === "assistant" ? <Markdown content={rendered.text} /> : rendered.text}
        </div>
      ) : null}
    </div>
  );
}

function useStickyBottom(
  containerRef: RefObject<HTMLDivElement | null>,
  options: {
    selectionKey: string;
    contentVersion: string;
    sending: boolean;
  },
) {
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const pinnedRef = useRef(true);
  const lastSelectionKeyRef = useRef(options.selectionKey);
  const lastSendingRef = useRef(options.sending);
  const lastScrollHeightRef = useRef(0);

  function updatePinnedState() {
    const node = containerRef.current;
    if (!node) return;
    const next = isAtBottom(node.scrollTop, node.clientHeight, node.scrollHeight);
    pinnedRef.current = next;
    setIsPinnedToBottom(next);
  }

  function scrollToBottom() {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    pinnedRef.current = true;
    setIsPinnedToBottom(true);
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    updatePinnedState();
    const onScroll = () => updatePinnedState();
    node.addEventListener("scroll", onScroll);
    return () => node.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  useEffect(() => {
    if (lastSelectionKeyRef.current !== options.selectionKey) {
      lastSelectionKeyRef.current = options.selectionKey;
      scrollToBottom();
    }
  }, [options.selectionKey]);

  useEffect(() => {
    if (options.sending && !lastSendingRef.current) {
      scrollToBottom();
    }
    lastSendingRef.current = options.sending;
  }, [options.sending]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const grew = node.scrollHeight !== lastScrollHeightRef.current;
    lastScrollHeightRef.current = node.scrollHeight;
    if (grew && pinnedRef.current) {
      scrollToBottom();
    }
  }, [containerRef, options.contentVersion]);

  return { isPinnedToBottom, scrollToBottom };
}

function Composer(props: {
  sending: boolean;
  agents: Array<{ agent_key: string; display_name: string }>;
  selectedAgentKey: string | null;
  onSelectAgent: (agentKey: string | null) => void;
  language: AppLanguage;
  hideStop?: boolean;
  onSubmitMessage?: (text: string, attachments: ComposerAttachment[]) => Promise<void>;
}) {
  const attachmentAllowedExtensions = useMemo(
    () =>
      parseAllowedAttachmentExtensions(
        (
          import.meta as ImportMeta & {
            env?: { VITE_ATTACHMENT_ALLOWED_EXTENSIONS?: string };
          }
        ).env?.VITE_ATTACHMENT_ALLOWED_EXTENSIONS ?? DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS,
      ),
    [],
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);

  async function submit() {
    setError(null);
    const text = value.trim();
    if (text.length === 0 && attachments.length === 0) return;
    const typeError = validateAttachmentTypes(attachments, attachmentAllowedExtensions);
    if (typeError) {
      setError(typeError);
      return;
    }
    const validationError = validateAttachmentSizes(attachments);
    if (validationError) {
      setError(validationError);
      return;
    }
    const payloadBytes = new TextEncoder().encode(
      attachments.map((attachment) => `${attachment.name}:${attachment.size}:${attachment.mime}`).join("\n") +
        text,
    ).length;
    if (payloadBytes > MAX_COMBINED_MESSAGE_BYTES) {
      setError(`Message exceeds ${MAX_COMBINED_MESSAGE_BYTES} bytes`);
      return;
    }
    const previousValue = value;
    const previousAttachments = attachments;
    try {
      setValue("");
      setAttachments([]);
      if (props.onSubmitMessage) {
        await props.onSubmitMessage(text, attachments);
      } else {
        await sendMessage(text, attachments);
      }
    } catch (error) {
      setValue(previousValue);
      setAttachments(previousAttachments);
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function appendAttachments(nextAttachments: ComposerAttachment[]) {
    if (nextAttachments.length === 0) return;
    const combined = [...attachments, ...nextAttachments];
    const typeError = validateAttachmentTypes(combined, attachmentAllowedExtensions);
    if (typeError) {
      setError(typeError);
      return;
    }
    const validationError = validateAttachmentSizes(combined);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setAttachments(combined);
  }

  async function handleOpenFiles() {
    try {
      const opened = await getBridge().dialog.openFiles();
      await appendAttachments(opened.map(mapBridgeAttachment));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => !(file.size === 0 && file.type === ""),
    );
    try {
      await appendAttachments(await Promise.all(files.map(readDroppedFile)));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <footer
      className="chat-composer"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        void handleDrop(event);
      }}
    >
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
      {attachments.length > 0 ? (
        <div className="attachment-list">
          {attachments.map((attachment, index) => (
            <div key={`${attachment.name}-${index}`} className="attachment-chip">
              <span>
                {attachment.name} · {formatBytes(attachment.size)}
              </span>
              <button
                type="button"
                className="attachment-remove"
                aria-label={translate(props.language, "chat.attachRemove")}
                onClick={() =>
                  setAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
          <button
            type="button"
            className="secondary icon-only-button"
            onClick={() => {
              void handleOpenFiles();
            }}
            title={translate(props.language, "chat.attachFiles")}
            aria-label={translate(props.language, "chat.attachFiles")}
          >
            <IconPaperclip />
          </button>
          {props.sending && !props.hideStop ? (
            <button className="secondary" onClick={abortActiveTurn}>
              {translate(props.language, "chat.stop")}
            </button>
          ) : null}
          <button
            disabled={props.sending || (value.trim().length === 0 && attachments.length === 0)}
            onClick={submit}
          >
            {props.sending
              ? translate(props.language, "chat.sending")
              : translate(props.language, "chat.sendHint")}
          </button>
        </div>
      </div>
    </footer>
  );
}

function mapBridgeAttachment(file: {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  content: string;
}): ComposerAttachment {
  return {
    name: file.name,
    size: file.size,
    mime: file.mime,
    kind: file.kind,
    content: file.content,
  };
}

async function readDroppedFile(file: File): Promise<ComposerAttachment> {
  const kind = await classifyDroppedFile(file);
  return {
    name: file.name,
    size: file.size,
    mime: file.type || (kind === "text" ? "text/plain" : "application/octet-stream"),
    kind,
    content:
      kind === "text"
        ? await file.text()
        : toBase64(await file.arrayBuffer()),
  };
}

async function classifyDroppedFile(file: File): Promise<"text" | "binary"> {
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".gz", ".deb", ".bin"].includes(extension)) {
    return "binary";
  }
  if (file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml")) {
    return "text";
  }
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  return head.includes(0) ? "binary" : "text";
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
