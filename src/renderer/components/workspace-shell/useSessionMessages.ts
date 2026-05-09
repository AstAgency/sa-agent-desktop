import { useEffect, useState } from "react";
import { getAssistantThread, getSessionMessages } from "../../lib/api";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import type { AppLanguage, ConversationScope, SessionMessage, SessionSummary, WorkspaceSummary } from "../../lib/types";
import { createSessionFlowDebugId, mapAssistantThreadToSessionSummary } from "./helpers";

export function useSessionMessages(input: {
  language: AppLanguage;
  workspace: WorkspaceSummary;
  currentScope: ConversationScope;
  activeSession: SessionSummary | null;
  activeAgentMcps: unknown;
  globalAssistantMessages: SessionMessage[];
  onError: (message: string | null) => void;
}) {
  const { language, currentScope, activeSession, onError } = input;
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [isAwaitingAssistantStream, setIsAwaitingAssistantStream] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  useEffect(() => {
    if (!activeSession?.id) {
      setMessages([]);
      setStreamingAssistantText("");
      setIsAwaitingAssistantStream(false);
      return;
    }

    let isActive = true;
    setIsLoadingMessages(true);
    recordDebugAgentRuntimeEntry({
      id: createSessionFlowDebugId(),
      startedAt: new Date().toISOString(),
      type: "runtime.restore",
      sessionId: activeSession.id,
      data: { scope: currentScope, activeSessionId: activeSession.id },
    });
    recordDebugAgentRuntimeEntry({
      id: createSessionFlowDebugId(),
      startedAt: new Date().toISOString(),
      type: "messages.fetch",
      sessionId: activeSession.id,
      data: { source: currentScope === "global" ? "assistant-thread-restore" : "active-session-effect" },
    });

    void (currentScope === "global" ? getAssistantThread().then((envelope) => envelope.messages) : getSessionMessages(activeSession.id))
      .then((items) => {
        if (!isActive) return;
        setMessages(items);
        setStreamingAssistantText("");
        setIsAwaitingAssistantStream(false);
        setIsLoadingMessages(false);
      })
      .catch((error) => {
        if (!isActive) return;
        onError(error instanceof Error ? error.message : translate(language, "workspace.error.loadMessages"));
        setIsLoadingMessages(false);
      });

    return () => {
      isActive = false;
    };
  }, [activeSession?.id, currentScope, input.activeAgentMcps, input.globalAssistantMessages, language, onError]);

  return { messages, setMessages, streamingAssistantText, setStreamingAssistantText, isAwaitingAssistantStream, setIsAwaitingAssistantStream, isLoadingMessages, setIsLoadingMessages };
}
