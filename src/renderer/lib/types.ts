export type AppLanguage = "ru" | "en";
export type ThemeMode = "dark" | "light";
export type ConversationScope = "global" | "project";

export type AppScreen =
  | "language-setup"
  | "auth"
  | "bootstrapping"
  | "bootstrap-error"
  | "empty-projects"
  | "workspace-shell";

export type PersistedAppState = {
  language: AppLanguage | null;
  isAuthenticated: boolean;
  themeMode?: ThemeMode | null;
  activeProjectId?: string | null;
  activeSessionByProjectId?: Record<string, string | null>;
  apiBaseUrl?: string | null;
  devModeEnabled?: boolean;
};

export type PersistedAppStatePatch = Partial<PersistedAppState>;

export type ViewerProfile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  onboarding_skill_id?: string | null;
  onboarding_payload?: Record<string, unknown> | null;
  preferred_user_name: string | null;
  preferred_agent_name: string | null;
  activity_domain: string | null;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingPayload = Record<string, unknown>;

export type UserOnboardingValues = {
  preferred_user_name: string;
  preferred_agent_name: string;
  activity_domain: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type ProjectSummary = {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  description: string | null;
  onboarding_skill_id?: string | null;
  onboarding_payload?: Record<string, unknown> | null;
  preferred_user_name: string | null;
  preferred_agent_name: string | null;
  activity_domain: string | null;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  lifecycle_state: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type BootstrapStage =
  | "profile"
  | "workspaces"
  | "projects"
  | "sessions"
  | "runtime-context"
  | "complete";

export type BootstrapErrorKind = "request-failed" | "no-workspaces";

export type SessionSummary = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  active_skill_id?: string | null;
  skill_state?: SessionSkillState | null;
  channel_kind?: string | null;
  started_by?: string | null;
  session_state?: string | null;
  message_count?: number;
  compaction_count?: number;
  context_token_estimate?: number;
  last_user_message_at?: string | null;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  lifecycle_state?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SessionSkillState = {
  status?: "active" | "completed" | (string & {});
  completion_payload?: Record<string, unknown> | null;
  completed_at?: string | null;
  skill_input?: Record<string, unknown> | null;
};

export type SessionMessageAttachment = {
  id: string;
  file_name?: string | null;
  mime_type?: string | null;
  media_kind?: string | null;
  purpose?: string | null;
  size_bytes?: number | null;
  metadata_json?: Record<string, unknown> | null;
};

export type SessionMessage = {
  id: string;
  session_id: string;
  parent_message_id: string | null;
  role: "user" | "assistant" | "system" | (string & {});
  message_kind: string;
  content_markdown: string;
  token_estimate: number;
  is_hidden: boolean;
  attachments: SessionMessageAttachment[];
  created_at: string;
};

export type SkillCatalogItem = {
  skill_id: string;
  key?: string;
  display_name?: string | null;
  interaction_mode: "interactive" | "one_shot" | "both";
  title?: string | null;
  description?: string | null;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  tags?: string[] | null;
};

export type MemorySearchResult = {
  items: Array<Record<string, unknown>>;
  total?: number | null;
};

export type EmbeddingPolicy = {
  model_id: string;
  dimensions: number;
  embedding_version: string;
  chunking_version: string;
  normalization: boolean;
  prefix_policy?: string | null;
};

export type TemplateSummary = {
  template_id: string;
  display_name: string;
  description?: string | null;
  document_type?: string | null;
  variable_schema?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type GeneratedDocument = {
  id: string;
  project_id: string;
  title?: string | null;
  document_type?: string | null;
  current_content_markdown?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type SessionCreateInput = {
  workspace_id: string;
  project_id?: string;
  skill_id?: string;
  skill_input?: Record<string, unknown>;
  channel_kind?: string;
  resume_strategy?: "new" | "resume_latest";
};

export type SessionMessageInput = {
  content_markdown: string;
  parent_message_id?: string | null;
  attachment_ids?: string[];
};

export type SessionMessageAccepted = {
  job_id: string;
  job_kind: string;
  status: string;
  poll_url: string;
  session_id?: string | null;
  assistant_message_id?: string | null;
  assistant_content_markdown?: string | null;
  skill_id?: string | null;
  skill_status?: string | null;
  skill_completion_payload?: Record<string, unknown> | null;
};

export type StreamSessionMessageResult =
  | {
      mode: "sse";
      completionPayload: Record<string, unknown> | null;
    }
  | {
      mode: "json";
      accepted: SessionMessageAccepted;
      completionPayload: Record<string, unknown> | null;
    };

export type SessionMessageStreamEvent =
  | {
      event: "message.accepted";
      data: {
        job_id: string;
        session_id: string;
        user_message_id: string | null;
        assistant_message_id: string | null;
      };
    }
  | {
      event: "message.delta";
      data: {
        job_id: string;
        session_id: string;
        assistant_message_id: string | null;
        delta: string;
      };
    }
  | {
      event: "message.completed";
      data: {
        job_id: string;
        session_id: string;
        assistant_message_id: string | null;
        content_markdown: string;
      };
    }
  | {
      event: "skill.completed";
      data: {
        session_id: string;
        skill_id: string;
        completion_payload: Record<string, unknown>;
      };
    };

export type RuntimeContextRecord = {
  project_id?: string;
  preferred_user_name?: string | null;
  preferred_agent_name?: string | null;
  activity_domain?: string | null;
  onboarding_completed?: boolean;
  session_count?: number;
  summary?: string | null;
  goals?: string[] | null;
  constraints?: string[] | null;
  [key: string]: unknown;
};

export type GlobalRuntimeContext = {
  workspace_id: string;
  viewer_profile: ViewerProfile | null;
  active_session: SessionSummary | null;
  memory_highlights: Array<Record<string, unknown>>;
};

export type ProjectRuntimeContext = {
  project: ProjectSummary;
  viewer_profile: ViewerProfile | null;
  active_session: SessionSummary | null;
  context_items: Array<Record<string, unknown>>;
  memory_highlights: Array<Record<string, unknown>>;
  wiki_pages: Array<Record<string, unknown>>;
};

export type BootstrapSnapshot = {
  profile: ViewerProfile;
  workspaces: WorkspaceSummary[];
  selectedWorkspace: WorkspaceSummary;
  projects: ProjectSummary[];
  selectedProject: ProjectSummary | null;
  globalSessions: SessionSummary[];
  globalRuntimeContext: GlobalRuntimeContext | null;
  projectSessions: SessionSummary[];
  projectRuntimeContext: ProjectRuntimeContext | null;
};

export type SkillRunRequest = {
  workspace_id: string;
  project_id?: string;
  skill_id: string;
  input_payload: Record<string, unknown>;
};

export type SkillRunAccepted = {
  job_id: string;
};

export type JobStatus = "queued" | "running" | "completed" | "failed" | (string & {});

export type JobRecord = {
  id: string;
  status: JobStatus;
  output_payload?: unknown;
  job_kind?: string | null;
  progress_percent?: number | null;
  related_project_id?: string | null;
  related_session_id?: string | null;
  related_message_id?: string | null;
  related_document_id?: string | null;
  result_resource_kind?: string | null;
  result_resource_id?: string | null;
  error?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CreateProjectInput = {
  key: string;
  name: string;
  description?: string | null;
};

export type StorageBridge = {
  getAppState: () => Promise<PersistedAppState | null>;
  setAppState: (patch: PersistedAppStatePatch) => Promise<PersistedAppState>;
  clearAppState: () => Promise<void>;
};

export type DevtoolsBridge = {
  open: () => Promise<{
    ok: boolean;
    error?: string | null;
  }>;
};

export type SaAgentBridge = {
  storage: StorageBridge;
  devtools?: DevtoolsBridge;
};

export type DebugNetworkEntry = {
  id: string;
  startedAt: string;
  durationMs: number;
  mode: "json" | "sse";
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  status?: number | null;
  responseBody?: unknown;
  responseHeaders?: Record<string, string>;
  eventNames?: string[];
  error?: string | null;
};

declare global {
  interface Window {
    saAgent?: SaAgentBridge;
  }
}

export {};
