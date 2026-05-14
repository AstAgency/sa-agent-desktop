export type SkillFrontmatter = {
  description: string | null;
  triggers: string[];
};

const EMPTY: SkillFrontmatter = { description: null, triggers: [] };

export function parseSkillFrontmatter(source: string): SkillFrontmatter {
  if (!source.startsWith("---")) return EMPTY;
  const closingIndex = source.indexOf("\n---", 3);
  if (closingIndex === -1) return EMPTY;
  const body = source.slice(3, closingIndex).replace(/^\s*\n/, "");

  let description: string | null = null;
  let triggers: string[] = [];

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      const value = descMatch[1].trim();
      description = value.length > 0 ? value : null;
      continue;
    }
    const trigMatch = line.match(/^triggers:\s*(\[.*\])\s*$/);
    if (trigMatch) {
      triggers = parseTriggerList(trigMatch[1]);
    }
  }

  return { description, triggers };
}

function parseTriggerList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
