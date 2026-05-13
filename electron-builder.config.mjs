const commonArtifactName = "${productName}-${version}-${os}-${arch}.${ext}";

export default {
  appId: "systems.astanov.sa-agent-desktop",
  productName: "SA-Agent Desktop",
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
    {
      from: "resources/python-runtime",
      to: "python-runtime",
      filter: ["**/*"],
    },
  ],
  mac: {
    target: ["dmg"],
    category: "public.app-category.developer-tools",
    icon: "assets/macos/icon.icns",
    identity: null,
    artifactName: commonArtifactName,
  },
  dmg: {
    artifactName: commonArtifactName,
  },
  win: {
    target: ["nsis"],
    icon: "assets/windows/icon.ico",
    artifactName: commonArtifactName,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: commonArtifactName,
  },
  linux: {
    target: ["AppImage"],
    category: "Utility",
    icon: "assets/icon.png",
    artifactName: commonArtifactName,
  },
  appImage: {
    artifactName: commonArtifactName,
  },
};
