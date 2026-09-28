export type RuntimeSettings = {
  context_length: number;
  gpu_layers_mode: "auto" | "max" | "cpu" | "custom";
  gpu_layers: number;
  cpu_thread_pool_size: number;
  cpu_batch_thread_pool_size: number;
  evaluation_batch_size: number;
  physical_batch_size: number;
  max_concurrent_predictions: number;
  unified_kv_cache: boolean;
  rope_frequency_base: number | null;
  rope_frequency_scale: number | null;
  offload_kv_cache: boolean;
  keep_model_in_memory: boolean;
  try_mmap: boolean;
  use_mlock: boolean;
  seed: number | null;
  flash_attention: boolean;
  k_cache_quantization_type: "f16" | "q8_0" | "q4_0";
  v_cache_quantization_type: "f16" | "q8_0" | "q4_0";
  selected_gguf: string;
};

export type LibrarySearchResult = {
  id: string;
  repo_id: string;
  label: string;
  params: string;
  blurb: string;
  downloads: number;
  likes: number;
  author: string;
  logo_url?: string;
  repo_url?: string;
  updated_at?: string;
  gguf_count: number;
  local_model_id?: string | null;
  installed?: boolean;
};

export type GgufFileOption = {
  filename: string;
  size: number;
  quant_bits: number;
  precision_label: string;
};

export type BenchmarkRow = {
  label: string;
  value: number;
  display: string;
};

export type LibraryDetails = {
  id: string;
  repo_id: string;
  label: string;
  author: string;
  logo_url?: string;
  repo_url?: string;
  downloads: number;
  likes: number;
  pipeline?: string;
  library?: string;
  license?: string;
  tags: string[];
  private?: boolean;
  gated?: boolean;
  readme: string;
  benchmarks: BenchmarkRow[];
  gguf_files: GgufFileOption[];
  local_model_id?: string | null;
  installed?: boolean;
  runtime_recommendation: RuntimeSettings;
  recommended_gguf?: GgufFileOption | null;
  hardware_profile?: HardwareProfile;
  parameter_stages?: RuntimeStagePayload;
  saved_runtime_settings: RuntimeSettings;
};

export type HardwareProfile = {
  cpu?: { logical_cores?: number; physical_cores?: number; };
  memory?: { total_bytes?: number; available_bytes?: number; total_gib?: number; available_gib?: number; };
  gpu?: { available?: boolean; name?: string; backend?: string; total_bytes?: number; free_bytes?: number; total_gib?: number; free_gib?: number; };
  performance_class?: "cpu-only" | "low-vram" | "balanced" | "performance" | "workstation" | string;
  headline?: string;
};

export type RuntimeStagePayload = {
  normal?: { settings: RuntimeSettings; estimated_vram_bytes?: number; };
  advanced?: { settings: RuntimeSettings; estimated_vram_bytes?: number; };
  expert?: { settings: RuntimeSettings; estimated_vram_bytes?: number; };
  formula?: string;
};

const API_BASE = ((import.meta.env && import.meta.env.VITE_MEERA_API_BASE_URL) || "http://127.0.0.1:8000/api/v1").replace(/\/api(?:\/v1)?\/?$/, "");
const API_LEGACY = `${API_BASE}/api`;

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.detail || data?.message || data?.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export async function searchModelLibrary(query: string, limit = 20): Promise<LibrarySearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("limit", String(limit));
  const response = await fetch(`${API_LEGACY}/models/library/search?${params.toString()}`);
  const data = await readJson<{ results?: LibrarySearchResult[] }>(response);
  return data.results ?? [];
}

export async function getModelLibraryDetails(repoId: string): Promise<LibraryDetails> {
  const params = new URLSearchParams();
  params.set("repo_id", repoId);
  const response = await fetch(`${API_LEGACY}/models/library/details?${params.toString()}`);
  const data = await readJson<{ model?: LibraryDetails } & LibraryDetails>(response);
  return (data.model ?? data) as LibraryDetails;
}

export async function getRuntimeSettings(modelId: string): Promise<{ runtime_settings: RuntimeSettings; recommended_settings: RuntimeSettings; gguf_files: GgufFileOption[]; recommended_gguf?: GgufFileOption | null; hardware_profile?: HardwareProfile; parameter_stages?: RuntimeStagePayload; }> {
  const params = new URLSearchParams();
  params.set("model_id", modelId);
  const response = await fetch(`${API_LEGACY}/models/runtime-settings?${params.toString()}`);
  return readJson(response);
}

export async function saveRuntimeSettings(modelId: string, runtimeSettings: RuntimeSettings): Promise<RuntimeSettings> {
  const response = await fetch(`${API_LEGACY}/models/runtime-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId, runtime_settings: runtimeSettings }),
  });
  const data = await readJson<{ runtime_settings: RuntimeSettings }>(response);
  return data.runtime_settings;
}

export async function downloadLibraryModel(
  repoId: string,
  label: string,
  filename?: string,
  signal?: AbortSignal,
): Promise<{ ok?: boolean; model_id?: string; status?: string; message?: string }> {
  const response = await fetch(`${API_LEGACY}/models/hf/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_id: repoId, label, ...(filename ? { filename } : {}) }),
    signal,
  });
  return readJson(response);
}

export type DownloadStatus = {
  model_id: string;
  status: string;
  progress?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  speed?: number;
  error?: string;
};

export async function getModelDownloadStatus(): Promise<Record<string, DownloadStatus>> {
  const response = await fetch(`${API_LEGACY}/models/status`);
  const data = await readJson<{ active_downloads?: Record<string, DownloadStatus> }>(response);
  return data.active_downloads ?? {};
}

export type HfTokenResult = { ok?: boolean; hf_token_set?: boolean; token_count?: number; message?: string; };
export type ProviderConfig = { provider: string; api_key: string; base_url?: string; model?: string; };
export type ProviderStatus = {
  id: string; label: string; description: string; configured: boolean; connected: boolean; api_key_set: boolean;
  enabled?: boolean; token_count?: number; model_count?: number; base_url?: string; model?: string; models?: string[];
  format?: string; api_key_label?: string; api_key_placeholder?: string; base_url_required?: boolean; error?: string | null;
  base_url_label?: string; model_label?: string; model_required?: boolean; help_url?: string;
};
export type ImageSearchResult = { id: string; title: string; imageUrl: string; thumbnailUrl: string; sourceUrl: string; license: string; };

export async function saveHfToken(token: string): Promise<HfTokenResult> {
  const response = await fetch(`${API_LEGACY}/models/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return readJson(response);
}

export async function clearHfToken(): Promise<HfTokenResult> {
  const response = await fetch(`${API_LEGACY}/models/token/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  return readJson(response);
}

export async function unloadLocalModel(modelId?: string): Promise<{ ok?: boolean; unloaded?: boolean; message?: string; error?: string }> {
  const response = await fetch(`${API_LEGACY}/models/unload/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(modelId ? { model_id: modelId } : {}),
  });
  return readJson(response);
}

export async function deleteLocalModel(modelId: string): Promise<{ ok?: boolean; status?: string; model_id?: string; message?: string; error?: string }> {
  const response = await fetch(`${API_LEGACY}/models/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId }),
  });
  return readJson(response);
}

export async function listProviders(): Promise<{ providers: ProviderStatus[] }> {
  const response = await fetch(`${API_LEGACY}/providers`);
  const raw = await response.json();
  if (!response.ok) {
    throw new Error(raw?.detail || raw?.message || raw?.error || `Request failed (${response.status})`);
  }
  // Handle both formats: new {providers: [...]} and old {openai: {...}, gemini: {...}}
  if (Array.isArray(raw?.providers)) {
    return { providers: raw.providers };
  }
  // Old dict format: convert to array
  const providers: ProviderStatus[] = Object.entries(raw)
    .filter(([key]) => key !== "ok" && key !== "error" && key !== "message" && key !== "detail")
    .map(([id, info]: [string, any]) => ({
      id,
      label: info.name || info.label || id,
      description: info.description || `${info.name || id} (${info.format || "api"})`,
      configured: info.configured ?? info.connected ?? false,
      connected: info.connected ?? false,
      api_key_set: info.api_key_set ?? false,
      enabled: info.enabled ?? info.connected ?? false,
      token_count: info.token_count ?? info.model_count ?? 0,
      model_count: info.model_count ?? 0,
      base_url: info.base_url || "",
      model: info.model || null,
      models: info.models || [],
      error: info.error || null,
      format: info.format,
      api_key_label: info.api_key_label,
      api_key_placeholder: info.api_key_placeholder,
      base_url_required: info.base_url_required,
      base_url_label: info.base_url_label,
      model_label: info.model_label,
      model_required: info.model_required,
      help_url: info.help_url,
    }));
  return { providers };
}

export async function getProviderModels(providerId: string): Promise<{ models: string[]; error?: string }> {
  const response = await fetch(`${API_LEGACY}/providers/${providerId}/models`);
  return readJson(response);
}

export async function connectProvider(config: ProviderConfig): Promise<{ ok: boolean; provider: string; configured: boolean; api_key_set: boolean; config: Partial<ProviderConfig>; saved: Record<string, ProviderConfig>; }> {
  const response = await fetch(`${API_LEGACY}/providers/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return readJson(response);
}

export async function disconnectProvider(provider: string): Promise<{ ok: boolean; provider: string; configured: boolean; disconnected: boolean }> {
  const response = await fetch(`${API_LEGACY}/providers/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  return readJson(response);
}

export type InferenceModeStatus = { ok?: boolean; mode: "local" | "cloud"; cloud_available: boolean; token_count: number; catalogue?: Record<string, unknown>; cloud_model_map?: Record<string, string>; };

export async function searchImages(query: string, limit = 24): Promise<{ ok: boolean; query: string; results: ImageSearchResult[] }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`${API_LEGACY}/images/search?${params.toString()}`);
  return readJson(response);
}

export async function getInferenceMode(): Promise<InferenceModeStatus> {
  const response = await fetch(`${API_LEGACY}/inference/mode`);
  return readJson(response);
}

export async function setInferenceMode(mode: "local" | "cloud"): Promise<{ ok: boolean; mode: string; error?: string }> {
  const response = await fetch(`${API_LEGACY}/inference/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  return readJson(response);
}
