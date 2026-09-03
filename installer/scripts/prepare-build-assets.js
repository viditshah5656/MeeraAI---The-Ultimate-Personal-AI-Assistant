const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const iconScript = path.join(__dirname, "prepare-icon.py");
const iconPath = path.join(root, "build", "icon.ico");

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });

const pythonCandidates =
  process.platform === "win32"
    ? [
        ["python", [iconScript]],
        ["py", ["-3", iconScript]],
        ["py", [iconScript]],
      ]
    : [
        ["python3", [iconScript]],
        ["python", [iconScript]],
      ];

for (const [command, args] of pythonCandidates) {
  const result = run(command, args);
  if (result.error && result.error.code === "ENOENT") {
    continue;
  }
  if (result.status === 0) {
    process.exit(0);
  }
  if (fs.existsSync(iconPath)) {
    console.warn("[prepare-build-assets] Reusing existing installer icon.");
    process.exit(0);
  }
  process.exit(result.status ?? 1);
}

if (fs.existsSync(iconPath)) {
  console.warn("[prepare-build-assets] Python or Pillow not available; reusing existing installer icon.");
  process.exit(0);
}

console.error("[prepare-build-assets] Could not generate installer icon and no fallback icon was found.");
process.exit(1);
