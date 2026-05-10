import { useEffect, useMemo, useRef, useState } from "react";
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
  const onErrorRef = useRef(input.onError);
  const initialGlobalSessionsKey = useMemo(
    () => input.initialGlobalSessions.map((session) => `${session.id}:${session.updated_at}`).join("|"),
    [input.initialGlobalSessions],
  );
  const initialProjectSessionsKey = useMemo(
    () => input.initialProjectSessions.map((session) => `${session.id}:${session.project_id ?? ""}:${session.updated_at}`).join("|"),
    [input.initialProjectSessions],
  );
  const projectIdsKey = useMemo(() => input.projects.map((project) => project.id).join("|"), [input.projects]);
  const projectIds = useMemo(() => input.projects.map((project) => project.id), [projectIdsKey]);
  const initialProjectSessionsByProjectId = useMemo(
    () =>
      input.initialProjectSessions.reduce<Record<string, SessionSummary[]>>((accumulator, session) => {
        if (!session.project_id) return accumulator;
        const current = accumulator[session.project_id] ?? [];
        accumulator[session.project_id] = [...current, session];
        return accumulator;
      }, {}),
    [initialProjectSessionsKey],
  );
  const [catalog, setCatalog] = useState<SessionCatalog>(() => ({
    globalSessions: input.initialGlobalSessions,
    projectSessionsByProjectId: initialProjectSessionsByProjectId,
  }));

  useEffect(() => {
    onErrorRef.current = input.onError;
  }, [input.onError]);

  useEffect(() => {
    const hasGlobalSeed = input.initialGlobalSessions.length > 0;
    const projectSeedEntries = Object.entries(initialProjectSessionsByProjectId);

    if (!hasGlobalSeed && projectSeedEntries.length === 0) {
      return;
    }

    setCatalog((current) => {
      const nextGlobalSessions = hasGlobalSeed ? input.initialGlobalSessions : current.globalSessions;
      let nextProjectSessionsByProjectId = current.projectSessionsByProjectId;

      if (projectSeedEntries.length > 0) {
        const mergedProjectSessionsByProjectId = { ...current.projectSessionsByProjectId };
        let hasProjectSeedChanges = false;

        for (const [projectId, sessions] of projectSeedEntries) {
          if (mergedProjectSessionsByProjectId[projectId] === sessions) {
            continue;
          }

          mergedProjectSessionsByProjectId[projectId] = sessions;
          hasProjectSeedChanges = true;
        }

        if (hasProjectSeedChanges) {
          nextProjectSessionsByProjectId = mergedProjectSessionsByProjectId;
        }
      }

      if (
        nextGlobalSessions === current.globalSessions &&
        nextProjectSessionsByProjectId === current.projectSessionsByProjectId
      ) {
        return current;
      }

      return {
        globalSessions: nextGlobalSessions,
        projectSessionsByProjectId: nextProjectSessionsByProjectId,
      };
    });
  }, [initialGlobalSessionsKey, initialProjectSessionsByProjectId]);

  useEffect(() => {
    const hasGlobalSeed = input.initialGlobalSessions.length > 0;
    const hasProjectSeedForEveryProject = projectIds.every((projectId) => Array.isArray(initialProjectSessionsByProjectId[projectId]));
    if (hasGlobalSeed && hasProjectSeedForEveryProject) {
      return;
    }

    let isActive = true;
    void Promise.all([
      getSessions(input.workspaceId),
      ...projectIds.map(async (projectId) => [projectId, await getSessions(input.workspaceId, projectId)] as const),
    ])
      .then(([globalSessions, ...projectEntries]) => {
        if (!isActive) return;
        setCatalog({
          globalSessions,
          projectSessionsByProjectId: Object.fromEntries(projectEntries),
        });
        onErrorRef.current(null);
      })
      .catch((error) => {
        if (!isActive) return;
        onErrorRef.current(error instanceof Error ? error.message : "Failed to load sessions.");
      });
    return () => {
      isActive = false;
    };
  }, [initialGlobalSessionsKey, input.initialGlobalSessions.length, initialProjectSessionsByProjectId, input.workspaceId, projectIds, projectIdsKey]);

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
