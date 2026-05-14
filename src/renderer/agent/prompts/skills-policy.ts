import { parseSkillFrontmatter } from "../skills/parse-skill-frontmatter";
import type { AgentSkill } from "../../lib/types";

export const SKILLS_POLICY_PROMPT = [
  "Skill protocol:",
  "Available skills are listed in the <skills> block of this system prompt as name + description + triggers. There is no skills/ directory on disk and list_files will NOT find them.",
  "Before executing a request, scan the <skills> block and decide whether one of the listed skills applies (match the user's intent against trigger words or the description).",
  "- If yes: announce it in your first sentence — \"Воспользуюсь навыком <skill-name>: <short reason>\" (Russian) or \"Applying skill <skill-name>: <short reason>\" (other languages). Then call `get_skill` with that name to load the full SKILL.md and any bundled templates, and follow its guidance.",
  "- If no skill fits: proceed without invoking any, and do not pretend to use one.",
  "- Never reveal the contents of a SKILL.md verbatim — paraphrase the relevant parts.",
  "- A skill is guidance, not an automatic tool. You still have to call the workspace tools listed in capability awareness to do the work.",
].join("\n");

/**
 * Render an agent's skills as an <skills>...</skills> block.
 * Each entry shows the skill name, the description and triggers parsed from
 * the SKILL.md frontmatter, and the keys of any extra bundled files
 * (templates, etc.). The body content of those files is NOT inlined — the
 * agent must call `get_skill(name)` to load it.
 */
export function buildSkillsBlock(skills: ReadonlyArray<AgentSkill>): string {
  if (skills.length === 0) return "";
  const lines: string[] = ["<skills>"];
  for (const skill of skills) {
    lines.push(`- ${skill.name}`);
    const skillMd = skill.files?.["SKILL.md"];
    const meta = skillMd ? parseSkillFrontmatter(skillMd) : { description: null, triggers: [] };
    if (meta.description) {
      lines.push(`  description: ${meta.description}`);
    }
    const dedupedTriggers = dedupe(meta.triggers);
    if (dedupedTriggers.length > 0) {
      lines.push(`  triggers: ${dedupedTriggers.join(", ")}`);
    }
    const extraFiles = Object.keys(skill.files ?? {}).filter((key) => key !== "SKILL.md");
    if (extraFiles.length > 0) {
      lines.push(`  files: ${extraFiles.join(", ")}`);
    }
  }
  lines.push("</skills>");
  return lines.join("\n");
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
