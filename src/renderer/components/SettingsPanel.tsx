import { useEffect, useState } from "react";
import type { DebugAgentRuntimeEntry, DebugStateSnapshot } from "../lib/debug";
import { translate } from "../lib/i18n";
import type { AppLanguage, DebugNetworkEntry, ThemeMode } from "../lib/types";

type SettingsPanelProps = {
  language: AppLanguage;
  themeMode: ThemeMode;
  apiBaseUrl: string;
  devModeEnabled: boolean;
  embeddingPolicyLabel?: string | null;
  debugNetworkEntries?: DebugNetworkEntry[];
  debugStateSnapshot?: DebugStateSnapshot | null;
  onClose: () => void;
  onOpenDevtools: () => Promise<{ ok: boolean; error?: string | null }> | { ok: boolean; error?: string | null };
  onLanguageChange: (language: AppLanguage) => Promise<void> | void;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void> | void;
  onApiBaseUrlChange: (value: string) => Promise<void> | void;
  onResetLocalState: () => Promise<void> | void;
};

export function SettingsPanel({
  language,
  themeMode,
  apiBaseUrl,
  devModeEnabled,
  embeddingPolicyLabel = null,
  debugNetworkEntries = [],
  debugStateSnapshot = null,
  onClose,
  onOpenDevtools,
  onLanguageChange,
  onThemeModeChange,
  onApiBaseUrlChange,
  onResetLocalState,
}: SettingsPanelProps) {
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(apiBaseUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [devtoolsStatus, setDevtoolsStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraftApiBaseUrl(apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    setDevtoolsStatus(null);
  }, [language]);

  const saveApiBaseUrl = async () => {
    setIsSaving(true);

    try {
      await onApiBaseUrlChange(draftApiBaseUrl.trim());
    } finally {
      setIsSaving(false);
    }
  };

  const resetLocalState = async () => {
    setIsResetting(true);

    try {
      await onResetLocalState();
    } finally {
      setIsResetting(false);
    }
  };

  const openDevtools = async () => {
    const result = await onOpenDevtools();
    setDevtoolsStatus(
      result.ok
        ? translate(language, "settings.devtools.status.opened")
        : `${translate(language, "settings.devtools.status.failed")}: ${result.error ?? translate(language, "settings.devtools.status.unavailable")}`,
    );
  };

  return (
    <div aria-label={translate(language, "settings.title")} style={overlayStyle}>
      <section aria-label={translate(language, "settings.title")} style={panelStyle}>
        <div style={headerStyle}>
          <div style={titleBlockStyle}>
            <p style={eyebrowStyle}>{translate(language, "app.name")}</p>
            <h2 style={titleStyle}>{translate(language, "settings.title")}</h2>
          </div>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            {translate(language, "settings.close")}
          </button>
        </div>

        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>{translate(language, "settings.label.language")}</p>
          <div style={buttonRowStyle}>
            <button type="button" onClick={() => void onLanguageChange("ru")} style={languageButtonStyle(language === "ru")}>
              Русский
            </button>
            <button type="button" onClick={() => void onLanguageChange("en")} style={languageButtonStyle(language === "en")}>
              {language === "ru" ? "Английский" : "English"}
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>{translate(language, "settings.label.theme")}</p>
          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={() => void onThemeModeChange("dark")}
              style={languageButtonStyle(themeMode === "dark")}
            >
              {translate(language, "settings.theme.dark")}
            </button>
            <button
              type="button"
              onClick={() => void onThemeModeChange("light")}
              style={languageButtonStyle(themeMode === "light")}
            >
              {translate(language, "settings.theme.light")}
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>{translate(language, "tools.embeddingPolicy")}</p>
          <p style={bodyTextStyle}>
            {embeddingPolicyLabel ?? translate(language, "tools.embeddingUnavailable")}
          </p>
        </div>

        <div style={sectionStyle}>
          <label style={fieldStyle}>
            <span style={sectionLabelStyle}>{translate(language, "settings.label.apiBaseUrl")}</span>
            <input
              aria-label={translate(language, "settings.label.apiBaseUrl")}
              value={draftApiBaseUrl}
              onChange={(event) => setDraftApiBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:3000"
              style={inputStyle}
            />
          </label>
          <div style={buttonRowStyle}>
            <button type="button" onClick={() => void saveApiBaseUrl()} style={primaryButtonStyle} disabled={isSaving}>
              {isSaving ? translate(language, "settings.saving") : translate(language, "settings.saveApi")}
            </button>
          </div>
        </div>

        {devModeEnabled ? (
          <div style={sectionStyle}>
            <p style={sectionLabelStyle}>{translate(language, "settings.label.developer")}</p>
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => void openDevtools()} style={ghostButtonStyle}>
                {translate(language, "settings.devtools")}
              </button>
            </div>
            {devtoolsStatus ? <p style={bodyTextStyle}>{devtoolsStatus}</p> : null}
            <button type="button" onClick={() => void resetLocalState()} style={dangerButtonStyle} disabled={isResetting}>
              {isResetting ? translate(language, "settings.resetting") : translate(language, "settings.reset")}
            </button>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.network")}</p>
              <pre style={debugPreStyle}>
                {debugNetworkEntries.length > 0
                  ? JSON.stringify(debugNetworkEntries, null, 2)
                  : translate(language, "settings.debug.empty")}
              </pre>
            </div>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.appState")}</p>
              <pre style={debugPreStyle}>
                {JSON.stringify(debugStateSnapshot?.appState ?? debugStateSnapshot?.localStorageAppState ?? null, null, 2)}
              </pre>
            </div>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.bootstrap")}</p>
              <pre style={debugPreStyle}>{JSON.stringify(debugStateSnapshot?.bootstrapSnapshot ?? null, null, 2)}</pre>
            </div>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.cache")}</p>
              <pre style={debugPreStyle}>
                {debugStateSnapshot?.entityCache?.length
                  ? JSON.stringify(debugStateSnapshot.entityCache, null, 2)
                  : translate(language, "settings.debug.empty")}
              </pre>
            </div>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.trace")}</p>
              <div data-testid="settings-debug-trace" style={traceListStyle}>
                {debugStateSnapshot?.agentRuntime?.length
                  ? debugStateSnapshot.agentRuntime.map((entry) => (
                    <article key={entry.id} style={traceItemStyle}>
                      <div style={traceItemHeaderStyle}>
                        <strong style={traceItemTypeStyle}>{entry.type}</strong>
                        <span style={traceItemTimeStyle}>{formatTraceTimestamp(entry.startedAt)}</span>
                      </div>
                      <div style={traceItemMetaStyle}>
                        {entry.sessionId ? <span>session: {entry.sessionId}</span> : null}
                        {formatTraceDetails(entry.data)}
                      </div>
                    </article>
                  ))
                  : <p style={bodyTextStyle}>{translate(language, "settings.debug.empty")}</p>}
              </div>
            </div>
            <div style={debugSectionStyle}>
              <p style={sectionLabelStyle}>{translate(language, "settings.debug.agentRuntime")}</p>
              <pre style={debugPreStyle}>
                {debugStateSnapshot?.agentRuntime?.length
                  ? JSON.stringify(debugStateSnapshot.agentRuntime, null, 2)
                  : translate(language, "settings.debug.empty")}
              </pre>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatTraceTimestamp(startedAt: string) {
  const date = new Date(startedAt);

  if (Number.isNaN(date.getTime())) {
    return startedAt;
  }

  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTraceDetails(data: DebugAgentRuntimeEntry["data"]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const pairs = Object.entries(data)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatTraceValue(value)}`);

  if (pairs.length === 0) {
    return null;
  }

  return <span>{pairs.join(" · ")}</span>;
}

function formatTraceValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatTraceValue(item)).join(", ");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(3, 6, 12, 0.72)",
  display: "grid",
  placeItems: "center",
  padding: "var(--theme-spacing-lg)",
};

const panelStyle = {
  width: "min(92vw, 620px)",
  display: "grid",
  gap: "var(--theme-panel-gap)",
  padding: "var(--theme-panel-padding)",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto" as const,
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-primary)",
  boxShadow: "var(--theme-shadow-panel)",
  boxSizing: "border-box" as const,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--theme-spacing-md)",
  alignItems: "start",
};

const titleBlockStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
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
  fontSize: "var(--theme-font-size-section)",
  lineHeight: 1.1,
  color: "var(--theme-color-text-primary)",
};

const sectionStyle = {
  display: "grid",
  gap: "var(--theme-spacing-sm)",
};

const debugSectionStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const traceListStyle = {
  display: "grid",
  gap: "8px",
};

const traceItemStyle = {
  display: "grid",
  gap: "4px",
  padding: "10px 12px",
  borderRadius: "var(--theme-radius-medium)",
  background: "var(--theme-color-panel-muted)",
  border: "1px solid var(--theme-color-border-secondary)",
};

const traceItemHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "8px",
  alignItems: "center",
};

const traceItemTypeStyle = {
  fontSize: "12px",
  lineHeight: 1.4,
  color: "var(--theme-color-text-primary)",
};

const traceItemTimeStyle = {
  fontSize: "11px",
  lineHeight: 1.4,
  color: "var(--theme-color-text-muted)",
};

const traceItemMetaStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  fontFamily: "var(--theme-font-mono)",
  fontSize: "11px",
  lineHeight: 1.5,
  color: "var(--theme-color-text-secondary)",
};

const sectionLabelStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.4,
  color: "var(--theme-color-text-muted)",
  fontWeight: 700,
};

const buttonRowStyle = {
  display: "flex",
  gap: "var(--theme-spacing-sm)",
  flexWrap: "wrap" as const,
};

const fieldStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const bodyTextStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.5,
  color: "var(--theme-color-text-secondary)",
};

const debugPreStyle = {
  margin: 0,
  padding: "var(--theme-card-padding)",
  borderRadius: "var(--theme-radius-medium)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-secondary)",
  fontFamily: "var(--theme-font-mono)",
  fontSize: "12px",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap" as const,
  overflowX: "auto" as const,
  maxHeight: 220,
};

const inputStyle = {
  minHeight: "var(--theme-input-min-height)",
  borderRadius: "var(--theme-radius-medium)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  padding: "var(--theme-input-padding-y) var(--theme-input-padding-x)",
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.5,
  outline: "none",
  boxSizing: "border-box" as const,
};

const primaryButtonStyle = {
  minHeight: "var(--theme-button-height)",
  border: "1px solid var(--theme-color-accent-primary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px var(--theme-button-padding-x)",
  background: "var(--theme-color-accent-primary)",
  color: "var(--theme-color-text-inverse)",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle = {
  minHeight: 40,
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "8px 12px",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 600,
  cursor: "pointer",
};

function languageButtonStyle(isActive: boolean) {
  return {
    ...ghostButtonStyle,
    minHeight: "var(--theme-button-height)",
    background: isActive ? "var(--theme-color-accent-primary)" : "var(--theme-color-panel-muted)",
    border: isActive
      ? "1px solid var(--theme-color-accent-primary)"
      : "1px solid var(--theme-color-border-secondary)",
    color: isActive ? "var(--theme-color-text-inverse)" : "var(--theme-color-text-primary)",
  };
}

const dangerButtonStyle = {
  minHeight: "var(--theme-button-height)",
  border: "1px solid rgba(126, 52, 63, 0.48)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "12px var(--theme-button-padding-x)",
  background: "var(--theme-color-status-danger)",
  color: "var(--theme-color-status-danger-text)",
  fontSize: "var(--theme-font-size-body)",
  fontWeight: 700,
  cursor: "pointer",
};
