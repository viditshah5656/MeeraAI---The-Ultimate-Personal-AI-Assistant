import { app, BrowserWindow, clipboard, ipcMain, Notification as ElectronNotification, shell, session, webContents, Menu, Tray, nativeImage } from "electron";
import { execFile, spawn } from "node:child_process";
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Natively hide all Chromium scrollbars globally (removes flash and injection lag)
app.commandLine.appendSwitch('hide-scrollbars');
// Voice replies are generated asynchronously after the initiating click. Keep
// Chromium from treating the completed local Qwen-TTS request as unrelated
// autoplay and silently rejecting Meera's audio.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Platform-aware performance & GPU hardware acceleration flags
// Optimized for MacBook Pro (Intel Iris GPU) / macOS Retina & low-end hardware
const isDarwin = process.platform === 'darwin';

// GPU Acceleration, Rasterization & Zero-Copy
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-oop-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');

if (isDarwin) {
  // macOS / Intel Iris optimizations:
  // Use Apple's low-overhead Metal API backend instead of deprecated OpenGL
  app.commandLine.appendSwitch('use-angle', 'metal');
  app.commandLine.appendSwitch('use-metal');
  app.commandLine.appendSwitch(
    'enable-features',
    'CanvasOopRasterization,Metal'
  );
  app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
} else {
  app.commandLine.appendSwitch('enable-hardware-overlays');
  app.commandLine.appendSwitch('wm-window-animations-disabled');
  app.commandLine.appendSwitch(
    'disable-features',
    'HardwareMediaKeyHandling,CalculateNativeWinOcclusion'
  );
}

// Low-overhead background processing for responsive AI streaming & fast IPC
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Disk & Media Cache Caps (prevents disk thrashing & startup latency on older SSDs)
app.commandLine.appendSwitch('disk-cache-size', '104857600'); // 100 MB
app.commandLine.appendSwitch('media-cache-size', '52428800'); // 50 MB


// On macOS, ensure Homebrew paths (if present) are available early
// so spawned subprocesses can find python and other tools.
if (process.platform === 'darwin') {
  process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`;
}

const isDev = !app.isPackaged;
const PROD_ENTRY = path.join(__dirname, "../dist/index.html");
const PROD_DIST_DIR = path.dirname(PROD_ENTRY);
const DEV_SERVER_ORIGIN = process.env.MEERA_DESKTOP_DEV_URL || "http://localhost:5173";
const PROD_SERVER_PORT = Number(process.env.MEERA_DESKTOP_PROD_PORT || 12121);
const PROD_SERVER_BIND = "127.0.0.1";
const BACKEND_PORT = Number(process.env.MEERA_BACKEND_PORT || 8000);
const BACKEND_HOST = process.env.MEERA_BACKEND_HOST || "127.0.0.1";
const BACKEND_HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const BACKEND_START_TIMEOUT_MS = 800;
const BACKEND_STARTUP_TIMEOUT_MS = Number(process.env.MEERA_BACKEND_STARTUP_TIMEOUT_MS || 45000);
const EXE_DIR = path.dirname(process.execPath);
const PORTABLE_EXECUTABLE_FILE = process.env.PORTABLE_EXECUTABLE_FILE || "";
const PORTABLE_EXECUTABLE_DIR =
  process.env.PORTABLE_EXECUTABLE_DIR ||
  (PORTABLE_EXECUTABLE_FILE ? path.dirname(PORTABLE_EXECUTABLE_FILE) : "");
const PACKAGED_ROOT =
  PORTABLE_EXECUTABLE_DIR && existsSync(PORTABLE_EXECUTABLE_DIR) ? PORTABLE_EXECUTABLE_DIR : EXE_DIR;
const DEFAULT_REMOTE_INFERENCE_CONFIG = {
  provider: process.env.MEERA_INFERENCE_PROVIDER || "sambanova",
  baseUrl: process.env.MEERA_REMOTE_BASE_URL || "https://api.sambanova.ai/v1",
  apiKey: process.env.MEERA_REMOTE_API_KEY || "73de4402-9671-4df1-b577-aea4f6c9b446",
  modelLite: process.env.MEERA_REMOTE_MODEL_LITE || "DeepSeek-R1-0528",
  modelCore: process.env.MEERA_REMOTE_MODEL_CORE || "DeepSeek-R1-0528",
  modelPro: process.env.MEERA_REMOTE_MODEL_PRO || "DeepSeek-R1-0528",
  modelMax: process.env.MEERA_REMOTE_MODEL_MAX || "DeepSeek-R1-0528",
  modelUltra: process.env.MEERA_REMOTE_MODEL_ULTRA || "DeepSeek-R1-0528",
};
const DEFAULT_PACKAGED_INSTALLER_CONFIG = {
  selectedModel: "meera-ultra-7b",
  autoDownload: false,
  gpuOnly: false,
  runtime: "sambanova",
};
const FIREBASE_AUTH_DOMAIN =
  process.env.MEERA_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "";
const AUTH_HOST_ALLOWLIST = new Set([
  "accounts.google.com",
  "github.com",
  "login.microsoftonline.com",
  "login.live.com",
]);

const AUTH_POPUP_WIDTH = 520;
const AUTH_POPUP_HEIGHT = 720;
const AUTH_POPUP_BAR_HEIGHT = 68;
const AUTH_POPUP_BACKGROUND = "#f3f6fb";
const WINDOWS_APP_USER_MODEL_ID = "com.meera.desktop";
const PRODUCT_NAME = "MeeraAI";

const AUTH_LOGO_PATH = (() => {
  const devPath = path.join(__dirname, "..", "public", "logo.png");
  const prodPath = path.join(__dirname, "..", "dist", "logo.png");
  const preferred = isDev ? devPath : prodPath;
  if (existsSync(preferred)) {
    return preferred;
  }
  if (existsSync(prodPath)) {
    return prodPath;
  }
  if (existsSync(devPath)) {
    return devPath;
  }
  return "";
})();

const AUTH_LOGO_DATA_URL = (() => {
  if (!AUTH_LOGO_PATH) {
    return "";
  }
  try {
    const buffer = readFileSync(AUTH_LOGO_PATH);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
})();

const AUTH_LOGO_CSS = AUTH_LOGO_DATA_URL ? `url("${AUTH_LOGO_DATA_URL}")` : "none";

type NativeNotificationPayload = {
  title: string;
  body?: string;
  icon?: string;
  silent?: boolean;
};

const AUTH_WINDOW_ICONS = {
  minimize: {
    viewBox: "0 0 24 24",
    strokeWidth: 2,
    paths: [
      "M3 17a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1l0 -3",
      "M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6",
      "M15 13h-4v-4",
      "M11 13l5 -5",
    ],
  },
  maximize: {
    viewBox: "0 0 24 24",
    strokeWidth: 2,
    paths: [
      "M3 17a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1l0 -3",
      "M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-6",
      "M12 8h4v4",
      "M16 8l-5 5",
    ],
  },
  close: {
    viewBox: "0 0 24 24",
    strokeWidth: 2.4,
    paths: ["M18 6l-12 12", "M6 6l12 12"],
  },
} as const;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const AUTH_CSS_STATE = new WeakMap<Electron.WebContents, { key?: string; url?: string }>();
const locationPermissionRequests = new Set<number>();
type BackendControlResult = { ok: boolean; status: string; error?: string };
let backendProcess: ReturnType<typeof spawn> | null = null;
let backendLogLines: string[] = [];
let backendStartTask: Promise<BackendControlResult> | null = null;
let backendStopTask: Promise<BackendControlResult> | null = null;
let isQuitting = false;

const appendBackendLog = (chunk: string) => {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return;
  }
  backendLogLines = [...backendLogLines, ...lines].slice(-40);
};

const backendLogSummary = (): string => {
  if (backendLogLines.length === 0) {
    return "";
  }
  return backendLogLines.slice(-6).join(" | ");
};

const formatReverseGeocodeLabel = (data: Record<string, unknown>): string => {
  const address = data.address && typeof data.address === "object" && !Array.isArray(data.address)
    ? (data.address as Record<string, unknown>)
    : {};
  const displayName = typeof data.display_name === "string" ? data.display_name.trim() : "";
  const pieces = [
    typeof address.city === "string" ? address.city.trim() : "",
    typeof address.town === "string" ? address.town.trim() : "",
    typeof address.village === "string" ? address.village.trim() : "",
    typeof address.hamlet === "string" ? address.hamlet.trim() : "",
    typeof address.municipality === "string" ? address.municipality.trim() : "",
    typeof address.county === "string" ? address.county.trim() : "",
    typeof address.state_district === "string" ? address.state_district.trim() : "",
    typeof address.state === "string" ? address.state.trim() : "",
    typeof address.country === "string" ? address.country.trim() : "",
  ].filter(Boolean);
  const compactPieces = Array.from(new Set(pieces)).slice(0, 3);
  return compactPieces.join(", ") || displayName || "Current location";
};

if (process.platform === "win32") {
  app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
}

app.setName(PRODUCT_NAME);

const isPackagedDarwin = (): boolean => app.isPackaged && process.platform === "darwin";

const resolvePackagedStateRoot = (): string => app.getPath("userData");

const resolvePackagedRuntimeRoot = (): string =>
  isPackagedDarwin() ? path.join(resolvePackagedStateRoot(), "runtime") : PACKAGED_ROOT;

const resolvePackagedConfigRoot = (): string =>
  isPackagedDarwin() ? path.join(resolvePackagedStateRoot(), "config") : path.join(PACKAGED_ROOT, "config");

const resolvePackagedResourceRoot = (): string => process.resourcesPath || path.join(PACKAGED_ROOT, "..", "Resources");

const ensureMacPackagedRuntime = async (): Promise<void> => {
  if (!isPackagedDarwin()) {
    return;
  }

  // Prepend Homebrew to PATH
  if (process.platform === "darwin") {
    process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`;
  }

  const stateRoot = resolvePackagedStateRoot();
  const runtimeRoot = resolvePackagedRuntimeRoot();
  const configRoot = resolvePackagedConfigRoot();
  const modelsRoot = path.join(resolvePackagedStateRoot(), "models");

  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(runtimeRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });
  mkdirSync(modelsRoot, { recursive: true });

  const inferenceConfigPath = path.join(configRoot, "inference.json");
  if (!existsSync(inferenceConfigPath)) {
    writeFileSync(inferenceConfigPath, JSON.stringify(DEFAULT_REMOTE_INFERENCE_CONFIG, null, 2), "utf8");
  }

  const installerConfigPath = path.join(configRoot, "installer.json");
  if (!existsSync(installerConfigPath)) {
    writeFileSync(installerConfigPath, JSON.stringify(DEFAULT_PACKAGED_INSTALLER_CONFIG, null, 2), "utf8");
  }

  const modelsJsonDest = path.join(configRoot, "models.json");
  if (!existsSync(modelsJsonDest)) {
    const modelsJsonSource = path.join(resolvePackagedResourceRoot(), "config", "models.json");
    if (existsSync(modelsJsonSource)) {
      cpSync(modelsJsonSource, modelsJsonDest);
    }
  }

  const backendReadyFile = path.join(runtimeRoot, ".backend-ready");
  if (existsSync(backendReadyFile)) {
    return;
  }

  const bootstrapScript = path.join(resolvePackagedResourceRoot(), "scripts", "install-backend-mac.sh");
  if (!existsSync(bootstrapScript)) {
    throw new Error("Packaged macOS backend bootstrap script was not found.");
  }

  await execFileAsync("/bin/bash", [bootstrapScript, resolvePackagedResourceRoot(), runtimeRoot], {
    maxBuffer: 10 * 1024 * 1024 // 10MB to prevent stdout overflow
  });
};

const findInParents = (startPath: string, filename: string, maxDepth = 4): string | null => {
  let current = startPath;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const candidate = path.resolve(current, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
};

const resolvePackagedModelsRoot = (): string => {
  if (isPackagedDarwin()) {
    return path.join(resolvePackagedStateRoot(), "models");
  }
  const lower = path.join(PACKAGED_ROOT, "models");
  const upper = path.join(PACKAGED_ROOT, "Models");
  if (existsSync(lower)) {
    return lower;
  }
  if (existsSync(upper)) {
    return upper;
  }
  return lower;
};

const resolveBackendScript = (): string | null => {
  const override = process.env.MEERA_BACKEND_PATH;
  if (override && existsSync(override)) {
    return override;
  }

  if (app.isPackaged) {
    const packagedCandidates = [
      path.join(PACKAGED_ROOT, "Meera.py"),
      path.join(PACKAGED_ROOT, "..", "Meera.py"),
      path.join(resolvePackagedResourceRoot(), "Meera.py"),
    ];
    for (const candidate of packagedCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  const appPath = app.getAppPath();
  const devCandidates = [
    path.resolve(__dirname, "..", "..", "Meera.py"),
    path.resolve(appPath, "..", "Meera.py"),
    path.resolve(process.cwd(), "Meera.py"),
  ];
  const candidates = [...devCandidates];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const parentRoots = [path.resolve(__dirname, "..", ".."), appPath, process.cwd()];

  for (const root of parentRoots) {
    const found = findInParents(root, "Meera.py", 5);
    if (found) {
      return found;
    }
  }

  return null;
};

const checkBackendHealth = (): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(BACKEND_HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(BACKEND_START_TIMEOUT_MS, () => {
      req.destroy();
      resolve(false);
    });
  });

const waitForBackendHealth = async (timeoutMs = BACKEND_STARTUP_TIMEOUT_MS): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkBackendHealth()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
};

const waitForBackendShutdown = async (timeoutMs = 5000): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await checkBackendHealth())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !(await checkBackendHealth());
};

const waitForChildExit = (child: ReturnType<typeof spawn>, timeoutMs = 4000): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      finish(true);
    });
    child.once("close", () => {
      clearTimeout(timer);
      finish(true);
    });
  });

const terminateBackendProcess = async (child: ReturnType<typeof spawn>): Promise<void> => {
  const pid = child.pid;
  if (!pid) {
    try {
      child.kill();
    } catch {
      // ignore process termination failures
    }
    return;
  }

  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    } catch {
      try {
        child.kill();
      } catch {
        // ignore process termination failures
      }
    }
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore process termination failures
  }

  const exited = await waitForChildExit(child, 3000);
  if (exited) {
    return;
  }

  try {
    child.kill("SIGKILL");
  } catch {
    // ignore process termination failures
  }
};

const waitForPidExit = async (pid: number, timeoutMs = 4000): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ESRCH") {
        return true;
      }
      if (code !== "EPERM") {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code !== "EPERM";
  }
};

const parsePidList = (raw: string): number[] =>
  Array.from(
    new Set(
      raw
        .split(/[\r\n\s]+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );

const listListeningPortPids = async (port: number): Promise<number[]> => {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], { windowsHide: true });
      const pids = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const parts = line.split(/\s+/);
          if (parts.length < 5 || parts[0].toUpperCase() !== "TCP") {
            return [];
          }
          const [_, localAddress, __, state, pid] = parts;
          if (!localAddress.endsWith(`:${port}`) || state.toUpperCase() !== "LISTENING") {
            return [];
          }
          return parsePidList(pid);
        });
      return Array.from(new Set(pids));
    } catch {
      return [];
    }
  }

  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return parsePidList(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync("fuser", ["-n", "tcp", String(port)]);
      return parsePidList(stdout);
    } catch {
      return [];
    }
  }
};

const resolveProcessCommand = async (pid: number): Promise<string> => {
  if (pid <= 0) {
    return "";
  }

  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
        ],
        { windowsHide: true },
      );
      return stdout.trim();
    } catch {
      return "";
    }
  }

  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.trim();
  } catch {
    return "";
  }
};

const isMeeraBackendCommand = (command: string): boolean => {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("meera.py") ||
    (normalized.includes("python") && normalized.includes("meera")) ||
    (normalized.includes("uvicorn") && normalized.includes("meera"))
  );
};

const terminatePid = async (pid: number): Promise<void> => {
  if (pid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    } catch {
      // ignore process termination failures
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore process termination failures
  }

  const exited = await waitForPidExit(pid, 3000);
  if (exited) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore process termination failures
  }
};

const terminateExternalBackendProcesses = async (): Promise<number> => {
  const trackedPid = backendProcess?.pid ?? 0;
  const candidatePids = await listListeningPortPids(BACKEND_PORT);
  let terminated = 0;

  for (const pid of candidatePids) {
    if (!pid || pid === trackedPid || pid === process.pid) {
      continue;
    }
    const command = await resolveProcessCommand(pid);
    if (!isMeeraBackendCommand(command)) {
      continue;
    }
    await terminatePid(pid);
    terminated += 1;
  }

  return terminated;
};

type PythonCommand = { cmd: string; argsPrefix: string[] };

const canExecutePythonCommand = async (candidate: PythonCommand): Promise<boolean> => {
  const command = candidate.cmd.trim();
  if (!command) {
    return false;
  }
  const looksLikePath =
    command.includes("\\") || command.includes("/") || command.toLowerCase().endsWith(".exe");
  if (looksLikePath && !existsSync(command)) {
    return false;
  }
  try {
    await execFileAsync(command, [...candidate.argsPrefix, "--version"]);
    return true;
  } catch {
    return false;
  }
};

const resolvePythonCommand = async (): Promise<PythonCommand | null> => {
  const candidates: PythonCommand[] = [];
  const seen = new Set<string>();

  const addCandidate = (cmd: string, argsPrefix: string[] = []) => {
    const cleaned = cmd.trim();
    if (!cleaned) {
      return;
    }
    const key = `${cleaned}::${argsPrefix.join(" ")}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ cmd: cleaned, argsPrefix });
  };

  const override = process.env.MEERA_PYTHON;
  if (override && override.trim()) {
    const cleanedOverride = override.trim();
    if (existsSync(cleanedOverride)) {
      addCandidate(cleanedOverride);
    } else {
      console.warn(`Ignoring MEERA_PYTHON because it does not exist: ${cleanedOverride}`);
    }
  }

  if (process.platform === "win32") {
    const appPath = app.getAppPath();
    const localVenvCandidates = [
      path.join(PACKAGED_ROOT, "venv", "Scripts", "python.exe"),
      path.join(PACKAGED_ROOT, ".venv", "Scripts", "python.exe"),
      path.join(EXE_DIR, "venv", "Scripts", "python.exe"),
      path.join(EXE_DIR, ".venv", "Scripts", "python.exe"),
      path.resolve(process.cwd(), "..", "venv", "Scripts", "python.exe"),
      path.resolve(process.cwd(), "..", ".venv", "Scripts", "python.exe"),
      path.resolve(appPath, "..", "venv", "Scripts", "python.exe"),
      path.resolve(appPath, "..", ".venv", "Scripts", "python.exe"),
    ];
    for (const candidate of localVenvCandidates) {
      addCandidate(candidate);
    }
  }

  if (process.platform === "darwin") {
    // Inject Homebrew PATH if not already present
    if (!process.env.PATH?.includes("/opt/homebrew/bin")) {
      process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`;
    }

    const runtimeRoot = resolvePackagedRuntimeRoot();
    const backendReadyFile = path.join(runtimeRoot, ".backend-ready");

    if (existsSync(backendReadyFile)) {
      // If the packaged macOS runtime has signaled readiness, prefer the runtime venv python
      addCandidate(path.join(runtimeRoot, "venv", "bin", "python3"));
      addCandidate(path.join(runtimeRoot, "venv", "bin", "python"));
    } else {
      const appPath = app.getAppPath();
      const localVenvCandidates = [
        path.join(runtimeRoot, "venv", "bin", "python3"),
        path.join(runtimeRoot, "venv", "bin", "python"),
        path.join(runtimeRoot, ".venv", "bin", "python3"),
        path.join(runtimeRoot, ".venv", "bin", "python"),
        path.resolve(process.cwd(), "..", "venv", "bin", "python3"),
        path.resolve(process.cwd(), "..", ".venv", "bin", "python3"),
        path.resolve(appPath, "..", "venv", "bin", "python3"),
        path.resolve(appPath, "..", ".venv", "bin", "python3"),
      ];
      for (const candidate of localVenvCandidates) {
        addCandidate(candidate);
      }
    }
  }

  if (process.platform === "win32") {
    addCandidate("python");
    addCandidate("py", ["-3"]);
  } else {
    addCandidate("python3");
    addCandidate("python");
  }

  for (const candidate of candidates) {
    if (await canExecutePythonCommand(candidate)) {
      return candidate;
    }
  }

  return null;
};

const startBackendIfNeeded = async (): Promise<BackendControlResult> => {
  const pendingStop = backendStopTask;
  if (pendingStop) {
    await pendingStop;
  }
  if (await checkBackendHealth()) {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("meera:backend:status", { running: true });
      }
    } catch {}
    return { ok: true, status: "running" };
  }
  if (backendStartTask) {
    return backendStartTask;
  }

  const task = (async (): Promise<BackendControlResult> => {
    if (backendProcess && !backendProcess.killed) {
      const healthy = await waitForBackendHealth();
      if (healthy) {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("meera:backend:status", { running: true });
          }
        } catch {}
        return { ok: true, status: "running" };
      }
      const child = backendProcess;
      if (child) {
        if (backendProcess === child) {
          backendProcess = null;
        }
        await terminateBackendProcess(child);
      }
      const summary = backendLogSummary();
      return {
        ok: false,
        status: "failed",
        error: summary
          ? `Backend failed to finish starting: ${summary}`
          : "Backend failed to finish starting. Check Python dependencies and Meera.py path.",
      };
    }

    if (isPackagedDarwin()) {
      try {
        await ensureMacPackagedRuntime();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to prepare the macOS backend runtime.";
        return { ok: false, status: "failed", error: message };
      }
    }

    const script = resolveBackendScript();
    if (!script) {
      return {
        ok: false,
        status: "missing",
        error: "Meera backend script not found. Place Meera.py next to the app or set MEERA_BACKEND_PATH.",
      };
    }

    const python = await resolvePythonCommand();
    if (!python) {
      return {
        ok: false,
        status: "failed",
        error: "No working Python interpreter was found. Update MEERA_PYTHON or install Python 3.",
      };
    }
    const appRoot = app.isPackaged ? resolveAppRoot() : resolveAppRoot();
    const modelsRoot = app.isPackaged ? resolvePackagedModelsRoot() : findModelsRoot();
    const configRoot = app.isPackaged
      ? resolvePackagedConfigRoot()
      : (() => {
          const configOverride = process.env.MEERA_CONFIG_ROOT;
          return configOverride && existsSync(configOverride)
            ? path.resolve(configOverride)
            : path.resolve(appRoot, "config");
        })();
    const backendEnv = {
      ...process.env,
      MEERA_APP_ROOT: appRoot,
      MEERA_MODELS_ROOT: modelsRoot,
      MEERA_CONFIG_ROOT: configRoot,
      MEERA_GPU_ONLY: "1",
    };
    const backendCwd = app.isPackaged ? appRoot : path.dirname(script);
    try {
      const args = [
        ...python.argsPrefix,
        script,
        "--api",
        "--port",
        String(BACKEND_PORT),
      ];
      backendLogLines = [];
      backendProcess = spawn(python.cmd, args, {
        cwd: backendCwd,
        env: backendEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const childRef = backendProcess;
      childRef.stdout?.on("data", (chunk) => {
        appendBackendLog(String(chunk));
      });
      childRef.stderr?.on("data", (chunk) => {
        appendBackendLog(String(chunk));
        console.error(`[meera-backend] ${String(chunk).trim()}`);
      });
      childRef.once("error", (err) => {
        console.error("Failed to launch backend:", err);
        if (backendProcess === childRef) {
          backendProcess = null;
        }
      });
      childRef.once("exit", () => {
        if (backendProcess === childRef) {
          backendProcess = null;
        }
      });
      childRef.once("close", () => {
        if (backendProcess === childRef) {
          backendProcess = null;
        }
      });
      const healthy = await waitForBackendHealth();
      if (!healthy) {
        if (backendProcess === childRef) {
          backendProcess = null;
        }
        await terminateBackendProcess(childRef);
        const summary = backendLogSummary();
        return {
          ok: false,
          status: "failed",
          error: summary
            ? `Backend failed to start with ${path.basename(python.cmd)}: ${summary}`
            : `Backend failed to start with ${path.basename(python.cmd)}. Check Python dependencies and Meera.py path.`,
        };
      }
      return { ok: true, status: "running" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start backend.";
      return { ok: false, status: "failed", error: message };
    }
  })();

  backendStartTask = task;
  try {
    return await task;
  } finally {
    if (backendStartTask === task) {
      backendStartTask = null;
    }
  }
};

const stopBackendIfRunning = async (): Promise<BackendControlResult> => {
  if (backendStopTask) {
    return backendStopTask;
  }

  const task = (async (): Promise<BackendControlResult> => {
    backendStartTask = null;

    try {
      if (backendProcess && !backendProcess.killed) {
        const child = backendProcess;
        backendProcess = null;
        await terminateBackendProcess(child);
      }

      if (await waitForBackendShutdown()) {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("meera:backend:status", { running: false });
          }
        } catch {}
        return { ok: true, status: "stopped" };
      }

      const terminatedExternal = await terminateExternalBackendProcesses();
      if (terminatedExternal > 0 && (await waitForBackendShutdown())) {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("meera:backend:status", { running: false });
          }
        } catch {}
        return { ok: true, status: "stopped" };
      }

      if (await checkBackendHealth()) {
        return { ok: false, status: "external", error: "Backend is running outside this app." };
      }
      return { ok: true, status: "stopped" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop backend.";
      return { ok: false, status: "failed", error: message };
    }
  })();

  backendStopTask = task;
  try {
    return await task;
  } finally {
    if (backendStopTask === task) {
      backendStopTask = null;
    }
  }
};

const MODEL_MANIFEST_NAME = ".meera_manifest.json";

const resolveAppRoot = (): string => {
  if (app.isPackaged) {
    return isPackagedDarwin() ? resolvePackagedStateRoot() : PACKAGED_ROOT;
  }
  const override = process.env.MEERA_APP_ROOT;
  if (override && existsSync(override)) {
    return path.resolve(override);
  }
  return path.resolve(app.getAppPath(), "..");
};


const resolveInstallerConfigPath = (): string => {
  if (app.isPackaged) {
    return path.join(resolvePackagedConfigRoot(), "installer.json");
  }
  const appRoot = resolveAppRoot();
  return path.join(appRoot, "config", "installer.json");
};

const readInstallerConfig = (): { ok: boolean; selectedModel?: string; autoDownload?: boolean; error?: string } => {
  const configPath = resolveInstallerConfigPath();
  if (!existsSync(configPath)) {
    return { ok: false, error: "missing" };
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { selectedModel?: string; autoDownload?: boolean };
    return {
      ok: true,
      selectedModel: typeof parsed.selectedModel === "string" ? parsed.selectedModel : undefined,
      autoDownload: Boolean(parsed.autoDownload),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read installer config.";
    return { ok: false, error: message };
  }
};

const consumeInstallerConfig = (): { ok: boolean } => {
  const configPath = resolveInstallerConfigPath();
  if (!existsSync(configPath)) {
    return { ok: true };
  }
  try {
    unlinkSync(configPath);
  } catch {
    // Ignore cleanup failures.
  }
  return { ok: true };
};

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket?: string;
  measurementId?: string;
};

const resolveFirebaseConfigPath = (): string => {
  const appDataRoot = path.join(app.getPath("appData"), "MeeraAI");
  return path.join(appDataRoot, "firebase.json");
};

const readFirebaseConfig = (): { ok: boolean; config?: FirebaseConfig; error?: string } => {
  const configPath = resolveFirebaseConfigPath();
  if (!existsSync(configPath)) {
    return { ok: false, error: "missing" };
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as FirebaseConfig;
    return { ok: true, config: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read Firebase config.";
    return { ok: false, error: message };
  }
};

const saveFirebaseConfig = (config: FirebaseConfig): { ok: boolean; error?: string } => {
  const configPath = resolveFirebaseConfigPath();
  try {
    const dir = path.dirname(configPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Firebase config.";
    return { ok: false, error: message };
  }
};

const resetFirebaseConfig = (): { ok: boolean; error?: string } => {
  const configPath = resolveFirebaseConfigPath();
  if (!existsSync(configPath)) {
    return { ok: true };
  }
  try {
    unlinkSync(configPath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset Firebase config.";
    return { ok: false, error: message };
  }
};

const findModelsRoot = (): string => {
  if (app.isPackaged) {
    return resolvePackagedModelsRoot();
  }
  const override = process.env.MEERA_MODELS_ROOT;
  if (override && existsSync(override)) {
    return path.resolve(override);
  }
  // Anchor models relative to the app install dir or release folder,
  // e.g. C:\Coding\LLM\Agent\desktop_frontend\release\models
  const workspaceModels = path.resolve(app.getAppPath(), "..", "models");
  const appRootModels = path.resolve(EXE_DIR, "models");
  const releaseModels = path.resolve(EXE_DIR, "..", "models");
  const devReleaseModels = path.resolve(app.getAppPath(), "release", "models");
  const appPathModels = path.resolve(app.getAppPath(), "..", "..", "..", "models");
  const candidates = [workspaceModels, devReleaseModels, appPathModels, appRootModels, releaseModels];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return releaseModels;
};


const sumDirectoryBytes = (dir: string): number => {
  if (!existsSync(dir)) {
    return 0;
  }
  let total = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += sumDirectoryBytes(fullPath);
    } else if (entry.isFile()) {
      try {
        total += statSync(fullPath).size;
      } catch {
        continue;
      }
    }
  }
  return total;
};

const requiredModelFilesPresent = (dir: string): boolean => {
  if (!existsSync(dir)) {
    return false;
  }
  try {
    const files = readdirSync(dir);
    if (files.some((file) => file.endsWith(".gguf"))) {
      return true;
    }
  } catch {
    // Ignore read error
  }
  const hasConfig = existsSync(path.join(dir, "config.json"));
  const hasTokenizer =
    existsSync(path.join(dir, "tokenizer.json")) ||
    existsSync(path.join(dir, "tokenizer.model")) ||
    existsSync(path.join(dir, "spiece.model"));
  const hasWeights =
    existsSync(path.join(dir, "model.safetensors")) ||
    existsSync(path.join(dir, "model.safetensors.index.json")) ||
    existsSync(path.join(dir, "pytorch_model.bin")) ||
    existsSync(path.join(dir, "pytorch_model.bin.index.json"));
  return hasConfig && hasTokenizer && hasWeights;
};

const readJsonFile = (filePath: string): Record<string, unknown> | null => {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const extractRepoId = (config: Record<string, unknown> | null): string | null => {
  if (!config) {
    return null;
  }
  const candidates = ["_name_or_path", "name_or_path", "model_id", "model"];
  for (const key of candidates) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const humanizeModelLabel = (value: string): string => {
  let normalized = (value || "").replace(/[-_]+/g, " ").replace(/\//g, " ").trim();
  normalized = normalized.replace(/(unsloth|local|gguf|quantized|thebloke|lmstudio-community|bartowski|mradermacher|city96)/gi, "");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized || value || "Local Model";
};

const inferPurpose = (value: string): { purpose: string; chatCapable: boolean } => {
  const lowered = value.toLowerCase();
  if (lowered.includes("asr") || lowered.includes("speech-to-text") || lowered.includes("transcribe")) {
    return { purpose: "asr", chatCapable: false };
  }
  if (lowered.includes("voice") || lowered.includes("tts") || lowered.includes("speech")) {
    return { purpose: "speech", chatCapable: false };
  }
  if (lowered.includes("coder") || lowered.includes("code")) {
    return { purpose: "coding", chatCapable: true };
  }
  if (lowered.includes("math") || lowered.includes("reason")) {
    return { purpose: "math", chatCapable: true };
  }
  return { purpose: "chat", chatCapable: true };
};

const inferDynamicModelId = (folderName: string, repoId: string | null): string => {
  if (repoId) {
    return `hf-${repoId.replace(/[^0-9a-zA-Z_-]/g, "-")}`;
  }
  return `local-${folderName.toLowerCase().replace(/[^0-9a-zA-Z_-]/g, "-")}`;
};

const extractQuantBits = (config: Record<string, unknown> | null): number | null => {
  if (!config) {
    return null;
  }
  const quant = config["quantization_config"];
  if (quant && typeof quant === "object") {
    const quantConfig = quant as Record<string, unknown>;
    if (quantConfig.load_in_4bit === true) {
      return 4;
    }
    if (quantConfig.load_in_8bit === true) {
      return 8;
    }
    for (const key of ["bits", "bit_width", "bits_per_weight"]) {
      const value = quantConfig[key];
      if (typeof value === "number" && (value === 4 || value === 8)) {
        return value;
      }
    }
  }
  return null;
};

const extractDtype = (config: Record<string, unknown> | null): string | null => {
  if (!config) {
    return null;
  }
  const dtype = config.torch_dtype ?? config.dtype;
  return typeof dtype === "string" && dtype.trim() ? dtype.trim().toLowerCase() : null;
};

const precisionLabelFromConfig = (config: Record<string, unknown> | null, quantBits: number | null): string | null => {
  if (quantBits === 4 || quantBits === 8) {
    return `${quantBits}-bit quantized`;
  }
  const dtype = extractDtype(config);
  return dtype || null;
};

const extractParamCount = (config: Record<string, unknown> | null): number | null => {
  if (!config) {
    return null;
  }
  const keys = ["num_parameters", "n_params", "params", "parameter_count", "num_params", "model_parameters"];
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "number" && value > 0) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10);
    }
  }
  return null;
};

const readIndexTotalSize = (dir: string): number => {
  const candidates = ["model.safetensors.index.json", "pytorch_model.bin.index.json"];
  for (const name of candidates) {
    const fullPath = path.join(dir, name);
    const data = readJsonFile(fullPath);
    if (!data) {
      continue;
    }
    const metadata = data.metadata;
    const totalSize =
      typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>).total_size : data.total_size;
    if (typeof totalSize === "number" && totalSize > 0) {
      return totalSize;
    }
  }
  return 0;
};

const bytesPerParam = (config: Record<string, unknown> | null, quantBits: number | null): number | null => {
  if (quantBits === 4 || quantBits === 8) {
    return quantBits / 8;
  }
  const dtype = extractDtype(config);
  if (!dtype) {
    return null;
  }
  const mapping: Record<string, number> = {
    float16: 2,
    fp16: 2,
    bfloat16: 2,
    bf16: 2,
    float32: 4,
    fp32: 4,
    float64: 8,
    fp64: 8,
    int8: 1,
    uint8: 1,
    int4: 0.5,
  };
  return mapping[dtype] ?? null;
};

const formatParamCount = (count: number): string => {
  if (count >= 1e9) {
    const value = count / 1e9;
    return value < 10 ? `${value.toFixed(1)}B` : `${value.toFixed(0)}B`;
  }
  if (count >= 1e6) {
    const value = count / 1e6;
    return value < 10 ? `${value.toFixed(1)}M` : `${value.toFixed(0)}M`;
  }
  if (count >= 1e3) {
    return `${(count / 1e3).toFixed(1)}K`;
  }
  return String(Math.trunc(count));
};

const deriveParamsLabel = (
  config: Record<string, unknown> | null,
  weightBytes: number,
  sizeBytes: number,
  quantBits: number | null,
): string => {
  const explicit = extractParamCount(config);
  if (explicit && explicit > 0) {
    return formatParamCount(explicit);
  }
  const bpp = bytesPerParam(config, quantBits);
  const base = weightBytes > 0 ? weightBytes : sizeBytes;
  if (bpp && base > 0) {
    return formatParamCount(Math.trunc(base / bpp));
  }
  return "";
};

const scanModelsOnDisk = (): {
  ok: boolean;
  root: string;
  models: Array<{
    id: string;
    label: string;
    folder: string;
    present: boolean;
    size_bytes: number;
    local_bytes: number;
    path: string;
    params?: string;
    precision?: string;
    repo_id?: string | null;
    quant_bits?: number | null;
    model_type?: string;
    purpose?: string;
    chat_capable?: boolean;
  }>;
} => {
  const modelsRoot = findModelsRoot();
  const entries = existsSync(modelsRoot) ? readdirSync(modelsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
  const models = entries.map((entry) => {
    const folderName = entry.name;
    const modelPath = path.join(modelsRoot, folderName);
    const present = requiredModelFilesPresent(modelPath);
    const localBytes = sumDirectoryBytes(modelPath);
    const config = readJsonFile(path.join(modelPath, "config.json"));
    const manifestPath = path.join(modelPath, MODEL_MANIFEST_NAME);
    const manifest = existsSync(manifestPath) ? readJsonFile(manifestPath) : null;

    let quantBits = extractQuantBits(config);
    try {
      const files = readdirSync(modelPath);
      if (quantBits === null && files.some((f) => f.toLowerCase().includes("q8") || f.toLowerCase().includes("8bit"))) {
        quantBits = 8;
      } else if (quantBits === null && files.some((f) => f.toLowerCase().includes("q6") || f.toLowerCase().includes("6bit"))) {
        quantBits = 6;
      } else if (quantBits === null && files.some((f) => f.toLowerCase().includes("q5") || f.toLowerCase().includes("5bit"))) {
        quantBits = 5;
      } else if (quantBits === null && files.some((f) => f.toLowerCase().includes("q4") || f.toLowerCase().includes("4bit"))) {
        quantBits = 4;
      }
    } catch {
      // Ignore read error
    }

    const precision = precisionLabelFromConfig(config, quantBits) || (quantBits ? `${quantBits}-bit quantized` : undefined);
    const weightBytes = present ? readIndexTotalSize(modelPath) : 0;
    const params = deriveParamsLabel(config, weightBytes, localBytes, quantBits);
    const repoId = extractRepoId(config) || (typeof manifest?.repo_id === "string" ? manifest.repo_id : null);
    const label = humanizeModelLabel(
      (typeof manifest?.repo_id === "string" ? manifest.repo_id.split("/").pop() : "") || folderName,
    );
    const modelId = inferDynamicModelId(folderName, repoId);
    const { purpose, chatCapable } = inferPurpose(`${label} ${folderName}`);

    return {
      id: modelId,
      label,
      folder: folderName,
      present,
      size_bytes: localBytes,
      local_bytes: localBytes,
      path: modelPath,
      params: params || undefined,
      precision,
      repo_id: repoId,
      quant_bits: quantBits,
      model_type: "causal",
      purpose,
      chat_capable: chatCapable,
    };
  });
  return { ok: true, root: modelsRoot, models };
};

const AUTH_WALLPAPER_DIR = isDev
  ? path.join(__dirname, "..", "public", "backgrounds")
  : path.join(__dirname, "..", "dist", "backgrounds");

const AUTH_DEFAULT_WALLPAPER = path.join(AUTH_WALLPAPER_DIR, "1.jpg");

const wallpaperDataUrlFromFile = (filePath: string): string => {
  try {
    const buffer = readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const getAuthWallpaperDataUrl = async (): Promise<string> => {
  const fallback = existsSync(AUTH_DEFAULT_WALLPAPER) ? wallpaperDataUrlFromFile(AUTH_DEFAULT_WALLPAPER) : "";
  if (!mainWindow || mainWindow.isDestroyed()) {
    return fallback;
  }

  try {
    const [sessionsRaw, activeIdRaw] = await Promise.all([
      mainWindow.webContents.executeJavaScript('localStorage.getItem("meera.sessions")', true),
      mainWindow.webContents.executeJavaScript('localStorage.getItem("meera.activeSession")', true),
    ]);

    const sessions = JSON.parse(typeof sessionsRaw === "string" ? sessionsRaw : "[]") as Array<{
      id?: string;
      appearance?: { wallpaperId?: string; customWallpaper?: string };
    }>;
    const activeId = typeof activeIdRaw === "string" ? activeIdRaw : "";
    const activeSession = sessions.find((session) => session?.id === activeId) ?? sessions[0];
    const appearance = activeSession?.appearance ?? {};

    if (typeof appearance.customWallpaper === "string" && appearance.customWallpaper.trim()) {
      return appearance.customWallpaper;
    }

    const wallpaperId = typeof appearance.wallpaperId === "string" ? appearance.wallpaperId : "wallpaper-1";
    const match = wallpaperId.match(/wallpaper-(\d+)/i);
    const index = match ? Number.parseInt(match[1], 10) : 1;
    const filename = Number.isFinite(index) ? `${index}.jpg` : "1.jpg";
    const filePath = path.join(AUTH_WALLPAPER_DIR, filename);
    if (existsSync(filePath)) {
      return wallpaperDataUrlFromFile(filePath);
    }
    const pngPath = path.join(AUTH_WALLPAPER_DIR, filename.replace(/\.jpg$/i, ".png"));
    if (existsSync(pngPath)) {
      return wallpaperDataUrlFromFile(pngPath);
    }
  } catch {
    return fallback;
  }

  return fallback;
};

const AUTH_CHROME_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap");
:root {
  --meera-auth-bar: ${AUTH_POPUP_BAR_HEIGHT}px;
  --meera-auth-bar-offset: 12px;
  --meera-auth-logo: ${AUTH_LOGO_CSS};
  --meera-auth-wallpaper: none;
  --meera-auth-font: "Manrope", "Segoe UI Variable", "Segoe UI", "SF Pro Text", "Inter", "Helvetica Neue", Arial, sans-serif;
  --meera-auth-surface: #eef3fa;
  --meera-auth-panel: rgba(255, 255, 255, 0.74);
  --meera-auth-panel-strong: rgba(255, 255, 255, 0.96);
  --meera-auth-border-strong: rgba(255, 255, 255, 0.7);
  --meera-auth-glass: rgba(255, 255, 255, 0.58);
  --meera-auth-glass-strong: rgba(255, 255, 255, 0.82);
  --meera-auth-glass-border: rgba(255, 255, 255, 0.32);
  --meera-auth-shadow: 0 28px 80px rgba(11, 20, 36, 0.18);
  --meera-auth-shadow-soft: 0 10px 26px rgba(11, 20, 36, 0.12);
  --meera-auth-accent: rgba(86, 138, 225, 0.22);
  --meera-auth-ink: #0b1222;
  --meera-auth-ink-subtle: rgba(15, 23, 42, 0.55);
  --meera-auth-frame-width: min(680px, calc(100vw - 48px));
  --meera-auth-frame-height: min(820px, calc(100vh - var(--meera-auth-bar) - 28px));
  --meera-auth-radius-outer: 26px;
  --meera-auth-radius-inner: 20px;
  --meera-auth-dock-height: calc(var(--meera-auth-bar) - 18px);
  --meera-auth-dock-width: var(--meera-auth-frame-width);
  --meera-auth-highlight: rgba(255, 255, 255, 0.7);
  --meera-auth-glow: rgba(98, 150, 238, 0.2);
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  height: 100%;
}
body {
  padding-top: calc(var(--meera-auth-bar) + var(--meera-auth-bar-offset)) !important;
  box-sizing: border-box !important;
  background: radial-gradient(circle at 18% 15%, rgba(255, 255, 255, 0.96), rgba(214, 226, 244, 0.65)) !important;
  display: block !important;
  overscroll-behavior: none;
}
* {
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  width: 0;
  height: 0;
}
#meera-auth-surface {
  position: relative;
  min-height: calc(100vh - var(--meera-auth-bar));
  padding: 22px 22px 36px;
  display: grid;
  place-items: center;
  background-color: var(--meera-auth-surface);
  background-image:
    var(--meera-auth-wallpaper),
    radial-gradient(circle at 12% 16%, rgba(120, 170, 255, 0.16), transparent 52%),
    radial-gradient(circle at 88% 10%, rgba(255, 198, 220, 0.12), transparent 46%),
    linear-gradient(160deg, rgba(255, 255, 255, 0.55), rgba(214, 226, 244, 0.7));
  background-blend-mode: normal, screen, screen, normal;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  animation: meeraAuthBg 16s ease-in-out infinite;
}
#meera-auth-surface::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08) 48%, rgba(255, 255, 255, 0.04)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(232, 240, 252, 0.14));
  backdrop-filter: blur(10px) saturate(1.05);
  -webkit-backdrop-filter: blur(10px) saturate(1.05);
  z-index: 0;
}
#meera-auth-surface::after {
  content: "";
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 20% 78%, rgba(255, 255, 255, 0.18), transparent 42%),
    radial-gradient(circle at 82% 75%, rgba(120, 176, 255, 0.12), transparent 46%),
    repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 1px, transparent 1px, transparent 7px);
  opacity: 0.26;
  pointer-events: none;
  z-index: 0;
}
#meera-auth-frame {
  position: relative;
  z-index: 1;
  width: var(--meera-auth-frame-width);
  height: var(--meera-auth-frame-height);
  max-height: calc(100vh - var(--meera-auth-bar) - 48px);
  display: flex;
  padding: 12px;
  background:
    linear-gradient(150deg, var(--meera-auth-panel), rgba(220, 233, 250, 0.52));
  border-radius: var(--meera-auth-radius-outer);
  border: 1px solid var(--meera-auth-border-strong);
  box-shadow: var(--meera-auth-shadow), 0 8px 24px rgba(255, 255, 255, 0.45) inset;
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
  overflow: hidden;
  animation: meeraAuthFloatIn 0.55s cubic-bezier(0.2, 0.75, 0.25, 1) both;
  transition: transform 0.35s ease, box-shadow 0.35s ease;
}
#meera-auth-frame::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: calc(var(--meera-auth-radius-outer) - 2px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  pointer-events: none;
}
#meera-auth-frame::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--meera-auth-radius-outer);
  background:
    radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.65), transparent 45%),
    radial-gradient(circle at 85% 12%, rgba(140, 190, 255, 0.24), transparent 50%);
  opacity: 0.5;
  pointer-events: none;
}
#meera-auth-content {
  height: 100%;
  max-height: calc(100vh - var(--meera-auth-bar) - 68px);
  overflow: auto;
  background: var(--meera-auth-panel-strong);
  border-radius: var(--meera-auth-radius-inner);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.78),
    inset 0 0 0 2px rgba(12, 48, 88, 0.05),
    var(--meera-auth-shadow-soft);
  width: 100%;
  box-sizing: border-box;
  isolation: isolate;
  position: relative;
  animation: meeraAuthContentIn 0.45s ease both;
}
:root[data-meera-auth-host*="github.com"] {
  --meera-auth-ink: #e5e7eb;
  --meera-auth-ink-subtle: rgba(226, 232, 240, 0.65);
  --meera-auth-panel: rgba(16, 22, 34, 0.7);
  --meera-auth-panel-strong: rgba(9, 14, 22, 0.88);
  --meera-auth-border-strong: rgba(255, 255, 255, 0.16);
  --meera-auth-shadow: 0 40px 100px rgba(5, 8, 16, 0.55);
}
:root[data-meera-auth-host*="github.com"] #meera-auth-content {
  background: transparent;
  box-shadow: none;
}
:root[data-meera-auth-host*="github.com"] #meera-auth-frame {
  background: linear-gradient(160deg, rgba(16, 22, 34, 0.72), rgba(8, 12, 20, 0.6));
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: var(--meera-auth-shadow);
}
:root[data-meera-auth-host*="github.com"] #meera-auth-frame::before {
  border-color: rgba(255, 255, 255, 0.22);
}
:root[data-meera-auth-host*="github.com"] #meera-auth-frame::after {
  opacity: 0.35;
}
:root[data-meera-auth-host*="microsoftonline.com"],
:root[data-meera-auth-host*="live.com"] {
  --meera-auth-accent: rgba(0, 103, 184, 0.22);
  --meera-auth-ink: #0f172a;
  --meera-auth-ink-subtle: rgba(30, 41, 59, 0.6);
  --meera-auth-panel: rgba(255, 255, 255, 0.78);
  --meera-auth-panel-strong: rgba(255, 255, 255, 0.98);
  --meera-auth-border-strong: rgba(255, 255, 255, 0.75);
  --meera-auth-shadow: 0 32px 90px rgba(15, 23, 42, 0.2);
}
:root[data-meera-auth-host*="google"] #meera-auth-frame {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.52), rgba(220, 233, 250, 0.4));
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 36px 90px rgba(10, 16, 24, 0.22);
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
}
:root[data-meera-auth-host*="google"] #meera-auth-frame::after {
  opacity: 0.35;
}
:root[data-meera-auth-host*="google"] #meera-auth-content {
  background: #ffffff;
  box-shadow:
    0 18px 40px rgba(10, 16, 24, 0.12),
    inset 0 0 0 1px rgba(12, 48, 88, 0.05);
}
:root[data-meera-auth-host*="google"] #meera-auth-content::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.85);
  pointer-events: none;
}
#meera-oauth-titlebar,
#meera-oauth-titlebar * {
  box-sizing: border-box !important;
  font-family: var(--meera-auth-font) !important;
}
#meera-oauth-titlebar button {
  all: unset;
  box-sizing: border-box;
}
#meera-oauth-titlebar {
  position: fixed;
  top: var(--meera-auth-bar-offset);
  left: 0;
  right: 0;
  height: var(--meera-auth-bar);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 16px;
  box-sizing: border-box;
  background: transparent;
  border-bottom: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  z-index: 2147483647;
  font-family: var(--meera-auth-font);
  -webkit-app-region: drag;
  animation: meeraAuthBarIn 0.45s ease both;
  pointer-events: none;
}
#meera-oauth-titlebar .meera-oauth-dock {
  width: var(--meera-auth-dock-width);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 6px 16px;
  height: var(--meera-auth-dock-height);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(222, 232, 246, 0.74)) !important;
  border: 1px solid var(--meera-auth-border-strong) !important;
  box-shadow: 0 18px 44px rgba(12, 20, 36, 0.18), 0 1px 0 rgba(255, 255, 255, 0.75) inset !important;
  backdrop-filter: blur(18px) saturate(1.06);
  -webkit-backdrop-filter: blur(18px) saturate(1.06);
  -webkit-app-region: drag;
  pointer-events: auto;
  animation: meeraDockFloat 8s ease-in-out infinite;
}
#meera-oauth-titlebar .meera-oauth-dock::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  opacity: 0.85;
  pointer-events: none;
}
#meera-oauth-titlebar .meera-oauth-dock::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent 60%);
  opacity: 0.7;
  pointer-events: none;
}
#meera-oauth-titlebar::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 12% 20%, rgba(160, 210, 255, 0.25), transparent 45%);
  opacity: 0.5;
  pointer-events: none;
}
#meera-oauth-titlebar .meera-oauth-left {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
  min-width: 0;
}
#meera-oauth-titlebar .meera-oauth-logo {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background-image: var(--meera-auth-logo);
  background-size: cover;
  background-position: center;
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.75);
  box-shadow: 0 10px 18px rgba(10, 16, 28, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
}
#meera-oauth-titlebar .meera-oauth-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
#meera-oauth-titlebar .meera-oauth-name {
  font-size: 13px;
  letter-spacing: 0.02em;
  text-transform: none;
  font-weight: 600;
  color: var(--meera-auth-ink);
  font-family: var(--meera-auth-font);
  white-space: nowrap;
}
#meera-oauth-titlebar .meera-oauth-sub {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: none;
  color: var(--meera-auth-ink-subtle);
  font-family: var(--meera-auth-font);
  white-space: nowrap;
}
#meera-oauth-titlebar .meera-oauth-controls {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}
#meera-oauth-titlebar .meera-oauth-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.85) !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(225, 236, 252, 0.82)) !important;
  color: rgba(11, 18, 34, 0.82);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  -webkit-app-region: no-drag;
  box-shadow: 0 10px 20px rgba(12, 20, 36, 0.12), 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}
#meera-oauth-titlebar .meera-oauth-btn svg {
  width: 14px;
  height: 14px;
}
#meera-oauth-titlebar .meera-oauth-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(120, 186, 255, 0.55);
  background: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(232, 242, 255, 0.85));
  box-shadow: 0 10px 22px rgba(10, 16, 28, 0.2);
}
#meera-oauth-titlebar .meera-oauth-btn.close:hover {
  border-color: rgba(255, 140, 150, 0.7);
  background: rgba(255, 210, 214, 0.8);
  box-shadow: 0 10px 22px rgba(30, 8, 14, 0.2);
}
:root[data-meera-auth-host*="github.com"] #meera-oauth-titlebar .meera-oauth-dock {
  background: linear-gradient(135deg, rgba(16, 23, 36, 0.88), rgba(10, 14, 24, 0.82)) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 18px 44px rgba(2, 6, 18, 0.6), 0 1px 0 rgba(255, 255, 255, 0.08) inset !important;
}
:root[data-meera-auth-host*="github.com"] #meera-oauth-titlebar .meera-oauth-btn {
  background: linear-gradient(180deg, rgba(20, 26, 38, 0.92), rgba(12, 18, 30, 0.9)) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
  color: rgba(226, 232, 240, 0.85);
  box-shadow: 0 10px 20px rgba(5, 8, 16, 0.6), 0 1px 0 rgba(255, 255, 255, 0.1) inset;
}
:root[data-meera-auth-host*="github.com"] #meera-oauth-titlebar .meera-oauth-btn:hover {
  border-color: rgba(140, 180, 255, 0.35);
  background: linear-gradient(180deg, rgba(28, 36, 52, 0.95), rgba(16, 22, 36, 0.92)) !important;
}
@keyframes meeraAuthFloatIn {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes meeraAuthBarIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes meeraAuthBg {
  0%,
  100% {
    filter: saturate(1) brightness(1);
  }
  50% {
    filter: saturate(1.06) brightness(1.03);
  }
}
@keyframes meeraDockFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}
@keyframes meeraAuthContentIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

const AUTH_CHROME_SCRIPT = `
(() => {
  const css = ${JSON.stringify(AUTH_CHROME_CSS)};
  const ICONS = ${JSON.stringify(AUTH_WINDOW_ICONS)};
  const controlsApi = (window.meeraAuth && window.meeraAuth.windowControls) || (window.meera && window.meera.windowControls) || {};
  const createIcon = (spec) => {
    try {
      if (!spec || !spec.paths || !spec.viewBox) return null;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", spec.viewBox);
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", String(spec.strokeWidth || 2));
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      spec.paths.forEach((d) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.appendChild(path);
      });
      return svg;
    } catch {
      return null;
    }
  };

  const ensureChrome = () => {
    let styleEl = document.getElementById("meera-auth-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "meera-auth-style";
      document.head.appendChild(styleEl);
    }
    if (styleEl.textContent !== css) {
      styleEl.textContent = css;
    }

    document.documentElement.dataset.meeraAuthHost = window.location.hostname || "";
    let bar = document.getElementById("meera-oauth-titlebar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "meera-oauth-titlebar";
      document.documentElement.appendChild(bar);
    }

    if (!bar.querySelector(".meera-oauth-dock")) {
      while (bar.firstChild) {
        bar.removeChild(bar.firstChild);
      }
      const left = document.createElement("div");
      left.className = "meera-oauth-left";
      const logo = document.createElement("div");
      logo.className = "meera-oauth-logo";
      const brand = document.createElement("div");
      brand.className = "meera-oauth-brand";
      const name = document.createElement("span");
      name.className = "meera-oauth-name";
      name.textContent = "MeeraAI";
      const sub = document.createElement("span");
      sub.className = "meera-oauth-sub";
      sub.textContent = "Secure Access";
      brand.appendChild(name);
      brand.appendChild(sub);
      left.appendChild(logo);
      left.appendChild(brand);
      const controls = document.createElement("div");
      controls.className = "meera-oauth-controls";

      const makeBtn = (label, iconKey, onClick, extraClass) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "meera-oauth-btn" + (extraClass ? " " + extraClass : "");
        btn.setAttribute("aria-label", label);
        const svgNode = createIcon(ICONS[iconKey]);
        if (svgNode) {
          btn.appendChild(svgNode);
        } else {
          btn.textContent = label;
        }
        btn.addEventListener("click", () => {
          try {
            onClick();
          } catch {}
        });
        return btn;
      };

      controls.appendChild(
        makeBtn("Minimize", "minimize", () => {
          if (controlsApi.minimize) controlsApi.minimize();
        })
      );
      controls.appendChild(
        makeBtn("Maximize", "maximize", () => {
          if (controlsApi.maximize) controlsApi.maximize();
        })
      );
      controls.appendChild(
        makeBtn("Close", "close", () => {
          if (controlsApi.close) {
            controlsApi.close();
          } else {
            window.close();
          }
        }, "close")
      );

      const dock = document.createElement("div");
      dock.className = "meera-oauth-dock";
      dock.appendChild(left);
      dock.appendChild(controls);
      bar.appendChild(dock);
    }

    if (!document.getElementById("meera-auth-surface")) {
      const surface = document.createElement("div");
      surface.id = "meera-auth-surface";
      const frame = document.createElement("div");
      frame.id = "meera-auth-frame";
      const content = document.createElement("div");
      content.id = "meera-auth-content";
      const nodes = Array.from(document.body.childNodes);
      nodes.forEach((node) => content.appendChild(node));
      frame.appendChild(content);
      surface.appendChild(frame);
      while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
      }
      document.body.appendChild(surface);
    }
  };

  ensureChrome();

  if (!window.__meeraAuthKeepAlive) {
    window.__meeraAuthKeepAlive = true;
    const observer = new MutationObserver(() => {
      if (!document.getElementById("meera-oauth-titlebar") || !document.getElementById("meera-auth-surface")) {
        ensureChrome();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => {
      ensureChrome();
    }, 1500);
  }
})();
`;

type DesktopApp = {
  key: string;
  name: string;
  processName: string;
  windowTitle: string;
  path: string;
  lastSeenAt: number;
};

type DesktopAppEvent = {
  key: string;
  name: string;
  processName: string;
  state: "opened" | "closed";
  timestamp: number;
};

type ShareChatPayload = {
  target?: "copy" | "whatsapp" | "desktop-app";
  text?: string;
  title?: string;
  processName?: string;
  appPath?: string;
};

type ShareChatResult = {
  ok: boolean;
  mode?: "copy" | "whatsapp" | "desktop-app";
  message?: string;
  error?: string;
};

type RawWindowsProcess = {
  ProcessName?: string;
  MainWindowTitle?: string;
  Path?: string;
};

const WINDOWS_PROCESS_BLACKLIST = new Set([
  "applicationframehost",
  "dwm",
  "electron",
  "lockapp",
  "meeraai",
  "meeraai desktop",
  "nvidia share",
  "searchapp",
  "searchhost",
  "shellexperiencehost",
  "startmenuexperiencehost",
  "taskmgr",
  "textinputhost",
]);

const DESKTOP_APP_LABELS: Record<string, string> = {
  chrome: "Chrome",
  code: "VS Code",
  discord: "Discord",
  dockerdesktop: "Docker",
  explorer: "Explorer",
  figma: "Figma",
  firefox: "Firefox",
  githubdesktop: "GitHub Desktop",
  msedge: "Edge",
  notion: "Notion",
  obsidian: "Obsidian",
  postman: "Postman",
  powershell: "PowerShell",
  slack: "Slack",
  spotify: "Spotify",
  systemsettings: "Settings",
  telegram: "Telegram",
  terminal: "Terminal",
  whatsapp: "WhatsApp",
  windowsterminal: "Terminal",
};

const SHARE_APP_PROTOCOLS: Record<string, string> = {
  discord: "discord://",
  slack: "slack://open",
  skype: "skype:",
  teams: "msteams://",
  telegram: "tg://",
  whatsapp: "whatsapp://send",
};

let knownDesktopApps = new Map<string, DesktopApp>();
let desktopActivity: DesktopAppEvent[] = [];
let prodServerOrigin: string | null = null;
let prodServer: http.Server | null = null;
let splashWindow: BrowserWindow | null = null;

function normalizeProcessName(value: string): string {
  return value.replace(/\.exe$/i, "").trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function friendlyDesktopAppName(processName: string): string {
  const normalized = normalizeProcessName(processName);
  return DESKTOP_APP_LABELS[normalized] ?? titleCase(normalized);
}

function logDesktopEvent(event: DesktopAppEvent): void {
  desktopActivity = [event, ...desktopActivity].slice(0, 18);
}

async function listDesktopAppsWindows(): Promise<DesktopApp[]> {
  const command = [
    "$apps = Get-Process -ErrorAction SilentlyContinue |",
    "Where-Object { $_.MainWindowHandle -ne 0 } |",
    "ForEach-Object { [PSCustomObject]@{ ProcessName = $_.ProcessName; MainWindowTitle = $_.MainWindowTitle; Path = $_.Path } } |",
    "ConvertTo-Json -Compress;",
    "if ([string]::IsNullOrWhiteSpace($apps)) { '[]' } else { $apps }",
  ].join(" ");

  let stdout = "[]";
  try {
    const result = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    });
    stdout = result.stdout;
  } catch (err) {
    console.error("Failed to execute PowerShell script:", err);
  }

  let rows: RawWindowsProcess[] = [];
  try {
    const parsed = JSON.parse(stdout || "[]") as RawWindowsProcess | RawWindowsProcess[];
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error("Failed to parse desktop apps JSON:", err, "Raw stdout snippet:", stdout.substring(0, 500));
    return [];
  }

  const seenAt = Date.now();

  return rows
    .filter((row): row is RawWindowsProcess => Boolean(row?.ProcessName))
    .map((row) => {
      const processName = normalizeProcessName(row.ProcessName ?? "");
      return {
        key: `${processName}:${(row.Path ?? row.MainWindowTitle ?? processName).toLowerCase()}`,
        name: friendlyDesktopAppName(processName),
        processName,
        windowTitle: (row.MainWindowTitle ?? "").trim(),
        path: (row.Path ?? "").trim(),
        lastSeenAt: seenAt,
      };
    })
    .filter((appInfo) => appInfo.processName && !WINDOWS_PROCESS_BLACKLIST.has(appInfo.processName))
    .slice(0, 18);
}

async function listDesktopAppsMac(): Promise<DesktopApp[]> {
  const script = `
    tell application "System Events"
      set appList to every application process whose background only is false
      set out to {}
      repeat with p in appList
        set end of out to (name of p & "|" & (bundle identifier of p as text) & "|" & (displayed name of p as text))
      end repeat
      return out
    end tell
  `;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const seenAt = Date.now();
    return stdout.split(", ").filter(Boolean).map(entry => {
      const [name, bundleId, dispName] = entry.split("|");
      const procName = normalizeProcessName(name || "");
      return {
        key: `${procName}:${bundleId || procName}`.toLowerCase(),
        name: dispName || name,
        processName: procName,
        windowTitle: "",
        path: `/Applications/${name}.app`,
        lastSeenAt: seenAt,
      };
    });
  } catch {
    return [];
  }
}

async function collectDesktopApps(): Promise<DesktopApp[]> {
  if (process.platform === "win32") {
    return listDesktopAppsWindows();
  }
  if (process.platform === "darwin") {
    return listDesktopAppsMac();
  }
  return [];
}

async function getDesktopAppsPayload(): Promise<{ apps: DesktopApp[]; events: DesktopAppEvent[]; refreshedAt: number }> {
  const apps = await collectDesktopApps();
  const nextMap = new Map<string, DesktopApp>(apps.map((appInfo) => [appInfo.key, appInfo]));

  for (const appInfo of apps) {
    if (!knownDesktopApps.has(appInfo.key)) {
      logDesktopEvent({
        key: appInfo.key,
        name: appInfo.name,
        processName: appInfo.processName,
        state: "opened",
        timestamp: Date.now(),
      });
    }
  }

  for (const [key, appInfo] of knownDesktopApps.entries()) {
    if (!nextMap.has(key)) {
      logDesktopEvent({
        key,
        name: appInfo.name,
        processName: appInfo.processName,
        state: "closed",
        timestamp: Date.now(),
      });
    }
  }

  knownDesktopApps = nextMap;
  return {
    apps,
    events: desktopActivity,
    refreshedAt: Date.now(),
  };
}

function configureDevStoragePaths(): void {
  if (!isDev) {
    return;
  }

  // Keep dev auth/chat storage durable. Older builds used temp; copy it once if present.
  const legacyProfileRoot = path.join(app.getPath("temp"), "meeraai-desktop-dev");
  const devProfileRoot = path.join(app.getPath("appData"), "MeeraAI", "desktop-dev-profile");
  const userDataPath = path.join(devProfileRoot, "user-data");
  const sessionDataPath = path.join(devProfileRoot, "session-data");
  const cachePath = path.join(devProfileRoot, "cache");
  const legacyUserDataPath = path.join(legacyProfileRoot, "user-data");
  const legacySessionDataPath = path.join(legacyProfileRoot, "session-data");

  try {
    if (!existsSync(userDataPath) && existsSync(legacyUserDataPath)) {
      cpSync(legacyUserDataPath, userDataPath, { recursive: true });
    }
    if (!existsSync(sessionDataPath) && existsSync(legacySessionDataPath)) {
      cpSync(legacySessionDataPath, sessionDataPath, { recursive: true });
    }
    mkdirSync(userDataPath, { recursive: true });
    mkdirSync(sessionDataPath, { recursive: true });
    mkdirSync(cachePath, { recursive: true });
  } catch (err) {
    console.warn("Failed to create storage directories:", err);
  }

  app.setPath("userData", userDataPath);
  app.setPath("sessionData", sessionDataPath);
  // Note: app.setPath("cache", cachePath) is not supported - cache is stored within userData
}

configureDevStoragePaths();

function fallbackHtml(errorDetail: string): string {
  const message = errorDetail.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <html>
      <body style="font-family:Segoe UI,Arial,sans-serif;background:#061a2d;color:#dbefff;padding:24px;">
        <h2 style="margin:0 0 10px;">Meera renderer failed to load</h2>
        <p style="margin:0 0 12px;opacity:.9;">The app UI could not be initialized. Rebuild the frontend and relaunch.</p>
        <pre style="background:#08253f;padding:12px;border-radius:8px;white-space:pre-wrap;">${message}</pre>
      </body>
    </html>
  `;
}

function buildSplashHtml(): string {
  const logoPath = isDev
    ? path.join(__dirname, "..", "public", "logo.png")
    : path.join(__dirname, "..", "dist", "logo.png");
  const wallpaperPath = isDev
    ? path.join(__dirname, "..", "public", "backgrounds", "wallpaper-1.jpg")
    : path.join(__dirname, "..", "dist", "backgrounds", "wallpaper-1.jpg");
  const logoUrl = pathToFileURL(logoPath).toString();
  const wallpaperUrl = pathToFileURL(wallpaperPath).toString();

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>MeeraAI</title>
      <style>
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap");
        :root {
          --glass: rgba(255, 255, 255, 0.16);
          --glass-strong: rgba(255, 255, 255, 0.28);
          --glass-border: rgba(255, 255, 255, 0.35);
          --ink: #f6f8ff;
          --accent: #a8ccff;
          --accent-soft: rgba(168, 204, 255, 0.35);
          --rose: rgba(255, 190, 220, 0.28);
          --neon: rgba(90, 160, 255, 0.5);
        }
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          background: #050a12;
          overflow: hidden;
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          color: var(--ink);
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          background: url('${wallpaperUrl}') center/cover no-repeat;
          filter: blur(18px) saturate(1.25);
          transform: scale(1.06);
        }
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.3), transparent 46%),
            radial-gradient(circle at 82% 18%, var(--rose), transparent 42%),
            linear-gradient(180deg, rgba(6, 10, 18, 0.2), rgba(6, 10, 18, 0.65));
          backdrop-filter: blur(16px);
        }
        .scene {
          position: relative;
          z-index: 1;
          height: 100%;
          display: grid;
          place-items: center;
          padding: 40px;
        }
        .grid {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(transparent 96%, rgba(255, 255, 255, 0.05)),
            linear-gradient(90deg, transparent 96%, rgba(255, 255, 255, 0.05));
          background-size: 64px 64px;
          opacity: 0.25;
          pointer-events: none;
          animation: gridDrift 12s linear infinite;
        }
        .glass-frame {
          width: min(920px, 90vw);
          border-radius: 34px;
          padding: 48px;
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
          border: 1px solid var(--glass-border);
          box-shadow:
            0 40px 120px rgba(6, 12, 24, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(24px) saturate(1.2);
          position: relative;
          overflow: hidden;
        }
        .glass-frame::before {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          pointer-events: none;
        }
        .glass-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 34px;
          background:
            radial-gradient(circle at 20% 12%, rgba(255, 255, 255, 0.6), transparent 48%),
            radial-gradient(circle at 85% 14%, rgba(140, 190, 255, 0.25), transparent 52%);
          opacity: 0.7;
          pointer-events: none;
        }
        .content {
          position: relative;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 40px;
          align-items: center;
          z-index: 2;
        }
        .holo {
          position: relative;
          min-height: 360px;
          display: grid;
          place-items: center;
          border-radius: 26px;
          background: linear-gradient(160deg, rgba(20, 35, 60, 0.35), rgba(10, 16, 28, 0.6));
          border: 1px solid rgba(120, 170, 255, 0.25);
          box-shadow: inset 0 0 40px rgba(90, 150, 255, 0.18);
          overflow: hidden;
        }
        .holo::before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            180deg,
            rgba(120, 180, 255, 0.12) 0px,
            rgba(120, 180, 255, 0.12) 1px,
            transparent 1px,
            transparent 6px
          );
          opacity: 0.4;
          animation: scan 3s linear infinite;
        }
        .robot {
          width: 260px;
          height: 300px;
          position: relative;
        }
        .robot svg {
          width: 100%;
          height: 100%;
        }
        .robot path {
          stroke: rgba(160, 205, 255, 0.9);
          stroke-width: 2;
          fill: transparent;
          stroke-dasharray: 800;
          stroke-dashoffset: 800;
          animation: draw 2.6s ease forwards;
          filter: drop-shadow(0 0 12px rgba(120, 180, 255, 0.5));
        }
        .eye {
          fill: rgba(170, 220, 255, 0.9);
          filter: drop-shadow(0 0 8px rgba(140, 200, 255, 0.8));
          animation: blink 4s ease-in-out infinite;
        }
        .orbit {
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 1px solid rgba(120, 180, 255, 0.3);
          box-shadow: 0 0 20px rgba(120, 180, 255, 0.2);
          animation: spin 12s linear infinite;
        }
        .particles span {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(140, 190, 255, 0.7);
          animation: float 6s ease-in-out infinite;
        }
        .particles span:nth-child(1) { top: 20%; left: 10%; animation-delay: 0s; }
        .particles span:nth-child(2) { top: 30%; right: 15%; animation-delay: 1s; }
        .particles span:nth-child(3) { bottom: 25%; left: 20%; animation-delay: 2s; }
        .particles span:nth-child(4) { bottom: 18%; right: 18%; animation-delay: 3s; }
        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .logo {
          width: 72px;
          height: 72px;
          object-fit: contain;
          filter: drop-shadow(0 16px 32px rgba(110, 140, 255, 0.5));
        }
        .title {
          font-size: 38px;
          letter-spacing: 0.02em;
          margin: 0;
        }
        .subtitle {
          margin-top: 6px;
          font-size: 14px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(228, 236, 255, 0.7);
        }
        .status {
          margin-top: 26px;
          font-size: 15px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(236, 242, 255, 0.8);
        }
        .glyphs {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 10px;
          color: rgba(160, 205, 255, 0.8);
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .glyphs span {
          animation: glyph 2.6s ease-in-out infinite;
        }
        .glyphs span:nth-child(odd) { animation-delay: 0.6s; }
        .progress {
          margin-top: 24px;
          height: 7px;
          width: min(360px, 70vw);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.18);
          overflow: hidden;
          position: relative;
        }
        .progress::after {
          content: "";
          position: absolute;
          inset: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, rgba(156, 198, 255, 0.9), transparent);
          animation: shimmer 1.8s ease-in-out infinite;
        }
        .footer {
          margin-top: 18px;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(210, 220, 240, 0.6);
        }
        @keyframes draw { to { stroke-dashoffset: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink {
          0%, 92%, 100% { opacity: 1; }
          94%, 96% { opacity: 0.2; }
        }
        @keyframes scan { 0% { transform: translateY(-20%); } 100% { transform: translateY(20%); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes shimmer { 0% { transform: translateX(-60%); } 100% { transform: translateX(160%); } }
        @keyframes gridDrift { 0% { transform: translateY(0); } 100% { transform: translateY(16px); } }
        @keyframes glyph { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
        @media (max-width: 900px) {
          .content { grid-template-columns: 1fr; }
          .holo { order: 2; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="scene">
        <div class="grid"></div>
        <div class="glass-frame">
          <div class="content">
            <div class="holo">
              <div class="orbit"></div>
              <div class="robot">
                <svg viewBox="0 0 200 240" role="img" aria-label="AI robot">
                  <path d="M60 40h80l18 26v74l-16 22H58l-16-22V66l18-26zM72 18h56v20H72zM70 176h60v34H70zM52 90h12v28H52zM136 90h12v28h-12z" />
                  <circle class="eye" cx="80" cy="92" r="6" />
                  <circle class="eye" cx="120" cy="92" r="6" />
                </svg>
              </div>
              <div class="particles">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div>
              <div class="brand">
                <img class="logo" src="${logoUrl}" alt="MeeraAI logo" />
                <div>
                  <h1 class="title">MeeraAI</h1>
                  <div class="subtitle">Secure Access</div>
                </div>
              </div>
              <div class="status">Initializing Neural Systems</div>
              <div class="glyphs">
                <span>AI</span><span>01</span><span>λ</span><span>Core</span><span>Synapse</span>
                <span>Node</span><span>Pulse</span><span>Vector</span><span>Grid</span><span>Quantum</span>
              </div>
              <div class="progress"></div>
              <div class="footer">Building your future workspace</div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function checkUrlStatus(url: string, timeoutMs = 1000): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      });
      req.on("error", () => resolve(null));
      req.setTimeout(timeoutMs, () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

const waitForDevServer = async (timeoutMs = 15000): Promise<boolean> => {
  const startedAt = Date.now();
  const moduleUrl = new URL("/src/App.tsx", DEV_SERVER_ORIGIN).toString();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await checkUrlStatus(moduleUrl, 800);
    if (status === 200) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 960,
    height: 640,
    resizable: false,
    movable: true,
    frame: false,
    show: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  splash.loadURL(buildSplashHtml());
  splash.once("ready-to-show", () => {
    splash.show();
  });

  return splash;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function resolveStaticFilePath(requestPath: string): string {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
  const safePath = decoded === "/" ? "/index.html" : decoded;
  const absolute = path.normalize(path.join(PROD_DIST_DIR, safePath));

  if (!absolute.startsWith(PROD_DIST_DIR)) {
    return PROD_ENTRY;
  }

  if (!existsSync(absolute) || statSync(absolute).isDirectory()) {
    return PROD_ENTRY;
  }

  return absolute;
}

function handleStaticRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const filePath = resolveStaticFilePath(url.pathname);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(err instanceof Error ? err.message : "Static server error.");
  }
}

async function startProdServer(): Promise<string> {
  if (prodServerOrigin) {
    return prodServerOrigin;
  }

  if (!prodServer) {
    prodServer = http.createServer(handleStaticRequest);
  }

  return new Promise((resolve) => {
    const bind = (port: number) => {
      prodServer?.removeAllListeners("error");
      prodServer?.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port !== 0) {
          bind(0);
          return;
        }
        console.error("Failed to start prod server:", err);
        resolve(`file://${PROD_ENTRY}`);
      });
      prodServer?.listen(port, PROD_SERVER_BIND, () => {
        const address = prodServer?.address();
        const actualPort = typeof address === "object" && address ? address.port : port;
        prodServerOrigin = `http://${PROD_SERVER_BIND}:${actualPort}`;
        resolve(prodServerOrigin);
      });
    };

    bind(PROD_SERVER_PORT);
  });
}

function isAppUrl(targetUrl: string): boolean {
  if (targetUrl.startsWith("data:")) {
    return true;
  }

  if (targetUrl.startsWith("blob:")) {
    return true;
  }

  if (targetUrl.startsWith("file:")) {
    return true;
  }

  if (isDev && targetUrl.startsWith(DEV_SERVER_ORIGIN)) {
    return true;
  }

  if (isAuthUrl(targetUrl)) {
    return true;
  }

  if (!isDev && prodServerOrigin && targetUrl.startsWith(prodServerOrigin)) {
    return true;
  }

  if (!isDev && targetUrl.startsWith(`http://${PROD_SERVER_BIND}:`)) {
    return true;
  }

  return false;
}

function isAuthUrl(targetUrl: string): boolean {
  try {
    const url = new URL(targetUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }
    const host = url.host.toLowerCase();
    if (FIREBASE_AUTH_DOMAIN && host === FIREBASE_AUTH_DOMAIN.toLowerCase()) {
      return true;
    }
    if (host.endsWith(".firebaseapp.com")) {
      return true;
    }
    return AUTH_HOST_ALLOWLIST.has(host);
  } catch {
    return false;
  }
}

function isSupportedExternalUrl(targetUrl: string): boolean {
  try {
    const protocol = new URL(String(targetUrl || "")).protocol;
    return ["http:", "https:", "mailto:", "tel:", "whatsapp:"].includes(protocol);
  } catch {
    return false;
  }
}

function openExternal(targetUrl: string): void {
  // Never hand custom schemes (including chrome-extension://) to the OS.
  // Unsupported document/protocol links stay inside Meera's own viewer.
  if (!isSupportedExternalUrl(targetUrl)) {
    return;
  }
  void shell.openExternal(targetUrl);
}

async function openExternalUrl(targetUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = new URL(String(targetUrl || ""));
    if (!["http:", "https:", "mailto:", "tel:", "whatsapp:"].includes(parsed.protocol)) {
      return { ok: false, error: "unsupported_protocol" };
    }
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch {
    return { ok: false, error: "open_external_failed" };
  }
}

async function openWhatsAppShare(text: string): Promise<void> {
  const encoded = encodeURIComponent(text);
  const primary = `whatsapp://send?text=${encoded}`;
  const fallback = `https://wa.me/?text=${encoded}`;
  try {
    await shell.openExternal(primary);
  } catch {
    await shell.openExternal(fallback);
  }
}

async function openDesktopAppPath(appPath: string): Promise<boolean> {
  const trimmedPath = appPath.trim();
  if (!trimmedPath || !existsSync(trimmedPath)) {
    return false;
  }

  try {
    if (process.platform === "darwin" || trimmedPath.endsWith(".app")) {
      const errorMessage = await shell.openPath(trimmedPath);
      return !errorMessage;
    }
    const child = spawn(trimmedPath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function shareChat(payload: ShareChatPayload): Promise<ShareChatResult> {
  const mode = payload.target;
  const text = String(payload.text || "").trim();

  if (!mode || !text) {
    return { ok: false, error: "invalid_payload" };
  }

  try {
    if (mode === "copy") {
      clipboard.writeText(text);
      return { ok: true, mode, message: "Chat copied to clipboard." };
    }

    if (mode === "whatsapp") {
      clipboard.writeText(text);
      await openWhatsAppShare(text);
      return { ok: true, mode, message: "Opened WhatsApp and copied chat text." };
    }

    if (mode === "desktop-app") {
      clipboard.writeText(text);
      const processName = normalizeProcessName(String(payload.processName || ""));
      const protocol = SHARE_APP_PROTOCOLS[processName] || "";
      const openedByPath = await openDesktopAppPath(String(payload.appPath || ""));

      if (!openedByPath && protocol) {
        try {
          await shell.openExternal(protocol);
        } catch {
          // Opening by protocol is best-effort only.
        }
      }

      const pasteKey = process.platform === "darwin" ? "Cmd+V" : "Ctrl+V";
      return {
        ok: true,
        mode,
        message: openedByPath || protocol
          ? "Copied chat text and opened the selected app."
          : `Copied chat text. Open your app and paste with ${pasteKey}.`,
      };
    }

    return { ok: false, error: "unsupported_target" };
  } catch {
    return { ok: false, error: "share_failed" };
  }
}

async function ensureAuthChromeCss(webContents: Electron.WebContents): Promise<void> {
  const currentUrl = webContents.getURL();
  const state = AUTH_CSS_STATE.get(webContents) ?? {};
  if (state.url === currentUrl && state.key) {
    return;
  }
  AUTH_CSS_STATE.set(webContents, state);

  try {
    if (state.key) {
      await webContents.removeInsertedCSS(state.key);
    }
  } catch {}

  try {
    state.key = await webContents.insertCSS(AUTH_CHROME_CSS, { cssOrigin: "user" });
    state.url = currentUrl;
  } catch {}
}

function injectAuthChrome(webContents: Electron.WebContents): void {
  void ensureAuthChromeCss(webContents);
  webContents.executeJavaScript(AUTH_CHROME_SCRIPT, true).catch(() => {});
  void (async () => {
    const wallpaper = await getAuthWallpaperDataUrl();
    if (!wallpaper) {
      return;
    }
    const value = `url(\"${wallpaper}\")`;
    const script = `document.documentElement.style.setProperty(\"--meera-auth-wallpaper\", ${JSON.stringify(value)});`;
    webContents.executeJavaScript(script, true).catch(() => {});
  })();
}

function setupAuthPopupWindow(popup: BrowserWindow): void {
  popup.setMenuBarVisibility(false);
  popup.once("ready-to-show", () => {
    popup.show();
  });

  (popup.webContents as unknown as { addScriptToEvaluateOnNewDocument?: (code: string) => void })
    .addScriptToEvaluateOnNewDocument?.(AUTH_CHROME_SCRIPT);

  const keepAlive = setInterval(() => {
    if (popup.isDestroyed()) {
      return;
    }
    injectAuthChrome(popup.webContents);
  }, 1500);

  popup.once("closed", () => {
    clearInterval(keepAlive);
  });

  popup.webContents.on("dom-ready", () => {
    injectAuthChrome(popup.webContents);
  });

  popup.webContents.on("did-frame-finish-load", (_event, _isMainFrame) => {
    injectAuthChrome(popup.webContents);
  });

  popup.webContents.on("did-navigate", () => {
    injectAuthChrome(popup.webContents);
  });

  popup.webContents.on("did-navigate-in-page", () => {
    injectAuthChrome(popup.webContents);
  });

  popup.webContents.on("did-finish-load", () => {
    injectAuthChrome(popup.webContents);
  });

  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return { action: "allow" };
    }
    openExternal(url);
    return { action: "deny" };
  });

  popup.webContents.on("will-navigate", (event, url) => {
    if (!isAuthUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
}

ipcMain.on("meera:window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.minimize();
});

ipcMain.on("meera:window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return;
  }
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("meera:window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});

ipcMain.on("meera:app:restart", () => {
  app.relaunch();
  app.quit();
});

ipcMain.handle("meera:file:saveAndOpen", async (_event, payload: {
  filename: string;
  content?: string;
  buffer?: ArrayBuffer | Uint8Array;
  openInFolder?: boolean;
  openFile?: boolean;
}) => {
  try {
    const downloadsDir = app.getPath("downloads");
    const cleanFilename = (payload.filename || "download.txt").replace(/[/\\?%*:|"<>]/g, "_").trim();
    const ext = path.extname(cleanFilename);
    const base = path.basename(cleanFilename, ext);
    
    let targetPath = path.join(downloadsDir, cleanFilename);
    let counter = 1;
    while (existsSync(targetPath)) {
      targetPath = path.join(downloadsDir, `${base} (${counter})${ext}`);
      counter++;
    }

    if (payload.buffer) {
      writeFileSync(targetPath, Buffer.from(payload.buffer as any));
    } else if (typeof payload.content === "string") {
      writeFileSync(targetPath, payload.content, "utf8");
    }

    if (payload.openInFolder !== false) {
      shell.showItemInFolder(targetPath);
    }
    if (payload.openFile) {
      await shell.openPath(targetPath);
    }

    return { ok: true, filePath: targetPath, filename: path.basename(targetPath) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to save file" };
  }
});

let blockedShieldCount = 0;
ipcMain.handle("meera:shield:stats", async () => ({ blockedCount: blockedShieldCount }));

const devToolsWindows = new Map<number, BrowserWindow>();

ipcMain.on("meera:dt:win:min", (_event, winId: number) => {
  const win = BrowserWindow.fromId(winId);
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.on("meera:dt:win:max", (_event, winId: number) => {
  const win = BrowserWindow.fromId(winId);
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.on("meera:dt:win:close", (_event, winId: number) => {
  const win = BrowserWindow.fromId(winId);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.on("meera:dt:win:inspect", (_event, winId: number) => {
  // Find which guest webContentsId this devtools window belongs to
  let guestId: number | null = null;
  for (const [gcId, dtWin] of devToolsWindows.entries()) {
    if (dtWin && !dtWin.isDestroyed() && dtWin.id === winId) {
      guestId = gcId;
      break;
    }
  }
  if (guestId !== null) {
    try {
      const guest = webContents.fromId(guestId);
      if (guest && !guest.isDestroyed()) {
        // Toggle the inspect element picker via DevTools protocol
        try {
          if (!guest.debugger.isAttached()) {
            guest.debugger.attach("1.3");
          }
          guest.debugger.sendCommand("Overlay.setInspectMode", {
            mode: "searchForNode",
            highlightConfig: {
              showInfo: true,
              showStyles: true,
              showRulers: true,
              showAccessibilityInfo: true,
              contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
              paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
              borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
              marginColor: { r: 246, g: 178, b: 107, a: 0.66 },
            },
          });
        } catch (debugErr) {
          // Fallback: just focus the DevTools window, inspect mode may already work
          console.error("Debugger inspect error:", debugErr);
        }
      }
    } catch (err) {
      console.error("Error toggling inspect mode:", err);
    }
  }
});

ipcMain.handle("meera:devtools:toggleCustom", async (_event, payload: { guestWebContentsId: number; title?: string }) => {
  try {
    const guest = webContents.fromId(payload.guestWebContentsId);
    if (!guest) return { ok: false, error: "WebContents not found" };

    const existingWin = devToolsWindows.get(payload.guestWebContentsId);
    if (existingWin && !existingWin.isDestroyed()) {
      if (existingWin.isVisible()) {
        existingWin.close();
        devToolsWindows.delete(payload.guestWebContentsId);
        return { ok: true, state: "closed" };
      } else {
        existingWin.show();
        existingWin.focus();
        return { ok: true, state: "opened" };
      }
    }

    const devToolsWin = new BrowserWindow({
      width: 1080,
      height: 720,
      minWidth: 500,
      minHeight: 360,
      frame: false,
      transparent: false,
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
      hasShadow: true,
      roundedCorners: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    devToolsWindows.set(payload.guestWebContentsId, devToolsWin);

    devToolsWin.on("closed", () => {
      devToolsWindows.delete(payload.guestWebContentsId);
      try { guest.closeDevTools(); } catch {}
    });

    guest.setDevToolsWebContents(devToolsWin.webContents);
    guest.openDevTools({ mode: "detach", activate: true });
    const pageTitle = (payload.title || "Meera").replace(/[`"'\\]/g, "");
    const winId = devToolsWin.id;

    devToolsWin.webContents.on("dom-ready", async () => {
      try {
        await devToolsWin.webContents.insertCSS(`
          :root {
            --meera-dt-bar-height: 44px;
          }
          #meera-devtools-dock {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: var(--meera-dt-bar-height) !important;
            width: 100% !important;
            background: linear-gradient(135deg, rgba(240, 246, 255, 0.95) 0%, rgba(225, 238, 255, 0.88) 100%) !important;
            backdrop-filter: blur(36px) saturate(190%) !important;
            -webkit-backdrop-filter: blur(36px) saturate(190%) !important;
            border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 1) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0 14px !important;
            z-index: 2147483647 !important;
            -webkit-app-region: drag !important;
            user-select: none !important;
            gap: 10px !important;
            box-sizing: border-box !important;
          }
          body > *:not(#meera-devtools-dock) {
            top: var(--meera-dt-bar-height) !important;
          }
          .meera-dt-left {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #0f172a;
            font-size: 13px;
            font-weight: 600;
            flex-shrink: 0;
          }
          .meera-dt-logo-wrap {
            width: 28px;
            height: 28px;
            border-radius: 9px !important;
            background: linear-gradient(135deg, #0ea5e9, #6366f1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            box-shadow: 0 3px 10px rgba(99, 102, 241, 0.35);
          }
          .meera-dt-brand {
            font-weight: 700;
            letter-spacing: -0.01em;
            color: #0f172a;
            font-size: 13px;
          }
          .meera-dt-live-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #047857;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 12px !important;
            letter-spacing: 0.04em;
          }
          .meera-dt-live-dot {
            width: 6px;
            height: 6px;
            border-radius: 50% !important;
            background: #10b981;
            box-shadow: 0 0 8px #10b981;
            animation: meeraPulse 2s infinite;
          }
          @keyframes meeraPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.6; }
          }
          .meera-dt-center {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            max-width: 440px;
            background: rgba(255, 255, 255, 0.65);
            padding: 4px 12px;
            border-radius: 20px !important;
            border: 1px solid rgba(255, 255, 255, 0.85);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02), inset 0 1px 1px rgba(255, 255, 255, 0.9);
            overflow: hidden;
            -webkit-app-region: drag;
          }
          .meera-dt-title {
            color: #334155;
            font-size: 11px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .meera-dt-controls {
            display: flex;
            align-items: center;
            gap: 6px;
            -webkit-app-region: no-drag !important;
            flex-shrink: 0;
          }
          .meera-dt-btn {
            width: 30px;
            height: 30px;
            border-radius: 10px !important;
            border: 1px solid rgba(255, 255, 255, 0.95) !important;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(235, 245, 255, 0.8)) !important;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1);
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .meera-dt-btn:hover {
            background: #ffffff !important;
            color: #0f172a;
            transform: translateY(-1.5px) scale(1.04);
            box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
            border-color: #ffffff !important;
          }
          .meera-dt-btn:active {
            transform: translateY(0) scale(0.96);
          }
          .meera-dt-btn.close:hover {
            background: #ef4444 !important;
            color: #ffffff !important;
            border-color: #ef4444 !important;
            box-shadow: 0 6px 14px rgba(239, 68, 68, 0.4);
          }

          /* ── HIDE CHROMIUM UNDOCKED BANNER OVERLAY ── */
          .warning-banner,
          .undocked-warning,
          .infobar,
          .undocked-status,
          .tabbed-pane-header-contents > .infobar,
          .tabbed-pane-header-contents > [class*="undocked"],
          .tabbed-pane-header > [class*="undocked"],
          .tabbed-pane-header .undocked-status,
          .tabbed-pane-header .warning,
          [aria-label*="undocked"],
          [title*="undocked"],
          .toolbar-item:has(> *[aria-label*="undocked"]),
          .toolbar-item:has(> *[title*="undocked"]) {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            min-width: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
          }

          /* ── DEVTOOLS INNER UI CURVES & SCROLLING ── */
          .tabbed-pane-header {
            padding-top: 4px !important;
            padding-left: 6px !important;
          }
          .tabbed-pane-header-tab {
            border-radius: 10px 10px 0 0 !important;
            margin-right: 3px !important;
            transition: all 0.15s ease !important;
          }
          .tabbed-pane-header-tab.selected {
            background: rgba(255, 255, 255, 0.9) !important;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04) !important;
          }
          input, input[type="text"], .toolbar-input {
            border-radius: 12px !important;
            padding: 4px 10px !important;
          }
          .toolbar-button, .elements-disclosure-triangle {
            border-radius: 7px !important;
          }
          .crumbs .crumb {
            border-radius: 5px !important;
            margin: 2px !important;
          }
          ::-webkit-scrollbar {
            width: 10px !important;
            height: 10px !important;
          }
          ::-webkit-scrollbar-thumb {
            border-radius: 8px !important;
            background: rgba(0, 0, 0, 0.28) !important;
            border: 2px solid #ffffff !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.45) !important;
          }
          ::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.03) !important;
            border-radius: 8px !important;
          }
        `);

        await devToolsWin.webContents.executeJavaScript(`(function() {
          function renderMeeraDock() {
            if (!document.getElementById('meera-devtools-dock') && document.body) {
              const dock = document.createElement('div');
              dock.id = 'meera-devtools-dock';
              dock.innerHTML = \`
                <div class="meera-dt-left">
                  <div class="meera-dt-logo-wrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="4 17 10 11 4 5"></polyline>
                      <line x1="12" y1="19" x2="20" y2="19"></line>
                    </svg>
                  </div>
                  <span class="meera-dt-brand">Meera Studio</span>
                  <div class="meera-dt-live-pill" id="meera-dt-live-toggle" style="cursor: pointer;" title="Toggle Inspect Element Mode (Ctrl+Shift+C)">
                    <span class="meera-dt-live-dot"></span>
                    <span>INSPECTOR</span>
                  </div>
                </div>
                <div class="meera-dt-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  <span class="meera-dt-title">${pageTitle}</span>
                </div>
                <div class="meera-dt-controls">
                  <button id="meera-dt-inspect" class="meera-dt-btn" title="Select an element to inspect (Ctrl+Shift+C)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 3l7 18 3-7 7-3L3 3z"></path>
                    </svg>
                  </button>
                  <button id="meera-dt-min" class="meera-dt-btn" title="Minimize">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  </button>
                  <button id="meera-dt-max" class="meera-dt-btn" title="Maximize">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
                  </button>
                  <button id="meera-dt-close" class="meera-dt-btn close" title="Close (F12)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              \`;
              document.body.prepend(dock);

              const triggerInspect = () => {
                window.meera?.dtInspect?.(${winId});
              };

              document.getElementById('meera-dt-inspect')?.addEventListener('click', triggerInspect);
              document.getElementById('meera-dt-live-toggle')?.addEventListener('click', triggerInspect);

              document.getElementById('meera-dt-min')?.addEventListener('click', () => {
                window.meera?.dtMin?.(${winId});
              });
              document.getElementById('meera-dt-max')?.addEventListener('click', () => {
                window.meera?.dtMax?.(${winId});
              });
              document.getElementById('meera-dt-close')?.addEventListener('click', () => {
                window.meera?.dtClose?.(${winId});
              });
            }
          }

          function purgeUndockedText() {
            try {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
              let node;
              const toHide = [];
              while (node = walker.nextNode()) {
                if (node.nodeValue && node.nodeValue.includes('DevTools is undocked')) {
                  let p = node.parentElement;
                  if (p && p.id !== 'meera-devtools-dock') {
                    toHide.push(p);
                  }
                }
              }
              toHide.forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('width', '0', 'important');
                el.style.setProperty('height', '0', 'important');
                el.remove?.();
              });
            } catch {}
          }

          renderMeeraDock();
          purgeUndockedText();

          const observer = new MutationObserver(() => {
            renderMeeraDock();
            purgeUndockedText();
          });
          if (document.body) {
            observer.observe(document.body, { childList: true });
          }

          window.dispatchEvent(new Event('resize'));
          setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        })()`);
      } catch (err) {
        console.error("Error setting up custom devtools window frame:", err);
      }
    });

    devToolsWin.show();
    devToolsWin.focus();

    return { ok: true, state: "opened" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

const showNativeNotification = async (
  payload: NativeNotificationPayload,
): Promise<{ ok: boolean; error?: string }> => {
  if (!ElectronNotification.isSupported()) {
    return { ok: false, error: "Native notifications are not supported on this system." };
  }
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return { ok: false, error: "Notification title is required." };
  }
  try {
    const notification = new ElectronNotification({
      title,
      body: typeof payload.body === "string" ? payload.body : "",
      icon: payload.icon || AUTH_LOGO_PATH || undefined,
      silent: Boolean(payload.silent),
    });
    notification.show();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Native notification failed.",
    };
  }
};

ipcMain.handle("meera:auth:chrome", () => ({
  css: AUTH_CHROME_CSS,
  script: AUTH_CHROME_SCRIPT,
}));

async function createWindow(): Promise<void> {
  const iconPath = isDev
    ? path.join(__dirname, "..", "public", "logo.png")
    : path.join(__dirname, "..", "dist", "logo.png");
  const win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 960,
    minHeight: 600,
    center: true,
    title: "MeeraAI",
    backgroundColor: "#f8fafc",
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    frame: process.platform !== "darwin" ? false : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: isDev,
      backgroundThrottling: false,
    },
  });
  mainWindow = win;
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Explicitly allow media (microphone/camera) for the main window
    if (permission === "media") {
      if (webContents.id === win.webContents.id) {
        callback(true);
      } else {
        callback(false);
      }
      return;
    }

    // Handle geolocation requests for the main window
    if (permission === "geolocation" && webContents.id === win.webContents.id) {
      locationPermissionRequests.delete(webContents.id);
      callback(true);
      return;
    }

    callback(false);
  });

  win.webContents.setZoomFactor(1);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }
    const key = input.key?.toLowerCase();
    const hasMod = input.control || input.meta;
    const hasShift = input.shift;
    const isZoomShortcut = hasMod && (key === "+" || key === "-" || key === "=" || key === "0");
    const isReloadShortcut = key === "f5" || (hasMod && key === "r");
    const isDevToolsShortcut =
      key === "f12" || (hasMod && hasShift && (key === "i" || key === "j" || key === "c"));
    if (isZoomShortcut || isReloadShortcut || isDevToolsShortcut) {
      event.preventDefault();
    }
  });

  win.once("ready-to-show", () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: AUTH_POPUP_WIDTH,
          height: AUTH_POPUP_HEIGHT,
          minWidth: 460,
          minHeight: 560,
          title: "MeeraAI Sign-in",
          backgroundColor: AUTH_POPUP_BACKGROUND,
          backgroundMaterial: "none",
          vibrancy: undefined,
          autoHideMenuBar: true,
          titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
          trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
          frame: process.platform !== "darwin" ? false : undefined,
          show: false,
          icon: iconPath,
          webPreferences: {
            preload: path.join(__dirname, "preload-auth.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: false,
          },
        },
      };
    }

    if (url.startsWith("blob:")) {
      return { action: "deny" };
    }

    if (!isAppUrl(url)) {
      openExternal(url);
      return { action: "deny" };
    }

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1240,
        height: 780,
        minWidth: 960,
        minHeight: 600,
        center: true,
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: true,
        }
      }
    };
  });

  win.webContents.on("did-create-window", (childWindow, details) => {
    if (isAuthUrl(details.url)) {
      setupAuthPopupWindow(childWindow);
      return;
    }
    if (!isAppUrl(details.url)) {
      childWindow.close();
      openExternal(details.url);
    }
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("blob:") || !isAppUrl(url)) {
      event.preventDefault();
      if (!url.startsWith("blob:")) {
        openExternal(url);
      }
    }
  });

  (win.webContents as any).on("will-frame-navigate", (event: any, url: string, _frameProcessId: number, _frameRoutingId: number) => {
    if (!url.startsWith("blob:") && !isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  win.webContents.on("render-process-gone", (_evt, details) => {
    win.loadURL(`data:text/html,${encodeURIComponent(fallbackHtml(`Renderer crashed: ${details.reason}`))}`);
  });

  win.webContents.on("did-fail-load", (_event, code, description, failedUrl) => {
    if (failedUrl && failedUrl.startsWith("blob:")) {
      console.warn("Ignoring failed blob URL load in subframe/window:", failedUrl);
      return;
    }
    win.loadURL(
      `data:text/html,${encodeURIComponent(
        fallbackHtml(`did-fail-load code=${code} description=${description} url=${failedUrl || "n/a"}`),
      )}`,
    );
  });

  // When developing, wait for the Vite dev server to be ready before loading.
  if (isDev) {
    const devReady = await waitForDevServer(15000);
    if (devReady) {
      await win.loadURL(DEV_SERVER_ORIGIN);
    } else {
      win.loadURL(
        `data:text/html,${encodeURIComponent(
          fallbackHtml(`Dev server not reachable at ${DEV_SERVER_ORIGIN}. Start the dev server and relaunch.`),
        )}`,
      );
    }
  } else {
    const origin = await startProdServer();
    win.loadURL(origin);
  }

  win.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const trayIconPath = isDev
    ? path.join(__dirname, "..", "public", "trayTemplate.png")
    : path.join(__dirname, "..", "dist", "trayTemplate.png");
  let trayIcon = nativeImage.createFromPath(trayIconPath);
  if (trayIcon.isEmpty()) {
    const fallbackPath = isDev
      ? path.join(__dirname, "..", "public", "logo.png")
      : path.join(__dirname, "..", "dist", "logo.png");
    trayIcon = nativeImage.createFromPath(fallbackPath);
    if (process.platform === 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  }
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip(PRODUCT_NAME);
  tray.setContextMenu(contextMenu);

  require("electron").nativeTheme.themeSource = "light";

  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    try {
      const micAccess = await systemPreferences.askForMediaAccess("microphone");
      const camAccess = await systemPreferences.askForMediaAccess("camera");
      console.log(`macOS media access - mic: ${micAccess}, camera: ${camAccess}`);
    } catch (e) {
      console.warn("Failed to request macOS media access:", e);
    }
  }

  // Run the TypeScript compile check. Never require the Electron entry through
  // plain Node: Electron APIs are intentionally unavailable in that process.
  try {
    const isRoot = process.cwd().endsWith("desktop_frontend") ? false : true;
    const tsconfigPath = isRoot ? path.resolve(process.cwd(), "desktop_frontend", "electron", "tsconfig.json") : path.resolve(process.cwd(), "electron", "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
      await execFileAsync(npxCommand, ["tsc", "-p", tsconfigPath], { maxBuffer: 10 * 1024 * 1024 });
      console.log("TypeScript check passed for", tsconfigPath);
    }
  } catch (checkErr) {
    console.warn("TypeScript check skipped:", checkErr instanceof Error ? checkErr.message : checkErr);
  }

  // Ensure cache directories exist to prevent Chromium cache errors
  try {
    const userDataPath = app.getPath("userData");
    const cacheDir = path.join(userDataPath, "cache");
    mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn("Failed to ensure cache directory:", err);
  }

  // ── Native Ad & Tracker Shield ──
  const AD_TRACKER_DOMAINS = [
    "doubleclick.net",
    "googlesyndication.com",
    "adservice.google.com",
    "googleadservices.com",
    "pagead2.googlesyndication.com",
    "adnxs.com",
    "criteo.com",
    "taboola.com",
    "outbrain.com",
    "scorecardresearch.com",
    "analytics.tiktok.com",
    "facebook.com/tr/",
    "hotjar.com",
    "quantserve.com",
    "advertising.amazon.com",
    "adroll.com",
    "pubmatic.com",
    "rubiconproject.com",
    "moatads.com",
    "amazon-adsystem.com",
    "adform.net",
    "smartadserver.com",
    "casalemedia.com",
    "openx.net",
    "adcolony.com",
    "applovin.com",
    "chartbeat.com",
    "clarity.ms",
  ];

  let blockedShieldCount = 0;
  try {
    const browserSession = session.fromPartition("persist:meera-browser");
    const setupShieldFiltering = (sess: typeof session.defaultSession) => {
      sess.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
        const url = (details.url || "").toLowerCase();
        const isAdOrTracker = AD_TRACKER_DOMAINS.some((domain) => url.includes(domain));
        if (isAdOrTracker) {
          blockedShieldCount++;
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      });
    };
    setupShieldFiltering(browserSession);
    setupShieldFiltering(session.defaultSession);
  } catch (err) {
    console.warn("Shield setup error:", err);
  }

  void startBackendIfNeeded();
  ipcMain.handle("meera:backend:start", async () => startBackendIfNeeded());
  ipcMain.handle("meera:backend:stop", async () => stopBackendIfRunning());
  ipcMain.handle("meera:models:scan", async () => scanModelsOnDisk());
  ipcMain.handle("meera:getDesktopApps", async () => getDesktopAppsPayload());
  ipcMain.handle("meera:share:chat", async (_event, payload: ShareChatPayload) => shareChat(payload));
  let browserShellWindow: BrowserWindow | null = null;
  ipcMain.handle("meera:openBrowserTab", async (_event, targetUrl?: string) => {
    if (browserShellWindow && !browserShellWindow.isDestroyed()) {
      if (browserShellWindow.isMinimized()) browserShellWindow.restore();
      browserShellWindow.show();
      browserShellWindow.focus();
      return { opened: true, isNew: false };
    }
    
    const iconPath = isDev
        ? path.join(__dirname, "..", "public", "logo.png")
        : path.join(__dirname, "..", "dist", "logo.png");
        
    browserShellWindow = new BrowserWindow({
        width: 1240,
        height: 780,
        minWidth: 960,
        minHeight: 600,
        center: true,
        title: "Meera Browser",
        backgroundColor: "#0b1b31",
        icon: iconPath,
        autoHideMenuBar: true,
        titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
        trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
        frame: process.platform !== "darwin" ? false : undefined,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            backgroundThrottling: false,
        }
    });

    const appUrl = isDev 
        ? `${DEV_SERVER_ORIGIN}?shell=browser`
        : `${pathToFileURL(path.join(__dirname, "../dist/index.html")).href}?shell=browser`;
    
    const fullUrl = targetUrl ? `${appUrl}&start=${encodeURIComponent(targetUrl)}` : appUrl;
    
    browserShellWindow.loadURL(fullUrl);
    
    browserShellWindow.on("closed", () => {
        browserShellWindow = null;
    });

    return { opened: true, isNew: true };
  });

  ipcMain.handle("meera:openExternalUrl", async (_event, targetUrl: string) => openExternalUrl(targetUrl));
  ipcMain.handle("meera:location:request", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow || !isAppUrl(event.sender.getURL())) {
      return { ok: false, error: "Location requests are only available inside Meera." };
    }
    locationPermissionRequests.add(event.sender.id);
    return { ok: true };
  });
  ipcMain.handle("meera:location:reverse", async (_event, payload) => {
    const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "Valid latitude and longitude are required." };
    }

    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("zoom", "10");
      url.searchParams.set("addressdetails", "1");

      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": `${PRODUCT_NAME}/${app.getVersion()} (${process.platform})`,
        },
      });
      if (!response.ok) {
        return { ok: false, error: `Reverse geocoding failed (${response.status})` };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const address = data.address && typeof data.address === "object" && !Array.isArray(data.address)
        ? (data.address as Record<string, unknown>)
        : {};
      const label = formatReverseGeocodeLabel(data);

      return {
        ok: true,
        label,
        display_name: typeof data.display_name === "string" ? data.display_name : label,
        city:
          typeof address.city === "string" ? address.city :
          typeof address.town === "string" ? address.town :
          typeof address.village === "string" ? address.village :
          typeof address.hamlet === "string" ? address.hamlet :
          typeof address.municipality === "string" ? address.municipality :
          typeof address.county === "string" ? address.county :
          typeof address.state === "string" ? address.state :
          label,
        country: typeof address.country === "string" ? address.country : undefined,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unable to reverse geocode location." };
    }
  });
  ipcMain.handle("meera:installer:read", async () => readInstallerConfig());
  ipcMain.handle("meera:installer:consume", async () => consumeInstallerConfig());
  ipcMain.handle("meera:firebase:read", async () => readFirebaseConfig());
  ipcMain.handle("meera:firebase:save", async (_event, config: FirebaseConfig) => saveFirebaseConfig(config));
  ipcMain.handle("meera:firebase:reset", async () => resetFirebaseConfig());
  ipcMain.handle("meera:notify", async (_event, payload: NativeNotificationPayload) => showNativeNotification(payload));
  // splashWindow = createSplashWindow(); // Removed per user request
  void createWindow();

  if (process.platform === "darwin") {
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' }
        ]
      },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template as any));
  }

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  event.preventDefault();
  Promise.resolve(stopBackendIfRunning()).finally(() => {
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
