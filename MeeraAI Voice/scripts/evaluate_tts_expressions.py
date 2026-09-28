"""Generate and objectively inspect candidate Qwen vocal-reaction samples.

Run this manually with Meera's environment, then listen to the resulting WAVs.
The report rejects silence, clipping, pathological duration and invalid 24 kHz
output automatically; human listening remains the final naturalness check.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config import PATHS, TTS
from meera_runtime.cancellation import CancellationToken
from meera_runtime.voice import QwenCppTTSBackend


CANDIDATES = ("Hmm.", "Oh.", "Wait.", "Wow.", "Heh.", "Ah.", "Really?", "No way.")

CONVERSATIONAL_SAMPLES = (
    ("Hey there! Good to see you.", "A warm, spontaneous, friendly greeting with an audible smile."),
    ("Ha, you're not going to believe what happened.", "An amused, lively conversational hook with a light natural chuckle."),
    ("Look, honestly... it's a bit more complicated than that.", "A thoughtful, honest tone with a soft breath pause and conversational cadence."),
    ("Oof, yeah, I completely get why that was exhausting.", "An empathetic, caring reassurance with a relaxed, warm vocal breath."),
    ("The thing is, we already fixed the hardest part.", "A confident, clear, encouraging conversational flow."),
)


def inspect_wav(path: Path, text: str) -> dict:
    import numpy as np

    with wave.open(str(path), "rb") as source:
        rate = source.getframerate()
        channels = source.getnchannels()
        width = source.getsampwidth()
        frames = source.getnframes()
        audio = np.frombuffer(source.readframes(frames), dtype="<i2")
    duration = frames / max(1, rate)
    peak = float(np.max(np.abs(audio.astype(np.int32))) / 32768) if audio.size else 0.0
    rms = float(np.sqrt(np.mean((audio.astype(np.float32) / 32768) ** 2))) if audio.size else 0.0
    reasons = []
    if rate != 24000 or channels != 1 or width != 2:
        reasons.append("invalid_format")
    if duration < .12 or duration > 10.0:
        reasons.append("pathological_duration")
    if rms < .002:
        reasons.append("silence")
    if peak > .995:
        reasons.append("clipping")
    return {"text": text, "path": str(path), "duration_s": round(duration, 3),
            "rms": round(rms, 5), "peak": round(peak, 5), "automatic_pass": not reasons,
            "reasons": reasons, "human_naturalness_pass": None}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=PATHS.artifact_root / "expression-evaluation")
    parser.add_argument("--mode", choices=["reactions", "conversational"], default="conversational", help="Evaluation sample set")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    backend = QwenCppTTSBackend(TTS)
    report = []
    try:
        backend.start()
        items = [
            (phrase, TTS.instruction + " " + cue)
            for phrase, cue in CONVERSATIONAL_SAMPLES
        ] if args.mode == "conversational" else [
            (phrase, "A brief natural conversational reaction. Keep it light, stable, and unforced.")
            for phrase in CANDIDATES
        ]
        for index, (phrase, instruction) in enumerate(items, 1):
            slug = re.sub(r"[^a-z0-9]+", "-", phrase.lower())[:30].strip("-")
            target = args.output / f"{index:02d}-{slug}.wav"
            result = backend.synthesize(phrase, target, CancellationToken(), instruction)
            report.append(inspect_wav(target, phrase) if result.ok else {
                "text": phrase, "path": str(target), "automatic_pass": False,
                "reasons": [result.error.message if result.error else result.summary],
                "human_naturalness_pass": None,
            })
    finally:
        backend.close()
    manifest = args.output / "report.json"
    manifest.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Generated {len(report)} samples. Listen to them, then mark human_naturalness_pass in {manifest}")
    return 0 if all(item["automatic_pass"] for item in report) else 1


if __name__ == "__main__":
    raise SystemExit(main())
