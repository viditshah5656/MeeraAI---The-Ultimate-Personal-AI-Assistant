/**
 * Model Management Service
 * Handles all API calls for GGUF model management
 */

export interface ModelConfig {
  id: string;
  label: string;
  params?: string;
  repo_id: string;
  folder_name: string;
  model_type: string;
  quant_bits?: number | null;
  blurb?: string;
  precision_label?: string;
  requires_auth?: boolean;
  purpose?: string;
  chat_capable?: boolean;
  enabled?: boolean;
  context_length?: number;
  gguf_filename_pattern?: string;
}

export interface ModelStatus {
  id: string;
  label: string;
  present: boolean;
  loaded: boolean;
  model_type: string;
  params?: string;
  quant_bits?: number;
  purpose?: string;
  folder?: string;
}

export interface ModelResponse {
  ok: boolean;
  message?: string;
  model_id?: string;
  status?: ModelStatus;
  models?: ModelStatus[];
  count?: number;
  error?: string;
}

const API_BASE_URL = "http://localhost:8000/api";

/**
 * Get all models and their status
 */
export async function getAllModelsStatus(token?: string): Promise<ModelStatus[]> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/status/all`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: ModelResponse = await response.json();
    return data.models || [];
  } catch (error) {
    console.error("Failed to get models status:", error);
    throw error;
  }
}

/**
 * Get single model status
 */
export async function getModelStatus(
  modelId: string,
  token?: string
): Promise<ModelStatus | null> {
  try {
    const models = await getAllModelsStatus(token);
    return models.find((m) => m.id === modelId) || null;
  } catch (error) {
    console.error(`Failed to get status for ${modelId}:`, error);
    throw error;
  }
}

/**
 * Add a new model to configuration
 */
export async function addModel(
  model: ModelConfig,
  token?: string
): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/settings/add`, {
      method: "POST",
      headers,
      body: JSON.stringify(model),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to add model:", error);
    throw error;
  }
}

/**
 * Edit existing model configuration
 */
export async function editModel(
  modelId: string,
  updates: Partial<ModelConfig>,
  token?: string
): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/settings/edit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: modelId, ...updates }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to edit model:", error);
    throw error;
  }
}

/**
 * Delete a model and its local GGUF files.
 */
export async function removeModel(
  modelId: string,
  token?: string
): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/delete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model_id: modelId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to remove model:", error);
    throw error;
  }
}

/**
 * Load model into GPU/CPU memory
 */
export async function loadModel(
  modelId: string,
  token?: string
): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/load/memory`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model_id: modelId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to load model:", error);
    throw error;
  }
}

/**
 * Unload model from memory
 */
export async function unloadModel(
  modelId?: string | null,
  token?: string
): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/unload/memory`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model_id: modelId || null }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to unload model:", error);
    throw error;
  }
}

/**
 * Reload model configuration from file
 */
export async function reloadModelsConfig(token?: string): Promise<ModelResponse> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/models/settings/reload`, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to reload models config:", error);
    throw error;
  }
}

/**
 * Estimate model memory requirements using backend heuristic endpoint
 */
export async function estimateModel(
  modelId: string,
  contextLength = 2048,
  quantBits?: number,
  runtimeSettings?: Partial<RuntimeSettings>
): Promise<any> {
  try {
    const qs = new URLSearchParams();
    qs.set("model_id", modelId);
    qs.set("context_length", String(contextLength));
    if (typeof quantBits !== "undefined") qs.set("quant_bits", String(quantBits));
    if (runtimeSettings) {
      const entries: Array<[keyof RuntimeSettings, string | number | boolean | null | undefined]> = [
        ["evaluation_batch_size", runtimeSettings.evaluation_batch_size],
        ["physical_batch_size", runtimeSettings.physical_batch_size],
        ["max_concurrent_predictions", runtimeSettings.max_concurrent_predictions],
        ["gpu_layers_mode", runtimeSettings.gpu_layers_mode],
        ["gpu_layers", runtimeSettings.gpu_layers],
        ["k_cache_quantization_type", runtimeSettings.k_cache_quantization_type],
        ["v_cache_quantization_type", runtimeSettings.v_cache_quantization_type],
        ["offload_kv_cache", runtimeSettings.offload_kv_cache],
      ];
      for (const [key, value] of entries) {
        if (typeof value === "undefined" || value === null || value === "") continue;
        qs.set(String(key), String(value));
      }
    }

    const response = await fetch(`${API_BASE_URL}/models/estimate?${qs.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error("estimateModel failed:", err);
    throw err;
  }
}
import type { RuntimeSettings } from "./modelLibrary";
