import os
import httpx
import json

api_key = os.environ.get("GEMINI_API_KEY", "")

body = {
  "model": "gemini-2.5-pro",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": False,
  "stop": ["<|im_end|>", "<|eot_id|>", "<|end_of_text|>", "<end_of_turn>", "<|end|>"],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "test_tool",
        "description": "test",
        "parameters": {
          "type": "object",
          "properties": {}
        }
      }
    }
  ]
}

url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
headers = {"Authorization": f"Bearer {api_key}"}

resp = httpx.post(url, headers=headers, json=body)
print(resp.status_code)
print(resp.text)
