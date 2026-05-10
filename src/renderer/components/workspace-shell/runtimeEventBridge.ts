import { mapAgentEventToRuntimeEvent } from "../../agent/runtime-events";
import { recordDebugRuntimeEvent } from "../../lib/debug";
import { translate } from "../../lib/i18n";
import { createSessionFlowDebugId } from "./helpers";

export function handleRuntimeEvent(input: {
  language: "ru" | "en";
  sessionId: string;
  rawEvent: unknown;
  setToolMessage?: (message: string | null) => void;
}) {
  const mapped = mapAgentEventToRuntimeEvent(isRecord(input.rawEvent) ? input.rawEvent : null);
  if (!mapped) {
    return;
  }

  if (mapped.type === "approval_required") {
    input.setToolMessage?.(readApprovalMessage(input.language, mapped.tool));
  }

  recordDebugRuntimeEvent({
    id: createSessionFlowDebugId(),
    startedAt: new Date().toISOString(),
    sessionId: input.sessionId,
    event: mapped,
  });
}

function readApprovalMessage(language: "ru" | "en", toolName: string) {
  if (toolName === "local.files.write_file") {
    return translate(language, "workspace.approval.localFileWrite");
  }

  return translate(language, "workspace.approval.generic");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
