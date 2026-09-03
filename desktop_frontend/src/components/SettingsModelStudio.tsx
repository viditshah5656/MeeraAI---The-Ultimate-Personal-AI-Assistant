import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./premium_mdx.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  clearHfToken,
  connectProvider,
  downloadLibraryModel,
  getModelLibraryDetails,
  getRuntimeSettings,
  listProviders,
  saveHfToken,
  saveRuntimeSettings,
  searchModelLibrary,
  disconnectProvider,
  unloadLocalModel,
  deleteLocalModel,
  type GgufFileOption,
  type HardwareProfile,
  type LibraryDetails,
  type LibrarySearchResult,
  type ProviderStatus,
  type RuntimeSettings,
  type RuntimeStagePayload,
} from "../services/modelLibrary";

type ModelRecord = {
  id: string;
  label: string;
  params: string;
  repo_id?: string | null;
  logo_url?: string | null;
  repo_url?: string | null;
  folder: string;
  path: string;
  quant_bits?: number | null;
  model_type?: string;
  purpose?: string;
  chat_capable?: boolean;
  capabilities?: string[];
  precision?: string;
  blurb?: string;
  requires_auth?: boolean;
  has_gguf?: boolean;
  present: boolean;
  loaded?: boolean;
  local_bytes?: number;
  size_bytes: number;
  download?: {
    status: string;
    progress?: number;
  } | null;
};

type Props = {
  models: ModelRecord[];
  selectedModelId: string;
  localModelsRoot: string;
  hfTokenSet: boolean;
  engineRunning: boolean;
  backendStarting: boolean;
  canStartBackend: boolean;
  onSelectModel: (modelId: string) => void;
  onStartBackend: () => Promise<{ ok: boolean; error?: string }>;
  onLoadModel: (modelId: string, runtimeSettings?: RuntimeSettings, ggufFilename?: string) => Promise<void>;
  onUnloadModel?: (modelId?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRequestConfirmation?: (dialog: any) => Promise<boolean>;
};

type ControlTier = "normal" | "advanced" | "expert";

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  context_length: 8192,
  gpu_layers_mode: "auto",
  gpu_layers: -1,
  cpu_thread_pool_size: 0,
  cpu_batch_thread_pool_size: 0,
  evaluation_batch_size: 2048,
  physical_batch_size: 512,
  max_concurrent_predictions: 1,
  unified_kv_cache: true,
  rope_frequency_base: null,
  rope_frequency_scale: null,
  offload_kv_cache: true,
  keep_model_in_memory: true,
  try_mmap: true,
  use_mlock: false,
  seed: null,
  flash_attention: true,
  k_cache_quantization_type: "q8_0",
  v_cache_quantization_type: "q8_0",
  selected_gguf: "",
};

const CONTROL_TIERS: Array<{ id: ControlTier; label: string; caption: string }> = [
  { id: "normal", label: "Normal", caption: "Best automatic GGUF profile for this device." },
  { id: "advanced", label: "Advanced", caption: "Tune throughput, CPU use, and cache precision." },
  { id: "expert", label: "Expert", caption: "Expose low-level llama.cpp controls." },
];

const BOOLEAN_FLAGS: Array<{ key: keyof RuntimeSettings; label: string; hint: string; tier: ControlTier }> = [
  {
    key: "flash_attention",
    label: "Flash Attention",
    hint: "Uses optimized attention kernels. Faster on modern NVIDIA GPUs, disabled automatically for CPU-only profiles.",
    tier: "advanced",
  },
  {
    key: "offload_kv_cache",
    label: "Offload KV cache",
    hint: "Keeps prompt memory near the GPU when layers are offloaded. Improves speed if VRAM has room.",
    tier: "advanced",
  },
  {
    key: "unified_kv_cache",
    label: "Continuous batching",
    hint: "Lets prompt processing and generation overlap. Useful for long chats and repeated prompts.",
    tier: "advanced",
  },
  {
    key: "try_mmap",
    label: "Memory map",
    hint: "Maps the GGUF file from disk so model load is faster and RAM pressure is lower.",
    tier: "expert",
  },
  {
    key: "keep_model_in_memory",
    label: "Keep loaded",
    hint: "Keeps weights resident after loading so the next reply starts faster.",
    tier: "expert",
  },
  {
    key: "use_mlock",
    label: "Memory lock",
    hint: "Asks the OS not to swap model pages. Only use when system RAM is comfortably available.",
    tier: "expert",
  },
];

const formatBytes = (value: number | null | undefined): string => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = amount;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatCompactNumber = (value: number | null | undefined): string => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(Math.round(amount));
};

const numberInputValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

const updateNumber = (raw: string, fallback = 0) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const renderableReadme = (value: string) =>
  String(value || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|section|article|li|ul|ol|h[1-6]|table|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, "[$2]($1)")
    .replace(/<\s*img[^>]*alt=["']([^"']*)["'][^>]*>/gi, "$1")
    .replace(/<\s*img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const authorFromRepo = (repoId?: string | null) => {
  const repo = String(repoId || "").trim();
  return repo.includes("/") ? repo.split("/")[0] : "";
};

const avatarForAuthor = (author: string) =>
  author ? `https://huggingface.co/api/avatars/${encodeURIComponent(author)}` : "";

const INFRA_MODEL_NAMES = new Set(["blobs", "blob", "manifests", "manifest", "refs", "snapshots", ".cache", "cache", "tmp", "temp"]);

const isInfrastructureModelEntry = (model: ModelRecord) => {
  const leaf = String(model.folder || model.path || "").split(/[\\/]/).filter(Boolean).pop() || "";
  return [model.id, model.label, model.folder, leaf].some((value) => INFRA_MODEL_NAMES.has(String(value || "").trim().toLowerCase()));
};

const familyTone = (value: string) => {
  const lowered = value.toLowerCase();
  if (lowered.includes("qwen")) return { short: "Q", tone: "qwen", label: "Qwen", hfOrg: "Qwen" };
  if (lowered.includes("deepseek")) return { short: "D", tone: "deepseek", label: "DeepSeek", hfOrg: "deepseek-ai" };
  if (lowered.includes("gemma")) return { short: "G", tone: "gemma", label: "Gemma", hfOrg: "google" };
  if (lowered.includes("llama")) return { short: "L", tone: "llama", label: "Llama", hfOrg: "meta-llama" };
  if (lowered.includes("mistral") || lowered.includes("mixtral")) return { short: "M", tone: "mistral", label: "Mistral", hfOrg: "mistralai" };
  if (lowered.includes("phi")) return { short: "P", tone: "phi", label: "Phi", hfOrg: "microsoft" };
  if (lowered.includes("yi-") || lowered.includes("/yi") || lowered.includes("01-ai")) return { short: "Y", tone: "yi", label: "Yi", hfOrg: "01-ai" };
  if (lowered.includes("granite") || lowered.includes("ibm")) return { short: "I", tone: "granite", label: "Granite", hfOrg: "ibm-granite" };
  if (lowered.includes("falcon")) return { short: "F", tone: "falcon", label: "Falcon", hfOrg: "tiiuae" };
  if (lowered.includes("starcoder") || lowered.includes("star-coder")) return { short: "S", tone: "starcoder", label: "StarCoder", hfOrg: "bigcode" };
  return { short: "GG", tone: "steel", label: "GGUF", hfOrg: "" };
};

const tierRank = (tier: ControlTier) => (tier === "normal" ? 0 : tier === "advanced" ? 1 : 2);

const runtimeFromStage = (stages: RuntimeStagePayload | null, tier: ControlTier): RuntimeSettings | null => {
  const stage = stages?.[tier];
  return stage?.settings ?? null;
};

function DeviceMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="model-device-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function ModelIdentity({ label, repoId, logoUrl }: { label: string; repoId?: string | null; logoUrl?: string }) {
  const [imageIndex, setImageIndex] = useState(0);
  const author = authorFromRepo(repoId);
  const family = familyTone(`${label} ${repoId || ""}`);
  const sources = Array.from(
    new Set([family.hfOrg, author].filter(Boolean).map(avatarForAuthor).concat(logoUrl || "").filter(Boolean)),
  );
  const source = sources[imageIndex] || "";
  useEffect(() => setImageIndex(0), [label, repoId, logoUrl]);
  return (
    <div className={`model-identity ${family.tone}`}>
      {source ? (
        <>
          <img
            src={source}
            alt={`${family.label || author || "model"} logo`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageIndex((current) => current + 1)}
          />
          <span className="model-identity-badge">{family.short}</span>
        </>
      ) : (
        <span className="model-identity-fallback">{family.short}</span>
      )}
    </div>
  );
}

function RuntimeField({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 10, background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 800 }}>{label}</strong>
        <small style={{ fontSize: 12, color: "#64748b", fontWeight: 500, lineHeight: 1.4 }}>{hint}</small>
      </div>
      <div style={{ marginTop: 2 }}>
        {children}
      </div>
    </label>
  );
}

export function SettingsModelStudio({
  models,
  selectedModelId,
  localModelsRoot,
  hfTokenSet,
  engineRunning,
  backendStarting,
  canStartBackend,
  onSelectModel,
  onStartBackend,
  onLoadModel,
  onUnloadModel,
  onRefresh,
  onRequestConfirmation,
}: Props) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("Qwen GGUF");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<LibrarySearchResult[]>([]);
  const [selectedRemoteRepo, setSelectedRemoteRepo] = useState("");
  const [remoteDetails, setRemoteDetails] = useState<LibraryDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedRemoteFile, setSelectedRemoteFile] = useState("");
  const [remoteRuntime, setRemoteRuntime] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [localRuntime, setLocalRuntime] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [localRuntimeRecommended, setLocalRuntimeRecommended] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [localGgufFiles, setLocalGgufFiles] = useState<GgufFileOption[]>([]);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [parameterStages, setParameterStages] = useState<RuntimeStagePayload | null>(null);
  const [controlTier, setControlTier] = useState<ControlTier>("normal");
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [unloadBusy, setUnloadBusy] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [tokenNotice, setTokenNotice] = useState("");

  
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerNotice, setProviderNotice] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("huggingface");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [localFilter, setLocalFilter] = useState("");
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);

  const baseLocalModels = useMemo(
    () =>
      [...models]
        .filter((model) => model.chat_capable !== false)
        .filter((model) => model.has_gguf !== false)
        .filter((model) => !isInfrastructureModelEntry(model))
        .map((model) => ({
          ...model,
          label: model.label.replace(/\b(unsloth|local|gguf|quantized|thebloke)\b/gi, '').replace(/\s+/g, ' ').trim()
        }))
        .sort((a, b) => Number(b.present) - Number(a.present) || (b.local_bytes ?? 0) - (a.local_bytes ?? 0) || a.label.localeCompare(b.label)),
    [models],
  );

  const localModels = useMemo(() => {
    const query = localFilter.trim().toLowerCase();
    if (!query) return baseLocalModels;
    return baseLocalModels.filter((model) => {
      const haystack = [
        model.label,
        model.repo_id,
        model.folder,
        model.path,
        model.params,
        model.precision,
        model.purpose,
        model.present ? "installed" : "missing",
        model.download?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [baseLocalModels, localFilter]);

  const libraryStats = useMemo(
    () => ({
      total: baseLocalModels.length,
      installed: baseLocalModels.filter((model) => model.present).length,
      missing: baseLocalModels.filter((model) => !model.present).length,
      localBytes: baseLocalModels.reduce((total, model) => total + Number(model.local_bytes || 0), 0),
    }),
    [baseLocalModels],
  );

  const selectedLocalModel = useMemo(
    () => baseLocalModels.find((model) => model.id === selectedModelId) ?? baseLocalModels[0] ?? null,
    [baseLocalModels, selectedModelId],
  );

  const selectedRemoteFileDetails = useMemo(
    () => remoteDetails?.gguf_files.find((file) => file.filename === selectedRemoteFile) ?? remoteDetails?.gguf_files[0] ?? null,
    [remoteDetails, selectedRemoteFile],
  );

  const selectedLocalFile = useMemo(
    () => localGgufFiles.find((file) => file.filename === localRuntime.selected_gguf) ?? localGgufFiles[0] ?? null,
    [localGgufFiles, localRuntime.selected_gguf],
  );

  const canLoadSelected = Boolean(selectedLocalModel?.present && selectedLocalFile);
  const activeStage = parameterStages?.[controlTier];
  const activeEstimatedVram = activeStage?.estimated_vram_bytes;

  const loadSearchResults = async (query: string) => {
    setSearchLoading(true);
    setSearchError("");
    try {
      const results = await searchModelLibrary(query, 24);
      setSearchResults(results);
      if (results[0]) {
        setSelectedRemoteRepo(results[0].repo_id);
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Unable to search Hugging Face GGUF models.");
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!browseOpen) return;
    void loadSearchResults(searchQuery);
  }, [browseOpen]);

  useEffect(() => {
    if (!selectedRemoteRepo) return;
    let cancelled = false;
    const loadDetails = async () => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const details = await getModelLibraryDetails(selectedRemoteRepo);
        if (cancelled) return;
        setRemoteDetails(details);
        const runtime = details.saved_runtime_settings ?? details.runtime_recommendation ?? DEFAULT_RUNTIME_SETTINGS;
        setRemoteRuntime(runtime);
        setSelectedRemoteFile(runtime.selected_gguf || details.recommended_gguf?.filename || details.gguf_files[0]?.filename || "");
      } catch (error) {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : "Unable to load model details.");
          setRemoteDetails(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };
    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedRemoteRepo]);

  useEffect(() => {
    if (!selectedLocalModel) return;
    let cancelled = false;
    const loadRuntime = async () => {
      setRuntimeLoading(true);
      setRuntimeNotice("");
      try {
        const payload = await getRuntimeSettings(selectedLocalModel.id);
        if (cancelled) return;
        const recommended = payload.recommended_settings ?? DEFAULT_RUNTIME_SETTINGS;
        const saved = payload.runtime_settings ?? recommended;
        setLocalRuntime(saved);
        setLocalRuntimeRecommended(recommended);
        setLocalGgufFiles(payload.gguf_files ?? []);
        setHardwareProfile(payload.hardware_profile ?? null);
        setParameterStages(payload.parameter_stages ?? null);
      } catch {
        if (!cancelled) {
          setLocalRuntime(DEFAULT_RUNTIME_SETTINGS);
          setLocalRuntimeRecommended(DEFAULT_RUNTIME_SETTINGS);
          setLocalGgufFiles([]);
          setHardwareProfile(null);
          setParameterStages(null);
        }
      } finally {
        if (!cancelled) {
          setRuntimeLoading(false);
        }
      }
    };
    void loadRuntime();
    return () => {
      cancelled = true;
    };
  }, [selectedLocalModel?.id]);

  useEffect(() => {
    void refreshProviders();
  }, []);

  const updateLocalRuntime = (patch: Partial<RuntimeSettings>) => {
    setRuntimeNotice("");
    setLocalRuntime((current) => ({ ...current, ...patch }));
  };

  const updateRemoteRuntime = (patch: Partial<RuntimeSettings>) => {
    setRemoteRuntime((current) => ({ ...current, ...patch }));
  };

  const applyStagePreset = (tier: ControlTier) => {
    const staged = runtimeFromStage(parameterStages, tier);
    setControlTier(tier);
    if (staged) {
      setLocalRuntime((current) => ({ ...staged, selected_gguf: current.selected_gguf || staged.selected_gguf }));
      setRuntimeNotice(`${CONTROL_TIERS.find((item) => item.id === tier)?.label || "Preset"} preset applied.`);
    }
  };

  const handleSaveLocalRuntime = async () => {
    if (!selectedLocalModel) return;
    setRuntimeSaving(true);
    setRuntimeNotice("");
    try {
      const saved = await saveRuntimeSettings(selectedLocalModel.id, localRuntime);
      setLocalRuntime(saved);
      setRuntimeNotice("Runtime settings saved for this GGUF model.");
      await onRefresh();
    } finally {
      setRuntimeSaving(false);
    }
  };

  const handleLoadSelected = async () => {
    console.log("Loading selected model:", selectedLocalModel, "with file:", selectedLocalFile);
    if (!selectedLocalModel || !selectedLocalFile) {
        console.error("Missing selected model or file", {selectedLocalModel, selectedLocalFile});
        return;
    }
    await handleSaveLocalRuntime();
    await onLoadModel(selectedLocalModel.id, localRuntime, selectedLocalFile.filename);
  };

  const handleUnloadSelected = async () => {
    const targetId = selectedLocalModel?.id || baseLocalModels.find((m) => m.loaded)?.id;
    if (!targetId) {
      setRuntimeNotice("No model is currently loaded in memory.");
      return;
    }
    setUnloadBusy(true);
    setRuntimeNotice("");
    try {
      if (onUnloadModel) {
        await onUnloadModel(targetId);
      } else {
        await unloadLocalModel(targetId);
      }
      setRuntimeNotice("Local model unloaded from memory.");
      await onRefresh();
    } finally {
      setUnloadBusy(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!selectedLocalModel) return;
    let confirmDelete = false;
    if (onRequestConfirmation) {
      confirmDelete = await onRequestConfirmation({
        icon: "delete",
        kicker: "Model cleanup",
        title: `Delete ${selectedLocalModel.label}?`,
        description: "This removes the model from this device and frees local disk space.",
        confirmLabel: "Delete model",
        cancelLabel: "Cancel",
        tone: "danger",
      });
    } else {
      confirmDelete = window.confirm(`Are you sure you want to completely delete "${selectedLocalModel.label}" from disk?`);
    }
    if (!confirmDelete) return;
    
    setDeleteBusy(true);
    setRuntimeNotice("");
    try {
      if (selectedLocalModel.loaded) {
        await unloadLocalModel(selectedLocalModel.id);
      }
      const res = await deleteLocalModel(selectedLocalModel.id);
      if (res.ok) {
        setRuntimeOpen(false);
        await onRefresh();
      } else {
        setRuntimeNotice(`Delete failed: ${res.error || "Unknown error"}`);
      }
    } catch (e) {
      setRuntimeNotice("Error deleting model");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDownloadRemote = async () => {
    if (!remoteDetails || !selectedRemoteFileDetails) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const result = await downloadLibraryModel(remoteDetails.repo_id, remoteDetails.label, selectedRemoteFileDetails.filename);
      clearTimeout(timeout);
      if (result?.model_id) {
        onSelectModel(result.model_id);
      }
      await onRefresh();
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to start the download.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const refreshProviders = async () => {
    setProviderLoading(true);
    setProviderError("");
    try {
      const payload = await listProviders();
      setProviders(payload.providers || []);
      const active = payload.providers?.[0];
      if (active) {
        setSelectedProvider(active.id);
        setProviderBaseUrl(active.base_url || "");
        setProviderModel(active.model || "");
      }
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Unable to load provider status.");
    } finally {
      setProviderLoading(false);
    }
  };

  const handleSaveToken = async () => {
    if (!tokenValue.trim()) {
      setTokenError("Enter your Hugging Face token.");
      return;
    }
    setTokenBusy(true);
    setTokenError("");
    setTokenNotice("");
    try {
      const result = await saveHfToken(tokenValue.trim());
      const count = result.token_count ?? 1;
      setTokenValue("");
      setTokenNotice(result.message || `${count} Hugging Face token${count === 1 ? "" : "s"} saved for downloads and cloud failover.`);
      await onRefresh();
      await refreshProviders();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Unable to verify the token.");
    } finally {
      setTokenBusy(false);
    }
  };

  const handleClearToken = async () => {
    setTokenBusy(true);
    setTokenError("");
    setTokenNotice("");
    try {
      const result = await clearHfToken();
      setTokenNotice(result.message || "All saved Hugging Face tokens cleared.");
      await onRefresh();
      await refreshProviders();
    } catch (error) {
      setTokenError(error instanceof Error ? error.message : "Unable to clear the token.");
    } finally {
      setTokenBusy(false);
    }
  };

  const handleConnectProvider = async () => {
    if (!providerApiKey.trim()) {
      setProviderError("Provider API key is required.");
      return;
    }
    setProviderBusy(true);
    setProviderError("");
    setProviderNotice("");
    try {
      const payload = await connectProvider({
        provider: selectedProvider,
        api_key: providerApiKey.trim(),
        base_url: providerBaseUrl.trim(),
        model: providerModel.trim(),
      });
      setProviderNotice(`Connected ${payload.provider}.`);
      await refreshProviders();
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Unable to connect provider.");
    } finally {
      setProviderBusy(false);
    }
  };

  const handleDisconnectProvider = async () => {
    setProviderBusy(true);
    setProviderError("");
    setProviderNotice("");
    try {
      const payload = await disconnectProvider(selectedProvider);
      setProviderNotice(`Disconnected ${payload.provider}.`);
      await refreshProviders();
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Unable to disconnect provider.");
    } finally {
      setProviderBusy(false);
    }
  };

  const gpu = hardwareProfile?.gpu;
  const cpu = hardwareProfile?.cpu;
  const memory = hardwareProfile?.memory;
  const selectedAuthor = authorFromRepo(selectedLocalModel?.repo_id);
  const selectedTier = CONTROL_TIERS.find((tier) => tier.id === controlTier) ?? CONTROL_TIERS[0];

  const renderSettingsModal = (content: React.ReactNode) => {
    const drawer = document.querySelector('.settings-drawer');
    if (!drawer) return content;
    return createPortal(content, drawer);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flex: 1, minHeight: 0, boxSizing: "border-box", borderRadius: 24 }}>
      <div className="model-studio" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px", height: "100%", flex: 1, minHeight: 0, boxSizing: "border-box", overflowY: "auto", overflowX: "hidden" }}>
        <div className="model-studio-command" style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
        boxSizing: "border-box",
        flex: "0 0 auto"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, flexWrap: "wrap" }}>
          <div className="cc-glass-card massive" style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 300 }}>
            <span className="cc-subtitle">GGUF Local Inference</span>
            <h3 className="cc-title" style={{ margin: 0 }}>Model library and hardware load control</h3>
            <p className="cc-desc" style={{ margin: 0, maxWidth: 600 }}>
              Local inference is locked to GGUF files. MeeraAI reads this device at runtime and selects the safest file, context, cache, CPU threads, and GPU offload profile before loading.
            </p>
            <div className="model-studio-stat-pill" style={{ marginTop: 2, gap: 6, fontWeight: 500, padding: "4px 10px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>folder</span>
              <code style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: "0.72rem" }}>{localModelsRoot || "models folder"}</code>
            </div>
          </div>
          
          <div className="cc-glass-card massive" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 200 }}>
            {!engineRunning && canStartBackend && (
              <button className="cc-btn" type="button" onClick={() => void onStartBackend()} disabled={backendStarting} style={{ padding: "8px 14px", fontSize: "0.85rem", background: "#10a37f", color: "white", border: "none" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>power_settings_new</span>
                {backendStarting ? "Starting" : "Start engine"}
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cc-btn" type="button" onClick={() => setTokenOpen(true)} style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.8)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>vpn_key</span>
                HF access
              </button>
              <button className="cc-btn" type="button" onClick={() => setBrowseOpen(true)} style={{ flex: 1, padding: "8px 12px", fontSize: "0.85rem", background: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.8)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>travel_explore</span>
                Browse GGUF
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
          <DeviceMetric label="Profile" value={hardwareProfile?.headline || "Detecting"} sub={hardwareProfile?.performance_class || "runtime"} />
          <DeviceMetric label="GPU" value={gpu?.available ? gpu.name || "CUDA GPU" : "CPU only"} sub={gpu?.available ? `${gpu.free_gib ?? 0} / ${gpu.total_gib ?? 0} GB free` : "No CUDA VRAM detected"} />
          <DeviceMetric label="CPU" value={`${cpu?.physical_cores ?? 0}P / ${cpu?.logical_cores ?? 0}T`} sub="auto threads" />
          <DeviceMetric label="RAM" value={`${memory?.available_gib ?? 0} GB free`} sub={`${memory?.total_gib ?? 0} GB total`} />
        </div>

        <div className="cc-glass-card massive" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h4 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800, color: "#111827" }}>Local GGUF library</h4>
            <span style={{ fontSize: "0.74rem", color: "#6b7280" }}>{libraryStats.installed} installed / {libraryStats.total} compatible entries</span>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "rgba(255,255,255,0.55)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.6)", minWidth: 260, boxShadow: "inset 0 1px 3px rgba(15,23,42,0.05)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#9ca3af" }}>search</span>
              <input
                style={{ background: "transparent", border: "none", outline: "none", fontSize: "0.82rem", color: "#111827", width: "100%" }}
                value={localFilter}
                onChange={(event) => setLocalFilter(event.target.value)}
                placeholder="Search local model, author, size, status"
              />
            </div>
            <button className="cc-close-btn" type="button" onClick={() => void onRefresh()} title="Refresh local models" style={{ width: 34, height: 34, background: "rgba(255, 255, 255, 0.4)", border: "1px solid rgba(255, 255, 255, 0.6)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="model-studio-stat-pill accent">{localModels.length} shown</span>
          <span className={`model-studio-stat-pill ${libraryStats.missing > 0 ? "warn" : ""}`}>{libraryStats.missing} missing</span>
          <span className="model-studio-stat-pill">{formatBytes(libraryStats.localBytes)} local</span>
        </div>

        <div className="model-card-list" style={{ display: "flex", flexDirection: "column", gap: 8, paddingRight: 8, paddingBottom: 16, flex: "0 0 auto", overflow: "visible" }}>
            {localModels.map((model) => {
              const active = model.id === selectedLocalModel?.id;
              const author = authorFromRepo(model.repo_id);
              const family = familyTone(`${model.label} ${model.repo_id || ""}`);
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`model-studio-card-glass ${active ? "active" : ""}`}
                  onClick={() => {
                    onSelectModel(model.id);
                    setRuntimeOpen(true);
                  }}
                  aria-pressed={active}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 16px",
                    background: active ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.4)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: `1px solid ${active ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.8)"}`,
                    borderLeft: active ? "3px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.8)",
                    boxShadow: active 
                      ? "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.03)"
                      : "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 8px rgba(0,0,0,0.02)",
                    borderRadius: 14,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: active ? "none" : "none"
                  }}
                  onMouseOver={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.65)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 1), 0 6px 16px rgba(0,0,0,0.04)";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.4)";
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 8px rgba(0,0,0,0.02)";
                    }
                  }}
                >
                  <ModelIdentity label={model.label} repoId={model.repo_id} logoUrl={model.logo_url || ""} />
                  
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: "0.92rem", color: "#111827", fontWeight: 700 }}>{model.label}</strong>
                    <small style={{ fontSize: "0.76rem", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 400 }}>{model.blurb || model.repo_id || "Local Import"}</small>
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: "0.68rem", padding: "1px 7px", background: "rgba(0,0,0,0.05)", borderRadius: 6, color: "#4b5563" }}>{model.params || family.label}</span>
                      <span style={{ fontSize: "0.68rem", padding: "1px 7px", background: "rgba(0,0,0,0.05)", borderRadius: 6, color: "#4b5563" }}>{model.precision || "GGUF"}</span>
                      <span style={{ fontSize: "0.68rem", padding: "1px 7px", background: model.loaded ? "rgba(16, 185, 129, 0.1)" : "rgba(0,0,0,0.05)", color: model.loaded ? "#059669" : "#4b5563", borderRadius: 6 }}>{model.loaded ? "Loaded" : model.present ? "Installed" : model.download?.status || "Missing"}</span>
                      {model.capabilities?.includes("vision") && (
                        <span style={{ fontSize: "0.68rem", padding: "1px 7px", background: "rgba(59, 130, 246, 0.1)", color: "#2563eb", borderRadius: 6, display: "flex", alignItems: "center", gap: 3 }} title="Vision Capable">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                          Vision
                        </span>
                      )}
                      {model.capabilities?.includes("tools") && (
                        <span style={{ fontSize: "0.68rem", padding: "1px 7px", background: "rgba(139, 92, 246, 0.1)", color: "#7c3aed", borderRadius: 6, display: "flex", alignItems: "center", gap: 3 }} title="Tool Calling Capable">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                          Tools
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <strong style={{ fontSize: "0.95rem", color: "#111827", fontWeight: 700 }}>{formatBytes(model.local_bytes ?? model.size_bytes)}</strong>
                    <small style={{ fontSize: "0.76rem", color: "#6b7280" }}>{author || model.purpose || "local"}</small>
                  </div>
                </button>
              );
            })}
            {localModels.length === 0 && (
              <div className="model-studio-empty">
                {baseLocalModels.length === 0 ? "No GGUF model files were found in the local models folder." : "No local GGUF entries match this search."}
              </div>
            )}
          </div>
        </div>

        {runtimeOpen && selectedLocalModel && renderSettingsModal(
          <div className="settings-panel-backdrop" style={{ backdropFilter: "blur(24px) saturate(1.5)", WebkitBackdropFilter: "blur(24px) saturate(1.5)", background: "radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.75) 100%)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0 }} onClick={() => setRuntimeOpen(false)}>
            <div
              style={{
                maxWidth: 960,
                width: "95%",
                maxHeight: "80vh",
                background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
                boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(0,0,0,0.15)",
                borderRadius: 24,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                animation: "modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setRuntimeOpen(false)}
                style={{
                  position: "absolute",
                  top: 24,
                  right: 24,
                  background: "#f8fafc",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 8,
                  borderRadius: "50%",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  zIndex: 10
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#0f172a"; e.currentTarget.style.transform = "rotate(90deg)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.transform = "none"; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "32px 40px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ padding: 14, background: "linear-gradient(135deg, #f1f5f9, #e2e8f0)", borderRadius: 24, boxShadow: "inset 0 2px 4px rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.05)" }}>
                    <ModelIdentity label={selectedLocalModel.label || "GGUF"} repoId={selectedLocalModel.repo_id} logoUrl={selectedLocalModel.logo_url || ""} />
                  </div>
                  <div>
                    <h2 style={{ margin: "0 0 6px", fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>{selectedLocalModel.label || "Model Engine"}</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem", color: "#64748b", fontWeight: 600 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>memory</span> Local Configuration
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, background: "#ffffff", borderRadius: 16, padding: "20px 24px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Format</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>GGUF <span style={{ fontWeight: 600, color: "#64748b" }}>{selectedLocalFile?.precision_label ? `(${selectedLocalFile.precision_label})` : ""}</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>File</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={selectedLocalFile?.filename || "None selected"}>{selectedLocalFile?.filename || "None selected"}</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 4, fontWeight: 500 }}>{selectedLocalFile?.size ? formatBytes(selectedLocalFile.size) : ""}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Author</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>{authorFromRepo(selectedLocalModel.repo_id) || "Local"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>VRAM Estimate</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#3b82f6" }}>{activeEstimatedVram ? formatBytes(activeEstimatedVram) : "Auto"}</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 4, fontWeight: 500 }}>model + KV + buffers</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "0 40px" }}>
                <div style={{ display: "flex", background: "rgba(15, 23, 42, 0.04)", padding: 6, borderRadius: 16, border: "1px solid rgba(15, 23, 42, 0.05)" }}>
                  {CONTROL_TIERS.map((tier) => {
                    const active = controlTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setControlTier(tier.id as ControlTier)}
                        style={{
                          flex: 1,
                          padding: "14px 16px",
                          background: active ? "#ffffff" : "transparent",
                          border: "none",
                          borderRadius: 12,
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                          boxShadow: active ? "0 4px 12px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)" : "none",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                        }}
                      >
                        <strong style={{ fontSize: 13.5, color: active ? "#0f172a" : "#64748b", fontWeight: 800 }}>{tier.label}</strong>
                        <span style={{ fontSize: 11.5, color: active ? "#64748b" : "#94a3b8", fontWeight: 500 }}>{tier.caption}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ padding: "32px 40px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#3b82f6" }}>tune</span>
                    <strong style={{ fontSize: 17, color: "#0f172a", fontWeight: 800, letterSpacing: "-0.01em" }}>{selectedTier.label} control window</strong>
                  </div>
                  <button
                    style={{ background: "#f1f5f9", color: "#3b82f6", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease", display: "flex", alignItems: "center", gap: 6 }}
                    type="button"
                    onClick={() => setParamsOpen(true)}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#2563eb"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#3b82f6"; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span>
                    Parameters
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: 16, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.03)" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Selected tier</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{selectedTier.label}</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: 16, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.03)" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Context Limit</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{`${localRuntime.context_length || 0}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} tokens</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: 16, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.03)" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>GPU Acceleration</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", textTransform: "capitalize" }}>{localRuntime.gpu_layers_mode || "auto"} split</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "20px 24px", borderRadius: 16, border: "1px solid #cbd5e1", boxShadow: "0 4px 6px rgba(0,0,0,0.03)" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Resource Load</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{activeEstimatedVram ? formatBytes(activeEstimatedVram) : "Auto"}</div>
                  </div>
                </div>
              </div>

              {(!selectedLocalFile || runtimeNotice) && (
                <div style={{ padding: "0 40px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {!selectedLocalFile && (
                    <div style={{ padding: "16px 20px", background: "#fef2f2", color: "#b91c1c", borderRadius: 14, fontSize: 13.5, fontWeight: 600, display: "flex", gap: 12, alignItems: "center", border: "1px solid #fecaca" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>error</span>
                      This entry has no GGUF file. Download a GGUF quantization before loading.
                    </div>
                  )}
                  {runtimeNotice && (
                    <div style={{ padding: "16px 20px", background: "#ecfdf5", color: "#047857", borderRadius: 14, fontSize: 13.5, fontWeight: 600, display: "flex", gap: 12, alignItems: "center", border: "1px solid #a7f3d0" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                      {runtimeNotice}
                    </div>
                  )}
                </div>
              )}

              </div>
              <div style={{ borderTop: "1px solid #cbd5e1", padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 18px", fontSize: 13.5, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                    type="button"
                    onClick={() => applyStagePreset(controlTier)}
                    disabled={!runtimeFromStage(parameterStages, controlTier)}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
                  >
                    Reset defaults
                  </button>
                  <button
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 18px", fontSize: 13.5, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                    type="button"
                    onClick={() => setLocalRuntime(localRuntimeRecommended)}
                    disabled={runtimeLoading}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
                  >
                    Use recommended
                  </button>
                  <button
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 18px", fontSize: 13.5, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                    type="button"
                    onClick={() => void handleSaveLocalRuntime()}
                    disabled={runtimeSaving}
                    onMouseOver={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
                  >
                    {runtimeSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    style={{ background: "#ffffff", border: "1px solid #fee2e2", borderRadius: 12, padding: "12px 20px", fontSize: 13.5, fontWeight: 700, color: "#ef4444", cursor: "pointer", transition: "all 0.2s ease" }}
                    type="button"
                    onClick={() => void handleUnloadSelected()}
                    disabled={unloadBusy || runtimeLoading || runtimeSaving}
                    onMouseOver={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#fef2f2"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                  >
                    {unloadBusy ? "Unloading..." : "Unload"}
                  </button>
                  <button
                    style={{ background: "#ffffff", border: "1px solid #fee2e2", borderRadius: 12, padding: "12px 20px", fontSize: 13.5, fontWeight: 700, color: "#ef4444", cursor: "pointer", transition: "all 0.2s ease" }}
                    type="button"
                    onClick={() => void handleDeleteModel()}
                    disabled={deleteBusy || runtimeLoading || runtimeSaving}
                    onMouseOver={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#fef2f2"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; }}
                  >
                    {deleteBusy ? "Deleting..." : "Delete"}
                  </button>
                  <button
                    style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 32px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(37,99,235,0.25), inset 0 1px 1px rgba(255,255,255,0.2)", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
                    type="button"
                    onClick={() => void handleLoadSelected()}
                    disabled={!canLoadSelected || runtimeLoading || runtimeSaving}
                    onMouseOver={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.boxShadow = "0 12px 24px rgba(37,99,235,0.35), inset 0 1px 1px rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                    onMouseOut={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.boxShadow = "0 8px 20px rgba(37,99,235,0.25), inset 0 1px 1px rgba(255,255,255,0.2)"; e.currentTarget.style.transform = "none"; } }}
                  >
                    {runtimeLoading ? "Loading..." : "Load GGUF"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      {paramsOpen && selectedLocalModel && renderSettingsModal(
        <div className="settings-panel-backdrop premium-params-modal" style={{ backdropFilter: "blur(24px) saturate(1.5)", WebkitBackdropFilter: "blur(24px) saturate(1.5)", background: "radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.75) 100%)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0 }} onClick={() => setParamsOpen(false)}>
          <style>{`
            .premium-params-modal .mdx-input, .premium-params-modal .mdx-select {
              width: 100%;
              padding: 12px 16px;
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              font-size: 14px;
              font-weight: 600;
              color: #0f172a;
              outline: none;
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 0 1px 2px rgba(0,0,0,0.02);
            }
            .premium-params-modal .mdx-input:focus, .premium-params-modal .mdx-select:focus {
              border-color: #3b82f6;
              box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15), 0 1px 2px rgba(0,0,0,0.02);
            }
            .premium-params-modal .mdx-select {
              appearance: none;
              background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E");
              background-repeat: no-repeat;
              background-position: right 14px top 50%;
              background-size: 10px auto;
              padding-right: 32px;
            }
          `}</style>
          <section
            style={{
              width: "100%",
              maxWidth: 820,
              height: 560,
              background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(0,0,0,0.15)",
              borderRadius: 24,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
              animation: "modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards"
            }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={() => setParamsOpen(false)}
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "#f8fafc",
                border: "none",
                cursor: "pointer",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
                borderRadius: "50%",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                zIndex: 10
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#e2e8f0"; e.currentTarget.style.color = "#0f172a"; e.currentTarget.style.transform = "rotate(90deg)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.color = "#64748b"; e.currentTarget.style.transform = "none"; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>

            <header style={{ padding: "32px 40px 24px", display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ margin: 0, fontSize: "2rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>Parameters</h3>
              <p style={{ margin: 0, fontSize: "0.95rem", color: "#64748b", fontWeight: 500 }}>Fine-tune model execution for your hardware.</p>
            </header>

            <div style={{ flex: 1, minHeight: 0, padding: "24px 40px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 32 }}>
              
              <div style={{ display: "flex", background: "rgba(15, 23, 42, 0.04)", padding: 6, borderRadius: 16, border: "1px solid rgba(15, 23, 42, 0.05)" }}>
                {CONTROL_TIERS.map((tier) => {
                  const active = controlTier === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setControlTier(tier.id as ControlTier)}
                      style={{
                        flex: 1,
                        padding: "12px 16px",
                        background: active ? "#ffffff" : "transparent",
                        border: "none",
                        borderRadius: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        boxShadow: active ? "0 4px 12px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)" : "none",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        color: active ? "#0f172a" : "#64748b",
                        fontWeight: active ? 800 : 600,
                        fontSize: "0.95rem"
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tier.id === "normal" ? "tune" : tier.id === "advanced" ? "speed" : "terminal"}</span>
                      {tier.label}
                    </button>
                  );
                })}
              </div>

              {controlTier === "normal" && (
                <div>
                  <h5 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#3b82f6", fontWeight: 800, margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span> Normal Settings
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <RuntimeField label="Selected GGUF" hint="The exact quantized file loaded by llama.cpp. Auto chooses the best fit.">
                      <select className="mdx-select" value={localRuntime.selected_gguf} onChange={(event) => updateLocalRuntime({ selected_gguf: event.target.value })}>
                        <option value="">Auto-select optimal file</option>
                        {remoteDetails?.gguf_files.map((file) => (
                          <option key={file.filename} value={file.filename}>
                            {file.filename} - {file.precision_label} - {formatBytes(file.size)}
                          </option>
                        ))}
                      </select>
                    </RuntimeField>
                    <RuntimeField label="Context length" hint="Maximum tokens remembered. Higher values increase KV cache memory.">
                      <input className="mdx-input" type="number" min={512} step={512} value={numberInputValue(localRuntime.context_length)} onChange={(event) => updateLocalRuntime({ context_length: updateNumber(event.target.value, 8196) })} />
                    </RuntimeField>
                    <RuntimeField label="GPU offload" hint="Auto balances VRAM and CPU fallback. Max GPU is fastest if it fits.">
                      <select className="mdx-select" value={localRuntime.gpu_layers_mode} onChange={(event) => updateLocalRuntime({ gpu_layers_mode: event.target.value as RuntimeSettings["gpu_layers_mode"] })}>
                        <option value="auto">Auto split</option>
                        <option value="max">Max GPU</option>
                        <option value="cpu">CPU only</option>
                        <option value="custom">Custom layers</option>
                      </select>
                    </RuntimeField>
                    {localRuntime.gpu_layers_mode === "custom" && (
                      <RuntimeField label="GPU layers" hint="-1 attempts all layers. Lower values move more work to CPU.">
                        <input className="mdx-input" type="number" min={-1} value={numberInputValue(localRuntime.gpu_layers)} onChange={(event) => updateLocalRuntime({ gpu_layers: updateNumber(event.target.value, -1) })} />
                      </RuntimeField>
                    )}
                  </div>
                </div>
              )}

              {controlTier === "advanced" && (
                <div>
                  <h5 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#8b5cf6", fontWeight: 800, margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>speed</span> Advanced Tuning
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <RuntimeField label="Eval batch" hint="Prompt prefill batch. Higher is faster until VRAM limits.">
                      <input className="mdx-input" type="number" min={64} step={64} value={numberInputValue(localRuntime.evaluation_batch_size)} onChange={(event) => updateLocalRuntime({ evaluation_batch_size: updateNumber(event.target.value, 1024) })} />
                    </RuntimeField>
                    <RuntimeField label="Physical batch" hint="Micro-batch size. Keep this under eval batch for smoothness.">
                      <input className="mdx-input" type="number" min={32} step={32} value={numberInputValue(localRuntime.physical_batch_size)} onChange={(event) => updateLocalRuntime({ physical_batch_size: updateNumber(event.target.value, 256) })} />
                    </RuntimeField>
                    <RuntimeField label="CPU threads" hint="0 uses physical CPU cores. Manual values help with multi-tasking.">
                      <input className="mdx-input" type="number" min={0} value={numberInputValue(localRuntime.cpu_thread_pool_size)} onChange={(event) => updateLocalRuntime({ cpu_thread_pool_size: updateNumber(event.target.value, 0) })} />
                    </RuntimeField>
                    <RuntimeField label="Batch threads" hint="Threads used for prompt batching. 0 uses logical cores.">
                      <input className="mdx-input" type="number" min={0} value={numberInputValue(localRuntime.cpu_batch_thread_pool_size)} onChange={(event) => updateLocalRuntime({ cpu_batch_thread_pool_size: updateNumber(event.target.value, 0) })} />
                    </RuntimeField>
                    <RuntimeField label="K cache type" hint="q8_0 is the balanced default. q4_0 saves more VRAM.">
                      <select className="mdx-select" value={localRuntime.k_cache_quantization_type} onChange={(event) => updateLocalRuntime({ k_cache_quantization_type: event.target.value as RuntimeSettings["k_cache_quantization_type"] })}>
                        <option value="q8_0">q8_0 balanced</option>
                        <option value="q4_0">q4_0 low memory</option>
                        <option value="f16">f16 full precision</option>
                      </select>
                    </RuntimeField>
                    <RuntimeField label="V cache type" hint="Match K cache unless testing quality or memory pressure.">
                      <select className="mdx-select" value={localRuntime.v_cache_quantization_type} onChange={(event) => updateLocalRuntime({ v_cache_quantization_type: event.target.value as RuntimeSettings["v_cache_quantization_type"] })}>
                        <option value="q8_0">q8_0 balanced</option>
                        <option value="q4_0">q4_0 low memory</option>
                        <option value="f16">f16 full precision</option>
                      </select>
                    </RuntimeField>
                  </div>
                </div>
              )}

              {controlTier === "expert" && (
                <div>
                  <h5 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#ef4444", fontWeight: 800, margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>terminal</span> Expert Controls
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <RuntimeField label="Concurrent sequences" hint="Keep at 1 for best single-chat stability.">
                      <input className="mdx-input" type="number" min={1} value={numberInputValue(localRuntime.max_concurrent_predictions)} onChange={(event) => updateLocalRuntime({ max_concurrent_predictions: updateNumber(event.target.value, 1) })} />
                    </RuntimeField>
                    <RuntimeField label="RoPE base" hint="Model-specific position scaling. Blank = default.">
                      <input className="mdx-input" type="number" placeholder="model default" value={numberInputValue(localRuntime.rope_frequency_base)} onChange={(event) => updateLocalRuntime({ rope_frequency_base: event.target.value ? updateNumber(event.target.value) : null })} />
                    </RuntimeField>
                    <RuntimeField label="RoPE scale" hint="Context scaling multiplier. Blank = default.">
                      <input className="mdx-input" type="number" step={0.1} placeholder="model default" value={numberInputValue(localRuntime.rope_frequency_scale)} onChange={(event) => updateLocalRuntime({ rope_frequency_scale: event.target.value ? updateNumber(event.target.value) : null })} />
                    </RuntimeField>
                    <RuntimeField label="Seed" hint="Blank keeps replies non-deterministic. Fixed repeats outputs.">
                      <input className="mdx-input" type="number" min={-1} value={localRuntime.seed ?? -1} onChange={(event) => updateLocalRuntime({ seed: Number(event.target.value) < 0 ? null : updateNumber(event.target.value) })} />
                    </RuntimeField>
                  </div>
                </div>
              )}

              {BOOLEAN_FLAGS.filter((flag) => flag.tier === controlTier).length > 0 && (
                <div>
                  <h5 style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#f59e0b", fontWeight: 800, margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>toggle_on</span> Feature Flags
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {BOOLEAN_FLAGS.filter((flag) => flag.tier === controlTier).map((flag) => (
                      <button
                        key={String(flag.key)}
                        type="button"
                        onClick={() => updateLocalRuntime({ [flag.key]: !localRuntime[flag.key] } as Partial<RuntimeSettings>)}
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "flex-start", 
                          padding: "16px", 
                          gap: 12, 
                          background: localRuntime[flag.key] ? "#eff6ff" : "#ffffff",
                          border: localRuntime[flag.key] ? "1px solid #bfdbfe" : "1px solid #e2e8f0", 
                          borderRadius: 16,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ color: localRuntime[flag.key] ? "#2563eb" : "#94a3b8", fontSize: 24 }}>{localRuntime[flag.key] ? "check_circle" : "radio_button_unchecked"}</span>
                        <strong style={{ fontSize: 14, color: localRuntime[flag.key] ? "#1d4ed8" : "#475569", fontWeight: 700 }}>{flag.label}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "24px 40px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 12, background: "#f8fafc", flexShrink: 0 }}>
              <button
                style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 20px", fontSize: 13.5, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                type="button" 
                onClick={() => setLocalRuntime(localRuntimeRecommended)} 
                disabled={runtimeLoading}
                onMouseOver={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
              >
                Use recommended
              </button>
              <button
                style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 20px", fontSize: 13.5, fontWeight: 700, color: "#475569", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                type="button" 
                onClick={() => void handleSaveLocalRuntime()} 
                disabled={runtimeSaving}
                onMouseOver={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#0f172a"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
              >
                {runtimeSaving ? "Saving..." : "Save settings"}
              </button>
              <button
                style={{ background: "linear-gradient(135deg, #0f172a, #334155)", color: "#fff", border: "none", borderRadius: 12, padding: "12px 32px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 16px rgba(15,23,42,0.2), inset 0 1px 1px rgba(255,255,255,0.1)", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
                type="button" 
                onClick={() => setParamsOpen(false)}
                onMouseOver={(e) => { e.currentTarget.style.boxShadow = "0 12px 24px rgba(15,23,42,0.3), inset 0 1px 1px rgba(255,255,255,0.1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseOut={(e) => { e.currentTarget.style.boxShadow = "0 8px 16px rgba(15,23,42,0.2), inset 0 1px 1px rgba(255,255,255,0.1)"; e.currentTarget.style.transform = "none"; }}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
      {tokenOpen && renderSettingsModal(
        <div className="settings-panel-backdrop" style={{ backdropFilter: "blur(24px) saturate(1.5)", WebkitBackdropFilter: "blur(24px) saturate(1.5)", background: "radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.75) 100%)", borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setTokenOpen(false)}>
          <div className="model-token-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Hugging Face access window">
            <div className="model-library-modal-head">
              <div>
                <span className="model-studio-kicker">Private access</span>
                <h3>Hugging Face token</h3>
                <p>{hfTokenSet ? "Saved tokens are used for gated GGUF downloads and Hugging Face cloud failover." : "Save one or more tokens for gated GGUF repositories and cloud fallback."}</p>
              </div>
              <button className="model-library-close" type="button" onClick={() => setTokenOpen(false)} aria-label="Close Hugging Face access">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <section className="model-token-band model-token-band-window">
              <div className="model-token-copy">
                <div>
                  <strong>Access credentials</strong>
                  <span>Paste another hf_ token to add it. Cloud automatically tries the next saved token when one fails.</span>
                </div>
                <span className={`model-token-status ${hfTokenSet ? "saved" : ""}`}>{hfTokenSet ? "Saved" : "No token"}</span>
              </div>
              <div className="model-token-form-row">
                <input type="password" placeholder="Add hf_... token" value={tokenValue} onChange={(event) => setTokenValue(event.target.value)} disabled={tokenBusy} />
                <button className="settings-primary-btn" type="button" onClick={() => void handleSaveToken()} disabled={tokenBusy}>
                  {tokenBusy ? "Verifying" : "Add token"}
                </button>
                {hfTokenSet && (
                  <button className="settings-secondary-btn" type="button" onClick={() => void handleClearToken()} disabled={tokenBusy}>
                    Clear all
                  </button>
                )}
                <button className="settings-secondary-btn" type="button" onClick={() => void handleUnloadSelected()} disabled={unloadBusy || runtimeLoading || runtimeSaving}>
                  {unloadBusy ? "Unloading" : "Unload model"}
                </button>
              </div>
              <div className="model-token-provider-section">
                <strong>Cloud providers</strong>
                <span>Manage cloud inference providers like Hugging Face, OpenAI, Anthropic, Google, and SambaNova.</span>
              </div>
              <div className="model-token-form-row">
                <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)} disabled={providerBusy}>
                  <option value="huggingface">Hugging Face</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="sambanova">SambaNova</option>
                </select>
                <input type="password" placeholder="Provider API key" value={providerApiKey} onChange={(event) => setProviderApiKey(event.target.value)} disabled={providerBusy} />
              </div>
              <div className="model-token-form-row">
                <input type="text" placeholder="Base URL (optional)" value={providerBaseUrl} onChange={(event) => setProviderBaseUrl(event.target.value)} disabled={providerBusy} />
                <input type="text" placeholder="Model ID (optional)" value={providerModel} onChange={(event) => setProviderModel(event.target.value)} disabled={providerBusy} />
              </div>
              <div className="model-token-form-row">
                <button className="settings-primary-btn" type="button" onClick={() => void handleConnectProvider()} disabled={providerBusy}>
                  {providerBusy ? "Connecting" : "Connect provider"}
                </button>
                <button className="settings-secondary-btn" type="button" onClick={() => void handleDisconnectProvider()} disabled={providerBusy}>
                  Disconnect provider
                </button>
              </div>
            </section>
            {tokenError && <div className="settings-alert error">{tokenError}</div>}
            {tokenNotice && <div className="settings-alert info">{tokenNotice}</div>}
          </div>
        </div>
      )}

      {browseOpen && renderSettingsModal(
        <div className="settings-panel-backdrop" style={{ backdropFilter: "blur(24px) saturate(1.5)", WebkitBackdropFilter: "blur(24px) saturate(1.5)", background: "radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.75) 100%)", borderRadius: 0, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBrowseOpen(false)}>
          <div className="model-library-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Browse GGUF models">
            <div className="model-library-modal-head">
              <div>
                <span className="model-studio-kicker">Hugging Face GGUF</span>
                <h3>Browse quantized local models</h3>
                <p>Results are filtered to repositories with downloadable GGUF files. Choose a file, then download it into the local model library.</p>
              </div>
              <button className="model-library-close" type="button" onClick={() => setBrowseOpen(false)} aria-label="Close model browser">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="model-library-toolbar">
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search GGUF models by repo, author, family, or capability" />
              <button className="settings-primary-btn" type="button" onClick={() => void loadSearchResults(searchQuery)} disabled={searchLoading}>
                {searchLoading ? "Searching" : "Search"}
              </button>
            </div>
            {searchError && <div className="settings-alert error">{searchError}</div>}

            <div className="model-library-layout">
              <div className="model-library-results">
                {searchResults.map((result) => (
                  <button
                    key={result.repo_id}
                    type="button"
                    className={`model-search-card ${selectedRemoteRepo === result.repo_id ? "active" : ""}`}
                    onClick={() => setSelectedRemoteRepo(result.repo_id)}
                  >
                    <ModelIdentity label={result.label} repoId={result.repo_id} logoUrl={result.logo_url} />
                    <span>
                      <strong>{result.label}</strong>
                      <small>{result.blurb}</small>
                      <em>{result.author}</em>
                    </span>
                    <span className="model-search-stats">
                      <strong>{result.params}</strong>
                      <small>{result.gguf_count} files</small>
                    </span>
                  </button>
                ))}
                {!searchLoading && searchResults.length === 0 && <div className="model-studio-empty">No GGUF results yet.</div>}
              </div>

              <div className="model-library-details">
                {detailLoading && <div className="model-studio-empty">Loading repository details...</div>}
                {detailError && <div className="settings-alert error">{detailError}</div>}
                {remoteDetails && (
                  <>
                    <div className="model-remote-title">
                      <ModelIdentity label={remoteDetails.label} repoId={remoteDetails.repo_id} logoUrl={remoteDetails.logo_url} />
                      <div>
                        <h4>{remoteDetails.label}</h4>
                        <span>{remoteDetails.repo_id}</span>
                      </div>
                      <div className="model-library-title-meta">
                        <span>{formatCompactNumber(remoteDetails.downloads)} downloads</span>
                        <span>{formatCompactNumber(remoteDetails.likes)} likes</span>
                        {remoteDetails.license && <span>{remoteDetails.license}</span>}
                      </div>
                    </div>

                    <div className="model-library-file-grid">
                      {remoteDetails.gguf_files.map((file) => {
                        const isRecommended = file.filename.toLowerCase().includes("q4_k_m") || file.filename.toLowerCase().includes("iq4_nl") || file.filename.toLowerCase().includes("q4_0");
                        const shortName = file.filename.split(/[-.]/).filter(p => p.toLowerCase().includes('q') || p.toLowerCase().includes('fp') || p.toLowerCase().includes('bf')).pop() || file.filename.split('-').pop()?.replace('.gguf', '') || "GGUF";
                        return (
                          <button
                            key={file.filename}
                            type="button"
                            className={`model-file-card ${selectedRemoteFile === file.filename ? "active" : ""}`}
                            onClick={() => {
                              setSelectedRemoteFile(file.filename);
                              updateRemoteRuntime({ selected_gguf: file.filename });
                            }}
                            title={file.filename}
                          >
                            <div className="model-file-card-header">
                              <strong>{shortName}</strong>
                              {isRecommended && <span className="model-card-badge">Optimal</span>}
                            </div>
                            <div className="model-file-card-meta">
                              <span>{file.precision_label || "GGUF format"}</span>
                              <small>{formatBytes(file.size)}</small>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="model-library-runtime-card">
                      <strong>Optimal System Settings</strong>
                      <div className="model-library-runtime-meta">
                        <span title="Target Hardware Profile"><span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>computer</span> {remoteDetails.hardware_profile?.headline || "Detected device"}</span>
                        <span title="Context Length"><span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>memory</span> Context {remoteRuntime.context_length}</span>
                        <span title="GPU Layers"><span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>developer_board</span> GPU {remoteRuntime.gpu_layers_mode}</span>
                        <span title="KV Cache Quantization"><span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>speed</span> KV {remoteRuntime.k_cache_quantization_type}/{remoteRuntime.v_cache_quantization_type}</span>
                      </div>
                      <div className="model-studio-actions">
                        <button className="settings-secondary-btn" type="button" onClick={() => setRemoteRuntime(remoteDetails.runtime_recommendation)}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>restart_alt</span>
                          Reset
                        </button>
                        <button className="settings-primary-btn" style={{ padding: "0 20px" }} type="button" onClick={() => void handleDownloadRemote()} disabled={downloadBusy || !selectedRemoteFileDetails}>
                          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{downloadBusy ? "hourglass_empty" : remoteDetails.installed ? "refresh" : "download"}</span>
                          {downloadBusy ? "Starting download..." : remoteDetails.installed ? "Refresh install" : "Download GGUF"}
                        </button>
                      </div>
                    </div>

                    {downloadError && <div className="settings-alert error">{downloadError}</div>}

                    {remoteDetails.benchmarks.length > 0 && (
                      <div className="model-library-benchmarks">
                        <strong>Benchmarks</strong>
                        {remoteDetails.benchmarks.map((row) => (
                          <div key={`${row.label}-${row.display}`} className="model-library-benchmark-row">
                            <span>{row.label}</span>
                            <div className="model-library-benchmark-bar">
                              <span style={{ width: `${Math.min(100, Math.max(4, row.value))}%` }} />
                            </div>
                            <strong>{row.display}</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="model-library-readme">
                      <strong>README</strong>
                      <div className="model-library-readme-body">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            pre({ children }) {
                              const text = String(
                                React.Children.toArray(children)
                                  .map((child) => {
                                    if (React.isValidElement(child)) {
                                      const props = child.props as { children?: React.ReactNode };
                                      return React.Children.toArray(props.children).join("");
                                    }
                                    return child;
                                  })
                                  .join(""),
                              );
                              return (
                                <div className="model-readme-code-wrap">
                                  <button
                                    type="button"
                                    className="model-readme-copy"
                                    onClick={() => void navigator.clipboard?.writeText(text)}
                                  >
                                    Copy
                                  </button>
                                  <pre>{children}</pre>
                                </div>
                              );
                            },
                          }}
                        >
                          {renderableReadme(remoteDetails.readme) || "No README preview available."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

