import React from "react";
import { PiCaretDown, PiCpuBold, PiCloudBold } from "react-icons/pi";

export interface ModelTriggerBadgeProps {
  activeModelName: string;
  quantTag?: string;
  status: "ready" | "loading" | "standby" | "error" | "cloud";
  loadingProgress?: number | null;
  inferenceMode: "local" | "cloud";
  isOpen: boolean;
  onClick: () => void;
}

export const ModelTriggerBadge: React.FC<ModelTriggerBadgeProps> = ({
  activeModelName,
  quantTag,
  status,
  loadingProgress,
  inferenceMode,
  isOpen,
  onClick,
}) => {
  const getBeaconStyle = () => {
    switch (status) {
      case "ready":
        return {
          background: "#10b981",
          boxShadow: "0 0 10px rgba(16, 185, 129, 0.75)",
        };
      case "loading":
        return {
          background: "#0284c7",
          boxShadow: "0 0 8px rgba(2, 132, 199, 0.8)",
        };
      case "cloud":
        return {
          background: "#8b5cf6",
          boxShadow: "0 0 10px rgba(139, 92, 246, 0.75)",
        };
      case "error":
        return {
          background: "#ef4444",
          boxShadow: "0 0 10px rgba(239, 68, 68, 0.8)",
        };
      case "standby":
      default:
        return {
          background: "#f59e0b",
          boxShadow: "0 0 8px rgba(245, 158, 11, 0.6)",
        };
    }
  };

  const displayText =
    status === "loading" && typeof loadingProgress === "number" && loadingProgress > 0
      ? `Loading ${Math.round(loadingProgress)}%`
      : activeModelName || (inferenceMode === "cloud" ? "Cloud Model" : "No Model");

  const badgeText =
    quantTag || (inferenceMode === "cloud" ? "Cloud" : "Local");

  return (
    <button
      type="button"
      className={`model-trigger-pill ${isOpen ? "active" : ""}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={`Model: ${activeModelName}. Status: ${status}. Click to change model.`}
      title="Click or press Ctrl+Shift+M to switch models"
    >
      <span className="model-trigger-beacon-wrapper" aria-hidden="true">
        {status === "loading" && <span className="model-trigger-spinner" />}
        <span className="model-trigger-beacon" style={getBeaconStyle()} />
      </span>

      <span className="model-trigger-text">
        <span className="model-trigger-name" title={activeModelName}>
          {displayText}
        </span>
        <span
          className={`model-trigger-badge ${
            inferenceMode === "cloud" ? "cloud" : "local"
          }`}
        >
          {inferenceMode === "cloud" ? (
            <PiCloudBold style={{ marginRight: 3, verticalAlign: "-1px" }} />
          ) : (
            <PiCpuBold style={{ marginRight: 3, verticalAlign: "-1px" }} />
          )}
          {badgeText}
        </span>
      </span>

      <span className="model-trigger-chevron" aria-hidden="true">
        <PiCaretDown />
      </span>
    </button>
  );
};
