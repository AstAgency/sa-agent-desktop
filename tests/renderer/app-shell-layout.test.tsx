import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWorkspaceShell } from "./support/app-flow-render";

describe("Workspace shell layout", () => {
  it("opens the thread workspace by default when a session already exists", async () => {
    renderWorkspaceShell();
    expect(await screen.findByTestId("workspace-thread-view")).toBeTruthy();
    ["workspace-shell-topbar", "workspace-shell-nav", "workspace-shell-main", "workspace-shell-context-panel", "workspace-nav-files", "workspace-nav-global-sessions", "workspace-session-create", "workspace-global-session-session-1", "workspace-search-slot", "workspace-runtime-badge", "workspace-context-default-state"].forEach((id) => expect(screen.getByTestId(id)).toBeTruthy());
  });

  it("uses shrinkable grid tracks so the main workspace area can scroll", async () => {
    renderWorkspaceShell();
    const shell = await screen.findByTestId("workspace-shell");
    const body = screen.getByTestId("workspace-shell-body");
    const main = screen.getByTestId("workspace-shell-main");
    expect((shell as HTMLElement).style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect((shell as HTMLElement).style.height).toBe("100vh");
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 340px");
    expect((main as HTMLElement).style.minHeight).toBe("0");
    expect((main as HTMLElement).style.overflow).toBe("auto");
  });

  it("keeps thread composer pinned to the bottom of the thread workspace", async () => {
    renderWorkspaceShell();
    fireEvent.click(await screen.findByTestId("workspace-global-session-session-1"));
    const threadView = await screen.findByTestId("workspace-thread-view");
    expect((threadView as HTMLElement).style.flexDirection).toBe("column");
    expect(screen.getByTestId("workspace-thread-stream").style.overflowY).toBe("auto");
    expect(screen.getByTestId("workspace-thread-composer").style.position).toBe("sticky");
  });

  it("treats the context panel collapse as a distinct layout state", async () => {
    renderWorkspaceShell();
    const body = await screen.findByTestId("workspace-shell-body");
    fireEvent.click(screen.getByTestId("workspace-context-toggle"));
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 56px");
    expect(screen.getByTestId("workspace-context-collapsed")).toBeTruthy();
  });

  it("treats the left sidebar collapse as a distinct layout state with icon-only rail", async () => {
    renderWorkspaceShell();
    const body = await screen.findByTestId("workspace-shell-body");
    fireEvent.click(screen.getByTestId("workspace-nav-toggle"));
    expect((body as HTMLElement).style.gridTemplateColumns).toBe("72px minmax(0, 1fr) 340px");
    expect(screen.getByTestId("workspace-shell-nav").getAttribute("data-collapsed")).toBe("true");
  });
});
