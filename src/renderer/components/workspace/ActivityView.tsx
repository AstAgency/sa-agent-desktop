import { translate } from "../../lib/i18n";
import type { AppLanguage, CommitmentRecord, GeneratedDocument, SessionSummary, ThreadRecord } from "../../lib/types";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

type ActivityViewProps = {
  language: AppLanguage;
  sessions: SessionSummary[];
  threads: ThreadRecord[];
  commitments: CommitmentRecord[];
  documents: GeneratedDocument[];
};

export function ActivityView({ language, sessions, threads, commitments, documents }: ActivityViewProps) {
  const items = [
    ...threads.slice(0, 4).map((thread) => ({
      id: thread.id,
      kind: translate(language, "workspace.activity.kind.thread"),
      title: thread.title ?? translate(language, "workspace.activity.untitledThread"),
      meta: readUiMeta(language, thread.execution_status ?? thread.status ?? "active"),
    })),
    ...commitments.slice(0, 3).map((commitment) => ({
      id: commitment.id,
      kind: translate(language, "workspace.activity.kind.commitment"),
      title: commitment.title ?? translate(language, "workspace.activity.pendingCommitment"),
      meta: readUiMeta(language, commitment.status ?? "open"),
    })),
    ...documents.slice(0, 3).map((document) => ({
      id: document.id,
      kind: translate(language, "workspace.activity.kind.artifact"),
      title: document.title ?? document.document_type ?? document.id,
      meta: document.updated_at ?? translate(language, "workspace.status.updated"),
    })),
    ...sessions.slice(0, 3).map((session) => ({
      id: session.id,
      kind: translate(language, "workspace.activity.kind.execution"),
      title: session.active_capability_key ?? session.title ?? session.id,
      meta: readUiMeta(language, session.execution_status ?? session.session_state ?? "active"),
    })),
  ].slice(0, 8);

  return (
    <section data-testid="workspace-activity-view" style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "grid", gap: "6px" }}>
        <p style={eyebrowStyle}>{translate(language, "workspace.activity.eyebrow")}</p>
        <h2 style={headingStyle}>{translate(language, "workspace.activity.title")}</h2>
      </header>

      <div style={filterRailStyle}>
        {[
          "workspace.activity.filter.all",
          "workspace.activity.filter.executions",
          "workspace.activity.filter.tasks",
          "workspace.activity.filter.artifacts",
          "workspace.activity.filter.approvals",
          "workspace.activity.filter.agents",
        ].map((filter, index) => (
          <span
            key={filter}
            style={{
              ...filterChipStyle,
              background: index === 0 ? "var(--theme-color-panel-muted)" : "transparent",
              color: index === 0 ? "var(--theme-color-text-primary)" : "var(--theme-color-text-secondary)",
            }}
          >
            {translate(language, filter as never)}
          </span>
        ))}
      </div>

      {items.length === 0 ? (
        <WorkspaceEmptyState
          title={translate(language, "workspace.activity.title")}
          description={translate(language, "workspace.activity.empty")}
        />
      ) : (
        <div style={{ display: "grid", gap: "6px" }}>
          {items.map((item) => (
            <article key={item.id} style={eventRowStyle}>
              <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={kindBadgeStyle}>{item.kind}</span>
                  <strong style={eventTitleStyle}>{item.title}</strong>
                </div>
                <span style={eventMetaStyle}>{item.meta}</span>
              </div>
              <button type="button" style={actionButtonStyle}>
                {translate(language, "workspace.activity.open")}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function readUiMeta(language: AppLanguage, value: string) {
  if (value in statusKeyByValue) {
    return translate(language, statusKeyByValue[value as keyof typeof statusKeyByValue]);
  }

  return value;
}

const statusKeyByValue = {
  active: "workspace.status.active",
  inactive: "workspace.status.inactive",
  open: "workspace.status.open",
  updated: "workspace.status.updated",
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

const filterRailStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  paddingBottom: "4px",
};

const filterChipStyle = {
  minHeight: "28px",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 10px",
  borderRadius: "999px",
  border: "1px solid var(--theme-color-border-secondary)",
  fontSize: "12px",
};

const eventRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--theme-color-panel-muted) 84%, transparent)",
};

const kindBadgeStyle = {
  minHeight: "22px",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 8px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--theme-color-accent-primary) 12%, transparent)",
  color: "var(--theme-color-text-primary)",
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const eventTitleStyle = {
  fontSize: "14px",
  fontWeight: 520,
  color: "var(--theme-color-text-primary)",
};

const eventMetaStyle = {
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
