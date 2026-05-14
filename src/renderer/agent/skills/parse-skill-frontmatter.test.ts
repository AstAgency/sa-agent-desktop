import test from "node:test";
import assert from "node:assert/strict";
import { parseSkillFrontmatter } from "./parse-skill-frontmatter.js";

test("parses description and triggers from frontmatter", () => {
  const md = [
    "---",
    "name: brd",
    "description: Generate Business Requirements Document (BRD)",
    'triggers: ["brd", "business requirements", "брд"]',
    "---",
    "",
    "# BRD Generator",
  ].join("\n");

  const result = parseSkillFrontmatter(md);
  assert.equal(result.description, "Generate Business Requirements Document (BRD)");
  assert.deepEqual(result.triggers, ["brd", "business requirements", "брд"]);
});

test("returns empty defaults when no frontmatter present", () => {
  const result = parseSkillFrontmatter("# Just a heading\n\nNo frontmatter here.");
  assert.equal(result.description, null);
  assert.deepEqual(result.triggers, []);
});

test("returns empty defaults when frontmatter is malformed (unclosed)", () => {
  const md = [
    "---",
    "name: brd",
    "description: oops",
    "# body but no closing fence",
  ].join("\n");
  const result = parseSkillFrontmatter(md);
  assert.equal(result.description, null);
  assert.deepEqual(result.triggers, []);
});

test("handles missing description gracefully", () => {
  const md = [
    "---",
    "name: jira-workflow",
    'triggers: ["jira", "workflow"]',
    "---",
    "body",
  ].join("\n");
  const result = parseSkillFrontmatter(md);
  assert.equal(result.description, null);
  assert.deepEqual(result.triggers, ["jira", "workflow"]);
});

test("handles missing triggers gracefully", () => {
  const md = [
    "---",
    "name: export",
    "description: Export documents to DOCX or PDF",
    "---",
    "body",
  ].join("\n");
  const result = parseSkillFrontmatter(md);
  assert.equal(result.description, "Export documents to DOCX or PDF");
  assert.deepEqual(result.triggers, []);
});

test("ignores triggers array values that are not strings", () => {
  const md = [
    "---",
    "description: weird",
    "triggers: [\"ok\", 42, null]",
    "---",
  ].join("\n");
  const result = parseSkillFrontmatter(md);
  assert.deepEqual(result.triggers, ["ok"]);
});

test("trims surrounding whitespace from description", () => {
  const md = [
    "---",
    "description:    Generate TZ   ",
    "---",
  ].join("\n");
  const result = parseSkillFrontmatter(md);
  assert.equal(result.description, "Generate TZ");
});

test("returns empty defaults for empty input", () => {
  const result = parseSkillFrontmatter("");
  assert.equal(result.description, null);
  assert.deepEqual(result.triggers, []);
});
