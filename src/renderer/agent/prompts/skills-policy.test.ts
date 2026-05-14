import test from "node:test";
import assert from "node:assert/strict";
import { buildSkillsBlock } from "./skills-policy.js";
import type { AgentSkill } from "../../lib/types.js";

function skill(name: string, files: Record<string, string>): AgentSkill {
  return {
    id: `id-${name}`,
    agent_id: "sa-agent",
    name,
    files,
    created_at: "2026-05-14T00:00:00Z",
  };
}

test("returns empty string for empty skills list", () => {
  assert.equal(buildSkillsBlock([]), "");
});

test("renders name + description + triggers from SKILL.md frontmatter", () => {
  const skillMd = [
    "---",
    "name: brd",
    "description: Generate Business Requirements Document (BRD)",
    'triggers: ["brd", "brd", "брд"]',
    "---",
    "# body",
  ].join("\n");
  const block = buildSkillsBlock([skill("brd", { "SKILL.md": skillMd })]);
  assert.match(block, /^<skills>$/m);
  assert.match(block, /^- brd$/m);
  assert.match(block, /description: Generate Business Requirements Document \(BRD\)/);
  assert.match(block, /triggers: brd, брд/);
  assert.match(block, /<\/skills>$/m);
});

test("lists file keys excluding SKILL.md", () => {
  const skillMd = ["---", "description: tz", "---"].join("\n");
  const block = buildSkillsBlock([
    skill("tz", { "SKILL.md": skillMd, "tz_template.md": "{{title}}" }),
  ]);
  assert.match(block, /files: tz_template\.md/);
  assert.doesNotMatch(block, /files:.*SKILL\.md/);
});

test("omits description and triggers lines when not present", () => {
  const block = buildSkillsBlock([skill("bare", { "SKILL.md": "no frontmatter here" })]);
  assert.match(block, /^- bare$/m);
  assert.doesNotMatch(block, /description:/);
  assert.doesNotMatch(block, /triggers:/);
  assert.doesNotMatch(block, /files:/);
});

test("deduplicates trigger values keeping first occurrence", () => {
  const skillMd = [
    "---",
    'triggers: ["one", "two", "one"]',
    "---",
  ].join("\n");
  const block = buildSkillsBlock([skill("dup", { "SKILL.md": skillMd })]);
  assert.match(block, /triggers: one, two$/m);
});

test("renders multiple skills in order", () => {
  const a = skill("a", { "SKILL.md": "---\ndescription: A\n---" });
  const b = skill("b", { "SKILL.md": "---\ndescription: B\n---" });
  const block = buildSkillsBlock([a, b]);
  const aIdx = block.indexOf("- a");
  const bIdx = block.indexOf("- b");
  assert.ok(aIdx < bIdx, "a should appear before b");
});
