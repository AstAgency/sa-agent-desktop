import { buildCapabilitiesPrompt } from "./build-capabilities-prompt.js";
import { CAPABILITY_REGISTRY } from "./capability-registry.js";

/**
 * Section: Capability awareness.
 *
 * Purpose: stop the model from inventing tools that don't exist (visual UI
 * checks, browser previews, sandboxed eval, …) and from imagining that a
 * read tool can validate something it cannot.
 *
 * When applied: included in every system prompt right after execution
 * discipline so the model frames every plan in terms of real capabilities.
 */
export const CAPABILITIES_PROMPT = buildCapabilitiesPrompt(CAPABILITY_REGISTRY);
