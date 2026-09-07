import urllib.request
import json
import traceback

url = "http://127.0.0.1:8000/api/chat/stream"
headers = {"Content-Type": "application/json"}
payload = {
    "message": "Hello from scratch3",
    "model": "gemini-3.1-pro-high",
    "stream": True,
    "messages": [{"role": "user", "content": "Hello from scratch3"}]
}

req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')

try:
    with urllib.request.urlopen(req) as response:
        print("Response started. Reading stream...")
        for line in response:
            line_str = line.decode('utf-8').strip()
            if line_str:
                print(line_str)
except Exception as e:
    print(f"Error: {e}")
    traceback.print_exc()
