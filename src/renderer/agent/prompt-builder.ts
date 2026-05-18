import type {
  Agent,
  AgentSkill,
  ChatMessage,
  Message,
  Profile,
  Project,
  Summary,
} from "../lib/types.js";
import type { AgentRole } from "../lib/types.js";
import {
  CAPABILITY_REGISTRY,
  COMPLETION_POLICY_PROMPT,
  EXECUTION_DISCIPLINE_PROMPT,
  ROLES_POLICY_PROMPT,
  SKILLS_POLICY_PROMPT,
  buildCapabilitiesPrompt,
  buildOrchestrationBlock,
  buildRolesBlock,
  buildSkillsBlock,
  buildToolsManifest,
  resolveAvailableCapabilities,
} from "./prompts/index.js";

export type PromptBuildInput = {
  agent: Agent | null;
  agentSkills?: AgentSkill[];
  agentRoles?: AgentRole[];
  profile: Profile;
  project: Project | null;
  relevantSummaries: Summary[];
  liveMessages: Message[];
  availableToolNames?: string[];
  toolsManifest?: string | null;
};

/**
 * Deterministic prompt composition. Section order is documented in
 * ./prompts/index.ts — keep edits there, not inline.
 */
export function buildPrompt(input: PromptBuildInput): ChatMessage[] {
  const systemParts: string[] = [];
  const availableCapabilities =
    input.availableToolNames && input.availableToolNames.length > 0
      ? resolveAvailableCapabilities(CAPABILITY_REGISTRY, input.availableToolNames)
      : CAPABILITY_REGISTRY;
  const capabilitiesPrompt = buildCapabilitiesPrompt(availableCapabilities);
  const toolsManifest =
    input.toolsManifest && input.toolsManifest.trim()
      ? input.toolsManifest.trim()
      : buildToolsManifest(availableCapabilities);

  if (input.agent?.system_prompt?.trim()) {
    systemParts.push(input.agent.system_prompt.trim());
  }

  systemParts.push(EXECUTION_DISCIPLINE_PROMPT);
  systemParts.push(capabilitiesPrompt);
  systemParts.push(COMPLETION_POLICY_PROMPT);

  const skills = input.agentSkills ?? [];
  if (skills.length > 0) {
    systemParts.push(SKILLS_POLICY_PROMPT);
    systemParts.push(buildSkillsBlock(skills));
  }

  const roles = input.agentRoles ?? [];
  if (roles.length > 0) {
    systemParts.push(ROLES_POLICY_PROMPT);
    systemParts.push(buildRolesBlock(roles));
  }

  const orchestrationBlock = buildOrchestrationBlock(input.agent?.orchestration_protocol ?? null);
  if (orchestrationBlock.length > 0) {
    systemParts.push(orchestrationBlock);
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

  if (toolsManifest.length > 0) {
    systemParts.push(`<available_tools>\n${toolsManifest}\n</available_tools>`);
  }

  const systemContent = systemParts.join("\n\n");
  const liveAsChat: ChatMessage[] = input.liveMessages.map((message) => ({
    role: message.role === "system" ? "system" : (message.role as "user" | "assistant"),
    content: message.content,
  }));

  if (systemContent.length === 0) return liveAsChat;
  return [{ role: "system", content: systemContent }, ...liveAsChat];
}
