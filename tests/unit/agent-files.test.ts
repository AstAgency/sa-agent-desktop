import { describe, expect, it } from "vitest";
import { buildProjectArtifactFiles } from "../../src/renderer/lib/agent-files";
import type { GeneratedDocument, ProjectSummary, WorkspaceSummary } from "../../src/renderer/lib/types";

describe("buildProjectArtifactFiles", () => {
  it("creates markdown artifact entries for generated project documents", () => {
    const workspace = buildWorkspace();
    const project = buildProject();
    const documents = [
      buildDocument({
        id: "doc-1",
        title: "BRD Overview",
        current_content_markdown: "# BRD\n\nContent",
      }),
      buildDocument({
        id: "doc-2",
        title: null,
        document_type: "spec",
        current_content_markdown: "Body",
      }),
    ];

    expect(buildProjectArtifactFiles(workspace, project, documents)).toEqual([
      {
        relativePath: "projects/prj-product-discovery/documents/brd-overview-doc-1.md",
        content: "# BRD\n\nContent",
      },
      {
        relativePath: "projects/prj-product-discovery/documents/spec-doc-2.md",
        content: "Body",
      },
    ]);
  });

  it("skips documents without markdown content", () => {
    expect(
      buildProjectArtifactFiles(buildWorkspace(), buildProject(), [
        buildDocument({
          id: "doc-1",
          current_content_markdown: null,
        }),
      ]),
    ).toEqual([]);
  });
});

function buildWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws-1",
    name: "Personal Workspace",
    slug: "personal",
    created_by_user_id: "user-1",
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: "product-discovery",
    workspace_id: "ws-1",
    key: "PRJ",
    name: "Product Discovery",
    description: null,
    onboarding_skill_id: null,
    onboarding_payload: null,
    preferred_user_name: null,
    preferred_agent_name: null,
    activity_domain: null,
    onboarding_completed: true,
    onboarding_completed_at: null,
    lifecycle_state: "active",
    created_by_user_id: "user-1",
    created_at: "2026-05-07T00:00:00.000Z",
    updated_at: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}

function buildDocument(overrides: Partial<GeneratedDocument> & Pick<GeneratedDocument, "id">): GeneratedDocument {
  return {
    id: overrides.id,
    project_id: overrides.project_id ?? "product-discovery",
    title: "title" in overrides ? overrides.title ?? null : "Generated Document",
    document_type: "document_type" in overrides ? overrides.document_type ?? null : "brd",
    current_content_markdown:
      "current_content_markdown" in overrides ? overrides.current_content_markdown ?? null : "Content",
    created_at: overrides.created_at ?? "2026-05-07T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-07T00:00:00.000Z",
  };
}
