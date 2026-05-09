import type { GeneratedDocument, ProjectSummary, WorkspaceSummary } from "./types";

export type LocalAgentFile = {
  relativePath: string;
  content: string;
};

export function buildProjectArtifactFiles(
  _workspace: WorkspaceSummary,
  project: ProjectSummary,
  documents: GeneratedDocument[],
): LocalAgentFile[] {
  const projectFolderName = sanitizePathSegment(`${project.key}-${project.id}`);

  return documents.flatMap((document) => {
    const content = typeof document.current_content_markdown === "string"
      ? document.current_content_markdown
      : null;

    if (!content) {
      return [];
    }

    const baseName = sanitizePathSegment(
      document.title?.trim() || document.document_type?.trim() || document.id,
    );

    return [
      {
        relativePath: `projects/${projectFolderName}/documents/${baseName}-${document.id}.md`,
        content,
      },
    ];
  });
}

export async function syncProjectArtifactFiles(
  workspace: WorkspaceSummary,
  project: ProjectSummary,
  documents: GeneratedDocument[],
) {
  const files = buildProjectArtifactFiles(workspace, project, documents);

  if (files.length === 0 || !window.saAgent?.files?.writeFiles) {
    return;
  }

  await window.saAgent.files.writeFiles(files);
}

export async function openAgentFilesFolder() {
  if (!window.saAgent?.files?.openFolder) {
    return {
      ok: false,
      error: "Agent files bridge is unavailable in the current renderer process.",
    };
  }

  return window.saAgent.files.openFolder();
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "artifact";
}
