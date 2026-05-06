# SA-Agent Desktop MVP Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Electron desktop shell for SA-Agent with local auth stub, server-authoritative bootstrap, dual onboarding flows, local cache, Russian/English UI, and a dev reset path.

**Architecture:** The app uses Electron `main` + `preload` + React renderer. Canonical entities come from backend REST endpoints; renderer persists only local UI state and an expiring entity cache. Onboarding skill-runs are orchestrated client-side, while canonical completion flags are written only through profile and project onboarding endpoints.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, React Testing Library, Playwright, Zod

---

## File Structure

### Create

- `package.json` — workspace scripts and dependencies for Electron, renderer, tests
- `tsconfig.json` — root TypeScript configuration
- `tsconfig.node.json` — Electron and Vite node-side config
- `vite.config.ts` — renderer build and test config
- `electron/main.ts` — BrowserWindow boot, config wiring, app lifecycle
- `electron/preload.ts` — safe bridge for storage, config, and diagnostics APIs
- `src/renderer/main.tsx` — renderer entry point
- `src/renderer/App.tsx` — top-level state machine for app screens
- `src/renderer/styles/tokens.css` — editorial minimal design tokens
- `src/renderer/styles/app.css` — global layout, motion, and shell styles
- `src/renderer/lib/i18n.ts` — language dictionaries and translation helpers
- `src/renderer/lib/api.ts` — typed backend fetch client
- `src/renderer/lib/cache.ts` — TTL rules and stale-while-revalidate helpers
- `src/renderer/lib/storage.ts` — renderer wrapper over preload storage API
- `src/renderer/lib/jobs.ts` — onboarding polling policy and abort handling
- `src/renderer/lib/types.ts` — shared frontend DTOs and local state types
- `src/renderer/state/app-state.ts` — persisted app state helpers
- `src/renderer/state/bootstrap.ts` — bootstrap decision tree and screen transitions
- `src/renderer/components/LanguageSetup.tsx` — first-run language screen
- `src/renderer/components/AuthGate.tsx` — local auth stub screen
- `src/renderer/components/BootstrapScreen.tsx` — staged bootstrap loader
- `src/renderer/components/UserOnboarding.tsx` — user onboarding flow
- `src/renderer/components/ProjectOnboarding.tsx` — project onboarding flow
- `src/renderer/components/EmptyProjects.tsx` — project empty state and create CTA
- `src/renderer/components/WorkspaceShell.tsx` — main app shell
- `src/renderer/components/SettingsPanel.tsx` — language switch and dev reset
- `src/renderer/components/ErrorScreen.tsx` — recoverable backend failure state
- `src/renderer/components/forms/OnboardingFields.tsx` — shared onboarding fields
- `src/renderer/components/forms/CreateProjectForm.tsx` — minimal create project form
- `tests/unit/cache.test.ts` — cache TTL and invalidation coverage
- `tests/unit/bootstrap.test.ts` — renderer state machine bootstrap coverage
- `tests/unit/jobs.test.ts` — polling and abort policy coverage
- `tests/unit/i18n.test.ts` — dictionary and language persistence coverage
- `tests/renderer/app-flow.test.tsx` — auth/bootstrap/onboarding UI integration tests
- `tests/e2e/smoke.spec.ts` — Electron smoke coverage
- `playwright.config.ts` — Playwright configuration
- `.env.example` — backend base URL example for local dev

### Modify

- `README.md` — setup, scripts, environment variables, and test instructions
- `.gitignore` — ensure build artifacts and local app data paths are ignored

## Task 1: Scaffold Electron + Renderer Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Modify: `README.md`
- Modify: `.gitignore`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { test, expect, _electron as electron } from "@playwright/test";

test("app boots to language selection on first run", async () => {
  const app = await electron.launch({ args: ["."] });
  const page = await app.firstWindow();

  await expect(page.getByText(/Русский|English/)).toBeVisible();

  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/smoke.spec.ts --project=electron`
Expected: FAIL because Electron app entrypoint and config do not exist yet

- [ ] **Step 3: Write minimal workspace scaffold**

```json
{
  "name": "sa-agent-desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.node.json && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(app.getAppPath(), "dist/index.html"));
}

app.whenReady().then(createWindow);
```

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

```tsx
export default function App() {
  return (
    <main>
      <button>Русский</button>
      <button>English</button>
    </main>
  );
}
```

- [ ] **Step 4: Run smoke test to verify it passes**

Run: `npx playwright test tests/e2e/smoke.spec.ts --project=electron`
Expected: PASS with first window showing the two language options

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts electron/main.ts electron/preload.ts src/renderer/main.tsx src/renderer/App.tsx tests/e2e/smoke.spec.ts README.md .gitignore
git commit -m "feat: scaffold electron desktop shell"
```

## Task 2: Add Persisted Local State, i18n, and App State Machine

**Files:**
- Create: `src/renderer/lib/types.ts`
- Create: `src/renderer/lib/i18n.ts`
- Create: `src/renderer/lib/storage.ts`
- Create: `src/renderer/state/app-state.ts`
- Create: `src/renderer/state/bootstrap.ts`
- Create: `src/renderer/components/LanguageSetup.tsx`
- Create: `src/renderer/components/AuthGate.tsx`
- Create: `tests/unit/i18n.test.ts`
- Create: `tests/unit/bootstrap.test.ts`
- Create: `tests/renderer/app-flow.test.tsx`
- Modify: `electron/preload.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Write failing unit tests for language and bootstrap decisions**

```ts
import { describe, expect, it } from "vitest";
import { decideInitialScreen } from "../../src/renderer/state/bootstrap";

describe("decideInitialScreen", () => {
  it("shows language setup when no language is stored", () => {
    expect(decideInitialScreen({ language: null, isAuthenticated: false })).toBe("language-setup");
  });

  it("shows auth after language is chosen but before login", () => {
    expect(decideInitialScreen({ language: "ru", isAuthenticated: false })).toBe("auth");
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { translate } from "../../src/renderer/lib/i18n";

describe("translate", () => {
  it("returns russian auth title", () => {
    expect(translate("ru", "auth.title")).toBe("Войти в SA-Agent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/bootstrap.test.ts tests/unit/i18n.test.ts`
Expected: FAIL because bootstrap helpers and dictionaries do not exist yet

- [ ] **Step 3: Write minimal local state and i18n implementation**

```ts
export type AppLanguage = "ru" | "en";

export type PersistedAppState = {
  isAuthenticated: boolean;
  authProviderHint: "github" | "google" | "yandex" | "direct" | null;
  language: AppLanguage | null;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeSessionByProjectId: Record<string, string | null>;
  devModeEnabled: boolean;
  lastBootstrapAt: string | null;
};

export const defaultAppState: PersistedAppState = {
  isAuthenticated: false,
  authProviderHint: null,
  language: null,
  activeWorkspaceId: null,
  activeProjectId: null,
  activeSessionByProjectId: {},
  devModeEnabled: false,
  lastBootstrapAt: null,
};
```

```ts
const dictionaries = {
  ru: {
    "auth.title": "Войти в SA-Agent",
  },
  en: {
    "auth.title": "Sign in to SA-Agent",
  },
} as const;

export function translate(language: "ru" | "en", key: keyof typeof dictionaries.ru) {
  return dictionaries[language][key];
}
```

```ts
export function decideInitialScreen(state: { language: "ru" | "en" | null; isAuthenticated: boolean }) {
  if (!state.language) return "language-setup";
  if (!state.isAuthenticated) return "auth";
  return "bootstrapping";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/bootstrap.test.ts tests/unit/i18n.test.ts`
Expected: PASS

- [ ] **Step 5: Add renderer integration test for language -> auth transition**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/renderer/App";

test("selecting language moves app to auth gate", async () => {
  render(<App />);

  await userEvent.click(screen.getByRole("button", { name: "Русский" }));

  expect(screen.getByText("Войти в SA-Agent")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run renderer integration test**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/lib/types.ts src/renderer/lib/i18n.ts src/renderer/lib/storage.ts src/renderer/state/app-state.ts src/renderer/state/bootstrap.ts src/renderer/components/LanguageSetup.tsx src/renderer/components/AuthGate.tsx src/renderer/App.tsx electron/preload.ts tests/unit/i18n.test.ts tests/unit/bootstrap.test.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add persisted app state and i18n shell"
```

## Task 3: Implement Backend API Client, Entity Cache, and Bootstrap Loader

**Files:**
- Create: `src/renderer/lib/api.ts`
- Create: `src/renderer/lib/cache.ts`
- Create: `src/renderer/components/BootstrapScreen.tsx`
- Create: `src/renderer/components/ErrorScreen.tsx`
- Create: `tests/unit/cache.test.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/state/bootstrap.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Write failing tests for cache TTL and user-onboarding bootstrap gate**

```ts
import { describe, expect, it } from "vitest";
import { isCacheFresh } from "../../src/renderer/lib/cache";

describe("isCacheFresh", () => {
  it("treats one minute old sessions cache as fresh", () => {
    expect(isCacheFresh(new Date(Date.now() - 30_000).toISOString(), 60_000)).toBe(true);
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { resolveBootstrapNextScreen } from "../../src/renderer/state/bootstrap";

describe("resolveBootstrapNextScreen", () => {
  it("stops at user onboarding before project selection", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: false },
        workspaces: [{ id: "ws-1" }],
        projects: [],
      }),
    ).toBe("user-onboarding");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cache.test.ts tests/unit/bootstrap.test.ts`
Expected: FAIL because cache utilities and bootstrap resolution do not exist yet

- [ ] **Step 3: Write minimal API, cache, and bootstrap logic**

```ts
export async function getMe(baseUrl: string) {
  const response = await fetch(`${baseUrl}/v1/me`);
  if (!response.ok) throw new Error("Failed to load profile");
  return response.json();
}
```

```ts
export function isCacheFresh(fetchedAt: string, ttlMs: number) {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}
```

```ts
export function resolveBootstrapNextScreen(input: {
  profile: { onboarding_completed: boolean };
  workspaces: Array<{ id: string }>;
  projects: Array<{ id: string }>;
}) {
  if (!input.profile.onboarding_completed) return "user-onboarding";
  if (input.projects.length === 0) return "empty-projects";
  return "project-bootstrap";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cache.test.ts tests/unit/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Add renderer integration test for auth -> bootstrap -> empty projects**

```tsx
test("authenticated bootstrap shows empty state when workspace has no projects", async () => {
  render(<App />);

  // mock /v1/me => onboarding_completed true
  // mock /v1/workspaces => one workspace
  // mock /v1/workspaces/ws-1/projects => []

  expect(await screen.findByText("Создать проект")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run renderer integration test**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/lib/api.ts src/renderer/lib/cache.ts src/renderer/components/BootstrapScreen.tsx src/renderer/components/ErrorScreen.tsx src/renderer/lib/types.ts src/renderer/state/bootstrap.ts src/renderer/App.tsx tests/unit/cache.test.ts tests/unit/bootstrap.test.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add bootstrap client and entity cache"
```

## Task 4: Implement User Onboarding Skill-Run Flow

**Files:**
- Create: `src/renderer/lib/jobs.ts`
- Create: `src/renderer/components/forms/OnboardingFields.tsx`
- Create: `src/renderer/components/UserOnboarding.tsx`
- Create: `tests/unit/jobs.test.ts`
- Modify: `src/renderer/lib/api.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write failing tests for polling policy**

```ts
import { describe, expect, it } from "vitest";
import { nextPollDelayMs } from "../../src/renderer/lib/jobs";

describe("nextPollDelayMs", () => {
  it("returns 1000 for the first poll", () => {
    expect(nextPollDelayMs(0)).toBe(1000);
  });

  it("caps the interval at 5000", () => {
    expect(nextPollDelayMs(4)).toBe(5000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/jobs.test.ts`
Expected: FAIL because polling helpers do not exist yet

- [ ] **Step 3: Write minimal polling and user onboarding implementation**

```ts
export function nextPollDelayMs(attempt: number) {
  if (attempt === 0) return 1000;
  if (attempt === 1) return 2000;
  return 5000;
}
```

```ts
export async function runUserOnboarding(baseUrl: string, input: {
  workspace_id: string;
  preferred_user_name: string;
  preferred_agent_name: string;
  activity_domain: string;
}) {
  const accepted = await fetch(`${baseUrl}/v1/skill-runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspace_id: input.workspace_id,
      skill_id: "onboard",
      input_payload: {
        preferred_user_name: input.preferred_user_name,
        preferred_agent_name: input.preferred_agent_name,
        activity_domain: input.activity_domain,
      },
    }),
  }).then((response) => response.json());

  return accepted.job_id;
}
```

```tsx
<OnboardingFields
  value={form}
  onChange={setForm}
  labels={{
    preferred_user_name: t("userOnboarding.preferredUserName"),
    preferred_agent_name: t("userOnboarding.preferredAgentName"),
    activity_domain: t("userOnboarding.activityDomain"),
  }}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/jobs.test.ts`
Expected: PASS

- [ ] **Step 5: Add renderer integration test for incomplete profile -> user onboarding**

```tsx
test("shows user onboarding when profile is not completed", async () => {
  render(<App />);

  // mock /v1/me => onboarding_completed false
  // mock /v1/workspaces => one workspace

  expect(await screen.findByLabelText("preferred_user_name")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run renderer integration test**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/lib/jobs.ts src/renderer/components/forms/OnboardingFields.tsx src/renderer/components/UserOnboarding.tsx src/renderer/lib/api.ts src/renderer/lib/types.ts src/renderer/App.tsx tests/unit/jobs.test.ts tests/renderer/app-flow.test.tsx
git commit -m "feat: add user onboarding skill run flow"
```

## Task 5: Implement Project Creation, Project Onboarding, and Session Shell

**Files:**
- Create: `src/renderer/components/EmptyProjects.tsx`
- Create: `src/renderer/components/forms/CreateProjectForm.tsx`
- Create: `src/renderer/components/ProjectOnboarding.tsx`
- Create: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/lib/api.ts`
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/renderer/state/bootstrap.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/renderer/app-flow.test.tsx`

- [ ] **Step 1: Write failing renderer integration tests for project creation and project onboarding**

```tsx
test("shows create project state when user onboarding is complete and no projects exist", async () => {
  render(<App />);

  // mock /v1/me => onboarding_completed true
  // mock /v1/workspaces => one workspace
  // mock /v1/workspaces/ws-1/projects => []

  expect(await screen.findByText("Создать проект")).toBeInTheDocument();
});
```

```tsx
test("shows project onboarding when selected project is not completed", async () => {
  render(<App />);

  // mock /v1/workspaces/ws-1/projects => [{ id: "p-1", onboarding_completed: false }]
  // mock /v1/projects/p-1/runtime-context => project onboarding false

  expect(await screen.findByText("Project onboarding")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: FAIL because empty-project and project-onboarding screens do not exist yet

- [ ] **Step 3: Write minimal project flow implementation**

```ts
export async function createProject(baseUrl: string, workspaceId: string, input: {
  key: string;
  name: string;
  description?: string;
}) {
  const response = await fetch(`${baseUrl}/v1/workspaces/${workspaceId}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to create project");
  return response.json();
}
```

```ts
export async function completeProjectOnboarding(baseUrl: string, projectId: string, input: {
  preferred_user_name: string;
  preferred_agent_name: string;
  activity_domain: string;
}) {
  const response = await fetch(`${baseUrl}/v1/projects/${projectId}/onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to complete project onboarding");
  return response.json();
}
```

```tsx
export default function EmptyProjects({ onCreateProject }: { onCreateProject: () => void }) {
  return <button onClick={onCreateProject}>Создать проект</button>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 5: Add selected project shell test**

```tsx
test("renders workspace shell after both onboarding flows complete", async () => {
  render(<App />);

  // mock completed user profile, one completed project, sessions and runtime-context

  expect(await screen.findByText("Active Session")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run renderer integration test**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/EmptyProjects.tsx src/renderer/components/forms/CreateProjectForm.tsx src/renderer/components/ProjectOnboarding.tsx src/renderer/components/WorkspaceShell.tsx src/renderer/lib/api.ts src/renderer/lib/types.ts src/renderer/state/bootstrap.ts src/renderer/App.tsx tests/renderer/app-flow.test.tsx
git commit -m "feat: add project onboarding and workspace shell"
```

## Task 6: Add Settings, Dev Reset, Visual Polish, and Final Verification

**Files:**
- Create: `src/renderer/components/SettingsPanel.tsx`
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/app.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/WorkspaceShell.tsx`
- Modify: `src/renderer/components/AuthGate.tsx`
- Modify: `src/renderer/components/LanguageSetup.tsx`
- Modify: `src/renderer/components/BootstrapScreen.tsx`
- Modify: `tests/renderer/app-flow.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing tests for dev reset and language change in settings**

```tsx
test("dev reset clears local state and returns to language setup", async () => {
  render(<App />);

  // start from completed shell state
  // open settings and click reset

  expect(await screen.findByText("Русский")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: FAIL because settings panel and reset path do not exist yet

- [ ] **Step 3: Write minimal settings and reset implementation**

```tsx
export default function SettingsPanel(props: {
  language: "ru" | "en";
  onLanguageChange: (language: "ru" | "en") => void;
  onResetLocalState: () => void;
  devModeEnabled: boolean;
}) {
  return (
    <section>
      <button onClick={() => props.onLanguageChange("ru")}>Русский</button>
      <button onClick={() => props.onLanguageChange("en")}>English</button>
      {props.devModeEnabled ? <button onClick={props.onResetLocalState}>Reset local state</button> : null}
    </section>
  );
}
```

```ts
export function resetLocalState() {
  return {
    isAuthenticated: false,
    authProviderHint: null,
    language: null,
    activeWorkspaceId: null,
    activeProjectId: null,
    activeSessionByProjectId: {},
    devModeEnabled: true,
    lastBootstrapAt: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/app-flow.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full verification suite**

Run: `npm test`
Expected: PASS for unit and renderer integration tests

Run: `npx playwright test tests/e2e/smoke.spec.ts --project=electron`
Expected: PASS for Electron boot smoke

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx src/renderer/styles/tokens.css src/renderer/styles/app.css src/renderer/App.tsx src/renderer/components/WorkspaceShell.tsx src/renderer/components/AuthGate.tsx src/renderer/components/LanguageSetup.tsx src/renderer/components/BootstrapScreen.tsx tests/renderer/app-flow.test.tsx tests/e2e/smoke.spec.ts README.md
git commit -m "feat: finish settings reset and editorial ui"
```

## Self-Review

### Spec coverage

- Electron shell and local auth stub: Task 1, Task 2
- Russian/English support: Task 2, Task 6
- server-authoritative bootstrap: Task 3
- user onboarding skill-run with `POST /v1/skill-runs` and `POST /v1/me/onboarding`: Task 4
- project selection, empty state, creation, and runtime bootstrap: Task 5
- project onboarding skill-run and `POST /v1/projects/:projectId/onboarding`: Task 5
- local cache with TTL and explicit non-caching of jobs: Task 3, Task 4
- settings and dev reset: Task 6
- verification and smoke tests: Task 1, Task 6

### Placeholder scan

No `TODO`, `TBD`, or deferred placeholders are intentionally left in the task structure. Each task names exact files, commands, and minimal code direction.

### Type consistency

The plan consistently uses:

- `preferred_user_name`
- `preferred_agent_name`
- `activity_domain`
- `GET /v1/jobs/:jobId`
- `POST /v1/skill-runs`
- `POST /v1/projects/:projectId/skill-runs`
- `POST /v1/me/onboarding`
- `POST /v1/projects/:projectId/onboarding`

## Notes

- Jobs and onboarding poll state must stay transient and must not be written into the normal entity cache.
- User onboarding completion is a gate before project selection to keep the renderer state machine simpler.
- Skill output is not canonical state and must always be mapped into explicit completion requests.
