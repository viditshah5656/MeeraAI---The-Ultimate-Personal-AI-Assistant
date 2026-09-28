export type MeeraModelTier = {
  id: string;
  name: string;
  model: string;
  params: string;
  quantization: string;
  repoId: string;
  purpose: string;
  description: string;
  capabilities: string[];
  accent: string;
};

export const CURATED_MEERA_MODELS: MeeraModelTier[] = [
  {
    id: "meera-nano",
    name: "Meera Nano",
    model: "Qwen3.5 0.8B",
    params: "0.8B",
    quantization: "IQ4_XS / GGUF",
    repoId: "unsloth/Qwen3.5-0.8B-GGUF",
    purpose: "Router and basic assistant",
    description: "A tiny local tier for routing and fast basic assistance.",
    capabilities: ["Fast", "Low memory", "Fallback"],
    accent: "#14b8a6",
  },
  {
    id: "meera-mini",
    name: "Meera Mini",
    model: "Qwen3.5 2B",
    params: "2B",
    quantization: "IQ4_XS / GGUF",
    repoId: "unsloth/Qwen3.5-2B-GGUF",
    purpose: "Fast general assistant",
    description: "A quick general-purpose local assistant.",
    capabilities: ["Everyday", "Coding", "Structured"],
    accent: "#22c55e",
  },
  {
    id: "meera-edge",
    name: "Meera Edge",
    model: "Ministral 3 3B",
    params: "3B",
    quantization: "IQ4_XS / GGUF",
    repoId: "bartowski/Ministral-3-3B-Instruct-2512-GGUF",
    purpose: "Strong local agent",
    description: "A compact agent model for documents and tool use.",
    capabilities: ["Agents", "Documents", "Tools"],
    accent: "#3b82f6",
  },
  {
    id: "meera",
    name: "Meera Pro",
    model: "Qwen3.5 4B",
    params: "4B",
    quantization: "IQ4_XS / GGUF",
    repoId: "unsloth/Qwen3.5-4B-GGUF",
    purpose: "Best overall 4GB model",
    description: "The recommended balance of quality and VRAM usage.",
    capabilities: ["Recommended", "Research", "Tool calling"],
    accent: "#6366f1",
  },
  {
    id: "meera-vision",
    name: "Meera Max",
    model: "Gemma 4 E4B",
    params: "4B",
    quantization: "IQ3_M / IQ2_M / GGUF",
    repoId: "unsloth/gemma-4-E4B-it-GGUF",
    purpose: "Multimodal specialist",
    description: "A multimodal local tier for images and visual documents.",
    capabilities: ["Vision", "Images", "Multimodal"],
    accent: "#ec4899",
  },
  {
    id: "meera-deep",
    name: "Meera Deep",
    model: "Ministral 3 8B Reasoning",
    params: "8B",
    quantization: "IQ3_M / GGUF",
    repoId: "bartowski/Ministral-3-8B-Reasoning-2512-GGUF",
    purpose: "Deep reasoning and coding",
    description: "A reasoning-focused tier for difficult coding and planning.",
    capabilities: ["Reasoning", "Debugging", "Planning"],
    accent: "#f59e0b",
  },
  {
    id: "meera-ultra",
    name: "Meera Ultra",
    model: "Qwen3.5 9B",
    params: "9B",
    quantization: "IQ3_M / GGUF",
    repoId: "unsloth/Qwen3.5-9B-GGUF",
    purpose: "Maximum small-model intelligence",
    description: "The strongest compact tier for local reasoning and coding.",
    capabilities: ["Highest quality", "Long context", "Orchestration"],
    accent: "#8b5cf6",
  },
];

export const getCuratedModel = (id: string) =>
  CURATED_MEERA_MODELS.find((model) => model.id === id);

export const curatedModelMatches = (model: { id?: string; label?: string; repo_id?: string | null; folder?: string }) => {
  const values = [model.id, model.label, model.repo_id, model.folder]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return [...CURATED_MEERA_MODELS]
    .sort((a, b) => Math.max(b.id.length, b.name.length) - Math.max(a.id.length, a.name.length))
    .find((tier) => {
      const needles = [tier.id, tier.repoId, tier.model, tier.name]
        .map((value) => value.toLowerCase());
      return values.some((value) => needles.some((needle) => value === needle || value.includes(needle)));
    });
};
