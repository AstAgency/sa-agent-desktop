import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWorkspaceShell } from "./support/app-flow-render";
import { buildProject, buildSession } from "./support/app-flow-fixtures";

describe("Session-first sidebar", () => {
  it("renders global sessions above projects and nested project sessions while keeping Files as the only mode tab", async () => {
    renderWorkspaceShell({
      projects: [
        buildProject({ id: "p-1", name: "Alpha" }),
        buildProject({ id: "p-2", name: "Beta" }),
      ],
      globalSessions: [
        buildSession({ id: "g-1", title: "Workspace Inbox", project_id: null }),
      ],
      projectSessions: [
        buildSession({ id: "p1-s1", project_id: "p-1", title: "Alpha kickoff" }),
        buildSession({ id: "p2-s1", project_id: "p-2", title: "Beta review" }),
      ],
    });

    expect(await screen.findByTestId("workspace-nav-files")).toBeTruthy();
    expect(screen.queryByTestId("workspace-nav-home")).toBeNull();
    expect(screen.queryByTestId("workspace-nav-thread")).toBeNull();
    expect(screen.getByTestId("workspace-nav-global-sessions")).toBeTruthy();
    expect(screen.getByTestId("workspace-global-session-g-1")).toBeTruthy();
    expect(screen.getByTestId("workspace-nav-projects-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-project-p-1")).toBeTruthy();
    expect(screen.getByTestId("workspace-project-session-p1-s1")).toBeTruthy();
    expect(screen.getByTestId("workspace-project-session-p2-s1")).toBeTruthy();
    expect(screen.getByTestId("workspace-session-create")).toBeTruthy();
  });

  it("keeps an icon-only collapsed rail", async () => {
    renderWorkspaceShell({
      projects: [buildProject({ id: "p-1", name: "Alpha" })],
      globalSessions: [buildSession({ id: "g-1", title: "Workspace Inbox", project_id: null })],
      projectSessions: [buildSession({ id: "p1-s1", project_id: "p-1", title: "Alpha kickoff" })],
    });

    fireEvent.click(await screen.findByTestId("workspace-nav-toggle"));

    const nav = screen.getByTestId("workspace-shell-nav");
    expect(nav.getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByTestId("workspace-nav-files")).toBeTruthy();
    expect(screen.getByTestId("workspace-session-create")).toBeTruthy();
    expect(nav.textContent).not.toContain("Files");
    expect(nav.textContent).not.toContain("Workspace Inbox");
    expect(nav.textContent).not.toContain("Alpha kickoff");
  });

  it("keeps Files navigation available during user onboarding", async () => {
    renderWorkspaceShell({
      onboarding: { kind: "user", workspaceId: "ws-1", onComplete: () => {} },
    });

    fireEvent.click(await screen.findByTestId("workspace-nav-files"));

    expect(await screen.findByTestId("workspace-files-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-onboarding-locked-popup")).toBeNull();
  });
});
