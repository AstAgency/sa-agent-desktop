import test from "node:test";
import assert from "node:assert/strict";
import {
  formatGetSkillResult,
  formatGetRoleResult,
} from "./agent-content-tools.js";
import type { AgentRole, AgentSkill } from "../../lib/types.js";

const skill: AgentSkill = {
  id: "id-brd",
  agent_id: "sa-agent",
  name: "brd",
  files: {
    "SKILL.md": "# BRD\nbody",
    "brd_template.md": "# Template\n{{title}}",
  },
  created_at: "2026-05-14T00:00:00Z",
};

const role: AgentRole = {
  id: "id-sa",
  agent_id: "sa-agent",
  name: "sa",
  description: "System Analyst",
  prompt: "# Active Role: SA\nfollow these steps",
  created_at: "2026-05-14T00:00:00Z",
};

test("formatGetSkillResult on hit returns each file in fenced block", () => {
  const result = formatGetSkillResult({ skill, requestedName: "brd", available: ["brd", "tz"] });
  assert.equal(result.ok, true);
  assert.match(result.text, /skill: brd/);
  assert.match(result.text, /=== SKILL\.md ===/);
  assert.match(result.text, /# BRD\nbody/);
  assert.match(result.text, /=== brd_template\.md ===/);
  assert.match(result.text, /\{\{title\}\}/);
});

test("formatGetSkillResult on miss returns ok=false and lists available names", () => {
  const result = formatGetSkillResult({
    skill: null,
    requestedName: "nope",
    available: ["brd", "tz"],
  });
  assert.equal(result.ok, false);
  assert.match(result.text, /no skill named "nope"/i);
  assert.match(result.text, /brd/);
  assert.match(result.text, /tz/);
});

test("formatGetSkillResult on miss handles empty available list", () => {
  const result = formatGetSkillResult({
    skill: null,
    requestedName: "x",
    available: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.text, /no skills are available/i);
});

test("formatGetRoleResult on hit returns name, description and prompt", () => {
  const result = formatGetRoleResult({ role, requestedName: "sa", available: ["sa", "discovery"] });
  assert.equal(result.ok, true);
  assert.match(result.text, /role: sa/);
  assert.match(result.text, /description: System Analyst/);
  assert.match(result.text, /=== prompt ===/);
  assert.match(result.text, /# Active Role: SA/);
});

test("formatGetRoleResult skips description when empty", () => {
  const result = formatGetRoleResult({
    role: { ...role, description: null },
    requestedName: "sa",
    available: ["sa"],
  });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.text, /description:/);
});

test("formatGetRoleResult on miss returns ok=false and lists available names", () => {
  const result = formatGetRoleResult({
    role: null,
    requestedName: "ghost",
    available: ["sa", "discovery"],
  });
  assert.equal(result.ok, false);
  assert.match(result.text, /no role named "ghost"/i);
  assert.match(result.text, /sa/);
  assert.match(result.text, /discovery/);
});
