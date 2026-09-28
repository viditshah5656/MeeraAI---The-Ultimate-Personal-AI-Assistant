"""Manual integration smoke test for native-runtime process isolation."""

from pathlib import Path
import sys
import wave

import numpy as np

from config import ASR
from meera_runtime.voice import MicrophoneASR


def main() -> None:
    audio_paths = [Path(item) for item in sys.argv[1:]] or [Path(".meera/runtime/artifacts/speech/smoke.wav")]
    listener = MicrophoneASR(ASR)
    try:
        for audio_path in audio_paths:
            with wave.open(str(audio_path), "rb") as wav:
                audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
                source_rate = wav.getframerate()
            if source_rate != ASR.sample_rate:
                positions = np.linspace(0, len(audio) - 1, int(len(audio) * ASR.sample_rate / source_rate))
                audio = np.interp(positions, np.arange(len(audio)), audio).astype(np.float32)
            print(f"ASR [{audio_path.name}]:", listener.transcribe(audio))
            print(
                f"  confidence={listener.last_confidence:.3f} language={listener.last_language} "
                f"fallback={listener.last_fallback_used}"
            )
    finally:
        listener.close()


if __name__ == "__main__":
    main()
