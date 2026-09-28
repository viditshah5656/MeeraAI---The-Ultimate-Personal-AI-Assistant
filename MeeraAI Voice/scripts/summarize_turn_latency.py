"""Summarize real Meera voice-turn latency from structured logs.

Usage:
    py -3.10 scripts/summarize_turn_latency.py
    py -3.10 scripts/summarize_turn_latency.py --last 100
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


DEFAULT_LOG = Path(__file__).resolve().parents[1] / ".meera" / "runtime" / "logs" / "meera.log"


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def load_real_turns(path: Path) -> list[dict]:
    turns: list[dict] = []
    if not path.exists():
        return turns
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        turn = payload.get("turn_telemetry")
        if not isinstance(turn, dict):
            continue
        timeline = turn.get("metadata", {}).get("timeline_ms")
        # Legacy unit-test records have no real event timeline. Extremely short
        # mocked turns are excluded as well so they cannot improve percentiles.
        if not isinstance(timeline, dict) or float(turn.get("total_latency_ms") or 0) <= 1.0:
            continue
        turns.append(turn)
    return turns


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Meera microphone-to-audio latency")
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--last", type=int, default=100)
    args = parser.parse_args()

    turns = load_real_turns(args.log)[-max(1, args.last):]
    if not turns:
        print(f"No instrumented live turns found in {args.log}")
        print("Run Meera in voice mode for several turns, then run this command again.")
        return 1

    fields = [
        ("Endpoint quiet", "vad_latency_ms"),
        ("Final ASR", "asr_latency_ms"),
        ("First phrase", "first_phrase_ms"),
        ("First audible audio", "ttfa_ms"),
        ("Turn total", "total_latency_ms"),
    ]
    print(f"Instrumented live turns: {len(turns)} (latest {args.last})")
    print(f"{'Metric':<24} {'p50 ms':>10} {'p95 ms':>10} {'max ms':>10}")
    print("-" * 58)
    for label, field in fields:
        values = [float(turn.get(field) or 0.0) for turn in turns if float(turn.get(field) or 0.0) > 0]
        if not values:
            print(f"{label:<24} {'n/a':>10} {'n/a':>10} {'n/a':>10}")
            continue
        print(
            f"{label:<24} {percentile(values, .50):>10.1f} "
            f"{percentile(values, .95):>10.1f} {max(values):>10.1f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
