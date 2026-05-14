import { notarize } from "@electron/notarize";
import { join } from "node:path";

export default async function notarizeMacApp(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD ?? process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const cscLink = process.env.CSC_LINK;

  if (!appleId || !appleIdPassword || !teamId || !cscLink) {
    console.warn("[notarize] skipping macOS notarization: build is running without full Apple signing credentials");
    return;
  }

  console.log(`[notarize] notarizing ${appPath}`);
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
}
