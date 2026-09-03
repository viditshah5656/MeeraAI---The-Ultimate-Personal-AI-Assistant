/**
 * Model Management Hook
 * Manages model state and provides convenient functions
 */

import { useState, useEffect, useCallback } from "react";
import {
  ModelStatus,
  ModelConfig,
  getAllModelsStatus,
  addModel,
  editModel,
  removeModel,
  loadModel,
  unloadModel,
  reloadModelsConfig,
} from "../services/modelManager";

export function useModelManagement(token?: string) {
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);

  // Fetch all models status
  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllModelsStatus(token);
      setModels(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch models";
      setError(message);
      console.error("Error fetching models:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Add new model
  const handleAddModel = useCallback(
    async (model: ModelConfig) => {
      setError(null);
      try {
        const response = await addModel(model, token);
        if (response.ok) {
          await fetchModels();
          return { ok: true, message: "Model added successfully" };
        } else {
          throw new Error(response.message || "Failed to add model");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add model";
        setError(message);
        return { ok: false, message };
      }
    },
    [token, fetchModels]
  );

  // Edit model
  const handleEditModel = useCallback(
    async (modelId: string, updates: Partial<ModelConfig>) => {
      setError(null);
      try {
        const response = await editModel(modelId, updates, token);
        if (response.ok) {
          await fetchModels();
          return { ok: true, message: "Model updated successfully" };
        } else {
          throw new Error(response.message || "Failed to edit model");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to edit model";
        setError(message);
        return { ok: false, message };
      }
    },
    [token, fetchModels]
  );

  // Remove model
  const handleRemoveModel = useCallback(
    async (modelId: string) => {
      setError(null);
      try {
        const response = await removeModel(modelId, token);
        if (response.ok) {
          await fetchModels();
          return { ok: true, message: "Model removed successfully" };
        } else {
          throw new Error(response.message || "Failed to remove model");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove model";
        setError(message);
        return { ok: false, message };
      }
    },
    [token, fetchModels]
  );

  // Load model into memory
  const handleLoadModel = useCallback(
    async (modelId: string) => {
      setError(null);
      setLoadingModelId(modelId);
      try {
        const response = await loadModel(modelId, token);
        if (response.ok) {
          await fetchModels();
          return { ok: true, message: "Model loaded successfully" };
        } else {
          throw new Error(response.message || "Failed to load model");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load model";
        setError(message);
        return { ok: false, message };
      } finally {
        setLoadingModelId(null);
      }
    },
    [token, fetchModels]
  );

  // Unload model from memory
  const handleUnloadModel = useCallback(
    async (modelId?: string | null) => {
      setError(null);
      if (modelId) {
        setLoadingModelId(modelId);
      }
      try {
        const response = await unloadModel(modelId, token);
        if (response.ok) {
          await fetchModels();
          return { ok: true, message: "Model unloaded successfully" };
        } else {
          throw new Error(response.message || "Failed to unload model");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to unload model";
        setError(message);
        return { ok: false, message };
      } finally {
        setLoadingModelId(null);
      }
    },
    [token, fetchModels]
  );

  // Reload configuration
  const handleReloadConfig = useCallback(async () => {
    setError(null);
    try {
      const response = await reloadModelsConfig(token);
      if (response.ok) {
        await fetchModels();
        return { ok: true, message: "Configuration reloaded successfully" };
      } else {
        throw new Error(response.message || "Failed to reload configuration");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reload configuration";
      setError(message);
      return { ok: false, message };
    }
  }, [token, fetchModels]);

  return {
    models,
    loading,
    error,
    loadingModelId,
    fetchModels,
    addModel: handleAddModel,
    editModel: handleEditModel,
    removeModel: handleRemoveModel,
    loadModel: handleLoadModel,
    unloadModel: handleUnloadModel,
    reloadConfig: handleReloadConfig,
    clearError: () => setError(null),
  };
}
