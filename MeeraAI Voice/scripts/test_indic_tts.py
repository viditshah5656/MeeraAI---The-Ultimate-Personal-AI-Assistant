"""Benchmark and audio generation script for Sooktam-2 on MeeraAI."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Add repo root to sys.path
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from config import TTS

# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from config import TTS
from meera_runtime.cancellation import CancellationToken
from meera_runtime.sooktam_tts import SooktamTTSEngine, detect_language_for_sooktam

BENCHMARK_PROMPTS = [
    ("english", "Hey, give me a second. I'm checking that for you."),
    ("hindi", "एक सेकंड दीजिए। मैं अभी आपके लिए देखती हूँ।"),
    ("gujarati", "એક સેકન્ડ આપો. હું હમણાં તમારા માટે જોઈ રહી છું."),
    ("hinglish", "Ek second dijiye, main abhi aapke liye check karti hoon."),
]


def main():
    print("=" * 60)
    print("BharatGen Sooktam-2 Multilingual Benchmark (Hindi / Gujarati / English)")
    print("=" * 60)

    out_dir = Path("outputs/benchmark")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading Sooktam-2 engine (model: {TTS.sooktam_model_id})...")
    engine = SooktamTTSEngine(TTS)
    engine.start()
    print(f"Engine ready on {engine.device}. Warming up CUDA kernels...")
    engine.warmup()
    print("Warmup complete.\n")

    token = CancellationToken()
    results = []

    for name, text in BENCHMARK_PROMPTS:
        detected = detect_language_for_sooktam(text)
        out_wav = out_dir / f"{name}.wav"
        print(f"Synthesizing [{name.upper()}] (detected lang: {detected})...")
        print(f"  Text: {text}")

        t0 = time.monotonic()
        engine.synthesize(text, out_wav, token)
        elapsed = time.monotonic() - t0

        import soundfile as sf
        data, sr = sf.read(str(out_wav))
        duration = len(data) / sr
        rtf = elapsed / duration if duration > 0 else float("inf")

        print(f"  -> Generated {duration:.2f}s audio in {elapsed:.2f}s (RTF: {rtf:.2f})")
        print(f"  -> Saved: {out_wav}\n")

        results.append({
            "prompt": name,
            "detected": detected,
            "elapsed_s": round(elapsed, 2),
            "audio_dur_s": round(duration, 2),
            "rtf": round(rtf, 2),
            "path": str(out_wav),
        })

    print("=" * 60)
    print("Benchmark Summary:")
    for r in results:
        print(f" - {r['prompt'].capitalize():10}: {r['elapsed_s']}s generation | {r['audio_dur_s']}s speech | RTF: {r['rtf']} | file: {r['path']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
