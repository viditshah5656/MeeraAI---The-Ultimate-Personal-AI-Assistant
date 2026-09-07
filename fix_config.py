import json
import os
import sys
from pathlib import Path

def get_config_path() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "MeeraAI" / "data" / "config.json"

config_path = get_config_path()

def fix_config():
    if not config_path.exists():
        print(f"Config file not found at: {config_path}")
        return False
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Ensure cloud providers configuration
        if "cloud_providers" not in data:
            data["cloud_providers"] = {}
            
        providers = {
            "openai": {"enabled": True, "api_key_env": "OPENAI_API_KEY", "base_url": "https://api.openai.com/v1"},
            "anthropic": {"enabled": True, "api_key_env": "ANTHROPIC_API_KEY", "base_url": "https://api.anthropic.com/v1"},
            "gemini": {"enabled": True, "api_key_env": "GEMINI_API_KEY", "base_url": "https://generativelanguage.googleapis.com/v1beta"},
            "ollama": {"enabled": True, "base_url": "http://localhost:11434"},
            "huggingface": {"enabled": True, "api_key_env": "HF_TOKEN", "base_url": "https://api-inference.huggingface.co/models"}
        }
        
        for name, spec in providers.items():
            if name not in data["cloud_providers"]:
                data["cloud_providers"][name] = spec
                
        # Atomic write
        temp_file = config_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(config_path)
        print(f"Successfully patched configuration at: {config_path}")
        return True
    except Exception as e:
        print(f"Failed to update configuration: {e}")
        return False

if __name__ == "__main__":
    fix_config()
