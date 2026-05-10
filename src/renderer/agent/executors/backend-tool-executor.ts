import { postMeMcp, postProjectAgentMcp } from "../../lib/api";

export async function callBackendTool(
  scope: "global" | "project",
  backendToolName: string,
  args: Record<string, unknown>,
  input: { projectAgentId?: string | null } = {},
) {
  const payload = {
    jsonrpc: "2.0",
    id: `tool-call-${Date.now()}`,
    method: "tools/call",
    params: {
      name: backendToolName,
      arguments: args,
    },
  };

  return scope === "global"
    ? postMeMcp(payload)
    : postProjectAgentMcp(input.projectAgentId ?? "", payload);
}
