import electron from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const { BrowserWindow, dialog } = electron;

export type DialogOpenFileResult = {
  name: string;
  size: number;
  mime: string;
  kind: "text" | "binary";
  content: string;
};

export const MAX_DIALOG_FILE_BYTES = 1 * 1024 * 1024;
export const MAX_DIALOG_TOTAL_BYTES = 4 * 1024 * 1024;
export const DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS =
  ".txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.log,.ini,.conf,.toml,.pdf,.doc,.docx,.rtf,.odt,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.svg";

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ".css": "text/css",
  ".csv": "text/csv",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".py": "text/x-python",
  ".sh": "text/x-shellscript",
  ".svg": "image/svg+xml",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".bin",
  ".db",
  ".deb",
  ".dmg",
  ".exe",
  ".gif",
  ".gz",
  ".icns",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".sqlite",
  ".tar",
  ".tgz",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

export function classifyFile(name: string, head: Uint8Array): "text" | "binary" {
  const extension = path.extname(name).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) return "binary";
  for (const byte of head) {
    if (byte === 0) return "binary";
  }
  return "text";
}

export function inferMime(name: string, kind: "text" | "binary"): string {
  const extension = path.extname(name).toLowerCase();
  const known = TEXT_MIME_BY_EXTENSION[extension];
  if (known) return known;
  return kind === "text" ? "text/plain" : "application/octet-stream";
}

export function parseAllowedAttachmentExtensions(raw: string | undefined | null): Set<string> {
  const source = raw && raw.trim().length > 0 ? raw : DEFAULT_ATTACHMENT_ALLOWED_EXTENSIONS;
  return new Set(
    source
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0)
      .map((part) => (part.startsWith(".") ? part : `.${part}`)),
  );
}

export function validateAllowedAttachmentExtension(
  fileName: string,
  allowedExtensions: ReadonlySet<string>,
): string | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension.length === 0 || !allowedExtensions.has(extension)) {
    return `${fileName} has unsupported file type`;
  }
  return null;
}

export function buildDialogFileFilters(allowedExtensions: ReadonlySet<string>) {
  return [
    {
      name: "Allowed attachments",
      extensions: [...allowedExtensions].map((extension) => extension.slice(1)),
    },
  ];
}

export function validateDialogSelection(files: Array<{ name: string; size: number }>): string | null {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const oversized = files.find((file) => file.size > MAX_DIALOG_FILE_BYTES);
  if (oversized) {
    return `${oversized.name} exceeds ${MAX_DIALOG_FILE_BYTES} bytes`;
  }
  if (total > MAX_DIALOG_TOTAL_BYTES) {
    return `Selected files exceed ${MAX_DIALOG_TOTAL_BYTES} bytes`;
  }
  return null;
}

export async function readDialogFiles(filePaths: string[]): Promise<DialogOpenFileResult[]> {
  const allowedExtensions = parseAllowedAttachmentExtensions(
    process.env.VITE_ATTACHMENT_ALLOWED_EXTENSIONS,
  );
  const stats = await Promise.all(
    filePaths.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      return { path: filePath, name: path.basename(filePath), size: stat.size };
    }),
  );
  for (const entry of stats) {
    const extensionError = validateAllowedAttachmentExtension(entry.name, allowedExtensions);
    if (extensionError) throw new Error(extensionError);
  }
  const validationError = validateDialogSelection(stats);
  if (validationError) throw new Error(validationError);

  return Promise.all(
    stats.map(async (entry) => {
      const buffer = await fs.readFile(entry.path);
      const kind = classifyFile(entry.name, buffer.subarray(0, 4096));
      return {
        name: entry.name,
        size: entry.size,
        mime: inferMime(entry.name, kind),
        kind,
        content: kind === "text" ? buffer.toString("utf8") : buffer.toString("base64"),
      };
    }),
  );
}

export async function openFilesDialog(
  window = BrowserWindow.getFocusedWindow() ?? undefined,
): Promise<DialogOpenFileResult[]> {
  const allowedExtensions = parseAllowedAttachmentExtensions(
    process.env.VITE_ATTACHMENT_ALLOWED_EXTENSIONS,
  );
  const options = {
    properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
    filters: buildDialogFileFilters(allowedExtensions),
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return [];
  return readDialogFiles(result.filePaths);
}
