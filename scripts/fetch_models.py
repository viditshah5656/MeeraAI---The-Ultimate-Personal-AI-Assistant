#!/usr/bin/env python3
"""
Model discovery and specification fetcher for MeeraAI.
Queries local and cloud provider endpoints (Ollama, HuggingFace Hub, OpenAI, Anthropic)
to update local model catalog specifications.
"""

import json
import os
import urllib.request
from pathlib import Path

def fetch_ollama_models(base_url="http://localhost:11434"):
    try:
        req = urllib.request.Request(f"{base_url}/api/tags", headers={"User-Agent": "MeeraAI/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return [model["name"] for model in data.get("models", [])]
    except Exception as e:
        print(f"[Ollama] Discovery failed or offline: {e}")
    return []

def sync_models():
    local_models = fetch_ollama_models()
    print(f"[Discovery] Found local Ollama models: {local_models}")
    return {"ollama_discovered": local_models}

if __name__ == "__main__":
    sync_models()
