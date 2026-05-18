import type { UserMessage } from "@earendil-works/pi-ai";
import { getLiveMessages } from "../live-messages.js";
import { maybeSummarize } from "../summarizer.js";
import type { RuntimeInternals } from "./types.js";

export async function sendUserMessage(rt: RuntimeInternals, content: string): Promise<void> {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error("Empty message");
  rt.lastRunError = null;
  const localTimestamp = Date.now();
  const localUserMessageId = `local-user-${localTimestamp.toString(36)}`;
  const userMessage = {
    id: localUserMessageId,
    session_id: rt.input.sessionId,
    role: "user" as const,
    content,
    created_at: new Date(localTimestamp).toISOString(),
  };
  rt.roundIndex = 0;
  rt.activeRound = null;
  rt.currentTurnToolResults = [];
  // New turn: its execution events are tagged with this id. The trace itself
  // is NOT reset — it is cumulative per session so the timeline persists
  // across turns; events are grouped/scoped by turnId.
  rt.currentTurnId = userMessage.id;
  rt.currentTurnLocalUserMessageId = userMessage.id;
  rt.currentTurnUserTimestamp = localTimestamp;
  rt.state = {
    ...rt.state,
    messages: [...rt.state.messages, userMessage],
    streamingFinalText: "",
    isStreaming: true,
  };
  rt.currentTurnUserText = content;
  rt.notify();

  const piUserMessage: UserMessage = {
    role: "user",
    content,
    timestamp: localTimestamp,
  };
  rt.agent.state.messages = [...rt.agent.state.messages, piUserMessage];

  try {
    await rt.agent.continue();
  } finally {
    // Wait for queued persistAgentMessage calls so the final assistant
    // message lands in state.messages before we clear the streaming text —
    // otherwise the bubble briefly disappears and the UI looks broken.
    await rt.persistenceChain;
    rt.activeRound = null;
    rt.state = { ...rt.state, isStreaming: false, streamingFinalText: "" };
    rt.notify();
  }

  if (rt.lastRunError) {
    const error = rt.lastRunError;
    rt.lastRunError = null;
    if (rt.currentTurnLocalUserMessageId) {
      discardOptimisticUserMessage(rt);
    }
    throw error;
  }

  await maybeRunSummarization(rt);
}

function discardOptimisticUserMessage(rt: RuntimeInternals) {
  const localMessageId = rt.currentTurnLocalUserMessageId;
  if (!localMessageId) return;

  rt.state = {
    ...rt.state,
    messages: rt.state.messages.filter((message) => message.id !== localMessageId),
  };
  rt.agent.state.messages = rt.agent.state.messages.filter(
    (message) =>
      !(
        message.role === "user" &&
        message.timestamp === rt.currentTurnUserTimestamp &&
        message.content === rt.currentTurnUserText
      ),
  );
  rt.currentTurnLocalUserMessageId = null;
  rt.notify();
}

async function maybeRunSummarization(rt: RuntimeInternals) {
  const live = getLiveMessages(rt.state.messages, rt.state.summaries);
  if (live.length < 20) return;
  try {
    const result = await maybeSummarize({
      sessionId: rt.input.sessionId,
      liveMessages: live,
      model: rt.model,
    });
    if (result.summary) {
      rt.state = {
        ...rt.state,
        summaries: [...rt.state.summaries, result.summary],
      };
      rt.notify();
    }
  } catch (error) {
    console.error("[summarizer]", error);
  }
}
