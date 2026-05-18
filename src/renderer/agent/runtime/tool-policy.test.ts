import test from "node:test";
import assert from "node:assert/strict";
import { getToolPolicyWarnings } from "./tool-policy.js";
import type { RuntimeTraceEvent } from "./types.js";

function toolCallEvent(
  overrides: Partial<Extract<RuntimeTraceEvent, { kind: "tool_call" }>>,
): Extract<RuntimeTraceEvent, { kind: "tool_call" }> {
  return {
    kind: "tool_call",
    id: "event-1",
    round: 1,
    toolCallId: "call-1",
    name: "run_python",
    argsJson: "{}",
    status: "success",
    at: 0,
    ...overrides,
  };
}

test("warns when run_python imports likely third-party modules without prior discovery", () => {
  const warnings = getToolPolicyWarnings([], {
    name: "run_python",
    args: {
      code: ['import os', 'import pandas as pd', 'from numpy.random import randn'].join("\n"),
    },
  });

  assert.deepEqual(warnings, [
    "run_python imports likely third-party modules (pandas, numpy) without prior list_python_packages discovery in this turn.",
  ]);
});

test("does not warn when list_python_packages already happened earlier in the turn", () => {
  const warnings = getToolPolicyWarnings(
    [
      toolCallEvent({
        name: "list_python_packages",
        toolCallId: "call-packages",
      }),
    ],
    {
      name: "run_python",
      args: {
        code: "import pandas as pd",
      },
    },
  );

  assert.deepEqual(warnings, []);
});

test("warns when run_python appears before list_python_packages in the same turn", () => {
  const warnings = getToolPolicyWarnings(
    [
      toolCallEvent({
        id: "run-event",
        name: "run_python",
        toolCallId: "call-run",
      }),
      toolCallEvent({
        id: "packages-event",
        name: "list_python_packages",
        toolCallId: "call-packages",
      }),
    ],
    {
      name: "run_python",
      args: {
        code: "import pandas as pd",
      },
    },
    "run-event",
  );

  assert.deepEqual(warnings, [
    "run_python imports likely third-party modules (pandas) without prior list_python_packages discovery in this turn.",
  ]);
});

test("does not warn when list_python_packages appears before run_python in the same turn", () => {
  const warnings = getToolPolicyWarnings(
    [
      toolCallEvent({
        id: "packages-event",
        name: "list_python_packages",
        toolCallId: "call-packages",
      }),
      toolCallEvent({
        id: "run-event",
        name: "run_python",
        toolCallId: "call-run",
      }),
    ],
    {
      name: "run_python",
      args: {
        code: "import pandas as pd",
      },
    },
    "run-event",
  );

  assert.deepEqual(warnings, []);
});
