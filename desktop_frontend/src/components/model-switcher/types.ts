export type SwitcherModelDownloadState = {
  model_id: string;
  repo_id: string;
  status: "queued" | "downloading" | "paused" | "verifying" | "completed" | "cancelled" | "error";
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  stage: string;
  error?: string | null;
  updated_at?: number;
};

export type SwitcherModelStatus = {
  id: string;
  label: string;
  params: string;
  repo_id?: string | null;
  folder?: string;
  path?: string;
  quant_bits?: number | null;
  model_type?: string;
  purpose?: string;
  chat_capable?: boolean;
  precision?: string;
  blurb?: string;
  requires_auth?: boolean;
  present: boolean;
  repo_mismatch?: boolean;
  size_bytes?: number;
  local_bytes?: number;
  download?: SwitcherModelDownloadState | null;
};

export type SwitcherModelLoadStatus = {
  model_id?: string;
  status?: "idle" | "loading" | "ready" | "error";
  stage?: string;
  progress?: number | null;
  quant_bits?: number | null;
  precision?: string;
  logs?: string[];
  error?: string | null;
  solution?: string | null;
  active_model?: string | null;
};

export interface ModelFloatingSwitcherProps {
  selectedModel: string;
  selectedCloudTierModel?: string;
  resolvedModels: SwitcherModelStatus[];
  modelLoadStatus: SwitcherModelLoadStatus | null;
  inferenceMode: "local" | "cloud";
  engineRunning?: boolean;
  cloudAvailable?: boolean;
  onSelectLocalModel: (id: string) => void;
  onSelectCloudModel?: (id: string) => void;
  onToggleInferenceMode?: (mode: "local" | "cloud") => void;
  onUnloadModel?: (id?: string) => Promise<void> | void;
  onReloadModel?: (id: string) => void;
  onOpenModelStudio?: () => void;
  onOpenDownloadPrompt?: (id: string) => void;
}
