/**
 * Section: Vision analysis prompt.
 *
 * Purpose: the fixed instruction sent as the `text` field of the
 * `POST /v1/vision/analyze` request. It asks the vision model to describe
 * what is depicted on the image and, crucially, to transcribe any text that
 * appears in the image verbatim so downstream reasoning can use it.
 *
 * When applied: passed by the `analyze_image` tool on every call. It is not
 * part of the system prompt — it travels with the image to the vision model.
 */
export const VISION_ANALYSIS_PROMPT = [
  "Опиши подробно, что изображено на этой картинке.",
  "Перечисли ключевые объекты, людей, сцену, действия и заметные детали.",
  "Если на картинке есть текст (надписи, документы, скриншоты, таблицы, подписи) —",
  "обязательно распознай его и верни дословно в отдельном блоке «Текст на изображении:».",
  "Сохраняй порядок и структуру текста как на картинке; ничего не выдумывай.",
  "Если текста на изображении нет — явно укажи «Текст на изображении: отсутствует».",
].join(" ");
