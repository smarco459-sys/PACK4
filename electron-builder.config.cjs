module.exports = {
  appId: "pt.saas.esteticista",
  productName: "PACK4",
  artifactName: "PACK4-Setup-${version}.${ext}",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "electron/**/*", "package.json"],
  asar: true,
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "PACK4",
  },
}
