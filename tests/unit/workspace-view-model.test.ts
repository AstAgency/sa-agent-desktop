import { describe, expect, it } from "vitest";
import { buildProjectHomeSections } from "../../src/renderer/lib/workspace-view-model";

describe("buildProjectHomeSections", () => {
  it("prioritizes blocked and approval signals above routine activity", () => {
    const sections = buildProjectHomeSections({
      executions: [
        { execution_id: "exec-1", status: "waiting_approval", requiresAttention: true, title: "Approval required" },
      ],
      tasks: [{ id: "task-1", status: "blocked", title: "Blocked integration" }],
      artifacts: [{ id: "doc-1", title: "BRD draft" }],
    });

    expect(sections[0].id).toBe("workspace-status");
    expect(sections[0].priorityItems[0].status).toBe("blocked");
  });
});
