const selectedProjectStorageKey = "sa-agent.selected-project-id";

export function readSelectedProjectId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(selectedProjectStorageKey);
  } catch {
    return null;
  }
}

export function writeSelectedProjectId(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(selectedProjectStorageKey, projectId);
  } catch {
    // Ignore persistence failures and keep the shell active.
  }
}

export function clearSelectedProjectId() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(selectedProjectStorageKey);
  } catch {
    // Ignore cleanup failures.
  }
}
