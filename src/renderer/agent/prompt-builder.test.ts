import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "./prompt-builder.js";
import type { Profile } from "../lib/types.js";

const profile: Profile = {
  id: "profile-1",
  name: "User Example",
  global_memory: "",
  created_at: "2026-05-18T00:00:00Z",
  updated_at: "2026-05-18T00:00:00Z",
};

test("buildPrompt reflects filtered tool availability in generated prompt blocks", () => {
  const [systemMessage] = buildPrompt({
    agent: null,
    profile,
    project: null,
    relevantSummaries: [],
    liveMessages: [],
    availableToolNames: ["read_file", "write_file", "edit_file", "list_files"],
  });

  assert.equal(systemMessage?.role, "system");
  assert.match(systemMessage.content, /Available capabilities \(and only these\):/);
  assert.match(systemMessage.content, /read_file \/ write_file \/ edit_file \/ list_files/);
  assert.doesNotMatch(systemMessage.content, /- get_skill \/ get_role/);
  assert.doesNotMatch(systemMessage.content, /- update_global_memory \/ update_project_memory/);
  assert.match(systemMessage.content, /<available_tools>/);
  assert.match(systemMessage.content, /Filesystem \(read_file \/ write_file \/ edit_file \/ list_files\):/);
  assert.doesNotMatch(systemMessage.content, /Python \(list_python_packages \/ run_python\):/);
  assert.doesNotMatch(systemMessage.content, /Skills & roles \(get_skill \/ get_role\):/);
  assert.doesNotMatch(systemMessage.content, /Memory \(update_global_memory \/ update_project_memory\):/);
});
