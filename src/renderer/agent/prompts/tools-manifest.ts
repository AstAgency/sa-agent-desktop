import { buildToolsManifest } from "./build-tools-manifest.js";
import { CAPABILITY_REGISTRY } from "./capability-registry.js";

/**
 * Section: Tools manifest (best practices).
 *
 * Purpose: capabilities.ts tells the model which tools exist and which do
 * not. This section is the next layer: HOW to use the real tools well —
 * ordering, when to prefer one over another, and the failure modes that
 * waste a turn.
 *
 * When applied: passed as `toolsManifest` to the prompt builder, which wraps
 * it in <available_tools> and places it last in the system prompt so it is
 * the freshest guidance the model sees before acting.
 */
export const TOOLS_MANIFEST_PROMPT = buildToolsManifest(CAPABILITY_REGISTRY);
