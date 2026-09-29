"""Manual integration check for the real SpeechBrain worker (not unit discovery)."""

from pathlib import Path
import wave

import numpy as np
from scipy.signal import resample_poly

from config import PATHS, SPEAKER
from meera_runtime.speaker import SpeakerEmbeddingWorker


def load_mono_16k(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        raw = source.readframes(source.getnframes())
    if width != 2:
        raise RuntimeError("Smoke input must use signed 16-bit PCM")
    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32).reshape(-1, channels).mean(axis=1) / 32768.0
    if rate != 16000:
        audio = resample_poly(audio, 16000, rate).astype(np.float32)
    return audio


def main() -> None:
    sample = PATHS.artifact_root / "speech" / "meera-female-american.wav"
    worker = SpeakerEmbeddingWorker(SPEAKER, PATHS.model_root)
    try:
        vector = worker.embed(load_mono_16k(sample))
        norm = float(np.linalg.norm(vector))
        if vector.shape != (192,) or not .999 <= norm <= 1.001:
            raise RuntimeError(f"Unexpected speaker embedding: shape={vector.shape}, norm={norm}")
        print(f"Speaker verifier ready: dimensions={vector.size}, norm={norm:.6f}")
    finally:
        worker.close()


if __name__ == "__main__":
    main()
