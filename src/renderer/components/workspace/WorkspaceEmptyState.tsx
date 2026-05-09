type WorkspaceEmptyStateProps = {
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  testId?: string;
};

export function WorkspaceEmptyState({
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  testId,
}: WorkspaceEmptyStateProps) {
  return (
    <section
      data-testid={testId}
      style={{
        display: "grid",
        gap: "10px",
        padding: "16px",
        borderRadius: "12px",
        background: "color-mix(in srgb, var(--theme-color-panel-muted) 82%, transparent)",
      }}
    >
      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 520 }}>{title}</h3>
      <p style={{ margin: 0, color: "var(--theme-color-text-secondary)", fontSize: "13px" }}>{description}</p>
      {primaryActionLabel ? (
        <button type="button" onClick={onPrimaryAction} style={actionButtonStyle}>
          {primaryActionLabel}
        </button>
      ) : null}
    </section>
  );
}

const actionButtonStyle = {
  justifySelf: "start",
  minHeight: "32px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-primary)",
  fontSize: "12px",
};
