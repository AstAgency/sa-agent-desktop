import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isCodeFile, planAdHocSignatureOrder } from "./prepare-macos-bundle.mjs";

test("isCodeFile ignores directories even when they have execute bits", () => {
  const root = mkdtempSync(join(tmpdir(), "sa-agent-signing-"));
  try {
    const directory = join(root, "licenses");
    mkdirSync(directory);
    chmodSync(directory, 0o755);

    assert.equal(isCodeFile(directory), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isCodeFile keeps executable files signable", () => {
  const root = mkdtempSync(join(tmpdir(), "sa-agent-signing-"));
  try {
    const binary = join(root, "python");
    writeFileSync(binary, "#!/bin/sh\necho ok\n");
    chmodSync(binary, 0o755);

    assert.equal(isCodeFile(binary), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("planAdHocSignatureOrder signs framework bundles before the top-level app executable", () => {
  const appPath = "/tmp/SA-Agent Desktop.app";
  const framework = `${appPath}/Contents/Frameworks/Electron Framework.framework`;
  const helperBinary = `${framework}/Versions/A/Electron Framework`;
  const appExecutable = `${appPath}/Contents/MacOS/SA-Agent Desktop`;

  const ordered = planAdHocSignatureOrder(
    appPath,
    [appExecutable, helperBinary],
    [framework],
  );

  assert.deepEqual(ordered, [
    helperBinary,
    framework,
    appExecutable,
    appPath,
  ]);
});
