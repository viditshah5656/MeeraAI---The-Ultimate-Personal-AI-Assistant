const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const outputDir = path.join("release", "MeeraAI (APP)");
const stagingDir = path.join(outputDir, ".staging");
const args = [...process.argv.slice(2), `-c.directories.output=${stagingDir}`];
const DRY_RUN = process.env.ELECTRON_BUILDER_DRY_RUN === "1" || process.env.DRY_RUN === "1";

const bin = process.env.ELECTRON_BUILDER_BIN || path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  isWindows ? "electron-builder.cmd" : "electron-builder"
);

console.log(`[package] Output: ${outputDir}`);
console.log(`[package] Staging: ${stagingDir}`);

const killProcess = (imageName) => {
  if (!isWindows) {
    return false;
  }
  const result = spawnSync("taskkill", ["/F", "/IM", imageName, "/T"], { stdio: "ignore" });
  return result.status === 0;
};

const killProcessesByPath = (pathFragment) => {
  if (!isWindows) {
    return false;
  }
  const ps = `
$pathFragment = "${pathFragment.replace(/\\/g, "\\\\")}";
$procs = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like "*${pathFragment.replace(/\\/g, "\\\\")}*" };
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
}
`;
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { stdio: "ignore" }
  );
  return result.status === 0;
};

const removeDir = (target, options = {}) => {
  const { removeSelf = true } = options;
  const resolved = path.resolve(target);
  const base = path.basename(resolved);

  // Dry-run: don't actually remove anything, just report what would be done.
  if (DRY_RUN) {
    console.log(`[package] DRY-RUN: would remove ${resolved}`);
    return true;
  }

  // Safety: refuse to remove .app bundle directories or any path containing a .app segment.
  if (base.endsWith(".app") || resolved.split(path.sep).some((seg) => seg.endsWith(".app"))) {
    console.warn(`[package] Skipping removal of .app bundle or path containing .app: ${resolved}`);
    return false;
  }

  // If removing the staging directory, only remove its contents and never touch sibling .app artifacts.
  const normalizedStaging = path.resolve(stagingDir);
  if (resolved === normalizedStaging || base === ".staging") {
    if (!fs.existsSync(resolved)) {
      return true;
    }
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(resolved, entry.name);
        // Skip any .app entries
        if (entry.name.endsWith(".app")) {
          console.warn(`[package] Preserving .app artifact in staging: ${entryPath}`);
          continue;
        }
        fs.rmSync(entryPath, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
      }
      if (removeSelf) {
        // attempt to remove the empty staging directory; if it still contains .app artifacts, skip removing the dir itself
        try {
          fs.rmdirSync(resolved);
        } catch (err) {
          // ignore; leave the (possibly non-empty) staging dir in place
        }
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  // General deletion for non-.app paths
  if (!fs.existsSync(resolved)) {
    return true;
  }
  try {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
    return true;
  } catch (err) {
    return false;
  }
};

const normalizeArtifactName = (name) => {
  if (/^MeeraAI Setup .*\.exe\.blockmap$/i.test(name)) {
    return "MeeraAI Installer.exe.blockmap";
  }
  if (/^MeeraAI Setup .*\.exe$/i.test(name)) {
    return "MeeraAI Installer.exe";
  }
  if (/^MeeraAI .*\.exe$/i.test(name)) {
    return "MeeraAI.exe";
  }
  return name;
};

const cleanReleaseArtifacts = () => {
  if (!fs.existsSync(outputDir)) {
    return;
  }
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    fs.rmSync(path.join(outputDir, entry.name), { force: true });
  }
};

const copyArtifacts = () => {
  if (!fs.existsSync(stagingDir)) {
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  cleanReleaseArtifacts();
  const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app") || entry.name === "mac" || entry.name === "mac-arm64") {
        fs.cpSync(path.join(stagingDir, entry.name), path.join(outputDir, entry.name), { recursive: true });
      }
      continue;
    }
    const src = path.join(stagingDir, entry.name);
    const dest = path.join(outputDir, normalizeArtifactName(entry.name));
    fs.copyFileSync(src, dest);
  }
};

// Try to remove any old win-unpacked output to avoid confusion.
removeDir(path.join(outputDir, "win-unpacked"));

// Ensure staging dir is clear; try to unlock if needed.
if (!removeDir(stagingDir)) {
  const lockPath = path.join(process.cwd(), stagingDir, "win-unpacked");
  const killedByPath = killProcessesByPath(lockPath);
  const killedByName =
    killProcess("MeeraAI.exe") ||
    killProcess("Meera Copilot.exe") ||
    killProcess("MeeraAI Desktop.exe");

  if (killedByPath || killedByName) {
    removeDir(stagingDir);
  }
}

const result = isWindows
  ? spawnSync("cmd.exe", ["/c", bin, ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
      },
    })
  : spawnSync(bin, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
      },
    });

if (result.error) {
  console.error("[package] Failed to launch electron-builder:", result.error.message);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

copyArtifacts();
removeDir(stagingDir);
