# Session-First Shell Design

## Goal

Unify the desktop client around a single conversational primitive: `session`.

The shell must stop treating the personal assistant as a separate transport model and instead use the same runtime contract for:

- user-global assistant
- user onboarding
- project chat
- project onboarding

At the same time, the MVP shell should simplify left navigation:

- hide all mode tabs except `Files`
- show global sessions
- show projects
- show project sessions nested under projects
- allow the user to create a new session explicitly

## Product Rule

The client thinks in terms of:

- workspace
- project
- agent_profile
- project_agent
- session
- message
- execution
- mcp_tool

The client does not think in terms of:

- assistant-thread as a separate runtime surface
- skill as a primary runtime primitive
- backend-generated chat completions from message endpoints

## Runtime Model

There are two scopes but one conversational transport:

1. `user_global`
   - session with `project_id = null`
   - used for personal assistant and user onboarding

2. `project`
   - session with `project_id != null`
   - used for project chat and project onboarding

Both scopes use the same endpoints:

- `POST /v1/sessions`
- `GET /v1/sessions/:sessionId`
- `GET /v1/sessions/:sessionId/messages`
- `POST /v1/sessions/:sessionId/messages`
- `POST /v1/llm/responses`

Generation is always client-owned via `pi-agent-core`.

## Backend Responsibility

Backend owns:

- session persistence
- message persistence
- MCP execution
- `/v1/llm/responses` proxy generation
- secure backend executions
- bootstrap read models

Backend does not own:

- chat orchestration loop
- assistant reply generation from message persistence endpoints

## Client Responsibility

Client owns:

- runtime orchestration loop
- user message persistence
- generation step execution
- tool execution routing
- next-step generation after tool result
- final assistant message persistence

## Bootstrap Contract

The shell starts from:

- `GET /v1/me/bootstrap`

This is the canonical shell bootstrap read model.

It must provide:

- `viewer_profile`
- `workspaces`
- `selected_workspace_id`
- `selected_project_id`
- `user_global_session`
- `user_global_messages`

Contract notes:

- `selected_workspace_id` is the canonical bootstrap hint and should be present when the viewer has at least one accessible workspace.
- `selected_project_id` is only an optional hint.
- the client must not build a critical runtime path on `selected_project_id` being non-null.
- if `selected_project_id` is null, the shell must still bootstrap successfully and let the user select a project manually.

After bootstrap, the client loads:

- `GET /v1/workspaces/:workspaceId/projects`

If a project is selected, the client also loads:

- `GET /v1/sessions?workspace_id=:workspaceId&project_id=:projectId`

If no project is selected, the client may load:

- `GET /v1/sessions?workspace_id=:workspaceId`

## Global Session Flow

The global assistant becomes a normal session flow.

### Session create or restore

The client resolves the active user-global session through:

```json
{
  "workspace_id": "<activeWorkspaceId>",
  "project_id": null,
  "agent_key": "<activeAgentKey>",
  "channel_kind": "desktop",
  "resume_strategy": "resume_latest"
}
```

### Turn loop

For one turn:

1. `POST /v1/sessions`
2. `GET /v1/sessions/:sessionId/messages`
3. `POST /v1/sessions/:sessionId/messages` for the user message
4. `POST /v1/llm/responses`
5. if tool calls exist:
   - `POST /v1/me/mcp`
6. tool result goes into the next `POST /v1/llm/responses`
7. `POST /v1/sessions/:sessionId/messages` for the final assistant reply

### Allowed tools

User-global tools continue to execute through:

- `POST /v1/me/mcp`

Tool names are canonical snake_case names from backend scope, not dotted names in prompts.

### Global session listing

When the client loads:

- `GET /v1/sessions?workspace_id=:workspaceId`

the backend returns only user-global sessions for that workspace.

The client must not interpret that response as “all sessions in the workspace”.

## Project Session Flow

Project chat uses the same session primitive.

### Project bootstrap

After project selection, the client loads:

- `GET /v1/projects/:projectId`
- `GET /v1/projects/:projectId/agents`
- `GET /v1/projects/:projectId/agents/:projectAgentId`
- `GET /v1/projects/:projectId/agents/:projectAgentId/mcp`
- `GET /v1/projects/:projectId/threads`
- `GET /v1/projects/:projectId/documents`

Optional discovery/catalog endpoint:

- `GET /v1/capabilities?project_id=:projectId`

`capabilities` is not a required step in the conversational critical path.
It may be used for discovery, catalog views, or UI hints, but the runtime loop must not depend on it to function.

### Session create or restore

Project session resolution uses:

```json
{
  "workspace_id": "<activeWorkspaceId>",
  "project_id": "<activeProjectId>",
  "agent_key": "<activeAgentKey>",
  "channel_kind": "desktop",
  "resume_strategy": "resume_latest"
}
```

Important:

- `POST /v1/sessions` does not bind a `project_agent_id`
- the session transport only knows `workspace_id`, `project_id`, and `agent_key`
- the active `projectAgentId` lives separately in shell state
- that `activeProjectAgentId` is then used for project-scoped MCP and generation context

### Turn loop

For one turn:

1. `POST /v1/sessions`
2. `GET /v1/sessions/:sessionId/messages`
3. `POST /v1/sessions/:sessionId/messages` for the user message
4. `POST /v1/llm/responses`
5. if tool calls exist:
   - `POST /v1/project-agents/:projectAgentId/mcp`
6. tool result goes into the next `POST /v1/llm/responses`
7. `POST /v1/sessions/:sessionId/messages` for the final assistant reply
8. `GET /v1/sessions/:sessionId` only if session runtime state must be refreshed

### Project session listing

When the client loads:

- `GET /v1/sessions?workspace_id=:workspaceId&project_id=:projectId`

the backend returns only project sessions for that specific project.

The client must not mix them with user-global sessions.

## Message Contract

`POST /v1/sessions/:sessionId/messages` is persistence only.

It:

- saves authored messages
- does not generate assistant replies
- does not stream model output

If requested as SSE, it is only a persistence acknowledgement surface.

The UI must not treat it as model streaming.

## Generation Contract

All conversational generation goes through:

- `POST /v1/llm/responses`

The client always sends:

- `workspace_id`
- `project_id`
- `session_id`
- `project_agent_id` when applicable
- `messages`
- `tools`
- `tool_choice`

Structured `tool_calls` are the only valid signal for tool execution.

The client must never parse tool intent from `output_text`.

Tool contract:

- `tools` must be sent only in OpenAI-compatible `tools[].function` format
- `tools[].function.name` must be canonical snake_case
- the client must not send dotted tool names to `/v1/llm/responses`

## Tool Routing

There are two MCP scopes:

1. user-global:
   - `POST /v1/me/mcp`

2. project:
   - `POST /v1/project-agents/:projectAgentId/mcp`

The client must never mix them.

Secure backend workflows still go through:

- `POST /v1/executions`
- `GET /v1/executions/:executionId`
- `POST /v1/executions/:executionId/cancel`
- execution lease endpoints

## Onboarding UX

User onboarding and project onboarding must be non-blocking.

The shell must not lock the rest of the UI.

Instead:

- the active assistant session asks only for missing required information
- the rest of the workspace remains usable
- onboarding completion remains a canonical backend mutation:
  - `profile_complete_onboarding`
  - `project_bootstrap_complete`

The UI may show soft onboarding status, but not hard navigation locks.

## MVP Navigation

The MVP left sidebar should be simplified.

Hide these shell tabs for now:

- Home
- Activity
- Thread
- Tasks
- Agents
- Executions

Keep only:

- Files

The sidebar becomes session-first navigation rather than mode-first navigation.

## Left Sidebar Structure

Top section:

- `Global Sessions`
  - list of user-global sessions for the active workspace

Second section:

- `Projects`
  - list of projects
  - each project can expand to show its sessions

Under each expanded project:

- project session list

The active session should be visually highlighted regardless of scope.

## New Session Action

The shell must expose an explicit `New Session` action.

Behavior:

- if no project is selected:
  - create a new user-global session
- if a project is selected:
  - create a new project session for that project

The client must not rely only on implicit session creation through send-message flow.

Explicit session creation becomes a first-class user action.

## State Model

Canonical shell state must keep:

- `activeWorkspaceId`
- `activeProjectId`
- `activeAgentKey`
- `activeProjectAgentId`
- `activeSessionId`

`activeThreadId` is no longer a primary conversational primitive.

The shell should derive any thread-oriented display from session or project read models, not from a separate assistant-thread transport.

## Data Shape Changes

The renderer should stop carrying:

- `globalAssistantMessages` as a separate persistence source
- `assistant-thread` fetch paths in active runtime flow

Instead it should carry:

- `userGlobalSession`
- `userGlobalMessages`
- project sessions grouped by project

## Migration Requirements

The renderer must remove active usage of:

- `GET /v1/me/assistant-thread`
- `POST /v1/me/assistant-thread/messages`
- `GET /v1/me/assistant-state`

The renderer must preserve:

- structured tool call handling
- approval foundation
- local tool plane support
- project-agent selection

## Testing Requirements

Need coverage for:

- global session bootstrap from `GET /v1/me/bootstrap`
- no active runtime dependency on assistant-thread endpoints
- explicit new global session creation
- explicit new project session creation
- sidebar rendering:
  - global sessions
  - projects
  - project sessions
- non-blocking onboarding:
  - no locked tabs
  - assistant continues asking for missing data in active session

## Acceptance Criteria

The work is complete when:

1. personal assistant flow uses only `sessions`
2. project flow also uses `sessions`
3. no active runtime path uses assistant-thread endpoints
4. `/v1/llm/responses` remains the only generation endpoint
5. left sidebar shows:
   - global sessions
   - projects
   - nested project sessions
6. user can create a new session explicitly
7. onboarding no longer blocks workspace navigation
8. only `Files` remains as a visible mode tab in the MVP shell
