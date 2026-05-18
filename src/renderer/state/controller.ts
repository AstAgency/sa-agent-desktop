/**
 * Barrel for the controller layer. The implementation is split by area of
 * responsibility under `./controller/*`; this module re-exports the public
 * surface so existing import paths (`../state/controller`) stay stable.
 */
import type { Message, Summary } from "../lib/types";

export { startPythonRuntime, bootstrap, refreshBilling } from "./controller/bootstrap";
export {
  loadProjectSessions,
  createProjectAndSelect,
  createProjectViaTool,
  renameProject,
  removeProject,
  saveProjectMemory,
} from "./controller/projects";
export { saveGlobalMemory } from "./controller/memory";
export {
  renameSession,
  removeSession,
  deriveDisplayName,
} from "./controller/sessions";
export {
  selectSession,
  startNewGlobalSession,
  startNewProjectSession,
  clearSelection,
  setSelectedAgent,
} from "./controller/selection";
export { sendMessage, abortActiveTurn } from "./controller/messaging";
export { disposeRuntimes, getRuntime } from "./controller/registry";

export type { Message, Summary };
