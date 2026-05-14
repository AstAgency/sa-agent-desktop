/**
 * Section: Capability awareness.
 *
 * Purpose: stop the model from inventing tools that don't exist (visual UI
 * checks, browser previews, sandboxed eval, …) and from imagining that a
 * read tool can validate something it cannot.
 *
 * When applied: included in every system prompt right after execution
 * discipline so the model frames every plan in terms of real capabilities.
 */
export const CAPABILITIES_PROMPT = [
  "Capability awareness:",
  "Available capabilities (and only these):",
  "- read_file / write_file / edit_file / list_files in the workspace (own scope + the cross-scope read paths described in the workspace section below)",
  "- run_python: execute Python in the workspace's bundled interpreter, returns stdout/stderr/exit_code",
  "- fetch_url: GET a public http/https URL and read its text content (private IPs blocked)",
  "- web_search: query the local SearXNG metasearch and read top results",
  "- get_skill / get_role: load the full body of an agent skill or role (see Skills/Roles below)",
  "- update_global_memory / update_project_memory: persist long-lived notes",
  "Skills, roles and their templates are NOT files on disk:",
  "- The agent's skills are listed in the <skills> block of this system prompt (name + description + triggers + bundled file names). Templates like brd_template.md live INSIDE a skill, not in a separate templates/ folder.",
  "- The agent's roles are listed in the <roles> block (name + description).",
  "- To load the full SKILL.md / templates / role prompt, call `get_skill(name)` or `get_role(name)`. They read from an in-memory cache populated at sign-in — no network round trip.",
  "- DO NOT call list_files on paths like skills/, roles/, templates/ or any project subfolder hoping to find them — those directories do not exist in the workspace. If a skill or role is not in the <skills>/<roles> block, it is not available, regardless of what the agent's system prompt says about repo layout.",
  "Unavailable capabilities — do NOT promise these:",
  "- visual rendering checks (you cannot \"see\" how a PDF/HTML/image looks)",
  "- running GUI tests, headless browsers, or screenshot diffs",
  "- read-after-write \"verification\" that a write_file already guarantees",
  "- waiting for the user to confirm something inside a turn — finish the turn instead",
  "Rule of thumb before calling a tool: ask yourself \"will this tool give me new information that I cannot already deduce?\". If the answer is no, skip the tool and answer directly.",
].join("\n");
