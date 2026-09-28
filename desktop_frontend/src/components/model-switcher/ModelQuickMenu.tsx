import React, { useState, useMemo } from "react";
import {
  PiBrain,
  PiX,
  PiCpuBold,
  PiCloudBold,
  PiCheck,
  PiArrowsClockwiseBold,
  PiTrash,
  PiArrowSquareOutBold,
  PiDownloadSimpleBold,
  PiMagnifyingGlass,
} from "react-icons/pi";
import type {
  SwitcherModelStatus,
  SwitcherModelLoadStatus,
} from "./types";

export interface ModelQuickMenuProps {
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
  onClose: () => void;
}

export const ModelQuickMenu: React.FC<ModelQuickMenuProps> = ({
  selectedModel,
  selectedCloudTierModel,
  resolvedModels,
  modelLoadStatus,
  inferenceMode,
  engineRunning = true,
  cloudAvailable = false,
  onSelectLocalModel,
  onSelectCloudModel,
  onToggleInferenceMode,
  onUnloadModel,
  onReloadModel,
  onOpenModelStudio,
  onOpenDownloadPrompt,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Determine active model details
  const activeModel = useMemo(() => {
    if (inferenceMode === "cloud") {
      const cloudId = selectedCloudTierModel || selectedModel;
      return (
        resolvedModels.find((m) => m.id === cloudId) || {
          id: cloudId,
          label: cloudId.replace(/^meera-/i, "Meera ").replace(/-/g, " "),
          params: "Cloud",
          present: true,
          blurb: "Hugging Face Cloud Inference",
        }
      );
    }
    const currentId = modelLoadStatus?.active_model || selectedModel;
    return (
      resolvedModels.find((m) => m.id === currentId) || {
        id: currentId,
        label: currentId.replace(/^meera-/i, "Meera ").replace(/-/g, " "),
        params: "Local",
        present: false,
        blurb: "Local Inference Engine",
      }
    );
  }, [inferenceMode, selectedModel, selectedCloudTierModel, modelLoadStatus, resolvedModels]);

  // Filter models based on search and current inference mode
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return resolvedModels.filter((m) => {
      if (m.chat_capable === false) return false;
      if (!query) return true;
      return (
        m.label.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (m.params && m.params.toLowerCase().includes(query)) ||
        (m.blurb && m.blurb.toLowerCase().includes(query))
      );
    });
  }, [resolvedModels, searchQuery]);

  const installedModels = useMemo(
    () => filteredModels.filter((m) => m.present && m.model_type !== "cloud"),
    [filteredModels]
  );

  const availableDownloads = useMemo(
    () => filteredModels.filter((m) => !m.present && m.model_type !== "cloud"),
    [filteredModels]
  );

  const cloudModels = useMemo(
    () => filteredModels.filter((m) => m.model_type === "cloud" || m.folder?.startsWith("cloud/")),
    [filteredModels]
  );

  const isModelLoaded =
    Boolean(modelLoadStatus?.active_model) ||
    modelLoadStatus?.status === "ready";

  const isModelLoading = modelLoadStatus?.status === "loading";

  return (
    <div
      className="model-quick-menu-card"
      role="dialog"
      aria-label="Model switcher and inference controls"
    >
      {/* Header */}
      <div className="quick-menu-header">
        <div className="quick-menu-title-row">
          <span className="quick-menu-icon" aria-hidden="true">
            <PiBrain />
          </span>
          <span className="quick-menu-title">Switch Model</span>
          <span className="quick-menu-kbd">Ctrl+Shift+M</span>
        </div>
        <button
          type="button"
          className="quick-menu-close-btn"
          onClick={onClose}
          aria-label="Close model switcher"
          title="Close (Esc)"
        >
          <PiX />
        </button>
      </div>

      {/* Mode Switcher Segmented Control */}
      <div className="quick-menu-mode-bar">
        <button
          type="button"
          className={`quick-mode-btn ${inferenceMode === "local" ? "active" : ""}`}
          onClick={() => onToggleInferenceMode?.("local")}
        >
          <PiCpuBold />
          <span>Local Engine</span>
        </button>
        <button
          type="button"
          className={`quick-mode-btn ${inferenceMode === "cloud" ? "active" : ""}`}
          onClick={() => onToggleInferenceMode?.("cloud")}
          disabled={!cloudAvailable}
          title={
            !cloudAvailable
              ? "Cloud inference requires a Hugging Face token in Settings"
              : "Switch to Hugging Face Cloud inference"
          }
        >
          <PiCloudBold />
          <span>HF Cloud Tier</span>
        </button>
      </div>

      {/* Active Model Summary Card */}
      <div className="quick-menu-active-card">
        <div className="active-card-top">
          <span
            className="active-card-pill"
            style={
              inferenceMode === "cloud"
                ? { background: "rgba(124, 58, 237, 0.14)", color: "#7c3aed" }
                : isModelLoading
                ? { background: "rgba(2, 132, 199, 0.14)", color: "#0284c7" }
                : undefined
            }
          >
            {inferenceMode === "cloud"
              ? "Cloud Active"
              : isModelLoading
              ? `Loading ${modelLoadStatus?.progress ? Math.round(modelLoadStatus.progress) + "%" : "..."}`
              : isModelLoaded
              ? "Ready in VRAM"
              : "Standby"}
          </span>
          <span className="active-card-label" title={activeModel.label}>
            {activeModel.label}
          </span>
          {activeModel.params && (
            <span className="active-card-params">{activeModel.params}</span>
          )}
        </div>

        <div className="active-card-meta">
          {inferenceMode === "cloud"
            ? "Remote Hugging Face inference active. Zero local VRAM usage."
            : isModelLoading
            ? modelLoadStatus?.stage || "Loading weights into memory..."
            : isModelLoaded
            ? "Local GGUF model loaded and ready for instantaneous responses."
            : engineRunning
            ? "Model ready on disk. Click to load into active memory."
            : "Engine offline. Starting query will initialize backend."}
        </div>

        {inferenceMode === "local" && (isModelLoaded || isModelLoading) && (
          <div className="active-card-actions">
            {onUnloadModel && (
              <button
                type="button"
                className="active-card-btn unload"
                onClick={() => void onUnloadModel(activeModel.id)}
                disabled={isModelLoading}
                title="Unload model weights from RAM / VRAM to free GPU memory"
              >
                <PiTrash style={{ marginRight: 4, verticalAlign: "-1px" }} />
                Unload VRAM
              </button>
            )}
            {onReloadModel && (
              <button
                type="button"
                className="active-card-btn reload"
                onClick={() => onReloadModel(activeModel.id)}
                disabled={isModelLoading}
                title="Reload model into engine"
              >
                <PiArrowsClockwiseBold style={{ marginRight: 4, verticalAlign: "-1px" }} />
                Reload
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="quick-menu-search-box">
        <PiMagnifyingGlass style={{ color: "#94a3b8", fontSize: 14 }} />
        <input
          type="text"
          placeholder="Filter models or tiers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus={false}
        />
        {searchQuery && (
          <button
            type="button"
            className="clear-search"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Model Selection List */}
      <div className="quick-menu-list">
        {inferenceMode === "cloud" ? (
          // Cloud Inference List
          <>
            <div className="quick-menu-section-title">Hugging Face Cloud Models</div>
            {cloudModels.length > 0 ? (
              cloudModels.map((model) => {
                const isSelected =
                  (selectedCloudTierModel || selectedModel) === model.id;
                return (
                  <button
                    key={`cloud-${model.id}`}
                    type="button"
                    className={`quick-model-row ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (onSelectCloudModel) onSelectCloudModel(model.id);
                      else onSelectLocalModel(model.id);
                      onClose();
                    }}
                  >
                    <div className="quick-model-info">
                      <div className="quick-model-name">
                        {isSelected ? (
                          <PiCheck className="quick-check" />
                        ) : (
                          <span
                            className="quick-tier-dot"
                            style={{ background: "#8b5cf6" }}
                          />
                        )}
                        <span>{model.label}</span>
                        {model.params && (
                          <span className="quick-tier-size">{model.params}</span>
                        )}
                      </div>
                      {model.blurb && (
                        <div className="quick-model-desc">{model.blurb}</div>
                      )}
                    </div>
                    <span className="quick-tag">Cloud</span>
                  </button>
                );
              })
            ) : (
              // If no cloud-specific models are listed, display the chat tiers available for cloud routing
              resolvedModels.map((model) => {
                const isSelected =
                  (selectedCloudTierModel || selectedModel) === model.id;
                return (
                  <button
                    key={`cloud-tier-${model.id}`}
                    type="button"
                    className={`quick-model-row ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (onSelectCloudModel) onSelectCloudModel(model.id);
                      else onSelectLocalModel(model.id);
                      onClose();
                    }}
                  >
                    <div className="quick-model-info">
                      <div className="quick-model-name">
                        {isSelected ? (
                          <PiCheck className="quick-check" />
                        ) : (
                          <span
                            className="quick-tier-dot"
                            style={{ background: "#8b5cf6" }}
                          />
                        )}
                        <span>{model.label}</span>
                        {model.params && (
                          <span className="quick-tier-size">{model.params}</span>
                        )}
                      </div>
                      {model.blurb && (
                        <div className="quick-model-desc">{model.blurb}</div>
                      )}
                    </div>
                    <span className="quick-tag">HF Tier</span>
                  </button>
                );
              })
            )}
          </>
        ) : (
          // Local Inference List
          <>
            {/* Installed Models */}
            <div className="quick-menu-section-title">Installed On Device</div>
            {installedModels.length > 0 ? (
              installedModels.map((model) => {
                const isSelected = selectedModel === model.id;
                const isCurrentlyActive =
                  modelLoadStatus?.active_model === model.id;
                return (
                  <button
                    key={`inst-${model.id}`}
                    type="button"
                    className={`quick-model-row ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      onSelectLocalModel(model.id);
                      onClose();
                    }}
                  >
                    <div className="quick-model-info">
                      <div className="quick-model-name">
                        {isSelected ? (
                          <PiCheck className="quick-check" />
                        ) : (
                          <span
                            className="quick-tier-dot"
                            style={{
                              background: isCurrentlyActive ? "#10b981" : "#94a3b8",
                            }}
                          />
                        )}
                        <span>{model.label}</span>
                        {model.params && (
                          <span className="quick-tier-size">{model.params}</span>
                        )}
                      </div>
                      {model.blurb && (
                        <div className="quick-model-desc">{model.blurb}</div>
                      )}
                    </div>
                    <span className="quick-tag">
                      {isCurrentlyActive ? "Loaded" : "GGUF"}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="quick-menu-empty">No installed local models found</div>
            )}

            {/* Available Curated Meera Tiers to Download */}
            {availableDownloads.length > 0 && (
              <>
                <div className="quick-menu-section-title">Available Meera Tiers</div>
                {availableDownloads.map((model) => {
                  const isDownloading =
                    model.download &&
                    ["queued", "downloading", "paused", "verifying"].includes(
                      model.download.status
                    );
                  return (
                    <div
                      key={`dl-${model.id}`}
                      className="quick-model-row"
                      style={{ cursor: "default" }}
                    >
                      <div className="quick-model-info">
                        <div className="quick-model-name">
                          <span
                            className="quick-tier-dot"
                            style={{ background: "#cbd5e1" }}
                          />
                          <span>{model.label}</span>
                          {model.params && (
                            <span className="quick-tier-size">{model.params}</span>
                          )}
                        </div>
                        {model.blurb && (
                          <div className="quick-model-desc">{model.blurb}</div>
                        )}
                      </div>
                      {isDownloading ? (
                        <span className="quick-tag" style={{ color: "#0284c7" }}>
                          {model.download?.progress
                            ? `${Math.round(model.download.progress)}%`
                            : "Downloading..."}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="quick-dl-btn"
                          onClick={() => {
                            if (onOpenDownloadPrompt) {
                              onOpenDownloadPrompt(model.id);
                            } else {
                              onSelectLocalModel(model.id);
                            }
                            onClose();
                          }}
                        >
                          <PiDownloadSimpleBold style={{ marginRight: 4 }} />
                          Download
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer link to Model Studio */}
      <div className="quick-menu-footer">
        <button
          type="button"
          className="quick-studio-link"
          onClick={() => {
            onClose();
            onOpenModelStudio?.();
          }}
        >
          <span>Open Full Model Studio</span>
          <PiArrowSquareOutBold />
        </button>
      </div>
    </div>
  );
};
