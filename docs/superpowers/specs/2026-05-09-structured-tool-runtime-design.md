# Structured Tool Runtime Design

## Goal

Replace the current text-parsing tool orchestration with a structured runtime model where:

- `/v1/llm/responses` returns structured `tool_calls`
- `pi-agent-core` owns the conversational loop
- frontend renders only confirmed runtime events
- tool execution is split between `backend.*` and `local.*` executors

This removes the current `json-in-text` fallback path as the primary mechanism for tool execution.

## Problem

The current renderer loop is unreliable because it treats `output_text` as both:

- final assistant text
- an implicit tool instruction channel

That creates several failure modes:

- model prose can be mistaken for final success even when no tool ran
- mixed prose + JSON is brittle to parse
- tool execution depends on prompt discipline instead of runtime guarantees
- UI can display claims like "project created" without a confirmed tool result

## Target Architecture

```text
Frontend UI
  -> Workspace chat surface
  -> Runtime event renderer

pi-agent-core
  -> structured model adapter (/v1/llm/responses)
  -> tool registry (AgentTool[])
  -> beforeToolCall / afterToolCall hooks
  -> event stream

Executors
  -> backend executor (/v1/me/mcp, /v1/project-agents/:id/mcp)
  -> local executor (Electron bridge)
```

## Runtime Ownership

`pi-agent-core` becomes the only owner of turn orchestration.

The renderer must stop owning:

- manual `runConversationLoop()`
- manual retry injection based on parsed text
- custom "tool result back into LLM" state machine outside the runtime

The runtime is responsible for:

1. send messages to the model adapter
2. receive structured assistant tool calls
3. validate tool args
4. ask for approval when required
5. execute tools
6. append tool results
7. continue generation until the turn is complete

## Model Adapter Contract

The renderer-side model adapter for `pi-agent-core` must call:

- `POST /v1/llm/responses`

Request payload includes:

- conversation messages
- `tools`
- `tool_choice`
- active workspace/project/session/agent scope

Response handling rules:

- `tool_calls` is the source of truth for tool intent
- `output_text` is only assistant text
- frontend must never parse tool calls from `output_text`

The adapter must convert backend `tool_calls` into the assistant message shape expected by `pi-ai` / `pi-agent-core`.

## Tool Planes

Two execution planes remain, but they are unified at the runtime API layer.

### `backend.*`

Used for:

- profile mutations
- project creation / updates
- project context mutations
- documents generation
- memory search
- secure backend executions

Execution:

- global scope -> `POST /v1/me/mcp`
- project scope -> `POST /v1/project-agents/:projectAgentId/mcp`

### `local.*`

Used for:

- local file writes
- reveal in Finder
- open in VSCode
- clipboard or desktop actions

Execution:

- Electron preload / bridge only

The backend must not pretend to own local filesystem side effects.

## Event Contract

UI should render runtime events, not model promises.

Canonical UI-facing event families:

- `agent_state`
- `assistant_message`
- `tool_call_started`
- `tool_call_completed`
- `tool_call_failed`
- `approval_required`

The implementation may derive these from raw `pi-agent-core` events such as:

- `turn_start`
- `message_start`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `turn_end`
- `agent_end`

Important rule:

- assistant success copy must only be displayed as confirmed action after the runtime has emitted the corresponding tool completion path

## Approval Policy

Risky tools must not execute immediately just because the model requested them.

Use `beforeToolCall` to:

- classify tool risk
- decide `allow / ask / deny`
- emit `approval_required`
- block execution until the user responds

Approval state must live in the runtime layer, not in ad-hoc view logic.

## Persistence Contract

Message routes remain persistence-only.

Global assistant:

- `GET /v1/me/assistant-thread`
- `POST /v1/me/assistant-thread/messages`

Project chat:

- `POST /v1/sessions`
- `GET /v1/sessions/:sessionId/messages`
- `POST /v1/sessions/:sessionId/messages`

Per turn:

1. persist user message
2. run `pi-agent-core`
3. execute tools through runtime
4. persist assistant message

Backend message routes are never used as completion endpoints.

## Migration Plan

### Phase 1

Introduce a structured model adapter for `/v1/llm/responses`.

Requirements:

- pass `tools`
- pass `tool_choice`
- consume structured `tool_calls`
- no parsing of `output_text` for tool intent

### Phase 2

Replace `runConversationLoop()` with runtime-native tool execution in:

- `personal-assistant-runtime`
- `project-session-runtime`

### Phase 3

Attach unified `AgentTool[]` built from:

- backend tool descriptors
- local tool descriptors

### Phase 4

Expose a stable UI event mapper from raw runtime events to shell-friendly event entries.

### Phase 5

Add approval handling through `beforeToolCall`.

### Phase 6

Remove legacy fallback logic:

- text-based tool intent parsing
- JSON-in-text execution path
- model-claim-based success rendering

## Testing

Required test coverage:

1. model adapter maps backend `tool_calls` into runtime tool calls
2. tool execution continues the same turn without parsing `output_text`
3. backend tools emit completion before user-facing success text is shown
4. local file tools execute through Electron bridge
5. approval-required tools pause until approval
6. failed tools emit failure events and do not produce fake success copy

## Boundaries

This redesign is intentionally limited to:

- agent loop ownership
- tool execution reliability
- approval flow foundation
- runtime event rendering

It does not redesign:

- project domain objects
- shell navigation model
- backend MCP catalog shape
- one-shot execution UX beyond event integration
