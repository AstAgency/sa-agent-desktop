import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelExecution,
  dismissCommitment,
  getDocumentRevisions,
  getProject,
  getProjectAgents,
  getProjectThreads,
  getThreadMessages,
} from "../../src/renderer/lib/api";

describe("renderer api helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches project agents from the canonical project agents endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "agent-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await getProjectAgents("project-1");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/v1/projects/project-1/agents", undefined);
  });

  it("fetches project threads from the canonical threads endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "thread-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await getProjectThreads("project-1");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/v1/projects/project-1/threads", undefined);
  });

  it("fetches thread messages from the canonical thread messages endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "message-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await getThreadMessages("thread-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/v1/threads/thread-1/messages",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("fetches document revisions from the canonical document revisions endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "revision-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await getDocumentRevisions("document-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/v1/documents/document-1/revisions",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("cancels an execution via the canonical cancel endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ execution_id: "exec-1", status: "cancelled" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await cancelExecution("exec-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/v1/executions/exec-1/cancel",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("dismisses commitments through the canonical dismiss endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ commitment_id: "commitment-1", status: "dismissed" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await dismissCommitment("commitment-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/v1/commitments/commitment-1/dismiss",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("keeps project resource reads on canonical project endpoints", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "project-1" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await getProject("project-1");

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/v1/projects/project-1", undefined);
  });
});
