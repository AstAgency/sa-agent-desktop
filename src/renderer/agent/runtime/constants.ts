import type { Model } from "@earendil-works/pi-ai";

export const DEFAULT_MODEL = "deepseek-v4-pro";

export const BACKEND_MODEL: Model<"openai-completions"> = {
  id: "sa-agent-backend",
  name: "SA-Agent Backend",
  api: "openai-completions",
  provider: "sa-agent-backend",
  baseUrl: "internal://sa-agent",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 8_192,
};
