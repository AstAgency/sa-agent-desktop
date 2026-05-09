import { useEffect, useState } from "react";
import { recordDebugAgentRuntimeEntry } from "../../lib/debug";
import type { ConversationScope, SessionSummary } from "../../lib/types";
import { createSessionFlowDebugId } from "./helpers";

export function useScopeSessions(globalSessions: SessionSummary[], projectSessions: SessionSummary[]) {
  const [activeSessionByScope, setActiveSessionByScope] = useState<Record<ConversationScope, SessionSummary | null>>({
    global: null,
    project: null,
  });

  useEffect(() => {
    const nextGlobal = globalSessions[0] ?? null;
    const nextProject = projectSessions[0] ?? null;

    if (activeSessionByScope.global?.id && nextGlobal?.id && activeSessionByScope.global.id !== nextGlobal.id) {
      recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.session_mismatch", sessionId: activeSessionByScope.global.id, data: { scope: "global", currentSessionId: activeSessionByScope.global.id, runtimeActiveSessionId: nextGlobal.id } });
    }
    if (activeSessionByScope.project?.id && nextProject?.id && activeSessionByScope.project.id !== nextProject.id) {
      recordDebugAgentRuntimeEntry({ id: createSessionFlowDebugId(), startedAt: new Date().toISOString(), type: "runtime.session_mismatch", sessionId: activeSessionByScope.project.id, data: { scope: "project", currentSessionId: activeSessionByScope.project.id, runtimeActiveSessionId: nextProject.id } });
    }

    setActiveSessionByScope((current) => ({
      global: current.global ?? nextGlobal,
      project: current.project ?? nextProject,
    }));
  }, [activeSessionByScope.global?.id, activeSessionByScope.project?.id, globalSessions, projectSessions]);

  return { activeSessionByScope, setActiveSessionByScope };
}
