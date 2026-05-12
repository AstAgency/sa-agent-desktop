import { useState } from "react";
import {
  createProjectAndSelect,
  loadProjectSessions,
  selectSession,
  startNewGlobalSession,
  startNewProjectSession,
} from "../state/controller";
import { translate } from "../lib/i18n";
import {
  setProfileModalOpen,
  toggleSidebarCollapsed,
  useClientState,
} from "../state/store";
import { openProjectFolder, openGlobalRoot } from "../lib/workspace-folders";

export function Sidebar() {
  const profile = useClientState((state) => state.profile);
  const globalSessions = useClientState((state) => state.globalSessions);
  const projects = useClientState((state) => state.projects);
  const projectSessions = useClientState((state) => state.projectSessions);
  const selection = useClientState((state) => state.selection);
  const collapsed = useClientState((state) => state.sidebarCollapsed);
  const language = useClientState((state) => state.language);
  const [showProjectModal, setShowProjectModal] = useState(false);

  const activeProjectId =
    selection.kind === "new-project"
      ? selection.projectId
      : selection.kind === "session"
        ? findSessionProjectId(selection.sessionId, projectSessions)
        : null;

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top">
        {collapsed ? null : (
          <div className="sidebar-brand">
            <span className="brand-mark">SA</span>
            <span>SA-Agent</span>
          </div>
        )}
        <button
          className="icon-button"
          onClick={toggleSidebarCollapsed}
          title={translate(language, collapsed ? "sidebar.expand" : "sidebar.collapse")}
          aria-label={translate(language, collapsed ? "sidebar.expand" : "sidebar.collapse")}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      <div className="sidebar-body">
        {collapsed ? (
          <div className="sidebar-collapsed-rail">
            <button
              className="icon-button"
              onClick={startNewGlobalSession}
              title={translate(language, "sidebar.globalSessions")}
              aria-label={translate(language, "sidebar.globalSessions")}
            >
              <IconChat />
            </button>
            <button
              className="icon-button"
              onClick={() => setShowProjectModal(true)}
              title={translate(language, "sidebar.projects")}
              aria-label={translate(language, "sidebar.projects")}
            >
              <IconFolder />
            </button>
          </div>
        ) : (
          <>
            <div className="sidebar-section">
              <div className="sidebar-section-title">
                <span>{translate(language, "sidebar.globalSessions")}</span>
                <button onClick={startNewGlobalSession}>{translate(language, "sidebar.new")}</button>
              </div>
              <ul className="sidebar-list">
                {globalSessions.length === 0 ? (
                  <li className="empty">{translate(language, "sidebar.noSessions")}</li>
                ) : null}
                {globalSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      className={
                        selection.kind === "session" && selection.sessionId === session.id
                          ? "active"
                          : ""
                      }
                      onClick={() => selectSession(session.id)}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {session.display_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sidebar-section sidebar-projects">
              <div className="sidebar-section-title">
                <span>{translate(language, "sidebar.projects")}</span>
                <button onClick={() => setShowProjectModal(true)}>
                  {translate(language, "sidebar.new")}
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="empty">{translate(language, "sidebar.noProjects")}</div>
              ) : null}
              {projects.map((project) => {
                const sessions = projectSessions[project.id] ?? [];
                return (
                  <details
                    key={project.id}
                    onToggle={(event) => {
                      if (
                        (event.target as HTMLDetailsElement).open &&
                        !projectSessions[project.id]
                      ) {
                        void loadProjectSessions(project.id);
                      }
                    }}
                  >
                    <summary>
                      <span>{project.name}</span>
                      <button
                        className="inline-link"
                        onClick={(event) => {
                          event.preventDefault();
                          startNewProjectSession(project.id);
                        }}
                      >
                        {translate(language, "sidebar.newChat")}
                      </button>
                    </summary>
                    <ul className="sidebar-list project-children">
                      {sessions.length === 0 ? (
                        <li className="empty">
                          {translate(language, "sidebar.projectNoSessions")}
                        </li>
                      ) : null}
                      {sessions.map((session) => (
                        <li key={session.id}>
                          <button
                            className={
                              selection.kind === "session" && selection.sessionId === session.id
                                ? "active"
                                : ""
                            }
                            onClick={() => selectSession(session.id)}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {session.display_name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="row">
          <button
            className="sidebar-footer-button"
            disabled={!activeProjectId}
            onClick={() => activeProjectId && void openProjectFolder(activeProjectId)}
            title={translate(language, "sidebar.openProjectFolder")}
            aria-label={translate(language, "sidebar.openProjectFolder")}
            style={{ opacity: activeProjectId ? 1 : 0.5, cursor: activeProjectId ? "pointer" : "not-allowed" }}
          >
            <IconFolder />
            <span className="label">{translate(language, "sidebar.openProjectFolder")}</span>
          </button>
          <button
            className="sidebar-footer-button"
            onClick={() => void openGlobalRoot()}
            title={translate(language, "sidebar.openGlobalFolder")}
            aria-label={translate(language, "sidebar.openGlobalFolder")}
          >
            <IconGlobe />
            <span className="label">{translate(language, "sidebar.openGlobalFolder")}</span>
          </button>
        </div>
        <button
          className="profile-card"
          onClick={() => setProfileModalOpen(true)}
          title={profile?.name ?? translate(language, "profile.unknown")}
        >
          <span className="avatar">{getInitials(profile?.name ?? "?")}</span>
          <div className="info">
            <span className="name">{profile?.name ?? translate(language, "profile.unknown")}</span>
            <span className="sub">{translate(language, "profile.subtitle")}</span>
          </div>
        </button>
      </div>

      {showProjectModal ? (
        <NewProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={() => setShowProjectModal(false)}
        />
      ) : null}
    </aside>
  );
}

function NewProjectModal(props: { onClose: () => void; onCreated: () => void }) {
  const language = useClientState((state) => state.language);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await createProjectAndSelect({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      props.onCreated();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h3>{translate(language, "project.modal.title")}</h3>
        <label>
          {translate(language, "project.modal.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <label>
          {translate(language, "project.modal.description")}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="actions">
          <button className="cancel" onClick={props.onClose}>
            {translate(language, "project.modal.cancel")}
          </button>
          <button className="submit" disabled={busy || name.trim().length === 0} onClick={submit}>
            {busy ? translate(language, "project.modal.creating") : translate(language, "project.modal.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

function findSessionProjectId(
  sessionId: string,
  projectSessions: Record<string, { id: string }[]>,
): string | null {
  for (const [projectId, sessions] of Object.entries(projectSessions)) {
    if (sessions.some((session) => session.id === sessionId)) return projectId;
  }
  return null;
}

function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
