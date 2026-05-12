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
  MessagesPage,
  Profile,
  Project,
  SearchSummariesRequest,
  SearchSummaryResult,
  Session,
  Summary,
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

export function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  options?: RequestOptions,
): Promise<Message> {
  return request("POST", `/v1/sessions/${sessionId}/messages`, { role, content }, options);
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

export type StreamChatHandlers = {
  onDelta?: (delta: string) => void;
  onChunk?: (chunk: ChatCompletionChunk) => void;
  onUsage?: (usage: { total_tokens: number }) => void;
};

export async function streamChatCompletion(
  payload: ChatCompletionRequest,
  handlers: StreamChatHandlers,
  options?: RequestOptions,
): Promise<{ content: string; total_tokens: number }> {
  const url = `${getBackendUrl()}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ ...payload, stream: true }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`${response.status} POST /v1/chat/completions: ${message}`);
  }
  if (!response.body) {
    throw new Error("Streaming response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembledContent = "";
  let totalTokens = 0;
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
      try {
        const chunk = JSON.parse(data) as ChatCompletionChunk;
        handlers.onChunk?.(chunk);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          assembledContent += delta;
          handlers.onDelta?.(delta);
        }
        if (chunk.usage?.total_tokens) {
          totalTokens = chunk.usage.total_tokens;
          handlers.onUsage?.({ total_tokens: totalTokens });
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return { content: assembledContent, total_tokens: totalTokens };
}
