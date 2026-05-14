export type Profile = {
  id: string;
  name: string;
  global_memory: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  project_memory: string | null;
  created_at: string;
  updated_at: string;
};

export type Session = {
  id: string;
  profile_id: string;
  project_id: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type OpenAIToolCallRecord = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type Message = {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls?: OpenAIToolCallRecord[] | null;
  tool_call_id?: string | null;
  created_at: string;
};

export type MessagesPage = {
  messages: Message[];
  total: number;
  page: number;
  has_more: boolean;
};

export type Summary = {
  id: string;
  session_id: string;
  profile_id: string;
  content: string;
  from_message_id: string | null;
  to_message_id: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
};

export type EmbeddingModelInfo = {
  model_id: string;
  dimensions: number;
  distance_metric: "cosine";
  max_input_tokens: number;
  normalization: boolean;
};

export type Agent = {
  id: string;
  agent_key: string;
  display_name: string;
  description: string | null;
  system_prompt: string;
  orchestration_protocol: string | null;
  version: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentRole = {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  prompt: string;
  created_at: string;
  updated_at?: string;
};

export type AgentSkill = {
  id: string;
  agent_id: string;
  name: string;
  files: Record<string, string>;
  created_at: string;
  updated_at?: string;
};

export type AgentSyncResult = {
  synced: number;
  deleted: number;
  errors: string[];
};

export type Billing = {
  id: string;
  profile_id: string;
  hourly_usage: number;
  daily_usage: number;
  weekly_usage: number;
  max_hourly: number;
  max_daily: number;
  max_weekly: number;
  hourly_reset_at: string;
  daily_reset_at: string;
  weekly_reset_at: string;
  updated_at: string;
};

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCallRecord[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAIToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
};

export type ChatCompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCallRecord[];
    };
    finish_reason: string;
  }>;
  usage: ChatCompletionUsage;
};

export type ToolCallDelta = {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

export type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: ToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: ChatCompletionUsage;
};

export type SearchSummaryResult = Summary & {
  distance?: number;
};

export type SearchSummariesRequest = {
  embedding: number[];
  limit?: number;
  session_id?: string;
};

export type CreateSessionInput = {
  display_name: string;
  project_id: string | null;
};

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  project_key?: string;
};

export type CreateSummaryInput = {
  content: string;
  embedding: number[];
  from_message_id: string | null;
  to_message_id: string | null;
};

export type UpdateSummaryInput = {
  content?: string;
  embedding?: number[];
  from_message_id?: string | null;
  to_message_id?: string | null;
};

export type UpdateBillingLimitsInput = {
  max_hourly?: number;
  max_daily?: number;
  max_weekly?: number;
};

export type WorkspaceScope =
  | { kind: "project"; projectId: string; displayName: string }
  | { kind: "global"; sessionId: string; displayName: string };

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  modified_at: string;
};

export type DialogOpenFileResult = {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  content: string;
};

export type RunPythonResult = {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timed_out: boolean;
  script_path: string;
};

export type PythonRuntimeStatus = {
  ready: boolean;
  model_id: string | null;
  dimensions: number | null;
  error: string | null;
};

export type SearchStatus =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "running"; port: number; pid: number | null }
  | { state: "unsupported"; reason: string }
  | { state: "failed"; error: string };
