import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createSession,
  createSkillRun,
  generateProjectDocument,
  getProjectDocuments,
  getSession,
  getSessionMessages,
  getSkills,
  getTemplate,
  getTemplates,
  postMeOnboarding,
  postProjectOnboarding,
  streamSessionMessage,
} from "../lib/api";
import { translate } from "../lib/i18n";
import type {
  AppLanguage,
  ConversationScope,
  CreateProjectInput,
  GeneratedDocument,
  GlobalRuntimeContext,
  JobRecord,
  SkillCatalogItem,
  TemplateSummary,
  ProjectRuntimeContext,
  ProjectSummary,
  SessionMessage,
  SessionSummary,
  ViewerProfile,
  WorkspaceSummary,
} from "../lib/types";
import { pollJobUntilTerminal } from "../lib/jobs";
import { CreateProjectForm } from "./forms/CreateProjectForm";

type WorkspaceShellProps = {
  language: AppLanguage;
  workspace: WorkspaceSummary;
  profile: ViewerProfile;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  globalSessions: SessionSummary[];
  globalRuntimeContext: GlobalRuntimeContext | null;
  projectSessions: SessionSummary[];
  projectRuntimeContext: ProjectRuntimeContext | null;
  onboarding:
    | {
        kind: "user";
        workspaceId: string;
        onComplete: () => void;
      }
    | {
        kind: "project";
        projectId: string;
        onComplete: () => void;
      }
    | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: (value: CreateProjectInput) => Promise<void>;
  onOpenSettings: () => void;
};

const ONBOARDING_START_PROMPT = {
  ru: "Начни онбординг на русском языке, задай первый вопрос и веди диалог до завершения.",
  en: "Start onboarding in English, ask the first question, and continue the dialog until completion.",
} as const;

export function WorkspaceShell({
  language,
  workspace,
  profile,
  project,
  projects,
  globalSessions,
  globalRuntimeContext,
  projectSessions,
  projectRuntimeContext,
  onboarding,
  onSelectProject,
  onCreateProject,
  onOpenSettings,
}: WorkspaceShellProps) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [isAwaitingAssistantStream, setIsAwaitingAssistantStream] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreateProjectVisible, setIsCreateProjectVisible] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const [oneShotStatus, setOneShotStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [templateVariablesText, setTemplateVariablesText] = useState("{}");
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [blockedOnboardingSkillId, setBlockedOnboardingSkillId] = useState<string | null>(null);
  const [isRecoveringOnboarding, setIsRecoveringOnboarding] = useState(false);
  const [activeSessionByScope, setActiveSessionByScope] = useState<Record<ConversationScope, SessionSummary | null>>({
    global: null,
    project: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const currentScope: ConversationScope = project ? "project" : "global";
  const currentRuntimeContext = project ? projectRuntimeContext : globalRuntimeContext;
  const currentSessions = project ? projectSessions : globalSessions;
  const activeSession = activeSessionByScope[currentScope] ?? currentRuntimeContext?.active_session ?? currentSessions[0] ?? null;
  const expectedOnboardingSkillId = onboarding ? (onboarding.kind === "user" ? "onboard" : "project-onboard") : null;
  const expectedOnboardingSkill = expectedOnboardingSkillId
    ? skills.find((skill) => skill.skill_id === expectedOnboardingSkillId) ?? null
    : null;
  const onboardingSession =
    onboarding
      ? (activeSession?.active_skill_id === expectedOnboardingSkillId ? activeSession : null) ??
        currentSessions.find((session) => session.active_skill_id === expectedOnboardingSkillId) ??
        null
      : null;
  const isSendDisabled =
    !draftMessage.trim() || isSendingMessage || isCreatingSession || (Boolean(onboarding) && !onboardingSession);
  const sendDisabledReason = isCreatingSession || (Boolean(onboarding) && !onboardingSession)
    ? translate(language, "chat.send.disabled.onboarding")
    : isSendingMessage
      ? translate(language, "chat.send.disabled.pending")
      : null;

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!onboardingSession || !onboarding) {
      return;
    }

    const completionPayload = onboardingSession.skill_state?.status === "completed"
      ? onboardingSession.skill_state.completion_payload ?? null
      : null;

    if (!completionPayload || isRecoveringOnboarding) {
      return;
    }

    let isActive = true;
    setIsRecoveringOnboarding(true);
    setErrorMessage(null);

    const commit = async () => {
      try {
        if (onboarding.kind === "user") {
          await postMeOnboarding({
            skill_id: "onboard",
            payload: completionPayload,
          });
        } else {
          await postProjectOnboarding(onboarding.projectId, {
            skill_id: "project-onboard",
            payload: completionPayload,
          });
        }

        if (isActive) {
          onboarding.onComplete();
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to recover onboarding state.");
        }
      } finally {
        if (isActive) {
          setIsRecoveringOnboarding(false);
        }
      }
    };

    void commit();

    return () => {
      isActive = false;
    };
  }, [isRecoveringOnboarding, onboarding, onboardingSession]);

  async function ensureSessionForCurrentScope(input?: {
    skillId?: string;
    skillInput?: Record<string, unknown>;
  }) {
    const scopeKey = input?.skillId === "project-onboard" || project ? "project" : "global";
    const existingSession =
      input?.skillId
        ? currentSessions.find((session) => session.active_skill_id === input.skillId) ??
          (activeSession?.active_skill_id === input.skillId ? activeSession : null)
        : activeSessionByScope[scopeKey] ?? currentRuntimeContext?.active_session ?? currentSessions[0] ?? null;

    if (existingSession) {
      return existingSession;
    }

    setIsCreatingSession(true);
    setErrorMessage(null);

    try {
      const createdSession = await createSession({
        workspace_id: workspace.id,
        project_id: project?.id ?? undefined,
        skill_id: input?.skillId,
        skill_input: input?.skillInput,
        channel_kind: "desktop",
        resume_strategy: "new",
      });

      setActiveSessionByScope((current) => ({
        ...current,
        [scopeKey]: createdSession,
      }));

      return createdSession;
    } finally {
      setIsCreatingSession(false);
    }
  }

  useEffect(() => {
    setActiveSessionByScope((current) => ({
      global: current.global ?? globalRuntimeContext?.active_session ?? globalSessions[0] ?? null,
      project: current.project ?? projectRuntimeContext?.active_session ?? projectSessions[0] ?? null,
    }));
  }, [globalRuntimeContext?.active_session, globalSessions, projectRuntimeContext?.active_session, projectSessions]);

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      getSkills().then((items) => {
        if (!isActive) {
          return;
        }

        const availableSkills = items.filter((item) => item.interaction_mode === "one_shot" || item.interaction_mode === "both");
        setSkills(availableSkills);
        setSelectedSkillId((current) => current || availableSkills[0]?.skill_id || "");
      }),
      getTemplates().then((items) => {
        if (!isActive) {
          return;
        }

        setTemplates(items);
        setSelectedTemplateId((current) => current || items[0]?.template_id || "");
      }),
    ]).catch(() => {
      if (isActive) {
        setToolMessage("Failed to load utility data.");
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      return;
    }

    let isActive = true;
    void getTemplate(selectedTemplateId)
      .then((template) => {
        if (!isActive) {
          return;
        }

        setSelectedTemplate(template);
        setDocumentTitle((current) => current || template.display_name);
        setTemplateVariablesText(
          JSON.stringify(readTemplateSeedVariables(template.variable_schema), null, 2),
        );
      })
      .catch(() => {
        if (isActive) {
          setSelectedTemplate(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!project?.id) {
      setDocuments([]);
      return;
    }

    let isActive = true;
    void getProjectDocuments(project.id)
      .then((items) => {
        if (isActive) {
          setDocuments(items);
        }
      })
      .catch(() => {
        if (isActive) {
          setDocuments([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [project?.id]);

  useEffect(() => {
    if (!activeSession?.id) {
      setMessages([]);
      return;
    }

    let isActive = true;
    setIsLoadingMessages(true);

    void getSessionMessages(activeSession.id)
      .then((items) => {
        if (isActive) {
          setMessages(items);
        }
      })
      .catch((error) => {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load messages.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeSession?.id]);

  useEffect(() => {
    if (!onboarding || isCreatingSession) {
      return;
    }

    if (expectedOnboardingSkillId && blockedOnboardingSkillId === expectedOnboardingSkillId) {
      return;
    }

    if (
      expectedOnboardingSkill &&
      expectedOnboardingSkill.interaction_mode !== "interactive" &&
      expectedOnboardingSkill.interaction_mode !== "both"
    ) {
      setBlockedOnboardingSkillId(expectedOnboardingSkill.skill_id);
      setErrorMessage(
        translate(
          language,
          onboarding.kind === "user"
            ? "userOnboarding.error.nonInteractive"
            : "projectOnboarding.error.nonInteractive",
        ),
      );
      return;
    }

    if (onboardingSession) {
      if (activeSession?.id !== onboardingSession.id) {
        setActiveSessionByScope((current) => ({
          ...current,
          [onboarding.kind === "user" ? "global" : "project"]: onboardingSession,
        }));
      }

      return;
    }

    let isActive = true;

    void ensureSessionForCurrentScope({
      skillId: onboarding.kind === "user" ? "onboard" : "project-onboard",
      skillInput: { locale: language },
    })
      .then(async (session) => {
        if (!isActive) {
          return;
        }

        await sendMessageInternal(
          session,
          ONBOARDING_START_PROMPT[language],
          {
            hiddenPrompt: ONBOARDING_START_PROMPT[language],
          },
          onboarding,
        );
      })
      .catch((error) => {
        if (isActive) {
          const message = error instanceof Error ? error.message : "Failed to start onboarding.";

          if (
            expectedOnboardingSkillId &&
            (message.includes("does not support interactive sessions") || message.includes("skill_not_interactive"))
          ) {
            setBlockedOnboardingSkillId(expectedOnboardingSkillId);
            setErrorMessage(
              translate(
                language,
                onboarding.kind === "user"
                  ? "userOnboarding.error.nonInteractive"
                  : "projectOnboarding.error.nonInteractive",
              ),
            );
            return;
          }

          setErrorMessage(message);
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    activeSession,
    blockedOnboardingSkillId,
    currentSessions,
    expectedOnboardingSkill,
    expectedOnboardingSkillId,
    isCreatingSession,
    language,
    onboarding,
    onboardingSession,
    workspace.id,
  ]);

  useEffect(() => {
    if (onboarding || project || activeSession || isCreatingSession) {
      return;
    }

    let isActive = true;

    void ensureSessionForCurrentScope()
      .catch((error) => {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to create a workspace session.");
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeSession, isCreatingSession, onboarding, project, workspace.id]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.is_hidden && !isHiddenPromptMessage(message.content_markdown)),
    [messages],
  );

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "auto",
      });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [visibleMessages.length, streamingAssistantText, isLoadingMessages, isCreatingSession, errorMessage]);

  const handleSend = async () => {
    if (isSendDisabled) {
      return;
    }

    setErrorMessage(null);
    const trimmed = draftMessage.trim();
    setDraftMessage("");

    if (selectedTemplateId && !selectedSkillId && !onboarding) {
      if (!project?.id) {
        setDraftMessage(trimmed);
        setToolMessage("Template generation is available only inside a project.");
        return;
      }

      setIsSendingMessage(true);
      setToolMessage(null);

      try {
        const accepted = await generateProjectDocument(project.id, {
          template_id: selectedTemplateId,
          title: buildGeneratedDocumentTitle(selectedTemplate, trimmed),
          session_id: activeSession?.id ?? null,
          variables: buildTemplateInputPayload(trimmed),
        });
        const job = await pollJobUntilTerminal({ jobId: accepted.job_id });

        if (job.status === "failed") {
          throw new Error(readJobError(job) ?? "Document generation failed.");
        }

        const nextDocuments = await getProjectDocuments(project.id);
        setDocuments(nextDocuments);
        setToolMessage(translate(language, "tools.templates.generated"));
      } catch (error) {
        setDraftMessage(trimmed);
        setToolMessage(error instanceof Error ? error.message : "Document generation failed.");
      } finally {
        setIsSendingMessage(false);
      }

      return;
    }

    if (selectedSkillId && !onboarding) {
      setIsSendingMessage(true);
      setToolMessage(null);
      setOneShotStatus(translate(language, "tools.skills.running"));

      try {
        const accepted = await createSkillRun({
          workspace_id: workspace.id,
          project_id: project?.id ?? undefined,
          skill_id: selectedSkillId,
          input_payload: buildOneShotInputPayload(trimmed),
        });
        const job = await pollJobUntilTerminal({ jobId: accepted.job_id });

        if (job.status === "failed") {
          throw new Error(readJobError(job) ?? "Skill execution failed.");
        }

        setOneShotStatus(buildJobCompletionLabel(job));
      } catch (error) {
        setDraftMessage(trimmed);
        setOneShotStatus(null);
        setToolMessage(error instanceof Error ? error.message : "Skill execution failed.");
      } finally {
        setIsSendingMessage(false);
      }

      return;
    }

    if (onboarding && onboardingSession) {
      await sendMessageInternal(onboardingSession, trimmed, undefined, onboarding);
      return;
    }

    let session = activeSession;

    if (!session) {
      setIsCreatingSession(true);

      try {
        session = await createSession({
          workspace_id: workspace.id,
          project_id: project?.id ?? undefined,
          channel_kind: "desktop",
          resume_strategy: "new",
        });
        setActiveSessionByScope((current) => ({
          ...current,
          [currentScope]: session,
        }));
      } catch (error) {
        setDraftMessage(trimmed);
        setErrorMessage(error instanceof Error ? error.message : "Failed to create a session.");
        setIsCreatingSession(false);
        return;
      }

      setIsCreatingSession(false);
    }

    await sendMessageInternal(session, trimmed, undefined, onboarding);
  };

  const handleSelectScope = (scope: ConversationScope) => {
    onSelectProject(scope === "global" ? null : project?.id ?? projects[0]?.id ?? null);
  };

  const handleCreateProject = async (value: CreateProjectInput) => {
    setIsCreatingProject(true);
    setToolMessage(null);

    try {
      await onCreateProject(value);
      setIsCreateProjectVisible(false);
    } catch (error) {
      setToolMessage(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <section aria-label="Workspace shell" style={shellStyle}>
      <aside style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <div style={titleBlockStyle}>
            <p style={eyebrowStyle}>{workspace.name}</p>
            <h1 style={sidebarTitleStyle}>{project?.name ?? translate(language, "workspace.noProjectSelected")}</h1>
          </div>
          <button type="button" onClick={onOpenSettings} style={settingsButtonStyle}>
            {translate(language, "workspace.settings")}
          </button>
        </div>

        <section style={sidebarBlockStyle}>
          <p style={sectionLabelStyle}>{translate(language, "workspace.projects")}</p>
          <button
            type="button"
            onClick={() => setIsCreateProjectVisible((current) => !current)}
            style={secondaryButtonStyle}
          >
            {translate(language, "tools.projects.new")}
          </button>
          {isCreateProjectVisible ? (
            <div style={toolSectionStyle}>
              <CreateProjectForm language={language} disabled={isCreatingProject} onSubmit={handleCreateProject} />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => handleSelectScope("global")}
            style={currentScope === "global" ? activeListItemStyle : listItemStyle}
          >
            <span style={projectNameStyle}>{translate(language, "workspace.global")}</span>
            <span style={listItemMetaStyle}>{translate(language, "workspace.globalDescription")}</span>
          </button>
          {projects.length === 0 ? (
            <p style={secondaryTextStyle}>{translate(language, "workspace.projectsPending")}</p>
          ) : (
            <div style={projectListStyle}>
              {projects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectProject(item.id)}
                  style={item.id === project?.id ? activeListItemStyle : listItemStyle}
                >
                  <span style={projectKeyStyle}>{item.key}</span>
                  <span style={projectNameStyle}>{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={sidebarBlockStyle}>
          <p style={sectionLabelStyle}>{translate(language, "workspace.profile")}</p>
          <dl style={runtimeListStyle}>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.profile.displayName")}</dt>
              <dd style={runtimeValueStyle}>{profile.display_name ?? translate(language, "workspace.notSet")}</dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.profile.email")}</dt>
              <dd style={runtimeValueStyle}>{profile.email ?? translate(language, "workspace.notSet")}</dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.user")}</dt>
              <dd style={runtimeValueStyle}>{profile.preferred_user_name ?? translate(language, "workspace.notSet")}</dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.agent")}</dt>
              <dd style={runtimeValueStyle}>{profile.preferred_agent_name ?? translate(language, "workspace.notSet")}</dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.domain")}</dt>
              <dd style={runtimeValueStyle}>{profile.activity_domain ?? translate(language, "workspace.notSet")}</dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.profile.onboarding")}</dt>
              <dd style={runtimeValueStyle}>
                {translate(
                  language,
                  profile.onboarding_completed ? "workspace.profile.completed" : "workspace.profile.pending",
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section style={sidebarBlockStyle}>
          <p style={sectionLabelStyle}>{translate(language, "workspace.runtimeContext")}</p>
          <dl style={runtimeListStyle}>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.user")}</dt>
              <dd style={runtimeValueStyle}>
                {(project ? projectRuntimeContext?.viewer_profile?.preferred_user_name : profile.preferred_user_name) ??
                  translate(language, "workspace.notSet")}
              </dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.agent")}</dt>
              <dd style={runtimeValueStyle}>
                {(project ? projectRuntimeContext?.viewer_profile?.preferred_agent_name : profile.preferred_agent_name) ??
                  translate(language, "workspace.notSet")}
              </dd>
            </div>
            <div style={runtimeRowStyle}>
              <dt style={runtimeLabelStyle}>{translate(language, "workspace.runtime.domain")}</dt>
              <dd style={runtimeValueStyle}>
                {(project ? projectRuntimeContext?.viewer_profile?.activity_domain : profile.activity_domain) ??
                  translate(language, "workspace.notSet")}
              </dd>
            </div>
          </dl>
        </section>

        <section style={sidebarBlockStyle}>
          <p style={sectionLabelStyle}>{translate(language, "workspace.sessions")}</p>
          {(currentSessions.length === 0 && !activeSession) ? (
            <p style={secondaryTextStyle}>{translate(language, "workspace.noSessions")}</p>
          ) : (
            <div style={projectListStyle}>
              {(activeSession ? dedupeSessions([activeSession, ...currentSessions]) : currentSessions).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() =>
                    setActiveSessionByScope((current) => ({
                      ...current,
                      [currentScope]: session,
                    }))
                  }
                  style={session.id === activeSession?.id ? activeListItemStyle : listItemStyle}
                >
                  <span style={projectNameStyle}>{sessionTitle(session, language)}</span>
                  <span style={listItemMetaStyle}>{sessionSubtitle(session)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <main style={chatStyle}>
        <div ref={messagesContainerRef} style={messagesStyle}>
          {visibleMessages.length === 0 && !streamingAssistantText ? (
            <article style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(language, "chat.assistant")}</p>
              <div style={messageTextStyle}>
                {onboarding
                  ? translate(language, onboarding.kind === "user" ? "userOnboarding.message" : "projectOnboarding.message")
                  : translate(language, currentScope === "global" ? "workspace.welcome" : "workspace.projectWelcome")}
              </div>
            </article>
          ) : null}

          {visibleMessages.map((message) => (
            <article
              key={message.id}
              style={message.role === "user" ? userMessageStyle : message.role === "assistant" ? assistantMessageStyle : systemMessageStyle}
            >
              <p style={messageMetaStyle}>{translate(language, message.role === "user" ? "chat.you" : "chat.assistant")}</p>
              <MessageBody role={message.role} content={message.content_markdown} />
            </article>
          ))}

          {streamingAssistantText ? (
            <article style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(language, "chat.assistant")}</p>
              <MessageBody role="assistant" content={streamingAssistantText} />
            </article>
          ) : null}

          {isAwaitingAssistantStream && !streamingAssistantText ? (
            <article aria-label="Assistant is streaming" style={assistantMessageStyle}>
              <p style={messageMetaStyle}>{translate(language, "chat.assistant")}</p>
              <div style={streamingLoaderStyle}>
                <span style={streamingDotStyle} />
                <span style={streamingDotStyle} />
                <span style={streamingDotStyle} />
              </div>
            </article>
          ) : null}

          {isLoadingMessages ? <p style={statusStyle}>{translate(language, "chat.loading")}</p> : null}
          {isCreatingSession ? <p style={statusStyle}>{translate(language, "chat.starting")}</p> : null}
          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        </div>

        <div style={composerStyle}>
          {!onboarding ? (
            <div style={composerToolbarStyle}>
              <label style={composerSkillFieldStyle}>
                <span style={sectionLabelStyle}>{translate(language, "tools.skills.select")}</span>
                <select
                  value={selectedSkillId}
                  onChange={(event) => {
                    setSelectedSkillId(event.target.value);
                    if (event.target.value) {
                      setSelectedTemplateId("");
                    }
                  }}
                  style={selectStyle}
                >
                  <option value="">{translate(language, "tools.skills.none")}</option>
                  {skills.map((skill) => (
                    <option key={skill.skill_id} value={skill.skill_id}>
                      {skill.display_name ?? skill.skill_id}
                    </option>
                  ))}
                </select>
              </label>
              {project ? (
                <label style={composerSkillFieldStyle}>
                  <span style={sectionLabelStyle}>{translate(language, "tools.templates.select")}</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => {
                      setSelectedTemplateId(event.target.value);
                      if (event.target.value) {
                        setSelectedSkillId("");
                      }
                    }}
                    style={selectStyle}
                  >
                    <option value="">{translate(language, "tools.templates.none")}</option>
                    {templates.map((template) => (
                      <option key={template.template_id} value={template.template_id}>
                        {template.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {selectedTemplate && !onboarding ? (
            <p style={secondaryTextStyle}>{selectedTemplate.description ?? selectedTemplate.document_type ?? ""}</p>
          ) : null}
          {oneShotStatus ? <p style={statusStyle}>{oneShotStatus}</p> : null}
          {toolMessage ? <p style={statusStyle}>{toolMessage}</p> : null}
          {isSendDisabled && sendDisabledReason ? <p style={composerHintStyle}>{sendDisabledReason}</p> : null}
          <textarea
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder={translate(language, onboarding ? "chat.placeholder.onboarding" : currentScope === "global" ? "chat.placeholder.global" : "chat.placeholder.project")}
            style={textareaStyle}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isSendDisabled}
            style={primaryButtonStyle(isSendDisabled)}
          >
            {selectedSkillId && !onboarding
              ? translate(language, "tools.skills.apply")
              : selectedTemplateId && !onboarding
                ? translate(language, "tools.templates.apply")
                : translate(language, "chat.send")}
          </button>
        </div>
      </main>
    </section>
  );

  async function sendMessageInternal(
    session: SessionSummary,
    contentMarkdown: string,
    options?: {
      hiddenPrompt?: string;
    },
    activeOnboarding?: WorkspaceShellProps["onboarding"],
  ) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSendingMessage(true);
    setStreamingAssistantText("");
    setIsAwaitingAssistantStream(true);
    const optimisticMessage =
      options?.hiddenPrompt
        ? null
        : buildOptimisticUserMessage({
            sessionId: session.id,
            contentMarkdown,
          });

    if (optimisticMessage) {
      setMessages((current) => [...current, optimisticMessage]);
    }

    try {
      let completionPayload: Record<string, unknown> | null = null;
      let receivedDelta = false;
      let completedAssistantText: string | null = null;

      const streamResult = await streamSessionMessage(
        session.id,
        { content_markdown: contentMarkdown },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.event === "message.delta") {
              receivedDelta = true;
              flushSync(() => {
                setIsAwaitingAssistantStream(false);
                setStreamingAssistantText((current) => current + event.data.delta);
              });
            }

            if (event.event === "message.completed") {
              completedAssistantText = event.data.content_markdown;

              if (receivedDelta) {
                flushSync(() => {
                  setIsAwaitingAssistantStream(false);
                  setStreamingAssistantText(event.data.content_markdown);
                });
              } else {
                flushSync(() => {
                  setIsAwaitingAssistantStream(false);
                });
              }
            }

            if (event.event === "skill.completed") {
              completionPayload = event.data.completion_payload;
            }
          },
        },
      );

      if (!completionPayload && streamResult.completionPayload) {
        completionPayload = streamResult.completionPayload;
      }

      if (!receivedDelta && completedAssistantText) {
        await revealAssistantTextProgressively({
          fullText: completedAssistantText,
          signal: controller.signal,
          onChunk: (nextText) => {
            flushSync(() => {
              setStreamingAssistantText(nextText);
            });
          },
        });
      }

      const [nextMessages, nextSession] = await Promise.all([
        getSessionMessages(session.id),
        getSession(session.id),
      ]);

      setMessages(nextMessages.filter((message) => message.content_markdown !== options?.hiddenPrompt));
      setStreamingAssistantText("");
      setIsAwaitingAssistantStream(false);
      setActiveSessionByScope((current) => ({
        ...current,
        [session.project_id ? "project" : "global"]: nextSession,
      }));

      if (activeOnboarding && completionPayload) {
        if (activeOnboarding.kind === "user") {
          await postMeOnboarding({
            skill_id: "onboard",
            payload: completionPayload,
          });
        } else {
          await postProjectOnboarding(activeOnboarding.projectId, {
            skill_id: "project-onboard",
            payload: completionPayload,
          });
        }

        activeOnboarding.onComplete();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (optimisticMessage) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      }

      setStreamingAssistantText("");
      setIsAwaitingAssistantStream(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to send the message.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      setIsAwaitingAssistantStream(false);
      setIsSendingMessage(false);
    }
  }
}

async function revealAssistantTextProgressively(input: {
  fullText: string;
  signal: AbortSignal;
  onChunk: (value: string) => void;
}) {
  const chunks = splitTextForReveal(input.fullText);

  if (chunks.length === 0) {
    input.onChunk(input.fullText);
    return;
  }

  let current = "";

  for (const chunk of chunks) {
    if (input.signal.aborted) {
      return;
    }

    current += chunk;
    input.onChunk(current);
    await waitMs(current.length >= input.fullText.length ? 0 : 80, input.signal);
  }
}

function splitTextForReveal(value: string) {
  const parts = value.match(/.{1,12}(\s|$)|\S+/g);
  return parts && parts.length > 0 ? parts : [value];
}

function waitMs(durationMs: number, signal: AbortSignal) {
  if (durationMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function dedupeSessions(sessions: SessionSummary[]) {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    if (seen.has(session.id)) {
      return false;
    }

    seen.add(session.id);
    return true;
  });
}

function sessionTitle(session: SessionSummary, language: AppLanguage) {
  if (session.active_skill_id === "onboard") {
    return translate(language, "chat.session.onboard");
  }

  if (session.active_skill_id === "project-onboard") {
    return translate(language, "chat.session.projectOnboard");
  }

  return session.title ?? session.id;
}

function sessionSubtitle(session: SessionSummary) {
  return session.active_skill_id ?? session.session_state ?? "active";
}

function isHiddenPromptMessage(contentMarkdown: string) {
  return Object.values(ONBOARDING_START_PROMPT).includes(contentMarkdown as never);
}

function buildOptimisticUserMessage(input: { sessionId: string; contentMarkdown: string }): SessionMessage {
  return {
    id: `optimistic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    session_id: input.sessionId,
    parent_message_id: null,
    role: "user",
    message_kind: "chat",
    content_markdown: input.contentMarkdown,
    token_estimate: input.contentMarkdown.length,
    is_hidden: false,
    attachments: [],
    created_at: new Date().toISOString(),
  };
}

function MessageBody(props: { role: string; content: string }) {
  if (props.role !== "assistant") {
    return <div style={plainMessageTextStyle}>{props.content}</div>;
  }

  return (
    <div style={markdownBodyStyle}>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}

function parseJsonRecord(rawValue: string, errorMessage: string) {
  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(errorMessage);
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(errorMessage);
  }
}

function readTemplateSeedVariables(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, schema]) => [key, readSchemaPlaceholder(schema)]),
  );
}

function readSchemaPlaceholder(schema: unknown) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return "";
  }

  const record = schema as Record<string, unknown>;

  if (typeof record.default === "string" || typeof record.default === "number" || typeof record.default === "boolean") {
    return record.default;
  }

  if (typeof record.example === "string" || typeof record.example === "number" || typeof record.example === "boolean") {
    return record.example;
  }

  return "";
}

function readJobError(job: JobRecord) {
  if (typeof job.error === "string") {
    return job.error;
  }

  if (job.error && typeof job.error === "object" && "message" in job.error && typeof job.error.message === "string") {
    return job.error.message;
  }

  return null;
}

function buildJobCompletionLabel(job: JobRecord) {
  if (job.result_resource_kind && job.result_resource_id) {
    return `Completed: ${job.result_resource_kind} ${job.result_resource_id}`;
  }

  return "Completed.";
}

function buildOneShotInputPayload(message: string) {
  return {
    message,
    brief: message,
    prompt: message,
    text: message,
  };
}

function buildTemplateInputPayload(message: string) {
  return {
    message,
    context: message,
    brief: message,
    prompt: message,
    text: message,
  };
}

function buildGeneratedDocumentTitle(template: TemplateSummary | null, message: string) {
  const baseTitle = template?.display_name?.trim() || "Generated document";
  const suffix = message.trim().slice(0, 48);
  return suffix ? `${baseTitle}: ${suffix}` : baseTitle;
}

const shellStyle = {
  width: "min(1280px, calc(100vw - 24px))",
  height: "min(820px, calc(100vh - 24px))",
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "var(--theme-spacing-md)",
  alignItems: "stretch",
  minHeight: 0,
  overflow: "hidden" as const,
};

const sidebarStyle = {
  flex: "1 1 320px",
  minWidth: 280,
  padding: "var(--theme-panel-padding)",
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-rail)",
  border: "1px solid var(--theme-color-border-primary)",
  display: "grid",
  alignContent: "start",
  gap: "var(--theme-panel-gap)",
  boxSizing: "border-box" as const,
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto" as const,
};

const sidebarHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--theme-spacing-md)",
  alignItems: "start",
};

const titleBlockStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const chatStyle = {
  flex: "2 1 560px",
  minWidth: "min(100%, 320px)",
  display: "grid",
  gridTemplateRows: "1fr auto",
  borderRadius: "var(--theme-radius-xlarge)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-primary)",
  overflow: "hidden" as const,
  minHeight: 0,
  height: "100%",
};

const toolSectionStyle = {
  padding: "var(--theme-card-padding)",
  borderRadius: "var(--theme-radius-large)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-start)",
};

const messagesStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--theme-spacing-md)",
  padding: "var(--theme-panel-padding)",
  overflowY: "auto" as const,
  overflowX: "hidden" as const,
  overscrollBehavior: "contain" as const,
  minHeight: 0,
};

const composerStyle = {
  padding: "var(--theme-composer-padding)",
  borderTop: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-muted)",
  display: "grid",
  gap: "var(--theme-composer-gap)",
};

const composerHintStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  lineHeight: 1.4,
  color: "var(--theme-color-text-muted)",
};

const composerToolbarStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 260px)",
  gap: "var(--theme-spacing-sm)",
};

const composerSkillFieldStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const textareaStyle = {
  minHeight: "var(--theme-input-textarea-min-height)",
  width: "100%",
  resize: "vertical" as const,
  borderRadius: "var(--theme-radius-medium)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-start)",
  color: "var(--theme-color-text-primary)",
  padding: "var(--theme-input-padding-y) var(--theme-input-padding-x)",
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.5,
  outline: "none",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const inputStyle = {
  minHeight: "var(--theme-input-min-height)",
  width: "100%",
  borderRadius: "var(--theme-radius-medium)",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "var(--theme-color-panel-start)",
  color: "var(--theme-color-text-primary)",
  padding: "var(--theme-input-padding-y) var(--theme-input-padding-x)",
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.5,
  outline: "none",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const selectStyle = {
  ...inputStyle,
};

const assistantMessageStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
  padding: "var(--theme-chat-bubble-padding)",
  marginRight: "16px",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-muted)",
  border: "1px solid var(--theme-color-border-secondary)",
};

const userMessageStyle = {
  ...assistantMessageStyle,
  marginRight: 0,
  marginLeft: "16px",
  background: "var(--theme-color-panel-start)",
};

const systemMessageStyle = {
  ...assistantMessageStyle,
  background: "var(--theme-color-status-info)",
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

const settingsButtonStyle = {
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

const secondaryButtonStyle = {
  minHeight: "var(--theme-button-height)",
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "8px var(--theme-button-padding-x)",
  background: "var(--theme-color-panel-muted)",
  color: "var(--theme-color-text-primary)",
  fontSize: "var(--theme-font-size-caption)",
  fontWeight: 700,
  cursor: "pointer",
};

function primaryButtonStyle(isDisabled: boolean) {
  return {
    minHeight: "var(--theme-button-height)",
    border: `1px solid ${isDisabled ? "var(--theme-color-border-secondary)" : "var(--theme-color-accent-primary)"}`,
    borderRadius: "var(--theme-radius-medium)",
    background: isDisabled ? "var(--theme-color-panel-muted)" : "var(--theme-color-accent-primary)",
    color: isDisabled ? "var(--theme-color-text-muted)" : "var(--theme-color-text-inverse)",
    padding: "12px var(--theme-button-padding-x)",
    fontSize: "var(--theme-font-size-body)",
    fontWeight: 700,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.56 : 1,
    transition: "opacity 120ms ease, background 120ms ease, border-color 120ms ease, color 120ms ease",
  };
}

const sidebarBlockStyle = {
  display: "grid",
  gap: "var(--theme-spacing-sm)",
};

const sectionLabelStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  color: "var(--theme-color-text-muted)",
};

const projectListStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const listItemStyle = {
  display: "grid",
  gap: "var(--theme-spacing-xs)",
  padding: "var(--theme-list-item-padding)",
  borderRadius: "var(--theme-radius-large)",
  background: "var(--theme-color-panel-muted)",
  border: "1px solid var(--theme-color-border-secondary)",
  textAlign: "left" as const,
  cursor: "pointer",
};

const activeListItemStyle = {
  ...listItemStyle,
  border: "1px solid var(--theme-color-accent-primary)",
};

const projectKeyStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-eyebrow)",
  color: "var(--theme-color-text-muted)",
  textTransform: "uppercase" as const,
};

const projectNameStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  color: "var(--theme-color-text-primary)",
};

const listItemMetaStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  color: "var(--theme-color-text-muted)",
};

const runtimeListStyle = {
  display: "grid",
  gap: "var(--theme-spacing-sm)",
  margin: 0,
};

const runtimeRowStyle = {
  display: "grid",
  gap: "var(--theme-list-item-gap)",
};

const runtimeLabelStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-caption)",
  color: "var(--theme-color-text-muted)",
};

const runtimeValueStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  color: "var(--theme-color-text-primary)",
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
  whiteSpace: "pre-wrap" as const,
};

const plainMessageTextStyle = {
  ...messageTextStyle,
};

const markdownBodyStyle = {
  ...messageTextStyle,
  whiteSpace: "normal" as const,
  display: "grid",
  gap: "var(--theme-spacing-sm)",
};

const secondaryTextStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  color: "var(--theme-color-text-secondary)",
  lineHeight: 1.5,
};

const statusStyle = {
  margin: 0,
  padding: "var(--theme-list-item-padding)",
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

const markdownComponents = {
  p: (props: ComponentPropsWithoutRef<"p">) => <p {...props} style={markdownParagraphStyle} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul {...props} style={markdownListStyle} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol {...props} style={markdownListStyle} />,
  li: (props: ComponentPropsWithoutRef<"li">) => <li {...props} style={markdownListItemStyle} />,
  h1: (props: ComponentPropsWithoutRef<"h1">) => <h1 {...props} style={markdownHeadingOneStyle} />,
  h2: (props: ComponentPropsWithoutRef<"h2">) => <h2 {...props} style={markdownHeadingTwoStyle} />,
  h3: (props: ComponentPropsWithoutRef<"h3">) => <h3 {...props} style={markdownHeadingThreeStyle} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong {...props} style={markdownStrongStyle} />,
  a: (props: ComponentPropsWithoutRef<"a">) => <a {...props} style={markdownLinkStyle} />,
  code: (props: ComponentPropsWithoutRef<"code">) => <code {...props} style={markdownCodeStyle} />,
  pre: (props: ComponentPropsWithoutRef<"pre">) => <pre {...props} style={markdownPreStyle} />,
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => <blockquote {...props} style={markdownQuoteStyle} />,
};

const markdownParagraphStyle = {
  margin: 0,
};

const markdownListStyle = {
  margin: 0,
  paddingLeft: "20px",
  display: "grid",
  gap: "var(--theme-spacing-xs)",
};

const markdownListItemStyle = {
  margin: 0,
};

const markdownHeadingOneStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-section)",
  lineHeight: 1.2,
};

const markdownHeadingTwoStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body-large)",
  lineHeight: 1.25,
};

const markdownHeadingThreeStyle = {
  margin: 0,
  fontSize: "var(--theme-font-size-body)",
  lineHeight: 1.3,
  fontWeight: 700,
};

const markdownStrongStyle = {
  fontWeight: 700,
};

const markdownLinkStyle = {
  color: "var(--theme-color-accent-primary)",
  textDecoration: "underline",
};

const markdownCodeStyle = {
  fontFamily: "var(--theme-font-mono)",
  fontSize: "0.92em",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  padding: "2px 6px",
};

const markdownPreStyle = {
  margin: 0,
  overflowX: "auto" as const,
  padding: "var(--theme-spacing-md)",
  background: "var(--theme-color-panel-start)",
  border: "1px solid var(--theme-color-border-secondary)",
  borderRadius: "var(--theme-radius-medium)",
  fontFamily: "var(--theme-font-mono)",
  fontSize: "0.92em",
  lineHeight: 1.5,
};

const markdownQuoteStyle = {
  margin: 0,
  paddingLeft: "var(--theme-spacing-md)",
  borderLeft: "2px solid var(--theme-color-border-secondary)",
  color: "var(--theme-color-text-secondary)",
};

const streamingLoaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  minHeight: "24px",
};

const streamingDotStyle = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "var(--theme-color-text-muted)",
  opacity: 0.7,
};
