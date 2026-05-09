export type AppLanguage = "ru" | "en";
export type ThemeMode = "dark" | "light";
export type ConversationScope = "global" | "project";
export type WorkspaceMode = "home" | "activity" | "thread" | "tasks" | "agents" | "files" | "executions";

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
  workspaceMode?: WorkspaceMode | null;
  selectedAgentKey?: string | null;
  activeWorkspaceId?: string | null;
  activeProjectId?: string | null;
  activeProjectAgentId?: string | null;
  activeSessionId?: string | null;
  activeThreadId?: string | null;
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

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRecord = WorkspaceSummary & {
  description?: string | null;
  visibility?: string | null;
  lifecycle_state?: string | null;
  [key: string]: unknown;
};

export type ProjectSummary = {
  id: string;
  workspace_id: string;
  agent_key?: string | null;
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

export type ProjectRecord = ProjectSummary & {
  visibility?: string | null;
  safe_metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type BootstrapStage =
  | "profile"
  | "workspaces"
  | "projects"
  | "sessions"
  | "assistant"
  | "complete";

export type BootstrapErrorKind = "request-failed" | "no-workspaces";

export type SessionSummary = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  active_capability_key?: string | null;
  active_skill_id?: string | null;
  execution_id?: string | null;
  execution_status?: ExecutionStatus | null;
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

export type ThreadRecord = {
  id: string;
  project_id?: string | null;
  project_agent_id?: string | null;
  agent_key?: string | null;
  title?: string | null;
  summary?: string | null;
  status?: string | null;
  lifecycle_state?: string | null;
  active_execution_id?: string | null;
  execution_status?: ExecutionStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ProjectAgentRecord = {
  id: string;
  project_id?: string | null;
  agent_key?: string | null;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
  lifecycle_state?: string | null;
  active_thread_id?: string | null;
  active_execution_id?: string | null;
  capabilities?: string[] | null;
  safe_metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type CommitmentRecord = {
  id: string;
  project_id?: string | null;
  thread_id?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  severity?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ContextItemRecord = {
  id: string;
  title?: string | null;
  kind?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type WikiPageRecord = {
  id: string;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type DocumentRevisionRecord = {
  id: string;
  document_id?: string | null;
  revision_number?: number | null;
  created_at?: string | null;
  author_display_name?: string | null;
  summary?: string | null;
  [key: string]: unknown;
};

export type AssistantStateRecord = {
  thread_id?: string | null;
  execution_id?: string | null;
  execution_status?: ExecutionStatus | null;
  unread_count?: number | null;
  status?: string | null;
  [key: string]: unknown;
};

export type LlmRequestMessage = {
  role: string;
  content: string;
};

export type LlmResponseInput = {
  workspace_id: string;
  project_id?: string | null;
  thread_id?: string | null;
  session_id?: string | null;
  project_agent_id?: string | null;
  model?: string | null;
  operation_kind?: "generate_text" | "generate_json";
  messages: LlmRequestMessage[];
};

export type LlmResponseRecord = {
  request_id?: string | null;
  provider?: string | null;
  model?: string | null;
  output_text?: string | null;
  finish_reason?: string | null;
  usage?: Record<string, unknown> | null;
  audit?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AssistantThreadRecord = ThreadRecord & {
  kind?: string | null;
};

export type AssistantThreadEnvelope = {
  thread: AssistantThreadRecord;
  messages: SessionMessage[];
  [key: string]: unknown;
};

export type ThreadRuntimeSnapshot = {
  thread_id?: string | null;
  execution_id?: string | null;
  execution_status?: ExecutionStatus | null;
  runtime_state?: string | null;
  last_heartbeat_at?: string | null;
  [key: string]: unknown;
};

export type ThreadSupervisorSnapshot = {
  thread_id?: string | null;
  status?: string | null;
  approvals_required?: number | null;
  blocked_reason?: string | null;
  [key: string]: unknown;
};

export type AgentCatalogItem = {
  agent_key: string;
  display_name?: string | null;
  description?: string | null;
  domain?: string | null;
  memory_policy?: Record<string, unknown> | null;
  visibility?: string | null;
  is_active?: boolean | null;
  safe_metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AgentSafeProfile = {
  agent_key: string;
  display_name?: string | null;
  domain?: string | null;
  memory_policy?: Record<string, unknown> | null;
  visibility?: string | null;
  is_active?: boolean | null;
  safe_metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AgentProfileRecord = AgentSafeProfile & {
  profile_type?: string | null;
  prompts_version?: string | null;
};

export type CapabilityMode = "interactive" | "one_shot" | "both" | (string & {});

export type CapabilityCatalogItem = {
  capability_key: string;
  display_name?: string | null;
  description?: string | null;
  mode: CapabilityMode;
  input_schema?: Record<string, unknown> | null;
  output_schema?: Record<string, unknown> | null;
  safe_metadata?: Record<string, unknown> | null;
  agent_key?: string | null;
  [key: string]: unknown;
};

export type AgentMcpServerConfig = {
  description?: string | null;
  transport?: string | null;
  url?: string | null;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  [key: string]: unknown;
};

export type AgentMcpLandscape = {
  mcpServers: Record<string, AgentMcpServerConfig>;
  [key: string]: unknown;
};

export type WorkspaceMemberRecord = {
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type AttachmentRecord = {
  id: string;
  file_name?: string | null;
  media_kind?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  url?: string | null;
  [key: string]: unknown;
};

export type UploadAccepted = {
  upload_id: string;
  status?: string | null;
  file_name?: string | null;
  [key: string]: unknown;
};

export type MemoryNoteRecord = {
  id: string;
  project_id?: string | null;
  title?: string | null;
  content_markdown?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type MemoryChunkAccepted = {
  chunk_id?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type ExecutionLeaseRecord = {
  execution_id?: string | null;
  lease_id?: string | null;
  status?: string | null;
  heartbeat_at?: string | null;
  expires_at?: string | null;
  [key: string]: unknown;
};

export type McpToolDescriptor = {
  serverName: string;
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
};

export type McpToolCallContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type McpToolCallResult = {
  serverName: string;
  toolName: string;
  content?: McpToolCallContentItem[] | null;
  structuredContent?: unknown;
  isError: boolean;
};

export type EmbeddingPolicy = {
  model_id: string;
  dimensions: number;
  embedding_version: string;
  chunking_version: string;
  normalization: boolean;
  prefix_policy?: string | null;
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
  agent_key?: string;
  capability_key?: string;
  input?: Record<string, unknown>;
  channel_kind?: string;
  resume_strategy?: "new" | "resume_latest";
};

export type SessionMessageInput = {
  content_markdown: string;
  role?: "user" | "assistant";
  actor_id?: string | null;
  parent_message_id?: string | null;
  attachment_ids?: string[];
};

export type AssistantThreadPersistedMessageResponse = {
  thread?: AssistantThreadRecord | null;
  messages?: SessionMessage[] | null;
  [key: string]: unknown;
};

export type SessionMessageAccepted = {
  job_id?: string | null;
  job_kind?: string | null;
  status: string;
  poll_url?: string | null;
  session_id?: string | null;
  assistant_message_id?: string | null;
  assistant_content_markdown?: string | null;
  capability_key?: string | null;
  execution_id?: string | null;
  execution_status?: ExecutionStatus | null;
  completion_payload?: Record<string, unknown> | null;
  execution_applied_effects?: Record<string, unknown> | null;
  skill_id?: string | null;
  skill_status?: string | null;
  skill_completion_payload?: Record<string, unknown> | null;
};

export type StreamSessionMessageResult =
  | {
      mode: "sse";
      completionPayload: Record<string, unknown> | null;
      executionCompleted: boolean;
    }
  | {
      mode: "json";
      accepted: SessionMessageAccepted;
      completionPayload: Record<string, unknown> | null;
      executionCompleted: boolean;
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
    }
  | {
      event: "execution.completed";
      data: {
        session_id: string;
        execution_id: string;
        capability_key: string;
        completion_payload?: Record<string, unknown> | null;
        execution_applied_effects?: Record<string, unknown> | null;
      };
    };

export type BootstrapSnapshot = {
  profile: ViewerProfile;
  workspaces: WorkspaceSummary[];
  selectedWorkspace: WorkspaceSummary;
  agents: AgentCatalogItem[];
  selectedAgentKey: string | null;
  projects: ProjectSummary[];
  selectedProject: ProjectSummary | null;
  globalSessions: SessionSummary[];
  globalAssistantMessages: SessionMessage[];
  projectSessions: SessionSummary[];
};

export type MeBootstrapRecord = {
  profile?: ViewerProfile | null;
  viewer_profile?: ViewerProfile | null;
  assistant_thread?: AssistantThreadRecord | null;
  assistant_messages?: SessionMessage[] | null;
  workspaces?: WorkspaceSummary[] | null;
  selected_workspace?: WorkspaceSummary | null;
  selected_project?: ProjectSummary | null;
  [key: string]: unknown;
};

export type ExecutionStatus =
  | "pending"
  | "accepted"
  | "running"
  | "waiting_user"
  | "waiting_approval"
  | "completed"
  | "applied"
  | "failed"
  | "cancelled"
  | "orphaned"
  | (string & {});

export type ExecutionCreateInput = {
  workspace_id: string;
  project_id?: string;
  agent_key?: string;
  capability_key: string;
  input: Record<string, unknown>;
  session_id?: string | null;
};

export type ExecutionAccepted = {
  execution_id: string;
  capability_key: string;
  status: "accepted" | ExecutionStatus;
  job_id?: string | null;
  poll_url?: string | null;
  completion_payload?: Record<string, unknown> | null;
  execution_applied_effects?: Record<string, unknown> | null;
};

export type ExecutionRecord = {
  execution_id: string;
  capability_key?: string | null;
  status: ExecutionStatus;
  job_id?: string | null;
  session_id?: string | null;
  project_id?: string | null;
  workspace_id?: string | null;
  completion_payload?: Record<string, unknown> | null;
  output_payload?: unknown;
  execution_applied_effects?: Record<string, unknown> | null;
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

export type AgentFilesBridge = {
  writeFiles: (
    files: Array<{
      relativePath: string;
      content: string;
    }>,
  ) => Promise<{
    ok: boolean;
    rootPath?: string | null;
    error?: string | null;
  }>;
  openFolder: () => Promise<{
    ok: boolean;
    rootPath?: string | null;
    error?: string | null;
  }>;
};

export type McpBridge = {
  listTools: (runtimeId: string, servers: Record<string, AgentMcpServerConfig>) => Promise<McpToolDescriptor[]>;
  callTool: (
    runtimeId: string,
    serverName: string,
    toolName: string,
    argumentsJson: Record<string, unknown>,
  ) => Promise<McpToolCallResult>;
  closeRuntime: (runtimeId: string) => Promise<void>;
};

export type SaAgentBridge = {
  storage: StorageBridge;
  devtools?: DevtoolsBridge;
  files?: AgentFilesBridge;
  mcp?: McpBridge;
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
