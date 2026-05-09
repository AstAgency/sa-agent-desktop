import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model, UserMessage } from "@earendil-works/pi-ai";
import type { SessionMessage } from "../lib/types";

const DEFAULT_TRANSCRIPT_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-transcript",
  name: "SA-Agent Transcript",
  api: "openai-completions",
  provider: "sa-agent-transcript",
  baseUrl: "http://transcript.local",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128_000,
  maxTokens: 8_000,
};

export function sessionMessagesToAgentMessages(messages: SessionMessage[], model: Model<any> = DEFAULT_TRANSCRIPT_MODEL): AgentMessage[] {
  return messages.reduce<AgentMessage[]>((accumulator, message) => {
    if (message.role === "user") {
      accumulator.push({
        role: "user" as const,
        content: message.content_markdown,
        timestamp: new Date(message.created_at).getTime(),
      } satisfies UserMessage);
      return accumulator;
    }

    if (message.role === "assistant") {
      accumulator.push({
        role: "assistant" as const,
        content: [
          {
            type: "text" as const,
            text: message.content_markdown,
          },
        ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: zeroUsage(),
        stopReason: "stop" as const,
        timestamp: new Date(message.created_at).getTime(),
      });
      return accumulator;
    }

    return accumulator;
  }, []);
}

export function agentMessagesToSessionMessages(messages: AgentMessage[], sessionId: string): SessionMessage[] {
  return messages.flatMap((message, index) => {
    if (message.role === "user") {
      const content = typeof message.content === "string" ? message.content : message.content.map(readTextFromContent).join("");
      return [buildSessionMessageLike(sessionId, index, "user", content, message.timestamp)];
    }

    if (message.role === "assistant") {
      return [buildSessionMessageLike(sessionId, index, "assistant", readAssistantText(message), message.timestamp)];
    }

    return [];
  });
}

function readTextFromContent(content: { type: string; text?: string }) {
  if (content.type === "text" && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

function readAssistantText(message: AssistantMessage) {
  return message.content.map((content) => (content.type === "text" ? content.text : "")).join("");
}

function zeroUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function buildSessionMessageLike(
  sessionId: string,
  index: number,
  role: SessionMessage["role"],
  contentMarkdown: string,
  timestamp: number,
): SessionMessage {
  return {
    id: `agent-${sessionId}-${index}-${timestamp}`,
    session_id: sessionId,
    parent_message_id: null,
    role,
    message_kind: "chat",
    content_markdown: contentMarkdown,
    token_estimate: contentMarkdown.length,
    is_hidden: false,
    attachments: [],
    created_at: new Date(timestamp).toISOString(),
  };
}
