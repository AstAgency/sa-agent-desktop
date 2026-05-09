import { translate } from "../../lib/i18n";
import type { AppLanguage, GeneratedDocument } from "../../lib/types";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

export function FilesView({
  language,
  documents,
  onOpenAgentFilesFolder,
}: {
  language: AppLanguage;
  documents: GeneratedDocument[];
  onOpenAgentFilesFolder: () => void;
}) {
  return (
    <section data-testid="workspace-files-view" style={{ display: "grid", gap: "16px" }}>
      <header style={{ display: "grid", gap: "6px" }}>
        <p style={eyebrowStyle}>{translate(language, "workspace.files.eyebrow")}</p>
        <h2 style={headingStyle}>{translate(language, "workspace.files.title")}</h2>
      </header>
      <section data-testid="workspace-files-artifacts-section" style={sectionStyle}>
        <header style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "2px" }}>
            <h3 style={{ margin: 0 }}>{translate(language, "workspace.files.artifacts")}</h3>
            <p style={descriptionStyle}>{translate(language, "workspace.files.artifacts.description")}</p>
          </div>
          <span style={countStyle}>{documents.length}</span>
        </header>
        {documents.length === 0 ? (
          <WorkspaceEmptyState
            testId="workspace-files-artifacts-empty"
            title={translate(language, "workspace.files.artifacts")}
            description={translate(language, "workspace.files.artifacts.empty")}
          />
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {documents.map((document) => (
              <article
                key={document.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: "color-mix(in srgb, var(--theme-color-panel-muted) 84%, transparent)",
                }}
              >
                <div style={{ display: "grid", gap: "2px" }}>
                  <strong style={{ fontSize: "14px", fontWeight: 520 }}>
                    {document.title ?? document.document_type ?? document.id}
                  </strong>
                  <span style={itemMetaStyle}>{document.document_type ?? translate(language, "workspace.home.artifact.generic")}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section data-testid="workspace-files-physical-section" style={sectionStyle}>
        <header style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "2px" }}>
            <h3 style={{ margin: 0 }}>{translate(language, "workspace.files.physical")}</h3>
            <p style={descriptionStyle}>{translate(language, "workspace.files.physical.description")}</p>
          </div>
        </header>
        <WorkspaceEmptyState
          testId="workspace-files-physical-empty"
          title={translate(language, "workspace.files.physical")}
          description={translate(language, "workspace.files.description")}
          primaryActionLabel={translate(language, "workspace.files.open")}
          onPrimaryAction={onOpenAgentFilesFolder}
        />
      </section>
    </section>
  );
}

const eyebrowStyle = {
  margin: 0,
  fontSize: "11px",
  lineHeight: 1.1,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--theme-color-text-muted)",
};

const headingStyle = {
  margin: 0,
  fontSize: "26px",
  lineHeight: 1.08,
  fontWeight: 560,
  letterSpacing: "-0.03em",
};

const sectionStyle = {
  display: "grid",
  gap: "10px",
  padding: "14px",
  borderRadius: "14px",
  background: "color-mix(in srgb, var(--theme-color-panel-end) 72%, transparent)",
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "start",
  justifyContent: "space-between",
  gap: "12px",
};

const descriptionStyle = {
  margin: 0,
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};

const countStyle = {
  color: "var(--theme-color-text-muted)",
  fontSize: "12px",
};

const itemMetaStyle = {
  color: "var(--theme-color-text-secondary)",
  fontSize: "12px",
};
