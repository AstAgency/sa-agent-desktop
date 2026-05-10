import type { BeforeToolCallResult } from "@earendil-works/pi-agent-core";
import type { RuntimeEvent } from "./runtime-events";

type ApprovalRequiredEvent = Extract<RuntimeEvent, { type: "approval_required" }>;

const RISKY_LOCAL_TOOLS = new Set<string>([]);

export function resolveRuntimeApproval(input: {
  toolName: string;
  emit: (event: RuntimeEvent) => void;
}): BeforeToolCallResult | undefined {
  if (!RISKY_LOCAL_TOOLS.has(input.toolName)) {
    return undefined;
  }

  const event = createApprovalRequiredEvent(input.toolName);
  input.emit(event);
  return {
    block: true,
    reason: event.reason,
  };
}

function createApprovalRequiredEvent(toolName: string): ApprovalRequiredEvent {
  return {
    type: "approval_required",
    approvalId: `approval-${toolName}-${Date.now()}`,
    tool: toolName,
    title: toolName,
    reason: "Local file write requires confirmation.",
    risk: "medium",
  };
}
