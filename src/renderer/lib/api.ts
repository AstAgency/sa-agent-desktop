import { normalizeAppState, storageKey } from "../state/app-state";
import { recordDebugNetworkEntry } from "./debug";
import type {
  AgentCatalogItem,
  AssistantThreadEnvelope,
  AgentProfileRecord,
  AgentMcpLandscape,
  AgentSafeProfile,
  AssistantThreadPersistedMessageResponse,
  AssistantStateRecord,
  AssistantThreadRecord,
  AttachmentRecord,
  CapabilityCatalogItem,
  CommitmentRecord,
  ContextItemRecord,
  CreateProjectInput,
  DocumentRevisionRecord,
  DebugNetworkEntry,
  EmbeddingPolicy,
  ExecutionAccepted,
  ExecutionCreateInput,
  ExecutionRecord,
  GeneratedDocument,
  MemoryChunkAccepted,
  MemoryNoteRecord,
  MeBootstrapRecord,
  UploadAccepted,
  ProjectAgentRecord,
  ProjectRecord,
  ProjectSummary,
  SessionCreateInput,
  LlmResponseInput,
  LlmResponseRecord,
  SessionMessage,
  SessionMessageAccepted,
  SessionMessageInput,
  SessionMessageStreamEvent,
  StreamSessionMessageResult,
  SessionSummary,
  ThreadRecord,
  ThreadRuntimeSnapshot,
  ThreadSupervisorSnapshot,
  ViewerProfile,
  WikiPageRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceSummary,
  ExecutionLeaseRecord,
} from "./types";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type FetchLike = typeof fetch;

const defaultApiBaseUrl = "http://127.0.0.1:3000";

function readStoredApiBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const state = normalizeAppState(JSON.parse(rawValue));
    return state.apiBaseUrl ?? null;
  } catch {
    return null;
  }
}

function getApiBaseUrl() {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };

  return readStoredApiBaseUrl() ?? meta.env?.VITE_API_BASE_URL ?? defaultApiBaseUrl;
}

function withQuery(path: string, query: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function fetchJson<T>(path: string, init?: RequestInit, fetcher: FetchLike = fetch): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const startedAt = Date.now();
  const url = `${baseUrl}${path}`;
  const response = await fetcher(url, init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let responseBody: unknown = null;

    try {
      const payload = (await response.json()) as ApiErrorPayload;
      responseBody = payload;
      message = payload.error?.message ?? message;
    } catch {
      // Ignore parse errors and keep the generic message.
    }

    recordDebugNetworkEntry({
      id: createDebugEntryId(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      mode: "json",
      method: init?.method ?? "GET",
      url,
      requestHeaders: normalizeHeaders(init?.headers),
      requestBody: parseDebugRequestBody(init?.body),
      status: response.status,
      responseHeaders: readResponseHeaders(response),
      responseBody,
      error: message,
    });

    throw new Error(message);
  }

  const payload = (await response.json()) as T;

  recordDebugNetworkEntry({
    id: createDebugEntryId(),
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    mode: "json",
    method: init?.method ?? "GET",
    url,
    requestHeaders: normalizeHeaders(init?.headers),
    requestBody: parseDebugRequestBody(init?.body),
    status: response.status,
    responseHeaders: readResponseHeaders(response),
    responseBody: payload,
    error: null,
  });

  return payload;
}

export function getCurrentApiBaseUrl() {
  return getApiBaseUrl();
}

export async function getMe(fetcher?: FetchLike) {
  return fetchJson<ViewerProfile>("/v1/me", undefined, fetcher);
}

export async function getWorkspaces(fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: WorkspaceSummary[] }>("/v1/workspaces", undefined, fetcher);
  return payload.items;
}

export async function getWorkspace(workspaceId: string, fetcher?: FetchLike) {
  return fetchJson<WorkspaceRecord>(`/v1/workspaces/${workspaceId}`, undefined, fetcher);
}

export async function createWorkspace(payload: Record<string, unknown>, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<WorkspaceRecord>(
    "/v1/workspaces",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function updateWorkspace(
  workspaceId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<WorkspaceRecord>(
    `/v1/workspaces/${workspaceId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getWorkspaceMembers(workspaceId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: WorkspaceMemberRecord[] }>(
    `/v1/workspaces/${workspaceId}/members`,
    undefined,
    fetcher,
  );
  return payload.items;
}

export async function getWorkspaceProjects(workspaceId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: ProjectSummary[] }>(
    `/v1/workspaces/${workspaceId}/projects`,
    undefined,
    fetcher,
  );

  return payload.items;
}

export async function createWorkspaceProject(
  workspaceId: string,
  payload: CreateProjectInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ProjectSummary>(
    `/v1/workspaces/${workspaceId}/projects`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getProject(projectId: string, fetcher?: FetchLike) {
  return fetchJson<ProjectRecord>(`/v1/projects/${projectId}`, undefined, fetcher);
}

export async function getSessions(
  workspaceId: string,
  projectId?: string | null,
  fetcher?: FetchLike,
) {
  const payload = await fetchJson<{ items: SessionSummary[] }>(
    withQuery("/v1/sessions", {
      workspace_id: workspaceId,
      project_id: projectId ?? undefined,
    }),
    undefined,
    fetcher,
  );

  return payload.items;
}

export async function getAgents(fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: AgentCatalogItem[] }>("/v1/agents", undefined, fetcher);
  return payload.items;
}

export async function getAgent(agentKey: string, fetcher?: FetchLike) {
  return fetchJson<AgentSafeProfile>(`/v1/agents/${agentKey}`, undefined, fetcher);
}

export async function createAgent(payload: Record<string, unknown>, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<AgentSafeProfile>(
    "/v1/agents",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function syncAgents(fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<{ ok?: boolean; items?: AgentCatalogItem[] }>(
    "/v1/agents/sync",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
    },
    fetcher,
  );
}

export async function getAgentProfiles(fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: AgentProfileRecord[] }>("/v1/agent-profiles", undefined, fetcher);
  return payload.items;
}

export async function createAgentProfile(payload: Record<string, unknown>, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<AgentProfileRecord>(
    "/v1/agent-profiles",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getAgentProfile(agentKey: string, fetcher?: FetchLike) {
  return fetchJson<AgentProfileRecord>(`/v1/agent-profiles/${agentKey}`, undefined, fetcher);
}

export async function getAgentProfileMcp(agentKey: string, fetcher?: FetchLike) {
  return fetchJson<AgentMcpLandscape>(`/v1/agent-profiles/${agentKey}/mcp`, undefined, fetcher);
}

export async function getMeBootstrap(fetcher?: FetchLike) {
  return fetchJson<MeBootstrapRecord>("/v1/me/bootstrap", undefined, fetcher);
}

export async function getAssistantState(fetcher?: FetchLike) {
  return fetchJson<AssistantStateRecord>("/v1/me/assistant-state", undefined, fetcher);
}

export async function getAssistantThread(fetcher?: FetchLike) {
  return fetchJson<AssistantThreadEnvelope>("/v1/me/assistant-thread", undefined, fetcher);
}

export async function postAssistantThreadMessage(
  payload: SessionMessageInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<AssistantThreadPersistedMessageResponse>(
    "/v1/me/assistant-thread/messages",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function streamAssistantThreadMessage(
  payload: SessionMessageInput,
  input?: {
    signal?: AbortSignal;
    onEvent?: (event: SessionMessageStreamEvent) => void;
  },
  fetcher: FetchLike = fetch,
): Promise<StreamSessionMessageResult> {
  const baseUrl = getApiBaseUrl();
  const startedAt = Date.now();
  const url = `${baseUrl}/v1/me/assistant-thread/messages`;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: input?.signal,
  };

  const response = await fetcher(url, requestInit);
  const isSseResponse = response.headers.get("content-type")?.includes("text/event-stream");

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let responseBody: unknown = null;

    try {
      const data = (await response.json()) as ApiErrorPayload;
      responseBody = data;
      message = data.error?.message ?? message;
    } catch {
      // Ignore parse failures and keep generic message.
    }

    recordDebugNetworkEntry({
      id: createDebugEntryId(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      mode: "sse",
      method: "POST",
      url,
      requestHeaders: normalizeHeaders(requestInit.headers),
      requestBody: payload,
      status: response.status,
      responseHeaders: readResponseHeaders(response),
      responseBody,
      error: message,
    });

    throw new Error(message);
  }

  if (!isSseResponse) {
    const accepted = (await response.json()) as SessionMessageAccepted;
    const completionPayload =
      accepted.execution_status === "completed" ||
      accepted.execution_status === "applied"
        ? (accepted.completion_payload ?? null)
        : null;
    const executionCompleted =
      accepted.execution_status === "completed" ||
      accepted.execution_status === "applied";

    recordDebugNetworkEntry({
      id: createDebugEntryId(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      mode: "json",
      method: "POST",
      url,
      requestHeaders: normalizeHeaders(requestInit.headers),
      requestBody: payload,
      status: response.status,
      responseHeaders: readResponseHeaders(response),
      responseBody: accepted,
      error: null,
    });

    return {
      mode: "json",
      accepted,
      completionPayload,
      executionCompleted,
    };
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const eventNames: string[] = [];
  let completionPayload: Record<string, unknown> | null = null;
  let executionCompleted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);

      if (parsed) {
        eventNames.push(parsed.event);
        if (parsed.event === "execution.completed") {
          completionPayload = parsed.data.completion_payload ?? null;
          executionCompleted = true;
        }
        input?.onEvent?.(parsed);
      }
    }
  }

  recordDebugNetworkEntry({
    id: createDebugEntryId(),
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    mode: "sse",
    method: "POST",
    url,
    requestHeaders: normalizeHeaders(requestInit.headers),
    requestBody: payload,
    status: response.status,
    responseHeaders: readResponseHeaders(response),
    responseBody: {
      event_count: eventNames.length,
      event_names: eventNames,
    },
    eventNames,
    error: null,
  });

  return {
    mode: "sse",
    completionPayload,
    executionCompleted,
  };
}

export async function postMeMcp(payload: Record<string, unknown>, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<Record<string, unknown>>(
    "/v1/me/mcp",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function postLlmResponse(
  payload: LlmResponseInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
): Promise<LlmResponseRecord> {
  return fetchJson<LlmResponseRecord>(
    "/v1/llm/responses",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getCapabilities(
  input?: {
    agentKey?: string | null;
    projectId?: string | null;
  },
  fetcher?: FetchLike,
) {
  const payload = await fetchJson<{ items: CapabilityCatalogItem[] }>(
    withQuery("/v1/capabilities", {
      agent_key: input?.agentKey ?? undefined,
      project_id: input?.projectId ?? undefined,
    }),
    undefined,
    fetcher,
  );

  return payload.items;
}

export async function getCapability(capabilityKey: string, fetcher?: FetchLike) {
  return fetchJson<CapabilityCatalogItem>(`/v1/capabilities/${capabilityKey}`, undefined, fetcher);
}

export async function createSession(payload: SessionCreateInput, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<SessionSummary>(
    "/v1/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getSession(sessionId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<SessionSummary & { latest_summary?: Record<string, unknown> | null }>(
    `/v1/sessions/${sessionId}`,
    { signal },
    fetcher,
  );
}

export async function getSessionMessages(sessionId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: SessionMessage[] }>(`/v1/sessions/${sessionId}/messages`, { signal }, fetcher);
  return payload.items;
}

export async function postSessionMessage(
  sessionId: string,
  payload: SessionMessageInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<{ session_id?: string | null; items?: SessionMessage[] | null; messages?: SessionMessage[] | null }>(
    `/v1/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getSessionSummaries(sessionId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: Array<Record<string, unknown>> }>(
    `/v1/sessions/${sessionId}/summaries`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function getProjectAgents(projectId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: ProjectAgentRecord[] }>(`/v1/projects/${projectId}/agents`, undefined, fetcher);
  return payload.items;
}

export async function createProjectAgent(
  projectId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ProjectAgentRecord>(
    `/v1/projects/${projectId}/agents`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getProjectAgent(projectId: string, projectAgentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ProjectAgentRecord>(
    `/v1/projects/${projectId}/agents/${projectAgentId}`,
    { signal },
    fetcher,
  );
}

export async function updateProjectAgent(
  projectId: string,
  projectAgentId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ProjectAgentRecord>(
    `/v1/projects/${projectId}/agents/${projectAgentId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function deleteProjectAgent(projectId: string, projectAgentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<{ ok?: boolean }>(
    `/v1/projects/${projectId}/agents/${projectAgentId}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      signal,
    },
    fetcher,
  );
}

export async function getProjectAgentMcp(projectId: string, projectAgentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<AgentMcpLandscape>(
    `/v1/projects/${projectId}/agents/${projectAgentId}/mcp`,
    { signal },
    fetcher,
  );
}

export async function getProjectThreads(projectId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: ThreadRecord[] }>(`/v1/projects/${projectId}/threads`, undefined, fetcher);
  return payload.items;
}

export async function createProjectThread(
  projectId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ThreadRecord>(
    `/v1/projects/${projectId}/threads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getThread(threadId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ThreadRecord>(`/v1/threads/${threadId}`, { signal }, fetcher);
}

export async function getThreadMessages(threadId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: SessionMessage[] }>(`/v1/threads/${threadId}/messages`, { signal }, fetcher);
  return payload.items;
}

export async function createThreadMessage(
  threadId: string,
  payload: SessionMessageInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<SessionMessageAccepted>(
    `/v1/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getThreadRuntimeSnapshot(threadId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ThreadRuntimeSnapshot>(`/v1/threads/${threadId}/runtime-snapshot`, { signal }, fetcher);
}

export async function getThreadSupervisorSnapshot(threadId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ThreadSupervisorSnapshot>(`/v1/threads/${threadId}/supervisor-snapshot`, { signal }, fetcher);
}

export async function createSessionMessage(
  sessionId: string,
  payload: SessionMessageInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<SessionMessageAccepted>(
    `/v1/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function streamSessionMessage(
  sessionId: string,
  payload: SessionMessageInput,
  input?: {
    signal?: AbortSignal;
    onEvent?: (event: SessionMessageStreamEvent) => void;
    fetcher?: FetchLike;
  },
): Promise<StreamSessionMessageResult> {
  const baseUrl = getApiBaseUrl();
  const fetcher = input?.fetcher ?? fetch;
  const startedAt = Date.now();
  const url = `${baseUrl}/v1/sessions/${sessionId}/messages`;
  const requestInit = {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: input?.signal,
  } satisfies RequestInit;
  const response = await fetcher(url, requestInit);

  const contentType = response.headers.get("content-type") ?? "";
  const isSseResponse = contentType.includes("text/event-stream");

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let responseBody: unknown = null;

    try {
      const data = (await response.json()) as ApiErrorPayload;
      responseBody = data;
      message = data.error?.message ?? message;
    } catch {
      // Ignore parse failures and keep generic message.
    }

    recordDebugNetworkEntry({
      id: createDebugEntryId(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      mode: "sse",
      method: "POST",
      url,
      requestHeaders: normalizeHeaders(requestInit.headers),
      requestBody: payload,
      status: response.status,
      responseHeaders: readResponseHeaders(response),
      responseBody,
      error: message,
    });

    throw new Error(message);
  }

  if (!isSseResponse) {
    const accepted = (await response.json()) as SessionMessageAccepted;
    const completionPayload =
      accepted.execution_status === "completed" ||
      accepted.execution_status === "applied"
        ? (accepted.completion_payload ?? null)
        : null;
    const executionCompleted =
      accepted.execution_status === "completed" ||
      accepted.execution_status === "applied";

    recordDebugNetworkEntry({
      id: createDebugEntryId(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      mode: "json",
      method: "POST",
      url,
      requestHeaders: normalizeHeaders(requestInit.headers),
      requestBody: payload,
      status: response.status,
      responseHeaders: readResponseHeaders(response),
      responseBody: accepted,
      error: null,
    });

    return {
      mode: "json",
      accepted,
      completionPayload,
      executionCompleted,
    };
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const eventNames: string[] = [];
  let completionPayload: Record<string, unknown> | null = null;
  let executionCompleted = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);

      if (parsed) {
        eventNames.push(parsed.event);
        if (parsed.event === "execution.completed") {
          completionPayload = parsed.data.completion_payload ?? null;
          executionCompleted = true;
        }
        input?.onEvent?.(parsed);
      }
    }
  }

  recordDebugNetworkEntry({
    id: createDebugEntryId(),
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    mode: "sse",
    method: "POST",
    url,
    requestHeaders: normalizeHeaders(requestInit.headers),
    requestBody: payload,
    status: response.status,
    responseHeaders: readResponseHeaders(response),
    responseBody: {
      event_count: eventNames.length,
      event_names: eventNames,
    },
    eventNames,
    error: null,
  });

  return {
    mode: "sse",
    completionPayload,
    executionCompleted,
  };
}

export async function createExecution(
  payload: ExecutionCreateInput,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ExecutionAccepted>(
    "/v1/executions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getExecution(executionId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ExecutionRecord>(`/v1/executions/${executionId}`, { signal }, fetcher);
}

export async function cancelExecution(executionId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<ExecutionRecord>(
    `/v1/executions/${executionId}/cancel`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
    },
    fetcher,
  );
}

export async function getProjectDocuments(projectId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: GeneratedDocument[] }>(`/v1/projects/${projectId}/documents`, undefined, fetcher);
  return payload.items;
}

export async function getDocument(documentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<GeneratedDocument>(`/v1/documents/${documentId}`, { signal }, fetcher);
}

export async function getDocumentRevisions(documentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: DocumentRevisionRecord[] }>(
    `/v1/documents/${documentId}/revisions`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function generateProjectDocument(
  projectId: string,
  payload: {
    template_id: string;
    title: string;
    session_id?: string | null;
    variables?: Record<string, unknown>;
  },
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<SessionMessageAccepted>(
    `/v1/projects/${projectId}/documents/generate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getEmbeddingPolicy(fetcher?: FetchLike) {
  return fetchJson<EmbeddingPolicy>("/v1/embedding-policy", undefined, fetcher);
}

export async function getProjectCommitments(projectId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: CommitmentRecord[] }>(
    `/v1/projects/${projectId}/commitments`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function dismissCommitment(commitmentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<CommitmentRecord>(
    `/v1/commitments/${commitmentId}/dismiss`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
    },
    fetcher,
  );
}

export async function getProjectContextItems(projectId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: ContextItemRecord[] }>(
    `/v1/projects/${projectId}/context-items`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function createProjectContextItem(
  projectId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ContextItemRecord>(
    `/v1/projects/${projectId}/context-items`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getProjectWikiPages(projectId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: WikiPageRecord[] }>(
    `/v1/projects/${projectId}/wiki-pages`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function createWorkspaceFileUpload(
  workspaceId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<UploadAccepted>(
    `/v1/workspaces/${workspaceId}/files/uploads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function completeUpload(
  uploadId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<AttachmentRecord>(
    `/v1/uploads/${uploadId}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getAttachment(attachmentId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<AttachmentRecord>(`/v1/attachments/${attachmentId}`, { signal }, fetcher);
}

export async function createMemoryChunk(
  projectId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<MemoryChunkAccepted>(
    `/v1/projects/${projectId}/memory/chunks`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function getMemoryNotes(projectId: string, fetcher?: FetchLike, signal?: AbortSignal) {
  const payload = await fetchJson<{ items: MemoryNoteRecord[] }>(
    `/v1/projects/${projectId}/memory/notes`,
    { signal },
    fetcher,
  );
  return payload.items;
}

export async function postProjectAgentMcp(
  projectAgentId: string,
  payload: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<Record<string, unknown>>(
    `/v1/project-agents/${projectAgentId}/mcp`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

async function postExecutionLease(
  executionId: string,
  action: "acquire" | "heartbeat" | "release" | "reclaim",
  payload: Record<string, unknown> | undefined,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ExecutionLeaseRecord>(
    `/v1/executions/${executionId}/lease/${action}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    },
    fetcher,
  );
}

export async function acquireExecutionLease(
  executionId: string,
  payload?: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return postExecutionLease(executionId, "acquire", payload, fetcher, signal);
}

export async function heartbeatExecutionLease(
  executionId: string,
  payload?: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return postExecutionLease(executionId, "heartbeat", payload, fetcher, signal);
}

export async function releaseExecutionLease(
  executionId: string,
  payload?: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return postExecutionLease(executionId, "release", payload, fetcher, signal);
}

export async function reclaimExecutionLease(
  executionId: string,
  payload?: Record<string, unknown>,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return postExecutionLease(executionId, "reclaim", payload, fetcher, signal);
}

export async function postDevReset(fetcher?: FetchLike, signal?: AbortSignal) {
  return fetchJson<{ ok?: boolean }>(
    "/v1/dev/reset",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
    },
    fetcher,
  );
}

function parseSseChunk(chunk: string): SessionMessageStreamEvent | null {
  const eventMatch = chunk.match(/^event:\s*(.+)$/m);
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""));

  if (!eventMatch || dataLines.length === 0) {
    return null;
  }

  const event = eventMatch[1]?.trim();

  if (
    event !== "message.accepted" &&
    event !== "message.delta" &&
    event !== "message.completed" &&
    event !== "skill.completed" &&
    event !== "execution.completed"
  ) {
    return null;
  }

  try {
    const data = JSON.parse(dataLines.join("\n")) as SessionMessageStreamEvent["data"];
    return {
      event,
      data,
    } as SessionMessageStreamEvent;
  } catch {
    return null;
  }
}

function createDebugEntryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function parseDebugRequestBody(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") {
    return body ?? null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function readResponseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}
