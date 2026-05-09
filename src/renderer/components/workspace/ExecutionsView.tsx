import { translate } from "../../lib/i18n";
import type { AppLanguage, SessionSummary } from "../../lib/types";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

export function ExecutionsView({
  language,
  sessions,
  onCancelExecution,
}: {
  language: AppLanguage;
  sessions: SessionSummary[];
  onCancelExecution?: (executionId: string) => void | Promise<void>;
}) {
  const executionRows = sessions.filter((session) => session.execution_id);

  return (
    <section data-testid="workspace-executions-view" style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "grid", gap: "6px" }}>
        <p style={eyebrowStyle}>{translate(language, "workspace.executions.eyebrow")}</p>
        <h2 style={headingStyle}>{translate(language, "workspace.executions.title")}</h2>
      </header>
      {executionRows.length > 0 ? (
        <div style={{ display: "grid", gap: "8px" }}>
          {executionRows.map((session) => (
            <article key={session.id} style={cardStyle}>
              <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
                <strong style={{ fontSize: "14px", fontWeight: 520 }}>
                  {session.active_capability_key ?? session.execution_id}
                </strong>
                <span style={{ color: "var(--theme-color-text-secondary)", fontSize: "12px" }}>
                  {session.execution_id}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "end" }}>
                <span style={statusStyle(session.execution_status ?? "running")}>{readStatusLabel(language, session.execution_status ?? "running")}</span>
                {session.execution_id ? (
                  <button type="button" style={actionButtonStyle} onClick={() => onCancelExecution?.(session.execution_id!)}>
                    {translate(language, "workspace.executions.cancel")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceEmptyState
          title={translate(language, "workspace.executions.title")}
          description={translate(language, "workspace.executions.empty")}
        />
      )}
    </section>
  );
}

function readStatusLabel(language: AppLanguage, status: string) {
  if (status === "running") return translate(language, "workspace.execution.running");
  if (status === "pending") return translate(language, "workspace.execution.pending");
  if (status === "waiting_user") return translate(language, "workspace.execution.waiting_user");
  if (status === "waiting_approval") return translate(language, "workspace.execution.waiting_approval");
  if (status === "completed") return translate(language, "workspace.execution.completed");
  if (status === "applied") return translate(language, "workspace.execution.applied");
  if (status === "failed") return translate(language, "workspace.execution.failed");
  if (status === "cancelled") return translate(language, "workspace.execution.cancelled");
  if (status === "orphaned") return translate(language, "workspace.execution.orphaned");
  return status;
}

function statusStyle(status: string) {
  const background = status === "failed" || status === "orphaned" || status === "cancelled"
    ? "var(--theme-color-status-danger)"
    : status === "waiting_approval" || status === "waiting_user"
      ? "rgba(245, 158, 11, 0.16)"
      : "color-mix(in srgb, var(--theme-color-accent-primary) 14%, transparent)";

  return {
    minHeight: "24px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 8px",
    borderRadius: "999px",
    background,
    color: "var(--theme-color-text-primary)",
    fontSize: "12px",
  };
}

const eyebrowStyle = {
  margin: 0,
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const headingStyle = {
  margin: 0,
  fontSize: "26px",
  lineHeight: 1.08,
  fontWeight: 560,
  letterSpacing: "-0.03em",
};

const cardStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 84%, transparent)",
};

const actionButtonStyle = {
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};
