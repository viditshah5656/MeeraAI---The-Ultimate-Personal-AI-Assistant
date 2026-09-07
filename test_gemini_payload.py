import os
import requests
import json
import sys

def test_local_meera():
    # Try against the local Meera server running on port 8000
    url = "http://localhost:8000/v1/chat/completions"
    
    headers = {
        "Content-Type": "application/json"
    }

    # Include presence_penalty, frequency_penalty, and a long stop sequence 
    # to ensure the fix inside Meera.py properly strips/truncates them 
    # and doesn't result in a 400 Bad Request from Google's API.
    payload = {
        "model": "gemini/gemini-1.5-flash", 
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": "Hello, how are you?"
            }
        ],
        "presence_penalty": 0.5,
        "frequency_penalty": 0.5,
        "seed": 42,
        "stop": ["stop1", "stop2", "stop3", "stop4", "stop5", "stop6"],
        "max_tokens": 10
    }

    print(f"Testing against local Meera server at {url}...")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("✅ Success! The payload was accepted.")
            print("Response:", json.dumps(response.json(), indent=2))
            return True
        else:
            print(f"❌ Failed with status code: {response.status_code}")
            print("Response text:", response.text)
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to the local Meera server. Make sure it's running on port 8000.")
        return False
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        return False

def test_direct_gemini_openai():
    # Also provide a way to test standalone directly against the Gemini OpenAI API endpoint
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("\nNote: GEMINI_API_KEY not set in environment. Skipping direct standalone test.")
        return

    url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    # If we send the raw unstripped payload to Gemini directly, it should fail with 400.
    # If we strip it here manually, it should succeed.
    # Let's test the stripped payload to prove it works.
    payload = {
        "model": "gemini-1.5-flash",
        "messages": [
            {
                "role": "user",
                "content": "Hello!"
            }
        ],
        "max_tokens": 10
        # Notice we omitted presence_penalty, frequency_penalty, seed, and large stop list
    }

    print(f"\nTesting directly against Gemini OpenAI endpoint at {url}...")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("✅ Success! The standalone stripped payload works directly.")
        else:
            print(f"❌ Failed with status code: {response.status_code}")
            print("Response text:", response.text)
            
    except Exception as e:
        print(f"❌ An error occurred: {e}")

if __name__ == "__main__":
    success = test_local_meera()
    test_direct_gemini_openai()
    
    if not success:
        sys.exit(1)
    sys.exit(0)
