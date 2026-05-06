import { normalizeAppState, storageKey } from "../state/app-state";
import { recordDebugNetworkEntry } from "./debug";
import type {
  CreateProjectInput,
  DebugNetworkEntry,
  EmbeddingPolicy,
  GeneratedDocument,
  GlobalRuntimeContext,
  JobRecord,
  MemorySearchResult,
  ProjectRuntimeContext,
  ProjectSummary,
  SessionCreateInput,
  SessionMessage,
  SessionMessageAccepted,
  SessionMessageInput,
  SessionMessageStreamEvent,
  StreamSessionMessageResult,
  SessionSummary,
  SkillCatalogItem,
  SkillRunAccepted,
  SkillRunRequest,
  TemplateSummary,
  OnboardingPayload,
  ViewerProfile,
  WorkspaceSummary,
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

export async function getRuntimeContext(
  workspaceId: string,
  projectId?: string | null,
  fetcher?: FetchLike,
) {
  return fetchJson<GlobalRuntimeContext | ProjectRuntimeContext>(
    withQuery("/v1/runtime-context", {
      workspace_id: workspaceId,
      project_id: projectId ?? undefined,
    }),
    undefined,
    fetcher,
  );
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
      accepted.skill_status === "completed" && accepted.skill_completion_payload ? accepted.skill_completion_payload : null;

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
        if (parsed.event === "skill.completed") {
          completionPayload = parsed.data.completion_payload;
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
  };
}

export async function getSkills(fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: SkillCatalogItem[] }>("/v1/skills", undefined, fetcher);
  return payload.items;
}

export async function getTemplates(fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: TemplateSummary[] }>("/v1/templates", undefined, fetcher);
  return payload.items;
}

export async function getTemplate(templateId: string, fetcher?: FetchLike) {
  return fetchJson<TemplateSummary>(`/v1/templates/${templateId}`, undefined, fetcher);
}

export async function getProjectDocuments(projectId: string, fetcher?: FetchLike) {
  const payload = await fetchJson<{ items: GeneratedDocument[] }>(`/v1/projects/${projectId}/documents`, undefined, fetcher);
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

export async function searchMemory(
  payload: {
    workspace_id: string;
    project_id?: string;
    query_text: string;
    top_k?: number;
  },
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<MemorySearchResult>(
    "/v1/memory/search",
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

export async function createSkillRun(
  payload: SkillRunRequest,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<SkillRunAccepted>(
    "/v1/skill-runs",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function createProjectSkillRun(
  projectId: string,
  payload: Omit<SkillRunRequest, "workspace_id">,
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return createSkillRun(
    {
      workspace_id: "",
      project_id: projectId,
      skill_id: payload.skill_id,
      input_payload: payload.input_payload,
    },
    fetcher,
    signal,
  );
}

export async function getJob(jobId: string, signal?: AbortSignal, fetcher?: FetchLike) {
  return fetchJson<JobRecord>(`/v1/jobs/${jobId}`, { signal }, fetcher);
}

export async function postMeOnboarding(
  payload: {
    skill_id: string;
    payload: OnboardingPayload;
  },
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ViewerProfile>(
    "/v1/me/onboarding",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
}

export async function postProjectOnboarding(
  projectId: string,
  payload: {
    skill_id: string;
    payload: OnboardingPayload;
  },
  fetcher?: FetchLike,
  signal?: AbortSignal,
) {
  return fetchJson<ProjectSummary>(
    `/v1/projects/${projectId}/onboarding`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    fetcher,
  );
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
    event !== "skill.completed"
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
