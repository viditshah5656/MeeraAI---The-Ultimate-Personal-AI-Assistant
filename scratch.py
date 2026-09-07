import json
import urllib.request
import urllib.error

url = "http://127.0.0.1:8000/api/chat/stream"
headers = {"Content-Type": "application/json"}
payload = {
    "model": "gemini-3.1-pro-high",
    "messages": [{"role": "user", "content": "Hello, what model are you?"}]
}

req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')

try:
    with urllib.request.urlopen(req) as response:
        print("Response started. Reading stream...")
        for line in response:
            line_str = line.decode('utf-8').strip()
            if line_str:
                print(line_str)
except urllib.error.URLError as e:
    print(f"Error: {e}")
