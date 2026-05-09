import { translate } from "../../lib/i18n";
import type { AgentSafeProfile, AppLanguage, ProjectAgentRecord } from "../../lib/types";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

export function AgentsView({
  language,
  activeAgentProfile,
  projectAgents,
}: {
  language: AppLanguage;
  activeAgentProfile: AgentSafeProfile | null;
  projectAgents: ProjectAgentRecord[];
}) {
  const roster = projectAgents.length > 0
    ? projectAgents
    : activeAgentProfile
      ? [{
          id: activeAgentProfile.agent_key,
          display_name: activeAgentProfile.display_name ?? activeAgentProfile.agent_key,
          role: activeAgentProfile.domain ?? translate(language, "workspace.agents.projectAgent"),
          status: activeAgentProfile.is_active === false ? "inactive" : "active",
        } satisfies ProjectAgentRecord]
      : [];

  return (
    <section data-testid="workspace-agents-view" style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "grid", gap: "6px" }}>
        <p style={eyebrowStyle}>{translate(language, "workspace.agents.eyebrow")}</p>
        <h2 style={headingStyle}>{translate(language, "workspace.agents.title")}</h2>
      </header>

      {roster.length > 0 ? (
        <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {roster.map((agent) => (
            <article key={agent.id} style={cardStyle}>
              <div style={{ display: "grid", gap: "4px" }}>
                <strong style={titleStyle}>{agent.display_name ?? agent.agent_key ?? agent.id}</strong>
                <span style={metaStyle}>{agent.role ?? agent.agent_key ?? translate(language, "workspace.agents.projectRuntime")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <span style={statusPillStyle(agent.status ?? "active")}>{readStatusLabel(language, agent.status ?? "active")}</span>
                <button type="button" style={actionButtonStyle}>
                  {translate(language, "workspace.agents.openThread")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceEmptyState
          title={translate(language, "workspace.agents.title")}
          description={translate(language, "workspace.agents.empty")}
        />
      )}
    </section>
  );
}

function readStatusLabel(language: AppLanguage, status: string) {
  if (status === "active") {
    return translate(language, "workspace.status.active");
  }

  if (status === "inactive") {
    return translate(language, "workspace.status.inactive");
  }

  if (status === "waiting_approval") {
    return translate(language, "workspace.execution.waiting_approval");
  }

  if (status === "blocked") {
    return translate(language, "workspace.execution.failed");
  }

  return status;
}

function statusPillStyle(status: string) {
  const tone = status === "blocked" || status === "inactive"
    ? "var(--theme-color-status-danger)"
    : status === "waiting_approval"
      ? "rgba(245, 158, 11, 0.16)"
      : "color-mix(in srgb, var(--theme-color-accent-primary) 14%, transparent)";

  return {
    minHeight: "24px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 8px",
    borderRadius: "999px",
    background: tone,
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
  gap: "12px",
  padding: "14px",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 84%, transparent)",
};

const titleStyle = {
  fontSize: "14px",
  fontWeight: 520,
};

const metaStyle = {
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
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
