"""Production structured logging, turn-level latency tracing, and crash reporting."""

from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
import os
import platform
import sys
import time
import traceback
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import PATHS


class JSONFormatter(logging.Formatter):
    """Format log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, val in record.__dict__.items():
            if key not in {
                "args", "asctime", "created", "exc_info", "exc_text",
                "filename", "funcName", "id", "levelname", "levelno",
                "lineno", "module", "msecs", "message", "msg", "name",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "thread", "threadName",
            }:
                try:
                    json.dumps(val)
                    payload[key] = val
                except (TypeError, OverflowError):
                    payload[key] = str(val)
        return json.dumps(payload, ensure_ascii=False)


def get_logger(name: str = "meera") -> logging.Logger:
    """Get or initialize a structured logger for a Meera component."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    logger.propagate = False

    log_dir = PATHS.runtime_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "meera.log"

    file_handler = RotatingFileHandler(
        str(log_file), maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(JSONFormatter())
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_fmt = logging.Formatter("[%(levelname)s] [%(name)s] %(message)s")
    console_handler.setFormatter(console_fmt)
    logger.addHandler(console_handler)

    return logger


logger = get_logger("meera")


@dataclass
class TurnTelemetry:
    """Performance metrics across a single conversational turn."""
    turn_id: str
    user_text: str = ""
    vad_latency_ms: float = 0.0
    asr_latency_ms: float = 0.0
    ttft_ms: float = 0.0
    first_phrase_ms: float = 0.0
    llm_latency_ms: float = 0.0
    ttfa_ms: float = 0.0
    tts_latency_ms: float = 0.0
    total_latency_ms: float = 0.0
    status: str = "success"
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def log(self, dest_logger: logging.Logger | None = None) -> None:
        log_target = dest_logger or logger
        log_target.info(
            f"Turn {self.turn_id} completed in {self.total_latency_ms:.0f}ms (VAD: {self.vad_latency_ms:.0f}ms, ASR: {self.asr_latency_ms:.0f}ms, phrase: {self.first_phrase_ms:.0f}ms, TTFA: {self.ttfa_ms:.0f}ms)",
            extra={"turn_telemetry": asdict(self)},
        )


class TurnTracer:
    """Contextual performance recorder for an active conversational turn."""

    def __init__(self, turn_id: str, user_text: str = "", *, started_at: float | None = None) -> None:
        self.telemetry = TurnTelemetry(turn_id=turn_id, user_text=user_text)
        self._start_time = started_at if started_at is not None else time.monotonic()
        self._finished = False

    def event(self, name: str, *, at: float | None = None) -> float:
        """Record an absolute turn event as milliseconds since speech onset."""
        elapsed = round(((at if at is not None else time.monotonic()) - self._start_time) * 1000, 2)
        timeline = self.telemetry.metadata.setdefault("timeline_ms", {})
        timeline[name] = elapsed
        return elapsed

    def duration(self, name: str, started_at: float, *, ended_at: float | None = None) -> float:
        """Record a named stage duration measured with the monotonic clock."""
        elapsed = round(((ended_at if ended_at is not None else time.monotonic()) - started_at) * 1000, 2)
        durations = self.telemetry.metadata.setdefault("stage_duration_ms", {})
        durations[name] = elapsed
        return elapsed

    def mark_vad_done(self, latency_ms: float) -> None:
        self.telemetry.vad_latency_ms = round(latency_ms, 2)

    def mark_asr_done(self, latency_ms: float) -> None:
        self.telemetry.asr_latency_ms = round(latency_ms, 2)

    def mark_ttft(self, latency_ms: float) -> None:
        self.telemetry.ttft_ms = round(latency_ms, 2)

    def mark_first_phrase(self, latency_ms: float) -> None:
        self.telemetry.first_phrase_ms = round(latency_ms, 2)

    def mark_llm_done(self, latency_ms: float) -> None:
        self.telemetry.llm_latency_ms = round(latency_ms, 2)

    def mark_ttfa(self, latency_ms: float) -> None:
        self.telemetry.ttfa_ms = round(latency_ms, 2)

    def mark_tts_done(self, latency_ms: float) -> None:
        self.telemetry.tts_latency_ms = round(latency_ms, 2)

    def finish(self, status: str = "success", error: str | None = None) -> TurnTelemetry:
        if self._finished:
            return self.telemetry
        self._finished = True
        self.telemetry.total_latency_ms = round((time.monotonic() - self._start_time) * 1000, 2)
        self.telemetry.status = status
        self.telemetry.error = error
        self.telemetry.log()
        return self.telemetry


def write_crash_dump(exc: BaseException, context: dict[str, Any] | None = None) -> Path:
    """Safely persist a sanitized crash report on unhandled exceptions."""
    crash_dir = PATHS.runtime_root / "crashes"
    crash_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    crash_file = crash_dir / f"crash_{ts}.json"

    from .watchdog import watchdog
    try:
        worker_health = watchdog.health_report()
    except Exception:
        worker_health = {}

    dump = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": {
            "os": platform.platform(),
            "python": platform.python_version(),
            "architecture": platform.machine(),
        },
        "exception": {
            "type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exception(type(exc), exc, exc.__traceback__),
        },
        "context": context or {},
        "workers": worker_health,
    }

    with open(crash_file, "w", encoding="utf-8") as f:
        json.dump(dump, f, indent=2, ensure_ascii=False)

    logger.error(f"Crash report generated at: {crash_file}")
    return crash_file
