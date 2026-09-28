from meera_runtime.supervisor import Supervisor
import time

def run():
    print("Initializing supervisor...")
    sup = Supervisor()
    print("Testing speech...")
    from pathlib import Path
    long_instruction = "Articulate, highly intelligent mature woman; poised executive warmth, calm lower-pitched vocal presence, grounded confidence, natural connected cadence. composed and attentive, lively, flowing, and spontaneous, stable timbre, connected phrasing. Include brief natural laugh or chuckle."
    result = sup.speak_live("This is a test of the speech system with a long prompt.", Path("test_speech.wav"), long_instruction)
    print("Result:", result.ok)
    if result.ok:
        print("Data:", result.data)
        import os
        print("File size:", os.path.getsize("test_speech.wav"))
    if not result.ok:
        print("Error:", result.error.message)

if __name__ == "__main__":
    run()
