import React, { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ModelTriggerBadge } from "./ModelTriggerBadge";
import { ModelQuickMenu } from "./ModelQuickMenu";
import type { ModelFloatingSwitcherProps, SwitcherModelStatus } from "./types";
import "./model-switcher.css";

export const ModelFloatingSwitcher: React.FC<ModelFloatingSwitcherProps> = ({
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  // Global Keyboard shortcut: Ctrl+Shift+M / Cmd+Shift+M to toggle, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Derive active model label and quant tag
  const { activeModelLabel, activeQuantTag, currentStatus } = useMemo(() => {
    const activeId =
      inferenceMode === "cloud"
        ? selectedCloudTierModel || selectedModel
        : modelLoadStatus?.active_model || selectedModel;

    const matchedEntry: SwitcherModelStatus | undefined = resolvedModels.find(
      (m) => m.id === activeId
    );

    const label =
      matchedEntry?.label ||
      activeId.replace(/^meera-/i, "Meera ").replace(/-/g, " ");

    const quant =
      inferenceMode === "cloud"
        ? "Cloud"
        : matchedEntry?.params || "GGUF";

    let status: "ready" | "loading" | "standby" | "error" | "cloud" = "standby";

    if (inferenceMode === "cloud") {
      status = "cloud";
    } else if (modelLoadStatus?.status === "loading") {
      status = "loading";
    } else if (modelLoadStatus?.status === "error") {
      status = "error";
    } else if (
      modelLoadStatus?.status === "ready" ||
      modelLoadStatus?.active_model
    ) {
      status = "ready";
    } else {
      status = "standby";
    }

    return {
      activeModelLabel: label,
      activeQuantTag: quant,
      currentStatus: status,
    };
  }, [
    inferenceMode,
    selectedModel,
    selectedCloudTierModel,
    modelLoadStatus,
    resolvedModels,
  ]);

  return (
    <div
      ref={dockRef}
      className="meera-model-switcher-dock"
      aria-label="Floating Model Switcher Dock"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 12px)",
              right: 0,
              zIndex: 90,
            }}
          >
            <ModelQuickMenu
              selectedModel={selectedModel}
              selectedCloudTierModel={selectedCloudTierModel}
              resolvedModels={resolvedModels}
              modelLoadStatus={modelLoadStatus}
              inferenceMode={inferenceMode}
              engineRunning={engineRunning}
              cloudAvailable={cloudAvailable}
              onSelectLocalModel={onSelectLocalModel}
              onSelectCloudModel={onSelectCloudModel}
              onToggleInferenceMode={onToggleInferenceMode}
              onUnloadModel={onUnloadModel}
              onReloadModel={onReloadModel}
              onOpenModelStudio={onOpenModelStudio}
              onOpenDownloadPrompt={onOpenDownloadPrompt}
              onClose={() => setIsOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ModelTriggerBadge
        activeModelName={activeModelLabel}
        quantTag={activeQuantTag}
        status={currentStatus}
        loadingProgress={modelLoadStatus?.progress}
        inferenceMode={inferenceMode}
        isOpen={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      />
    </div>
  );
};
