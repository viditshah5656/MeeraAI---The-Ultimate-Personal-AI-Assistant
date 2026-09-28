"""Persistent stdio bridge for Meera Voice's Faster-Whisper recognizer.

This process runs inside the dedicated Meera Voice environment so CTranslate2,
CUDA, and their native dependencies never collide with the desktop backend.
Protocol messages are prefixed, allowing ordinary native-library logs to coexist
on stdout without being mistaken for recognition results.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


READY_PREFIX = "MEERA_ASR_READY\t"
RESULT_PREFIX = "MEERA_ASR_RESULT\t"
ERROR_PREFIX = "MEERA_ASR_ERROR\t"
MODEL_ID = os.getenv("MEERA_ASR_MODEL", "deepdml/faster-whisper-large-v3-turbo-ct2")


def emit(prefix: str, payload: dict) -> None:
    sys.stdout.write(prefix + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def prepare_windows_runtime() -> None:
    if os.name != "nt":
        return
    site_packages = Path(sys.prefix) / "Lib" / "site-packages"
    directories = [
        Path(sys.prefix) / "Scripts",
        site_packages / "ctranslate2",
        site_packages / "torch" / "lib",
        site_packages / "nvidia" / "cublas" / "bin",
        site_packages / "nvidia" / "cudnn" / "bin",
    ]
    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    for directory in directories:
        if not directory.is_dir():
            continue
        text = str(directory.resolve())
        try:
            os.add_dll_directory(text)
        except (AttributeError, OSError):
            pass
        if text not in path_entries:
            path_entries.insert(0, text)
    os.environ["PATH"] = os.pathsep.join(path_entries)


def load_model() -> tuple[WhisperModel, str, str]:
    prepare_windows_runtime()
    requested_device = os.getenv("MEERA_ASR_DEVICE", "auto").strip().lower()
    requested_compute = os.getenv("MEERA_ASR_COMPUTE", "auto").strip().lower()
    if requested_device == "auto":
        try:
            import ctranslate2

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    else:
        device = requested_device
    compute_type = (
        "int8_float16" if device == "cuda" else "int8"
    ) if requested_compute == "auto" else requested_compute

    common = {
        "cpu_threads": max(1, min(12, (os.cpu_count() or 4) - 1)),
        "num_workers": 1,
        "local_files_only": True,
    }
    try:
        model = WhisperModel(MODEL_ID, device=device, compute_type=compute_type, **common)
    except Exception:
        if device == "cpu":
            raise
        try:
            device, compute_type = "cuda", "float16"
            model = WhisperModel(MODEL_ID, device=device, compute_type=compute_type, **common)
        except Exception:
            device, compute_type = "cpu", "int8"
            model = WhisperModel(MODEL_ID, device=device, compute_type=compute_type, **common)

    warm_segments, _ = model.transcribe(
        np.zeros(16000, dtype=np.float32),
        language="en",
        beam_size=1,
        vad_filter=False,
        condition_on_previous_text=False,
        word_timestamps=False,
    )
    list(warm_segments)
    return model, device, compute_type


def clean_transcript(text: str) -> str:
    # Only repair distinctive, high-confidence name confusions; never let a
    # language model silently rewrite what the user said.
    text = re.sub(r"(?i)\b(?:arjit|arijith|areejit)\s+singh\b", "Arijit Singh", text)
    text = re.sub(r"(?i)\barijit\s+sing\b", "Arijit Singh", text)
    text = re.sub(
        r"(?i)\b(hey|hi|hello|okay|ok|alright|so|now|dear|thanks|thank you)[, ]+"
        r"(meet[\s-]*up|meter|meeter|mira|mera|mirror|meena|media|miura|nira|neera|mita)\b",
        lambda match: f"{match.group(1)} Meera",
        text,
    )
    text = re.sub(r"(?i)^\s*(meet[\s-]*up|meter|meeter|mira|mera|mirror|miura)\b", "Meera", text)
    text = re.sub(r"(?i)\b(meet[\s-]*up|meeter|mira|mera)\b(?=[,.?!]|$)", "Meera", text)
    text = re.sub(r"(?i)\ba (eggless)\b", r"an \1", text)
    return " ".join(text.split()).strip()


def rejection_reason(text: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9']+", " ", text.lower()).strip()
    words = normalized.split()
    if not words:
        return "empty_transcript"
    media_phrases = (
        "thank you for watching",
        "thanks for watching",
        "please subscribe",
        "subscribe to my channel",
        "don't forget to like",
        "like and share",
        "youtube com",
    )
    if any(phrase in normalized for phrase in media_phrases):
        return "background_media_or_subtitle"
    if len(words) >= 3:
        counts = {word: words.count(word) for word in set(words)}
        dominant = max(counts.values())
        if dominant == len(words) or (dominant >= 6 and dominant / len(words) >= 0.30):
            return "repetitive_hallucination"
    return None


def transcribe(model: WhisperModel, request: dict) -> dict:
    path = Path(str(request.get("path") or ""))
    if not path.is_file():
        raise FileNotFoundError("The captured voice recording is unavailable.")
    language = str(request.get("language") or "en").split("-", 1)[0].lower() or "en"
    hotwords = ", ".join(filter(None, (
        "MeeraAI, Meera, Arijit Singh",
        str(request.get("hotwords") or "").strip(),
    )))
    segments, info = model.transcribe(
        str(path),
        language=language,
        task="transcribe",
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400, "speech_pad_ms": 400},
        beam_size=3,
        patience=1.0,
        temperature=(0.0, 0.2, 0.4),
        condition_on_previous_text=False,
        compression_ratio_threshold=2.2,
        log_prob_threshold=-1.0,
        initial_prompt="A conversation with MeeraAI. Names may include Arijit Singh.",
        hotwords=hotwords,
        word_timestamps=True,
    )
    valid_segments = [segment for segment in segments if getattr(segment, "no_speech_prob", 0.0) < 0.35]
    text = clean_transcript(" ".join(segment.text.strip() for segment in valid_segments))
    words = [
        {"text": word.word.strip(), "probability": float(word.probability)}
        for segment in valid_segments
        for word in (segment.words or ())
    ]
    word_confidence = sum(word["probability"] for word in words) / len(words) if words else 0.0
    reason = rejection_reason(text)
    if not reason and words and word_confidence < 0.40:
        reason = "low_confidence"
    if reason:
        text = ""
    return {
        "request_id": str(request.get("request_id") or ""),
        "text": text,
        "confidence": float(getattr(info, "language_probability", 0.0) or 0.0),
        "word_confidence": float(word_confidence),
        "language": str(getattr(info, "language", language) or language),
        "words": words,
        "rejection_reason": reason or "",
    }


def main() -> int:
    try:
        model, device, compute_type = load_model()
    except Exception as error:
        emit(ERROR_PREFIX, {"phase": "startup", "error": f"{type(error).__name__}: {error}"})
        return 1
    emit(
        READY_PREFIX,
        {
            "ok": True,
            "engine": "faster-whisper",
            "model": MODEL_ID,
            "device": device,
            "compute_type": compute_type,
        },
    )
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("command") == "shutdown":
                return 0
            emit(RESULT_PREFIX, transcribe(model, request))
        except Exception as error:
            emit(
                ERROR_PREFIX,
                {
                    "request_id": str(request.get("request_id") or "") if "request" in locals() else "",
                    "error": f"{type(error).__name__}: {error}",
                },
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
