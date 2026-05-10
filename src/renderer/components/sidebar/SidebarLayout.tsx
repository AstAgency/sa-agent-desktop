import type { AgentCatalogItem, ProjectSummary, SessionSummary, ViewerProfile } from "../../lib/types";
import { GlobalSessionsSection } from "./GlobalSessionsSection";
import { ProjectsSection } from "./ProjectsSection";
import type { SearchResult } from "./SearchInput";
import { SearchInput } from "./SearchInput";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { useSidebarCollapse } from "./useSidebarCollapse";

type ProjectSessionGroup = {
  project: ProjectSummary;
  sessions: SessionSummary[];
};

const EXPANDED_WIDTH = 300;
const COLLAPSED_WIDTH = 56;

export function SidebarLayout(props: {
  language: "ru" | "en";
  workspaceName: string;
  agents: AgentCatalogItem[];
  selectedAgentKey: string | null;
  profile: ViewerProfile | null;
  projectGroups: ProjectSessionGroup[];
  globalSessions: SessionSummary[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onSelectAgent: (agentKey: string | null) => void;
  onProjectClick: (projectId: string) => void;
  onSessionClick: (sessionId: string, projectId: string | null) => void;
  onNewGlobalSession: () => void;
  onCreateProject: () => void;
  onFilesClick: () => void;
  onProfileClick: () => void;
  onSearchResult: (result: SearchResult) => void;
}) {
  const { collapsed, responsiveHidden, drawerOpen, toggle } = useSidebarCollapse();

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const showOverlay = responsiveHidden && drawerOpen;

  return (
    <>
      {/* Overlay backdrop for responsive/mobile mode */}
      {showOverlay && (
        <div
          data-testid="sidebar-layout-backdrop"
          aria-hidden="true"
          onClick={toggle}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
            zIndex: 39,
            animation: "saFadeIn 180ms ease",
          }}
        />
      )}

      {/* Sidebar — absolute overlay when responsive, fixed-width when normal */}
      <aside
        data-testid="sidebar-layout"
        style={{
          height: "100%",
          background: "linear-gradient(180deg, var(--theme-color-panel-start), var(--theme-color-panel-end))",
          borderRight: "1px solid var(--theme-color-border-secondary)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          width: showOverlay ? EXPANDED_WIDTH : sidebarWidth,
          transition: "width 180ms ease, transform 180ms ease",
          zIndex: showOverlay ? 40 : undefined,
          overflow: "hidden",
          ...(showOverlay
            ? {
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
              }
            : {
                position: "relative",
              }),
        }}
      >
        {/* Fixed-width inner navigation to prevent content reflow during transition */}
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%",
            minWidth: 0,
          }}
        >
          <SidebarHeader
            language={props.language}
            workspaceName={props.workspaceName}
            agents={props.agents}
            selectedAgentKey={props.selectedAgentKey}
            collapsed={collapsed}
            onSelectAgent={props.onSelectAgent}
            onToggleCollapse={toggle}
          />

          <SearchInput
            language={props.language}
            collapsed={collapsed}
            scope={{
              projectNames: props.projectGroups.map((g) => g.project.name),
              sessionTitles: [
                ...props.globalSessions.map((s) => s.title ?? s.id),
                ...props.projectGroups.flatMap((g) => g.sessions.map((s) => s.title ?? s.id)),
              ],
              messageSnippets: [],
            }}
            onSelectResult={props.onSearchResult}
          />

          <ProjectsSection
            language={props.language}
            collapsed={collapsed}
            projectGroups={props.projectGroups}
            selectedProjectId={props.selectedProjectId}
            selectedSessionId={props.selectedSessionId}
            onProjectClick={props.onProjectClick}
            onSessionClick={(sessionId, projectId) => props.onSessionClick(sessionId, projectId)}
            onCreateProject={props.onCreateProject}
          />

          <GlobalSessionsSection
            language={props.language}
            collapsed={collapsed}
            sessions={props.globalSessions}
            selectedSessionId={props.selectedSessionId}
            onSessionClick={(sessionId) => props.onSessionClick(sessionId, null)}
            onNewChat={props.onNewGlobalSession}
          />

          <SidebarFooter
            language={props.language}
            collapsed={collapsed}
            profile={props.profile}
            onFilesClick={props.onFilesClick}
            onProfileClick={props.onProfileClick}
          />
        </nav>
      </aside>
    </>
  );
}
