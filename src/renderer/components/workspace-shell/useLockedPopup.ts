import { useEffect, useState } from "react";
import type { LockedPopupState } from "./types";

export function useLockedPopup() {
  const [lockedPopup, setLockedPopup] = useState<LockedPopupState | null>(null);

  useEffect(() => {
    if (!lockedPopup) {
      return;
    }

    if (lockedPopup.phase === "exit") {
      const cleanupId = window.setTimeout(() => {
        setLockedPopup((current) => (current?.phase === "exit" ? null : current));
      }, 220);
      return () => window.clearTimeout(cleanupId);
    }

    const autoHideId = window.setTimeout(() => {
      setLockedPopup((current) => (current ? { ...current, phase: "exit" } : null));
    }, 5_000);
    return () => window.clearTimeout(autoHideId);
  }, [lockedPopup]);

  return {
    lockedPopup,
    showLockedPopup(message: string) {
      setLockedPopup({ message, phase: "enter" });
    },
    dismissLockedPopup() {
      setLockedPopup((current) => (current ? { ...current, phase: "exit" } : null));
    },
  };
}
