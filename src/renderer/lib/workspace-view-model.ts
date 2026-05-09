import type { ExecutionRecord } from "./types";

type ProjectHomeInput = {
  executions: Array<Pick<ExecutionRecord, "execution_id" | "status"> & { requiresAttention?: boolean; title?: string }>;
  tasks: Array<{ id: string; status: string; title: string }>;
  artifacts: Array<{ id: string; title: string }>;
};

export function buildProjectHomeSections(input: ProjectHomeInput) {
  return [
    {
      id: "workspace-status",
      priorityItems: [
        ...input.tasks.filter((task) => task.status === "blocked"),
        ...input.executions.filter((execution) => execution.status === "waiting_approval"),
        ...input.executions.filter((execution) => execution.status === "waiting_user"),
        ...input.executions.filter((execution) => execution.requiresAttention === true),
        ...input.executions.filter((execution) => execution.status === "running"),
      ],
    },
    { id: "agent-presence" },
    { id: "active-tasks" },
    { id: "running-executions" },
    { id: "recent-artifacts", items: input.artifacts },
    { id: "recent-activity-preview" },
  ];
}

export function toExecutionStatusCard(execution: ExecutionRecord) {
  return {
    id: execution.execution_id,
    status: execution.status,
    requiresAttention:
      execution.status === "failed" ||
      execution.status === "orphaned" ||
      execution.status === "waiting_user" ||
      execution.status === "waiting_approval",
  };
}
