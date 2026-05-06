import { describe, expect, it } from "vitest";
import {
  decideInitialScreen,
  resolveBootstrapNextScreen,
  selectBootstrapProject,
} from "../../src/renderer/state/bootstrap";

describe("decideInitialScreen", () => {
  it("shows language setup when no language is stored", () => {
    expect(decideInitialScreen({ language: null, isAuthenticated: false })).toBe("language-setup");
  });

  it("shows auth after language is chosen but before login", () => {
    expect(decideInitialScreen({ language: "ru", isAuthenticated: false })).toBe("auth");
  });

  it("shows bootstrapping after language is chosen and auth is complete", () => {
    expect(decideInitialScreen({ language: "en", isAuthenticated: true })).toBe("bootstrapping");
  });
});

describe("resolveBootstrapNextScreen", () => {
  it("stops at user onboarding before project selection", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: false },
        workspaces: [{ id: "ws-1" }],
        projects: [],
      }),
    ).toBe("workspace-shell");
  });

  it("shows empty projects after onboarding is complete and no projects exist", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [],
        selectedProject: null,
      }),
    ).toBe("empty-projects");
  });

  it("stops in project onboarding when the selected project is incomplete", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [{ id: "p-1" }],
        selectedProject: { id: "p-1", onboarding_completed: false },
      }),
    ).toBe("workspace-shell");
  });

  it("shows the workspace shell after both onboarding flows complete", () => {
    expect(
      resolveBootstrapNextScreen({
        profile: { onboarding_completed: true },
        workspaces: [{ id: "ws-1" }],
        projects: [{ id: "p-1" }],
        selectedProject: { id: "p-1", onboarding_completed: true },
      }),
    ).toBe("workspace-shell");
  });
});

describe("selectBootstrapProject", () => {
  const projects = [
    { id: "p-1", onboarding_completed: true },
    { id: "p-2", onboarding_completed: false },
  ];

  it("keeps a previously selected project when it still exists", () => {
    expect(selectBootstrapProject(projects, "p-2")).toEqual(projects[1]);
  });

  it("falls back to the first project when the previous selection is gone", () => {
    expect(selectBootstrapProject(projects, "missing-project")).toEqual(projects[0]);
  });
});
