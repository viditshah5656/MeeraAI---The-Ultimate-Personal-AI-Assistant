import React, { useEffect, useState } from "react";
import { getAllModelsStatus } from "../services/modelManager";
import { estimateModel } from "../services/modelManager";

interface EstimateResult {
  ok: boolean;
  model_id?: string;
  estimated_vram_bytes?: number | null;
  estimated_cpu_bytes?: number | null;
  kv_cache_bytes?: number | null;
  overhead_bytes?: number | null;
  can_fit?: boolean | null;
  message?: string;
}

export default function MemoryEstimator() {
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [contextLength, setContextLength] = useState<number>(2048);
  const [quantBits, setQuantBits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await getAllModelsStatus();
        setModels(list || []);
        if (list && list.length > 0) setModelId(list[0].id);
      } catch (e) {
        console.error("Failed to load models for estimator", e);
      }
    })();
  }, []);

  async function doEstimate() {
    if (!modelId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await estimateModel(modelId, contextLength, quantBits ?? undefined);
      setResult(res as EstimateResult);
    } catch (e) {
      console.error(e);
      setResult({ ok: false, message: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="memory-estimator-card">
      <h3>Memory Estimator</h3>
      <div className="memory-estimator-row">
        <label>Model</label>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      </div>

      <div className="memory-estimator-row">
        <label>Context Length</label>
        <input
          type="number"
          min={1}
          step={1}
          value={contextLength}
          onChange={(e) => setContextLength(parseInt(e.target.value || "0", 10))}
        />
      </div>

      <div className="memory-estimator-row">
        <label>Quantization</label>
        <select
          value={quantBits === null ? "auto" : String(quantBits)}
          onChange={(e) => setQuantBits(e.target.value === "auto" ? null : parseInt(e.target.value))}
        >
          <option value="auto">Auto (use model default)</option>
          <option value="4">Q4</option>
          <option value="0">No quant (fp16/fp32)</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={doEstimate} disabled={loading || !modelId}>
          {loading ? "Estimating…" : "Estimate"}
        </button>
      </div>

      {result && (
        <div className="memory-estimator-result">
          <h4>Result</h4>
          {result.ok ? (
            <div>
              <div>Estimated VRAM: {result.estimated_vram_bytes ? `${Math.round(result.estimated_vram_bytes / (1024 * 1024))} MB` : "n/a"}</div>
              <div>Estimated CPU: {result.estimated_cpu_bytes ? `${Math.round(result.estimated_cpu_bytes / (1024 * 1024))} MB` : "n/a"}</div>
              <div>KV Cache: {result.kv_cache_bytes ? `${Math.round(result.kv_cache_bytes / (1024 * 1024))} MB` : "n/a"}</div>
              <div>Overhead: {result.overhead_bytes ? `${Math.round(result.overhead_bytes / (1024 * 1024))} MB` : "n/a"}</div>
              <div>Fits on GPU: {result.can_fit ? "Yes" : "No / Unknown"}</div>
            </div>
          ) : (
            <div className="error">{result.message || "Estimation failed"}</div>
          )}
        </div>
      )}
    </div>
  );
}
