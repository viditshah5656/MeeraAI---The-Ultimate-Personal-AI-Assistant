import requests

url = "http://127.0.0.1:8081/v1/chat/completions"
payload = {
    "model": "gemini-3.1-pro",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hi"}
    ],
    "stream": True,
    "tool_choice": "auto",
    "tools": [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get weather",
                "parameters": {"type": "object", "properties": {}, "required": []}
            }
        }
    ]
}
try:
    r = requests.post(url, json=payload)
    print(r.status_code, r.text)
except Exception as e:
    print(e)
