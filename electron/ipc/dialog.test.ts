import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFile,
  inferMime,
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
