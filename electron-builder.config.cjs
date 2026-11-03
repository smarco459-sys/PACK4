module.exports = {
  appId: "pt.saas.esteticista",
  productName: "SaaS Esteticista",
  artifactName: "SaaS-Esteticista-Setup-${version}.${ext}",
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
    shortcutName: "SaaS Esteticista",
  },
}
