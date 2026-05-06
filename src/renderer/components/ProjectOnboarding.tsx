import { useEffect, useRef, useState } from "react";
import { translate } from "../lib/i18n";
import { runProjectOnboarding } from "../lib/jobs";
import type { AppLanguage, UserOnboardingValues } from "../lib/types";
import { OnboardingFields } from "./forms/OnboardingFields";

type ProjectOnboardingProps = {
  language: AppLanguage;
  projectId: string;
  projectName: string;
  initialValues: UserOnboardingValues;
  onSuccess: () => void;
};

export function ProjectOnboarding({
  language,
  projectId,
  projectName,
  initialValues,
  onSuccess,
}: ProjectOnboardingProps) {
  const [values, setValues] = useState<UserOnboardingValues>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const isFormValid = Object.values(values).every((value) => value.trim().length > 0);

  const handleSubmit = async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(translate(language, "projectOnboarding.status.running"));

    try {
      await runProjectOnboarding({
        projectId,
        values: {
          preferred_user_name: values.preferred_user_name.trim(),
          preferred_agent_name: values.preferred_agent_name.trim(),
          activity_domain: values.activity_domain.trim(),
        },
        signal: controller.signal,
      });

      setStatusMessage(translate(language, "projectOnboarding.status.done"));
      onSuccess();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setStatusMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "Project onboarding failed.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsSubmitting(false);
    }
  };

  return (
    <section aria-label="Project onboarding chat" style={shellStyle}>
      <aside style={sidebarStyle}>
        <p style={eyebrowStyle}>{projectName}</p>
        <h1 style={sidebarTitleStyle}>{translate(language, "projectOnboarding.title")}</h1>
        <p style={sidebarBodyStyle}>{translate(language, "projectOnboarding.message")}</p>
      </aside>
      <main style={chatStyle}>
        <div style={messagesStyle}>
          <article style={assistantMessageStyle}>
            <p style={messageMetaStyle}>{translate(language, "chat.assistant")}</p>
            <p style={messageTextStyle}>{translate(language, "projectOnboarding.message")}</p>
          </article>
          <article style={formMessageStyle}>
            <p style={messageMetaStyle}>{translate(language, "chat.you")}</p>
            <OnboardingFields language={language} value={values} onChange={setValues} disabled={isSubmitting} />
          </article>
          {statusMessage ? <p style={statusStyle}>{statusMessage}</p> : null}
          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        </div>
        <div style={composerStyle}>
          <button type="button" onClick={handleSubmit} disabled={!isFormValid || isSubmitting} style={buttonStyle}>
            {isSubmitting
              ? translate(language, "projectOnboarding.submitting")
              : translate(language, "projectOnboarding.submit")}
          </button>
        </div>
      </main>
    </section>
  );
}

const shellStyle = {
  width: "min(1200px, calc(100vw - 24px))",
  minHeight: "min(760px, calc(100vh - 24px))",
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "var(--theme-spacing-md)",
  alignItems: "stretch",
};

const sidebarStyle = {
  flex: "1 1 280px",
  minWidth: 260,
  padding: "var(--theme-spacing-lg)",
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-rail)",
  border: "1px solid var(--theme-color-border-primary)",
  display: "grid",
  alignContent: "start",
  gap: "var(--theme-spacing-sm)",
  boxSizing: "border-box" as const,
};

const chatStyle = {
  flex: "2 1 560px",
  minWidth: 0,
  display: "grid",
  gridTemplateRows: "1fr auto",
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-primary)",
  overflow: "hidden" as const,
  minHeight: 0,
};

const messagesStyle = {
  display: "grid",
  alignContent: "start",
  gap: "var(--theme-spacing-md)",
  padding: "var(--theme-spacing-lg)",
  overflow: "auto" as const,
};

const assistantMessageStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
  padding: "var(--theme-spacing-md)",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-muted)",
  border: "1px solid var(--theme-color-border-secondary)",
};

const formMessageStyle = {
  display: "grid",
  gap: "var(--theme-spacing-sm)",
  padding: "var(--theme-spacing-md)",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-secondary)",
};

const composerStyle = {
  padding: "var(--theme-spacing-md)",
  borderTop: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-eyebrow)",
  color: "var(--theme-color-text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};

const sidebarTitleStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-title)",
  lineHeight: 1.1,
  color: "var(--theme-color-text-primary)",
};

const sidebarBodyStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-secondary)",
};

const messageMetaStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  color: "var(--theme-color-text-muted)",
};

const messageTextStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.6,
  color: "var(--theme-color-text-primary)",
};

const statusStyle = {
  margin: 0,
  padding: "12px",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-status-info)",
  color: "var(--theme-color-text-secondary)",
  fontSize: "var(--theme-font-size-caption)",
};

const errorStyle = {
  margin: 0,
  padding: "12px",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-status-danger)",
  color: "var(--theme-color-status-danger-text)",
  fontSize: "var(--theme-font-size-caption)",
};

const buttonStyle = {
  width: "100%",
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
