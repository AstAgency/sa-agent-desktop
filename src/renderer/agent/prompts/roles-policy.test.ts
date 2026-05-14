import test from "node:test";
import assert from "node:assert/strict";
import { buildRolesBlock, ROLES_POLICY_PROMPT } from "./roles-policy.js";
import type { AgentRole } from "../../lib/types.js";

function role(name: string, description: string | null): AgentRole {
  return {
    id: `id-${name}`,
    agent_id: "sa-agent",
    name,
    description,
    prompt: `prompt of ${name}`,
    created_at: "2026-05-14T00:00:00Z",
  };
}

test("returns empty string for empty roles list", () => {
  assert.equal(buildRolesBlock([]), "");
});

test("renders name and description for each role", () => {
  const block = buildRolesBlock([
    role("discovery", "Clarify business problem"),
    role("sa", "Translate business needs into requirements"),
  ]);
  assert.match(block, /^<roles>$/m);
  assert.match(block, /^- discovery$/m);
  assert.match(block, /description: Clarify business problem/);
  assert.match(block, /^- sa$/m);
  assert.match(block, /description: Translate business needs/);
  assert.match(block, /<\/roles>$/m);
});

test("omits description line when description is empty or null", () => {
  const block = buildRolesBlock([role("architect", null), role("reviewer", "")]);
  assert.match(block, /^- architect$/m);
  assert.match(block, /^- reviewer$/m);
  assert.doesNotMatch(block, /description:/);
});

test("ROLES_POLICY_PROMPT mentions get_role tool and lazy-load discipline", () => {
  assert.match(ROLES_POLICY_PROMPT, /get_role/);
  assert.match(ROLES_POLICY_PROMPT, /<roles>/);
});
