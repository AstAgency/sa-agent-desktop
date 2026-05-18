# Python Tooling Capability Registry Design

Date: 2026-05-18
Project: `sa-agent-desktop`
Status: Implemented

## Goal

Normalize how the agent understands and uses Python-related tools so that:

- prompt instructions do not drift from runtime reality;
- Python tool use becomes more reliable and efficient;
- the system is ready for future environment-mutation tools such as package installation;
- prompt size stays small and high-signal.

This design uses four principles:

1. Hybrid contract-first
2. Single source of truth capability registry
3. Runtime policy checks
4. Short generated `toolsManifest`

## Current Problem

The current prompt/runtime stack duplicates tool knowledge in multiple places:

- runtime tool definitions live in `src/renderer/agent/tools/index.ts`;
- capability awareness prose lives in `src/renderer/agent/prompts/capabilities.ts`;
- tool-usage guidance lives in `src/renderer/agent/prompts/tools-manifest.ts`.

This creates drift risk. The immediate example is Python:

- `list_python_packages` exists as a real tool;
- `tools-manifest.ts` instructs the model to use it;
- `capabilities.ts` may lag behind and omit it.

That means the model can receive contradictory instructions about what is actually available.

## Design Summary

Introduce a structured capability registry as the canonical description of all model-visible tools and capability policy. Generate prompt sections from that registry and add a runtime policy layer that can check or annotate tool use.

The registry becomes the only place where tool capability knowledge is authored by hand.

The following layers become derived artifacts:

- capability awareness prompt section;
- short tool-usage manifest;
- optional runtime checks/hooks metadata.

These two generated prompt blocks must stay explicitly separated:

- `Capabilities prompt`
  - what is available;
  - what constraints apply;
  - what is not available.
- `Tools manifest`
  - how to choose tools;
  - what order to use them in;
  - which anti-patterns to avoid.

## Non-Goals

- Do not add `pip install` or other package mutation tools in this change.
- Do not redesign the full agent runtime loop.
- Do not change the transport model for tools or chat completions.
- Do not introduce hard blocking runtime enforcement on day one.

## Architecture

### 1. Capability Registry

Add a structured TypeScript registry that describes each runtime capability.

Each tool entry should include:

- `name`
- `kind`
- `category`
- `availability`
- `description`
- `capabilityFacts`
- `usagePolicy`
- `preconditions`
- `postconditions`
- `manifestPriority`
- `runtimeChecks`

Recommended categories:

- `filesystem`
- `python`
- `network`
- `memory`
- `agent_content`

Recommended kinds:

- `local_runtime`
- `function_tool`

The model should support future extension to hosted tools or agents-as-tools without changing the design shape.

### 2. Category-Level Policies

Some rules belong to a workflow group, not to a single tool.

Example: Python workflow

- discovery tool: `list_python_packages`
- execution tool: `run_python`
- future environment mutation tool: `install_python_package`

The Python category policy should express:

- prefer stdlib when sufficient;
- if third-party imports are needed, verify package availability first;
- do not assume package installation capability unless a real install tool exists;
- use workspace-relative paths inside Python code.

This keeps per-tool metadata small and avoids repeating the same rules across related tools.

### 3. Generated Capability Awareness

Replace manually maintained tool inventory prose with a generator that builds the capability-awareness block from the registry.

This block should answer only:

- what tools are available;
- what each tool basically does;
- what is explicitly unavailable or constrained.

It should not contain long operational guidance.
It should not contain tool-selection strategy, sequencing rules, or anti-pattern prose.

### 4. Generated Short Tools Manifest

Replace the current hand-written `tools-manifest.ts` string with a generator.

The generated manifest should:

- be short;
- group guidance by category;
- include only high-signal operational rules;
- omit duplicated inventory details already present in capability awareness;
- omit rules that runtime enforces directly.

The manifest is guidance, not inventory.
It is specifically responsible for:

- how to choose tools;
- the recommended order of actions;
- anti-patterns that waste turns or produce low-signal work.

### 5. Runtime Policy Checks

Add a runtime policy module that can attach checks around tool use.

Recommended phases:

- before prompt/tool payload generation;
- before tool execution;
- after tool execution.

Initial mode should be advisory only:

- diagnostics in trace/logging;
- optional annotations in tool-result summaries or internal runtime diagnostics;
- no hard failure unless explicitly introduced later.

Examples of future useful checks:

- `run_python` appears to import third-party packages without prior package discovery;
- avoid read-after-write verification when the write tool already guarantees success;
- suggest `web_search` before `fetch_url` when the user asked for discovery rather than a known URL.

## Python-Specific Target Model

The Python tool workflow should become explicit and consistent across prompt and runtime.

### Current target behavior

1. If stdlib is enough, use `run_python`.
2. If third-party packages may be needed, use `list_python_packages` first.
3. If the required package is unavailable, do not hallucinate package installation.
4. Explain the limitation or choose a stdlib alternative.

### Future-compatible behavior

If a future install tool is introduced, the Python category model should expand naturally to:

1. discover
2. decide
3. mutate environment if allowed
4. execute

This design intentionally keeps that path open without committing to install semantics yet.

## Module Responsibilities

Recommended responsibility split:

- `capability-registry.ts`
  - canonical structured metadata
- `build-capabilities-prompt.ts`
  - generate capability awareness from registry
- `build-tools-manifest.ts`
  - generate short usage guidance from registry
- `runtime/tool-policy.ts`
  - runtime checks and policy evaluation
- `tools/index.ts`
  - actual executable tool implementations only

The existing runtime should consume generated prompt sections, not own handwritten tool knowledge.

## Minimal Registry Entry Example

Below is a minimal example of the intended registry shape for one Python tool.

```ts
const capabilityRegistry = {
  tools: [
    {
      name: "list_python_packages",
      kind: "local_runtime",
      category: "python",
      availability: { type: "always" },
      description:
        "List installed Python packages in the bundled interpreter, optionally filtered by substring.",
      capabilityFacts: [
        "Returns installed package names with versions.",
        "Reflects the packages actually available to run_python.",
        "Does not install, update, or remove packages.",
      ],
      usagePolicy: [
        "Use before run_python when third-party imports may be needed.",
        "Skip it when the task clearly fits the Python standard library.",
      ],
      preconditions: [],
      postconditions: [
        "The agent knows which third-party packages are actually available.",
      ],
      manifestPriority: "high",
      runtimeChecks: [],
    },
  ],
  categories: {
    python: {
      usagePolicy: [
        "Prefer stdlib when sufficient.",
        "If third-party imports are needed, verify package availability first.",
      ],
      antiPatterns: [
        "Do not assume pip install capability unless a real install tool exists.",
      ],
    },
  },
} as const;
```

This example is intentionally minimal:

- enough to generate a capabilities block;
- enough to generate a short manifest;
- enough to attach future runtime checks;
- not yet over-modeled for capabilities that do not need extra structure.

## Rollout Plan

### Step 1. Minimal safe normalization

Introduce the registry and generate:

- capability awareness block;
- short tools manifest.

Keep actual tool behavior unchanged.

This immediately removes prompt/runtime drift without touching execution semantics.

### Step 2. Normalize Python workflow

Model `python` as a category with group policy covering:

- `list_python_packages`
- `run_python`

Make sure:

- generated prompt sections mention both tools consistently;
- Python guidance is short and explicit;
- no prompt text claims nonexistent install/network behavior.

### Step 3. Add advisory runtime policy checks

Add soft runtime diagnostics around tool use.

This should not block execution yet. It should provide evidence about real agent failure modes before enforcement is considered.

### Step 4. Prepare for future install tools

Do not implement installation now, but structure registry and policy categories so an environment-mutation tool can be added later without redesigning prompt architecture.

## Why This Design

This design is preferred over a prompt-first approach because:

- prompt-only discipline is fragile;
- drift between prose and runtime is inevitable when multiple files define tool truth;
- runtime metadata enables both smaller prompts and stronger invariants;
- the design matches the idea that tool use is a managed runtime pipeline, not just prompt text.

It is preferred over a fully runtime-enforced model because:

- hard enforcement is easy to overfit early;
- the current runtime does not yet have strong structured tool-policy hooks;
- advisory checks allow learning before constraints are tightened.

## Risks

### Over-modeling the registry

Risk:
- the registry becomes too abstract and expensive to maintain.

Mitigation:
- start with only fields used by prompt generation and initial diagnostics;
- add new metadata only when a real consumer exists.

### Prompt generator becomes noisy

Risk:
- generated text may become long and repetitive.

Mitigation:
- keep generator output intentionally short;
- separate inventory from usage guidance;
- use `manifestPriority` to suppress low-value items.

### Runtime policy checks become implicit behavior

Risk:
- diagnostics may later become enforcement without clear design boundaries.

Mitigation:
- keep policy results typed and explicit;
- label checks as advisory vs enforced;
- centralize policy evaluation in one runtime module.

## Testing Strategy

At minimum, add tests for:

- generated capability awareness contains all real tools and no nonexistent ones;
- generated tools manifest includes Python guidance only when Python tools exist;
- adding/removing a tool in the registry updates prompt generation deterministically;
- runtime policy checks detect expected Python precondition failures in advisory mode.

## Success Criteria

This design is successful when:

- tools are declared once and consumed everywhere else;
- prompt sections cannot drift from runtime tool inventory;
- Python tool use becomes more predictable for the agent;
- future install-related work can be added without rewriting the prompt architecture.

## Recommended First Implementation Slice

Implemented in the current slice:

1. capability registry
2. generated capability awareness
3. generated short tools manifest
4. Python category metadata for `list_python_packages` and `run_python`
5. advisory runtime checks for `run_python` without prior `list_python_packages` discovery
