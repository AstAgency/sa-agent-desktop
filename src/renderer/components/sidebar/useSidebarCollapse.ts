import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sa-agent-sidebar-collapsed";

function readStoredCollapseState(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      return true;
    }
    if (stored === "false") {
      return false;
    }
  } catch {
    // localStorage unavailable — default to expanded
  }
  return false;
}

function persistCollapseState(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore persistence failures
  }
}

export function useSidebarCollapse() {
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => readStoredCollapseState());
  const [responsiveHidden, setResponsiveHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      const isNarrow = window.innerWidth < 1024;
      setResponsiveHidden(isNarrow);
      if (!isNarrow) {
        setDrawerOpen(false);
      }
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => {
    if (responsiveHidden) {
      setDrawerOpen((current) => !current);
      return;
    }

    setDesktopCollapsed((current) => {
      const next = !current;
      persistCollapseState(next);
      return next;
    });
  }, [responsiveHidden]);

  // Listen for Cmd/Ctrl+B keyboard shortcut (dispatched as custom event from MainLayout)
  useEffect(() => {
    function handleToggle() {
      toggle();
    }
    window.addEventListener("sa-agent-toggle-sidebar", handleToggle);
    return () => window.removeEventListener("sa-agent-toggle-sidebar", handleToggle);
  }, [toggle]);

  return {
    collapsed: responsiveHidden ? !drawerOpen : desktopCollapsed,
    responsiveHidden,
    drawerOpen,
    toggle,
  } as const;
}
