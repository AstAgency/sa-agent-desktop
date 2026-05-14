import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDialogFileFilters,
  classifyFile,
  inferMime,
  parseAllowedAttachmentExtensions,
  validateAllowedAttachmentExtension,
  validateDialogSelection,
  MAX_DIALOG_FILE_BYTES,
  MAX_DIALOG_TOTAL_BYTES,
} from "./dialog.js";

test("classifyFile detects binary payloads from null bytes and extensions", () => {
  assert.equal(classifyFile("notes.txt", new Uint8Array([65, 66, 67])), "text");
  assert.equal(classifyFile("image.png", new Uint8Array([65, 66, 67])), "binary");
  assert.equal(classifyFile("mystery.dat", new Uint8Array([65, 0, 67])), "binary");
});

test("inferMime returns text defaults and octet-stream fallback", () => {
  assert.equal(inferMime("notes.md", "text"), "text/markdown");
  assert.equal(inferMime("archive.bin", "binary"), "application/octet-stream");
});

test("validateDialogSelection enforces per-file and aggregate limits", () => {
  assert.equal(
    validateDialogSelection([{ name: "small.txt", size: 128 }]),
    null,
  );
  assert.match(
    validateDialogSelection([{ name: "big.txt", size: MAX_DIALOG_FILE_BYTES + 1 }]) ?? "",
    /big\.txt exceeds/,
  );
  assert.match(
    validateDialogSelection([
      { name: "a.txt", size: MAX_DIALOG_FILE_BYTES },
      { name: "b.txt", size: MAX_DIALOG_FILE_BYTES },
      { name: "c.txt", size: MAX_DIALOG_FILE_BYTES },
      { name: "d.txt", size: MAX_DIALOG_FILE_BYTES },
      { name: "e.txt", size: 1 },
    ]) ?? "",
    /Selected files exceed/,
  );
});

test("parseAllowedAttachmentExtensions normalizes env values and builds dialog filters", () => {
  const allowed = parseAllowedAttachmentExtensions(" pdf, .DOCX,txt, md ,,yaml ");
  assert.deepEqual([...allowed], [".pdf", ".docx", ".txt", ".md", ".yaml"]);
  assert.deepEqual(buildDialogFileFilters(allowed), [
    {
      name: "Allowed attachments",
      extensions: ["pdf", "docx", "txt", "md", "yaml"],
    },
  ]);
});

test("validateAllowedAttachmentExtension rejects files outside env allowlist", () => {
  const allowed = parseAllowedAttachmentExtensions(".pdf,.docx,.txt");
  assert.equal(validateAllowedAttachmentExtension("brief.pdf", allowed), null);
  assert.match(
    validateAllowedAttachmentExtension("archive.zip", allowed) ?? "",
    /archive\.zip has unsupported file type/,
  );
});
