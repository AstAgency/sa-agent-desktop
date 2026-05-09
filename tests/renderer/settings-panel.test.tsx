import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/renderer/components/SettingsPanel";
import type { DebugStateSnapshot } from "../../src/renderer/lib/debug";

describe("SettingsPanel", () => {
  it("renders a readable runtime trace in developer mode", () => {
    const debugStateSnapshot: DebugStateSnapshot = {
      appState: null,
      bootstrapSnapshot: null,
      localStorageAppState: null,
      entityCache: [],
      agentRuntime: [
        {
          id: "trace-1",
          startedAt: "2026-05-09T12:00:00.000Z",
          type: "session.created",
          sessionId: "session-1",
          data: {
            scope: "global",
          },
        },
        {
          id: "trace-2",
          startedAt: "2026-05-09T12:00:01.000Z",
          type: "message.persist.user",
          sessionId: "session-1",
          data: {
            contentLength: 12,
          },
        },
      ],
    };

    render(
      <SettingsPanel
        language="ru"
        themeMode="dark"
        apiBaseUrl="http://127.0.0.1:3000"
        devModeEnabled
        debugStateSnapshot={debugStateSnapshot}
        debugNetworkEntries={[]}
        onClose={vi.fn()}
        onOpenDevtools={vi.fn(async () => ({ ok: true }))}
        onLanguageChange={vi.fn()}
        onThemeModeChange={vi.fn()}
        onApiBaseUrlChange={vi.fn()}
        onResetLocalState={vi.fn()}
      />,
    );

    expect(screen.getByTestId("settings-debug-trace")).toBeTruthy();
    expect(screen.getByText("session.created")).toBeTruthy();
    expect(screen.getByText("message.persist.user")).toBeTruthy();
    expect(screen.getAllByText((content) => content.includes("session: session-1")).length).toBeGreaterThan(0);
  });
});
