/**
 * Model Status Indicator Component
 * Displays current model status and provides quick access to model settings
 */

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useModelManagement } from "../hooks/useModelManagement";

interface ModelStatusIndicatorProps {
  authToken?: string;
  onOpenSettings?: () => void;
}

export function ModelStatusIndicator({
  authToken,
  onOpenSettings,
}: ModelStatusIndicatorProps) {
  const { models } = useModelManagement(authToken);
  const loadedModel = useMemo(() => models.find((model) => model.loaded) ?? null, [models]);
  const loadedModelLabel = loadedModel?.label ?? null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        background: "rgba(8, 18, 33, 0.6)",
        border: "1px solid rgba(102, 187, 106, 0.3)",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(8, 18, 33, 0.8)";
        e.currentTarget.style.borderColor = "rgba(102, 187, 106, 0.6)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(8, 18, 33, 0.6)";
        e.currentTarget.style.borderColor = "rgba(102, 187, 106, 0.3)";
      }}
      role="button"
      tabIndex={0}
      aria-label={loadedModelLabel ? `Loaded model: ${loadedModelLabel}. Open model settings` : "No model loaded. Open model settings"}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onOpenSettings) {
          event.preventDefault();
          onOpenSettings();
        }
      }}
      onClick={onOpenSettings}
    >
      {/* Status Indicator */}
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: loadedModelLabel ? "#66bb6a" : "#ffc107",
          boxShadow: loadedModelLabel
            ? "0 0 8px rgba(102, 187, 106, 0.6)"
            : "0 0 8px rgba(255, 193, 7, 0.6)",
        }}
      />

      {/* Text */}
      <span
        style={{
          color: "#d7e7ff",
          fontSize: "0.85rem",
          fontFamily: "var(--font-primary)",
          whiteSpace: "nowrap",
        }}
      >
        {loadedModelLabel ? `🤖 ${loadedModelLabel}` : "No local model loaded"}
      </span>

      {/* Icon */}
      <span style={{ color: "#a0c7ff", marginLeft: "auto" }}>⚙</span>
    </motion.div>
  );
}

export { ModelFloatingSwitcher } from "./model-switcher";
