import type { SessionMessage } from "../lib/types";

const SAVE_INTENT_PATTERN = /\b(save|write|file|path)\b|сохрани|запиши|файл|путь|локальн/i;
const FILE_PATH_PATTERN = /(?:^|[\s(])(?:[a-z0-9._-]+\/)+[a-z0-9._-]+\.[a-z0-9]+(?:$|[\s)])/i;

export function allowLocalFileWrite(messages: SessionMessage[]) {
  const latestUserText = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content_markdown ?? "";

  return SAVE_INTENT_PATTERN.test(latestUserText) || FILE_PATH_PATTERN.test(latestUserText);
}
