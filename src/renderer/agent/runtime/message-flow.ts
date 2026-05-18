import type { UserMessage } from "@earendil-works/pi-ai";
import { appendMessage } from "../../lib/api";
import { getLiveMessages } from "../live-messages";
import { maybeSummarize } from "../summarizer";
import type { RuntimeInternals } from "./types";

export async function sendUserMessage(rt: RuntimeInternals, content: string): Promise<void> {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error("Empty message");

  const userMessage = await appendMessage(rt.input.sessionId, "user", content);
  rt.persistedMessageIds.add(userMessage.id);
  rt.roundIndex = 0;
  rt.activeRound = null;
  rt.currentTurnToolResults = [];
  // New turn: its execution events are tagged with this id. The trace itself
  // is NOT reset — it is cumulative per session so the timeline persists
  // across turns; events are grouped/scoped by turnId.
  rt.currentTurnId = userMessage.id;
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
    timestamp: Date.now(),
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

  await maybeRunSummarization(rt);
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
