import type { AgentEvent } from "@earendil-works/pi-agent-core";

export type RuntimeEvent =
  | {
      type: "tool_call_started";
      tool: string;
      title: string;
    }
  | {
      type: "tool_call_completed";
      tool: string;
      title: string;
      resultSummary: string;
    }
  | {
      type: "tool_call_failed";
      tool: string;
      title: string;
      error: string;
      retryable: boolean;
    }
  | {
      type: "approval_required";
      approvalId: string;
      tool: string;
      title: string;
      reason: string;
      risk: "low" | "medium" | "high";
    };

export type RuntimeStreamEvent = AgentEvent | RuntimeEvent;

export function mapAgentEventToRuntimeEvent(event: Record<string, unknown> | null | undefined): RuntimeEvent | null {
  if (!event || typeof event.type !== "string") {
    return null;
  }

  if (event.type === "approval_required") {
    return readApprovalRequiredEvent(event);
  }

  if (event.type === "tool_execution_start") {
    const toolName = readToolName(event.toolName);
    if (!toolName) {
      return null;
    }

    return {
      type: "tool_call_started",
      tool: toolName,
      title: toolName,
    };
  }

  if (event.type === "tool_execution_end") {
    const toolName = readToolName(event.toolName);
    if (!toolName) {
      return null;
    }

    const result = isRecord(event.result) ? event.result : {};
    const isError = event.isError === true || result.isError === true;

    if (isError) {
      return {
        type: "tool_call_failed",
        tool: toolName,
        title: toolName,
        error: "Tool execution failed.",
        retryable: true,
      };
    }

    return {
      type: "tool_call_completed",
      tool: toolName,
      title: toolName,
      resultSummary: JSON.stringify(result.structuredContent ?? null),
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readToolName(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readApprovalRequiredEvent(event: Record<string, unknown>): RuntimeEvent | null {
  const toolName = readToolName(event.tool);
  const approvalId = typeof event.approvalId === "string" ? event.approvalId : null;
  const reason = typeof event.reason === "string" ? event.reason : null;
  const risk = event.risk === "low" || event.risk === "medium" || event.risk === "high" ? event.risk : null;
  if (!toolName || !approvalId || !reason || !risk) {
    return null;
  }

  return {
    type: "approval_required",
    approvalId,
    tool: toolName,
    title: typeof event.title === "string" && event.title.trim().length > 0 ? event.title : toolName,
    reason,
    risk,
  };
}
