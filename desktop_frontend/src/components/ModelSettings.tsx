/**
 * Model Settings Component
 * Provides UI for managing GGUF models - add, edit, remove, load, unload
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useModelManagement } from "../hooks/useModelManagement";
import { ModelConfig, ModelStatus } from "../services/modelManager";
import { estimateModel } from "../services/modelManager";
import "../styles.css";

interface ModelSettingsProps {
  authToken?: string;
  onClose?: () => void;
}

export function ModelSettings({ authToken, onClose }: ModelSettingsProps) {
  const {
    models,
    loading,
    error: hookError,
    loadingModelId,
    addModel,
    editModel,
    removeModel,
    loadModel,
    unloadModel,
    reloadConfig,
    clearError,
  } = useModelManagement(authToken);

  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [estimateLoadingModelId, setEstimateLoadingModelId] = useState<string | null>(null);
  const [modelEstimateResults, setModelEstimateResults] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState<Partial<ModelConfig>>({
    model_type: "causal",
    quant_bits: 4,
    enabled: true,
    chat_capable: true,
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id || !formData.label || !formData.repo_id) {
      setError("Please fill in all required fields");
      return;
    }

    const result = await addModel(formData as ModelConfig);
    if (result.ok) {
      setSuccessMessage("Model added successfully!");
      setShowAddForm(false);
      setFormData({
        model_type: "causal",
        quant_bits: 4,
        enabled: true,
        chat_capable: true,
      });
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(result.message || "Failed to add model");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModelId) return;

    const result = await editModel(editingModelId, formData);
    if (result.ok) {
      setSuccessMessage("Model updated successfully!");
      setEditingModelId(null);
      setFormData({
        model_type: "causal",
        quant_bits: 4,
        enabled: true,
        chat_capable: true,
      });
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(result.message || "Failed to update model");
    }
  };

  const handleRemove = async (modelId: string) => {
    if (!window.confirm(`Remove model "${modelId}"? This action can be undone.`)) return;

    const result = await removeModel(modelId);
    if (result.ok) {
      setSuccessMessage("Model removed successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(result.message || "Failed to remove model");
    }
  };

  const handleLoadToggle = async (model: ModelStatus) => {
    if (model.loaded) {
      const result = await unloadModel(model.id);
      if (!result.ok) {
        setError(result.message || "Failed to unload model");
      }
    } else {
      const result = await loadModel(model.id);
      if (!result.ok) {
        setError(result.message || "Failed to load model");
      }
    }
  };

  const handleEstimateModel = async (model: ModelStatus) => {
    setEstimateLoadingModelId(model.id);
    try {
      const response = await estimateModel(model.id, (model as any).context_length || 2048, model.quant_bits ?? undefined);
      setModelEstimateResults((prev) => ({
        ...prev,
        [model.id]: response,
      }));
    } catch (error) {
      console.error("Model estimate failed", error);
      setError("Failed to estimate model memory. See browser console for details.");
    } finally {
      setEstimateLoadingModelId(null);
    }
  };

  const handleEdit = (model: ModelStatus) => {
    setFormData(model as Partial<ModelConfig>);
    setEditingModelId(model.id);
    setShowAddForm(false);
  };

  return (
    <motion.div
      className="model-settings-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "linear-gradient(180deg, rgba(8, 14, 26, 0.98), rgba(4, 10, 18, 0.95))",
        backdropFilter: "blur(40px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1.5rem",
          borderBottom: "1px solid rgba(72, 187, 255, 0.15)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(180deg, rgba(12, 22, 40, 0.95), rgba(8, 16, 30, 0.85))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "linear-gradient(145deg, rgba(72, 187, 255, 0.2), rgba(102, 187, 106, 0.1))",
            border: "1px solid rgba(72, 187, 255, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.4rem",
            fontWeight: "700",
            color: "#48bbff",
            boxShadow: "0 0 20px rgba(72, 187, 255, 0.2)",
          }}>
            ⚙
          </div>
          <div>
            <h2 style={{ margin: 0, color: "#d7e7ff", fontFamily: "var(--font-primary)", fontSize: "1.4rem", fontWeight: "700" }}>
              Model Management
            </h2>
            <p style={{ margin: "0.2rem 0 0", color: "#a0c7ff", fontSize: "0.85rem" }}>
              Configure and manage your GGUF models
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "1px solid rgba(215, 231, 255, 0.3)",
            color: "#d7e7ff",
            cursor: "pointer",
            padding: "0.6rem 1.2rem",
            borderRadius: "8px",
            fontFamily: "var(--font-primary)",
            fontSize: "0.9rem",
            transition: "all 0.2s",
            fontWeight: "600",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(215, 231, 255, 0.1)";
            e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.3)";
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
        {/* Messages */}
        {(error || hookError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              background: "rgba(255, 71, 87, 0.15)",
              border: "1px solid #ff4757",
              color: "#ff6b7a",
              padding: "1rem",
              borderRadius: "12px",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "var(--font-primary)",
            }}
          >
            {error || hookError}
            <button
              onClick={() => {
                setError(null);
                clearError();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#ff6b7a",
                cursor: "pointer",
                fontSize: "1.2rem",
              }}
            >
              ✕
            </button>
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: "rgba(76, 175, 80, 0.15)",
              border: "1px solid #4caf50",
              color: "#66bb6a",
              padding: "1rem",
              borderRadius: "12px",
              marginBottom: "1rem",
              fontFamily: "var(--font-primary)",
            }}
          >
            ✓ {successMessage}
          </motion.div>
        )}

        {/* Add/Edit Form */}
        {(showAddForm || editingModelId) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "rgba(12, 26, 47, 0.6)",
              border: "1px solid rgba(215, 231, 255, 0.2)",
              borderRadius: "16px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#d7e7ff", marginBottom: "1rem" }}>
              {editingModelId ? "Edit Model" : "Add New Model"}
            </h3>

            <form
              onSubmit={editingModelId ? handleEditSubmit : handleAddSubmit}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              {/* Required Fields */}
              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Model ID *
                </label>
                <input
                  type="text"
                  value={formData.id || ""}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  disabled={!!editingModelId}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., my-model"
                />
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Label *
                </label>
                <input
                  type="text"
                  value={formData.label || ""}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., My Custom Model"
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Repository ID *
                </label>
                <input
                  type="text"
                  value={formData.repo_id || ""}
                  onChange={(e) => setFormData({ ...formData, repo_id: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., owner/model-name-GGUF"
                />
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Folder Name *
                </label>
                <input
                  type="text"
                  value={formData.folder_name || ""}
                  onChange={(e) => setFormData({ ...formData, folder_name: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., My Model"
                />
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Model Type
                </label>
                <select
                  value={formData.model_type || "causal"}
                  onChange={(e) => setFormData({ ...formData, model_type: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="causal">Causal</option>
                  <option value="seq2seq">Seq2Seq</option>
                  <option value="conditional">Conditional</option>
                </select>
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Quantization Bits
                </label>
                <select
                  value={formData.quant_bits || 4}
                  onChange={(e) => setFormData({ ...formData, quant_bits: parseInt(e.target.value) || null })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="4">4-bit (Q4_K_M)</option>
                  <option value="8">8-bit (Q8_0)</option>
                  <option value="">Full Precision</option>
                </select>
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Parameters
                </label>
                <input
                  type="text"
                  value={formData.params || ""}
                  onChange={(e) => setFormData({ ...formData, params: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                  placeholder="e.g., 7B"
                />
              </div>

              <div>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Purpose
                </label>
                <select
                  value={formData.purpose || "chat"}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="chat">Chat</option>
                  <option value="coding">Coding</option>
                  <option value="math">Math</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ color: "#d7e7ff", fontSize: "0.9rem", display: "block", marginBottom: "0.5rem" }}>
                  Description
                </label>
                <textarea
                  value={formData.blurb || ""}
                  onChange={(e) => setFormData({ ...formData, blurb: e.target.value })}
                  style={{
                    width: "100%",
                    background: "rgba(8, 18, 33, 0.8)",
                    border: "1px solid rgba(215, 231, 255, 0.2)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box",
                    minHeight: "80px",
                    resize: "vertical",
                  }}
                  placeholder="Brief description of the model"
                />
              </div>

              {/* Form Actions */}
              <div style={{ gridColumn: "1 / -1", display: "flex", gap: "1rem", marginTop: "1rem" }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: "rgba(102, 187, 106, 0.8)",
                    border: "1px solid #66bb6a",
                    color: "#fff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontFamily: "var(--font-primary)",
                    fontWeight: "600",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(102, 187, 106, 1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(102, 187, 106, 0.8)";
                  }}
                >
                  {editingModelId ? "Update Model" : "Add Model"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingModelId(null);
                    setFormData({
                      model_type: "causal",
                      quant_bits: 4,
                      enabled: true,
                      chat_capable: true,
                    });
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid rgba(215, 231, 255, 0.3)",
                    color: "#d7e7ff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontFamily: "var(--font-primary)",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.6)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.3)";
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Models List */}
        <div style={{ display: "grid", gap: "1rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#d7e7ff" }}>
              Loading models...
            </div>
          ) : models.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#a0c7ff" }}>
              No models configured
            </div>
          ) : (
            models.map((model) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="model-card"
                style={{
                  background: "linear-gradient(135deg, rgba(12, 26, 47, 0.5), rgba(16, 35, 58, 0.3))",
                  border: `1px solid ${model.loaded ? "rgba(102, 187, 106, 0.5)" : "rgba(72, 187, 255, 0.2)"}`,
                  borderRadius: "14px",
                  padding: "1.2rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(16, 32, 54, 0.65), rgba(20, 40, 65, 0.45))";
                  e.currentTarget.style.borderColor = "rgba(102, 187, 106, 0.5)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(102, 187, 106, 0.15), 0 0 20px rgba(72, 187, 255, 0.1)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(12, 26, 47, 0.5), rgba(16, 35, 58, 0.3))";
                  e.currentTarget.style.borderColor = model.loaded
                    ? "rgba(102, 187, 106, 0.5)"
                    : "rgba(72, 187, 255, 0.2)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Model Icon */}
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(145deg, rgba(72, 187, 255, 0.15), rgba(102, 187, 106, 0.1))",
                  border: "1px solid rgba(72, 187, 255, 0.2)",
                  flexShrink: 0,
                  fontSize: "1.8rem",
                  marginRight: "0.5rem",
                }}>
                  🤖
                </div>

                {/* Model Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                    <span style={{ color: "#d7e7ff", fontWeight: "600", fontSize: "1rem" }}>
                      {model.label}
                    </span>
                    {model.loaded && (
                      <span
                        style={{
                          background: "rgba(102, 187, 106, 0.15)",
                          color: "#66bb6a",
                          padding: "0.3rem 0.7rem",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          border: "1px solid rgba(102, 187, 106, 0.3)",
                        }}
                      >
                        ✓ LOADED
                      </span>
                    )}
                    {!model.present && (
                      <span
                        style={{
                          background: "rgba(255, 152, 0, 0.15)",
                          color: "#ff9800",
                          padding: "0.3rem 0.7rem",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          border: "1px solid rgba(255, 152, 0, 0.3)",
                        }}
                      >
                        ⬇ NOT DOWNLOADED
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#a0c7ff", fontSize: "0.85rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {model.params && <span>{model.params}</span>}
                    <span>{model.model_type}</span>
                    <span>Q{model.quant_bits}-bit</span>
                    {model.purpose && <span>{model.purpose}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.8rem", marginLeft: "1rem", flexWrap: "wrap" }}>
                  {model.present && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleLoadToggle(model)}
                      disabled={loadingModelId === model.id}
                      style={{
                        background: model.loaded
                          ? "rgba(255, 71, 87, 0.1)"
                          : "rgba(102, 187, 106, 0.1)",
                        border: model.loaded ? "1px solid #ff4757" : "1px solid #66bb6a",
                        color: model.loaded ? "#ff6b7a" : "#66bb6a",
                        padding: "0.6rem 1.2rem",
                        borderRadius: "8px",
                        cursor: loadingModelId === model.id ? "default" : "pointer",
                        fontFamily: "var(--font-primary)",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        transition: "all 0.2s",
                        opacity: loadingModelId === model.id ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (loadingModelId !== model.id) {
                          e.currentTarget.style.background = model.loaded
                            ? "rgba(255, 71, 87, 0.2)"
                            : "rgba(102, 187, 106, 0.2)";
                          e.currentTarget.style.boxShadow = model.loaded
                            ? "0 0 12px rgba(255, 71, 87, 0.2)"
                            : "0 0 12px rgba(102, 187, 106, 0.2)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = model.loaded
                          ? "rgba(255, 71, 87, 0.1)"
                          : "rgba(102, 187, 106, 0.1)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {loadingModelId === model.id
                        ? "..."
                        : model.loaded
                          ? "✓ Unload"
                          : "Load"}
                    </motion.button>
                  )}

                  <button
                    onClick={() => handleEdit(model)}
                    style={{
                      background: "rgba(33, 150, 243, 0.1)",
                      border: "1px solid #2196f3",
                      color: "#42a5f5",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontFamily: "var(--font-primary)",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(33, 150, 243, 0.2)";
                      e.currentTarget.style.boxShadow = "0 0 12px rgba(33, 150, 243, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(33, 150, 243, 0.1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleEstimateModel(model)}
                    disabled={estimateLoadingModelId === model.id}
                    style={{
                      background: "rgba(255, 193, 7, 0.1)",
                      border: "1px solid #ffca28",
                      color: "#ffd54f",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "8px",
                      cursor: estimateLoadingModelId === model.id ? "default" : "pointer",
                      fontFamily: "var(--font-primary)",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      transition: "all 0.2s",
                      opacity: estimateLoadingModelId === model.id ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (estimateLoadingModelId !== model.id) {
                        e.currentTarget.style.background = "rgba(255, 193, 7, 0.2)";
                        e.currentTarget.style.boxShadow = "0 0 12px rgba(255, 193, 7, 0.2)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 193, 7, 0.1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {estimateLoadingModelId === model.id ? "Estimating..." : "Estimate"}
                  </button>

                  <button
                    onClick={() => handleRemove(model.id)}
                    style={{
                      background: "rgba(255, 71, 87, 0.1)",
                      border: "1px solid #ff4757",
                      color: "#ff6b7a",
                      padding: "0.6rem 1.2rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontFamily: "var(--font-primary)",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 71, 87, 0.2)";
                      e.currentTarget.style.boxShadow = "0 0 12px rgba(255, 71, 87, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 71, 87, 0.1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    Remove
                  </button>
                </div>
                {modelEstimateResults[model.id] && (
                  <div style={{ marginTop: "1rem", width: "100%", color: "#cbd5e1", fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
                      <span>VRAM: {modelEstimateResults[model.id].estimated_vram_bytes ? `${Math.round(modelEstimateResults[model.id].estimated_vram_bytes / (1024 * 1024))} MB` : "n/a"}</span>
                      <span>CPU: {modelEstimateResults[model.id].estimated_cpu_bytes ? `${Math.round(modelEstimateResults[model.id].estimated_cpu_bytes / (1024 * 1024))} MB` : "n/a"}</span>
                      <span>Fits on GPU: {modelEstimateResults[model.id].can_fit === true ? "Yes" : modelEstimateResults[model.id].can_fit === false ? "No" : "Unknown"}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "1.5rem",
          borderTop: "1px solid rgba(215, 231, 255, 0.15)",
          background: "rgba(8, 18, 33, 0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingModelId(null);
            setFormData({
              model_type: "causal",
              quant_bits: 4,
              enabled: true,
              chat_capable: true,
            });
          }}
          style={{
            background: "rgba(102, 187, 106, 0.15)",
            border: "1px solid #66bb6a",
            color: "#66bb6a",
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            cursor: "pointer",
            fontFamily: "var(--font-primary)",
            fontWeight: "600",
            fontSize: "0.95rem",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(102, 187, 106, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(102, 187, 106, 0.15)";
          }}
        >
          + Add Model
        </button>

        <button
          onClick={async () => {
            const result = await reloadConfig();
            if (result.ok) {
              setSuccessMessage("Configuration reloaded!");
              setTimeout(() => setSuccessMessage(null), 2000);
            } else {
              setError(result.message || "Failed to reload configuration");
            }
          }}
          style={{
            background: "transparent",
            border: "1px solid rgba(215, 231, 255, 0.3)",
            color: "#d7e7ff",
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            cursor: "pointer",
            fontFamily: "var(--font-primary)",
            fontSize: "0.95rem",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(215, 231, 255, 0.1)";
            e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(215, 231, 255, 0.3)";
          }}
        >
          ↻ Reload Config
        </button>
      </div>
    </motion.div>
  );
}
