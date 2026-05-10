import { describe, expect, it } from "vitest";
import { mapAgentEventToRuntimeEvent } from "../../src/renderer/agent/runtime-events";

describe("mapAgentEventToRuntimeEvent", () => {
  it("maps tool_execution_start to a confirmed start event", () => {
    const mapped = mapAgentEventToRuntimeEvent({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "backend.projects.create",
      args: {},
    } as never);

    expect(mapped).toEqual({
      type: "tool_call_started",
      tool: "backend.projects.create",
      title: "backend.projects.create",
    });
  });

  it("maps tool_execution_end to a confirmed tool completion event", () => {
    const mapped = mapAgentEventToRuntimeEvent({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "backend.projects.create",
      result: { isError: false, structuredContent: { project_id: "p-1" } },
    } as never);

    expect(mapped).toEqual({
      type: "tool_call_completed",
      tool: "backend.projects.create",
      title: "backend.projects.create",
      resultSummary: expect.any(String),
    });
  });

  it("ignores unrelated agent events", () => {
    expect(mapAgentEventToRuntimeEvent({ type: "message_update" } as never)).toBeNull();
  });

  it("passes through approval_required events", () => {
    expect(
      mapAgentEventToRuntimeEvent({
        type: "approval_required",
        approvalId: "approval-1",
        tool: "local.files.write_file",
        title: "local.files.write_file",
        reason: "Local file write requires confirmation.",
        risk: "medium",
      }),
    ).toEqual({
      type: "approval_required",
      approvalId: "approval-1",
      tool: "local.files.write_file",
      title: "local.files.write_file",
      reason: "Local file write requires confirmation.",
      risk: "medium",
    });
  });
});
