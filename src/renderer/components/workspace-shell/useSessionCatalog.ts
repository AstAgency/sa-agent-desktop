import { useEffect, useMemo, useState } from "react";
import { getSessions } from "../../lib/api";
import type { ProjectSummary, SessionSummary } from "../../lib/types";

type SessionCatalog = {
  globalSessions: SessionSummary[];
  projectSessionsByProjectId: Record<string, SessionSummary[]>;
};

export function useSessionCatalog(input: {
  workspaceId: string;
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  initialGlobalSessions: SessionSummary[];
  initialProjectSessions: SessionSummary[];
  onError: (message: string | null) => void;
}) {
  const projectIdsKey = useMemo(() => input.projects.map((project) => project.id).join("|"), [input.projects]);
  const initialProjectSessionsByProjectId = useMemo(
    () =>
      input.initialProjectSessions.reduce<Record<string, SessionSummary[]>>((accumulator, session) => {
        if (!session.project_id) return accumulator;
        const current = accumulator[session.project_id] ?? [];
        accumulator[session.project_id] = [...current, session];
        return accumulator;
      }, {}),
    [input.initialProjectSessions],
  );
  const [catalog, setCatalog] = useState<SessionCatalog>(() => ({
    globalSessions: input.initialGlobalSessions,
    projectSessionsByProjectId: initialProjectSessionsByProjectId,
  }));

  useEffect(() => {
    setCatalog((current) => ({
      globalSessions: input.initialGlobalSessions.length > 0 ? input.initialGlobalSessions : current.globalSessions,
      projectSessionsByProjectId: {
        ...current.projectSessionsByProjectId,
        ...initialProjectSessionsByProjectId,
      },
    }));
  }, [initialProjectSessionsByProjectId, input.initialGlobalSessions]);

  useEffect(() => {
    const hasGlobalSeed = input.initialGlobalSessions.length > 0;
    const hasProjectSeedForEveryProject = input.projects.every((project) => Array.isArray(initialProjectSessionsByProjectId[project.id]));
    if (hasGlobalSeed && hasProjectSeedForEveryProject) {
      return;
    }

    let isActive = true;
    void Promise.all([
      getSessions(input.workspaceId),
      ...input.projects.map(async (project) => [project.id, await getSessions(input.workspaceId, project.id)] as const),
    ])
      .then(([globalSessions, ...projectEntries]) => {
        if (!isActive) return;
        setCatalog({
          globalSessions,
          projectSessionsByProjectId: Object.fromEntries(projectEntries),
        });
        input.onError(null);
      })
      .catch((error) => {
        if (!isActive) return;
        input.onError(error instanceof Error ? error.message : "Failed to load sessions.");
      });
    return () => {
      isActive = false;
    };
  }, [initialProjectSessionsByProjectId, input.initialGlobalSessions.length, input.onError, input.projects, input.workspaceId, projectIdsKey]);

  const currentProjectSessions = useMemo(
    () => (input.selectedProjectId ? catalog.projectSessionsByProjectId[input.selectedProjectId] ?? [] : []),
    [catalog.projectSessionsByProjectId, input.selectedProjectId],
  );

  function upsertSession(session: SessionSummary) {
    setCatalog((current) => {
      if (session.project_id) {
        const currentSessions = current.projectSessionsByProjectId[session.project_id] ?? [];
        return {
          ...current,
          projectSessionsByProjectId: {
            ...current.projectSessionsByProjectId,
            [session.project_id]: mergeSession(currentSessions, session),
          },
        };
      }

      return {
        ...current,
        globalSessions: mergeSession(current.globalSessions, session),
      };
    });
  }

  return {
    globalSessions: catalog.globalSessions,
    projectSessionsByProjectId: catalog.projectSessionsByProjectId,
    currentProjectSessions,
    upsertSession,
  };
}

function mergeSession(currentSessions: SessionSummary[], session: SessionSummary) {
  const withoutCurrent = currentSessions.filter((item) => item.id !== session.id);
  return [session, ...withoutCurrent];
}
