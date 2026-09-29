import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meera", {
  platform: process.platform,
  getDesktopApps: () => ipcRenderer.invoke("meera:getDesktopApps"),
  shareChat: (payload: {
    target: "copy" | "whatsapp" | "desktop-app";
    text: string;
    title?: string;
    processName?: string;
    appPath?: string;
  }) => ipcRenderer.invoke("meera:share:chat", payload),
  openExternalUrl: (targetUrl: string) => ipcRenderer.invoke("meera:openExternalUrl", targetUrl),
  openBrowserTab: (url?: string) => ipcRenderer.invoke("meera:openBrowserTab", url),
  requestLocationPermission: () => ipcRenderer.invoke("meera:location:request"),
  reverseGeocodeLocation: (payload: { latitude: number; longitude: number }) => ipcRenderer.invoke("meera:location:reverse", payload),
  startBackend: () => ipcRenderer.invoke("meera:backend:start"),
  stopBackend: () => ipcRenderer.invoke("meera:backend:stop"),
  onBackendStatus: (callback: (payload: { running: boolean }) => void) =>
    ipcRenderer.on("meera:backend:status", (_event, payload) => callback(payload)),
  offBackendStatus: (callback: (payload: { running: boolean }) => void) =>
    ipcRenderer.off("meera:backend:status", (_event, payload) => callback(payload)),
  scanModels: async () => {
    // Primary source: native scan via main process
    const local = (await ipcRenderer.invoke("meera:models:scan")) as any;
    // Secondary: enrich with the vNext model inventory.
    try {
      const host = process.env.MEERA_BACKEND_HOST || "127.0.0.1";
      const port = process.env.MEERA_BACKEND_PORT || "8000";
      const url = `http://${host}:${port}/api/v1/models/list`;
      // fetch is available in preload context
      const resp = await fetch(url, { cache: "no-store" });
      if (resp.ok) {
        const body = await resp.json();
        if (body && Array.isArray(body.models)) {
          const byId = new Map<string, any>();
          for (const m of body.models) {
            if (m && m.id) byId.set(m.id, m);
          }
          if (local && Array.isArray(local.models)) {
            local.models = local.models.map((entry: any) => {
              const ext = byId.get(entry.id) || {};
              const merged = { ...entry, has_gguf: Boolean(ext.has_gguf), backend_info: ext, local_bytes: entry.local_bytes ?? ext.local_bytes ?? entry.size_bytes };
              return merged;
            });
          }
        }
      }
    } catch (err) {
      // ignore enrichment failures; return native scan result
      // console.error("Model list enrichment failed:", err);
    }
    return local;
  },
  notify: (payload: { title: string; body?: string; icon?: string; silent?: boolean }) =>
    ipcRenderer.invoke("meera:notify", payload),
  getInstallerConfig: () => ipcRenderer.invoke("meera:installer:read"),
  consumeInstallerConfig: () => ipcRenderer.invoke("meera:installer:consume"),
  getFirebaseConfig: () => ipcRenderer.invoke("meera:firebase:read"),
  saveFirebaseConfig: (config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
    storageBucket?: string;
    measurementId?: string;
  }) => ipcRenderer.invoke("meera:firebase:save", config),
  resetFirebaseConfig: () => ipcRenderer.invoke("meera:firebase:reset"),
  restartApp: () => ipcRenderer.send("meera:app:restart"),
  getShieldStats: () => ipcRenderer.invoke("meera:shield:stats"),
  saveAndOpenFile: (payload: {
    filename: string;
    content?: string;
    buffer?: ArrayBuffer | Uint8Array;
    openInFolder?: boolean;
    openFile?: boolean;
  }) => ipcRenderer.invoke("meera:file:saveAndOpen", payload),
  attachDevTools: (payload: { guestWebContentsId: number; devtoolsWebContentsId: number }) =>
    ipcRenderer.invoke("meera:devtools:attach", payload),
  closeDevTools: (guestWebContentsId: number) =>
    ipcRenderer.invoke("meera:devtools:close", guestWebContentsId),
  toggleDevToolsCustom: (payload: { guestWebContentsId: number; title?: string }) =>
    ipcRenderer.invoke("meera:devtools:toggleCustom", payload),
  dtMin: (winId: number) => ipcRenderer.send("meera:dt:win:min", winId),
  dtMax: (winId: number) => ipcRenderer.send("meera:dt:win:max", winId),
  dtClose: (winId: number) => ipcRenderer.send("meera:dt:win:close", winId),
  dtInspect: (winId: number) => ipcRenderer.send("meera:dt:win:inspect", winId),
  windowControls: {
    minimize: () => ipcRenderer.send("meera:window:minimize"),
    maximize: () => ipcRenderer.send("meera:window:maximize"),
    close: () => ipcRenderer.send("meera:window:close"),
  },
});
