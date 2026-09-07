import requests
import json
import os

url = "http://localhost:8000/v1/chat/completions"
headers = {"Content-Type": "application/json"}
payload = {
    "model": "gemini/gemini-1.5-flash", 
    "messages": [{"role": "user", "content": "Hello, how are you?"}]
}

try:
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    print(f"Status: {response.status_code}")
    print("Response:", response.text)
except Exception as e:
    print(f"Error: {e}")
