const commonArtifactName = "${productName}-${version}-${os}-${arch}.${ext}";
const hasMacSigningIdentity = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);

function currentRuntimeDir() {
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  throw new Error(`Unsupported packaging platform: ${process.platform}-${process.arch}`);
}

const runtimeDir = currentRuntimeDir();
const pythonRuntimeResource = {
  from: `resources/python-runtime/${runtimeDir}`,
  to: `python-runtime/${runtimeDir}`,
  filter: ["**/*"],
};

export default {
  appId: "systems.astanov.sa-agent-desktop",
  productName: "SA-Agent Desktop",
  afterPack: "scripts/prepare-macos-bundle.mjs",
  afterSign: "scripts/notarize.mjs",
  directories: {
    output: "release",
    buildResources: "assets",
  },
  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "assets/**/*",
    "package.json",
  ],
  extraResources: [
    {
      from: "python-sidecar",
      to: "python-sidecar",
      filter: ["**/*"],
    },
    ...(process.platform === "darwin" && hasMacSigningIdentity ? [] : [pythonRuntimeResource]),
  ],
  extraFiles: process.platform === "darwin" && hasMacSigningIdentity
    ? [
        {
          ...pythonRuntimeResource,
          to: `Frameworks/python-runtime/${runtimeDir}`,
        },
      ]
    : [],
  mac: {
    target: ["zip"],
    category: "public.app-category.developer-tools",
    icon: "assets/macos/icon.icns",
    identity: hasMacSigningIdentity ? undefined : null,
    hardenedRuntime: hasMacSigningIdentity,
    gatekeeperAssess: false,
    ...(hasMacSigningIdentity
      ? {
          entitlements: "assets/entitlements.mac.plist",
          entitlementsInherit: "assets/entitlements.mac.plist",
        }
      : {}),
    artifactName: commonArtifactName,
  },
  win: {
    target: ["zip"],
    icon: "assets/windows/icon.ico",
    artifactName: commonArtifactName,
  },
  linux: {
    target: ["tar.gz", "deb"],
    category: "Utility",
    icon: "assets/icon.png",
    artifactName: commonArtifactName,
  },
};
