import type {
  CapabilityCategoryName,
  CapabilityDefinition,
} from "./capability-registry.js";

const CAPABILITY_CATEGORY_ORDER: readonly CapabilityCategoryName[] = [
  "filesystem",
  "python",
  "network",
  "agent_content",
  "memory",
];

const CAPABILITY_CATEGORY_LINES: Record<CapabilityCategoryName, string> = {
  filesystem:
    "- read_file / write_file / edit_file / list_files in the workspace (own scope + the cross-scope read paths described in the workspace section)",
  python:
    "- list_python_packages / run_python for bundled Python package discovery and execution in the workspace",
  network:
    "- fetch_url / web_search for public web content discovery and retrieval",
  agent_content:
    "- get_skill / get_role to load the full body of an available skill or role",
  memory:
    "- update_global_memory / update_project_memory to overwrite durable notes",
};

export function buildCapabilitiesPrompt(registry: readonly CapabilityDefinition[]): string {
  const categories = new Set(registry.map(({ category }) => category));
  const availableLines = CAPABILITY_CATEGORY_ORDER.filter((category) => categories.has(category)).map(
    (category) => CAPABILITY_CATEGORY_LINES[category],
  );

  return [
    "Capability awareness:",
    "Available capabilities (and only these):",
    ...availableLines,
    "Skills, roles and their templates are NOT files on disk:",
    "- The agent's skills are listed in the <skills> block of this system prompt (name + description + triggers + bundled file names). Templates like brd_template.md live INSIDE a skill, not in a separate templates/ folder.",
    "- The agent's roles are listed in the <roles> block (name + description).",
    "- To load the full SKILL.md / templates / role prompt, call `get_skill(name)` or `get_role(name)`. They read from an in-memory cache populated at sign-in — no network round trip.",
    "- DO NOT call list_files on paths like skills/, roles/, templates/ or any project subfolder hoping to find them — those directories do not exist in the workspace. If a skill or role is not in the <skills>/<roles> block, it is not available, regardless of what the agent's system prompt says about repo layout.",
    "Unavailable capabilities — do NOT promise these:",
    '- visual rendering checks (you cannot "see" how a PDF/HTML/image looks)',
    '- running GUI tests, headless browsers, or screenshot diffs',
    '- read-after-write "verification" that a write_file already guarantees',
    '- waiting for the user to confirm something inside a turn — finish the turn instead',
  ].join("\n");
}
