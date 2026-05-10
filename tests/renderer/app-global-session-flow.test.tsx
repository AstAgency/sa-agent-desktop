import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "../../src/renderer/components/WorkspaceShell";
import type { CreateProjectInput, SessionMessage } from "../../src/renderer/lib/types";
import { buildMessage, buildProfile, buildSession, buildWorkspace, jsonResponse } from "./support/app-flow-fixtures";
import { installAppFlowEnv } from "./support/app-flow-env";
import { mockFetchRoutes } from "./support/app-flow-fetch";

describe("Global session flow", () => {
  const env = installAppFlowEnv();

  it("uses session message endpoints for global assistant turns", async () => {
    let transcript: SessionMessage[] = [];
    const requests: Array<{ url: string; method: string }> = [];
    const persistedBodies: Array<Record<string, unknown>> = [];

    mockFetchRoutes(env.fetchMock, [
      (input, init) => {
        requests.push({ url: input, method: init?.method ?? "GET" });
        return null;
      },
      (input) => input.endsWith("/v1/llm/responses")
        ? jsonResponse({
          output_text: "Session reply.",
        })
        : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst")
        ? jsonResponse({ agent_key: "sa_analyst", display_name: "SA Analyst", domain: "system analysis", visibility: "public", is_active: true })
        : null,
      (input) => input.endsWith("/v1/agent-profiles/sa_analyst/mcp")
        ? jsonResponse({ mcpServers: {} })
        : null,
      (input) => input.includes("/v1/capabilities")
        ? jsonResponse({ items: [] })
        : null,
      (input) => input.endsWith("/v1/sessions?workspace_id=ws-1")
        ? jsonResponse({ items: [buildSession({ id: "session-1", title: "Global chat" })] })
        : null,
      (input) => input.endsWith("/v1/sessions/session-1")
        ? jsonResponse(buildSession({ id: "session-1", title: "Global chat" }))
        : null,
      (input, init) => input.endsWith("/v1/sessions/session-1/messages") && !init?.method
        ? jsonResponse({ items: transcript })
        : null,
      (input, init) => input.endsWith("/v1/sessions/session-1/messages") && init?.method === "POST"
        ? (() => {
          const payload = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
          persistedBodies.push(payload);
          const role = payload.role === "assistant" ? "assistant" : "user";
          const saved = buildMessage({
            id: `${role}-${persistedBodies.length}`,
            role,
            content_markdown: String(payload.content_markdown ?? ""),
          });
          transcript = [...transcript, saved];
          return jsonResponse({
            status: "accepted",
            session_id: "session-1",
            assistant_message_id: role === "assistant" ? saved.id : null,
          });
        })()
        : null,
      (input, init) => input.endsWith("/v1/me/mcp") && init?.method === "POST"
        ? jsonResponse({ jsonrpc: "2.0", id: "tools-list-1", result: { tools: [] } })
        : null,
      (input) => input.includes("/v1/me/assistant-thread")
        ? new Response("legacy assistant-thread endpoint should not be used", { status: 500 })
        : null,
    ]);

    render(
      <WorkspaceShell
        language="en"
        workspace={buildWorkspace()}
        agents={[{ agent_key: "sa_analyst", display_name: "SA Analyst", is_active: true }]}
        selectedAgentKey="sa_analyst"
        profile={buildProfile({ onboarding_completed: true })}
        project={null}
        projects={[]}
        globalSessions={[buildSession({ id: "session-1", title: "Global chat" })]}
        globalAssistantMessages={[]}
        projectSessions={[]}
        onboarding={null}
        onSelectAgent={vi.fn()}
        onSelectProject={vi.fn()}
        onCreateProject={vi.fn<(value: CreateProjectInput) => Promise<void>>().mockResolvedValue()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    fireEvent.change(await screen.findByPlaceholderText("Ask the workspace agent anything..."), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(await screen.findByText("Session reply.")).toBeTruthy();

    await waitFor(() => {
      expect(persistedBodies).toEqual([
        { role: "user", content_markdown: "Hello" },
        { role: "assistant", actor_id: "sa_analyst", content_markdown: "Session reply." },
      ]);
    });

    expect(requests.filter((request) => request.url.includes("/v1/sessions/session-1/messages"))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "GET" }),
        expect.objectContaining({ method: "POST" }),
      ]),
    );
    expect(requests.some((request) => request.url.includes("/v1/me/assistant-thread"))).toBe(false);
  });
});
