import json
import httpx
import os

api_key = os.environ.get("GEMINI_API_KEY", "")

body = {"model": "gemini-2.5-pro", "messages": [{"role": "system", "content": "DEPTH & AUTHORITY DIRECTIVE ..."}, {"role": "user", "content": "Hi there!"}, {"role": "assistant", "content": "Cloud API Error..."}, {"role": "user", "content": "Hi there!\n\nWhen answering with cloud data..."}], "stream": True, "temperature": 1.0, "top_p": 0.95, "max_tokens": 4096, "stop": ["<|im_end|>", "<|eot_id|>", "<|end_of_text|>", "<end_of_turn>", "<|end|>"], "tools": [{"type": "function", "function": {"name": "search_web_images", "description": "...", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "..."}}, "required": ["query"]}}}, {"type": "function", "function": {"name": "active_window_info", "description": "Return the current foreground window title, bounds, and process details when available.", "parameters": {"type": "object", "properties": {}}}}]}

# Try hitting Gemini with a dummy API key just to see the validation error, not the auth error.
# Actually, if we use a dummy key, it will just say INVALID_ARGUMENT (API key not valid).
# We need the real API key to bypass auth and hit the payload validation.
