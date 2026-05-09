import { ActivityView } from "../workspace/ActivityView";
import { AgentsView } from "../workspace/AgentsView";
import { ExecutionsView } from "../workspace/ExecutionsView";
import { FilesView } from "../workspace/FilesView";
import { ProjectHomeView } from "../workspace/ProjectHomeView";
import { TasksView } from "../workspace/TasksView";
import { ThreadWorkspace } from "./ThreadWorkspace";
import { translate } from "../../lib/i18n";
import { readExecutionStatusLabel } from "./helpers";
import type { AppLanguage, ConversationScope, ProjectAgentRecord, SessionMessage, SessionSummary, WorkspaceMode } from "../../lib/types";

export function WorkspaceMainContent(props: {
  language: AppLanguage;
  mode: WorkspaceMode;
  scope: ConversationScope;
  projectScoped: boolean;
  activeSession: SessionSummary | null;
  onboardingKind: "user" | "project" | null;
  visibleMessages: SessionMessage[];
  streamingAssistantText: string;
  isAwaitingAssistantStream: boolean;
  isLoadingMessages: boolean;
  isCreatingSession: boolean;
  errorMessage: string | null;
  toolMessage: string | null;
  isSendDisabled: boolean;
  sendDisabledReason: string | null;
  draftMessage: string;
  onDraftMessageChange: (value: string) => void;
  onSend: () => void;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  documents: Parameters<typeof FilesView>[0]["documents"];
  onOpenAgentFilesFolder: () => Promise<void>;
  sessions: SessionSummary[];
  threads: Parameters<typeof ActivityView>[0]["threads"];
  commitments: Parameters<typeof ActivityView>[0]["commitments"];
  activeAgentProfile: Parameters<typeof AgentsView>[0]["activeAgentProfile"];
  projectAgents: ProjectAgentRecord[];
  onCancelExecution: (executionId: string) => Promise<void>;
}) {
  if (props.mode === "thread") {
    return (
      <ThreadWorkspace
        language={props.language}
        scope={props.scope}
        title={props.scope === "global" ? translate(props.language, "workspace.assistant.ask") : props.activeSession?.title?.trim() || translate(props.language, "workspace.thread.title")}
        executionStatusLabel={readExecutionStatusLabel(props.language, props.activeSession?.execution_status ?? "running")}
        scopeLabel={translate(props.language, props.projectScoped ? "workspace.scope.project" : "workspace.scope.global")}
        onboardingKind={props.onboardingKind}
        visibleMessages={props.visibleMessages}
        streamingAssistantText={props.streamingAssistantText}
        isAwaitingAssistantStream={props.isAwaitingAssistantStream}
        isLoadingMessages={props.isLoadingMessages}
        isCreatingSession={props.isCreatingSession}
        errorMessage={props.errorMessage}
        toolMessage={props.toolMessage}
        isSendDisabled={props.isSendDisabled}
        sendDisabledReason={props.sendDisabledReason}
        draftMessage={props.draftMessage}
        onDraftMessageChange={props.onDraftMessageChange}
        onSend={props.onSend}
        messagesContainerRef={props.messagesContainerRef}
        messagesEndRef={props.messagesEndRef}
      />
    );
  }
  if (props.mode === "files") return <FilesView language={props.language} documents={props.documents} onOpenAgentFilesFolder={props.onOpenAgentFilesFolder} />;
  if (props.mode === "activity") return <ActivityView language={props.language} sessions={props.sessions} threads={props.threads} commitments={props.commitments} documents={props.documents} />;
  if (props.mode === "tasks") return <TasksView language={props.language} />;
  if (props.mode === "agents") return <AgentsView language={props.language} activeAgentProfile={props.activeAgentProfile} projectAgents={props.projectAgents} />;
  if (props.mode === "executions") return <ExecutionsView language={props.language} sessions={props.sessions} onCancelExecution={props.onCancelExecution} />;

  return (
    <ProjectHomeView
      language={props.language}
      agents={props.projectAgents}
      threads={props.threads}
      documents={props.documents}
      sessions={props.sessions}
      activeExecution={props.activeSession?.execution_id ? { execution_id: props.activeSession.execution_id, capability_key: props.activeSession.active_capability_key ?? null, status: props.activeSession.execution_status ?? "running" } : null}
    />
  );
}
