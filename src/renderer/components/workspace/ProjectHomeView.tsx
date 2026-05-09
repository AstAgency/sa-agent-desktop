import { translate } from "../../lib/i18n";
import type { AppLanguage, ExecutionRecord, GeneratedDocument, ProjectAgentRecord, SessionSummary, ThreadRecord } from "../../lib/types";

type ProjectHomeViewProps = {
  language: AppLanguage;
  agents: ProjectAgentRecord[];
  threads: ThreadRecord[];
  documents: GeneratedDocument[];
  sessions: SessionSummary[];
  activeExecution: ExecutionRecord | null;
};

export function ProjectHomeView({
  language,
  agents,
  threads,
  documents,
  sessions,
  activeExecution,
}: ProjectHomeViewProps) {
  const runningExecutions = sessions.filter((session) => session.execution_id && session.execution_status === "running").length;
  const pendingApprovals = sessions.filter(
    (session) => session.execution_status === "waiting_approval" || session.execution_status === "waiting_user",
  ).length;
  const blockedItems = sessions.filter(
    (session) => session.execution_status === "failed" || session.execution_status === "orphaned",
  ).length;

  return (
    <section
      data-testid="workspace-home-view"
      style={{
        display: "grid",
        gap: "18px",
        alignContent: "start",
      }}
    >
      <header style={{ display: "grid", gap: "6px" }}>
        <p style={eyebrowStyle}>{translate(language, "workspace.home.eyebrow")}</p>
        <h2 style={titleStyle}>{translate(language, "workspace.home.title")}</h2>
        <p style={subtitleStyle}>{translate(language, "workspace.home.description")}</p>
      </header>

      <section
        data-testid="workspace-home-status-section"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        <MetricCard label={translate(language, "workspace.home.metric.blocked")} value={blockedItems} tone={blockedItems > 0 ? "danger" : "muted"} />
        <MetricCard label={translate(language, "workspace.home.metric.approvals")} value={pendingApprovals} tone={pendingApprovals > 0 ? "attention" : "muted"} />
        <MetricCard label={translate(language, "workspace.home.metric.running")} value={runningExecutions} tone={runningExecutions > 0 ? "active" : "muted"} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "12px" }}>
        <section data-testid="workspace-home-agents-section" style={surfaceSectionStyle}>
          <SectionHeader
            eyebrow={translate(language, "workspace.home.section.presence")}
            title={translate(language, "workspace.home.section.agentPresence")}
            meta={`${agents.length || 1} ${translate(language, "workspace.home.meta.active")}`}
          />
          <div style={{ display: "grid", gap: "8px" }}>
            {(agents.length > 0 ? agents : [{ id: "solo-agent", display_name: translate(language, "workspace.home.agent.projectAgent"), status: "active" }]).map((agent) => (
              <article key={agent.id} style={rowCardStyle}>
                <div style={{ display: "grid", gap: "2px" }}>
                  <strong style={rowTitleStyle}>{agent.display_name ?? agent.agent_key ?? agent.id}</strong>
                  <span style={rowMetaStyle}>{agent.role ?? agent.agent_key ?? translate(language, "workspace.home.agent.projectRuntime")}</span>
                </div>
                <StatusPill label={readStatusLabel(language, agent.status ?? "active")} tone={mapStatusTone(agent.status)} />
              </article>
            ))}
          </div>
        </section>

        <section data-testid="workspace-home-executions-section" style={surfaceSectionStyle}>
          <SectionHeader
            eyebrow={translate(language, "workspace.home.section.runtime")}
            title={translate(language, "workspace.home.section.runningExecutions")}
            meta={readStatusLabel(language, activeExecution?.status ?? "idle")}
          />
          {activeExecution ? (
            <article style={executionCardStyle}>
              <div style={{ display: "grid", gap: "4px" }}>
                <strong style={rowTitleStyle}>{activeExecution.capability_key ?? activeExecution.execution_id}</strong>
                <span style={rowMetaStyle}>{activeExecution.execution_id}</span>
              </div>
              <StatusPill label={readStatusLabel(language, activeExecution.status)} tone={mapStatusTone(activeExecution.status)} />
            </article>
          ) : (
            <EmptyInlineCopy label={translate(language, "workspace.home.empty.executions")} />
          )}
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <section data-testid="workspace-home-tasks-section" style={surfaceSectionStyle}>
          <SectionHeader eyebrow={translate(language, "workspace.home.section.focus")} title={translate(language, "workspace.home.section.activeThreads")} meta={`${threads.length} ${translate(language, "workspace.home.meta.open")}`} />
          {threads.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {threads.slice(0, 4).map((thread) => (
                <article key={thread.id} style={rowCardStyle}>
                  <div style={{ display: "grid", gap: "2px" }}>
                    <strong style={rowTitleStyle}>{thread.title ?? translate(language, "workspace.home.thread.untitled")}</strong>
                    <span style={rowMetaStyle}>{readStatusLabel(language, thread.execution_status ?? thread.status ?? "active")}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyInlineCopy label={translate(language, "workspace.home.empty.threads")} />
          )}
        </section>

        <section data-testid="workspace-home-artifacts-section" style={surfaceSectionStyle}>
          <SectionHeader eyebrow={translate(language, "workspace.home.section.outputs")} title={translate(language, "workspace.home.section.recentArtifacts")} meta={`${documents.length} ${translate(language, "workspace.home.meta.files")}`} />
          {documents.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {documents.slice(0, 4).map((document) => (
                <article key={document.id} style={rowCardStyle}>
                  <div style={{ display: "grid", gap: "2px" }}>
                    <strong style={rowTitleStyle}>{document.title ?? document.document_type ?? document.id}</strong>
                    <span style={rowMetaStyle}>{document.document_type ?? translate(language, "workspace.home.artifact.generic")}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyInlineCopy label={translate(language, "workspace.home.empty.artifacts")} />
          )}
        </section>
      </div>

      <section data-testid="workspace-home-activity-section" style={surfaceSectionStyle}>
        <SectionHeader eyebrow={translate(language, "workspace.home.section.activity")} title={translate(language, "workspace.home.section.recentActivity")} meta={translate(language, "workspace.home.meta.operationallyAlive")} />
        <div style={{ display: "grid", gap: "8px" }}>
          {(threads.length > 0 ? threads.slice(0, 3) : sessions.slice(0, 3)).map((item) => (
            <article key={item.id} style={activityRowStyle}>
              <span style={activityDotStyle} />
              <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                <strong style={rowTitleStyle}>{readActivityTitle(item)}</strong>
                <span style={rowMetaStyle}>{readActivityMeta(item, language)}</span>
              </div>
            </article>
          ))}
          {threads.length === 0 && sessions.length === 0 ? (
            <EmptyInlineCopy label={translate(language, "workspace.home.empty.activity")} />
          ) : null}
        </div>
      </section>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "active" | "attention" | "danger" | "muted";
}) {
  return (
    <article
      style={{
        display: "grid",
        gap: "10px",
        padding: "14px",
        borderRadius: "12px",
        background: tone === "muted" ? "var(--theme-color-panel-muted)" : "color-mix(in srgb, var(--theme-color-panel-muted) 84%, white 16%)",
        borderBottom: `1px solid ${toneToBorder(tone)}`,
      }}
    >
      <span style={metricLabelStyle}>{label}</span>
      <strong style={metricValueStyle}>{value}</strong>
    </article>
  );
}

function SectionHeader({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) {
  return (
    <header style={{ display: "grid", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span style={eyebrowStyle}>{eyebrow}</span>
        <span style={headerMetaStyle}>{meta}</span>
      </div>
      <strong style={{ fontSize: "15px", color: "var(--theme-color-text-primary)" }}>{title}</strong>
    </header>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "active" | "attention" | "danger" | "muted" }) {
  return (
    <span
      style={{
        justifySelf: "start",
        minHeight: "24px",
        display: "inline-flex",
        alignItems: "center",
        padding: "0 8px",
        borderRadius: "999px",
        background: toneToBackground(tone),
        color: "var(--theme-color-text-primary)",
        fontSize: "12px",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

function EmptyInlineCopy({ label }: { label: string }) {
  return <p style={{ margin: 0, color: "var(--theme-color-text-secondary)", fontSize: "13px" }}>{label}</p>;
}

function mapStatusTone(status: string | null | undefined): "active" | "attention" | "danger" | "muted" {
  if (status === "running" || status === "active" || status === "completed") {
    return "active";
  }

  if (status === "waiting_approval" || status === "waiting_user" || status === "blocked") {
    return "attention";
  }

  if (status === "failed" || status === "orphaned" || status === "cancelled") {
    return "danger";
  }

  return "muted";
}

function readActivityTitle(item: ThreadRecord | SessionSummary) {
  if ("active_capability_key" in item && typeof item.active_capability_key === "string" && item.active_capability_key.length > 0) {
    return item.active_capability_key;
  }

  if ("title" in item && typeof item.title === "string" && item.title.length > 0) {
    return item.title;
  }

  return item.id;
}

function readActivityMeta(item: ThreadRecord | SessionSummary, language: AppLanguage) {
  if ("execution_status" in item && typeof item.execution_status === "string" && item.execution_status.length > 0) {
    return readStatusLabel(language, item.execution_status);
  }

  if ("updated_at" in item && typeof item.updated_at === "string" && item.updated_at.length > 0) {
    return item.updated_at;
  }

  return translate(language, "workspace.status.recentUpdate");
}

function readStatusLabel(language: AppLanguage, status: string) {
  if (status in statusKeyByValue) {
    return translate(language, statusKeyByValue[status as keyof typeof statusKeyByValue]);
  }

  return status;
}

const statusKeyByValue = {
  active: "workspace.status.active",
  inactive: "workspace.status.inactive",
  open: "workspace.status.open",
  idle: "workspace.status.idle",
  running: "workspace.execution.running",
  pending: "workspace.execution.pending",
  waiting_user: "workspace.execution.waiting_user",
  waiting_approval: "workspace.execution.waiting_approval",
  completed: "workspace.execution.completed",
  applied: "workspace.execution.applied",
  failed: "workspace.execution.failed",
  cancelled: "workspace.execution.cancelled",
  orphaned: "workspace.execution.orphaned",
} as const;

function toneToBackground(tone: "active" | "attention" | "danger" | "muted") {
  if (tone === "active") {
    return "color-mix(in srgb, var(--theme-color-accent-primary) 14%, transparent)";
  }

  if (tone === "attention") {
    return "rgba(245, 158, 11, 0.16)";
  }

  if (tone === "danger") {
    return "var(--theme-color-status-danger)";
  }

  return "var(--theme-color-panel-muted)";
}

function toneToBorder(tone: "active" | "attention" | "danger" | "muted") {
  if (tone === "active") {
    return "color-mix(in srgb, var(--theme-color-accent-primary) 55%, transparent)";
  }

  if (tone === "attention") {
    return "rgba(245, 158, 11, 0.4)";
  }

  if (tone === "danger") {
    return "rgba(248, 113, 113, 0.45)";
  }

  return "var(--theme-color-border-secondary)";
}

const titleStyle = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.05,
  fontWeight: 560,
  letterSpacing: "-0.03em",
  color: "var(--theme-color-text-primary)",
};

const subtitleStyle = {
  margin: 0,
  color: "var(--theme-color-text-secondary)",
  fontSize: "14px",
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const surfaceSectionStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--theme-color-panel-end) 72%, transparent)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const rowCardStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 88%, transparent)",
};

const executionCardStyle = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 88%, transparent)",
};

const metricLabelStyle = {
  fontSize: "12px",
  color: "var(--theme-color-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const metricValueStyle = {
  fontSize: "28px",
  lineHeight: 1,
  fontWeight: 560,
  color: "var(--theme-color-text-primary)",
};

const rowTitleStyle = {
  fontSize: "14px",
  fontWeight: 520,
  color: "var(--theme-color-text-primary)",
};

const rowMetaStyle = {
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const headerMetaStyle = {
  color: "var(--theme-color-text-muted)",
  fontSize: "12px",
};

const activityRowStyle = {
  display: "grid",
  gridTemplateColumns: "10px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
  padding: "8px 2px",
};

const activityDotStyle = {
  width: "6px",
  height: "6px",
  borderRadius: "999px",
  background: "var(--theme-color-accent-primary)",
  marginTop: "6px",
};
