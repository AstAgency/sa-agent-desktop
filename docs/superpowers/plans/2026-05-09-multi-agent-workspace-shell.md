# Multi-Agent Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the current desktop shell into a workspace-first, three-column, activity-centric shell with `Project Home` as the default mode and `Thread` as one explicit workspace mode.

**Architecture:** Keep the current backend contracts, bootstrap flow, session flow, and assistant runtime intact. The implementation is a renderer-side shell refactor: introduce a guarded persistent workspace mode model with safe fallback to `home`, split the large `WorkspaceShell` into focused view components, keep `Thread` explicit except while onboarding temporarily forces assistant/thread mode, and add `Project Home`, `Activity`, `Tasks`, `Agents`, `Files`, and `Executions` surfaces with action-oriented empty states and a collapsible contextual right panel.

**Tech Stack:** React, TypeScript, Vite, Vitest, React Testing Library, Electron, existing inline-style renderer patterns

---

## File Structure

### Create

- `src/renderer/components/workspace/WorkspaceTopBar.tsx` — top navigation with project switcher, activity pulse, runtime badge, assistant/command trigger, settings/profile entry
- `src/renderer/components/workspace/WorkspaceNav.tsx` — left rail for `Home`, `Activity`, `Thread`, `Tasks`, `Agents`, `Files`, `Executions`
- `src/renderer/components/workspace/ProjectHomeView.tsx` — operational overview surface with status, presence, active tasks, running executions, recent artifacts, recent activity preview
- `src/renderer/components/workspace/ActivityView.tsx` — chronological operational stream with filter bar and grouped event cards
- `src/renderer/components/workspace/ThreadView.tsx` — extracted operational collaboration stream
- `src/renderer/components/workspace/TasksView.tsx` — first-shell task board placeholder with action-oriented empty state
- `src/renderer/components/workspace/AgentsView.tsx` — single-agent-now / multi-agent-later roster surface
- `src/renderer/components/workspace/FilesView.tsx` — artifacts vs physical files split view
- `src/renderer/components/workspace/ExecutionsView.tsx` — runtime operator surface
- `src/renderer/components/workspace/ContextPanel.tsx` — right inspector panel with default calm operational state and collapse toggle
- `src/renderer/components/workspace/WorkspaceEmptyState.tsx` — reusable action-oriented empty state
- `src/renderer/lib/workspace-view-model.ts` — view models for project home, activity items, executions, files, agent presence
- `src/renderer/lib/workspace-mode.ts` — `WorkspaceMode` union, `isWorkspaceMode`, `resolveWorkspaceMode`
- `tests/unit/workspace-view-model.test.ts` — projections and prioritization rules
- `tests/unit/workspace-mode.test.ts` — guard and fallback coverage

### Modify

- `src/renderer/components/WorkspaceShell.tsx` — become orchestration shell instead of one giant chat screen
- `src/renderer/App.tsx` — persist and restore selected workspace mode and selected thread/session anchors
- `src/renderer/state/app-state.ts` — extend normalized persisted app state with `workspaceMode`
- `src/renderer/lib/types.ts` — add workspace mode and UI-only view model types
- `src/renderer/lib/i18n.ts` — add new copy for `Home`, `Activity`, `Executions`, empty states, command/assistant trigger, MCP wording
- `tests/renderer/app-flow.test.tsx` — adapt integration tests to the new shell and default `Project Home`

### Reuse

- `src/renderer/lib/api.ts` — keep current data loading and execution flows
- `src/renderer/lib/agent-files.ts` — keep local file actions
- `src/renderer/agent/runtime.ts` — keep thread runtime
- `src/renderer/state/bootstrap.ts` — keep screen decisions; shell refactor stays inside workspace shell

## Task 1: Introduce Workspace Modes, Top Bar, and Persistent Shell Navigation

**Files:**
- Create: `src/renderer/components/workspace/WorkspaceTopBar.tsx`
- Create: `src/renderer/components/workspace/WorkspaceNav.tsx`
- Create: `src/renderer/lib/workspace-mode.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/state/app-state.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/lib/i18n.ts`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Test: `tests/unit/workspace-mode.test.ts`
- Test: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for default Project Home using stable shell selectors**

```tsx
it("lands in Project Home after bootstrap instead of opening chat-first main content", async () => {
  render(
    <WorkspaceShell
      language="en"
      workspace={buildWorkspace()}
      agents={[buildAgent()]}
      selectedAgentKey="sa_analyst"
      profile={buildProfile({ onboarding_completed: true })}
      project={buildProject()}
      projects={[buildProject()]}
      globalSessions={[]}
      globalRuntimeContext={null}
      projectSessions={[buildSession({ id: "session-1" })]}
      projectRuntimeContext={buildProjectRuntimeContext()}
      onboarding={null}
      onSelectAgent={vi.fn()}
      onSelectProject={vi.fn()}
      onCreateProject={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );

  expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();
  expect(screen.getByTestId("workspace-shell-topbar")).toBeTruthy();
  expect(screen.getByTestId("workspace-shell-nav")).toBeTruthy();
  expect(screen.getByTestId("workspace-shell-main")).toBeTruthy();
  expect(screen.getByTestId("workspace-shell-context-panel")).toBeTruthy();
  expect(screen.getByTestId("workspace-nav-home")).toBeTruthy();
  expect(screen.getByTestId("workspace-nav-activity")).toBeTruthy();
  expect(screen.getByTestId("workspace-nav-thread")).toBeTruthy();
  expect(screen.getByTestId("workspace-search-slot")).toBeTruthy();
  expect(screen.getByTestId("workspace-runtime-badge")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Project Home"`
Expected: FAIL because the current shell is chat-first and has no workspace mode navigation

- [ ] **Step 3: Add workspace mode guard, fallback, and minimal shell state**

```ts
export type WorkspaceMode =
  | "home"
  | "activity"
  | "thread"
  | "tasks"
  | "agents"
  | "files"
  | "executions";

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "home" ||
    value === "activity" ||
    value === "thread" ||
    value === "tasks" ||
    value === "agents" ||
    value === "files" ||
    value === "executions";
}

export function resolveWorkspaceMode(value: unknown): WorkspaceMode {
  return isWorkspaceMode(value) ? value : "home";
}
```

```tsx
const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
  resolveWorkspaceMode(appState?.workspaceMode),
);

const safeWorkspaceMode = resolveWorkspaceMode(workspaceMode);

const resolvedMode: WorkspaceMode =
  onboarding ? "thread" : safeWorkspaceMode;
```

```ts
export type PersistedAppState = {
  // existing persisted fields...
  workspaceMode?: WorkspaceMode | null;
};
```

```tsx
<WorkspaceTopBar
  data-testid="workspace-shell-topbar"
  language={language}
  project={project}
  runtimeHealthy={true}
  searchPlaceholder={translate(language, "workspace.search")}
  onOpenAssistantOverlay={(entryMode) => setAssistantEntryMode(entryMode)}
  onOpenSettings={onOpenSettings}
/>
<WorkspaceNav
  data-testid="workspace-shell-nav"
  language={language}
  mode={resolvedMode}
  onSelectMode={setWorkspaceMode}
  projects={projects}
  project={project}
  sessions={currentSessions}
/>
<main data-testid="workspace-shell-main">
  {/* selected workspace mode only */}
</main>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Project Home"`
Expected: PASS with shell rendering top bar, left navigation, main area, context panel, and `Project Home`

- [ ] **Step 5: Add failing continuity test for persisted workspace mode**

```tsx
it("restores the last selected workspace mode after app restart", async () => {
  storage.getAppState.mockResolvedValue({
    language: "en",
    isAuthenticated: true,
    selectedAgentKey: "sa_analyst",
    workspaceMode: "files",
  });

  render(<App />);

  expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
});
```

- [ ] **Step 6: Add failing unit test for invalid persisted mode fallback**

```ts
import { describe, expect, it } from "vitest";
import { resolveWorkspaceMode } from "../../src/renderer/lib/workspace-mode";

describe("resolveWorkspaceMode", () => {
  it("falls back to home for invalid persisted mode", () => {
    expect(resolveWorkspaceMode("broken-mode")).toBe("home");
  });
});
```

- [ ] **Step 7: Run the continuity and unit tests to verify they pass**

Run: `npx vitest run tests/unit/workspace-mode.test.ts tests/renderer/app-flow.test.tsx --testNamePattern "restores the last selected workspace mode|falls back to home"`
Expected: PASS with `files` mode restored from persisted state and invalid values resolving to `home`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/workspace/WorkspaceTopBar.tsx src/renderer/components/workspace/WorkspaceNav.tsx src/renderer/lib/workspace-mode.ts src/renderer/App.tsx src/renderer/state/app-state.ts src/renderer/lib/types.ts src/renderer/lib/i18n.ts src/renderer/components/WorkspaceShell.tsx tests/unit/workspace-mode.test.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add workspace-first shell navigation"
```

## Task 2: Build Project Home and a Collapsible Right Context Panel

**Files:**
- Create: `src/renderer/components/workspace/ProjectHomeView.tsx`
- Create: `src/renderer/components/workspace/ContextPanel.tsx`
- Create: `src/renderer/lib/workspace-view-model.ts`
- Create: `tests/unit/workspace-view-model.test.ts`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/lib/i18n.ts`

- [ ] **Step 1: Write the failing unit test for Project Home prioritization**

```ts
import { describe, expect, it } from "vitest";
import { buildProjectHomeSections } from "../../src/renderer/lib/workspace-view-model";

describe("buildProjectHomeSections", () => {
  it("prioritizes blocked and approval signals above routine activity", () => {
    const sections = buildProjectHomeSections({
      executions: [
        { id: "exec-1", status: "waiting_approval", requiresAttention: true, title: "Approval required" },
      ],
      tasks: [{ id: "task-1", status: "blocked", title: "Blocked integration" }],
      artifacts: [{ id: "doc-1", title: "BRD draft" }],
    });

    expect(sections[0].id).toBe("workspace-status");
    expect(sections[0].priorityItems[0].status).toBe("blocked");
  });
});
```

- [ ] **Step 2: Write the failing renderer test for the default calm context panel and collapse toggle**

```tsx
it("renders a collapsible context panel with a calm default state when nothing is selected", async () => {
  render(<WorkspaceShell {...buildShellProps()} />);

  expect(await screen.findByTestId("workspace-shell-context-panel")).toBeTruthy();
  expect(screen.getByText(/Workspace context|Контекст workspace/i)).toBeTruthy();

  fireEvent.click(screen.getByTestId("workspace-context-toggle"));
  expect(screen.getByTestId("workspace-context-collapsed")).toBeTruthy();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/workspace-view-model.test.ts tests/renderer/app-flow.test.tsx --testNamePattern "prioritizes blocked|collapsible context panel"`
Expected: FAIL because the view-model helper and collapsible panel do not exist

- [ ] **Step 4: Implement the minimal Project Home projection and collapsible panel**

```ts
export function buildProjectHomeSections(input: ProjectHomeInput) {
  return [
    {
      id: "workspace-status",
      priorityItems: [
        ...input.tasks.filter((task) => task.status === "blocked"),
        ...input.executions.filter((execution) => execution.status === "waiting_approval"),
        ...input.executions.filter((execution) => execution.status === "waiting_user"),
        ...input.executions.filter((execution) => execution.requiresAttention === true),
        ...input.executions.filter((execution) => execution.status === "running"),
      ],
    },
    { id: "agent-presence" },
    { id: "active-tasks" },
    { id: "running-executions" },
    { id: "recent-artifacts" },
    { id: "recent-activity-preview" },
  ];
}
```

```ts
export function toExecutionStatusCard(execution: ExecutionRecord) {
  return {
    id: execution.id,
    status: execution.status,
    requiresAttention:
      execution.status === "failed" ||
      execution.status === "orphaned" ||
      execution.status === "waiting_user" ||
      execution.status === "waiting_approval" ||
      false,
  };
}
```

```tsx
export function ContextPanel(props: {
  mode: WorkspaceMode;
  selection?: ContextSelection | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (props.collapsed) {
    return (
      <aside data-testid="workspace-shell-context-panel">
        <button data-testid="workspace-context-toggle" type="button" onClick={props.onToggleCollapsed}>
          Expand
        </button>
        <div data-testid="workspace-context-collapsed" />
      </aside>
    );
  }

  if (!props.selection) {
    return (
      <aside data-testid="workspace-shell-context-panel">
        <button data-testid="workspace-context-toggle" type="button" onClick={props.onToggleCollapsed}>
          Collapse
        </button>
        <h3>Workspace context</h3>
        <p>Current scope, runtime health, and next actions appear here.</p>
      </aside>
    );
  }

  return <aside data-testid="workspace-shell-context-panel" />;
}
```

```tsx
const [isContextPanelCollapsed, setIsContextPanelCollapsed] = useState(false);

{resolvedMode === "home" ? (
  <ProjectHomeView
    language={language}
    project={project}
    profile={profile}
    sessions={currentSessions}
    documents={documents}
    activeAgentProfile={activeAgentProfile}
  />
) : null}

<ContextPanel
  mode={resolvedMode}
  selection={null}
  collapsed={isContextPanelCollapsed}
  onToggleCollapsed={() => setIsContextPanelCollapsed((value) => !value)}
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/workspace-view-model.test.ts tests/renderer/app-flow.test.tsx --testNamePattern "prioritizes blocked|collapsible context panel"`
Expected: PASS with `Project Home` prioritization and a collapsible default context panel

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace/ProjectHomeView.tsx src/renderer/components/workspace/ContextPanel.tsx src/renderer/lib/workspace-view-model.ts tests/unit/workspace-view-model.test.ts src/renderer/components/WorkspaceShell.tsx src/renderer/lib/i18n.ts
git commit -m "feat: add project home and collapsible context panel"
```

## Task 3: Extract Thread Mode as an Operational Collaboration Stream

**Files:**
- Create: `src/renderer/components/workspace/ThreadView.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for explicit Thread mode**

```tsx
it("opens the current conversation inside Thread mode instead of using chat as the whole shell", async () => {
  render(<App />);

  fireEvent.click(await screen.findByTestId("workspace-nav-thread"));

  expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Thread Workspace/i })).toBeTruthy();
  expect(screen.getByTestId("thread-memory-scope")).toBeTruthy();
  expect(screen.getByTestId("thread-execution-state")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Send|Отправить/i })).toBeTruthy();
});
```

- [ ] **Step 2: Write the failing renderer test for no implicit thread switch after onboarding**

```tsx
it("does not auto-switch back to Thread when onboarding is not active and a session exists", async () => {
  render(
    <WorkspaceShell
      {...buildShellProps({
        onboarding: null,
        projectSessions: [buildSession({ id: "session-1", execution_status: "running" })],
      })}
    />,
  );

  expect(await screen.findByTestId("workspace-home-view")).toBeTruthy();
  expect(screen.queryByTestId("workspace-thread-view")).toBeNull();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Thread mode|does not auto-switch back to Thread"`
Expected: FAIL because there is no isolated `Thread` mode yet and the shell still couples conversation too tightly to active session state

- [ ] **Step 4: Move the current chat surface into `ThreadView` and make thread selection explicit**

```tsx
export function ThreadView(props: ThreadViewProps) {
  return (
    <section data-testid="workspace-thread-view">
      <header>
        <h2>{props.title || "Thread Workspace"}</h2>
        <p>{props.agentName}</p>
        <dl>
          <div><dt>Execution</dt><dd data-testid="thread-execution-state">{props.executionState}</dd></div>
          <div><dt>Memory scope</dt><dd data-testid="thread-memory-scope">{props.memoryScope}</dd></div>
          <div><dt>Participants</dt><dd>{props.participantsLabel}</dd></div>
          <div><dt>Linked task</dt><dd>{props.linkedTaskLabel}</dd></div>
        </dl>
      </header>
      <div>{props.children}</div>
    </section>
  );
}
```

```tsx
const resolvedMode: WorkspaceMode =
  onboarding ? "thread" : safeWorkspaceMode;

const threadModeTitle =
  selectedThread?.title ??
  activeSessionTitle ??
  "Thread Workspace";

{resolvedMode === "thread" ? (
  <ThreadView
    title={threadModeTitle}
    agentName={activeAgentProfile?.display_name ?? activeAgentKey ?? translate(language, "workspace.agent.none")}
    executionState={activeSession?.execution_status ?? "running"}
    memoryScope={project ? "project" : "global"}
    participantsLabel={activeAgentProfile?.display_name ?? "Assistant + user"}
    linkedTaskLabel={translate(language, "workspace.thread.none")}
  >
    {renderExistingConversationPane()}
  </ThreadView>
) : null}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Thread mode|does not auto-switch back to Thread"`
Expected: PASS with current messaging surface available only inside explicit `Thread`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace/ThreadView.tsx src/renderer/components/WorkspaceShell.tsx tests/renderer/app-flow.test.tsx
git commit -m "refactor: move conversation into explicit thread mode"
```

## Task 4: Add Activity and Executions Workspace Modes

**Files:**
- Create: `src/renderer/components/workspace/ActivityView.tsx`
- Create: `src/renderer/components/workspace/ExecutionsView.tsx`
- Create: `src/renderer/components/workspace/WorkspaceEmptyState.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/lib/i18n.ts`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for Activity and Executions landmarks**

```tsx
it("renders Activity and Executions as explicit workspace modes with stable shell landmarks", async () => {
  render(<WorkspaceShell {...buildShellProps({ projectSessions: [], projectRuntimeContext: null })} />);

  fireEvent.click(screen.getByTestId("workspace-nav-activity"));
  expect(await screen.findByTestId("workspace-activity-view")).toBeTruthy();

  fireEvent.click(screen.getByTestId("workspace-nav-executions"));
  expect(await screen.findByTestId("workspace-executions-view")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Activity and Executions"`
Expected: FAIL because these modes and shell landmarks do not exist yet

- [ ] **Step 3: Implement the minimal mode views**

```tsx
export function WorkspaceEmptyState(props: {
  title: string;
  description: string;
  primaryActionLabel: string;
  onPrimaryAction?: () => void;
  "data-testid"?: string;
}) {
  return (
    <section data-testid={props["data-testid"]}>
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      <button type="button" onClick={props.onPrimaryAction}>{props.primaryActionLabel}</button>
    </section>
  );
}
```

```tsx
{resolvedMode === "activity" ? (
  <ActivityView data-testid="workspace-activity-view" language={language} sessions={currentSessions} documents={documents} />
) : null}
{resolvedMode === "executions" ? (
  <ExecutionsView data-testid="workspace-executions-view" language={language} runtimeContext={currentRuntimeContext} />
) : null}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Activity and Executions"`
Expected: PASS with `Activity` and `Executions` navigation available

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workspace/ActivityView.tsx src/renderer/components/workspace/ExecutionsView.tsx src/renderer/components/workspace/WorkspaceEmptyState.tsx src/renderer/components/WorkspaceShell.tsx src/renderer/lib/i18n.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add activity and execution modes"
```

## Task 5: Add Tasks and Agents Workspace Modes

**Files:**
- Create: `src/renderer/components/workspace/TasksView.tsx`
- Create: `src/renderer/components/workspace/AgentsView.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/lib/i18n.ts`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for Tasks and Agents modes**

```tsx
it("renders Tasks and Agents as first-class workspace modes", async () => {
  render(<WorkspaceShell {...buildShellProps()} />);

  fireEvent.click(screen.getByTestId("workspace-nav-tasks"));
  expect(await screen.findByTestId("workspace-tasks-view")).toBeTruthy();

  fireEvent.click(screen.getByTestId("workspace-nav-agents"));
  expect(await screen.findByTestId("workspace-agents-view")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Tasks and Agents"`
Expected: FAIL because these views do not exist yet

- [ ] **Step 3: Implement the minimal Tasks and Agents views**

```tsx
export function TasksView(props: { language: AppLanguage }) {
  return (
    <section data-testid="workspace-tasks-view">
      <WorkspaceEmptyState
        title={translate(props.language, "workspace.tasks.empty.title")}
        description={translate(props.language, "workspace.tasks.empty.description")}
        primaryActionLabel={translate(props.language, "workspace.tasks.empty.action")}
      />
    </section>
  );
}
```

```tsx
export function AgentsView(props: { language: AppLanguage; activeAgentProfile: AgentSafeProfile | null }) {
  return (
    <section data-testid="workspace-agents-view">
      {/* roster of one now, roster layout for many later */}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Tasks and Agents"`
Expected: PASS with `Tasks` and `Agents` accessible as explicit workspace modes

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workspace/TasksView.tsx src/renderer/components/workspace/AgentsView.tsx src/renderer/components/WorkspaceShell.tsx src/renderer/lib/i18n.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add tasks and agents modes"
```

## Task 6: Add Files Workspace Mode with Explicit Artifacts vs Physical Files Split and Action-Oriented Empty States

**Files:**
- Create: `src/renderer/components/workspace/FilesView.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/lib/i18n.ts`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for Files split and section-level empty states**

```tsx
it("renders artifacts and physical files as separate sections in Files mode", async () => {
  render(<WorkspaceShell {...buildShellProps({ documents: [] })} />);

  fireEvent.click(screen.getByTestId("workspace-nav-files"));

  expect(await screen.findByRole("heading", { name: /Generated Artifacts|Артефакты/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Workspace Files|Файлы workspace/i })).toBeTruthy();
  expect(screen.getByTestId("workspace-files-artifacts-empty")).toBeTruthy();
  expect(screen.getByTestId("workspace-files-physical-empty")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Files split"`
Expected: FAIL because `FilesView` does not explicitly separate artifacts and physical files yet

- [ ] **Step 3: Implement `FilesView` with explicit sections**

```tsx
<section data-testid="workspace-files-view">
  <section>
    <h2>{translate(language, "workspace.files.artifacts")}</h2>
    {artifacts.length === 0 ? (
      <WorkspaceEmptyState
        data-testid="workspace-files-artifacts-empty"
        title={translate(language, "workspace.files.artifacts.empty.title")}
        description={translate(language, "workspace.files.artifacts.empty.description")}
        primaryActionLabel={translate(language, "workspace.files.artifacts.empty.action")}
      />
    ) : (
      <div />
    )}
  </section>
  <section>
    <h2>{translate(language, "workspace.files.physical")}</h2>
    {workspaceFiles.length === 0 ? (
      <WorkspaceEmptyState
        data-testid="workspace-files-physical-empty"
        title={translate(language, "workspace.files.physical.empty.title")}
        description={translate(language, "workspace.files.physical.empty.description")}
        primaryActionLabel={translate(language, "workspace.files.physical.empty.action")}
      />
    ) : (
      <div />
    )}
  </section>
  <button type="button" onClick={onOpenAgentFilesFolder}>Open folder</button>
</section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "Files split"`
Expected: PASS with explicit `Artifacts` vs `Workspace Files` sections and independent empty states

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workspace/FilesView.tsx src/renderer/components/WorkspaceShell.tsx src/renderer/lib/i18n.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add files mode with artifacts split"
```

## Task 7: Add Command/Assistant Trigger Language, MCP Wording, and Visual Polish

**Files:**
- Modify: `src/renderer/components/workspace/WorkspaceTopBar.tsx`
- Modify: `src/renderer/components/workspace/WorkspaceNav.tsx`
- Modify: `src/renderer/components/workspace/ProjectHomeView.tsx`
- Modify: `src/renderer/components/workspace/ContextPanel.tsx`
- Modify: `src/renderer/lib/i18n.ts`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for dual assistant trigger intent**

```tsx
it("shows an assistant trigger that already leaves room for Ask Assistant and Run Command", async () => {
  render(<WorkspaceShell {...buildShellProps()} />);

  expect(await screen.findByTestId("assistant-trigger-ask")).toBeTruthy();
  expect(screen.getByTestId("assistant-trigger-command")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/app-flow.test.tsx --testNamePattern "assistant trigger"`
Expected: FAIL because the top bar does not expose this dual-intent presentation yet

- [ ] **Step 3: Implement the trigger copy and intent-aware callback**

```tsx
<div aria-label="Global command surface">
  <button data-testid="assistant-trigger-ask" type="button" onClick={() => props.onOpenAssistant("ask-assistant")}>
    {translate(props.language, "workspace.assistant.ask")}
  </button>
  <button data-testid="assistant-trigger-command" type="button" onClick={() => props.onOpenAssistant("run-command")}>
    {translate(props.language, "workspace.assistant.command")}
  </button>
</div>
```

```ts
"workspace.assistant.ask": "Ask Assistant",
"workspace.assistant.command": "Run Command",
"workspace.mcp.title": "MCP config",
"workspace.mcp.connected": "Connected MCP",
```

- [ ] **Step 4: Run tests and build to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx && npm run build`
Expected: PASS with updated wording, shell rendering, and no build regressions

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workspace/WorkspaceTopBar.tsx src/renderer/components/workspace/WorkspaceNav.tsx src/renderer/components/workspace/ProjectHomeView.tsx src/renderer/components/workspace/ContextPanel.tsx src/renderer/lib/i18n.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: polish workspace shell operator surfaces"
```

## Self-Review

### Spec coverage

- `Project Home` as default mode: covered in Tasks 1-2
- separate `Home` and `Activity`: covered in Tasks 1, 2, and 4
- three-column workspace shell: covered in Tasks 1-2
- assistant as copilot, not main screen: covered in Tasks 1 and 7
- thread as operational collaboration stream: covered in Task 3
- tasks/agents/files/executions as first-class workspace modes: covered in Tasks 4, 5, and 6
- action-oriented empty states: covered in Tasks 5 and 6 and via reusable `WorkspaceEmptyState` in Task 4
- command surface placeholder: covered in Task 7
- right context panel default state: covered in Task 2
- collapsible right context panel: covered in Task 2
- future-ready single-agent-now / multi-agent-later shape: covered in Tasks 2 and 5
- persisted invalid mode fallback: covered in Task 1
- explicit no-auto-thread-switch rule: covered in Tasks 1 and 3
- artifacts vs physical filesystem distinction: covered in Task 6
- stable shell selectors over fragile copy assertions: covered across Tasks 1, 3, 4, 5, 6, and 7

No shell-level requirement from the approved spec is intentionally omitted.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
- Every task includes explicit files, a failing test, execution command, minimal implementation shape, verification, and commit step.

### Type consistency

- `WorkspaceMode` uses one shared union across tasks.
- `WorkspaceMode` validity is guarded through `isWorkspaceMode` / `resolveWorkspaceMode`.
- `Project Home`, `Activity`, `Thread`, `Agents`, `Files`, and `Executions` are referenced consistently as mode names and component responsibilities.
- `Ask Assistant` and `Run Command` are treated as trigger labels, not separate runtime backends in this slice.
- Execution examples use backend-aligned statuses: `pending`, `running`, `waiting_user`, `waiting_approval`, `completed`, `failed`, `cancelled`, `orphaned`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-multi-agent-workspace-shell.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user already requested subagent-driven review and TDD implementation, so the next step is:

- review this plan with an agent;
- if the review is clean, execute Task 1 via subagent-driven + TDD.
