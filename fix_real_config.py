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

def patch_real_config():
    config_path = get_config_path()
    if not config_path.exists():
        print(f"Config not found at {config_path}")
        return False
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # Patch context windows and cloud providers
        if "models" in data:
            for model in data.get("models", {}).values():
                if isinstance(model, dict) and model.get("context_window", 0) < 8192:
                    model["context_window"] = 8192
                    if "runtime_settings" in model:
                        model["runtime_settings"]["context_window"] = 8192
                        
        temp_file = config_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(config_path)
        print(f"Patched real configuration at {config_path}")
        return True
    except Exception as e:
        print(f"Error patching real config: {e}")
        return False

if __name__ == "__main__":
    patch_real_config()
