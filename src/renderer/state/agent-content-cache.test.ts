import test from "node:test";
import assert from "node:assert/strict";
import { createAgentContentCache } from "./agent-content-cache.js";
import type { AgentRole, AgentSkill } from "../lib/types.js";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function skill(name: string): AgentSkill {
  return {
    id: `id-${name}`,
    agent_id: "sa-agent",
    name,
    files: { "SKILL.md": `body of ${name}` },
    created_at: "2026-05-14T00:00:00Z",
  };
}

function role(name: string): AgentRole {
  return {
    id: `id-${name}`,
    agent_id: "sa-agent",
    name,
    description: `${name} desc`,
    prompt: `prompt of ${name}`,
    created_at: "2026-05-14T00:00:00Z",
  };
}

test("getSkillsList returns null when nothing was stored for this agent", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  assert.equal(cache.getSkillsList("sa-agent"), null);
});

test("setSkills + getSkillsList returns the stored list", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  const list = [skill("brd"), skill("tz")];
  cache.setSkills("sa-agent", list);
  assert.deepEqual(cache.getSkillsList("sa-agent"), list);
});

test("getSkill looks up by name", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  cache.setSkills("sa-agent", [skill("brd"), skill("tz")]);
  assert.equal(cache.getSkill("sa-agent", "brd")?.name, "brd");
  assert.equal(cache.getSkill("sa-agent", "tz")?.name, "tz");
  assert.equal(cache.getSkill("sa-agent", "missing"), null);
});

test("setRoles + getRolesList returns the stored list", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  const list = [role("discovery"), role("sa")];
  cache.setRoles("sa-agent", list);
  assert.deepEqual(cache.getRolesList("sa-agent"), list);
});

test("getRole looks up by name", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  cache.setRoles("sa-agent", [role("discovery"), role("sa")]);
  assert.equal(cache.getRole("sa-agent", "sa")?.name, "sa");
  assert.equal(cache.getRole("sa-agent", "absent"), null);
});

test("entries expire after 12 hours", () => {
  let nowMs = 1000;
  const cache = createAgentContentCache({ now: () => nowMs });
  cache.setSkills("sa-agent", [skill("brd")]);
  assert.notEqual(cache.getSkillsList("sa-agent"), null);
  nowMs += TWELVE_HOURS_MS - 1;
  assert.notEqual(cache.getSkillsList("sa-agent"), null, "should still be alive just before TTL");
  nowMs += 2;
  assert.equal(cache.getSkillsList("sa-agent"), null, "should expire after TTL");
  assert.equal(cache.getSkill("sa-agent", "brd"), null, "lookups also expire");
});

test("expiration is per agent key", () => {
  let nowMs = 1000;
  const cache = createAgentContentCache({ now: () => nowMs });
  cache.setSkills("sa-agent", [skill("brd")]);
  nowMs += TWELVE_HOURS_MS + 1;
  cache.setSkills("other-agent", [skill("brd")]);
  assert.equal(cache.getSkillsList("sa-agent"), null);
  assert.notEqual(cache.getSkillsList("other-agent"), null);
});

test("re-setting refreshes the TTL window", () => {
  let nowMs = 1000;
  const cache = createAgentContentCache({ now: () => nowMs });
  cache.setSkills("sa-agent", [skill("brd")]);
  nowMs += TWELVE_HOURS_MS - 100;
  cache.setSkills("sa-agent", [skill("brd"), skill("tz")]);
  nowMs += 200;
  const list = cache.getSkillsList("sa-agent");
  assert.equal(list?.length, 2);
});

test("clear() removes everything", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  cache.setSkills("sa-agent", [skill("brd")]);
  cache.setRoles("sa-agent", [role("sa")]);
  cache.clear();
  assert.equal(cache.getSkillsList("sa-agent"), null);
  assert.equal(cache.getRolesList("sa-agent"), null);
});

test("clear(agentKey) removes only that agent's entries", () => {
  const cache = createAgentContentCache({ now: () => 0 });
  cache.setSkills("a", [skill("x")]);
  cache.setSkills("b", [skill("y")]);
  cache.clear("a");
  assert.equal(cache.getSkillsList("a"), null);
  assert.notEqual(cache.getSkillsList("b"), null);
});
