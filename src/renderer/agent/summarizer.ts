import { chatCompletion, createSummary } from "../lib/api";
import { getBridge } from "../lib/bridge";
import type { Message, Summary } from "../lib/types";

export const SUMMARIZE_THRESHOLD = 30;
export const SUMMARIZE_BUFFER = 10;
export const SUMMARY_MODEL = "deepseek-chat";

export type SummarizeContext = {
  sessionId: string;
  liveMessages: Message[];
  model?: string;
};

export type SummarizeResult = {
  summary: Summary | null;
  summarizedMessageIds: string[];
};

export async function maybeSummarize(context: SummarizeContext): Promise<SummarizeResult> {
  if (context.liveMessages.length < SUMMARIZE_THRESHOLD) {
    return { summary: null, summarizedMessageIds: [] };
  }
  const toSummarize = context.liveMessages.slice(0, context.liveMessages.length - SUMMARIZE_BUFFER);
  if (toSummarize.length === 0) return { summary: null, summarizedMessageIds: [] };
  return summarizeMessages(context.sessionId, toSummarize, context.model);
}

export async function summarizeMessages(
  sessionId: string,
  toSummarize: Message[],
  model: string = SUMMARY_MODEL,
): Promise<SummarizeResult> {
  const userContent = toSummarize
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const completion = await chatCompletion({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a conversation summarizer. Given a list of messages, produce a concise factual summary " +
          "in 3-7 sentences. Preserve key decisions, facts, and outcomes. Do not add interpretation.",
      },
      { role: "user", content: userContent },
    ],
  });

  const summaryText = completion.choices[0]?.message?.content?.trim();
  if (!summaryText) {
    throw new Error("Summarizer returned empty content");
  }

  const embedding = await getBridge().python.embedPassage(summaryText);
  const firstMessage = toSummarize[0]!;
  const lastMessage = toSummarize[toSummarize.length - 1]!;
  const summary = await createSummary(sessionId, {
    content: summaryText,
    embedding,
    from_message_id: firstMessage.id,
    to_message_id: lastMessage.id,
  });

  return {
    summary,
    summarizedMessageIds: toSummarize.map((message) => message.id),
  };
}
