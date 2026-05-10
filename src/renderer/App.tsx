import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGate } from "./components/AuthGate";
import { BootstrapScreen } from "./components/BootstrapScreen";
import { EmptyProjects } from "./components/EmptyProjects";
import { ErrorScreen } from "./components/ErrorScreen";
import { LanguageSetup } from "./components/LanguageSetup";
import { SettingsPanel } from "./components/SettingsPanel";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { createWorkspaceProject, getCurrentApiBaseUrl, getEmbeddingPolicy, getMe, postDevReset } from "./lib/api";
import { clearEntityCache, invalidateCacheValue } from "./lib/cache";
import { getDebugNetworkEntries, getDebugStateSnapshot, type DebugStateSnapshot } from "./lib/debug";
import { translate } from "./lib/i18n";
import { clearStoredAppState, updateStoredAppState } from "./lib/storage";
import { buildThemeCssVariables } from "./theme/config";
import type {
  AppScreen,
  BootstrapErrorKind,
  DebugNetworkEntry,
  BootstrapSnapshot,
  BootstrapStage,
  CreateProjectInput,
  PersistedAppState,
  WorkspaceMode,
} from "./lib/types";
import { defaultAppState } from "./state/app-state";
import { bootstrapApp, decideInitialScreen, isExplicitlyIncompleteOnboarding, runBootstrapFlow } from "./state/bootstrap";

export default function App() {
  const embeddingPolicyCacheRef = useRef<{ label: string | null; fetchedAt: number } | null>(null);
  const [appState, setAppState] = useState<PersistedAppState | null>(null);
  const [screen, setScreen] = useState<AppScreen | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bootstrapStage, setBootstrapStage] = useState<BootstrapStage>("profile");
  const [bootstrapSnapshot, setBootstrapSnapshot] = useState<BootstrapSnapshot | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapErrorKind, setBootstrapErrorKind] = useState<BootstrapErrorKind>("request-failed");
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState<string | null>(null);
  const [embeddingPolicyLabel, setEmbeddingPolicyLabel] = useState<string | null>(null);
  const [debugNetworkEntries, setDebugNetworkEntries] = useState<DebugNetworkEntry[]>([]);
  const [debugStateSnapshot, setDebugStateSnapshot] = useState<DebugStateSnapshot | null>(null);

  useEffect(() => {
    let isMounted = true;

    void bootstrapApp().then(({ appState: nextAppState, screen: nextScreen }) => {
      if (!isMounted) {
        return;
      }

      setAppState(nextAppState);
      setScreen(nextScreen);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!appState?.isAuthenticated || screen !== "bootstrapping") {
      return;
    }

    let isActive = true;

    setBootstrapSnapshot(null);
    setBootstrapStage("profile");
    setBootstrapErrorKind("request-failed");
    setBootstrapErrorMessage(null);

    void runBootstrapFlow({
      onStageChange: (stage) => {
        if (isActive) {
          setBootstrapStage(stage);
        }
      },
      forceRefresh: bootstrapAttempt > 0,
      preferredProjectId: appState.activeProjectId ?? null,
      preferredAgentKey: appState.selectedAgentKey ?? null,
    })
      .then(({ screen: nextScreen, snapshot, errorKind }) => {
        if (!isActive) {
          return;
        }

        if (snapshot?.selectedAgentKey && snapshot.selectedAgentKey !== (appState.selectedAgentKey ?? null)) {
          void updateStoredAppState({ selectedAgentKey: snapshot.selectedAgentKey })
            .then((nextAppState) => {
              if (isActive) {
                setAppState(nextAppState);
              }
            })
            .catch(() => {
              if (isActive) {
                setAppState((current) => ({
                  ...(current ?? defaultAppState),
                  selectedAgentKey: snapshot.selectedAgentKey,
                }));
              }
            });
        }

        if (snapshot?.selectedWorkspace.id && snapshot.selectedWorkspace.id !== (appState?.activeWorkspaceId ?? null)) {
          void updateStoredAppState({ activeWorkspaceId: snapshot.selectedWorkspace.id })
            .then((nextAppState) => {
              if (isActive) {
                setAppState(nextAppState);
              }
            })
            .catch(() => {
              if (isActive) {
                setAppState((current) => ({
                  ...(current ?? defaultAppState),
                  activeWorkspaceId: snapshot.selectedWorkspace.id,
                }));
              }
            });
        }

        setBootstrapSnapshot(snapshot);
        setBootstrapErrorKind(errorKind ?? "request-failed");
        setBootstrapErrorMessage(null);
        setScreen(nextScreen);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setBootstrapSnapshot(null);
        setBootstrapErrorKind("request-failed");
        setBootstrapErrorMessage(error instanceof Error ? error.message : "Unknown bootstrap error.");
        setScreen("bootstrap-error");
      });

    return () => {
      isActive = false;
    };
  }, [appState?.activeProjectId, appState?.isAuthenticated, appState?.selectedAgentKey, bootstrapAttempt, screen]);

  useEffect(() => {
    document.documentElement.lang = appState?.language ?? "en";
  }, [appState?.language]);

  const activeLanguage = appState?.language ?? "en";
  const activeThemeMode = appState?.themeMode ?? "dark";

  useEffect(() => {
    document.documentElement.style.colorScheme = activeThemeMode;
    document.documentElement.dataset.themeMode = activeThemeMode;

    return () => {
      document.documentElement.style.colorScheme = "";
      delete document.documentElement.dataset.themeMode;
    };
  }, [activeThemeMode]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    let isActive = true;

    const refreshDebugData = () => {
      if (!isActive) {
        return;
      }

      setDebugNetworkEntries(getDebugNetworkEntries());
      setDebugStateSnapshot(
        getDebugStateSnapshot({
          appState,
          bootstrapSnapshot,
        }),
      );
    };

    const cachedEmbeddingPolicy = embeddingPolicyCacheRef.current;
    const embeddingPolicyCacheTtlMs = 24 * 60 * 60 * 1000;

    if (cachedEmbeddingPolicy && Date.now() - cachedEmbeddingPolicy.fetchedAt < embeddingPolicyCacheTtlMs) {
      setEmbeddingPolicyLabel(cachedEmbeddingPolicy.label);
    } else {
      void getEmbeddingPolicy()
        .then((policy) => {
          if (isActive) {
            const label = `${policy.model_id} · ${policy.dimensions}d`;
            embeddingPolicyCacheRef.current = {
              label,
              fetchedAt: Date.now(),
            };
            setEmbeddingPolicyLabel(label);
          }
        })
        .catch(() => {
          if (isActive) {
            embeddingPolicyCacheRef.current = {
              label: null,
              fetchedAt: Date.now(),
            };
            setEmbeddingPolicyLabel(null);
          }
        });
    }

    refreshDebugData();
    const intervalId = window.setInterval(refreshDebugData, 750);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [appState, bootstrapSnapshot, isSettingsOpen]);

  const selectLanguage = async (language: "ru" | "en") => {
    try {
      const nextAppState = await updateStoredAppState({ language });
      setAppState(nextAppState);
      setScreen((current) => (current === "language-setup" || current === null ? decideInitialScreen(nextAppState) : current));
    } catch {
      const nextAppState = { ...defaultAppState, language };
      setAppState(nextAppState);
      setScreen((current) => (current === "language-setup" || current === null ? decideInitialScreen(nextAppState) : current));
    }
  };

  const continueWithAuthStub = async () => {
    try {
      const nextAppState = await updateStoredAppState({ isAuthenticated: true });
      setAppState(nextAppState);
      setBootstrapAttempt(0);
      setBootstrapErrorKind("request-failed");
      setBootstrapSnapshot(null);
      setScreen(decideInitialScreen(nextAppState));
    } catch {
      const nextAppState = { ...(appState ?? defaultAppState), isAuthenticated: true };
      setAppState(nextAppState);
      setBootstrapAttempt(0);
      setBootstrapErrorKind("request-failed");
      setBootstrapSnapshot(null);
      setScreen(decideInitialScreen(nextAppState));
    }
  };

  const retryBootstrap = () => {
    setBootstrapSnapshot(null);
    setBootstrapErrorMessage(null);
    setBootstrapAttempt((current) => current + 1);
    setScreen("bootstrapping");
  };

  const refreshWorkspaceSnapshot = async (options?: {
    preserveThreadMode?: boolean;
    preferredProjectId?: string | null;
  }) => {
    const preferredProjectId = options?.preferredProjectId ?? appState?.activeProjectId ?? bootstrapSnapshot?.selectedProject?.id ?? null;
    const preferredAgentKey = appState?.selectedAgentKey ?? bootstrapSnapshot?.selectedAgentKey ?? null;
    const result = await runBootstrapFlow({
      forceRefresh: true,
      preferredProjectId,
      preferredAgentKey,
    });

    if (result.snapshot?.selectedAgentKey && result.snapshot.selectedAgentKey !== (appState?.selectedAgentKey ?? null)) {
      try {
        const nextAppState = await updateStoredAppState({
          selectedAgentKey: result.snapshot.selectedAgentKey,
          ...(preferredProjectId ? { activeProjectId: preferredProjectId } : {}),
          ...(options?.preserveThreadMode ? { workspaceMode: "thread" as const } : {}),
        });
        setAppState(nextAppState);
      } catch {
        setAppState((current) => ({
          ...(current ?? defaultAppState),
          selectedAgentKey: result.snapshot?.selectedAgentKey ?? null,
          ...(preferredProjectId ? { activeProjectId: preferredProjectId } : {}),
          ...(options?.preserveThreadMode ? { workspaceMode: "thread" as const } : {}),
        }));
      }
    } else if (options?.preserveThreadMode) {
      try {
        const nextAppState = await updateStoredAppState({
          workspaceMode: "thread",
          ...(preferredProjectId ? { activeProjectId: preferredProjectId } : {}),
        });
        setAppState(nextAppState);
      } catch {
        setAppState((current) => ({
          ...(current ?? defaultAppState),
          ...(preferredProjectId ? { activeProjectId: preferredProjectId } : {}),
          workspaceMode: "thread",
        }));
      }
    }

    setBootstrapSnapshot(result.snapshot);
    setBootstrapErrorKind(result.errorKind ?? "request-failed");
    setBootstrapErrorMessage(null);
    setScreen(result.screen);
  };

  const completeUserOnboarding = () => {
    invalidateCacheValue("me");
    invalidateCacheValue("me-bootstrap");
    void refreshWorkspaceSnapshot({ preserveThreadMode: true }).catch((error) => {
      setBootstrapErrorKind("request-failed");
      setBootstrapErrorMessage(error instanceof Error ? error.message : "Unknown bootstrap error.");
      setScreen("bootstrap-error");
    });
  };

  const refreshWorkspaceFromAssistantMutation = async (preferredProjectId?: string | null) => {
    const workspaceId = bootstrapSnapshot?.selectedWorkspace.id ?? null;

    invalidateCacheValue("me");
    invalidateCacheValue("me-bootstrap");
    if (workspaceId) {
      invalidateCacheValue(`projects:${workspaceId}`);
      if (preferredProjectId) {
        invalidateCacheValue(`sessions:${workspaceId}:${preferredProjectId}`);
      }
    }
    await refreshWorkspaceSnapshot({
      preserveThreadMode: true,
      preferredProjectId: preferredProjectId ?? null,
    });
  };

  const refreshProfileFromAssistantMutation = async () => {
    invalidateCacheValue("me");
    const profile = await getMe();
    setBootstrapSnapshot((current) => (current ? { ...current, profile } : current));
  };

  const createProject = async (input: CreateProjectInput) => {
    const workspaceId = bootstrapSnapshot?.selectedWorkspace.id;

    if (!workspaceId) {
      throw new Error(translate(activeLanguage, "app.error.workspaceUnavailable"));
    }

    const createdProject = await createWorkspaceProject(workspaceId, input);
    const nextAppState = await updateStoredAppState({ activeProjectId: createdProject.id });
    setAppState(nextAppState);
    invalidateCacheValue("me-bootstrap");
    invalidateCacheValue(`projects:${workspaceId}`);
    invalidateCacheValue(`sessions:${workspaceId}:${createdProject.id}`);
    setBootstrapSnapshot(null);
    setBootstrapAttempt((current) => current + 1);
    setScreen("bootstrapping");
  };

  const completeProjectOnboarding = () => {
    const selectedProject = bootstrapSnapshot?.selectedProject;

    if (!selectedProject) {
      throw new Error(translate(activeLanguage, "app.error.projectUnavailable"));
    }

    invalidateCacheValue(`projects:${selectedProject.workspace_id}`);
    invalidateCacheValue(`sessions:${selectedProject.workspace_id}:${selectedProject.id}`);
    invalidateCacheValue("me-bootstrap");
    void refreshWorkspaceSnapshot({ preserveThreadMode: true }).catch((error) => {
      setBootstrapErrorKind("request-failed");
      setBootstrapErrorMessage(error instanceof Error ? error.message : "Unknown bootstrap error.");
      setScreen("bootstrap-error");
    });
  };

  const selectProject = async (projectId: string | null) => {
    try {
      const nextAppState = await updateStoredAppState({
        activeProjectId: projectId,
        activeProjectAgentId: null,
        activeSessionId: null,
        activeThreadId: null,
      });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        activeProjectId: projectId,
        activeProjectAgentId: null,
        activeSessionId: null,
        activeThreadId: null,
      }));
    }

    if (!bootstrapSnapshot) {
      return;
    }

    if (projectId && projectId !== bootstrapSnapshot.selectedProject?.id) {
      setBootstrapSnapshot(null);
      setBootstrapAttempt((current) => current + 1);
      setScreen("bootstrapping");
      return;
    }

    const nextSelectedProject = projectId
      ? bootstrapSnapshot.projects.find((project) => project.id === projectId) ?? null
      : null;

    setBootstrapSnapshot({
      ...bootstrapSnapshot,
      selectedProject: nextSelectedProject,
    });
  };

  const selectAgent = async (agentKey: string | null) => {
    try {
      const nextAppState = await updateStoredAppState({
        selectedAgentKey: agentKey,
        activeProjectAgentId: null,
        activeSessionId: null,
        activeThreadId: null,
      });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        selectedAgentKey: agentKey,
        activeProjectAgentId: null,
        activeSessionId: null,
        activeThreadId: null,
      }));
    }

    setBootstrapSnapshot(null);
    setBootstrapAttempt((current) => current + 1);
    setScreen("bootstrapping");
  };

  const updateApiBaseUrl = async (apiBaseUrl: string) => {
    const nextAppState = await updateStoredAppState({ apiBaseUrl: apiBaseUrl || null });
    setAppState(nextAppState);
    setBootstrapErrorMessage(null);
    setIsSettingsOpen(false);

    if (nextAppState.isAuthenticated) {
      setBootstrapSnapshot(null);
      setBootstrapAttempt((current) => current + 1);
      setScreen("bootstrapping");
    }
  };

  const resetLocalState = async () => {
    try {
      await postDevReset();
    } catch {
      // Local reset remains available even if the dev reset endpoint is unavailable.
    } finally {
      await clearStoredAppState();
      clearEntityCache();
      setBootstrapSnapshot(null);
      setBootstrapAttempt(0);
      setBootstrapErrorKind("request-failed");
      setBootstrapErrorMessage(null);
      setIsSettingsOpen(false);
      setAppState(defaultAppState);
      setScreen("language-setup");
    }
  };

  const selectThemeMode = async (themeMode: "dark" | "light") => {
    try {
      const nextAppState = await updateStoredAppState({ themeMode });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        themeMode,
      }));
    }
  };

  const openDevtools = async () => {
    if (!window.saAgent?.devtools?.open) {
      return {
        ok: false,
        error: translate(activeLanguage, "app.error.devtoolsUnavailable"),
      };
    }

    return window.saAgent.devtools.open();
  };

  const selectWorkspaceMode = async (workspaceMode: WorkspaceMode) => {
    try {
      const nextAppState = await updateStoredAppState({ workspaceMode });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        workspaceMode,
      }));
    }
  };

  const handleActiveProjectAgentChange = useCallback(async (projectAgentId: string | null) => {
    try {
      const nextAppState = await updateStoredAppState({ activeProjectAgentId: projectAgentId });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        activeProjectAgentId: projectAgentId,
      }));
    }
  }, []);

  const handleActiveSessionChange = useCallback(async (sessionId: string | null) => {
    try {
      const nextAppState = await updateStoredAppState({ activeSessionId: sessionId });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        activeSessionId: sessionId,
      }));
    }
  }, []);

  const handleActiveThreadChange = useCallback(async (threadId: string | null) => {
    try {
      const nextAppState = await updateStoredAppState({ activeThreadId: threadId });
      setAppState(nextAppState);
    } catch {
      setAppState((current) => ({
        ...(current ?? defaultAppState),
        activeThreadId: threadId,
      }));
    }
  }, []);

  let content;

  if (!appState || !screen) {
    content = (
      <BootstrapScreen
        language="en"
        stageLabel={translate("en", "bootstrap.localStateTitle")}
        description={translate("en", "bootstrap.localStateDescription")}
      />
    );
  } else if (screen === "language-setup") {
    content = <LanguageSetup language={appState.language} onSelectLanguage={selectLanguage} />;
  } else if (screen === "auth") {
    content = <AuthGate language={activeLanguage} onContinue={continueWithAuthStub} />;
  } else if (screen === "bootstrapping") {
    content = (
      <BootstrapScreen
        language={activeLanguage}
        stageLabel={getStageLabel(activeLanguage, bootstrapStage)}
        description={translate(activeLanguage, "bootstrap.description")}
      />
    );
  } else if (screen === "bootstrap-error") {
    content = (
      <ErrorScreen
        language={activeLanguage}
        title={
          bootstrapErrorKind === "no-workspaces"
            ? translate(activeLanguage, "error.noWorkspaces.title")
            : translate(activeLanguage, "error.workspace.title")
        }
        description={
          bootstrapErrorKind === "no-workspaces"
            ? translate(activeLanguage, "error.noWorkspaces.description")
            : translate(activeLanguage, "error.workspace.description")
        }
        detail={`API: ${getCurrentApiBaseUrl()}${bootstrapErrorMessage ? `\nError: ${bootstrapErrorMessage}` : ""}`}
        actionLabel={translate(activeLanguage, "error.retry")}
        onAction={retryBootstrap}
        secondaryActionLabel={translate(activeLanguage, "error.settings")}
        onSecondaryAction={() => setIsSettingsOpen(true)}
      />
    );
  } else if (screen === "empty-projects") {
    content = (
      <EmptyProjects
        language={activeLanguage}
        workspaceName={bootstrapSnapshot?.selectedWorkspace.name ?? "SA-Agent Desktop"}
        onCreateProject={createProject}
      />
    );
  } else if (screen === "workspace-shell" && bootstrapSnapshot?.selectedWorkspace) {
    const onboarding =
      isExplicitlyIncompleteOnboarding(bootstrapSnapshot.profile.onboarding_completed)
        ? {
            kind: "user" as const,
            workspaceId: bootstrapSnapshot.selectedWorkspace.id,
            onComplete: completeUserOnboarding,
          }
        : bootstrapSnapshot.selectedProject && isExplicitlyIncompleteOnboarding(bootstrapSnapshot.selectedProject.onboarding_completed)
          ? {
              kind: "project" as const,
              projectId: bootstrapSnapshot.selectedProject.id,
              onComplete: completeProjectOnboarding,
            }
          : null;

    content = (
      <WorkspaceShell
        language={activeLanguage}
        workspace={bootstrapSnapshot.selectedWorkspace}
        agents={bootstrapSnapshot.agents}
        selectedAgentKey={bootstrapSnapshot.selectedAgentKey}
        profile={bootstrapSnapshot.profile}
        project={bootstrapSnapshot.selectedProject}
        projects={bootstrapSnapshot.projects}
        globalSessions={bootstrapSnapshot.globalSessions}
        globalAssistantMessages={bootstrapSnapshot.globalAssistantMessages}
        projectSessions={bootstrapSnapshot.projectSessions}
        onboarding={onboarding}
        initialWorkspaceMode={appState.workspaceMode ?? "home"}
        initialActiveProjectAgentId={appState.activeProjectAgentId ?? null}
        initialActiveSessionId={appState.activeSessionId ?? null}
        onWorkspaceModeChange={selectWorkspaceMode}
        onActiveProjectAgentChange={handleActiveProjectAgentChange}
        onActiveSessionChange={handleActiveSessionChange}
        onActiveThreadChange={handleActiveThreadChange}
        onSelectAgent={selectAgent}
        onSelectProject={selectProject}
        onCreateProject={createProject}
        onRefreshWorkspace={refreshWorkspaceFromAssistantMutation}
        onRefreshProfile={refreshProfileFromAssistantMutation}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
    );
  } else {
    content = (
      <section aria-label={translate(activeLanguage, "app.projectBootstrapPending.title")} style={panelStyle}>
        <p style={eyebrowStyle}>{bootstrapSnapshot?.selectedWorkspace.name ?? "SA-Agent Desktop"}</p>
        <h1 style={titleStyle}>{translate(activeLanguage, "app.projectBootstrapPending.title")}</h1>
        <p style={bodyStyle}>{translate(activeLanguage, "app.projectBootstrapPending.description")}</p>
      </section>
    );
  }

  const isWorkspaceShellScreen = screen === "workspace-shell";

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100vw",
        height: "100vh",
        display: isWorkspaceShellScreen ? "block" : "grid",
        placeItems: isWorkspaceShellScreen ? undefined : "center",
        margin: 0,
        overflow: "hidden",
        background:
          "radial-gradient(circle at top, var(--theme-color-app-bg-glow), transparent 32%), linear-gradient(180deg, var(--theme-color-app-bg-start), var(--theme-color-app-bg-middle) 58%, var(--theme-color-app-bg-end))",
        color: "var(--theme-color-text-primary)",
        fontFamily: "var(--theme-font-sans)",
        ...(buildThemeCssVariables(activeThemeMode) as Record<string, string>),
      }}
    >
      {content}
      {appState?.language && screen !== "bootstrap-error" && screen !== "workspace-shell" ? (
        <button type="button" aria-label={translate(activeLanguage, "settings.open")} onClick={() => setIsSettingsOpen(true)} style={settingsLauncherStyle}>
          {translate(activeLanguage, "settings.open")}
        </button>
      ) : null}
      {isSettingsOpen && appState?.language ? (
        <SettingsPanel
          language={appState.language}
          themeMode={activeThemeMode}
          apiBaseUrl={appState.apiBaseUrl ?? getCurrentApiBaseUrl()}
          devModeEnabled={appState.devModeEnabled ?? true}
          embeddingPolicyLabel={embeddingPolicyLabel}
          debugNetworkEntries={debugNetworkEntries}
          debugStateSnapshot={debugStateSnapshot}
          onClose={() => setIsSettingsOpen(false)}
          onOpenDevtools={openDevtools}
          onLanguageChange={selectLanguage}
          onThemeModeChange={selectThemeMode}
          onApiBaseUrlChange={updateApiBaseUrl}
          onResetLocalState={resetLocalState}
        />
      ) : null}
    </main>
  );
}

function getStageLabel(language: "ru" | "en", stage: BootstrapStage) {
  return translate(language, `bootstrap.stage.${stage}` as never);
}

const panelStyle = {
  width: "min(92vw, 540px)",
  padding: "var(--theme-spacing-xl) var(--theme-spacing-lg)",
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  boxShadow: "var(--theme-shadow-panel)",
  border: "1px solid var(--theme-color-border-primary)",
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const titleStyle = {
  margin: "16px 0 8px",
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

const settingsLauncherStyle = {
  position: "fixed" as const,
  top: 16,
  right: 16,
  minHeight: 40,
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "8px 12px",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 700,
  cursor: "pointer",
};
