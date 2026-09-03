const { spawnSync } = require("child_process");
const path = require("path");

const target = (process.argv[2] || "all").toLowerCase();
const isMacHost = process.platform === "darwin";

const archArgsByTarget = {
  all: ["--x64", "--arm64"],
  intel: ["--x64"],
  x64: ["--x64"],
  silicon: ["--arm64"],
  arm64: ["--arm64"],
  "apple-silicon": ["--arm64"],
  universal: ["--universal"],
};

const archArgs = archArgsByTarget[target];

if (!archArgs) {
  console.error("[package:mac] Usage: node scripts/run-mac-builder.js [all|intel|silicon|universal]");
  process.exit(1);
}

const builderArgs = isMacHost ? ["--mac", "dmg", "zip"] : ["--mac", "zip"];

if (!isMacHost) {
  console.log("[package:mac] Non-macOS host detected. Building macOS ZIP artifacts only.");
  console.log("[package:mac] DMG generation and code signing remain available when this command is run on macOS.");
}

const runner = path.join(__dirname, "run-electron-builder.js");
const result = spawnSync(process.execPath, [runner, ...builderArgs, ...archArgs], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("[package:mac] Failed to launch builder:", result.error.message);
}

process.exit(result.status ?? 1);
