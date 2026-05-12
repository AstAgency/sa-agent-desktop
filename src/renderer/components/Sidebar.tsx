import { useEffect, useRef, useState } from "react";
import {
  createProjectAndSelect,
  loadProjectSessions,
  removeProject,
  removeSession,
  renameProject,
  renameSession,
  selectSession,
  startNewGlobalSession,
  startNewProjectSession,
} from "../state/controller";
import { translate, type AppLanguage } from "../lib/i18n";
import {
  setProfileModalOpen,
  toggleSidebarCollapsed,
  useClientState,
} from "../state/store";
import { openProjectFolder, openGlobalRoot } from "../lib/workspace-folders";
import {
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconFolder,
  IconGlobe,
  IconPencil,
  IconTrash,
} from "./icons";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ConfirmDialog } from "./ConfirmDialog";

type DeletePending =
  | { kind: "project"; id: string; name: string }
  | { kind: "session"; id: string; name: string };

export function Sidebar() {
  const profile = useClientState((state) => state.profile);
  const globalSessions = useClientState((state) => state.globalSessions);
  const projects = useClientState((state) => state.projects);
  const projectSessions = useClientState((state) => state.projectSessions);
  const selection = useClientState((state) => state.selection);
  const collapsed = useClientState((state) => state.sidebarCollapsed);
  const language = useClientState((state) => state.language);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeletePending | null>(null);

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
                <button onClick={startNewGlobalSession}>
                  {translate(language, "sidebar.new")}
                </button>
              </div>
              <ul className="sidebar-list">
                {globalSessions.length === 0 ? (
                  <li className="empty">{translate(language, "sidebar.noSessions")}</li>
                ) : null}
                {globalSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    sessionId={session.id}
                    displayName={session.display_name}
                    active={selection.kind === "session" && selection.sessionId === session.id}
                    language={language}
                    onSelect={() => selectSession(session.id)}
                    onDelete={() =>
                      setPendingDelete({ kind: "session", id: session.id, name: session.display_name })
                    }
                  />
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
                  <ProjectGroup
                    key={project.id}
                    projectId={project.id}
                    name={project.name}
                    sessions={sessions}
                    selection={selection}
                    language={language}
                    onLoadSessions={() => {
                      if (!projectSessions[project.id]) {
                        void loadProjectSessions(project.id);
                      }
                    }}
                    onNewChat={() => startNewProjectSession(project.id)}
                    onSelectSession={(sessionId) => selectSession(sessionId)}
                    onDeleteProject={() =>
                      setPendingDelete({ kind: "project", id: project.id, name: project.name })
                    }
                    onDeleteSession={(sessionId, sessionName) =>
                      setPendingDelete({ kind: "session", id: sessionId, name: sessionName })
                    }
                  />
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
            style={{
              opacity: activeProjectId ? 1 : 0.5,
              cursor: activeProjectId ? "pointer" : "not-allowed",
            }}
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

      {pendingDelete ? (
        <ConfirmDialog
          title={translate(
            language,
            pendingDelete.kind === "project"
              ? "confirm.delete.project.title"
              : "confirm.delete.session.title",
          )}
          body={translate(
            language,
            pendingDelete.kind === "project"
              ? "confirm.delete.project.body"
              : "confirm.delete.session.body",
            { name: pendingDelete.name },
          )}
          destructive
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            if (pendingDelete.kind === "project") {
              await removeProject(pendingDelete.id);
            } else {
              await removeSession(pendingDelete.id);
            }
            setPendingDelete(null);
          }}
        />
      ) : null}
    </aside>
  );
}

function ProjectGroup(props: {
  projectId: string;
  name: string;
  sessions: { id: string; display_name: string }[];
  selection: { kind: string; sessionId?: string; projectId?: string };
  language: AppLanguage;
  onLoadSessions: () => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteProject: () => void;
  onDeleteSession: (sessionId: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const kebabRef = useRef<HTMLButtonElement | null>(null);

  const menuItems: ContextMenuItem[] = [
    {
      key: "rename",
      label: translate(props.language, "menu.rename"),
      icon: <IconPencil />,
      onSelect: () => setEditing(true),
    },
    {
      key: "delete",
      label: translate(props.language, "menu.delete"),
      icon: <IconTrash />,
      destructive: true,
      onSelect: () => props.onDeleteProject(),
    },
  ];

  return (
    <details
      onToggle={(event) => {
        if ((event.target as HTMLDetailsElement).open) props.onLoadSessions();
      }}
    >
      <summary>
        {editing ? (
          <InlineRename
            initialValue={props.name}
            onCancel={() => setEditing(false)}
            onSubmit={async (next) => {
              setEditing(false);
              if (next !== props.name) await renameProject(props.projectId, next);
            }}
          />
        ) : (
          <>
            <span className="row-label">{props.name}</span>
            <div className="row-actions">
              <button
                className="inline-link"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.onNewChat();
                }}
              >
                {translate(props.language, "sidebar.newChat")}
              </button>
              <button
                ref={kebabRef}
                className={`row-kebab${menuOpen ? " active" : ""}`}
                aria-label={translate(props.language, "menu.open")}
                title={translate(props.language, "menu.open")}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
              >
                <IconDotsVertical />
              </button>
            </div>
          </>
        )}
      </summary>
      <ul className="sidebar-list project-children">
        {props.sessions.length === 0 ? (
          <li className="empty">{translate(props.language, "sidebar.projectNoSessions")}</li>
        ) : null}
        {props.sessions.map((session) => (
          <SessionRow
            key={session.id}
            sessionId={session.id}
            displayName={session.display_name}
            active={
              props.selection.kind === "session" &&
              props.selection.sessionId === session.id
            }
            language={props.language}
            onSelect={() => props.onSelectSession(session.id)}
            onDelete={() => props.onDeleteSession(session.id, session.display_name)}
          />
        ))}
      </ul>
      {menuOpen ? (
        <ContextMenu
          anchorRef={kebabRef}
          items={menuItems}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
    </details>
  );
}

function SessionRow(props: {
  sessionId: string;
  displayName: string;
  active: boolean;
  language: AppLanguage;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const kebabRef = useRef<HTMLButtonElement | null>(null);

  const menuItems: ContextMenuItem[] = [
    {
      key: "rename",
      label: translate(props.language, "menu.rename"),
      icon: <IconPencil />,
      onSelect: () => setEditing(true),
    },
    {
      key: "delete",
      label: translate(props.language, "menu.delete"),
      icon: <IconTrash />,
      destructive: true,
      onSelect: () => props.onDelete(),
    },
  ];

  if (editing) {
    return (
      <li>
        <div className={`sidebar-row${props.active ? " active" : ""}`}>
          <InlineRename
            initialValue={props.displayName}
            onCancel={() => setEditing(false)}
            onSubmit={async (next) => {
              setEditing(false);
              if (next !== props.displayName) await renameSession(props.sessionId, next);
            }}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <div className={`sidebar-row${props.active ? " active" : ""}${menuOpen ? " menu-open" : ""}`}>
        <button className="row-button" onClick={props.onSelect}>
          <span className="row-label">{props.displayName}</span>
        </button>
        <button
          ref={kebabRef}
          className={`row-kebab${menuOpen ? " active" : ""}`}
          aria-label={translate(props.language, "menu.open")}
          title={translate(props.language, "menu.open")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          <IconDotsVertical />
        </button>
      </div>
      {menuOpen ? (
        <ContextMenu anchorRef={kebabRef} items={menuItems} onClose={() => setMenuOpen(false)} />
      ) : null}
    </li>
  );
}

function InlineRename(props: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (next: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      props.onCancel();
      return;
    }
    void props.onSubmit(trimmed);
  }

  return (
    <input
      ref={inputRef}
      className="row-rename-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          submittedRef.current = true;
          props.onCancel();
        }
      }}
      onBlur={commit}
    />
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
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="actions">
          <button className="cancel" onClick={props.onClose}>
            {translate(language, "project.modal.cancel")}
          </button>
          <button
            className="submit"
            disabled={busy || name.trim().length === 0}
            onClick={submit}
          >
            {busy
              ? translate(language, "project.modal.creating")
              : translate(language, "project.modal.create")}
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
