const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const syncLogoScript = path.join(__dirname, "sync-logo.js");
const nsisThemeScript = path.join(__dirname, "prepare-nsis-theme.py");
const requiredAssets = [
  path.join(root, "build", "installer-header.bmp"),
  path.join(root, "build", "installer-welcome.bmp"),
  path.join(root, "build", "installer-page.bmp"),
];

const hasRequiredAssets = () => requiredAssets.every((assetPath) => fs.existsSync(assetPath));

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });

const syncLogo = run(process.execPath, [syncLogoScript]);
if (syncLogo.status !== 0) {
  process.exit(syncLogo.status ?? 1);
}

const pythonCandidates =
  process.platform === "win32"
    ? [
        ["python", [nsisThemeScript]],
        ["py", ["-3", nsisThemeScript]],
        ["py", [nsisThemeScript]],
      ]
    : [
        ["python3", [nsisThemeScript]],
        ["python", [nsisThemeScript]],
      ];

for (const [command, args] of pythonCandidates) {
  const result = run(command, args);
  if (result.error && result.error.code === "ENOENT") {
    continue;
  }
  if (result.status === 0) {
    process.exit(0);
  }
  if (hasRequiredAssets()) {
    console.warn("[prepare-build-assets] Reusing existing NSIS theme assets.");
    process.exit(0);
  }
  process.exit(result.status ?? 1);
}

if (hasRequiredAssets()) {
  console.warn("[prepare-build-assets] Python or Pillow not available; reusing existing NSIS theme assets.");
  process.exit(0);
}

console.error("[prepare-build-assets] Could not generate NSIS theme assets and no fallback assets were found.");
process.exit(1);
