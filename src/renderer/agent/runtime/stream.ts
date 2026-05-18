import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type StopReason,
  type StreamOptions,
  type TextContent,
  type ToolCall as PiToolCall,
} from "@earendil-works/pi-ai";
import { streamChatCompletion } from "../../lib/api";
import type { ChatMessage } from "../../lib/types";
import { buildPrompt } from "../prompt-builder";
import { getLiveMessages } from "../live-messages";
import { retrieveRelevantSummaries } from "../search";
import { transcriptToChatMessages } from "../transcript";
import {
  buildErrorAssistantMessage,
  buildPartialAssistantMessage,
  parseToolArguments,
} from "./converters";
import { toolsToOpenAIDefinitions } from "./tools";
import {
  applyToolCallPolicyWarnings,
  appendTraceEvent,
  markRoundInterrupted,
  nextTraceEventId,
  promoteToReasoning,
  updateTraceEvent,
} from "./trace";
import type { ActiveRound, RuntimeInternals } from "./types";

export function streamFromBackend(
  rt: RuntimeInternals,
  model: Model<Api>,
  _context: Context,
  options?: StreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  void runStream(rt, model, stream, options?.signal);
  return stream;
}

export async function runStream(
  rt: RuntimeInternals,
  model: Model<Api>,
  stream: AssistantMessageEventStream,
  signal?: AbortSignal,
) {
  const partial = buildPartialAssistantMessage(model);
  stream.push({ type: "start", partial });

  const abortController = new AbortController();
  rt.inflightAbort = abortController;
  const onParentAbort = () => abortController.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  let textContentIndex: number | null = null;
  let textContent: TextContent | null = null;

  rt.roundIndex += 1;
  const round: ActiveRound = {
    index: rt.roundIndex,
    textBuffer: "",
    hasToolCalls: false,
    reasoningEventId: null,
    toolCallEventIds: new Map(),
  };
  rt.activeRound = round;

  // Each new round resets the live final-answer bubble — until we see
  // toolcall_start, we optimistically stream into it; if tool calls show
  // up, we move the buffered text into the trace as reasoning.
  rt.state = { ...rt.state, streamingFinalText: "" };
  rt.notify();

  try {
    // Ensure prior tool/assistant persistence has settled before reading
    // state.messages — otherwise the next round trip can omit (or reorder)
    // a tool result that just executed.
    await rt.persistenceChain;

    const relevantSummaries =
      rt.currentTurnUserText.length > 0
        ? await retrieveRelevantSummaries(rt.currentTurnUserText, {
            sessionId: rt.input.sessionId,
          })
        : [];

    const liveMessages = getLiveMessages(rt.state.messages, rt.state.summaries);
    const transcriptForLlm = transcriptToChatMessages(
      liveMessages,
      rt.currentTurnToolResults,
    );
    const promptMessages: ChatMessage[] = buildPrompt({
      agent: rt.input.agent,
      agentSkills: rt.input.agentSkills ?? [],
      agentRoles: rt.input.agentRoles ?? [],
      profile: rt.input.profile,
      project: rt.input.project,
      relevantSummaries,
      liveMessages: [],
      availableToolNames: rt.tools.map((tool) => tool.name),
    }).concat(transcriptForLlm);

    const toolDefinitions = toolsToOpenAIDefinitions(rt.tools);

    const toolCallContentIndices = new Map<number, number>();
    const result = await streamChatCompletion(
      {
        model: rt.model,
        messages: promptMessages,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      },
      {
        onDelta: (delta) => {
          if (textContent === null) {
            textContentIndex = partial.content.length;
            textContent = { type: "text", text: "" };
            partial.content.push(textContent);
            stream.push({ type: "text_start", contentIndex: textContentIndex, partial });
          }
          textContent.text += delta;
          round.textBuffer += delta;
          if (round.hasToolCalls && round.reasoningEventId) {
            // We've already decided this round is reasoning. Append to the
            // existing reasoning event so the trace UI updates live.
            updateTraceEvent(rt, round.reasoningEventId, { text: round.textBuffer });
          } else {
            // Optimistically stream into the final-answer bubble.
            rt.state = { ...rt.state, streamingFinalText: round.textBuffer };
          }
          rt.notify();
          stream.push({
            type: "text_delta",
            contentIndex: textContentIndex!,
            delta,
            partial,
          });
        },
        onToolCallStart: (index, id, name) => {
          const contentIndex = partial.content.length;
          toolCallContentIndices.set(index, contentIndex);
          const placeholder: PiToolCall = {
            type: "toolCall",
            id,
            name,
            arguments: {},
          };
          partial.content.push(placeholder);
          stream.push({ type: "toolcall_start", contentIndex, partial });

          // Mid-round we now know this is an intermediate "reasoning" turn,
          // not the final answer. Move any text accumulated so far into a
          // reasoning trace event and clear the live final-answer bubble.
          if (!round.hasToolCalls) {
            promoteToReasoning(rt, round);
          }
          const eventId = nextTraceEventId("tool");
          round.toolCallEventIds.set(id, eventId);
          appendTraceEvent(rt, {
            kind: "tool_call",
            id: eventId,
            round: round.index,
            toolCallId: id,
            name,
            argsJson: "",
            status: "running",
            at: Date.now(),
          });
          rt.notify();
        },
        onToolCallDelta: (index, argumentsDelta) => {
          const contentIndex = toolCallContentIndices.get(index);
          if (contentIndex === undefined) return;
          stream.push({
            type: "toolcall_delta",
            contentIndex,
            delta: argumentsDelta,
            partial,
          });
        },
      },
      { signal: abortController.signal },
    );

    const finalText = textContent as TextContent | null;
    if (finalText !== null && textContentIndex !== null) {
      stream.push({
        type: "text_end",
        contentIndex: textContentIndex,
        content: finalText.text,
        partial,
      });
    }

    if (result.tool_calls.length > 0) {
      // If the round had no text at all but still ends with tool_calls,
      // make sure the trace shows this round had reasoning (an empty one).
      if (!round.hasToolCalls) {
        promoteToReasoning(rt, round);
        rt.notify();
      }
      for (const toolCall of result.tool_calls) {
        const index = result.tool_calls.indexOf(toolCall);
        const contentIndex = toolCallContentIndices.get(index);
        if (contentIndex === undefined) continue;
        const parsedArgs = parseToolArguments(toolCall.function.arguments);
        const finalized: PiToolCall = {
          type: "toolCall",
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: parsedArgs,
        };
        partial.content[contentIndex] = finalized;
        const traceEventId = round.toolCallEventIds.get(toolCall.id);
        if (traceEventId) {
          applyToolCallPolicyWarnings(rt, traceEventId, finalized.name, parsedArgs ?? null);
          updateTraceEvent(rt, traceEventId, {
            argsJson: JSON.stringify(parsedArgs ?? {}, null, 2),
          });
          rt.notify();
        }
        stream.push({
          type: "toolcall_end",
          contentIndex,
          toolCall: finalized,
          partial,
        });
      }
    }

    const stopReason: Extract<StopReason, "stop" | "length" | "toolUse"> =
      result.tool_calls.length > 0
        ? "toolUse"
        : result.finish_reason === "length"
          ? "length"
          : "stop";
    partial.stopReason = stopReason;
    stream.push({ type: "done", reason: stopReason, message: { ...partial } });
    stream.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = abortController.signal.aborted;
    // Don't discard text the user already saw — keep it in the persistent
    // timeline marked interrupted (§14).
    markRoundInterrupted(rt, round);
    stream.push({
      type: "error",
      reason: aborted ? "aborted" : "error",
      error: buildErrorAssistantMessage(model, message, aborted ? "aborted" : "error"),
    });
    stream.end();
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
    rt.inflightAbort = null;
  }
}
