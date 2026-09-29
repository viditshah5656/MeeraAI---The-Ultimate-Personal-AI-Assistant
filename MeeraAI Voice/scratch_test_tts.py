from meera_runtime.voice import QwenCppTTSBackend, TTSConfig, MicrophoneASR, ASRConfig
from meera_runtime.cancellation import CancellationToken
from pathlib import Path
import os
import threading

def run():
    config = TTSConfig(timeout_seconds=5)
    tts = QwenCppTTSBackend(config)
    token = CancellationToken()
    
    print("Testing TTS speak_streaming...")
    result = tts.speak_streaming(
        "Testing if TTS speaks or hangs.", 
        Path("test_output.wav"),
        token,
        "Articulate, highly intelligent mature woman; poised executive warmth, calm lower-pitched vocal presence, grounded confidence, natural connected cadence. composed and attentive, lively, flowing, and spontaneous, stable timbre, connected phrasing."
    )
    print("Result ok:", result.ok)
    if not result.ok:
        print("Error:", result.error)

if __name__ == "__main__":
    run()
