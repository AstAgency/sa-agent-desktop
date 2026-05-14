import type { AgentRole, AgentSkill } from "../../lib/types";

export type FormatResult = {
  ok: boolean;
  text: string;
};

export type GetSkillInput = {
  skill: AgentSkill | null;
  requestedName: string;
  available: ReadonlyArray<string>;
};

export type GetRoleInput = {
  role: AgentRole | null;
  requestedName: string;
  available: ReadonlyArray<string>;
};

export function formatGetSkillResult(input: GetSkillInput): FormatResult {
  if (!input.skill) {
    return { ok: false, text: notFoundText("skill", input.requestedName, input.available) };
  }
  const sections: string[] = [`skill: ${input.skill.name}`];
  for (const [filename, contents] of Object.entries(input.skill.files ?? {})) {
    sections.push(`\n=== ${filename} ===\n${contents.trimEnd()}`);
  }
  return { ok: true, text: sections.join("\n") };
}

export function formatGetRoleResult(input: GetRoleInput): FormatResult {
  if (!input.role) {
    return { ok: false, text: notFoundText("role", input.requestedName, input.available) };
  }
  const sections: string[] = [`role: ${input.role.name}`];
  const description = input.role.description?.trim();
  if (description) sections.push(`description: ${description}`);
  sections.push(`\n=== prompt ===\n${input.role.prompt.trimEnd()}`);
  return { ok: true, text: sections.join("\n") };
}

function notFoundText(kind: "skill" | "role", requested: string, available: ReadonlyArray<string>): string {
  if (available.length === 0) {
    return `no ${kind}s are available for this agent.`;
  }
  return `no ${kind} named "${requested}". Available ${kind}s: ${available.join(", ")}`;
}
