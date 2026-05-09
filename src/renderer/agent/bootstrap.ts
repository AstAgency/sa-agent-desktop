import {
  getAgentProfile,
  getAgentProfileMcp,
  getCapabilities,
  getProjectAgentMcp,
  getProjectAgents,
} from "../lib/api";
import type { AgentMcpLandscape, AgentProfileRecord, CapabilityCatalogItem, ProjectAgentRecord } from "../lib/types";

export type AgentRuntimeBootstrapResult = {
  agent: AgentProfileRecord;
  capabilities: CapabilityCatalogItem[];
  mcps: AgentMcpLandscape;
  projectAgent: ProjectAgentRecord | null;
};

export async function bootstrapAgentRuntime(input: {
  agentKey: string;
  projectId?: string | null;
  projectAgentId?: string | null;
}) {
  if (!input.projectId) {
    const [agent, capabilities, mcps] = await Promise.all([
      getAgentProfile(input.agentKey),
      getCapabilities({ agentKey: input.agentKey }),
      getAgentProfileMcp(input.agentKey),
    ]);

    return {
      agent,
      capabilities,
      mcps,
      projectAgent: null,
    } satisfies AgentRuntimeBootstrapResult;
  }

  const [projectAgents, capabilities] = await Promise.all([
    getProjectAgents(input.projectId),
    getCapabilities({ projectId: input.projectId }),
  ]);
  const projectAgent =
    (input.projectAgentId
      ? projectAgents.find((item) => item.id === input.projectAgentId) ?? null
      : null) ??
    projectAgents.find((item) => item.agent_key === input.agentKey) ??
    projectAgents[0] ??
    null;

  const [agent, mcps] = await Promise.all([
    getAgentProfile(projectAgent?.agent_key ?? input.agentKey),
    projectAgent
      ? getProjectAgentMcp(input.projectId, projectAgent.id)
      : getAgentProfileMcp(input.agentKey),
  ]);

  return {
    agent,
    capabilities,
    mcps,
    projectAgent,
  } satisfies AgentRuntimeBootstrapResult;
}
