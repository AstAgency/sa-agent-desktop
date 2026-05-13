/**
 * Section: Orchestration protocol.
 *
 * Purpose: wrap the agent record's `orchestration_protocol` field with a
 * preamble so the model treats it as authoritative process guidance. Some
 * agents define multi-step orchestration; without this preamble, the model
 * may ignore it as descriptive prose.
 *
 * When applied: only when the agent record carries a non-empty
 * orchestration_protocol string.
 */
export function buildOrchestrationBlock(orchestrationProtocol: string | null): string {
  const trimmed = orchestrationProtocol?.trim();
  if (!trimmed) return "";
  return [
    "Orchestration protocol — follow these steps strictly when the user's request matches their domain:",
    "<orchestration_protocol>",
    trimmed,
    "</orchestration_protocol>",
  ].join("\n");
}
