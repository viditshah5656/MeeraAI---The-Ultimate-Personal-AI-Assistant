"""Production Process Watchdog and Lifecycle Supervisor for MeeraAI.

Provides health checks, automatic crash recovery, and anti-zombie termination
for native subprocesses and isolated multiprocessing workers.
"""

from __future__ import annotations

import atexit
import ctypes
import os
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


@dataclass
class WorkerStatus:
    name: str
    alive: bool
    restarts: int = 0
    last_started: float = field(default_factory=time.time)
    last_error: str = ""


class ProcessWatchdog:
    """Supervises and cleans up background child processes and native servers."""

    _instance = None
    _singleton_lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._singleton_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._lock = threading.RLock()
        self._subprocesses: dict[str, subprocess.Popen] = {}
        self._mp_processes: dict[str, Any] = {}
        self._health_probes: dict[str, Callable[[], bool]] = {}
        self._restarts: dict[str, int] = {}
        self._shutting_down = False
        self._register_exit_handlers()

    def _register_exit_handlers(self) -> None:
        """Ensure all child processes are killed when the coordinator terminates."""
        atexit.register(self.shutdown_all)

        # Windows Console Control Handler (handles console window close, logoff, shutdown)
        if os.name == "nt":
            try:
                kernel32 = ctypes.windll.kernel32
                HANDLER_ROUTINE = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_ulong)

                def _console_handler(ctrl_type: int) -> bool:
                    if ctrl_type in (2, 5, 6):  # CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT
                        self.shutdown_all()
                        return True
                    return False  # Let Python runtime handle CTRL_C_EVENT (0) as KeyboardInterrupt

                self._ctrl_handler = HANDLER_ROUTINE(_console_handler)
                kernel32.SetConsoleCtrlHandler(self._ctrl_handler, True)
            except Exception:
                pass

        # Standard POSIX/Windows termination signals (do not hook SIGINT which is handled as KeyboardInterrupt)
        for sig_name in ("SIGTERM", "SIGBREAK"):
            if hasattr(signal, sig_name):
                try:
                    original = signal.getsignal(getattr(signal, sig_name))
                    def _sig_wrapper(sig, frame, orig=original):
                        self.shutdown_all()
                        if callable(orig):
                            orig(sig, frame)
                    signal.signal(getattr(signal, sig_name), _sig_wrapper)
                except (ValueError, AttributeError):
                    pass

    def register_subprocess(self, name: str, process: subprocess.Popen, probe: Callable[[], bool] | None = None) -> None:
        with self._lock:
            self._subprocesses[name] = process
            if probe:
                self._health_probes[name] = probe
            if name not in self._restarts:
                self._restarts[name] = 0

    def register_mp_process(self, name: str, process: Any) -> None:
        with self._lock:
            self._mp_processes[name] = process
            if name not in self._restarts:
                self._restarts[name] = 0

    def unregister(self, name: str) -> None:
        with self._lock:
            self._subprocesses.pop(name, None)
            self._mp_processes.pop(name, None)
            self._health_probes.pop(name, None)

    def is_healthy(self, name: str) -> bool:
        with self._lock:
            if name in self._subprocesses:
                proc = self._subprocesses[name]
                if proc.poll() is not None:
                    return False
                probe = self._health_probes.get(name)
                return probe() if probe else True
            if name in self._mp_processes:
                proc = self._mp_processes[name]
                return bool(proc and getattr(proc, "is_alive", lambda: False)())
        return False

    def health_report(self) -> dict[str, Any]:
        with self._lock:
            report = {}
            for name, proc in self._subprocesses.items():
                alive = proc.poll() is None
                if alive and name in self._health_probes:
                    alive = bool(self._health_probes[name]())
                report[name] = {
                    "type": "subprocess",
                    "pid": proc.pid if proc else None,
                    "alive": alive,
                    "restarts": self._restarts.get(name, 0),
                }
            for name, proc in self._mp_processes.items():
                alive = bool(proc and getattr(proc, "is_alive", lambda: False)())
                report[name] = {
                    "type": "multiprocessing",
                    "pid": getattr(proc, "pid", None),
                    "alive": alive,
                    "restarts": self._restarts.get(name, 0),
                }
            return report

    def shutdown_all(self) -> None:
        """Gracefully terminate, then force kill, all tracked worker processes."""
        with self._lock:
            if self._shutting_down:
                return
            self._shutting_down = True

            # Terminate native subprocesses (e.g. tts-server.exe)
            for name, proc in list(self._subprocesses.items()):
                if proc and proc.poll() is None:
                    try:
                        proc.terminate()
                    except Exception:
                        pass

            # Terminate multiprocessing workers (e.g. ASR, Speaker)
            for name, proc in list(self._mp_processes.items()):
                if proc and getattr(proc, "is_alive", lambda: False)():
                    try:
                        proc.terminate()
                    except Exception:
                        pass

            # Wait briefly, then kill any lingering processes
            deadline = time.time() + 1.0
            for proc in self._subprocesses.values():
                if proc and proc.poll() is None:
                    remaining = max(0.05, min(0.4, deadline - time.time()))
                    try:
                        proc.wait(timeout=remaining)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass

            for proc in self._mp_processes.values():
                if proc and getattr(proc, "is_alive", lambda: False)():
                    try:
                        proc.join(timeout=0.3)
                        if proc.is_alive():
                            proc.kill()
                    except Exception:
                        pass

            self._subprocesses.clear()
            self._mp_processes.clear()
            self._health_probes.clear()


watchdog = ProcessWatchdog()