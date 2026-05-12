import type { Agent, ChatMessage, Message, Profile, Project, Summary } from "../lib/types";

export type PromptBuildInput = {
  agent: Agent | null;
  profile: Profile;
  project: Project | null;
  relevantSummaries: Summary[];
  liveMessages: Message[];
  toolsManifest?: string | null;
};

/**
 * Deterministic prompt composition per CLIENT_USAGE_SCENARIO §6.3.
 * Order is fixed: agent system prompt → global memory → project memory →
 * relevant summaries → live messages.
 */
export function buildPrompt(input: PromptBuildInput): ChatMessage[] {
  const systemParts: string[] = [];

  if (input.agent?.system_prompt?.trim()) {
    systemParts.push(input.agent.system_prompt.trim());
  }

  if (input.profile.global_memory && input.profile.global_memory.trim()) {
    systemParts.push(`<global_memory>\n${input.profile.global_memory.trim()}\n</global_memory>`);
  }

  if (input.project?.project_memory && input.project.project_memory.trim()) {
    systemParts.push(`<project_memory>\n${input.project.project_memory.trim()}\n</project_memory>`);
  }

  if (input.relevantSummaries.length > 0) {
    const block = input.relevantSummaries.map((summary) => `- ${summary.content}`).join("\n");
    systemParts.push(`<relevant_context>\n${block}\n</relevant_context>`);
  }

  if (input.toolsManifest && input.toolsManifest.trim()) {
    systemParts.push(`<available_tools>\n${input.toolsManifest.trim()}\n</available_tools>`);
  }

  const systemContent = systemParts.join("\n\n");
  const liveAsChat: ChatMessage[] = input.liveMessages.map((message) => ({
    role: message.role === "system" ? "system" : (message.role as "user" | "assistant"),
    content: message.content,
  }));

  if (systemContent.length === 0) return liveAsChat;
  return [{ role: "system", content: systemContent }, ...liveAsChat];
}
