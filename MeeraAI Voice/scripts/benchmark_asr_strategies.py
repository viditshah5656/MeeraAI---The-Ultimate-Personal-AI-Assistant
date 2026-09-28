"""Measure ASR strategy latency and word error rate on a labeled WAV corpus."""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

from faster_whisper import WhisperModel


DEFAULT_LABELS = {
    "arey-yaar.wav": "arey yaar uh what is this",
    "arijit.wav": "can you tell me about arijit singh",
    "laugh.wav": "yeah can you laugh",
    "love.wav": "can you love",
    "cake.wav": "how do i make an eggless vanilla cake at home",
}


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def edit_distance(reference: list[str], hypothesis: list[str]) -> int:
    row = list(range(len(hypothesis) + 1))
    for index, expected in enumerate(reference, 1):
        next_row = [index]
        for column, actual in enumerate(hypothesis, 1):
            next_row.append(min(next_row[-1] + 1, row[column] + 1, row[column - 1] + (expected != actual)))
        row = next_row
    return row[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=Path(".meera/runtime/artifacts/asr-rnd"))
    parser.add_argument("--labels", type=Path, help="Optional JSON mapping WAV filenames to exact transcripts")
    parser.add_argument("--only", action="append", help="Run only a named strategy; repeat as needed")
    args = parser.parse_args()
    labels = json.loads(args.labels.read_text(encoding="utf-8")) if args.labels else DEFAULT_LABELS
    strategies = (
        ("small.en-biased", "small.en", "en", "Meera, Arijit Singh, laugh, love, eggless vanilla cake"),
        ("small.en-unbiased", "small.en", "en", None),
        ("small.en-hinglish", "small.en", "en", "arey yaar, achha, kya, nahi, haan, theek hai"),
        ("small.en-balanced", "small.en", "en", "arey yaar, Arijit Singh, laugh, love, eggless vanilla cake"),
        ("small-multilingual-en", "small", "en", None),
        ("small-multilingual-hinglish", "small", "en", "arey yaar, achha, kya, nahi, haan, theek hai"),
        ("small-multilingual-balanced", "small", "en", "arey yaar, Arijit Singh, laugh, love, eggless vanilla cake"),
        ("small-multilingual-auto", "small", None, None),
        ("turbo-multilingual-en", "large-v3-turbo", "en", None),
        ("turbo-multilingual-auto", "large-v3-turbo", None, None),
    )
    if args.only:
        strategies = tuple(strategy for strategy in strategies if strategy[0] in set(args.only))
    report = []
    for strategy, model_name, language, hotwords in strategies:
        model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=8, num_workers=1)
        errors = total = 0
        started = time.perf_counter()
        rows = []
        for filename, expected in labels.items():
            segments, info = model.transcribe(
                str(args.corpus / filename), language=language, task="transcribe", beam_size=8,
                temperature=0.0, condition_on_previous_text=False, vad_filter=True,
                initial_prompt=None, hotwords=hotwords,
            )
            segments = list(segments)
            actual = " ".join(segment.text.strip() for segment in segments).strip()
            reference_words, actual_words = words(expected), words(actual)
            errors += edit_distance(reference_words, actual_words)
            total += len(reference_words)
            rows.append({"file": filename, "expected": expected, "actual": actual, "language": info.language})
        report.append({
            "strategy": strategy,
            "wer": round(errors / max(1, total), 4),
            "seconds": round(time.perf_counter() - started, 3),
            "samples": rows,
        })
        del model
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
