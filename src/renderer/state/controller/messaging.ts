import { ChatCompletionError, createSession } from "../../lib/api";
import { getBridge } from "../../lib/bridge";
import { translate } from "../../lib/i18n";
import type { AgentRole, AgentSkill, Session, WorkspaceScope } from "../../lib/types";
import { SessionRuntime } from "../../agent/runtime";
import {
  buildComposerMessage,
  nextAvailableAttachmentPath,
  type ComposerAttachment,
} from "../../components/chat-view-helpers";
import { getState, setLastStreamError, setState, type ChatErrorKind } from "../store";
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
  setState((s) => ({ ...s, sendingMessage: true, streamingFinalText: "",
    runtimeTrace: [] }));

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
      reportStreamError(error, session.id);
      throw error;
    }
  } finally {
    setState((s) => ({ ...s, sendingMessage: false, streamingFinalText: "",
    runtimeTrace: [] }));
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

function reportStreamError(error: unknown, sessionId: string) {
  const state = getState();
  const language = state.language;
  let kind: ChatErrorKind = "generic";
  let message: string;
  if (error instanceof ChatCompletionError) {
    kind = error.kind;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  if (kind === "rate_limit") {
    message = translate(language, "chat.error.rateLimit");
  } else if (kind === "timeout") {
    message = translate(language, "chat.error.timeout");
  } else {
    message = translate(language, "chat.error.generic", { message: rawMessage });
  }
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
    const workspacePath = nextAvailableAttachmentPath(attachment.name, usedPaths);
    usedPaths.add(workspacePath);
    if (attachment.kind === "text") {
      await fs.write(scope, workspacePath, attachment.content);
    } else {
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
