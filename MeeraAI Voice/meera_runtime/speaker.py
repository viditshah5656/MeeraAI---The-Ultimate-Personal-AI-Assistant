"""Local owner-controlled speaker enrollment and verification for MeeraAI."""

from __future__ import annotations

import ctypes
import json
import math
import multiprocessing
import os
import sqlite3
import threading
from dataclasses import asdict, dataclass
from multiprocessing.connection import Connection
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from config import SpeakerConfig
from .db import open_database
from .models import utc_now
from .watchdog import watchdog


class VoiceprintError(RuntimeError):
    pass


@dataclass(frozen=True)
class VoiceProfile:
    name: str
    role: str
    embeddings: tuple[tuple[float, ...], ...]
    threshold: float
    created_at: str


@dataclass(frozen=True)
class SpeakerMatch:
    accepted: bool
    name: str | None = None
    role: str | None = None
    score: float = -1.0
    reason: str = "not_enrolled"


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_ulong), ("pbData", ctypes.POINTER(ctypes.c_byte))]


class VoiceprintProtector:
    """Protect biometric templates with Windows DPAPI for the current account."""

    CRYPTPROTECT_UI_FORBIDDEN = 0x1

    @staticmethod
    def _input_blob(data: bytes) -> tuple[_DataBlob, Any]:
        buffer = ctypes.create_string_buffer(data)
        blob = _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
        return blob, buffer

    def protect(self, data: bytes) -> bytes:
        if not data:
            raise VoiceprintError("Cannot protect an empty voiceprint")
        source, keepalive = self._input_blob(data)
        destination = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        kernel32.LocalFree.restype = ctypes.c_void_p
        ok = crypt32.CryptProtectData(
            ctypes.byref(source), "MeeraAI voiceprint", None, None, None,
            self.CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(destination),
        )
        del keepalive
        if not ok:
            raise ctypes.WinError()
        try:
            return ctypes.string_at(destination.pbData, destination.cbData)
        finally:
            kernel32.LocalFree(destination.pbData)

    def unprotect(self, data: bytes) -> bytes:
        source, keepalive = self._input_blob(data)
        destination = _DataBlob()
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32
        kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        kernel32.LocalFree.restype = ctypes.c_void_p
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(source), None, None, None, None,
            self.CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(destination),
        )
        del keepalive
        if not ok:
            raise ctypes.WinError()
        try:
            return ctypes.string_at(destination.pbData, destination.cbData)
        finally:
            kernel32.LocalFree(destination.pbData)


class VoiceprintStore:
    def __init__(self, database_path: Path, protector: VoiceprintProtector | None = None) -> None:
        self.database_path = database_path
        self.protector = protector or VoiceprintProtector()
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS voice_profiles ("
                "name TEXT PRIMARY KEY COLLATE NOCASE, role TEXT NOT NULL, "
                "voiceprint BLOB NOT NULL, threshold REAL NOT NULL, created_at TEXT NOT NULL)"
            )
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_voice_owner ON voice_profiles(role) WHERE role='owner'")

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def save(self, profile: VoiceProfile) -> None:
        if profile.role not in {"owner", "secondary"}:
            raise ValueError("Invalid speaker role")
        document = json.dumps({"embeddings": profile.embeddings}, separators=(",", ":")).encode("utf-8")
        protected = self.protector.protect(document)
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO voice_profiles(name,role,voiceprint,threshold,created_at) VALUES(?,?,?,?,?) "
                "ON CONFLICT(name) DO UPDATE SET role=excluded.role,voiceprint=excluded.voiceprint,"
                "threshold=excluded.threshold,created_at=excluded.created_at",
                (profile.name, profile.role, protected, profile.threshold, profile.created_at),
            )

    def profiles(self) -> list[VoiceProfile]:
        with self._lock, self._connect() as db:
            rows = db.execute(
                "SELECT name,role,voiceprint,threshold,created_at FROM voice_profiles ORDER BY role DESC,name"
            ).fetchall()
        profiles = []
        for name, role, protected, threshold, created_at in rows:
            document = json.loads(self.protector.unprotect(protected).decode("utf-8"))
            embeddings = tuple(tuple(float(value) for value in vector) for vector in document["embeddings"])
            profiles.append(VoiceProfile(name, role, embeddings, float(threshold), created_at))
        return profiles

    def has_owner(self) -> bool:
        with self._lock, self._connect() as db:
            return db.execute("SELECT 1 FROM voice_profiles WHERE role='owner' LIMIT 1").fetchone() is not None

    def next_secondary_name(self) -> str:
        with self._lock, self._connect() as db:
            count = db.execute("SELECT COUNT(*) FROM voice_profiles WHERE role='secondary'").fetchone()[0]
        return f"trusted-{count + 2}"


class EmbeddingProvider(Protocol):
    def start(self) -> None: ...
    def embed(self, audio: np.ndarray) -> np.ndarray: ...
    def close(self) -> None: ...


def _speaker_worker(connection: Connection, source: str, savedir: str) -> None:
    try:
        import os
        import warnings
        os.environ.pop("PYTHONHASHSEED", None)
        warnings.filterwarnings("ignore")
        import signal

        if os.name == "nt":
            # The parent owns terminal shutdown; do not let native OpenMP in this
            # worker process interpret Ctrl+C as a fatal Fortran abort.
            ctypes.windll.kernel32.SetConsoleCtrlHandler(None, True)
        import torch
        from speechbrain.inference.speaker import EncoderClassifier
        from speechbrain.utils.fetching import LocalStrategy

        signal.signal(signal.SIGINT, signal.SIG_IGN)

        torch.set_num_threads(max(1, min(4, (multiprocessing.cpu_count() or 4) - 1)))
        classifier = EncoderClassifier.from_hparams(
            source=source,
            savedir=savedir,
            local_strategy=LocalStrategy.COPY,
            run_opts={"device": "cpu"},
        )
        connection.send((True, "ready"))
        while True:
            request = connection.recv()
            if request is None:
                break
            waveform = torch.from_numpy(np.asarray(request, dtype=np.float32)).unsqueeze(0)
            with torch.inference_mode():
                vector = classifier.encode_batch(waveform).squeeze().cpu().numpy().astype(np.float32)
            norm = float(np.linalg.norm(vector))
            if not math.isfinite(norm) or norm < 1e-8:
                raise VoiceprintError("Speaker model produced an invalid embedding")
            connection.send((True, (vector / norm).tolist()))
    except EOFError:
        pass
    except Exception as exc:
        try:
            connection.send((False, f"{type(exc).__name__}: {exc}"))
        except (BrokenPipeError, EOFError, OSError):
            pass
    finally:
        connection.close()


class SpeakerEmbeddingWorker:
    def __init__(self, config: SpeakerConfig, model_root: Path) -> None:
        self.config = config
        self.savedir = model_root / "speaker-verification" / "ecapa-voxceleb-local"
        self._process = None
        self._connection: Connection | None = None

    def start(self) -> None:
        if self._process is not None and self._process.is_alive():
            return
        os.environ.pop("PYTHONHASHSEED", None)
        context = multiprocessing.get_context("spawn")
        parent, child = context.Pipe()
        self._process = context.Process(
            target=_speaker_worker,
            args=(child, self.config.model_source, str(self.savedir)),
            name="meera-speaker-verifier",
            daemon=True,
        )
        self._connection = parent
        self._process.start()
        watchdog.register_mp_process("speaker_verifier", self._process)
        if not parent.poll(180):
            self.close()
            raise TimeoutError("Speaker verifier startup timed out")
        ok, message = parent.recv()
        if not ok:
            self.close()
            raise VoiceprintError(f"Speaker verifier failed: {message}")

    def embed(self, audio: np.ndarray) -> np.ndarray:
        self.start()
        assert self._connection is not None
        self._connection.send(np.asarray(audio, dtype=np.float32))
        if not self._connection.poll(60):
            self.close()
            raise TimeoutError("Speaker verification timed out")
        ok, message = self._connection.recv()
        if not ok:
            self.close()
            raise VoiceprintError(str(message))
        return np.asarray(message, dtype=np.float32)

    def close(self) -> None:
        watchdog.unregister("speaker_verifier")
        connection, process = self._connection, self._process
        self._connection = None
        self._process = None
        if connection is not None:
            try:
                connection.send(None)
                connection.close()
            except (BrokenPipeError, EOFError, OSError):
                pass
        if process is not None:
            process.join(timeout=3)
            if process.is_alive():
                process.terminate()
                process.join(timeout=2)


class VoiceAccessController:
    """Enroll voiceprints for identity context and strict authorization checks."""

    def __init__(
        self,
        config: SpeakerConfig,
        database_path: Path,
        model_root: Path,
        provider: EmbeddingProvider | None = None,
        store: VoiceprintStore | None = None,
    ) -> None:
        self.config = config
        self.store = store or VoiceprintStore(database_path)
        self.provider = provider or SpeakerEmbeddingWorker(config, model_root)
        self._last_verified_at = 0.0
        self._last_verified_match = None

    @property
    def locked(self) -> bool:
        return self.config.enabled and self.store.has_owner()

    def start(self) -> None:
        if self.locked:
            self.provider.start()

    def close(self) -> None:
        self.provider.close()

    def quality_error(self, audio: np.ndarray) -> str | None:
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if len(samples) < int(16000 * self.config.min_sample_seconds):
            return "Please speak the whole enrollment sentence."
        rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
        if not math.isfinite(rms) or rms < self.config.min_rms:
            return "That sample was too quiet. Please speak clearly and try again."
        if float(np.max(np.abs(samples))) > .995:
            return "That sample clipped. Move slightly away from the microphone and try again."
        return None

    def enroll(self, name: str, role: str, recordings: list[np.ndarray]) -> VoiceProfile:
        if role == "owner" and self.store.has_owner():
            raise VoiceprintError("An owner voice is already registered")
        if role == "secondary" and not self.store.has_owner():
            raise VoiceprintError("Register the owner voice first")
        if len(recordings) < self.config.enrollment_samples:
            raise VoiceprintError(f"Need {self.config.enrollment_samples} good voice samples")
        vectors = []
        for audio in recordings:
            error = self.quality_error(audio)
            if error:
                raise VoiceprintError(error)
            vectors.append(self.provider.embed(audio))
        similarities = [
            float(np.dot(vectors[left], vectors[right]))
            for left in range(len(vectors)) for right in range(left + 1, len(vectors))
        ]
        if similarities and min(similarities) < .30:
            raise VoiceprintError("Enrollment samples do not sound like the same speaker")
        adaptive = min(.68, max(self.config.threshold, (min(similarities) - .12) if similarities else self.config.threshold))
        profile = VoiceProfile(
            name=name,
            role=role,
            embeddings=tuple(tuple(float(value) for value in vector) for vector in vectors),
            threshold=adaptive,
            created_at=utc_now(),
        )
        self.store.save(profile)
        return profile

    def authenticate(self, audio: np.ndarray, *, strict: bool | None = None) -> SpeakerMatch:
        if not self.locked:
            return SpeakerMatch(True, role="bootstrap", score=1.0, reason="not_locked")
        
        # Check Continuous Trust Session
        import time
        now = time.monotonic()
        if not strict and self._last_verified_match and (now - self._last_verified_at) < 60.0:
            cached = self._last_verified_match
            # Exponential decay on cached score
            decay = math.exp(-(now - self._last_verified_at) / 20.0)
            cached = SpeakerMatch(
                accepted=cached.accepted, name=cached.name, role=cached.role,
                score=cached.score * decay, reason="continuous_trust_cache"
            )
            # If it's a very short turn, just trust the cache immediately
            samples = np.asarray(audio, dtype=np.float32).reshape(-1)
            if len(samples) < 16000 * 1.5:
                return cached
            
        strict = self.config.enforce_identity if strict is None else strict
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
        if len(samples) < 16000 * .40 or not math.isfinite(rms) or rms < self.config.min_rms:
            if not strict and self._last_verified_match and (now - self._last_verified_at) < 60.0:
                return cached
            return SpeakerMatch(False, reason="insufficient_audio")
            
        candidate = self.provider.embed(audio)
        scored = []
        for profile in self.store.profiles():
            score = max(float(np.dot(candidate, np.asarray(vector, dtype=np.float32))) for vector in profile.embeddings)
            scored.append((score, profile))
        if not scored:
            return SpeakerMatch(False, reason="not_enrolled")
        scored.sort(key=lambda item: item[0], reverse=True)
        score, profile = scored[0]
        runner_up = scored[1][0] if len(scored) > 1 else -1.0
        # Older enrollment runs could store an over-fitted adaptive threshold
        # based on three carefully read prompts. Cap it at the configured
        # operating threshold so natural short/Hinglish turns are not rejected.
        effective_threshold = min(profile.threshold, self.config.threshold)
        
        result = None
        if score < effective_threshold:
            if not strict:
                result = SpeakerMatch(True, None, "unverified", score, "voice_mismatch_soft")
                # Don't update trust cache for soft failures unless we have an active cache,
                # in which case fallback to cache if the mismatch was marginal.
                if self._last_verified_match and (now - self._last_verified_at) < 60.0 and score > effective_threshold - 0.15:
                    return cached
            else:
                result = SpeakerMatch(False, score=score, reason="voice_mismatch")
        elif runner_up >= 0 and score - runner_up < self.config.ambiguity_margin:
            if not strict:
                result = SpeakerMatch(True, profile.name, profile.role, score, "ambiguous_voice_soft")
            else:
                result = SpeakerMatch(False, score=score, reason="ambiguous_voice")
        else:
            result = SpeakerMatch(True, profile.name, profile.role, score, "matched")
            
        if result and result.accepted and result.reason == "matched":
            self._last_verified_match = result
            self._last_verified_at = now
            
        return result
