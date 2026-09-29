"""BharatGen Sooktam-2 Multilingual TTS Engine for MeeraAI.

Provides reference-guided zero-shot voice synthesis for Hindi, Gujarati,
and Indian English with fast Euler ODE solving and barge-in cancellation.
"""

from __future__ import annotations

import contextlib
import logging
import os
import re
import sys
import tempfile
import threading
import time
import warnings
from pathlib import Path
from typing import Callable

import numpy as np
import sounddevice as sd
import soundfile as sf
import torch

from config import TTSConfig
from .cancellation import CancellationToken
from .voice import reinitialize_audio_devices

logger = logging.getLogger(__name__)

# Suppress library warnings and progress bars
warnings.filterwarnings("ignore")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.pop("PYTHONHASHSEED", None)

# Ensure Windows console encoding does not crash on Indic characters
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass


@contextlib.contextmanager
def silence_all_output():
    """Silence third-party stdout/stderr, progress bars, and clean environment."""
    warnings.filterwarnings("ignore")
    try:
        if sys.stdout:
            sys.stdout.flush()
        if sys.stderr:
            sys.stderr.flush()
    except Exception:
        pass

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    old_stdout_fd = None
    old_stderr_fd = None
    try:
        null_fd = os.open(os.devnull, os.O_RDWR)
        old_stdout_fd = os.dup(1)
        old_stderr_fd = os.dup(2)
        os.dup2(null_fd, 1)
        os.dup2(null_fd, 2)
        os.close(null_fd)
    except Exception:
        pass

    try:
        with open(os.devnull, "w", encoding="utf-8") as devnull:
            sys.stdout = devnull
            sys.stderr = devnull
            yield
    finally:
        try:
            if sys.stdout:
                sys.stdout.flush()
            if sys.stderr:
                sys.stderr.flush()
        except Exception:
            pass
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        if old_stdout_fd is not None:
            try:
                os.dup2(old_stdout_fd, 1)
                os.close(old_stdout_fd)
            except Exception:
                pass
        if old_stderr_fd is not None:
            try:
                os.dup2(old_stderr_fd, 2)
                os.close(old_stderr_fd)
            except Exception:
                pass
        # Never leak PYTHONHASHSEED to child processes
        os.environ.pop("PYTHONHASHSEED", None)


# Unicode script ranges for Indian language routing
_RE_GUJARATI = re.compile(r"[\u0A80-\u0AFF]")
_RE_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_RE_BENGALI = re.compile(r"[\u0980-\u09FF]")
_RE_TAMIL = re.compile(r"[\u0B80-\u0BFF]")
_RE_TELUGU = re.compile(r"[\u0C00-\u0C7F]")
_RE_KANNADA = re.compile(r"[\u0C80-\u0CFF]")
_RE_MALAYALAM = re.compile(r"[\u0D00-\u0D7F]")


def detect_language_for_sooktam(text: str) -> str:
    """Classify text into Sooktam-2 supported language keys."""
    gujarati_count = len(_RE_GUJARATI.findall(text))
    devanagari_count = len(_RE_DEVANAGARI.findall(text))
    if gujarati_count > 0 and gujarati_count >= devanagari_count:
        return "gujarati"
    if devanagari_count > 0:
        return "hindi"
    if len(_RE_TAMIL.findall(text)) > 0:
        return "tamil"
    if len(_RE_TELUGU.findall(text)) > 0:
        return "telugu"
    if len(_RE_KANNADA.findall(text)) > 0:
        return "kannada"
    if len(_RE_BENGALI.findall(text)) > 0:
        return "bengali"
    if len(_RE_MALAYALAM.findall(text)) > 0:
        return "malayalam"
    return "english"


def _patch_torchaudio():
    """Ensure torchaudio loads audio with soundfile when torchcodec is absent."""
    import torchaudio
    if getattr(torchaudio, "_meera_patched", False):
        return

    def _sf_load(filepath, *args, **kwargs):
        data, sr = sf.read(filepath)
        t = torch.from_numpy(data)
        if t.ndim == 1:
            t = t.unsqueeze(0)
        else:
            t = t.t()
        return t.to(torch.float32), sr

    torchaudio.load = _sf_load
    torchaudio._meera_patched = True


class _SilentProgress:
    """Drop-in replacement for the tqdm module that silently iterates.

    f5_tts calls ``progress.tqdm(iterable)`` — it expects a module-like
    object with a ``.tqdm`` attribute, not a plain callable.
    """

    @staticmethod
    def tqdm(iterable, *args, **kwargs):
        return iterable

    def __call__(self, iterable, *args, **kwargs):
        return iterable


_silent_progress = _SilentProgress()


def _patch_f5_tts():
    """Prevent f5_tts from poisoning PYTHONHASHSEED with invalid values."""
    try:
        import f5_tts.model.utils
        def _safe_seed(seed=0):
            import random
            if seed is not None:
                safe_val = int(seed) % 4294967296
                random.seed(safe_val)
                torch.manual_seed(safe_val)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(safe_val)
            os.environ.pop("PYTHONHASHSEED", None)
        f5_tts.model.utils.seed_everything = _safe_seed
        if "f5_tts.api" in sys.modules:
            sys.modules["f5_tts.api"].seed_everything = _safe_seed
    except Exception:
        pass


class SooktamTTSEngine:
    """Native Indian TTS engine powered by BharatGen Sooktam-2."""

    def __init__(self, config: TTSConfig) -> None:
        self.config = config
        self.model_id = config.sooktam_model_id
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = None
        self._lock = threading.Lock()
        self._warmed = False
        self._ref_audio_path: Path | None = None
        self._ref_text: str = ""
        self._active_stream: sd.OutputStream | None = None
        self._stream_lock = threading.Lock()
        self._playback_observer: Callable[[np.ndarray, int], None] | None = None
        self._speech_rate: float = config.speech_rate

    @property
    def speech_rate(self) -> float:
        return self._speech_rate

    def set_speech_rate(self, value: float) -> float:
        self._speech_rate = max(0.80, min(1.30, float(value)))
        return self._speech_rate

    def set_playback_observer(self, observer: Callable[[np.ndarray, int], None] | None) -> None:
        with self._lock:
            self._playback_observer = observer

    def _resolve_model_and_reference(self) -> tuple[Path, Path, str]:
        """Download or locate the snapshot files for Sooktam-2 quietly."""
        os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
        os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
        from huggingface_hub import snapshot_download
        with silence_all_output():
            snap = Path(snapshot_download(repo_id=self.model_id, ignore_patterns=["*.pt"], tqdm_class=None))

        if self.config.sooktam_ref_audio and Path(self.config.sooktam_ref_audio).exists():
            ref_path = Path(self.config.sooktam_ref_audio)
            ref_text = self.config.sooktam_ref_text or "Hello, I am Meera. I speak with calm confidence, warmth, and clarity."
        else:
            ref_path = snap / "ref.wav"
            ref_text = (
                "सर, मैं तब से यह कह रही हूँ कि मैंने अपना टिकट कैंसल कर दिया है, "
                "लेकिन अब तक मेरे पैसे वापस नहीं आए हैं। आप इस मामले को देखेंगे भी या नहीं?"
            )
        return snap, ref_path, ref_text

    def start(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            _patch_torchaudio()
            snap, ref_path, ref_text = self._resolve_model_and_reference()
            src_dir = str(snap / "src")
            if src_dir not in sys.path:
                sys.path.insert(0, src_dir)

            _patch_f5_tts()

            with silence_all_output():
                from f5_tts.api import F5TTS

                _patch_f5_tts()
                ckpt = str(snap / "sooktam.safetensors")
                vocab = str(snap / "vocab.txt")

                self._model = F5TTS(
                    model="F5TTS_v1_Base",
                    ckpt_file=ckpt,
                    vocab_file=vocab,
                    ode_method="euler",
                    use_ema=True,
                    device=self.device,
                )
            self._ref_audio_path = ref_path
            self._ref_text = ref_text
            os.environ.pop("PYTHONHASHSEED", None)

    def warmup(self) -> None:
        """Warm up CUDA kernels with a short synthesis turn quietly."""
        with self._lock:
            if self._warmed:
                return
        self.start()
        try:
            temp_out = Path(tempfile.mktemp(suffix=".wav"))
            with silence_all_output():
                self._model.infer(
                    ref_file=str(self._ref_audio_path),
                    ref_text=self._ref_text,
                    gen_text="नमस्ते",
                    tokenizer="cls",
                    cls_language="hindi",
                    nfe_step=self.config.sooktam_nfe_step,
                    speed=self._speech_rate,
                    file_wave=str(temp_out),
                    show_info=lambda *args, **kwargs: None,
                    progress=_silent_progress,
                )
            if temp_out.exists():
                temp_out.unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Sooktam-2 warmup notice: %s", exc)
        finally:
            os.environ.pop("PYTHONHASHSEED", None)
        with self._lock:
            self._warmed = True

    def interrupt_speech(self) -> bool:
        """Immediately stop ongoing audio playback."""
        with self._stream_lock:
            if self._active_stream is not None:
                try:
                    self._active_stream.stop()
                    self._active_stream.close()
                except Exception:
                    pass
                self._active_stream = None
                return True
        return False

    def synthesize(self, text: str, output_path: Path, token: CancellationToken) -> Path:
        """Synthesize audio file for text without playing."""
        token.raise_if_cancelled()
        self.start()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cls_language = detect_language_for_sooktam(text)

        with silence_all_output():
            wav, sr, _ = self._model.infer(
                ref_file=str(self._ref_audio_path),
                ref_text=self._ref_text,
                gen_text=text,
                tokenizer="cls",
                cls_language=cls_language,
                nfe_step=self.config.sooktam_nfe_step,
                speed=self._speech_rate,
                file_wave=str(output_path),
                show_info=lambda *args, **kwargs: None,
                progress=_silent_progress,
            )
        os.environ.pop("PYTHONHASHSEED", None)
        token.raise_if_cancelled()
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("Sooktam-2 did not generate valid output audio")
        return output_path

    def speak(self, text: str, token: CancellationToken | None = None, output_path: Path | None = None) -> Path:
        """Synthesize and play audio for text with cancellation support."""
        if token is None:
            token = CancellationToken()
        token.raise_if_cancelled()
        self.start()

        target_path = output_path or Path(tempfile.mktemp(suffix=".wav", prefix="meera_sooktam_"))
        target_path.parent.mkdir(parents=True, exist_ok=True)

        cls_language = detect_language_for_sooktam(text)
        token.raise_if_cancelled()

        with silence_all_output():
            wav, sr, _ = self._model.infer(
                ref_file=str(self._ref_audio_path),
                ref_text=self._ref_text,
                gen_text=text,
                tokenizer="cls",
                cls_language=cls_language,
                nfe_step=self.config.sooktam_nfe_step,
                speed=self._speech_rate,
                file_wave=str(target_path),
                show_info=lambda *args, **kwargs: None,
                progress=_silent_progress,
            )
        os.environ.pop("PYTHONHASHSEED", None)
        token.raise_if_cancelled()

        if wav is None or len(wav) == 0:
            raise RuntimeError("Sooktam-2 returned empty audio")

        if isinstance(wav, torch.Tensor):
            samples = wav.detach().cpu().numpy().astype(np.float32)
        else:
            samples = np.asarray(wav, dtype=np.float32)

        max_val = float(np.max(np.abs(samples))) if samples.size else 0.0
        if max_val > 1.0:
            samples = samples / max_val

        sample_rate = int(sr) if sr else 24000
        chunk_size = 2048

        def open_stream():
            s = sd.OutputStream(
                samplerate=sample_rate,
                channels=1,
                dtype="float32",
                latency="high",
                blocksize=chunk_size,
            )
            s.start()
            return s

        try:
            stream = open_stream()
        except Exception:
            reinitialize_audio_devices()
            stream = open_stream()

        with self._stream_lock:
            self._active_stream = stream

        try:
            with self._lock:
                observer = self._playback_observer

            idx = 0
            total_samples = len(samples)
            while idx < total_samples:
                token.raise_if_cancelled()
                end_idx = min(idx + chunk_size, total_samples)
                chunk = samples[idx:end_idx]
                if observer is not None:
                    observer(chunk.copy(), sample_rate)
                chunk_matrix = np.ascontiguousarray(chunk.reshape(-1, 1), dtype=np.float32)
                stream.write(chunk_matrix)
                idx = end_idx
        finally:
            with self._stream_lock:
                if self._active_stream is stream:
                    try:
                        stream.stop()
                        stream.close()
                    except Exception:
                        pass
                    self._active_stream = None

        return target_path

    def close(self) -> None:
        self.interrupt_speech()
        with self._lock:
            self._model = None
            self._warmed = False
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            os.environ.pop("PYTHONHASHSEED", None)
