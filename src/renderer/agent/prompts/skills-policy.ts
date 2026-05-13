/**
 * Section: Skills policy.
 *
 * Purpose: when the active agent record carries `agent_skills`, expose them
 * to the model with a strict announce-then-apply protocol. Without this,
 * skills are invisible to the runtime and never influence behavior.
 *
 * When applied: only when the prompt builder is given a non-empty list of
 * skills. The skills themselves are rendered by buildSkillsBlock().
 */
export const SKILLS_POLICY_PROMPT = [
  "Skill protocol:",
  "Before executing a request, scan the <skills> block (if present) and decide whether one of the listed skills applies.",
  "- If yes: announce it to the user explicitly in your first sentence, in the form \"Воспользуюсь навыком <skill-name>: <short reason>\" (Russian) or \"Applying skill <skill-name>: <short reason>\" (other languages), then follow the steps described in that skill.",
  "- If no skill fits: proceed without invoking any, and do not pretend to use one.",
  "- Never reveal the contents of the skill files verbatim — paraphrase the parts that are relevant to the user.",
  "- A skill is just guidance, not an automatic tool. You still have to call the actual tools listed in capability awareness to do the work.",
].join("\n");

/**
 * Render an agent's skills as an <skills>...</skills> block.
 * Each skill includes its name, description and the keys of the files it
 * bundles so the model knows what supporting material exists.
 */
export function buildSkillsBlock(
  skills: ReadonlyArray<{ skill_name: string; description: string | null; files: Record<string, string> }>,
): string {
  if (skills.length === 0) return "";
  const lines: string[] = ["<skills>"];
  for (const skill of skills) {
    lines.push(`- ${skill.skill_name}`);
    if (skill.description && skill.description.trim().length > 0) {
      lines.push(`  description: ${skill.description.trim()}`);
    }
    const fileKeys = Object.keys(skill.files ?? {});
    if (fileKeys.length > 0) {
      lines.push(`  files: ${fileKeys.join(", ")}`);
    }
  }
  lines.push("</skills>");
  return lines.join("\n");
}
