import { getAgentRoles, getAgentSkills } from "../../lib/api";
import type { AgentRole, AgentSkill } from "../../lib/types";
import { SessionRuntime, type SessionRuntimeState } from "../../agent/runtime";
import { createAgentContentCache } from "../agent-content-cache";
import { setState } from "../store";

/**
 * Process-wide registry of live {@link SessionRuntime} instances and their
 * store subscriptions, plus the agent skill/role content cache. Owned here so
 * the feature modules (sessions / projects / messaging) share a single source
 * of truth without importing each other.
 */
export const runtimeBySession = new Map<string, SessionRuntime>();
export const runtimeUnsubscribes = new Map<string, () => void>();

const agentContentCache = createAgentContentCache();

export async function loadAgentSkills(agentKey: string): Promise<AgentSkill[]> {
  const cached = agentContentCache.getSkillsList(agentKey);
  if (cached) return cached;
  try {
    const skills = await getAgentSkills(agentKey);
    agentContentCache.setSkills(agentKey, skills);
    return skills;
  } catch (error) {
    console.warn("[controller] failed to load agent skills", error);
    return [];
  }
}

export async function loadAgentRoles(agentKey: string): Promise<AgentRole[]> {
  const cached = agentContentCache.getRolesList(agentKey);
  if (cached) return cached;
  try {
    const roles = await getAgentRoles(agentKey);
    agentContentCache.setRoles(agentKey, roles);
    return roles;
  } catch (error) {
    console.warn("[controller] failed to load agent roles", error);
    return [];
  }
}

/**
 * Tear down a single session's runtime and its store subscription. Shared by
 * {@link removeSession} and {@link removeProject}.
 */
export function disposeSessionRuntime(sessionId: string) {
  const instance = runtimeBySession.get(sessionId);
  if (!instance) return;
  instance.dispose();
  runtimeBySession.delete(sessionId);
  const unsub = runtimeUnsubscribes.get(sessionId);
  unsub?.();
  runtimeUnsubscribes.delete(sessionId);
}

export function disposeRuntimes() {
  for (const runtime of runtimeBySession.values()) {
    runtime.abort();
  }
  for (const unsubscribe of runtimeUnsubscribes.values()) {
    unsubscribe();
  }
  runtimeBySession.clear();
  runtimeUnsubscribes.clear();
}

export function getRuntime(sessionId: string): SessionRuntime | null {
  return runtimeBySession.get(sessionId) ?? null;
}

export function onRuntimeStateChanged(sessionId: string, runtimeState: SessionRuntimeState) {
  setState((state) => {
    const currentSelectionId =
      state.selection.kind === "session" ? state.selection.sessionId : null;
    return {
      ...state,
      messagesBySession: { ...state.messagesBySession, [sessionId]: runtimeState.messages },
      summariesBySession: { ...state.summariesBySession, [sessionId]: runtimeState.summaries },
      streamingFinalText:
        currentSelectionId === sessionId ? runtimeState.streamingFinalText : state.streamingFinalText,
      runtimeTrace:
        currentSelectionId === sessionId ? runtimeState.trace : state.runtimeTrace,
      sendingMessage: currentSelectionId === sessionId ? runtimeState.isStreaming : state.sendingMessage,
    };
  });
}
