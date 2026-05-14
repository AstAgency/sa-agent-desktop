import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const hasMacSigningIdentity = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);

export default async function prepareMacBundle(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);

  clearExtendedAttributes(appPath);

  if (hasMacSigningIdentity) {
    console.log(`[mac-pack] keeping native signatures for signed build: ${appPath}`);
    return;
  }

  console.log(`[mac-pack] applying ad-hoc signing for unsigned distribution: ${appPath}`);
  applyAdHocSignatures(appPath);
}

function applyAdHocSignatures(appPath) {
  const { files, bundles } = collectSignatureTargets(appPath);

  for (const target of files) {
    signAdHoc(target);
  }

  for (const target of bundles) {
    signAdHoc(target);
  }

  signAdHoc(appPath);
}

function collectSignatureTargets(appPath) {
  const files = [];
  const bundles = [];
  walk(appPath, (absolute) => {
    if (absolute === appPath) return;
    if (isBundleTarget(absolute)) {
      bundles.push(absolute);
      return;
    }
    if (isCodeFile(absolute)) files.push(absolute);
  });

  return {
    files: files.sort((left, right) => depth(right) - depth(left)),
    bundles: bundles.sort((left, right) => depth(right) - depth(left)),
  };
}

function walk(root, visit) {
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(root, entry.name);
    visit(absolute);
    if (entry.isDirectory()) walk(absolute, visit);
  }
}

function isBundleTarget(path) {
  if (path.endsWith(".app")) return true;
  if (path.endsWith(".framework")) return true;
  const name = basename(path);
  return name === "Electron Framework" || name === "Squirrel" || name === "Mantle" || name === "ReactiveObjC";
}

function isCodeFile(path) {
  if (path.endsWith(".dylib") || path.endsWith(".so") || path.endsWith(".node")) return true;
  try {
    return (statSync(path).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function depth(path) {
  return path.split("/").length;
}

function signAdHoc(path) {
  try {
    execFileSync("codesign", ["--force", "--sign", "-", path], { stdio: "pipe" });
  } catch (error) {
    const output = `${String(error?.stdout ?? "")}\n${String(error?.stderr ?? "")}`;
    if (output.includes("bundle format unrecognized")) {
      return;
    }
    throw error;
  }
}

function clearExtendedAttributes(path) {
  try {
    execFileSync("xattr", ["-cr", path], { stdio: "pipe" });
  } catch (error) {
    console.warn(`[mac-pack] failed to clear extended attributes for ${path}: ${error}`);
  }
}
