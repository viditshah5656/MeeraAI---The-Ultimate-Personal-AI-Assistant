import sys
import os

from Meera import AppConfig

def test_meera_identity_system_prompt():
    print("--- Testing Meera Identity and Tools in System Prompt ---")
    config = AppConfig()
    prompt = config.system_prompt
    
    # 1. AI correctly identifies as Meera
    assert "You are **Meera**." in prompt or "You are Meera" in prompt, "Identity not found in system prompt"
    assert "Meera is an independent AI assistant" in prompt, "Model independence not found"
    assert "Meera remains Meera" in prompt, "Continuity across models not found"
    
    # 2. Lists tool calling abilities
    assert "execute_terminal" in prompt, "Terminal tool not found in system prompt"
    assert "browser_" in prompt, "Browser/web tools not found in system prompt"
    assert "spawn_subagent" in prompt, "Agent tools not found in system prompt"
    
    print("✅ System prompt correctly contains Meera's identity and tool listing!")

if __name__ == "__main__":
    test_meera_identity_system_prompt()
