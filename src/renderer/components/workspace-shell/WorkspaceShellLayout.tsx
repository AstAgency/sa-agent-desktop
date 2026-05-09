import { ContextPanel } from "../workspace/ContextPanel";
import { WorkspaceNav } from "../workspace/WorkspaceNav";
import { WorkspaceTopBar } from "../workspace/WorkspaceTopBar";
import { LockedPopup } from "./LockedPopup";
import { WorkspaceMainContent } from "./WorkspaceMainContent";
import { shellStyle } from "./threadStyles";
import { translate } from "../../lib/i18n";
import type { WorkspaceMode } from "../../lib/types";

export function WorkspaceShellLayout(props: {
  language: "ru" | "en";
  onboarding: { kind: "user" | "project" } | null;
  project: Parameters<typeof WorkspaceTopBar>[0]["project"];
  projects: Parameters<typeof WorkspaceNav>[0]["projects"];
  projectAgents: Parameters<typeof WorkspaceTopBar>[0]["projectAgents"];
  activeProjectAgentId: string | null;
  resolvedWorkspaceMode: WorkspaceMode;
  isNavCollapsed: boolean;
  isContextPanelCollapsed: boolean;
  lockedPopup: { message: string; phase: "enter" | "exit" } | null;
  profileSummary: { displayName: string | null; email: string | null; preferredUserName: string | null; preferredAgentName: string | null; activityDomain: string | null; onboardingCompleted: boolean };
  mainContentProps: Parameters<typeof WorkspaceMainContent>[0];
  toolMessageSetter: (message: string | null) => void;
  onSelectProjectAgent: (projectAgentId: string) => void;
  onToggleNav: () => void;
  onSelectMode: (mode: WorkspaceMode) => void;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
  onToggleContext: () => void;
  onOpenSettings: () => void;
  onOpenAssistantOverlay: (mode: "ask-assistant" | "run-command") => void;
  onDismissPopup: () => void;
}) {
  return (
    <section data-testid="workspace-shell" aria-label={translate(props.language, "workspace.label")} style={{ ...shellStyle, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "12px" }}>
      <WorkspaceTopBar language={props.language} project={props.project} projectAgents={props.projectAgents} activeProjectAgentId={props.activeProjectAgentId} onSelectProjectAgent={(projectAgentId) => { props.onSelectProjectAgent(projectAgentId); props.toolMessageSetter(null); }} runtimeHealthy assistantActionsDisabled={Boolean(props.onboarding)} onOpenAssistantOverlay={props.onOpenAssistantOverlay} onOpenSettings={props.onOpenSettings} />
      <div data-testid="workspace-shell-body" style={{ display: "grid", gridTemplateColumns: `${props.isNavCollapsed ? "72px" : "280px"} minmax(0, 1fr) ${props.isContextPanelCollapsed ? "56px" : "340px"}`, gap: "16px", minHeight: 0, overflow: "hidden", height: "100%", transition: "grid-template-columns 160ms ease" }}>
        <WorkspaceNav language={props.language} mode={props.resolvedWorkspaceMode} isCollapsed={props.isNavCollapsed} onToggleCollapsed={props.onToggleNav} onSelectMode={props.onSelectMode} projects={props.projects} selectedProjectId={props.project?.id ?? null} onSelectProject={props.onSelectProject} onCreateProject={props.onCreateProject} lockedModes={props.onboarding ? ["home", "activity", "tasks", "agents", "files", "executions"] : []} />
        <main data-testid="workspace-shell-main" style={{ minHeight: 0, overflow: "auto", padding: "16px", borderRadius: "14px", background: "color-mix(in srgb, var(--theme-color-panel-start) 86%, transparent)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <WorkspaceMainContent {...props.mainContentProps} />
        </main>
        <ContextPanel language={props.language} mode={props.resolvedWorkspaceMode} collapsed={props.isContextPanelCollapsed} onToggleCollapsed={props.onToggleContext} profileDisplayName={props.profileSummary.displayName} profileEmail={props.profileSummary.email} preferredUserName={props.profileSummary.preferredUserName} preferredAgentName={props.profileSummary.preferredAgentName} activityDomain={props.profileSummary.activityDomain} onboardingCompleted={props.profileSummary.onboardingCompleted} />
      </div>
      {props.lockedPopup ? <LockedPopup language={props.language} message={props.lockedPopup.message} phase={props.lockedPopup.phase} onClose={props.onDismissPopup} /> : null}
    </section>
  );
}
