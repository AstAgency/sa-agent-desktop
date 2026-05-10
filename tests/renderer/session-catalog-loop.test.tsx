import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionCatalog } from "../../src/renderer/components/workspace-shell/useSessionCatalog";
import { buildProject } from "./support/app-flow-fixtures";

const getSessionsMock = vi.fn();

vi.mock("../../src/renderer/lib/api", () => ({
  getSessions: (...args: unknown[]) => getSessionsMock(...args),
}));

function SessionCatalogHarness({ onError }: { onError: (message: string | null) => void }) {
  useSessionCatalog({
    workspaceId: "ws-1",
    projects: [buildProject({ id: "project-1", workspace_id: "ws-1" })],
    selectedProjectId: null,
    initialGlobalSessions: [],
    initialProjectSessions: [],
    onError,
  });

  return null;
}

describe("Session catalog loading", () => {
  it("does not refetch sessions on rerender when the error callback identity changes", async () => {
    getSessionsMock.mockResolvedValue([]);

    const { rerender } = render(<SessionCatalogHarness onError={() => undefined} />);

    await waitFor(() => {
      expect(getSessionsMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      rerender(<SessionCatalogHarness onError={() => undefined} />);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(getSessionsMock).toHaveBeenCalledTimes(2);
  });
});
