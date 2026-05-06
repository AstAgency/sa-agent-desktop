import type { ChangeEvent } from "react";
import { translate } from "../../lib/i18n";
import type { AppLanguage, UserOnboardingValues } from "../../lib/types";

type OnboardingFieldsProps = {
  language: AppLanguage;
  value: UserOnboardingValues;
  onChange: (value: UserOnboardingValues) => void;
  disabled?: boolean;
};

const fieldKeys = ["preferred_user_name", "preferred_agent_name", "activity_domain"] as const satisfies ReadonlyArray<
  keyof UserOnboardingValues
>;

type OnboardingFieldKey = (typeof fieldKeys)[number];

export function OnboardingFields({ language, value, onChange, disabled = false }: OnboardingFieldsProps) {
  const updateField = (key: OnboardingFieldKey) => (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      [key]: event.target.value,
    });
  };

  return (
    <div style={stackStyle}>
      {fieldKeys.map((fieldKey) => (
        <label key={fieldKey} style={fieldStyle}>
          <span style={labelStyle}>{translate(language, `onboarding.field.${fieldKey}.label`)}</span>
          <span style={helperStyle}>{translate(language, `onboarding.field.${fieldKey}.helper`)}</span>
          <input
            aria-label={translate(language, `onboarding.field.${fieldKey}.label`)}
            value={value[fieldKey]}
            onChange={updateField(fieldKey)}
            disabled={disabled}
            placeholder={translate(language, `onboarding.field.${fieldKey}.placeholder`)}
            style={inputStyle}
          />
        </label>
      ))}
    </div>
  );
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

const helperStyle = {
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.5,
  color: "var(--theme-color-text-muted)",
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
