import { ChatCompletionError, createSession, getBilling } from "../../lib/api";
import { getBridge } from "../../lib/bridge";
import type { AgentRole, AgentSkill, Session, WorkspaceScope } from "../../lib/types";
import { SessionRuntime } from "../../agent/runtime";
import {
  buildComposerMessage,
  nextAvailableAttachmentPath,
  type ComposerAttachment,
} from "../../components/chat-view-helpers";
import { getState, setBilling, setLastStreamError, setState } from "../store";
import { refreshBilling } from "./bootstrap";
import { saveGlobalMemory } from "./memory";
import { saveProjectMemory } from "./projects";
import {
  loadAgentRoles,
  loadAgentSkills,
  onRuntimeStateChanged,
  runtimeBySession,
  runtimeUnsubscribes,
} from "./registry";
import { buildSessionScope, deriveDisplayName, findSession } from "./sessions";
import { describeStreamError } from "./stream-error.js";

export async function sendMessage(
  content: string,
  attachments: ComposerAttachment[] = [],
): Promise<void> {
  const trimmed = content.trim();
  if (trimmed.length === 0 && attachments.length === 0) return;
  const state = getState();
  if (state.sendingMessage) throw new Error("Already sending a message");
  if (!state.profile) throw new Error("Profile not loaded");

  setLastStreamError(null);
  // Do not wipe runtimeTrace — it is the persistent per-session execution
  // timeline; the new turn appends to it and is grouped by turnId.
  setState((s) => ({ ...s, sendingMessage: true, streamingFinalText: "" }));

  try {
    const selection = state.selection;
    let session: Session;
    if (selection.kind === "session") {
      const existing = findSession(state, selection.sessionId);
      if (!existing) throw new Error("Session not found");
      session = existing;
    } else if (selection.kind === "new-global") {
      session = await createSession({
        display_name: deriveDisplayName(deriveSessionNameSource(content, attachments)),
        project_id: null,
      });
      setState((s) => ({
        ...s,
        globalSessions: [session, ...s.globalSessions],
        globalSessionsPage: {
          ...s.globalSessionsPage,
          total: s.globalSessionsPage.total + 1,
        },
        selection: { kind: "session", sessionId: session.id },
        messagesBySession: { ...s.messagesBySession, [session.id]: [] },
        summariesBySession: { ...s.summariesBySession, [session.id]: [] },
      }));
    } else if (selection.kind === "new-project") {
      session = await createSession({
        display_name: deriveDisplayName(deriveSessionNameSource(content, attachments)),
        project_id: selection.projectId,
      });
      const projectId = selection.projectId;
      setState((s) => ({
        ...s,
        projectSessions: {
          ...s.projectSessions,
          [projectId]: [session, ...(s.projectSessions[projectId] ?? [])],
        },
        projectSessionsPage: {
          ...s.projectSessionsPage,
          [projectId]: {
            page: s.projectSessionsPage[projectId]?.page ?? 0,
            total: (s.projectSessionsPage[projectId]?.total ?? 0) + 1,
            hasMore: s.projectSessionsPage[projectId]?.hasMore ?? false,
            loaded: s.projectSessionsPage[projectId]?.loaded ?? true,
            loading: s.projectSessionsPage[projectId]?.loading ?? false,
          },
        },
        selection: { kind: "session", sessionId: session.id },
        messagesBySession: { ...s.messagesBySession, [session.id]: [] },
        summariesBySession: { ...s.summariesBySession, [session.id]: [] },
      }));
    } else {
      throw new Error("Nothing selected — open or start a session first");
    }

    const scope = buildSessionScope(state, session);
    const persistedAttachments = await saveAttachmentsToWorkspace(scope, attachments);
    const messageContent = buildComposerMessage(content, persistedAttachments);
    const runtime = await acquireRuntime(session);
    try {
      await runtime.sendUserMessage(messageContent);
    } catch (error) {
      await reportStreamError(error, session.id);
      throw error;
    }
  } finally {
    // Keep runtimeTrace — the completed turn's events stay in the timeline
    // (grouped by turnId) instead of being cleared and re-reconstructed.
    setState((s) => ({ ...s, sendingMessage: false, streamingFinalText: "" }));
    void refreshBilling();
  }
}

function deriveSessionNameSource(
  content: string,
  attachments: ComposerAttachment[],
): string {
  const trimmed = content.trim();
  if (trimmed.length > 0) return trimmed;
  return attachments[0]?.name ?? "New chat";
}

async function reportStreamError(error: unknown, sessionId: string) {
  const state = getState();
  const language = state.language;
  let billing = state.billing;

  if (
    error instanceof ChatCompletionError &&
    error.kind === "rate_limit" &&
    error.code === "rate_limited" &&
    /hourly token limit exceeded/i.test(error.message)
  ) {
    try {
      billing = await getBilling();
      setBilling(billing);
    } catch {
      billing = state.billing;
    }
  }

  const { kind, message } = describeStreamError(error, language, billing);
  setLastStreamError({ kind, message, sessionId });
}

export function abortActiveTurn() {
  const state = getState();
  if (state.selection.kind !== "session") return;
  const runtime = runtimeBySession.get(state.selection.sessionId);
  runtime?.abort();
}

async function acquireRuntime(session: Session): Promise<SessionRuntime> {
  const existing = runtimeBySession.get(session.id);
  if (existing) return existing;
  const state = getState();
  if (!state.profile) throw new Error("Profile not loaded");
  const project = session.project_id
    ? state.projects.find((proj) => proj.id === session.project_id) ?? null
    : null;
  const agent =
    state.agents.find((candidate) => candidate.agent_key === state.selectedAgentKey) ??
    state.agents[0] ??
    null;
  const scope = buildSessionScope(state, session);
  const messages = state.messagesBySession[session.id] ?? [];
  const summaries = state.summariesBySession[session.id] ?? [];
  const [agentSkills, agentRoles] = agent
    ? await Promise.all([loadAgentSkills(agent.id), loadAgentRoles(agent.id)])
    : [[] as AgentSkill[], [] as AgentRole[]];

  const runtime = new SessionRuntime({
    sessionId: session.id,
    scope,
    profile: state.profile,
    project,
    agent,
    agentSkills,
    agentRoles,
    messages,
    summaries,
    toolActions: {
      updateGlobalMemory: saveGlobalMemory,
      updateProjectMemory: saveProjectMemory,
      // createProject: createProjectViaTool,
    },
    model: agent.llm_model
  });

  const unsubscribe = runtime.subscribe((runtimeState) => {
    onRuntimeStateChanged(session.id, runtimeState);
  });
  runtimeUnsubscribes.set(session.id, unsubscribe);
  runtimeBySession.set(session.id, runtime);
  return runtime;
}

async function saveAttachmentsToWorkspace(
  scope: WorkspaceScope,
  attachments: ComposerAttachment[],
) {
  if (attachments.length === 0) return [];
  const fs = getBridge().fs;
  const rootEntries = await fs.list(scope, ".");
  const usedPaths = new Set(
    rootEntries.filter((entry) => entry.type === "file").map((entry) => entry.name),
  );
  const persisted: Array<{
    name: string;
    size: number;
    mime: string;
    kind: "text" | "binary";
    workspacePath: string;
  }> = [];
  for (const attachment of attachments) {
    if (attachment.workspacePath) {
      persisted.push({
        name: attachment.name,
        size: attachment.size,
        mime: attachment.mime,
        kind: attachment.kind,
        workspacePath: attachment.workspacePath,
      });
      usedPaths.add(attachment.workspacePath);
      continue;
    }
    const workspacePath = nextAvailableAttachmentPath(attachment.name, usedPaths);
    usedPaths.add(workspacePath);
    if (attachment.kind === "text") {
      await fs.write(scope, workspacePath, attachment.content ?? "");
    } else {
      if (!attachment.content) {
        throw new Error(`Missing binary content for attachment ${attachment.name}`);
      }
      await fs.writeBinary(scope, workspacePath, attachment.content);
    }
    persisted.push({
      name: attachment.name,
      size: attachment.size,
      mime: attachment.mime,
      kind: attachment.kind,
      workspacePath,
    });
  }
  return persisted;
}
