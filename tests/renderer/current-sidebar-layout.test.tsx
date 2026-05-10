import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsSection } from "../../src/renderer/components/sidebar/ProjectsSection";
import { SidebarLayout } from "../../src/renderer/components/sidebar/SidebarLayout";
import { buildProfile, buildProject, buildSession } from "./support/app-flow-fixtures";

describe("Current sidebar layout", () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
    window.dispatchEvent(new Event("resize"));
  });

  it("does not block the main surface with a backdrop by default on narrow viewports", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 900,
    });
    window.dispatchEvent(new Event("resize"));

    render(
      <SidebarLayout
        language="ru"
        workspaceName="SA-Agent"
        agents={[{ agent_key: "sa-agent", display_name: "SA-Agent", is_active: true }]}
        selectedAgentKey="sa-agent"
        profile={buildProfile()}
        projectGroups={[]}
        globalSessions={[]}
        selectedProjectId={null}
        selectedSessionId={null}
        onSelectAgent={vi.fn()}
        onProjectClick={vi.fn()}
        onSessionClick={vi.fn()}
        onNewGlobalSession={vi.fn()}
        onCreateProject={vi.fn()}
        onFilesClick={vi.fn()}
        onProfileClick={vi.fn()}
        onSearchResult={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("sidebar-layout-backdrop")).toBeNull();
  });

  it("renders the agent dropdown on an opaque floating surface", () => {
    render(
      <SidebarLayout
        language="ru"
        workspaceName="SA-Agent"
        agents={[
          { agent_key: "sa-agent", display_name: "SA-Agent", is_active: true },
          { agent_key: "systems-analyst", display_name: "Systems Analyst", is_active: true },
        ]}
        selectedAgentKey="sa-agent"
        profile={buildProfile()}
        projectGroups={[]}
        globalSessions={[]}
        selectedProjectId={null}
        selectedSessionId={null}
        onSelectAgent={vi.fn()}
        onProjectClick={vi.fn()}
        onSessionClick={vi.fn()}
        onNewGlobalSession={vi.fn()}
        onCreateProject={vi.fn()}
        onFilesClick={vi.fn()}
        onProfileClick={vi.fn()}
        onSearchResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Выбрать агента" }));

    const listbox = screen.getByRole("listbox", { name: "Выбрать агента" }) as HTMLDivElement;
    expect(listbox.style.backdropFilter).toBe("blur(18px)");
    expect(listbox.getAttribute("style")).toContain("linear-gradient");
  });

  it("keeps project rows valid and indents nested session chips from the active project row", () => {
    const { container } = render(
      <ProjectsSection
        language="ru"
        collapsed={false}
        projectGroups={[
          {
            project: buildProject({ id: "project-1", name: "AST Systems" }),
            sessions: [
              buildSession({ id: "session-1", project_id: "project-1", title: "Онбординг проекта" }),
            ],
          },
        ]}
        selectedProjectId="project-1"
        selectedSessionId="session-1"
        onProjectClick={vi.fn()}
        onSessionClick={vi.fn()}
        onCreateProject={vi.fn()}
      />,
    );

    expect(container.querySelector("button button")).toBeNull();
    expect(screen.getByRole("button", { name: "Онбординг проекта" }).getAttribute("style")).toContain("margin-left: 12px");
  });
});
