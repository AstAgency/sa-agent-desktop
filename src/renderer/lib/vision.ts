/**
 * Pure helpers for the vision (`POST /v1/vision/analyze`) integration.
 *
 * Kept dependency-free so they can be unit-tested without dragging in the
 * authenticated-fetch / token-store chain that lives in api.ts.
 */

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/**
 * Extract the human-readable description from the proxied Qwen/OpenAI-style
 * vision response. Falls back to the raw JSON when the shape is unexpected so
 * the caller still gets something actionable instead of an empty string.
 */
export function extractVisionDescription(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (payload && typeof payload === "object") {
    const choices = (payload as { choices?: unknown }).choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const message = (choices[0] as { message?: { content?: unknown } }).message;
      const content = message?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return content.trim();
      }
    }
    const direct = payload as { description?: unknown; text?: unknown };
    if (typeof direct.description === "string") return direct.description.trim();
    if (typeof direct.text === "string") return direct.text.trim();
  }
  return JSON.stringify(payload);
}
