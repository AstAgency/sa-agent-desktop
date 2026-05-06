import { useState } from "react";
import { translate } from "../../lib/i18n";
import type { AppLanguage, CreateProjectInput } from "../../lib/types";

type CreateProjectFormProps = {
  language: AppLanguage;
  disabled?: boolean;
  onSubmit: (value: CreateProjectInput) => Promise<void> | void;
};

export function CreateProjectForm({ language, disabled = false, onSubmit }: CreateProjectFormProps) {
  const [values, setValues] = useState<CreateProjectInput>({
    name: "",
    key: "",
    description: null,
  });

  const isValid = values.name.trim().length > 0;

  const updateField = (key: keyof CreateProjectInput) => (value: string) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!isValid || disabled) {
      return;
    }

    const name = values.name.trim();

    await onSubmit({
      key: buildProjectKey(name),
      name,
      description: null,
    });
  };

  return (
    <div style={stackStyle}>
      <label style={fieldStyle}>
        <span style={labelStyle}>{translate(language, "createProject.name")}</span>
        <input
          aria-label={translate(language, "createProject.name")}
          disabled={disabled}
          value={values.name}
          onChange={(event) => updateField("name")(event.target.value)}
          placeholder={translate(language, "createProject.placeholder.name")}
          style={inputStyle}
        />
      </label>
      <button type="button" onClick={handleSubmit} disabled={!isValid || disabled} style={buttonStyle}>
        {disabled ? translate(language, "createProject.submitting") : translate(language, "createProject.submit")}
      </button>
    </div>
  );
}

function buildProjectKey(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : `project-${Date.now().toString(36)}`;
}

const stackStyle = {
  display: "grid",
  gap: "var(--theme-spacing-md)",
};

const fieldStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const labelStyle = {
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "var(--theme-color-text-primary)",
};

const inputStyle = {
  minHeight: 48,
  width: "100%",
  borderRadius: "var(--theme-radius-medium)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  padding: "12px 14px",
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.5,
  outline: "none",
  boxSizing: "border-box" as const,
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
