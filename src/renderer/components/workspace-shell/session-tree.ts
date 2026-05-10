import type { ProjectSummary, SessionSummary } from "../../lib/types";
import type { SidebarProjectGroup, SidebarSessionItem, SidebarSessionTree } from "./types";

type BuildSessionTreeInput = {
  globalSessions: SessionSummary[];
  projects: ProjectSummary[];
  projectSessions: SessionSummary[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
};

export function buildSessionTree(input: BuildSessionTreeInput): SidebarSessionTree {
  return {
    visibleModes: ["files"],
    globalGroup: {
      sessions: input.globalSessions.map((session) => toSessionItem(session, input.selectedSessionId)),
    },
    projectGroups: input.projects.map((project) => toProjectGroup(project, input.projectSessions, input.selectedProjectId, input.selectedSessionId)),
    selected: {
      projectId: input.selectedProjectId,
      sessionId: input.selectedSessionId,
    },
  };
}

function toProjectGroup(
  project: ProjectSummary,
  projectSessions: SessionSummary[],
  selectedProjectId: string | null,
  selectedSessionId: string | null,
): SidebarProjectGroup {
  return {
    project,
    isSelected: project.id === selectedProjectId,
    sessions: projectSessions
      .filter((session) => session.project_id === project.id)
      .map((session) => toSessionItem(session, selectedSessionId)),
  };
}

function toSessionItem(session: SessionSummary, selectedSessionId: string | null): SidebarSessionItem {
  return {
    session,
    isSelected: session.id === selectedSessionId,
  };
}
