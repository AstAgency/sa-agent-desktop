import { translate } from "../../lib/i18n";
import type { AppLanguage } from "../../lib/types";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

export function TasksView({ language }: { language: AppLanguage }) {
  return (
    <section data-testid="workspace-tasks-view" style={{ display: "grid", gap: "16px" }}>
      <h2 style={{ margin: 0 }}>{translate(language, "workspace.tasks.title")}</h2>
      <WorkspaceEmptyState
        title={translate(language, "workspace.tasks.title")}
        description={translate(language, "workspace.tasks.empty")}
      />
    </section>
  );
}
