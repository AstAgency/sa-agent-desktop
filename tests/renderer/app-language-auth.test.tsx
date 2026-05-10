import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/renderer/App";
import { buildAssistantThread, buildProfile, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv, storage } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("App language and auth flow", () => {
  const env = installAppFlowEnv();

  it("moves from language setup to auth after choosing a language", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Choose your language" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Русский" }));
    await waitFor(() => expect(storage.setAppState).toHaveBeenCalledWith({ language: "ru" }));
    expect(await screen.findByRole("heading", { name: "Войти в SA-Agent" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("opens workspace shell instead of a separate empty-projects screen when no projects exist", async () => {
    env.setState({ language: "en", isAuthenticated: false, apiBaseUrl: null, devModeEnabled: true });
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/me/bootstrap") ? jsonResponse({ viewer_profile: buildProfile({ onboarding_completed: true }), assistant_thread: buildAssistantThread(), assistant_messages: [], workspaces: [buildWorkspace()] }) : null,
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/workspaces") ? jsonResponse({ items: [buildWorkspace()] }) : null,
      (input) => input.endsWith("/v1/workspaces/ws-1/projects") ? jsonResponse({ items: [] }) : null,
    ]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Sign in to SA-Agent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    expect(screen.getByTestId("workspace-session-create")).toBeTruthy();
  });

  it("restores saved agent selection and falls back to the first active agent when it is invalid", async () => {
    env.setState({ language: "en", isAuthenticated: true, selectedAgentKey: "missing-agent", apiBaseUrl: null, devModeEnabled: true });
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/me/bootstrap") ? jsonResponse({ viewer_profile: buildProfile({ onboarding_completed: true }), assistant_thread: buildAssistantThread(), assistant_messages: [], workspaces: [buildWorkspace()] }) : null,
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "inactive-agent", display_name: "Inactive Agent", is_active: false }, { agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }, { agent_key: "biz_architect", display_name: "Biz Architect", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/workspaces") ? jsonResponse({ items: [buildWorkspace()] }) : null,
      (input) => input.endsWith("/v1/workspaces/ws-1/projects") ? jsonResponse({ items: [] }) : null,
    ]);

    render(<App />);
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    await waitFor(() => expect(storage.setAppState).toHaveBeenCalledWith({ selectedAgentKey: "sa_analyst" }));
  });
});
