import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput } from "../../src/renderer/lib/types";
import { files, installAppFlowEnv } from "./support/app-flow-env";
import { buildAssistantThread, buildProfile, buildProject, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { mockFetchRoutes } from "./support/app-flow-fetch";
import { renderWorkspaceShell } from "./support/app-flow-render";

describe("Workspace files and navigation actions", () => {
  const env = installAppFlowEnv();

  it("separates logical artifacts from physical workspace files in Files mode", async () => {
    renderWorkspaceShell();
    fireEvent.click(await screen.findByTestId("workspace-nav-files"));
    expect(await screen.findByTestId("workspace-files-artifacts-section")).toBeTruthy();
    expect(screen.getByTestId("workspace-files-physical-section")).toBeTruthy();
  });

  it("opens the shared agent files folder from the sidebar", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/mcp/sa_analyst" } } }) : null,
      (input) => input.includes("/v1/capabilities") ? jsonResponse({ items: [] }) : null,
      (input) => input.endsWith("/v1/me/assistant-thread") ? jsonResponse({ thread: buildAssistantThread({ id: "session-1", title: "Global chat" }), messages: [] }) : null,
    ]);
    renderWorkspaceShell();
    fireEvent.click(await screen.findByTestId("workspace-nav-files"));
    fireEvent.click(await screen.findByRole("button", { name: "Open folder" }));
    await waitFor(() => expect(files.openFolder).toHaveBeenCalledTimes(1));
  });

  it("routes project creation into the global assistant thread instead of opening a form popup", async () => {
    renderWorkspaceShell({ projects: [buildProject({ id: "p-1", name: "Alpha" }), buildProject({ id: "p-2", name: "Beta" })] });
    fireEvent.click(await screen.findByTestId("workspace-project-create"));
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    expect((screen.getByPlaceholderText("Ask the workspace agent anything...") as HTMLTextAreaElement).value).toContain("create a new project");
  });

  it("does not expose the legacy capability runner in the thread composer", async () => {
    mockFetchRoutes(env.fetchMock, [
      (input) => input.endsWith("/v1/agent-profiles") ? jsonResponse({ items: [{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }] }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst") ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true }) : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp") ? jsonResponse({ mcpServers: { backend: { transport: "http", url: "http://127.0.0.1:3000/v1/mcp/sa_analyst" } } }) : null,
      (input) => input.endsWith("/v1/me/assistant-thread") ? jsonResponse({ thread: buildAssistantThread({ id: "session-1", title: "Global chat" }), messages: [] }) : null,
    ]);
    render(<WorkspaceShell language="en" workspace={buildWorkspace()} agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]} selectedAgentKey="sa_analyst" profile={buildProfile({ onboarding_completed: true })} project={null} projects={[]} globalSessions={[buildSession({ id: "session-1", title: "Global chat" })]} globalAssistantMessages={[]} projectSessions={[]} onboarding={null} onSelectAgent={vi.fn()} onSelectProject={vi.fn()} onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()} onOpenSettings={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    expect(await screen.findByTestId("workspace-thread-composer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Run capability" })).toBeNull();
    expect(screen.queryByText("Generate BRD")).toBeNull();
  });
});
