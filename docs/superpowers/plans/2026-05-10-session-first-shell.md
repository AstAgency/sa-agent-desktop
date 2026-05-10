# Session-First Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the desktop client around `sessions` for both global and project chat, remove active `assistant-thread` runtime usage, and reshape the MVP shell into a session-first sidebar with explicit new-session creation.

**Architecture:** The renderer stops treating global assistant as a separate transport and uses the same `sessions -> llm/responses -> scoped MCP -> sessions` loop for both scopes. Bootstrap remains rooted in `GET /v1/me/bootstrap`, but the shell state and navigation become session-first: global sessions at the top, projects beneath, project sessions nested under projects, and only `Files` remains as a visible mode tab.

**Tech Stack:** React, TypeScript, Electron renderer, Vitest, `@earendil-works/pi-agent-core`

---

## File Structure

### Create

- `src/renderer/components/workspace-shell/session-tree.ts` — build sidebar view models for global sessions and project sessions
- `src/renderer/components/workspace-shell/session-actions.ts` — focused session creation helpers for global and project scopes
- `tests/unit/session-tree.test.ts`
- `tests/unit/session-actions.test.ts`
- `tests/renderer/app-session-sidebar.test.tsx`
- `tests/renderer/app-global-session-flow.test.tsx`

### Modify

- `src/renderer/lib/api.ts` — align session querying/creation helpers with unified contract
- `src/renderer/lib/types.ts` — session-first bootstrap and sidebar types
- `src/renderer/state/bootstrap.ts` — read `user_global_session` / `user_global_messages` from `GET /v1/me/bootstrap`
- `src/renderer/App.tsx` — stop passing legacy assistant-thread runtime data, wire session-first refresh behavior
- `src/renderer/components/WorkspaceShell.tsx` — wire unified session-first props and explicit new-session action
- `src/renderer/components/workspace/WorkspaceNav.tsx` — render global sessions, projects, nested project sessions, and create-session actions
- `src/renderer/components/workspace-shell/types.ts` — session-first props and callbacks
- `src/renderer/components/workspace-shell/useScopeSessions.ts` — remove assistant-thread assumptions
- `src/renderer/components/workspace-shell/useSessionMessages.ts` — always load messages through `GET /v1/sessions/:sessionId/messages`
- `src/renderer/components/workspace-shell/useConversationFlow.ts` — unify global and project send flow around `sessions`
- `src/renderer/components/workspace-shell/conversationTurns.ts` — persist global assistant replies through session endpoints, not assistant-thread
- `src/renderer/components/workspace-shell/useWorkspaceShellActions.ts` — expose `New Session` action and remove blocking onboarding behavior
- `src/renderer/components/workspace-shell/WorkspaceShellLayout.tsx` — hide non-MVP mode tabs except `Files`
- `src/renderer/components/workspace/WorkspaceTopBar.tsx` — optional new-session trigger if needed for density
- `tests/unit/bootstrap.test.ts`
- `tests/unit/api.test.ts`
- `tests/renderer/app-user-onboarding.test.tsx`
- `tests/renderer/app-project-onboarding.test.tsx`
- `tests/renderer/app-files-navigation.test.tsx`

### Delete

- legacy active-path assumptions around `assistant-thread` in renderer runtime tests as they are replaced by session tests

## Task 1: Align Bootstrap and Types Around `user_global_session`

**Files:**
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/state/bootstrap.ts`
- Test: `tests/unit/bootstrap.test.ts`

- [ ] **Step 1: Write the failing bootstrap test for session-first global bootstrap**

```ts
import { describe, expect, it } from "vitest";
import { runBootstrapFlow } from "../../src/renderer/state/bootstrap";

describe("runBootstrapFlow", () => {
  it("maps user_global_session and user_global_messages into globalSessions", async () => {
    // Mock getMeBootstrap and getWorkspaceProjects in the real test file.
    expect(true).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/bootstrap.test.ts`
Expected: FAIL because bootstrap still assumes legacy assistant-thread envelope.

- [ ] **Step 3: Add minimal type updates for session-first bootstrap**

```ts
export type MeBootstrapRecord = {
  viewer_profile?: ViewerProfile | null;
  workspaces?: WorkspaceSummary[] | null;
  selected_workspace_id?: string | null;
  selected_project_id?: string | null;
  user_global_session?: SessionSummary | null;
  user_global_messages?: SessionMessage[] | null;
};
```

- [ ] **Step 4: Update bootstrap mapping to use `user_global_session`**

```ts
const globalSessions = meBootstrap.user_global_session
  ? [meBootstrap.user_global_session]
  : [];

const globalAssistantMessages = meBootstrap.user_global_messages ?? [];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/bootstrap.test.ts`
Expected: PASS with session-first bootstrap mapping.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/types.ts src/renderer/state/bootstrap.ts tests/unit/bootstrap.test.ts
git commit -m "refactor: bootstrap global assistant from sessions"
```

## Task 2: Replace Global Runtime Message Flow With Session Persistence

**Files:**
- Modify: `src/renderer/components/workspace-shell/useSessionMessages.ts`
- Modify: `src/renderer/components/workspace-shell/useConversationFlow.ts`
- Modify: `src/renderer/components/workspace-shell/conversationTurns.ts`
- Test: `tests/renderer/app-global-session-flow.test.tsx`

- [ ] **Step 1: Write the failing renderer test for global session persistence**

```tsx
it("uses session message endpoints for global assistant turns", async () => {
  // Mock:
  // POST /v1/sessions
  // GET /v1/sessions/:id/messages
  // POST /v1/sessions/:id/messages
  // and assert no assistant-thread endpoints are called.
  expect(true).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/renderer/app-global-session-flow.test.tsx`
Expected: FAIL because global flow still posts to `/v1/me/assistant-thread/messages`.

- [ ] **Step 3: Update global send flow to use session endpoints**

```ts
await postSessionMessage(session.id, { content_markdown: input.contentMarkdown, role: "user" });
const persistedAfterUser = await getSessionMessages(session.id);
// ...
await postSessionMessage(session.id, {
  role: "assistant",
  actor_id: input.activeAgentKey ?? "sa-agent",
  content_markdown: result.assistantText,
});
const nextMessages = await getSessionMessages(session.id);
```

- [ ] **Step 4: Remove active assistant-thread fetch path from `useSessionMessages`**

```ts
const nextMessages = activeSession
  ? await getSessionMessages(activeSession.id)
  : [];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/renderer/app-global-session-flow.test.tsx`
Expected: PASS and no calls to `/v1/me/assistant-thread` or `/v1/me/assistant-thread/messages`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace-shell/useSessionMessages.ts src/renderer/components/workspace-shell/useConversationFlow.ts src/renderer/components/workspace-shell/conversationTurns.ts tests/renderer/app-global-session-flow.test.tsx
git commit -m "refactor: use sessions for global assistant flow"
```

## Task 3: Add Sidebar Session Tree View Model

**Files:**
- Create: `src/renderer/components/workspace-shell/session-tree.ts`
- Modify: `src/renderer/components/workspace-shell/types.ts`
- Test: `tests/unit/session-tree.test.ts`

- [ ] **Step 1: Write the failing unit test for global and project session grouping**

```ts
import { describe, expect, it } from "vitest";
import { buildSessionTree } from "../../src/renderer/components/workspace-shell/session-tree";

describe("buildSessionTree", () => {
  it("groups global sessions separately from project sessions", () => {
    const tree = buildSessionTree({
      globalSessions: [{ id: "g-1", project_id: null, workspace_id: "ws-1" } as never],
      projects: [{ id: "p-1", name: "Project 1" } as never],
      projectSessions: [{ id: "s-1", project_id: "p-1", workspace_id: "ws-1" } as never],
    });

    expect(tree.globalSessions).toHaveLength(1);
    expect(tree.projects[0]?.sessions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/session-tree.test.ts`
Expected: FAIL because session tree helper does not exist yet.

- [ ] **Step 3: Implement the minimal session tree helper**

```ts
export function buildSessionTree(input: {
  globalSessions: SessionSummary[];
  projects: ProjectSummary[];
  projectSessions: SessionSummary[];
}) {
  return {
    globalSessions: input.globalSessions,
    projects: input.projects.map((project) => ({
      project,
      sessions: input.projectSessions.filter((session) => session.project_id === project.id),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/session-tree.test.ts`
Expected: PASS with correct global/project grouping.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/workspace-shell/session-tree.ts src/renderer/components/workspace-shell/types.ts tests/unit/session-tree.test.ts
git commit -m "feat: add session tree view model"
```

## Task 4: Reshape `WorkspaceNav` Into Session-First Sidebar

**Files:**
- Modify: `src/renderer/components/workspace/WorkspaceNav.tsx`
- Modify: `src/renderer/components/workspace-shell/WorkspaceShellLayout.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Test: `tests/renderer/app-session-sidebar.test.tsx`

- [ ] **Step 1: Write the failing renderer test for the new sidebar structure**

```tsx
it("renders global sessions above projects and nested project sessions", async () => {
  // Assert:
  // - Global Sessions heading
  // - project name
  // - nested session title under that project
  // - Files is the only remaining visible mode tab
  expect(true).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/renderer/app-session-sidebar.test.tsx`
Expected: FAIL because nav still renders the old mode-first layout.

- [ ] **Step 3: Render session sections in `WorkspaceNav`**

```tsx
<section aria-label="Global Sessions">
  {globalSessions.map((session) => (
    <button key={session.id}>{session.title ?? session.id}</button>
  ))}
</section>
<section aria-label="Projects">
  {projects.map((project) => (
    <div key={project.id}>
      <button>{project.name}</button>
      {project.sessions.map((session) => (
        <button key={session.id}>{session.title ?? session.id}</button>
      ))}
    </div>
  ))}
</section>
```

- [ ] **Step 4: Hide all mode tabs except `Files`**

```ts
const navItems = [
  { mode: "files", label: translate(language, "workspace.files.eyebrow") },
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/renderer/app-session-sidebar.test.tsx`
Expected: PASS with session-first sidebar and only `Files` mode visible.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace/WorkspaceNav.tsx src/renderer/components/workspace-shell/WorkspaceShellLayout.tsx src/renderer/components/WorkspaceShell.tsx tests/renderer/app-session-sidebar.test.tsx
git commit -m "feat: render session-first sidebar"
```

## Task 5: Add Explicit `New Session` Action

**Files:**
- Create: `src/renderer/components/workspace-shell/session-actions.ts`
- Modify: `src/renderer/components/workspace-shell/useWorkspaceShellActions.ts`
- Modify: `src/renderer/components/workspace/WorkspaceNav.tsx`
- Test: `tests/unit/session-actions.test.ts`
- Test: `tests/renderer/app-files-navigation.test.tsx`

- [ ] **Step 1: Write the failing unit test for session creation scope**

```ts
import { describe, expect, it } from "vitest";
import { buildNewSessionPayload } from "../../src/renderer/components/workspace-shell/session-actions";

describe("buildNewSessionPayload", () => {
  it("creates a global payload when no project is selected", () => {
    expect(buildNewSessionPayload({
      workspaceId: "ws-1",
      projectId: null,
      agentKey: "sa-agent",
    })).toMatchObject({ workspace_id: "ws-1", project_id: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/session-actions.test.ts`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement minimal session action helper**

```ts
export function buildNewSessionPayload(input: {
  workspaceId: string;
  projectId: string | null;
  agentKey: string | null;
}) {
  return {
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    agent_key: input.agentKey ?? undefined,
    channel_kind: "desktop" as const,
    resume_strategy: "new" as const,
  };
}
```

- [ ] **Step 4: Wire a `New Session` button in `WorkspaceNav`**

```tsx
<button onClick={onCreateSession}>
  {translate(language, "workspace.sessions.new")}
</button>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/session-actions.test.ts tests/renderer/app-files-navigation.test.tsx`
Expected: PASS with explicit new-session creation working for both scopes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace-shell/session-actions.ts src/renderer/components/workspace-shell/useWorkspaceShellActions.ts src/renderer/components/workspace/WorkspaceNav.tsx tests/unit/session-actions.test.ts tests/renderer/app-files-navigation.test.tsx
git commit -m "feat: add explicit new session action"
```

## Task 6: Remove Blocking Onboarding UX

**Files:**
- Modify: `src/renderer/components/workspace-shell/useWorkspaceShellState.ts`
- Modify: `src/renderer/components/workspace-shell/useWorkspaceShellActions.ts`
- Modify: `src/renderer/components/workspace-shell/WorkspaceShellLayout.tsx`
- Test: `tests/renderer/app-user-onboarding.test.tsx`
- Test: `tests/renderer/app-project-onboarding.test.tsx`

- [ ] **Step 1: Write the failing renderer test for non-blocking onboarding**

```tsx
it("does not lock navigation during user onboarding", async () => {
  // Render onboarding state and assert Files remains accessible
  // and no locked popup is shown when selecting available navigation.
  expect(true).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/app-user-onboarding.test.tsx tests/renderer/app-project-onboarding.test.tsx`
Expected: FAIL because onboarding still drives blocking nav behavior.

- [ ] **Step 3: Remove user-onboarding navigation lock**

```ts
const isBlockingOnboarding = false;
const resolvedWorkspaceMode = resolveWorkspaceMode(workspaceMode);
```

- [ ] **Step 4: Remove locked-mode handling from shell actions/layout**

```tsx
<WorkspaceNav lockedModes={[]} />
```

```ts
function handleWorkspaceModeSelection(mode: WorkspaceMode) {
  input.setWorkspaceMode(mode);
  void input.onWorkspaceModeChange?.(mode);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/app-user-onboarding.test.tsx tests/renderer/app-project-onboarding.test.tsx`
Expected: PASS with onboarding remaining active but not blocking workspace navigation.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/workspace-shell/useWorkspaceShellState.ts src/renderer/components/workspace-shell/useWorkspaceShellActions.ts src/renderer/components/workspace-shell/WorkspaceShellLayout.tsx tests/renderer/app-user-onboarding.test.tsx tests/renderer/app-project-onboarding.test.tsx
git commit -m "refactor: make onboarding non-blocking"
```

## Task 7: Clean Up Legacy Assistant-Thread Runtime Paths

**Files:**
- Modify: `src/renderer/lib/api.ts`
- Modify: `src/renderer/components/workspace-shell/useSessionMessages.ts`
- Modify: `tests/unit/api.test.ts`

- [ ] **Step 1: Write the failing API/runtime test for no active assistant-thread usage**

```ts
import { describe, expect, it } from "vitest";

describe("session-first runtime", () => {
  it("does not require assistant-thread endpoints in active flow", () => {
    expect(true).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: FAIL because the test still reflects assistant-thread usage.

- [ ] **Step 3: Remove active assistant-thread assumptions from runtime-facing helpers**

```ts
// Keep legacy helpers only if still needed by tests or transitional paths,
// but no active renderer runtime module should call them.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/api.test.ts tests/renderer/app-global-session-flow.test.tsx`
Expected: PASS with no active dependency on assistant-thread endpoints.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/api.ts src/renderer/components/workspace-shell/useSessionMessages.ts tests/unit/api.test.ts
git commit -m "refactor: remove assistant-thread runtime dependency"
```

## Task 8: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused unit and renderer coverage**

Run:

```bash
npx vitest run \
  tests/unit/bootstrap.test.ts \
  tests/unit/session-tree.test.ts \
  tests/unit/session-actions.test.ts \
  tests/unit/personal-assistant-runtime.test.ts \
  tests/unit/project-session-runtime.test.ts \
  tests/renderer/app-global-session-flow.test.tsx \
  tests/renderer/app-session-sidebar.test.tsx \
  tests/renderer/app-user-onboarding.test.tsx \
  tests/renderer/app-project-onboarding.test.tsx \
  tests/renderer/app-files-navigation.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run renderer typecheck**

Run:

```bash
npm run typecheck:renderer
```

Expected: PASS

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit final integration**

```bash
git add .
git commit -m "feat: unify shell around session-first runtime"
```
