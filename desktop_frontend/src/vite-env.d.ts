/// <reference types="vite/client" />

declare global {
  type DesktopAppBridgeItem = {
    key: string;
    name: string;
    processName: string;
    windowTitle: string;
    path: string;
    lastSeenAt: number;
  };

  type DesktopAppBridgeEvent = {
    key: string;
    name: string;
    processName: string;
    state: "opened" | "closed";
    timestamp: number;
  };

  type DesktopAppsBridgePayload = {
    apps: DesktopAppBridgeItem[];
    events: DesktopAppBridgeEvent[];
    refreshedAt: number;
  };

  interface Window {
    meera?: {
      platform: string;
      getDesktopApps?: () => Promise<DesktopAppsBridgePayload>;
      shareChat?: (payload: {
        target: "copy" | "whatsapp" | "desktop-app";
        text: string;
        title?: string;
        processName?: string;
        appPath?: string;
      }) => Promise<{ ok: boolean; mode?: "copy" | "whatsapp" | "desktop-app"; message?: string; error?: string }>;
      openExternalUrl?: (targetUrl: string) => Promise<{ ok: boolean; error?: string }>;
      requestLocationPermission?: () => Promise<{ ok: boolean; error?: string }>;
      reverseGeocodeLocation?: (payload: { latitude: number; longitude: number }) => Promise<{
        ok: boolean;
        label?: string;
        city?: string;
        country?: string;
        display_name?: string;
        error?: string;
      }>;
      startBackend?: () => Promise<{ ok: boolean; status?: string; error?: string }>;
      stopBackend?: () => Promise<{ ok: boolean; status?: string; error?: string }>;
      onBackendStatus?: (callback: (payload: { running: boolean }) => void) => void;
      offBackendStatus?: (callback: (payload: { running: boolean }) => void) => void;
      scanModels?: () => Promise<{
        ok: boolean;
        root?: string;
        models?: Array<{
          id: string;
          present: boolean;
          size_bytes: number;
          local_bytes?: number;
          path: string;
          params?: string;
          precision?: string;
          repo_id?: string | null;
          label?: string;
          folder?: string;
          quant_bits?: number | null;
        }>;
      }>;
      notify?: (payload: {
        title: string;
        body?: string;
        icon?: string;
        silent?: boolean;
      }) => Promise<{ ok: boolean; error?: string }>;
      getInstallerConfig?: () => Promise<{ ok: boolean; selectedModel?: string; autoDownload?: boolean; error?: string }>;
      consumeInstallerConfig?: () => Promise<{ ok: boolean }>;
      getFirebaseConfig?: () => Promise<{
        ok: boolean;
        config?: {
          apiKey: string;
          authDomain: string;
          projectId: string;
          appId: string;
          messagingSenderId: string;
          storageBucket?: string;
          measurementId?: string;
        };
        error?: string;
      }>;
      saveFirebaseConfig?: (config: {
        apiKey: string;
        authDomain: string;
        projectId: string;
        appId: string;
        messagingSenderId: string;
        storageBucket?: string;
        measurementId?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      resetFirebaseConfig?: () => Promise<{ ok: boolean; error?: string }>;
      restartApp?: () => void;
      getShieldStats?: () => Promise<{ blockedCount: number }>;
      saveAndOpenFile?: (payload: {
        filename: string;
        content?: string;
        buffer?: ArrayBuffer | Uint8Array;
        openInFolder?: boolean;
        openFile?: boolean;
      }) => Promise<{ ok: boolean; filePath?: string; filename?: string; error?: string }>;
      windowControls?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
    };
  }
}
export {};
