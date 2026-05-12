import type {
  Agent,
  AgentRole,
  AgentSkill,
  AgentSyncResult,
  Billing,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  CreateProjectInput,
  CreateSessionInput,
  CreateSummaryInput,
  EmbeddingModelInfo,
  Message,
  MessageRole,
  MessagesPage,
  OpenAIToolCallRecord,
  Profile,
  Project,
  SearchSummariesRequest,
  SearchSummaryResult,
  Session,
  Summary,
  ToolCallDelta,
  UpdateBillingLimitsInput,
  UpdateSummaryInput,
} from "./types";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const BASE_URL_STORAGE_KEY = "sa-agent.backend-url";

function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(BASE_URL_STORAGE_KEY);
    if (stored && stored.trim().length > 0) return stored.trim();
  }
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return env?.VITE_API_BASE_URL ?? DEFAULT_BASE_URL;
}

export function setBackendUrl(url: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASE_URL_STORAGE_KEY, url);
  }
}

export function getCurrentBackendUrl(): string {
  return getBackendUrl();
}

type RequestOptions = {
  signal?: AbortSignal;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const init: RequestInit = {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  };
  const response = await fetch(url, init);
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`${response.status} ${method} ${path}: ${message}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as
      | { error?: string | { message?: string } }
      | undefined;
    if (!payload) return response.statusText;
    if (typeof payload.error === "string") return payload.error;
    if (payload.error && typeof payload.error === "object" && payload.error.message) {
      return payload.error.message;
    }
    return JSON.stringify(payload);
  } catch {
    return response.statusText;
  }
}

export class ChatCompletionError extends Error {
  readonly status: number;
  readonly kind: "rate_limit" | "timeout" | "generic";

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatCompletionError";
    this.status = status;
    if (status === 429) {
      this.kind = "rate_limit";
    } else if (status === 504 || status === 408) {
      this.kind = "timeout";
    } else {
      this.kind = "generic";
    }
  }
}

// ============================================================================
// Profile
// ============================================================================

export function getProfile(options?: RequestOptions): Promise<Profile> {
  return request("GET", "/v1/profile", undefined, options);
}

export function updateGlobalMemory(
  globalMemory: string,
  options?: RequestOptions,
): Promise<Profile> {
  return request("PATCH", "/v1/profile/memory", { global_memory: globalMemory }, options);
}

// ============================================================================
// Projects
// ============================================================================

export async function getProjects(options?: RequestOptions): Promise<Project[]> {
  const payload = await request<Project[] | { projects: Project[] }>(
    "GET",
    "/v1/projects",
    undefined,
    options,
  );
  return Array.isArray(payload) ? payload : payload.projects;
}

export function createProject(
  input: CreateProjectInput,
  options?: RequestOptions,
): Promise<Project> {
  return request("POST", "/v1/projects", input, options);
}

export function updateProjectMemory(
  projectId: string,
  projectMemory: string,
  options?: RequestOptions,
): Promise<Project> {
  return request(
    "PATCH",
    `/v1/projects/${projectId}/memory`,
    { project_memory: projectMemory },
    options,
  );
}

export function updateProject(
  projectId: string,
  input: { name?: string; description?: string | null },
  options?: RequestOptions,
): Promise<Project> {
  return request("PUT", `/v1/projects/${projectId}`, input, options);
}

export function deleteProject(projectId: string, options?: RequestOptions): Promise<void> {
  return request("DELETE", `/v1/projects/${projectId}`, undefined, options);
}

// ============================================================================
// Sessions
// ============================================================================

export async function getGlobalSessions(options?: RequestOptions): Promise<Session[]> {
  const payload = await request<Session[] | { sessions: Session[] }>(
    "GET",
    "/v1/sessions?global=true",
    undefined,
    options,
  );
  return Array.isArray(payload) ? payload : payload.sessions;
}

export async function getProjectSessions(
  projectId: string,
  options?: RequestOptions,
): Promise<Session[]> {
  const payload = await request<Session[] | { sessions: Session[] }>(
    "GET",
    `/v1/sessions?project_id=${encodeURIComponent(projectId)}`,
    undefined,
    options,
  );
  return Array.isArray(payload) ? payload : payload.sessions;
}

export function createSession(
  input: CreateSessionInput,
  options?: RequestOptions,
): Promise<Session> {
  return request("POST", "/v1/sessions", input, options);
}

export function updateSession(
  sessionId: string,
  input: { display_name?: string },
  options?: RequestOptions,
): Promise<Session> {
  return request("PUT", `/v1/sessions/${sessionId}`, input, options);
}

export function deleteSession(sessionId: string, options?: RequestOptions): Promise<void> {
  return request("DELETE", `/v1/sessions/${sessionId}`, undefined, options);
}

export function getSessionMessagesPage(
  sessionId: string,
  page: number,
  options?: RequestOptions,
): Promise<MessagesPage> {
  return request("GET", `/v1/sessions/${sessionId}/messages?page=${page}`, undefined, options);
}

export async function getAllSessionMessages(
  sessionId: string,
  options?: RequestOptions,
): Promise<Message[]> {
  const all: Message[] = [];
  let page = 1;
  while (true) {
    const pageResult = await getSessionMessagesPage(sessionId, page, options);
    all.push(...pageResult.messages);
    if (!pageResult.has_more) break;
    page += 1;
  }
  return all;
}

export type AppendMessageOptions = RequestOptions & {
  tool_calls?: OpenAIToolCallRecord[] | null;
  tool_call_id?: string | null;
};

export function appendMessage(
  sessionId: string,
  role: MessageRole,
  content: string,
  options?: AppendMessageOptions,
): Promise<Message> {
  const body: Record<string, unknown> = { role, content };
  if (options?.tool_calls && options.tool_calls.length > 0) body.tool_calls = options.tool_calls;
  if (options?.tool_call_id) body.tool_call_id = options.tool_call_id;
  return request("POST", `/v1/sessions/${sessionId}/messages`, body, { signal: options?.signal });
}

// ============================================================================
// Summaries
// ============================================================================

export async function getSessionSummaries(
  sessionId: string,
  options?: RequestOptions,
): Promise<Summary[]> {
  const payload = await request<{ summaries: Summary[] }>(
    "GET",
    `/v1/sessions/${sessionId}/summaries`,
    undefined,
    options,
  );
  return payload.summaries;
}

export function createSummary(
  sessionId: string,
  input: CreateSummaryInput,
  options?: RequestOptions,
): Promise<Summary> {
  return request("POST", `/v1/sessions/${sessionId}/summaries`, input, options);
}

export function updateSummary(
  sessionId: string,
  summaryId: string,
  input: UpdateSummaryInput,
  options?: RequestOptions,
): Promise<Summary> {
  return request("PUT", `/v1/sessions/${sessionId}/summaries/${summaryId}`, input, options);
}

export function deleteSummary(
  sessionId: string,
  summaryId: string,
  options?: RequestOptions,
): Promise<void> {
  return request("DELETE", `/v1/sessions/${sessionId}/summaries/${summaryId}`, undefined, options);
}

export async function searchSummaries(
  input: SearchSummariesRequest,
  options?: RequestOptions,
): Promise<SearchSummaryResult[]> {
  const payload = await request<{ results: SearchSummaryResult[] }>(
    "POST",
    "/v1/summaries/search",
    input,
    options,
  );
  return payload.results;
}

// ============================================================================
// Agents
// ============================================================================

export async function getAgents(options?: RequestOptions): Promise<Agent[]> {
  const payload = await request<Agent[] | { agents: Agent[] }>(
    "GET",
    "/v1/agents",
    undefined,
    options,
  );
  return Array.isArray(payload) ? payload : payload.agents;
}

export function getAgent(agentId: string, options?: RequestOptions): Promise<Agent> {
  return request("GET", `/v1/agents/${agentId}`, undefined, options);
}

export async function getAgentRoles(
  agentId: string,
  options?: RequestOptions,
): Promise<AgentRole[]> {
  const payload = await request<{ roles: AgentRole[] }>(
    "GET",
    `/v1/agents/${agentId}/roles`,
    undefined,
    options,
  );
  return payload.roles;
}

export async function getAgentSkills(
  agentId: string,
  options?: RequestOptions,
): Promise<AgentSkill[]> {
  const payload = await request<{ skills: AgentSkill[] }>(
    "GET",
    `/v1/agents/${agentId}/skills`,
    undefined,
    options,
  );
  return payload.skills;
}

export function syncAgents(options?: RequestOptions): Promise<AgentSyncResult> {
  return request("POST", "/v1/agents/sync", undefined, options);
}

// ============================================================================
// Embedding model info
// ============================================================================

export function getEmbeddingModelInfo(options?: RequestOptions): Promise<EmbeddingModelInfo> {
  return request("GET", "/v1/embedding/model", undefined, options);
}

// ============================================================================
// Billing
// ============================================================================

export function getBilling(options?: RequestOptions): Promise<Billing> {
  return request("GET", "/v1/billing", undefined, options);
}

export function updateBillingLimits(
  input: UpdateBillingLimitsInput,
  options?: RequestOptions,
): Promise<Billing> {
  return request("PUT", "/v1/billing/limits", input, options);
}

// ============================================================================
// LLM
// ============================================================================

export async function chatCompletion(
  payload: ChatCompletionRequest,
  options?: RequestOptions,
): Promise<ChatCompletionResponse> {
  return request("POST", "/v1/chat/completions", { ...payload, stream: false }, options);
}

export type ToolCallAccumulator = {
  id: string;
  name: string;
  argumentsText: string;
};

export type StreamChatHandlers = {
  onDelta?: (delta: string) => void;
  onChunk?: (chunk: ChatCompletionChunk) => void;
  onUsage?: (usage: { total_tokens: number }) => void;
  onToolCallStart?: (index: number, id: string, name: string) => void;
  onToolCallDelta?: (index: number, argumentsDelta: string) => void;
  onFinishReason?: (reason: string) => void;
};

export type StreamChatResult = {
  content: string;
  total_tokens: number;
  tool_calls: OpenAIToolCallRecord[];
  finish_reason: string | null;
};

export async function streamChatCompletion(
  payload: ChatCompletionRequest,
  handlers: StreamChatHandlers,
  options?: RequestOptions,
): Promise<StreamChatResult> {
  const url = `${getBackendUrl()}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ ...payload, stream: true }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ChatCompletionError(response.status, message);
  }
  if (!response.body) {
    throw new ChatCompletionError(0, "Streaming response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembledContent = "";
  let totalTokens = 0;
  let finishReason: string | null = null;
  const toolCalls = new Map<number, ToolCallAccumulator>();
  const announcedIndices = new Set<number>();
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trimEnd();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        done = true;
        break;
      }
      let chunk: ChatCompletionChunk;
      try {
        chunk = JSON.parse(data) as ChatCompletionChunk;
      } catch {
        continue;
      }
      handlers.onChunk?.(chunk);

      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        assembledContent += delta;
        handlers.onDelta?.(delta);
      }

      const toolDeltas = choice?.delta?.tool_calls;
      if (toolDeltas) {
        for (const toolDelta of toolDeltas) {
          mergeToolCallDelta(toolCalls, toolDelta, handlers, announcedIndices);
        }
      }

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
        handlers.onFinishReason?.(choice.finish_reason);
      }

      if (chunk.usage?.total_tokens) {
        totalTokens = chunk.usage.total_tokens;
        handlers.onUsage?.({ total_tokens: totalTokens });
      }
    }
  }

  const collectedToolCalls: OpenAIToolCallRecord[] = [];
  const sortedIndices = Array.from(toolCalls.keys()).sort((a, b) => a - b);
  for (const index of sortedIndices) {
    const acc = toolCalls.get(index)!;
    collectedToolCalls.push({
      id: acc.id,
      type: "function",
      function: { name: acc.name, arguments: acc.argumentsText },
    });
  }

  return {
    content: assembledContent,
    total_tokens: totalTokens,
    tool_calls: collectedToolCalls,
    finish_reason: finishReason,
  };
}

function mergeToolCallDelta(
  accumulator: Map<number, ToolCallAccumulator>,
  delta: ToolCallDelta,
  handlers: StreamChatHandlers,
  announced: Set<number>,
) {
  const index = delta.index;
  let entry = accumulator.get(index);
  if (!entry) {
    entry = { id: "", name: "", argumentsText: "" };
    accumulator.set(index, entry);
  }
  if (delta.id) entry.id = delta.id;
  if (delta.function?.name) entry.name += delta.function.name;
  if (delta.function?.arguments) entry.argumentsText += delta.function.arguments;

  if (!announced.has(index) && entry.id.length > 0 && entry.name.length > 0) {
    announced.add(index);
    handlers.onToolCallStart?.(index, entry.id, entry.name);
  }
  if (delta.function?.arguments && announced.has(index)) {
    handlers.onToolCallDelta?.(index, delta.function.arguments);
  }
}
