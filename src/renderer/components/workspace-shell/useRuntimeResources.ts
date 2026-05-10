import { useEffect, useState } from "react";
import { bootstrapAgentRuntime } from "../../agent/bootstrap";
import { syncProjectArtifactFiles } from "../../lib/agent-files";
import { getProjectAgents, getProjectCommitments, getProjectDocuments, getProjectThreads } from "../../lib/api";
import { translate } from "../../lib/i18n";
import type {
  AgentMcpLandscape,
  AgentSafeProfile,
  AppLanguage,
  CapabilityCatalogItem,
  CommitmentRecord,
  GeneratedDocument,
  ProjectAgentRecord,
  ProjectSummary,
  ThreadRecord,
  WorkspaceSummary,
} from "../../lib/types";

export function useRuntimeResources(input: {
  language: AppLanguage;
  workspace: WorkspaceSummary;
  project: ProjectSummary | null;
  activeAgentKey: string | null;
  activeProjectAgentId: string | null;
  onActiveProjectAgentIdResolved: (projectAgentId: string | null) => void;
  onToolMessage: (message: string | null) => void;
}) {
  const { language, workspace, project, activeAgentKey, activeProjectAgentId, onActiveProjectAgentIdResolved, onToolMessage } = input;
  const [activeAgentProfile, setActiveAgentProfile] = useState<AgentSafeProfile | null>(null);
  const [activeAgentMcps, setActiveAgentMcps] = useState<AgentMcpLandscape | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityCatalogItem[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [projectAgents, setProjectAgents] = useState<ProjectAgentRecord[]>([]);
  const [activeProjectAgent, setActiveProjectAgent] = useState<ProjectAgentRecord | null>(null);
  const [projectThreads, setProjectThreads] = useState<ThreadRecord[]>([]);
  const [projectCommitments, setProjectCommitments] = useState<CommitmentRecord[]>([]);

  useEffect(() => {
    onToolMessage(null);
  }, [activeAgentKey, activeProjectAgentId, onToolMessage, project?.id]);

  useEffect(() => {
    if (!activeAgentKey) {
      setActiveAgentProfile(null);
      setActiveAgentMcps(null);
      setCapabilities([]);
      return;
    }

    let isActive = true;
    void bootstrapAgentRuntime({
      agentKey: activeAgentKey,
      projectId: project?.id ?? undefined,
      projectAgentId: activeProjectAgentId ?? undefined,
    })
      .then(({ agent, mcps, capabilities: nextCapabilities, projectAgent }) => {
        if (!isActive) return;
        setActiveAgentProfile(agent);
        setActiveAgentMcps(mcps);
        setActiveProjectAgent(projectAgent);
        setCapabilities(nextCapabilities);
        onToolMessage(null);
        onActiveProjectAgentIdResolved(projectAgent?.id ?? null);
      })
      .catch(() => {
        if (!isActive) return;
        setActiveAgentProfile(null);
        setActiveAgentMcps(null);
        setActiveProjectAgent(null);
        setCapabilities([]);
        onToolMessage(translate(language, "workspace.error.loadCapabilities"));
      });

    return () => {
      isActive = false;
    };
  }, [activeAgentKey, activeProjectAgentId, language, onActiveProjectAgentIdResolved, onToolMessage, project?.id]);

  useEffect(() => {
    if (!project?.id) {
      setProjectThreads([]);
      setProjectCommitments([]);
      return;
    }

    let isActive = true;
    void Promise.all([
      getProjectDocuments(project.id).catch(() => []),
      getProjectAgents(project.id).catch(() => []),
      getProjectThreads(project.id).catch(() => []),
      getProjectCommitments(project.id).catch(() => []),
    ]).then(([nextDocuments, nextAgents, nextThreads, nextCommitments]) => {
      if (!isActive) return;
      setDocuments(nextDocuments);
      setProjectThreads(nextThreads);
      setProjectCommitments(nextCommitments);
    });

    return () => {
      isActive = false;
    };
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) {
      setProjectAgents([]);
      return;
    }

    let isActive = true;
    let retryTimer: number | null = null;

    const loadProjectAgents = async (attempt = 0) => {
      const nextAgents = await getProjectAgents(project.id).catch(() => []);
      if (!isActive) return;
      setProjectAgents(nextAgents);
      const resolvedProjectAgentId =
        activeProjectAgentId && nextAgents.some((agent) => agent.id === activeProjectAgentId)
          ? activeProjectAgentId
          : nextAgents[0]?.id ?? null;
      onActiveProjectAgentIdResolved(resolvedProjectAgentId);

      if (!resolvedProjectAgentId && attempt < 6) {
        retryTimer = window.setTimeout(() => {
          void loadProjectAgents(attempt + 1);
        }, 300);
      }
    };

    void loadProjectAgents();

    return () => {
      isActive = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [activeProjectAgentId, onActiveProjectAgentIdResolved, project?.id]);

  useEffect(() => {
    if (!project || documents.length === 0) {
      return;
    }
    let isActive = true;
    void syncProjectArtifactFiles(workspace, project, documents).catch((error) => {
      if (isActive) {
        onToolMessage(error instanceof Error ? error.message : translate(language, "workspace.error.syncAgentFiles"));
      }
    });
    return () => {
      isActive = false;
    };
  }, [documents, language, onToolMessage, project, workspace]);

  return { activeAgentProfile, activeAgentMcps, capabilities, documents, projectAgents, activeProjectAgent, projectThreads, projectCommitments };
}
