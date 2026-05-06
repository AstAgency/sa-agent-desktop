# SA-Agent Desktop MVP Shell Design

## Goal

Build a minimal Electron desktop application for SA-Agent that:

- uses the current backend contracts as the canonical source of truth;
- presents a polished `Editorial Minimal` UI;
- supports Russian as the default language and English as an optional language;
- stores only device-local UI/bootstrap state on the client;
- runs two-stage onboarding:
  - user onboarding via global skill-run `onboard`;
  - project onboarding via project skill-run `project-onboard`;
- exposes a dev reset path for clearing local state.

The MVP is a desktop shell, not the final production collaboration client. Authentication is intentionally stubbed in the UI for now.

## Scope

In scope:

- Electron desktop app scaffold;
- first-run language selection;
- login stub screen with `GitHub`, `Google`, `Yandex` buttons;
- workspace bootstrap from backend after local login;
- project list in sidebar inside a single active workspace;
- empty-project state with project creation;
- sessions listed per selected project;
- user onboarding flow;
- project onboarding flow;
- local persistent state and expiring cache;
- settings screen with language switch and dev reset.

Out of scope:

- real OAuth or SSO implementation;
- multi-workspace picker UI;
- message composer and full chat runtime;
- realtime websocket integration;
- offline-first editing;
- billing or entitlement UX.

## Product Direction

### Visual direction

Use `Editorial Minimal`:

- warm light surfaces with dark graphite accents;
- strong typography and quiet spacing;
- narrow utility rail plus a focused project column;
- intentional loading states instead of generic spinners;
- restrained motion and premium-feeling transitions.

### Information architecture

The desktop app has these top-level renderer states:

- `language-setup`
- `auth`
- `bootstrapping`
- `user-onboarding`
- `empty-projects`
- `project-onboarding`
- `workspace-shell`
- `settings`
- `recoverable-error`

## Canonical Backend Contract

The desktop client should use these backend surfaces as currently implemented in `sa-agent-backend`.

### Profile and workspaces

- `GET /v1/me`
- `POST /v1/me/onboarding`
- `GET /v1/workspaces`
- `GET /v1/workspaces/:workspaceId/projects`
- `POST /v1/workspaces/:workspaceId/projects`

### Project and runtime

- `POST /v1/projects/:projectId/onboarding`
- `GET /v1/projects/:projectId/sessions`
- `POST /v1/projects/:projectId/sessions`
- `GET /v1/projects/:projectId/runtime-context`

### Skills and jobs

- `POST /v1/skill-runs`
- `POST /v1/projects/:projectId/skill-runs`
- `GET /v1/skill-runs/:skillRunId`
- `GET /v1/jobs/:jobId`

## Bootstrap And Onboarding Flow

### First launch

1. App opens on language selection.
2. User chooses `ru` or `en`.
3. Language is written to local state.
4. App moves to auth gate.

### Login stub

The auth screen shows:

- one primary `Войти` or `Sign in` button;
- three provider buttons: `GitHub`, `Google`, `Yandex`.

All four actions currently do the same thing:

- set a local `isAuthenticated = true`;
- record an optional `authProviderHint`;
- start bootstrap.

No credential entry is required in MVP.

### Bootstrap

After local login:

1. `GET /v1/me`
2. `GET /v1/workspaces`
3. select the first workspace from the returned list
4. `GET /v1/workspaces/:workspaceId/projects`

Rules:

- if the workspace list is empty, show a recoverable backend error state because product assumptions say backend auto-creates a workspace;
- the selected workspace is cached locally but the app still revalidates it on next bootstrap;
- no workspace chooser is shown in MVP.

### User onboarding

If `profile.onboarding_completed === false`:

1. open user onboarding flow;
2. collect onboarding input;
3. call `POST /v1/skill-runs` with:
   - `workspace_id`
   - `skill_id = "onboard"`
   - `input_payload`
4. poll `GET /v1/jobs/:jobId` until the job reaches terminal success;
5. call `POST /v1/me/onboarding` with:
   - `preferred_user_name`
   - `preferred_agent_name`
   - `activity_domain`
6. invalidate `me`.

Notes:

- the onboarding form explicitly collects:
  - `preferred_user_name`
  - `preferred_agent_name`
  - `activity_domain`
- user onboarding is blocked before the main project shell is considered ready;
- if user onboarding is still incomplete, project selection does not need to happen yet;
- only after user onboarding is complete does the renderer proceed to project selection;
- polling is client-side with retry/backoff;
- if the skill-run fails, keep the user in onboarding with retry.

### Project selection

After user onboarding check:

- if projects are empty, show empty state with `Create project`;
- if projects exist, select the first project by default unless a previously selected project id still exists in the list.

Project creation flow:

1. user opens create-project form from empty state or sidebar;
2. client calls `POST /v1/workspaces/:workspaceId/projects`;
3. client invalidates projects;
4. client selects the new project;
5. client loads sessions and runtime context.

### Project runtime bootstrap

After a project is available:

1. client selects a project;
2. client calls `GET /v1/projects/:projectId/sessions`;
3. client calls `GET /v1/projects/:projectId/runtime-context`.

### Project onboarding

If `project.onboarding_completed === false`:

1. open project onboarding flow;
2. collect project-specific onboarding input;
3. call `POST /v1/projects/:projectId/skill-runs` with:
   - `skill_id = "project-onboard"`
   - `input_payload`
4. poll `GET /v1/jobs/:jobId` until the job reaches terminal success;
5. call `POST /v1/projects/:projectId/onboarding` with:
   - `preferred_user_name`
   - `preferred_agent_name`
   - `activity_domain`
6. invalidate:
   - selected `project`
   - `runtime-context`

Notes:

- the project onboarding form explicitly collects:
  - `preferred_user_name`
  - `preferred_agent_name`
  - `activity_domain`

### Ready state

If both onboarding flags are complete:

1. render the normal project shell;
2. keep sessions as a separate project-level flow;
3. create new sessions only through explicit user action via `POST /v1/projects/:projectId/sessions`.

## Jobs And Polling

### Terminal job statuses

The client treats these job statuses as terminal for onboarding flows:

- `completed`
- `failed`

### Polling policy

For both user onboarding and project onboarding:

- first poll after 1 second;
- next poll after 2 seconds;
- subsequent polls use exponential backoff capped at 5 seconds;
- client timeout or abort must stop polling and return the user to a recoverable retry state;
- polling must also stop immediately if the user leaves the onboarding screen or the request is explicitly aborted.

### Mapping responsibility

- skill output is not canonical state by itself;
- the client extracts the required fields from the skill result;
- canonical state is persisted only through:
  - `POST /v1/me/onboarding`
  - `POST /v1/projects/:projectId/onboarding`

## UI Specification

### Language setup

- full-screen welcome surface;
- two language cards: Russian first, English second;
- concise explanation that the language can be changed later in settings.

### Auth gate

- centered composition;
- single dominant action button;
- social provider row below;
- short explanatory copy that sign-in is currently simplified.

### Bootstrapping screen

Use a staged loader rather than an empty spinner.

Example phases:

- `Проверяем профиль`
- `Загружаем workspace`
- `Собираем проекты`
- `Восстанавливаем контекст`

English equivalents must exist in the same dictionary namespace.

### Workspace shell

Layout:

- left utility rail:
  - brand mark;
  - active workspace marker;
  - settings button;
  - sync or cache status indicator.
- project column:
  - project list;
  - create-project CTA;
  - selected state styling;
  - lightweight project metadata.
- main content area:
  - project heading;
  - onboarding or readiness summary;
  - runtime-context overview;
  - session list and session creation CTA.

### Empty projects state

- show a central editorial empty state;
- include one strong CTA to create a project;
- explain that projects are the unit that owns sessions and onboarding context.

### User onboarding screen

- guided flow, not a generic settings form;
- collect the exact payload required for `onboard`;
- show progress and current step;
- on success, transition back into bootstrap completion.

### Project onboarding screen

- similar guided structure but framed as project setup;
- project-specific copy and completion messaging;
- keep user in project context while blocking normal shell until complete.

### Settings screen

Contains:

- language switcher;
- backend base URL field only if exposed as a dev setting;
- visible `Reset local state` action in dev mode.

## Client Architecture

### Stack

- Electron
- React
- TypeScript
- Vite

### Process split

`main`:

- creates the application window;
- owns filesystem persistence;
- owns environment-aware configuration;
- exposes a minimal IPC surface.

`preload`:

- bridges renderer-safe APIs;
- exposes storage and optional diagnostics helpers;
- never exposes raw Node or fs access broadly.

`renderer`:

- owns UI;
- owns screen-state transitions;
- owns data fetching, cache logic, and i18n rendering.

### Security baseline

- `contextIsolation: true`
- `nodeIntegration: false`
- explicit preload API only

## Local State Model

The client stores only device-local state.

### Persisted app state

Suggested structure:

```ts
type PersistedAppState = {
  isAuthenticated: boolean;
  authProviderHint: "github" | "google" | "yandex" | "direct" | null;
  language: "ru" | "en" | null;
  activeWorkspaceId: string | null;
  activeProjectId: string | null;
  activeSessionByProjectId: Record<string, string | null>;
  devModeEnabled: boolean;
  lastBootstrapAt: string | null;
};
```

### Persisted entity cache

Suggested structure:

```ts
type EntityCache = {
  me?: { data: unknown; fetchedAt: string };
  workspaces?: { data: unknown; fetchedAt: string };
  projectsByWorkspaceId?: Record<string, { data: unknown; fetchedAt: string }>;
  sessionsByProjectId?: Record<string, { data: unknown; fetchedAt: string }>;
  runtimeContextByProjectId?: Record<string, { data: unknown; fetchedAt: string }>;
};
```

Jobs and onboarding poll state are not part of the normal entity cache.

## Cache Strategy

Use `stale-while-revalidate`.

Renderer behavior:

- read cache first if present;
- render cached content where safe;
- immediately revalidate in background;
- surface a subtle stale or syncing state in the shell.

Initial TTLs:

- `me`: 5 minutes
- `workspaces`: 5 minutes
- `projects`: 2 minutes
- `sessions`: 1 minute
- `runtime-context`: 1 minute

Invalidate on:

- login bootstrap start;
- successful user onboarding completion;
- successful project onboarding completion;
- project creation;
- session creation;
- dev reset.

Do not cache jobs or in-flight onboarding polling state as normal entities.

## Internationalization

Requirements:

- Russian is the initial default path;
- English is fully available as a second language;
- language is chosen at first launch and can later be changed in settings.

Implementation approach:

- static local dictionaries in renderer;
- namespace split by screen:
  - `language`
  - `auth`
  - `bootstrap`
  - `userOnboarding`
  - `projectOnboarding`
  - `workspaceShell`
  - `settings`
  - `errors`

Do not use remote translation loading in MVP.

## Dev Reset

The client needs an explicit development-only reset path.

Behavior:

- clear persisted app state;
- clear entity cache;
- return the app to first-run language selection;
- leave backend data untouched.

The reset action should be visible inside settings when dev mode is enabled.

## Error Handling

### Backend unavailable

- preserve local auth state;
- show recoverable error screen;
- provide retry;
- if cache exists, optionally show last known shell marked as stale.

### Empty workspace list

- treat as unexpected backend state;
- show explicit error and retry;
- do not silently fabricate a workspace in the client.

### Skill-run or job failure

- keep the user inside the current onboarding flow;
- show clear failure feedback;
- allow retry without resetting the whole app.

## Testing Strategy

### Unit tests

- bootstrap decision logic;
- cache TTL and invalidation rules;
- persisted state serialization;
- i18n dictionary resolution;
- onboarding flow guards.

### Renderer integration tests

- first run language selection -> auth;
- auth -> bootstrap -> user onboarding required;
- auth -> bootstrap -> empty projects state;
- auth -> bootstrap -> project onboarding required;
- auth -> bootstrap -> ready shell;
- settings language change;
- dev reset returns to first run.

### Electron smoke tests

- application window boots;
- preload API is available;
- persisted state survives restart;
- reset clears local state.

## Delivery Notes

This MVP should be implemented against the current backend contract rather than a fake desktop-only model. The desktop app may still use a local auth stub, but all canonical business state must come from backend endpoints.

The first implementation should prioritize:

1. shell scaffolding and persistence
2. bootstrap and cache
3. user onboarding
4. project onboarding
5. settings and dev reset
6. visual polish
