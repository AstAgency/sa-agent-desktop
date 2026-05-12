import { useState } from "react";
import {
  clearSelection,
  createProjectAndSelect,
  loadProjectSessions,
  selectSession,
  startNewGlobalSession,
  startNewProjectSession,
} from "../state/controller";
import { getCurrentBackendUrl } from "../lib/api";
import { useClientState } from "../state/store";

export function Sidebar() {
  const profile = useClientState((state) => state.profile);
  const globalSessions = useClientState((state) => state.globalSessions);
  const projects = useClientState((state) => state.projects);
  const projectSessions = useClientState((state) => state.projectSessions);
  const selection = useClientState((state) => state.selection);
  const [showProjectModal, setShowProjectModal] = useState(false);

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <h2>SA-Agent</h2>
        {profile ? <span style={{ color: "var(--text-secondary)" }}>{profile.name}</span> : null}
      </header>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Global Sessions</span>
          <button onClick={startNewGlobalSession}>+ New</button>
        </div>
        <ul className="sidebar-list">
          {globalSessions.length === 0 ? <li className="empty">no sessions yet</li> : null}
          {globalSessions.map((session) => (
            <li key={session.id}>
              <button
                className={selection.kind === "session" && selection.sessionId === session.id ? "active" : ""}
                onClick={() => selectSession(session.id)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section sidebar-projects">
        <div className="sidebar-section-title">
          <span>Projects</span>
          <button onClick={() => setShowProjectModal(true)}>+ New</button>
        </div>
        {projects.length === 0 ? <div className="empty">no projects yet</div> : null}
        {projects.map((project) => {
          const sessions = projectSessions[project.id] ?? [];
          return (
            <details
              key={project.id}
              onToggle={(event) => {
                if ((event.target as HTMLDetailsElement).open && !projectSessions[project.id]) {
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
                  + new chat
                </button>
              </summary>
              <ul className="sidebar-list project-children">
                {sessions.length === 0 ? <li className="empty">no sessions</li> : null}
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      className={
                        selection.kind === "session" && selection.sessionId === session.id ? "active" : ""
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

      <div className="sidebar-footer">
        <button onClick={clearSelection}>Close active</button>
        <span>backend: {getCurrentBackendUrl()}</span>
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await createProjectAndSelect({ name: name.trim(), description: description.trim() || undefined });
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
        <h3>New project</h3>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <label>
          Description (optional)
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="actions">
          <button className="cancel" onClick={props.onClose}>Cancel</button>
          <button className="submit" disabled={busy || name.trim().length === 0} onClick={submit}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
