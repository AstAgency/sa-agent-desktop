import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_REGISTRY,
  listAvailableCapabilityNames,
} from "./capability-registry.js";
import { buildCapabilitiesPrompt } from "./build-capabilities-prompt.js";
import { buildToolsManifest } from "./build-tools-manifest.js";

test("registry exposes list_python_packages and run_python", () => {
  assert.deepEqual(listAvailableCapabilityNames(CAPABILITY_REGISTRY), [
    "analyze_image",
    "edit_file",
    "fetch_url",
    "get_role",
    "get_skill",
    "list_files",
    "list_python_packages",
    "read_file",
    "run_python",
    "update_global_memory",
    "update_project_memory",
    "web_search",
    "write_file",
  ]);
});

test("generated capabilities prompt lists available Python tools", () => {
  const prompt = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);

  assert.match(prompt, /Available capabilities \(and only these\):/);
  assert.match(prompt, /list_python_packages \/ run_python/);
});

test("generated capabilities prompt does not contain workflow prose", () => {
  const prompt = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
  const lines = prompt.split("\n");
  const allowedHeaders = new Set([
    "Capability awareness:",
    "Available capabilities (and only these):",
    "Skills, roles and their templates are NOT files on disk:",
    "Unavailable capabilities — do NOT promise these:",
  ]);

  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith("- ")) continue;
    assert.ok(
      allowedHeaders.has(line),
      `unexpected non-bullet prose in capabilities prompt: ${line}`,
    );
  }
});

test("generated tools manifest contains Python workflow guidance", () => {
  const manifest = buildToolsManifest(CAPABILITY_REGISTRY);

  assert.match(manifest, /Python \(list_python_packages \/ run_python\):/);
  assert.match(manifest, /Before writing run_python code/i);
  assert.match(manifest, /Prefer the standard library/i);
});

test("generated tools manifest does not re-list full capability inventory", () => {
  const manifest = buildToolsManifest(CAPABILITY_REGISTRY);

  assert.doesNotMatch(manifest, /Available capabilities \(and only these\):/);
  assert.doesNotMatch(manifest, /Unavailable capabilities/);
  assert.doesNotMatch(manifest, /get_skill \/ get_role: load the full body/i);
});

test("registry maps analyze_image to the vision category", () => {
  const entry = CAPABILITY_REGISTRY.find(({ name }) => name === "analyze_image");
  assert.deepEqual(entry, { name: "analyze_image", category: "vision" });
});

test("vision prompt blocks appear only when analyze_image is available", () => {
  const withVision = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
  assert.match(withVision, /- analyze_image to describe an image file/);
  assert.match(buildToolsManifest(CAPABILITY_REGISTRY), /Vision \(analyze_image\):/);

  const withoutVision = CAPABILITY_REGISTRY.filter(
    ({ category }) => category !== "vision",
  );
  assert.doesNotMatch(buildCapabilitiesPrompt(withoutVision), /analyze_image/);
  assert.doesNotMatch(buildToolsManifest(withoutVision), /Vision \(analyze_image\):/);
});
