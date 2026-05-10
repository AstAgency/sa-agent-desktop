import { useCallback, useEffect, useState } from "react";
import type {
  AgentCatalogItem,
  ConversationScope,
  ProjectSummary,
  SessionMessage,
  SessionSummary,
  ViewerProfile,
} from "../../lib/types";
import { ChatSessionView } from "../chat/ChatSessionView";
import { WelcomeScreen } from "../chat/WelcomeScreen";
import { UserProfileModal } from "../modals/UserProfileModal";
import type { SearchResult } from "../sidebar/SearchInput";
import { SidebarLayout } from "../sidebar/SidebarLayout";
import "../sidebar/sidebar.css";

type ProjectSessionGroup = {
  project: ProjectSummary;
  sessions: SessionSummary[];
};

export function MainLayout(props: {
  language: "ru" | "en";
  workspaceName: string;
  agents: AgentCatalogItem[];
  selectedAgentKey: string | null;
  profile: ViewerProfile;
  projectGroups: ProjectSessionGroup[];
  globalSessions: SessionSummary[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  currentScope: ConversationScope;
  activeSession: { id: string; title?: string | null } | null;
  onboardingKind: "user" | "project" | null;
  visibleMessages: SessionMessage[];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  isCreatingSession: boolean;
  isSendingMessage: boolean;
  errorMessage: string | null;
  toolMessage: string | null;
  isSendDisabled: boolean;
  sendDisabledReason: string | null;
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onSend: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSelectAgent: (agentKey: string | null) => void;
  onProjectClick: (projectId: string) => Promise<void>;
  onSessionClick: (sessionId: string, projectId: string | null) => Promise<void>;
  onNewGlobalSession: () => Promise<void>;
  onCreateProject: () => void;
  onFilesClick: () => void;
  onOpenSettings: () => void;
  onWelcomeSend: (message: string) => Promise<void>;
}) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const handleSearchResult = useCallback(
    (result: SearchResult) => {
      if (result.kind === "project" && result.projectId) {
        void props.onProjectClick(result.projectId);
      } else if (result.kind === "session" && result.sessionId) {
        void props.onSessionClick(result.sessionId, result.projectId ?? null);
      }
    },
    [props.onProjectClick, props.onSessionClick],
  );

  // Keyboard shortcuts: Cmd/Ctrl+B to toggle sidebar, Escape to close modal
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        // Dispatch to the sidebar collapse toggle via a custom event
        window.dispatchEvent(new CustomEvent("sa-agent-toggle-sidebar"));
      }
      if (e.key === "Escape" && profileModalOpen) {
        setProfileModalOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [profileModalOpen]);

  const hasActiveSession = props.activeSession !== null;

  return (
    <div
      data-testid="main-layout"
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <SidebarLayout
        language={props.language}
        workspaceName={props.workspaceName}
        agents={props.agents}
        selectedAgentKey={props.selectedAgentKey}
        profile={props.profile}
        projectGroups={props.projectGroups}
        globalSessions={props.globalSessions}
        selectedProjectId={props.selectedProjectId}
        selectedSessionId={props.selectedSessionId}
        onSelectAgent={props.onSelectAgent}
        onProjectClick={props.onProjectClick}
        onSessionClick={props.onSessionClick}
        onNewGlobalSession={props.onNewGlobalSession}
        onCreateProject={props.onCreateProject}
        onFilesClick={props.onFilesClick}
        onProfileClick={() => setProfileModalOpen(true)}
        onSearchResult={handleSearchResult}
      />

      <main
        data-testid="main-content"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {hasActiveSession ? (
          <ChatSessionView
            language={props.language}
            scope={props.currentScope}
            activeSession={props.activeSession}
            onboardingKind={props.onboardingKind}
            visibleMessages={props.visibleMessages}
            streamingAssistantText={props.streamingAssistantText}
            isAwaitingAssistantStream={props.isAwaitingAssistantStream}
            isLoadingMessages={props.isLoadingMessages}
            isCreatingSession={props.isCreatingSession}
            isSendingMessage={props.isSendingMessage}
            errorMessage={props.errorMessage}
            toolMessage={props.toolMessage}
            isSendDisabled={props.isSendDisabled}
            sendDisabledReason={props.sendDisabledReason}
            draftMessage={props.draftMessage}
            onDraftMessageChange={props.onDraftMessageChange}
            onSend={props.onSend}
            messagesEndRef={props.messagesEndRef}
          />
        ) : (
          <WelcomeScreen
            language={props.language}
            workspaceName={props.workspaceName}
            onSendMessage={props.onWelcomeSend}
            isSending={props.isSendingMessage || props.isCreatingSession}
          />
        )}
      </main>

      {profileModalOpen && (
        <UserProfileModal
          language={props.language}
          profile={props.profile}
          onClose={() => setProfileModalOpen(false)}
          onOpenSettings={props.onOpenSettings}
        />
      )}
    </div>
  );
}
