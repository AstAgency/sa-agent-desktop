import { useState } from "react";
import { translate } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";
import { CreateProjectForm } from "./forms/CreateProjectForm";
import type { CreateProjectInput } from "../lib/types";

type EmptyProjectsProps = {
  language: AppLanguage;
  workspaceName: string;
  onCreateProject: (value: CreateProjectInput) => Promise<void>;
};

export function EmptyProjects({ language, workspaceName, onCreateProject }: EmptyProjectsProps) {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreateProject = async (value: CreateProjectInput) => {
    setIsCreating(true);
    setErrorMessage(null);

    try {
      await onCreateProject(value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : translate(language, "app.error.projectCreationFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section aria-label={translate(language, "emptyProjects.title")} style={panelStyle}>
      <p style={eyebrowStyle}>{workspaceName}</p>
      <h1 style={titleStyle}>{translate(language, "emptyProjects.title")}</h1>
      <p style={bodyStyle}>{translate(language, "emptyProjects.description")}</p>
      {!isFormVisible ? (
        <button type="button" onClick={() => setIsFormVisible(true)} style={buttonStyle}>
          {translate(language, "emptyProjects.cta")}
        </button>
      ) : (
        <CreateProjectForm language={language} disabled={isCreating} onSubmit={handleCreateProject} />
      )}
      {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
    </section>
  );
}

const panelStyle = {
  width: "min(92vw, 560px)",
  display: "grid",
  gap: "var(--theme-spacing-lg)",
  padding: 32,
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto" as const,
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  boxShadow: "var(--theme-shadow-panel)",
  border: "1px solid var(--theme-color-border-primary)",
  boxSizing: "border-box" as const,
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-eyebrow)",
  lineHeight: 1.4,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const titleStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-title)",
  lineHeight: 1.05,
  color: "var(--theme-color-text-primary)",
};

const bodyStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-secondary)",
};

const buttonStyle = {
  minHeight: 48,
  border: "1px solid var(--theme-color-accent-primary)",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-accent-primary)",
  color: "var(--theme-color-text-inverse)",
  padding: "12px 16px",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle = {
  margin: 0,
  padding: "12px",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-status-danger)",
  color: "var(--theme-color-status-danger-text)",
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.5,
};
