"""Automated stress and leak testing harness for Meera conversational turns."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "4")

import psutil

# Ensure repo root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import PATHS
from meera_runtime.supervisor import Supervisor
from meera_runtime.logger import TurnTracer, logger
from meera_runtime.watchdog import watchdog


TEST_UTTERANCES = [
    "Hello Meera, what is your current system status?",
    "Remember that my preferred greeting style is brief.",
    "What is my preferred greeting style?",
    "How does quantum computing differ from classical computing?",
    "Can you summarize why writing clean code is essential in production systems?",
    "Forget my preferred greeting style.",
    "What time is it in UTC right now?",
    "Tell me a short thoughtful reflection on human-computer collaboration.",
]


def run_stress_test(turns_count: int = 10, verbose: bool = True) -> dict:
    process = psutil.Process(os.getpid())
    print(f"\n========================================================")
    print(f"   MeeraAI Long-Running Stress & Leak Test ({turns_count} turns)")
    print(f"========================================================\n")

    supervisor = Supervisor()
    initial_rss_mb = process.memory_info().rss / (1024 * 1024)
    print(f"[Baseline] Process PID={process.pid}, Initial RSS: {initial_rss_mb:.2f} MB")

    turn_metrics = []
    start_all = time.monotonic()

    try:
        for turn_idx in range(1, turns_count + 1):
            prompt = TEST_UTTERANCES[(turn_idx - 1) % len(TEST_UTTERANCES)]
            tracer = TurnTracer(turn_id=f"stress-{turn_idx}", user_text=prompt)
            
            turn_start = time.monotonic()
            rss_before = process.memory_info().rss / (1024 * 1024)
            
            result = supervisor.execute(prompt)
            
            turn_duration = (time.monotonic() - turn_start) * 1000
            rss_after = process.memory_info().rss / (1024 * 1024)
            
            telemetry = tracer.finish(status="success" if result.ok else "failed")
            
            workers_health = watchdog.health_report()
            all_healthy = all(w.get("status") == "healthy" for w in workers_health.values()) if workers_health else True

            turn_info = {
                "turn": turn_idx,
                "prompt": prompt,
                "ok": result.ok,
                "summary": result.summary[:80] + "..." if len(result.summary) > 80 else result.summary,
                "duration_ms": round(turn_duration, 1),
                "rss_before_mb": round(rss_before, 2),
                "rss_after_mb": round(rss_after, 2),
                "rss_delta_mb": round(rss_after - rss_before, 2),
                "workers_ok": all_healthy,
            }
            turn_metrics.append(turn_info)

            if verbose:
                status_char = "[OK]" if result.ok else "[FAIL]"
                print(
                    f"[{turn_idx:02d}/{turns_count:02d}] {status_char} Turn duration={turn_duration:6.1f}ms | "
                    f"RSS={rss_after:6.1f} MB (delta={turn_info['rss_delta_mb']:+5.2f} MB) | "
                    f"Prompt: {prompt[:35]}..."
                )

        final_rss_mb = process.memory_info().rss / (1024 * 1024)
        total_time = time.monotonic() - start_all
        drift_mb = final_rss_mb - initial_rss_mb
        drift_pct = (drift_mb / initial_rss_mb) * 100

        print(f"\n=================== Summary Report ===================")
        print(f"Total turns executed : {turns_count}")
        print(f"Total elapsed time   : {total_time:.2f}s (avg {total_time/turns_count:.2f}s/turn)")
        print(f"Initial RSS memory   : {initial_rss_mb:.2f} MB")
        print(f"Final RSS memory     : {final_rss_mb:.2f} MB")
        print(f"Net memory drift     : {drift_mb:+.2f} MB ({drift_pct:+.1f}%)")
        print(f"Watchdog health      : {watchdog.health_report()}")
        print(f"======================================================\n")

        report = {
            "turns_count": turns_count,
            "total_elapsed_seconds": round(total_time, 2),
            "initial_rss_mb": round(initial_rss_mb, 2),
            "final_rss_mb": round(final_rss_mb, 2),
            "drift_mb": round(drift_mb, 2),
            "drift_pct": round(drift_pct, 2),
            "turns": turn_metrics,
            "workers": watchdog.health_report(),
        }

        report_file = PATHS.runtime_root / "stress_test_report.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Detailed stress report saved to: {report_file}")
        return report

    finally:
        supervisor.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MeeraAI Stress Test Harness")
    parser.add_argument("--turns", type=int, default=10, help="Number of turns to execute")
    parser.add_argument("--quiet", action="store_true", help="Minimal console output")
    args = parser.parse_args()

    run_stress_test(turns_count=args.turns, verbose=not args.quiet)