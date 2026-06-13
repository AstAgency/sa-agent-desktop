import { downloadClientFile, getClientManifest } from "../lib/api";
import { getBridge, type RendererUpdateFile } from "../lib/bridge";
import { setUpdateState } from "./store";

let checking = false;

/**
 * Ask the backend whether a newer renderer bundle exists. A missing manifest
 * endpoint or an offline backend is treated as "no update available" rather
 * than an error — the app keeps running on its cached/baseline bundle.
 */
export async function checkForClientUpdate(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const bridge = getBridge();
    const [manifest, installed] = await Promise.all([
      getClientManifest(),
      bridge.update.installedVersion(),
    ]);
    if (manifest.version && manifest.version !== installed) {
      setUpdateState({ available: true, version: manifest.version, error: null });
    } else {
      setUpdateState({ available: false, version: null });
    }
  } catch (error) {
    console.warn("[update] check failed:", error);
  } finally {
    checking = false;
  }
}

/**
 * Download every file from the latest manifest, hand the bytes to the main
 * process (which verifies hashes and atomically activates the new bundle),
 * then reload so the `app://` protocol serves the freshly installed version.
 */
export async function applyClientUpdate(): Promise<void> {
  setUpdateState({ applying: true, error: null });
  try {
    const bridge = getBridge();
    const manifest = await getClientManifest();
    const files: RendererUpdateFile[] = [];
    for (const file of manifest.files) {
      const base64 = await downloadClientFile(manifest, file);
      files.push({ path: file.path, base64, hash: file.hash.toLowerCase() });
    }
    await bridge.update.apply({ version: manifest.version, files });
    window.location.reload();
  } catch (error) {
    setUpdateState({
      applying: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
