# Multi-Agent Workspace Shell Design

## Goal

Refactor the current desktop client shell from a chat-first layout into a workspace-first layout that feels like an AI collaboration workstation.

The shell must:

- feel like a persistent technical workspace, not a chatbot;
- stay compatible with the current MVP constraints:
  - one workspace;
  - one active agent per project;
  - one global ecosystem assistant;
- visibly prepare for future:
  - multiple project agents;
  - multiple threads;
  - external workspace connection;
  - richer runtime/execution surfaces.

The result should feel closer to:

- VSCode workspace;
- Linear;
- Slack threads;
- Figma presence;
- Cursor operator surfaces.

It must not feel like ChatGPT or Claude.

## Product Model

The mental model is:

- `workspace-first`
- `activity-centric`
- `task-oriented`
- `human-supervised multi-agent orchestration`

Not:

- `conversation-first`
- `single-chatbot-first`

This means the UI primitives are:

- activity;
- tasks;
- artifacts;
- executions;
- agent presence;
- threads as focused sub-contexts.

Chat remains important, but only as one workspace mode.

## User Flow

### First launch

1. Empty state
2. Assistant-first onboarding
3. Project bootstrap
4. Workspace generation
5. Transition into `Project Home`

### After onboarding

The default landing screen is `Project Home`, not the assistant thread and not the raw feed.

The assistant remains globally available as a copilot surface.

## Global Command Surface

The shell must treat the command surface as a first-class workstation primitive.

This is not just a convenience shortcut. It is a core navigation and orchestration layer.

### Role

The command surface should eventually support:

- switch project;
- open thread;
- spawn agent;
- create task;
- open artifact;
- ask assistant;
- reconnect runtime.

### MVP expectation

The first shell redesign does not need to fully implement the command surface, but the UI architecture must leave a clear place for it:

- top-bar trigger;
- future `Cmd+K`;
- future assistant/command overlay entrypoint.

### Trigger model

The shell should already conceptually support two entry modes:

- `Ask Assistant`
- `Run Command`

Even if MVP routes both into the same overlay, the trigger and mental model should not assume those are identical forever.

## Assistant Role

The assistant is a `workspace copilot`.

It is responsible for:

- onboarding;
- platform explanation;
- project bootstrap;
- orchestration help;
- contextual assistance from anywhere in the workspace.

It is not:

- a generic support chat;
- the permanent central screen after bootstrap.

Entry points:

- top bar trigger;
- future floating assistant trigger;
- future `Cmd+K`;
- contextual assistant actions from threads/files/executions.

Presentation:

- side overlay or contextual panel in later iteration;
- current MVP may keep assistant inside thread/workspace mode while the shell is reoriented around workspace navigation.

## Shell Architecture

### Layout

Adopt a three-column adaptive workspace shell.

- `Top Bar`
- `Left Sidebar`
- `Main Workspace Area`
- `Right Context Panel`

### Top Bar

Contains:

- project switcher;
- global search slot;
- activity pulse / project status signal;
- runtime health badge;
- assistant trigger;
- profile/settings.

This bar establishes that the user is inside a persistent operating workspace.

### Left Sidebar

Primary navigation modes:

- `Home`
- `Activity`
- `Threads`
- `Tasks`
- `Agents`
- `Files`
- `Executions`

Secondary content below or within sections:

- project list;
- pinned or recent threads;
- current project scope indicator.

The sidebar must already look multi-agent and multi-thread aware, even if MVP data is minimal.

### Main Workspace Area

This is the primary dynamic surface.

Modes:

- `Project Home`
- `Activity`
- `Thread`
- `Tasks`
- `Agents`
- `Files`
- `Executions`

The main area changes by selected mode without modal interruption.

### Right Context Panel

Contextual inspector only.

Possible content:

- thread metadata;
- task details;
- agent inspector;
- file metadata;
- execution details;
- memory scope indicators.

It must not become a second main workspace. It exists to deepen context without navigation jumps.

### Default state

When nothing is explicitly selected, the panel should show a calm operational summary instead of blank space.

Default content may include:

- current project scope;
- current agent summary;
- runtime health summary;
- short tip about available next actions.

## Project Home

`Project Home` is the default landing surface after onboarding and after project switch.

It is a high-level overview workspace, not a chronological event stream.

`Project Home` must still feel operationally alive.

It should react to:

- live updates;
- active pulses;
- runtime state changes;
- newly appearing artifacts;
- agent presence changes.

The goal is to avoid a static `Notion dashboard` feeling and instead preserve the sensation of a living AI workspace.

### Sections

1. `Workspace Status`
   - active tasks
   - running executions
   - approvals required
   - blocked items

2. `Agent Presence`
   - agent cards or compact list
   - status:
     - Idle
     - Working
     - Reviewing
     - Waiting approval
     - Blocked
   - current thread / current task / current execution hints

3. `Active Tasks`
   - compact task list
   - title
   - owner agent
   - state
   - blocked marker

4. `Running Executions`
   - execution cards
   - agent
   - runtime state
   - last update
   - open action

5. `Recent Artifacts`
   - recent generated documents/files
   - type
   - source
   - updated at

6. `Recent Activity Preview`
   - short list of latest events
   - CTA to open full `Activity`

### Priority order

`Project Home` should surface urgency before chronology.

Priority order:

1. blocked states
2. approvals required
3. running executions
4. active tasks
5. recent artifacts
6. recent activity preview

### Purpose

`Project Home` answers:

- what matters now;
- who is active;
- what is blocked;
- what needs supervision.

It prevents future feed overload from becoming the default UX.

## Activity

`Activity` is a separate workspace mode.

It is the raw chronological operational stream.

### Structure

- filter bar:
  - All
  - Executions
  - Tasks
  - Artifacts
  - Approvals
  - Agents
- event stream cards below

### Future grouping modes

To prevent long-term activity overload, the mode should conceptually allow future grouping by:

- task;
- thread;
- agent.

This does not need to be implemented in the first shell slice, but the activity model must not assume timeline-only UX forever.

### Event card content

- actor avatar / identity;
- event type;
- related entity;
- timestamp;
- short operational summary;
- quick actions:
  - Open Thread
  - View Artifact
  - Inspect Execution

### Purpose

`Activity` answers:

- what happened in sequence.

It is intentionally different from `Project Home`.

## Thread Workspace

`Thread` is the focused collaboration context for one agent and one working stream.

Thread is an operational collaboration stream, not a messaging primitive.

### Structure

- `Thread Header`
  - title
  - owning agent
  - linked task
  - execution state
  - memory scope
  - participants

- `Conversation / Artifact Stream`
  - user and assistant messages
  - execution logs
  - approvals
  - artifacts
  - system events

- `Composer`
  - markdown
  - attachments
  - slash-command slot
  - future agent mentions

### Principle

Thread is not the whole product. It is one operational sub-context inside a bigger workspace.

Over time it may contain:

- artifacts;
- approvals;
- task transitions;
- runtime state;
- execution blocks;
- review checkpoints.

This is why the UX must not frame it as “just chat”.

## Task Board

Tasks are first-class objects.

### Structure

- compact Kanban:
  - Todo
  - Assigned
  - In Progress
  - Blocked
  - Review
  - Done
- right inspector for the selected task

### Task card

- title
- assigned agent
- linked thread
- priority
- dependency marker
- status

### Principle

Tasks must never feel buried inside chat history.

## Agents

`Agents` is a roster and inspection surface.

### Structure

- summary strip:
  - active
  - busy
  - blocked
  - waiting approval
- card/grid list of agents

### Agent card

- avatar
- display name
- role/profile
- status
- current thread
- active tasks count
- current execution

### Actions

- Open Thread
- Inspect
- Assign
- future:
  - Pause
  - Duplicate
  - Remove

### MVP rule

Even with one agent, the layout must still render as a roster of one. No single-agent special-cased shell.

This keeps the UI visually multi-agent-ready without fake data.

## Files

`Files` is a hybrid artifacts + workspace file surface.

Artifacts are logical outputs.

Workspace Files are physical filesystem entities.

The UI must preserve this distinction so generated knowledge objects and real project files do not collapse into one ambiguous list later.

## Terminology

Product-facing UI should prefer:

- `MCP`
- `MCP config`
- `Connected MCP`

Avoid casual internal plural forms like `mcps` in visible product text unless the context is explicitly technical or debug-oriented.

### Structure

- left tree:
  - Generated Artifacts
  - Workspace Files
- center preview
- right metadata inspector

### Actions

- Reveal in Finder
- Open in VSCode
- Ask Assistant
- future:
  - Version History

### MVP mapping

Use current generated project documents and the local `agent-files` folder as the first implementation slice.

## Executions

`Executions` is the runtime control surface.

### Structure

- summary counters:
  - running
  - blocked
  - reconnecting
  - failed
- execution list/cards

### Execution card

- execution status
- owning agent
- linked thread
- runtime state
- last heartbeat/update
- quick actions:
  - Open
  - Retry when applicable

### Principle

This must feel like operator console UX, not a hidden developer/debug page.

## Data and Future-Readiness

### Current MVP assumptions

- one workspace;
- one selected agent in global mode;
- one active agent per project;
- one real assistant for ecosystem/platform help.

### Future assumptions

The UI must already leave conceptual space for:

- multiple project agents;
- multiple threads;
- connected external workspace;
- richer approvals;
- runtime recovery/reconnect states;
- shared and private memory surfaces.

### Explicit non-goal for this slice

Do not add active interactive UI for:

- multi-agent creation/management beyond the single-agent-ready surface;
- external workspace connection flows.

Only shape the shell so those additions do not require a layout rewrite later.

## Visual Direction

### Tone

- dark-first
- muted surfaces
- high information density
- restrained motion
- semantic status accents only
- professional technical workstation

### Avoid

- neon AI aesthetics
- sci-fi overload
- friendly chatbot styling
- oversized empty marketing spacing

### Target feeling

The user should feel:

`I am operating an AI workspace`

Not:

`I am talking to a chatbot`

## Motion and Interaction

### Required interaction qualities

- fast switching between modes;
- no fullscreen modal dependence for normal workflow;
- persistent shell continuity;
- visible agent/runtime presence;
- stable layout after restart.

### Future interaction hooks

The shell should visually accommodate:

- assistant overlay;
- presence pulses;
- execution badges;
- approvals drawer;
- reconnecting runtime banners.

## Error Handling and State Continuity

The shell must preserve the feeling of continuity.

Important states to render clearly:

- no project yet;
- onboarding in progress;
- blocked execution;
- reconnecting runtime;
- detached or failed execution;
- no files yet;
- no tasks yet.

After restart, the long-term target behavior is:

- restore current project;
- restore current mode;
- restore selected thread when valid;
- show reconnect/runtime recovery states visibly.

## Persistent Operational Strip

The shell should conceptually reserve space for a persistent operational strip or compact status rail.

This future surface can carry cross-workspace live operational states such as:

- current execution;
- reconnecting runtime;
- approvals pending;
- degraded runtime state.

It does not need to be fully implemented in the MVP shell, but the layout should not block it.

## Implementation Strategy

Refactor the current `WorkspaceShell` into a mode-based workspace shell.

### Phase 1

- introduce top bar;
- convert left sidebar into workspace navigation;
- make `Project Home` the default main mode;
- keep current thread/chat functionality as `Thread` mode;
- add right context panel frame;
- keep assistant functionally available without making it the default landing surface.
- make empty states action-oriented, not decorative placeholders.

### Phase 1 empty-state rule

All empty states should actively move the user forward.

Examples:

- no tasks -> create or import task
- no files -> import files or open workspace folder
- no thread selected -> open recent thread or ask assistant
- no project context -> create project or continue onboarding

### Phase 2

- expand `Activity`;
- formalize `Agents`;
- formalize `Executions`;
- deepen `Files` into tree + preview;
- add assistant overlay trigger and contextual invocation patterns.

## Scope Check

This spec is intentionally scoped to a shell redesign and workspace navigation model.

It does not attempt to redesign:

- auth screens in detail;
- backend contracts;
- actual multi-agent orchestration protocols;
- complete task/execution domain models.

Those can be layered onto the shell once the structural UI is in place.
