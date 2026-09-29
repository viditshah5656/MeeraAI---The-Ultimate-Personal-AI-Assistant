from __future__ import annotations

import os
import queue
import re
import json
import subprocess
import threading
import time
import urllib.error
import urllib.request
import wave
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import asdict, dataclass
from multiprocessing.connection import Connection
from pathlib import Path
import sys
import logging
from typing import Any

logger = logging.getLogger(__name__)

from config import ASRConfig, TTSConfig
from .cancellation import CancellationToken
from .models import Artifact, ErrorCategory, ToolError, ToolResult
from .audio_context import analyze_audio, save_wav, recognize_song, AudioContext
from .watchdog import watchdog


def reinitialize_audio_devices() -> bool:
    """Refresh PortAudio device topology after hardware connect/disconnect."""
    try:
        import sounddevice as sd
        sd._terminate()
        sd._initialize()
        return True
    except Exception:
        return False


@dataclass(frozen=True)
class AudioInputChoice:
    """A stable, testable description of one PortAudio input endpoint."""

    index: int
    name: str
    hostapi: str
    channels: int
    default_samplerate: float
    score: float

    @property
    def identity(self) -> str:
        return f"{self.name.casefold()}|{self.hostapi.casefold()}"


def select_audio_input(
    devices: list[dict[str, Any]],
    hostapis: list[dict[str, Any]] | tuple[dict[str, Any], ...],
    default_input: int | None,
    *,
    selector: str = "auto",
    compatible: set[int] | None = None,
    prefer_external: bool = True,
) -> AudioInputChoice | None:
    """Rank real microphone endpoints without relying on unstable indexes.

    Windows exposes the same physical microphone through MME, DirectSound,
    WASAPI, and WDM-KS.  The returned identity includes its host API so a hot-plug
    refresh can recover a renumbered endpoint without confusing it with an output
    loopback or another duplicate.
    """
    requested = str(selector or "auto").strip()
    requested_lower = requested.casefold()
    requested_index = int(requested) if requested.isdigit() else None
    auto = requested_lower in {"", "auto", "default"}
    host_names = {
        index: str(api.get("name", f"hostapi-{index}"))
        for index, api in enumerate(hostapis or ())
    }
    choices: list[AudioInputChoice] = []
    external_words = (
        "headset", "headphones", "earbud", "earphone", "airpods", "buds",
        "bluetooth", "hands-free", "hands free", "wireless", "usb", "webcam",
        "external", "boom mic", "communications",
    )
    pseudo_words = (
        "stereo mix", "what u hear", "loopback", "pc speaker", "speaker output",
        "cable output", "sound mapper", "primary sound capture",
    )
    # Prefer the modern endpoint for duplicate Windows devices. MME frequently
    # resamples Bluetooth speech through 44.1 kHz before our 16 kHz capture,
    # softening consonants; WASAPI can expose the headset's native 16 kHz stream.
    # WDM-KS is deeply penalized because it often bypasses Windows APOs and delivers raw static.
    host_bonus = {"windows wasapi": 48.0, "windows directsound": 10.0, "mme": 0.0, "windows wdm-ks": -50.0}

    for index, raw in enumerate(devices):
        channels = int(raw.get("max_input_channels", 0) or 0)
        if channels < 1 or (compatible is not None and index not in compatible):
            continue
        name = str(raw.get("name", f"Input {index}")).strip()
        lowered = name.casefold()
        hostapi = host_names.get(int(raw.get("hostapi", -1)), "Unknown")
        explicit = (
            requested_index == index
            or (not auto and requested_index is None and requested_lower in lowered)
        )
        score = host_bonus.get(hostapi.casefold(), 0.0)
        if index == default_input:
            score += 12.0
        if abs(float(raw.get("default_samplerate", 0.0) or 0.0) - 16000.0) < 1.0:
            score += 8.0
        if any(word in lowered for word in external_words):
            score += 55.0 if prefer_external else 8.0
        if "microphone" in lowered or re.search(r"\bmic\b", lowered):
            score += 14.0
        if any(word in lowered for word in pseudo_words):
            score -= 90.0
        if explicit:
            score += 1000.0
        choices.append(AudioInputChoice(
            index=index,
            name=name,
            hostapi=hostapi,
            channels=channels,
            default_samplerate=float(raw.get("default_samplerate", 0.0) or 0.0),
            score=score,
        ))

    if not choices:
        return None
    if not auto:
        explicit_choices = [choice for choice in choices if choice.score >= 1000.0]
        if explicit_choices:
            return max(explicit_choices, key=lambda choice: (choice.score, -choice.index))
    return max(choices, key=lambda choice: (choice.score, -choice.index))


def prepare_for_speech(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^]]*]\([^)]*\)", "", text)
    text = re.sub(r"\[([^]]+)]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"[*_~]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def split_for_speech(text: str, max_words: int = 28, max_sentences: int = 2) -> list[str]:
    """Split a spoken response into natural conversational breath-groups."""
    clean = prepare_for_speech(text)
    if not clean:
        return []
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if s.strip()]
    if len(sentences) <= 1 and len(clean.split()) <= max_words:
        return [clean]
    chunks: list[str] = []
    current: list[str] = []
    count = 0
    for sentence in sentences:
        words = sentence.split()
        if current and (count + len(words) > max_words or len(current) >= max_sentences):
            chunks.append(" ".join(current))
            current, count = [], 0
        if len(words) > max_words:
            # Rare run-on sentence: prefer clause boundaries, then bounded word cuts.
            clauses = [c.strip() for c in re.split(r"(?<=[,;:])\s+", sentence) if c.strip()]
            for clause in clauses:
                clause_words = clause.split()
                while len(clause_words) > max_words:
                    chunks.append(" ".join(clause_words[:max_words]))
                    clause_words = clause_words[max_words:]
                if clause_words:
                    chunks.append(" ".join(clause_words))
            continue
        current.append(sentence)
        count += len(words)
    if current:
        chunks.append(" ".join(current))
    return chunks


def classify_barge_in(
    transcript: str, *, duration_seconds: float, energy_ratio: float, final: bool
) -> str:
    """Classify overlap as wait, backchannel, or a genuine floor takeover."""
    normalized = re.sub(r"[^a-z0-9']+", " ", transcript.lower()).strip()
    if re.fullmatch(
        r"(?:yeah|yes|yep|yup|mhm|mhmm|right|exactly|true|uh huh|okay|ok|ah|hm|hmm|i see|got it)",
        normalized,
    ) and (final or duration_seconds >= .70):
        return "backchannel"
    if re.fullmatch(r"(?:stop|wait|hold on|hang on|pause|no stop|meera stop)", normalized):
        return "interrupt"
    if len(normalized.split()) >= 2 or (duration_seconds >= .45 and energy_ratio >= 2.2):
        return "interrupt"
    if final and normalized:
        return "interrupt"
    return "wait"


class TTSBackend(ABC):
    @abstractmethod
    def synthesize(self, text: str, output_path: Path, token: CancellationToken) -> ToolResult: ...


class QwenCppTTSBackend(TTSBackend):
    def __init__(self, config: TTSConfig) -> None:
        self.config = config
        self._process: subprocess.Popen[bytes] | None = None
        self._owns_process = False
        self._lock = threading.Lock()
        self._warmed = False
        self._speech_rate = max(.85, min(1.30, config.speech_rate))
        self._active_token: CancellationToken | None = None
        self._active_response = None
        self._playback_observer = None
        # PortAudio's Windows MME backend can corrupt its heap when an input
        # stream and output stream are opened concurrently from different
        # threads.  Barge-in waits on this event, then opens the microphone only
        # after the speaker stream is fully started.
        self._playback_ready = threading.Event()

    @property
    def speech_rate(self) -> float:
        return self._speech_rate

    def set_speech_rate(self, value: float) -> float:
        self._speech_rate = max(.85, min(1.50, float(value)))
        return self._speech_rate

    def set_playback_observer(self, observer) -> None:
        """Publish played PCM to the barge-in echo detector."""
        with self._lock:
            self._playback_observer = observer

    def interrupt_speech(self) -> bool:
        """Cancel generation immediately without unloading the resident model."""
        with self._lock:
            token = self._active_token
            response = self._active_response
        if token is None and response is None:
            return False
        if token is not None:
            token.cancel()
        # Closing the streaming HTTP response tells tts-server that its client
        # disappeared. Its native on_chunk callback then aborts the Qwen decode
        # loop instead of finishing audio nobody will hear.
        if response is not None:
            try:
                response.close()
            except Exception:
                pass
        return True

    def wait_for_playback_start(self, running, timeout: float = 180.0) -> bool:
        """Wait until output is open, or synthesis ends before playback starts."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if running.done():
                return False
            if self._playback_ready.wait(0.01):
                return not running.done()
        return False

    def validate(self) -> list[str]:
        return [str(path) for path in (self.config.server_executable, self.config.model, self.config.codec) if not path.is_file()]

    @property
    def base_url(self) -> str:
        return f"http://{self.config.host}:{self.config.port}"

    @property
    def model_mode(self) -> str:
        name = self.config.model.name.lower()
        if "voicedesign" in name:
            return "voicedesign"
        if "customvoice" in name:
            return "customvoice"
        return "base"

    @property
    def model_alias(self) -> str:
        size = "1-7b" if "1.7b" in self.config.model.name.casefold() else "0-6b"
        return f"meera-qwen3-tts-{self.model_mode}-{size}"

    def _probe(self) -> bool:
        try:
            with urllib.request.urlopen(f"{self.base_url}/v1/models", timeout=1) as response:
                return response.status == 200 and self.model_alias in response.read().decode("utf-8")
        except (OSError, urllib.error.URLError):
            return False

    def start(self) -> None:
        missing = self.validate()
        if missing:
            raise FileNotFoundError("; ".join(missing))
        if self._probe():
            return
        log_dir = self.config.model.parents[1] / ".meera" / "runtime" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = open(log_dir / "tts-server.log", "ab", buffering=0)
        command = [
            str(self.config.server_executable),
            "--model", str(self.config.model),
            "--codec", str(self.config.codec),
            "--alias", self.model_alias,
            "--host", self.config.host,
            "--port", str(self.config.port),
            "--lang", self.config.language,
            "--max-batch", "1",
        ]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log_file, stderr=subprocess.STDOUT, creationflags=flags)
        log_file.close()
        with self._lock:
            self._process = process
            self._owns_process = True
            watchdog.register_subprocess("qwen_tts_server", process, probe=self._probe)
        deadline = time.monotonic() + self.config.startup_timeout_seconds
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"TTS server exited during startup with code {process.returncode}")
            if self._probe():
                return
            time.sleep(0.25)
        self.close()
        raise TimeoutError("TTS server startup timed out")

    def close(self) -> None:
        watchdog.unregister("qwen_tts_server")
        with self._lock:
            process = self._process
            owns_process = self._owns_process
            self._process = None
            self._owns_process = False
            self._warmed = False
        if owns_process and process and process.poll() is None:
            process.terminate()
            try:
                process.wait(5)
            except subprocess.TimeoutExpired:
                process.kill()

    def warmup(self) -> None:
        """Pay one-time model/codec initialization cost before the first user turn."""
        with self._lock:
            if self._warmed:
                return
        self.start()
        request = self._request(
            "Ready.",
            "pcm",
            self.config.instruction + " Speak briefly with a steady conversational rhythm.",
        )
        with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
            audio = response.read()
        if not audio:
            raise RuntimeError("TTS warmup returned no audio")
        with self._lock:
            self._warmed = True

    def _request_payload(self, spoken: str, response_format: str, instruction: str | None = None) -> bytes:
        # Qwen normally emits about five 12 Hz codec tokens per spoken word. A generous
        # bounded budget prevents rare non-terminating generations from becoming a
        # minute of stretched or repeated audio.
        max_new_tokens = max(64, min(640, len(spoken.split()) * 8 + 48))
        # VoiceDesign has no persistent named speaker embedding. Its instruction
        # is part of speaker generation, so accepting a different emotion/research
        # prompt per turn creates audible identity drift. Use one immutable acoustic
        # prompt; native speed may still change without redesigning the speaker.
        effective_instruction = (
            self.config.instruction
            if self.model_mode == "voicedesign"
            else instruction or self.config.instruction
        )
        # Speed is controlled natively by the TTS performance prompt. Applying
        # WSOLA independently to small streaming buffers produces discontinuities,
        # stretched phonemes and zero-sample gaps.
        if self._speech_rate >= 1.06:
            effective_instruction += " Speak slightly faster with connected phrasing; never rush or clip phonemes."
        elif self._speech_rate <= .94:
            effective_instruction += " Speak slightly slower with connected phrasing; never stretch vowels or separate words unnaturally."
        if self.model_mode == "voicedesign" and len(effective_instruction) > 440:
            # Hard safety boundary: VoiceDesign is an acoustic attribute encoder,
            # not an LLM system prompt. Prevent future expression/config changes
            # from silently recreating the long-prompt failure mode.
            effective_instruction = effective_instruction[:440].rsplit(" ", 1)[0].rstrip(" ,;.") + "."
        payload = {
            "input": spoken,
            # VoiceDesign has no named speaker. Keep the field empty even if an old
            # environment variable contains a CustomVoice speaker name.
            "voice": "" if self.model_mode == "voicedesign" else self.config.speaker,
            "instructions": effective_instruction,
            "response_format": response_format,
            "temperature": self.config.temperature,
            "top_k": self.config.top_k,
            "top_p": self.config.top_p,
            "repetition_penalty": self.config.repetition_penalty,
            # qwentts.cpp supports a deterministic seed. VoiceDesign otherwise
            # resamples the designed timbre and can sound like different women.
            "seed": self.config.seed,
            "max_new_tokens": max_new_tokens,
            "stream": True,
            "speed": self._speech_rate,
        }
        if self.model_mode == "voicedesign":
            payload["language"] = "English"
        return json.dumps(payload).encode("utf-8")

    def _request(self, spoken: str, response_format: str, instruction: str | None = None) -> urllib.request.Request:
        return urllib.request.Request(
            f"{self.base_url}/v1/audio/speech",
            data=self._request_payload(spoken, response_format, instruction),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

    def speak_streaming(
        self,
        text: str,
        output_path: Path,
        token: CancellationToken,
        instruction: str | None = None,
    ) -> ToolResult:
        """Play server PCM immediately and save the same stream as a WAV artifact."""
        missing = self.validate()
        if missing:
            return ToolResult(False, "TTS runtime is incomplete", error=ToolError(ErrorCategory.FILE_NOT_FOUND, "; ".join(missing)))
        spoken = prepare_for_speech(text)
        if not spoken:
            return ToolResult(False, "There is no speakable text", error=ToolError(ErrorCategory.INVALID_INPUT, "Empty text"))

        import numpy as np
        import sounddevice as sd
        # qwentts.cpp currently parses the OpenAI-compatible `speed` field but
        # does not apply it. Changing the playback sample rate couples tempo to
        # pitch and made Serena unnaturally high, so keep the device at 24 kHz
        # and apply one persistent WSOLA time stretcher across the entire stream.
        source_rate = 24000
        playback_rate = source_rate
        time_stretcher = None
        array_reader = array_writer = None
        if abs(self._speech_rate - 1.0) >= .01:
            from audiotsm import wsola
            from audiotsm.io.array import ArrayReader, ArrayWriter

            time_stretcher = wsola(channels=1, speed=self._speech_rate)
            array_reader, array_writer = ArrayReader, ArrayWriter
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_path.with_suffix(output_path.suffix + ".partial")
        started = time.monotonic()
        first_audio_ms = 0
        bytes_received = 0
        underflows = 0
        playback_started = False
        total_samples_written = 0
        output = None
        response = None
        receiver: threading.Thread | None = None
        receive_error: list[Exception] = []
        pcm_queue: queue.Queue[bytes | None] = queue.Queue()
        # Start with a conversational cushion and let measured real-time factor
        # decide whether the whole phrase must be buffered. The former 420â€“720 ms
        # floor made that silence unavoidable even when generation was healthy.
        adaptive_buffer_ms = max(
            110,
            self.config.jitter_buffer_ms,
            min(260, 90 + len(spoken.split()) * 3),
        )
        startup_bytes = int(source_rate * 2 * adaptive_buffer_ms / 1000)
        try:
            token.raise_if_cancelled()
            with self._lock:
                self._active_token = token
                self._playback_ready.clear()
            self.start()
            request = self._request(spoken, "pcm", instruction)
            response = urllib.request.urlopen(request, timeout=self.config.timeout_seconds)
            with self._lock:
                self._active_response = response
            receive_started = time.monotonic()

            first_byte_time = 0.0
            def receive_pcm() -> None:
                nonlocal bytes_received, first_byte_time
                pending = b""
                try:
                    while not token.cancelled:
                        chunk = response.read1(8192)
                        if not chunk:
                            break
                        if first_byte_time == 0.0:
                            first_byte_time = time.monotonic()
                        chunk = pending + chunk
                        complete_length = len(chunk) - (len(chunk) % 2)
                        complete, pending = chunk[:complete_length], chunk[complete_length:]
                        if complete:
                            bytes_received += len(complete)
                            pcm_queue.put(complete)
                except Exception as exc:
                    if not token.cancelled:
                        receive_error.append(exc)
                finally:
                    pcm_queue.put(None)

            receiver = threading.Thread(target=receive_pcm, name="meera-tts-pcm", daemon=True)
            receiver.start()

            # Build a genuine audio lead before opening the sound device.  If initial
            # generation is not safely faster than real time, finish buffering the
            # utterance instead of gambling on an audible mid-sentence underrun.
            prefetched: list[bytes] = []
            prefetched_bytes = 0
            stream_finished = False
            while prefetched_bytes < startup_bytes:
                token.raise_if_cancelled()
                try:
                    item = pcm_queue.get(timeout=0.05)
                except queue.Empty:
                    continue
                if item is None:
                    stream_finished = True
                    break
                prefetched.append(item)
                prefetched_bytes += len(item)

            buffered_seconds = prefetched_bytes / (source_rate * 2.0)
            generation_rtf = (
                (time.monotonic() - (first_byte_time or receive_started)) / buffered_seconds
                if buffered_seconds > 0 else float("inf")
            )
            # RTF check removed to enable true pipelined streaming

            if receive_error:
                raise receive_error[0]
            if not prefetched_bytes:
                raise RuntimeError("TTS server returned no audio")

            def open_output_stream():
                stream = sd.OutputStream(
                    samplerate=playback_rate,
                    channels=1,
                    dtype="float32",
                    latency="low",
                    blocksize=0,
                )
                stream.start()
                return stream

            try:
                output = open_output_stream()
            except Exception:
                # Barge-in has not opened an InputStream yet, so a one-time
                # PortAudio refresh is safe here.
                reinitialize_audio_devices()
                output = open_output_stream()
            self._playback_ready.set()

            with wave.open(str(temporary), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(playback_rate)

                def play_samples(samples) -> None:
                    nonlocal first_audio_ms, playback_started, underflows, total_samples_written
                    if samples.size == 0:
                        return
                    token.raise_if_cancelled()
                    if not playback_started:
                        first_audio_ms = int((time.monotonic() - started) * 1000)
                        playback_started = True
                    samples = np.ascontiguousarray(samples.reshape(-1, 1), dtype=np.float32)
                    with self._lock:
                        observer = self._playback_observer
                    if observer is not None:
                        observer(samples.reshape(-1).copy(), playback_rate)
                    underflows += int(bool(output.write(samples)))
                    total_samples_written += samples.shape[0]
                    pcm16 = np.clip(samples.reshape(-1) * 32768.0, -32768, 32767).astype("<i2")
                    wav.writeframesraw(pcm16.tobytes())

                def play_pcm(data: bytes, *, final: bool = False) -> None:
                    if data:
                        samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
                    else:
                        samples = np.empty(0, dtype=np.float32)
                    if time_stretcher is None:
                        play_samples(samples)
                        return
                    reader = array_reader(samples.reshape(1, -1))
                    writer = array_writer(1)
                    time_stretcher.run(reader, writer, flush=final)
                    play_samples(writer.data.reshape(-1))

                for item in prefetched:
                    play_pcm(item)
                if not stream_finished:
                    while True:
                        token.raise_if_cancelled()
                        try:
                            item = pcm_queue.get(timeout=0.05)
                        except queue.Empty:
                            continue
                        if item is None:
                            break
                        play_pcm(item)
                if receive_error:
                    raise receive_error[0]
                if time_stretcher is not None:
                    play_pcm(b"", final=True)

            # PortAudio's graceful stop drains its final device buffer.  Calling it
            # here (rather than only in cleanup) prevents the last word being clipped.
            output.stop()
            os.replace(temporary, output_path)
            duration_ms = int((time.monotonic() - started) * 1000)
            artifact = Artifact("audio/wav", str(output_path), "Streamed speech", "voice", "")
            return ToolResult(
                True,
                "Speech streamed",
                {
                    "path": str(output_path),
                    "first_packet_ms": int(((first_byte_time or started) - started) * 1000),
                    "first_audio_ms": first_audio_ms,
                    "duration_ms": duration_ms,
                    "buffer_ms": adaptive_buffer_ms,
                    "generation_rtf": round(generation_rtf, 3),
                    "underflows": underflows,
                    "speech_rate": self._speech_rate,
                    "playback_sample_rate": playback_rate,
                    "tempo_processing": "wsola" if time_stretcher is not None else "native",
                },
                duration_ms=duration_ms,
                artifacts=[artifact],
            )
        except TimeoutError as exc:
            return ToolResult(False, str(exc), error=ToolError(ErrorCategory.TIMEOUT, str(exc), True))
        except RuntimeError as exc:
            category = ErrorCategory.CANCELLED if token.cancelled else ErrorCategory.PROCESS_FAILED
            return ToolResult(False, str(exc), error=ToolError(category, str(exc)))
        except (OSError, urllib.error.URLError) as exc:
            return ToolResult(False, "TTS streaming failed", error=ToolError(ErrorCategory.PROCESS_FAILED, str(exc), True))
        except Exception as exc:
            return ToolResult(False, "Audio playback failed", error=ToolError(ErrorCategory.TOOL_ERROR, str(exc), True))
        finally:
            # Do not leave a stale ready signal for the next utterance. Waiters
            # also observe the synthesis future, so failures release them as soon
            # as that future completes.
            self._playback_ready.clear()
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
            if receiver is not None and receiver.is_alive():
                receiver.join(timeout=1.0)
            if output is not None:
                try:
                    if output.active:
                        output.stop()
                    output.close()
                except Exception:
                    pass
            with self._lock:
                if self._active_response is response:
                    self._active_response = None
                if self._active_token is token:
                    self._active_token = None
            if temporary.exists():
                temporary.unlink(missing_ok=True)

    def stop(self) -> bool:
        with self._lock:
            process = self._process
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(3)
            except subprocess.TimeoutExpired:
                process.kill()
            return True
        return False

    def synthesize(
        self,
        text: str,
        output_path: Path,
        token: CancellationToken,
        instruction: str | None = None,
    ) -> ToolResult:
        missing = self.validate()
        if missing:
            return ToolResult(False, "TTS runtime is incomplete", error=ToolError(ErrorCategory.FILE_NOT_FOUND, "; ".join(missing)))
        spoken = prepare_for_speech(text)
        if not spoken:
            return ToolResult(False, "There is no speakable text", error=ToolError(ErrorCategory.INVALID_INPUT, "Empty text"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_path.with_suffix(output_path.suffix + ".partial")
        response = None
        try:
            token.raise_if_cancelled()
            with self._lock:
                self._active_token = token
            self.start()
            # Use the server's cancellable PCM path. A one-shot WAV request does
            # not observe client disconnects until the full utterance is already
            # generated, which made desktop barge-in appear to stop while the GPU
            # silently kept working and blocked the next reply.
            request = self._request(spoken, "pcm", instruction)
            response = urllib.request.urlopen(request, timeout=self.config.timeout_seconds)
            with self._lock:
                self._active_response = response
            bytes_received = 0
            with wave.open(str(temporary), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                while True:
                    token.raise_if_cancelled()
                    chunk = response.read1(8192)
                    if not chunk:
                        break
                    complete_length = len(chunk) - (len(chunk) % 2)
                    if complete_length:
                        wav.writeframesraw(chunk[:complete_length])
                        bytes_received += complete_length
            token.raise_if_cancelled()
            if bytes_received == 0:
                return ToolResult(False, "TTS server returned no audio", error=ToolError(ErrorCategory.PROCESS_FAILED, "Empty PCM response"))
            os.replace(temporary, output_path)
            artifact = Artifact("audio/wav", str(output_path), "Generated speech", "voice", "")
            return ToolResult(True, "Speech generated", {"path": str(output_path)}, artifacts=[artifact])
        except TimeoutError as exc:
            return ToolResult(False, str(exc), error=ToolError(ErrorCategory.TIMEOUT, str(exc), True))
        except RuntimeError as exc:
            return ToolResult(False, str(exc), error=ToolError(ErrorCategory.CANCELLED, str(exc)))
        except (OSError, urllib.error.URLError) as exc:
            category = ErrorCategory.CANCELLED if token.cancelled else ErrorCategory.PROCESS_FAILED
            return ToolResult(False, "Speech cancelled" if token.cancelled else "TTS server request failed", error=ToolError(category, str(exc), not token.cancelled))
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
            with self._lock:
                if self._active_response is response:
                    self._active_response = None
                if self._active_token is token:
                    self._active_token = None
            if temporary.exists():
                temporary.unlink(missing_ok=True)


class HybridTTSBackend(TTSBackend):
    """Hybrid TTS engine pairing BharatGen Sooktam-2 as primary with Qwen3-TTS as secondary fallback."""

    def __init__(self, config: TTSConfig) -> None:
        self.config = config
        self.qwen_backend = QwenCppTTSBackend(config)
        self._sooktam_backend = None
        self._lock = threading.Lock()

    @property
    def sooktam_backend(self):
        with self._lock:
            if self._sooktam_backend is None:
                from .sooktam_tts import SooktamTTSEngine
                self._sooktam_backend = SooktamTTSEngine(self.config)
            return self._sooktam_backend

    @property
    def speech_rate(self) -> float:
        return self.qwen_backend.speech_rate

    def set_speech_rate(self, value: float) -> float:
        rate = self.qwen_backend.set_speech_rate(value)
        if self._sooktam_backend is not None:
            self._sooktam_backend.set_speech_rate(value)
        return rate

    def set_playback_observer(self, observer) -> None:
        self.qwen_backend.set_playback_observer(observer)
        if self._sooktam_backend is not None:
            self._sooktam_backend.set_playback_observer(observer)

    def interrupt_speech(self) -> bool:
        qwen_interrupted = self.qwen_backend.interrupt_speech()
        sooktam_interrupted = False
        if self._sooktam_backend is not None:
            sooktam_interrupted = self._sooktam_backend.interrupt_speech()
        return qwen_interrupted or sooktam_interrupted

    def wait_for_playback_start(self, running, timeout: float = 180.0) -> bool:
        return self.qwen_backend.wait_for_playback_start(running, timeout)

    def validate(self) -> list[str]:
        return self.qwen_backend.validate()

    def start(self) -> None:
        if getattr(self.config, "engine", "sooktam") == "sooktam":
            try:
                self.sooktam_backend.start()
                return
            except Exception as exc:
                logger.warning("Failed to start primary Sooktam TTS: %s; falling back to Qwen", exc)
        self.qwen_backend.start()

    def warmup(self) -> None:
        if getattr(self.config, "engine", "sooktam") == "sooktam":
            try:
                self.sooktam_backend.warmup()
                return
            except Exception as exc:
                logger.warning("Sooktam warmup failed: %s; falling back to Qwen", exc)
        self.qwen_backend.warmup()

    def close(self) -> None:
        if self._sooktam_backend is not None:
            try:
                self._sooktam_backend.close()
            except Exception:
                pass
        self.qwen_backend.close()

    def speak_streaming(
        self,
        text: str,
        output_path: Path,
        token: CancellationToken,
        instruction: str | None = None,
    ) -> ToolResult:
        if getattr(self.config, "engine", "sooktam") == "sooktam":
            try:
                from .sooktam_tts import detect_language_for_sooktam
                lang = detect_language_for_sooktam(text)
                t0 = time.monotonic()
                wav_path = self.sooktam_backend.speak(text, token=token, output_path=output_path)
                duration_ms = int((time.monotonic() - t0) * 1000)
                artifact = Artifact("audio/wav", str(wav_path), "Generated speech", "voice", "")
                return ToolResult(
                    True,
                    "Speech completed",
                    {
                        "path": str(wav_path),
                        "engine": "sooktam-2",
                        "language": lang,
                        "device": self.sooktam_backend.device,
                    },
                    duration_ms=duration_ms,
                    artifacts=[artifact],
                )
            except Exception as exc:
                if token.cancelled:
                    return ToolResult(False, "Speech cancelled", error=ToolError(ErrorCategory.CANCELLED, str(exc)))
                logger.warning("Sooktam TTS streaming failed: %s; falling back to secondary Qwen TTS", exc)
                return self.qwen_backend.speak_streaming(text, output_path, token, instruction)
        return self.qwen_backend.speak_streaming(text, output_path, token, instruction)

    def synthesize(
        self,
        text: str,
        output_path: Path,
        token: CancellationToken,
        instruction: str | None = None,
    ) -> ToolResult:
        if getattr(self.config, "engine", "sooktam") == "sooktam":
            try:
                from .sooktam_tts import detect_language_for_sooktam
                lang = detect_language_for_sooktam(text)
                t0 = time.monotonic()
                wav_path = self.sooktam_backend.synthesize(text, output_path, token)
                duration_ms = int((time.monotonic() - t0) * 1000)
                artifact = Artifact("audio/wav", str(wav_path), "Generated speech", "voice", "")
                return ToolResult(
                    True,
                    "Speech generated",
                    {
                        "path": str(wav_path),
                        "engine": "sooktam-2",
                        "language": lang,
                    },
                    duration_ms=duration_ms,
                    artifacts=[artifact],
                )
            except Exception as exc:
                if token.cancelled:
                    return ToolResult(False, "Speech cancelled", error=ToolError(ErrorCategory.CANCELLED, str(exc)))
                logger.warning("Sooktam TTS synthesis failed: %s; falling back to secondary Qwen TTS", exc)
                return self.qwen_backend.synthesize(text, output_path, token, instruction)
        return self.qwen_backend.synthesize(text, output_path, token, instruction)


def _prepare_windows_cuda_runtime() -> list[str]:
    """Expose CUDA 12 runtime DLLs bundled in Python packages to CTranslate2.

    CTranslate2 loads cuBLAS/cuDNN as native Windows DLLs.  On Windows those
    package-local DLL directories are not always on PATH, even when PyTorch has
    already installed the correct NVIDIA runtime packages.  Discover them from
    the active Python environment instead of requiring a system-wide CUDA install.
    """
    if os.name != "nt":
        return []

    candidates: list[Path] = []
    prefixes = [Path(sys.prefix)]
    base_prefix = getattr(sys, "base_prefix", None)
    if base_prefix and Path(base_prefix) not in prefixes:
        prefixes.append(Path(base_prefix))

    for prefix in prefixes:
        site_packages = prefix / "Lib" / "site-packages"
        candidates.extend([
            site_packages / "nvidia" / "cublas" / "bin",
            site_packages / "nvidia" / "cudnn" / "bin",
            site_packages / "torch" / "lib",
        ])
        # Some Windows CUDA wheels put DLLs in a slightly different package
        # layout. Search only the active environment, not the whole drive.
        nvidia_root = site_packages / "nvidia"
        if nvidia_root.is_dir():
            for dll in nvidia_root.glob("*/bin/cublas64_12.dll"):
                candidates.append(dll.parent)
            for dll in nvidia_root.glob("*/bin/cudnn*.dll"):
                candidates.append(dll.parent)

    added: list[str] = []
    for directory in candidates:
        directory = directory.resolve()
        if not directory.is_dir():
            continue
        text = str(directory)
        if text not in added:
            try:
                os.add_dll_directory(text)
            except (AttributeError, OSError):
                pass
            if text not in os.environ.get("PATH", "").split(os.pathsep):
                os.environ["PATH"] = text + os.pathsep + os.environ.get("PATH", "")
            added.append(text)
    return added


def _asr_worker(connection: Connection, settings: dict[str, Any]) -> None:
    """Own CTranslate2/OpenMP in a process isolated from llama.cpp."""
    try:
        import os
        import warnings
        os.environ.pop("PYTHONHASHSEED", None)
        
        # Suppress noisy NeMo/PyTorch/HF warnings
        os.environ["NEMO_LOG_LEVEL"] = "ERROR"
        os.environ["WANDB_SILENT"] = "true"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        os.environ["GLOG_minloglevel"] = "2"
        warnings.filterwarnings("ignore", module="torch.utils.flop_counter")
        warnings.filterwarnings("ignore", module="huggingface_hub")
        warnings.filterwarnings("ignore")
        
        import logging
        logging.getLogger("nemo_logger").setLevel(logging.ERROR)
        logging.getLogger("nv_one_logger").setLevel(logging.ERROR)
        logging.getLogger("torch.utils.flop_counter").setLevel(logging.ERROR)
        
        import signal
        import numpy as np

        if os.name == "nt":
            import ctypes
            ctypes.windll.kernel32.SetConsoleCtrlHandler(None, True)
            
        is_nemo = "nemo" in settings["model"].lower() or "parakeet" in settings["model"].lower()
        if is_nemo:
            import nemo.collections.asr as nemo_asr
            import tempfile
            import soundfile as sf
            import torch
            
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            import contextlib
            import io
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                model = nemo_asr.models.EncDecCTCModelBPE.from_pretrained(model_name=settings["model"]).to(device)
                import logging
                logging.getLogger("nemo_logger").setLevel(logging.ERROR)
            print(f"[Meera] Speech recognition ready on {device} (NeMo Parakeet CTC).", flush=True)
            connection.send((True, "ready"))
            while True:
                payload = connection.recv()
                if payload is None:
                    break
                audio_arr = payload["audio"]
                
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    sf.write(tmp.name, audio_arr, settings["sample_rate"])
                    tmp_path = tmp.name
                    
                try:
                    import contextlib
                    import io
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        result = model.transcribe(audio=[tmp_path])
                    
                    if isinstance(result, tuple):
                        res = result[0][0]
                    else:
                        res = result[0]
                    
                    if hasattr(res, "text"):
                        text = res.text
                    else:
                        text = str(res)
                except Exception as e:
                    print(f"[ASR Error] {e}")
                    text = ""
                finally:
                    try:
                        os.remove(tmp_path)
                    except: pass
                        
                connection.send((True, {
                    "text": text,
                    "confidence": 1.0,
                    "language": "en",
                    "words": [],
                    "fallback_used": False,
                    "request_id": request.get("request_id", 0),
                }))
            return

        cuda_dirs = _prepare_windows_cuda_runtime()
        from faster_whisper import WhisperModel

        signal.signal(signal.SIGINT, signal.SIG_IGN)

        # Accuracy-first ASR: use Whisper large-v3 on CUDA when available.
        # Unlike the old small model, this is not a semantic shortcut and does
        # not depend on a topic/person vocabulary to guess what was said.
        requested_device = str(settings.get("device", "auto")).lower()
        requested_compute = str(settings.get("compute_type", "auto")).lower()
        if requested_device == "auto":
            try:
                import ctranslate2
                device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            except Exception:
                device = "cpu"
        else:
            device = requested_device
        if requested_compute == "auto":
            # RTX tensor cores run the turbo decoder faster in mixed INT8/FP16,
            # with materially lower VRAM use and no model downgrade.
            compute_type = "int8_float16" if device == "cuda" else "int8"
        else:
            compute_type = requested_compute

        try:
            model = WhisperModel(
                settings["model"],
                device=device,
                compute_type=compute_type,
                cpu_threads=max(1, min(12, (os.cpu_count() or 4) - 1)),
                num_workers=1,
            )
        except Exception:
            if device != "cpu":
                try:
                    # Older CUDA devices may not support efficient INT8 tensor
                    # operations. Keep the same model and retry FP16 on GPU.
                    compute_type = "float16"
                    model = WhisperModel(
                        settings["model"], device="cuda", compute_type=compute_type,
                        cpu_threads=max(1, min(12, (os.cpu_count() or 4) - 1)), num_workers=1,
                    )
                except Exception:
                    # A machine without a usable CUDA stack still gets the same
                    # recognition model on CPU, never a smaller accuracy fallback.
                    device, compute_type = "cpu", "int8"
                    model = WhisperModel(
                        settings["model"], device=device, compute_type=compute_type,
                        cpu_threads=max(1, min(12, (os.cpu_count() or 4) - 1)), num_workers=1,
                    )
            else:
                raise

        # Pay CTranslate2's first encoder/decoder graph cost at startup. Silence
        # is discarded; it never enters conversation history or ASR output.
        warm_segments, _ = model.transcribe(
            np.zeros(settings["sample_rate"], dtype=np.float32),
            language=settings.get("language") or "en",
            beam_size=1,
            vad_filter=False,
            condition_on_previous_text=False,
            word_timestamps=False,
        )
        list(warm_segments)
        print(f"[Meera] Speech recognition ready on {device} ({compute_type}).", flush=True)
        connection.send((True, "ready"))
        while True:
            request = connection.recv()
            if request is None:
                break
            audio = np.asarray(request["audio"], dtype=np.float32).reshape(-1)
            # Capture has already applied noise-aware AGC. Never peak-normalize a
            # second time here: double amplification magnifies room noise and clips
            # consonant transients, which directly hurts recognition.
            audio = audio - float(np.mean(audio)) if audio.size else audio
            audio = np.clip(audio, -0.98, 0.98)

            def decode(language, hotwords, beam_size=None):
                segments, info = model.transcribe(
                    audio,
                    language=language,
                    task="transcribe",
                    # Use internal VAD and temperature fallback to strip noise and avoid hallucination loops.
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=400),
                    beam_size=int(beam_size or settings["beam_size"]),
                    patience=1.0,
                    temperature=(0.0, 0.2, 0.4),
                    condition_on_previous_text=False,
                    compression_ratio_threshold=2.2,
                    log_prob_threshold=-1.0,
                    initial_prompt=str(settings.get("initial_prompt") or "").strip() or None,
                    hotwords=str(hotwords or settings.get("hotwords") or "").strip() or None,
                    # Partial hypotheses stay cheap. The final reconciliation pays
                    # for word confidence/timing so downstream policy never reasons
                    # from metadata that was configured out of existence.
                    word_timestamps=bool(request.get("final", False)),
                )
                valid_segments = [s for s in segments if getattr(s, "no_speech_prob", 0.0) < 0.35]
                text = " ".join(s.text.strip() for s in valid_segments).strip()
                score = float(info.language_probability) if info.language_probability > 0 else 1.0
                words = [
                    {"text": word.word.strip(), "probability": float(word.probability)}
                    for segment in valid_segments for word in (segment.words or ())
                ]
                return {"text": text, "confidence": score, "language": info.language, "words": words}

            req_hotwords = request.get("hotwords") if isinstance(request, dict) else None
            is_final = bool(request.get("final", False))
            # UI partials remain greedy and fast. Canonical input always gets a
            # real beam search, even when a plausible wrong sentence has a high
            # confidence score and therefore would not trigger the old retry.
            primary_beam = max(5, int(settings.get("beam_size", 1))) if is_final else 1
            primary = decode(settings["language"] or "en", req_hotwords, beam_size=primary_beam)
            primary["fallback_used"] = False
            # Keep the common path fast. Only doubtful audio pays for a broader
            # beam, which is especially useful for proper nouns and soft final
            # syllables from a distant or newly connected microphone.
            fallback_threshold = float(settings.get("fallback_logprob", -0.78))
            if primary["confidence"] < fallback_threshold:
                retry = decode(
                    settings["language"] or "en",
                    req_hotwords,
                    beam_size=max(7 if is_final else 3, int(settings.get("beam_size", 1))),
                )
                primary_words = len(primary["words"])
                retry_words = len(retry["words"])
                if (
                    retry["confidence"] >= primary["confidence"] + 0.02
                    or (not primary_words and retry_words)
                ):
                    primary = retry
                primary["fallback_used"] = True
            primary["request_id"] = int(request.get("request_id", 0))
            connection.send((True, primary))
    except EOFError:
        pass
    except Exception as exc:
        try:
            connection.send((False, f"{type(exc).__name__}: {exc}"))
        except (BrokenPipeError, EOFError):
            pass
    finally:
        connection.close()


class MicrophoneASR:
    """Local ASR with microphone VAD and an isolated persistent model worker."""

    def __init__(self, config: ASRConfig) -> None:
        self.config = config
        self._process = None
        self._connection: Connection | None = None
        self._calibrated_threshold = config.energy_threshold
        self._extra_hotwords: list[str] = []
        self._corrections: dict[str, str] = {}
        self.last_confidence = 0.0
        self.last_word_confidence = 0.0
        self.last_language = "en"
        self.last_words: list[dict[str, Any]] = []
        self.last_streaming_text = ""
        self.last_streaming_revision = 0
        self.last_final_revision = 0
        self._partial_hypotheses: deque[str] = deque(maxlen=2)
        self.last_fallback_used = False
        self.last_rejection_reason = ""
        self.last_audio = None
        self.last_input_gain = 1.0
        self.last_raw_rms = 0.0
        self.last_enhanced_rms = 0.0
        self._input_choice: AudioInputChoice | None = None
        self._input_topology: tuple[Any, ...] = ()
        self._last_input_scan = 0.0
        self._last_portaudio_hotplug_refresh = 0.0
        self._input_lock = threading.RLock()
        self._warned_microphone_selector = False
        self._input_noise_profiles: dict[str, tuple[float, float, float]] = {}
        self._asr_request_lock = threading.RLock()
        self._revision_lock = threading.Lock()
        self._next_transcript_revision = 0
        self.last_speech_started_at = 0.0
        self.last_endpoint_at = 0.0
        self.last_endpoint_latency_ms = 0.0

        # Smart real-time endpointing.  The microphone stream is evaluated in
        # neural VAD-sized frames instead of using one large fixed silence timer.
        self._vad_model = None
        self._vad_ready = False
        self._vad_lock = threading.Lock()
        self._noise_rms = max(config.energy_threshold, 1e-5)
        self._noise_p90 = self._noise_rms
        self._last_vad_probability = 0.0
        self._endpoint_reason = ""

    @property
    def input_device(self) -> int | None:
        with self._input_lock:
            return self._input_choice.index if self._input_choice else None

    @property
    def input_device_name(self) -> str:
        with self._input_lock:
            return self._input_choice.name if self._input_choice else "Windows default input"

    def refresh_input_device(self, *, force: bool = False) -> bool:
        """Discover hot-plugged microphones and atomically select the best one.

        Returns True only when the physical input identity changes. Index changes
        caused by Windows renumbering are repaired silently.
        """
        import sounddevice as sd

        now = time.monotonic()
        with self._input_lock:
            refresh_seconds = max(0.25, float(self.config.microphone_refresh_seconds))
            if not force and now - self._last_input_scan < refresh_seconds:
                return False
            self._last_input_scan = now
            hotplug_seconds = max(
                refresh_seconds,
                float(self.config.microphone_hotplug_reinitialize_seconds),
            )
            should_reinitialize = (
                not force
                and self._last_portaudio_hotplug_refresh > 0.0
                and now - self._last_portaudio_hotplug_refresh >= hotplug_seconds
            )
            if self._last_portaudio_hotplug_refresh == 0.0:
                self._last_portaudio_hotplug_refresh = now

        # PortAudio caches the Windows endpoint list. Refresh it only between
        # turns (this method is never called by barge-in) and at a bounded rate.
        # That lets newly paired Bluetooth/USB microphones appear without racing
        # the active speaker output stream.
        if should_reinitialize:
            if reinitialize_audio_devices():
                with self._input_lock:
                    self._last_portaudio_hotplug_refresh = now
                    self._input_topology = ()

        try:
            devices = [dict(item) for item in sd.query_devices()]
            hostapis = [dict(item) for item in sd.query_hostapis()]
            default_value = sd.default.device
            try:
                default_input = int(default_value[0])
            except (TypeError, IndexError, KeyError):
                default_input = int(default_value)
        except Exception as exc:
            logger.warning("Unable to enumerate audio inputs: %s", exc)
            return False

        topology = (
            default_input,
            tuple(
                (
                    str(item.get("name", "")),
                    int(item.get("hostapi", -1)),
                    int(item.get("max_input_channels", 0) or 0),
                    float(item.get("default_samplerate", 0.0) or 0.0),
                )
                for item in devices
                if int(item.get("max_input_channels", 0) or 0) > 0
            ),
        )
        with self._input_lock:
            if not force and topology == self._input_topology and self._input_choice is not None:
                return False

        compatible: set[int] = set()
        for index, item in enumerate(devices):
            if int(item.get("max_input_channels", 0) or 0) < 1:
                continue
            try:
                sd.check_input_settings(
                    device=index,
                    channels=1,
                    dtype="float32",
                    samplerate=self.config.sample_rate,
                )
                compatible.add(index)
            except Exception:
                continue

        choice = select_audio_input(
            devices,
            hostapis,
            default_input,
            selector=self.config.microphone,
            compatible=compatible,
            prefer_external=self.config.prefer_external_microphone,
        )
        if choice is None:
            logger.warning("No compatible microphone supports %s Hz mono input", self.config.sample_rate)
            return False

        selector = str(self.config.microphone or "auto").strip().casefold()
        auto = selector in {"", "auto", "default"}
        if not auto:
            requested_found = (
                (selector.isdigit() and choice.index == int(selector))
                or (not selector.isdigit() and selector in choice.name.casefold())
            )
            if not requested_found and not self._warned_microphone_selector:
                print(f"[Mic] Requested input '{self.config.microphone}' is unavailable; using the best compatible microphone.")
                self._warned_microphone_selector = True

        with self._input_lock:
            previous = self._input_choice
            # In automatic mode, retain a healthy current endpoint unless a newly
            # connected device is materially better. This prevents oscillation
            # between duplicate MME, DirectSound, WASAPI, and WDM-KS endpoints.
            if previous is not None and auto and previous.identity != choice.identity:
                # Recreate the old endpoint's current score directly from the
                # ranked compatible list so topology/index changes remain safe.
                ranked_current = None
                for index in compatible:
                    candidate = select_audio_input(
                        devices,
                        hostapis,
                        default_input,
                        selector=str(index),
                        compatible=compatible,
                        prefer_external=self.config.prefer_external_microphone,
                    )
                    if candidate is not None and candidate.identity == previous.identity:
                        ranked_current = AudioInputChoice(
                            index=candidate.index,
                            name=candidate.name,
                            hostapi=candidate.hostapi,
                            channels=candidate.channels,
                            default_samplerate=candidate.default_samplerate,
                            score=candidate.score - 1000.0,
                        )
                        break
                if (
                    ranked_current is not None
                    and choice.score < ranked_current.score + float(self.config.microphone_switch_margin)
                ):
                    choice = ranked_current
            changed = previous is None or previous.identity != choice.identity
            if changed and previous is not None:
                self._input_noise_profiles[previous.identity] = (
                    self._noise_rms,
                    self._noise_p90,
                    self._calibrated_threshold,
                )
            self._input_choice = choice
            self._input_topology = topology

        if changed:
            # The new microphone has its own gain/noise floor. Start conservatively;
            # neural VAD remains primary and the next explicit calibration refines it.
            profile = self._input_noise_profiles.get(choice.identity)
            if profile is None:
                self._noise_rms = max(self.config.energy_threshold, 1e-5)
                self._noise_p90 = self._noise_rms
                self._calibrated_threshold = self.config.energy_threshold
            else:
                self._noise_rms, self._noise_p90, self._calibrated_threshold = profile
            action = "selected" if previous is None else "switched"
            print(f"[Mic] Input {action}: {choice.name} via {choice.hostapi} (device {choice.index}).")
        return changed

    def configure_vocabulary(self, hotwords: list[str], corrections: dict[str, str]) -> None:
        self._extra_hotwords = [word for word in hotwords if word]
        self._corrections = dict(corrections)

    def start(self) -> None:
        self._start_worker()

    def _start_worker(self) -> None:
        if self._process is not None and self._process.is_alive():
            return
        import multiprocessing

        os.environ.pop("PYTHONHASHSEED", None)
        context = multiprocessing.get_context("spawn")
        parent, child = context.Pipe()
        self._process = context.Process(
            target=_asr_worker,
            args=(child, asdict(self.config)),
            name="meera-asr",
            daemon=True,
        )
        self._connection = parent
        self._process.start()
        watchdog.register_mp_process("faster_whisper_asr", self._process)
        timeout = 600.0  # Give it 10 minutes to download NeMo weights
        if not parent.poll(timeout):
            self.close()
            raise TimeoutError("ASR model startup or download timed out")
        ok, message = parent.recv()
        if not ok:
            self.close()
            raise RuntimeError(f"ASR startup failed: {message}")

    def next_transcript_revision(self) -> int:
        with self._revision_lock:
            self._next_transcript_revision += 1
            return self._next_transcript_revision

    def reset_streaming_state(self) -> None:
        self.last_streaming_text = ""
        self.last_streaming_revision = 0
        self._partial_hypotheses.clear()

    def stable_partial(self, text: str) -> str:
        """Return the word prefix shared by two consecutive ASR hypotheses."""
        clean = " ".join(text.split()).strip()
        if not clean:
            return ""
        self._partial_hypotheses.append(clean)
        if len(self._partial_hypotheses) < 2:
            return ""
        previous, current = self._partial_hypotheses
        previous_words = previous.split()
        current_words = current.split()
        shared = 0
        for old, new in zip(previous_words, current_words):
            old_key = re.sub(r"\W+", "", old).casefold()
            new_key = re.sub(r"\W+", "", new).casefold()
            if not old_key or old_key != new_key:
                break
            shared += 1
        return " ".join(current_words[:shared])

    def transcribe(self, audio: Any, *, revision: int | None = None, final: bool = False) -> str:
        """Decode one revision through the single owner of the ASR IPC pipe."""
        request_id = revision if revision is not None else self.next_transcript_revision()
        with self._asr_request_lock:
            self._start_worker()
            assert self._connection is not None
            combined_hotwords = " ".join([w for w in (self._extra_hotwords + [self.config.hotwords]) if w])
            self._connection.send({
                "audio": audio,
                "hotwords": combined_hotwords,
                "request_id": request_id,
                "final": final,
            })
            if not self._connection.poll(600):
                self.close()
                raise TimeoutError("ASR model startup or weights download timed out after 10 minutes")
            ok, message = self._connection.recv()
        if not ok:
            self.close()
            raise RuntimeError(f"ASR failed: {message}")
        response_id = int(message.get("request_id", request_id))
        if response_id != request_id:
            raise RuntimeError(f"ASR response mismatch: expected revision {request_id}, got {response_id}")
        if not final and response_id < self.last_streaming_revision:
            return ""
        self.last_confidence = float(message.get("confidence", -1.0))
        self.last_language = str(message.get("language", "en"))
        self.last_words = list(message.get("words", []))
        probabilities = []
        for word in self.last_words:
            try:
                probabilities.append(float(word.get("probability", 0.0)))
            except (TypeError, ValueError, AttributeError):
                continue
        self.last_word_confidence = (
            sum(probabilities) / len(probabilities) if probabilities else 0.0
        )
        self.last_fallback_used = bool(message.get("fallback_used", False))
        text = self._correct_transcript(str(message.get("text", "")))
        if final:
            text = self._reconcile_final_with_partial(text, self.last_streaming_text, self.last_words)
        rejection = self.transcript_rejection_reason(text)
        self.last_rejection_reason = rejection or ""
        
        if rejection:
            if final or response_id >= self.last_streaming_revision:
                self.last_streaming_text = ""
            return ""
        
        if self.last_confidence < self.config.confidence_threshold or (self.last_word_confidence < self.config.min_word_probability and len(self.last_words) > 0):
            self.last_rejection_reason = "low_confidence"
            if final or response_id >= self.last_streaming_revision:
                self.last_streaming_text = ""
            return ""
        else:
            visible_text = text if final else self.stable_partial(text)
            self.last_streaming_text = visible_text
            self.last_streaming_revision = response_id
            if final:
                self.last_final_revision = response_id
            return visible_text

    @staticmethod
    def _reconcile_final_with_partial(text: str, stable_partial: str, words: list[dict]) -> str:
        """Drop one weak endpoint-only tail token, never a confident final word."""
        final_tokens = text.split()
        partial_tokens = stable_partial.split()
        if len(partial_tokens) < 4 or len(final_tokens) != len(partial_tokens) + 1 or not words:
            return text
        key = lambda value: re.sub(r"\W+", "", value).casefold()
        if [key(token) for token in final_tokens[:len(partial_tokens)]] != [key(token) for token in partial_tokens]:
            return text
        try:
            probability = float(words[-1].get("probability", 1.0))
        except (TypeError, ValueError, AttributeError):
            return text
        if probability >= .62:
            return text
        punctuation = "".join(char for char in text.rstrip() if char in ".?!")
        return stable_partial.rstrip(" .?!") + (punctuation or ".")

    @staticmethod
    def transcript_rejection_reason(text: str) -> str | None:
        """Reject common silence/background-media hallucinations before routing."""
        normalized = re.sub(r"[^a-z0-9']+", " ", text.lower()).strip()
        words = normalized.split()
        if not words:
            return "empty_transcript"
        
        # Short replies are valid conversational turns. Reject only distinctive
        # subtitle/media artifacts here; acoustic energy and no-speech probability
        # already guard silence before this text-level check.
        if normalized in {
            "thanks for watching", "thanks for watching guys", "subscribe to the channel",
            "please subscribe", "like and subscribe", "not at all sorry",
        }:
            return "background_media_or_subtitle"
            
        media_spam = (
            "thank you for watching",
            "thanks for watching",
            "please subscribe",
            "subscribe to my channel",
            "don't forget to like",
            "dont forget to like",
            "like and share",
            "www youtube com",
            "youtube com",
        )
        if any(phrase in normalized for phrase in media_spam):
            return "background_media_or_subtitle"
        
        HALLUCINATION_BLOCKLIST = [
            r"\bal[- ]?fatihah\b", r"\bsurah\b", r"\bbismillah\b", r"\bayah\b",
            r"\bamen\b", r"\bhallelujah\b", r"\bquran\b",
            r"\bamara\.org\b", r"\bsubtitles? by\b", r"\btranslated by\b",
            r"\bclosed captions?\b", r"\btranscription by\b", r"\bcopyright\b",
            r"\[music\]", r"\[applause\]", r"\[laughter\]",
        ]
        if any(re.search(pat, text.lower()) for pat in HALLUCINATION_BLOCKLIST):
            return "known_hallucination"
        if len(words) >= 3:
            counts = {word: words.count(word) for word in set(words)}
            dominant = max(counts.values())
            unique_ratio = len(counts) / len(words)
            if dominant == len(words) and len(words) >= 3:
                return "repetitive_hallucination"
            if dominant >= 6 and dominant / len(words) >= .30:
                return "repetitive_hallucination"
            if len(words) >= 16 and unique_ratio < .24:
                return "low_information_repetition"
        return None

    def _correct_transcript(self, text: str) -> str:
        """Apply only wake-name cleanup and explicit user-taught aliases."""
        # Comprehensive phonetic normalization for wake-name "Meera"
        text = re.sub(
            r"(?i)\b(hey|hi|hello|okay|ok|alright|so|now|dear|thanks|thank you|good morning|good afternoon|good evening)[, ]+(meet[\s-]*up|meter|meeter|mira|mera|mirror|meena|media|miura|nira|neera|mita)\b",
            lambda match: f"{match.group(1)} Meera",
            text,
        )
        text = re.sub(
            r"(?i)^\s*(meet[\s-]*up|meter|meeter|mira|mera|mirror|miura)\b",
            "Meera",
            text,
        )
        text = re.sub(
            r"(?i)\b(meet[\s-]*up|meeter|mira|mera)\b(?=[,.?!]|$)",
            "Meera",
            text,
        )
        for alias, canonical in sorted(self._corrections.items(), key=lambda item: len(item[0]), reverse=True):
            alias_pattern = r"[\s,;:-]+".join(re.escape(part) for part in re.split(r"[\s-]+", alias))
            text = re.sub(rf"(?i)\b{alias_pattern}\b", canonical, text)
        text = re.sub(r"(?i)\ba (eggless)\b", r"an \1", text)
        text = re.sub(r"(?i)\bnarindra\b", "Narendra", text)
        return text

    def close(self) -> None:
        """Stop the ASR worker and release its IPC resources safely."""
        watchdog.unregister("faster_whisper_asr")
        process = self._process
        connection = self._connection
        self._process = None
        self._connection = None
        if connection is not None:
            try:
                connection.send(None)
            except Exception:
                pass
            try:
                connection.close()
            except Exception:
                pass
        if process is not None:
            try:
                if process.is_alive():
                    process.terminate()
                process.join(timeout=3)
            except Exception:
                pass
            try:
                if process.is_alive():
                    process.kill()
            except Exception:
                pass

    def _load_smart_vad(self) -> None:
        """Load Silero VAD once for low-latency streaming endpoint detection."""
        if self._vad_ready:
            return
        try:
            from silero_vad import load_silero_vad
            # ONNX keeps the endpoint detector lightweight and CPU-bound, avoiding
            # competition with the Qwen/CT2 GPU workloads.
            self._vad_model = load_silero_vad(onnx=True)
            self._vad_ready = True
        except Exception as exc:
            # Keep the assistant usable even if the optional smart VAD package is
            # unavailable.  The fallback below still uses adaptive energy VAD.
            self._vad_model = None
            self._vad_ready = False
            print(f"[VAD] Smart Silero VAD unavailable; using adaptive fallback ({type(exc).__name__}: {exc})")

    def _reset_vad(self) -> None:
        if self._vad_model is None:
            return
        try:
            with self._vad_lock:
                reset = getattr(self._vad_model, "reset_states", None)
                if reset is not None:
                    reset()
        except Exception:
            pass

    def _vad_probability(self, mono) -> float:
        """Return a streaming speech probability for one 512-sample frame."""
        if self._vad_model is None:
            return 0.0
        try:
            import numpy as np
            import torch

            frame = np.asarray(mono, dtype=np.float32).reshape(-1)
            if frame.size != 512:
                return 0.0
            tensor = torch.from_numpy(frame)
            with self._vad_lock, torch.inference_mode():
                value = self._vad_model(tensor, self.config.sample_rate)
            probability = float(value.item() if hasattr(value, "item") else value)
            probability = max(0.0, min(1.0, probability))
            self._last_vad_probability = probability
            return probability
        except Exception:
            return 0.0

    def calibrate(self) -> float:
        """Measure the room floor and prime the neural endpoint detector."""
        import numpy as np
        import sounddevice as sd

        self._load_smart_vad()
        self.refresh_input_device(force=True)
        frames = int(self.config.sample_rate * self.config.ambient_calibration_seconds)
        recording = None
        for attempt in range(2):
            try:
                recording = sd.rec(
                    frames,
                    samplerate=self.config.sample_rate,
                    channels=1,
                    dtype="float32",
                    device=self.input_device,
                )
                sd.wait()
                break
            except Exception as exc:
                if attempt == 0 and reinitialize_audio_devices():
                    with self._input_lock:
                        self._input_topology = ()
                    self.refresh_input_device(force=True)
                    time.sleep(0.2)
                    continue
                print(f"[Mic] Ambient calibration recording failed: {exc}")
                recording = np.zeros((frames, 1), dtype=np.float32)
        samples = recording.reshape(-1) if recording is not None else np.zeros((0,), dtype=np.float32)
        if samples.size:
            samples = samples - float(np.mean(samples))
            block = max(256, int(self.config.sample_rate * 0.032))
            rms_values = []
            for start in range(0, len(samples) - block + 1, block):
                part = samples[start:start + block]
                rms_values.append(float(np.sqrt(np.mean(np.square(part))) + 1e-9))
            if rms_values:
                rms_values_np = np.asarray(rms_values, dtype=np.float32)
                self._noise_rms = float(np.median(rms_values_np))
                self._noise_p90 = float(np.percentile(rms_values_np, 90))
            else:
                self._noise_rms = float(np.sqrt(np.mean(np.square(samples))) + 1e-9)
                self._noise_p90 = self._noise_rms
        else:
            self._noise_rms = self.config.energy_threshold
            self._noise_p90 = self._noise_rms

        # Lower the hard floor substantially; the neural VAD is now the primary
        # speech/non-speech decision, with energy acting only as a safety signal.
        self._calibrated_threshold = max(
            self.config.energy_threshold,
            self._noise_rms * 1.20,
            self._noise_p90 * 1.05,
        )
        with self._input_lock:
            if self._input_choice is not None:
                self._input_noise_profiles[self._input_choice.identity] = (
                    self._noise_rms,
                    self._noise_p90,
                    self._calibrated_threshold,
                )
        print(
            f"[Mic] Adaptive floor={self._calibrated_threshold:.5f}; "
            f"noise_rms={self._noise_rms:.5f}; smart_vad={self._vad_ready}")
        return self._calibrated_threshold

    @property
    def calibrated_threshold(self) -> float:
        return self._calibrated_threshold

    def _enhance_captured_audio(self, audio):
        """Apply one noise-aware, speech-active AGC stage before Whisper."""
        import numpy as np

        x = np.asarray(audio, dtype=np.float32).reshape(-1)
        if x.size == 0:
            return x
        x = x - float(np.mean(x))
        rms = float(np.sqrt(np.mean(np.square(x))) + 1e-8)
        peak = float(np.max(np.abs(x)) + 1e-8)

        # Whole-utterance RMS is biased downward by pre-roll and pauses. Estimate
        # loudness from active 20 ms frames so silence cannot cause extreme gain.
        frame_size = max(80, int(self.config.sample_rate * 0.020))
        usable = (x.size // frame_size) * frame_size
        if usable:
            framed = x[:usable].reshape(-1, frame_size)
            frame_rms = np.sqrt(np.mean(np.square(framed), axis=1) + 1e-12)
            activity_floor = max(self._noise_rms * 1.8, self.config.energy_threshold * 1.4)
            active = frame_rms[frame_rms >= activity_floor]
            speech_rms = float(np.percentile(active, 55)) if active.size else rms
        else:
            speech_rms = rms

        target_rms = float(self.config.agc_target_rms)
        max_gain = max(1.0, min(12.0, float(self.config.agc_max_gain)))
        # Normalize from speech-active intensity. Do not force a minimum boost:
        # a nearby headset already at target level must stay at unity gain rather
        # than having consonant transients pushed against the limiter.
        desired = target_rms / max(speech_rms, 1e-6)
        gain = min(max_gain, desired, 0.92 / peak)
        # Allow attenuation for an already-hot external microphone. Hard forcing
        # gain >= one was the old clipping bug.
        gain = max(0.20, gain)
        enhanced = np.clip(x * gain, -0.96, 0.96).astype(np.float32)
        self.last_input_gain = float(gain)
        self.last_raw_rms = rms
        self.last_enhanced_rms = float(np.sqrt(np.mean(np.square(enhanced))) + 1e-8)
        return enhanced

    def _fallback_voice_probability(self, energy: float) -> float:
        """Energy/SNR fallback expressed on the same 0..1 scale as neural VAD."""
        snr = energy / max(self._noise_rms, 1e-5)
        if snr <= 1.15:
            return 0.02
        if snr >= 5.0:
            return 0.95
        return float((snr - 1.15) / (5.0 - 1.15))

    def capture(self):
        """Capture one utterance using neural speech endpointing, not a fixed timer.

        The detector runs at 32 ms resolution. Endpointing uses hysteresis plus a
        conversational hold window, so a one-second thinking pause remains part
        of the same utterance instead of becoming an incomplete request.
        """
        import numpy as np
        import sounddevice as sd

        self.refresh_input_device()
        rate = self.config.sample_rate
        frame_samples = 512  # Silero's trained 16 kHz streaming frame.
        block_seconds = frame_samples / rate
        pre_roll_frames = max(1, int(self.config.pre_roll_seconds / block_seconds))
        pre_roll = deque(maxlen=pre_roll_frames)
        chunks = []
        started = False
        speech_frames = 0
        low_frames = 0
        ambiguous_frames = 0
        recent_probs = deque(maxlen=24)  # ~768 ms rolling speech history.
        recent_energies = deque(maxlen=24)
        self._endpoint_reason = ""
        self.last_speech_started_at = 0.0
        self.last_endpoint_at = 0.0
        self.last_endpoint_latency_ms = 0.0
        self._reset_vad()

        # Hysteresis: once speech starts, a little weaker probability is enough to
        # keep the turn alive.  This is materially more forgiving than raw energy.
        start_prob = 0.55
        continue_prob = 0.35
        end_prob = 0.20
        # Trailing silence is harmless to Whisper; losing the rest of a spoken
        # sentence is not. Never endpoint a completed turn before this window.
        min_quiet_frames = max(1, int(round(max(0.35, self.config.silence_seconds) / block_seconds)))

        for attempt in range(2):
            chunks = []
            started = False
            speech_frames = 0
            low_frames = 0
            ambiguous_frames = 0
            peak_prob = 0.0
            pre_roll.clear()
            recent_probs.clear()
            recent_energies.clear()
            self._reset_vad()
            try:
                with sd.InputStream(
                    device=self.input_device,
                    samplerate=rate,
                    channels=1,
                    dtype="float32",
                    blocksize=frame_samples,
                ) as stream:
                    deadline = time.monotonic() + self.config.max_utterance_seconds
                    while time.monotonic() < deadline:
                        block, _ = stream.read(frame_samples)
                        mono = block.reshape(-1).astype(np.float32, copy=True)
                        if mono.size < frame_samples:
                            continue
                        mono -= float(np.mean(mono))
                        energy = float(np.sqrt(np.mean(np.square(mono))) + 1e-8)
                        neural_prob = self._vad_probability(mono)
                        energy_prob = self._fallback_voice_probability(energy)
                        # Silero is the primary modality.  Energy can rescue a very quiet
                        # utterance when the VAD probability is temporarily conservative.
                        prob = max(neural_prob, energy_prob * 0.55)
                        recent_probs.append(prob)
                        recent_energies.append(energy)
                        peak_prob = max(peak_prob, prob)

                        if not started:
                            pre_roll.append(mono)
                            # Learn a newly connected microphone's idle floor in
                            # place. Only clearly non-speech frames participate,
                            # so the first words cannot train the threshold upward.
                            if neural_prob < 0.08 and len(recent_energies) >= 8:
                                idle_floor = float(np.median(np.asarray(recent_energies, dtype=np.float32)))
                                self._noise_rms = self._noise_rms * 0.92 + idle_floor * 0.08
                                self._noise_p90 = max(self._noise_rms, self._noise_p90 * 0.95 + energy * 0.05)
                                self._calibrated_threshold = max(
                                    self.config.energy_threshold,
                                    self._noise_rms * 1.20,
                                    self._noise_p90 * 1.05,
                                )
                            if self._vad_ready:
                                is_voice = neural_prob >= 0.55 and energy >= self._calibrated_threshold * 1.05
                            else:
                                is_voice = prob >= 0.60 and energy >= self._calibrated_threshold * 1.20
                            if is_voice:
                                speech_frames += 1
                            else:
                                speech_frames = 0
                            if speech_frames >= 7: # ~224ms of sustained speech
                                started = True
                                chunks.extend(pre_roll)
                                low_frames = 0
                                ambiguous_frames = 0
                        else:
                            chunks.append(mono)
                            if prob >= continue_prob:
                                low_frames = 0
                                ambiguous_frames = 0
                            elif prob <= end_prob:
                                low_frames += 1
                                ambiguous_frames = 0
                            else:
                                ambiguous_frames += 1
                                low_frames = 0

                            # Dynamic endpoint hold. When Silero neural VAD reports a clean
                            # collapse to zero speech probability, endpoint promptly.
                            recent_mean = float(np.mean(recent_probs)) if recent_probs else 0.0
                            recent_strong = sum(p >= continue_prob for p in recent_probs)
                            if neural_prob <= 0.08 and energy <= self._calibrated_threshold * 1.25:
                                adaptive_quiet = 10
                                required_quiet = max(min_quiet_frames, adaptive_quiet)
                            elif recent_mean >= 0.48 and recent_strong >= 10:
                                adaptive_quiet = 14
                                required_quiet = max(min_quiet_frames, adaptive_quiet)
                            elif ambiguous_frames:
                                adaptive_quiet = 18
                                required_quiet = max(min_quiet_frames, adaptive_quiet)
                            else:
                                adaptive_quiet = 12
                                required_quiet = max(min_quiet_frames, adaptive_quiet)

                            # A long uninterrupted stream must eventually yield even if the
                            # neural model is indecisive; max_utterance_seconds remains only
                            # a safety ceiling, never the normal endpoint rule.
                            if low_frames >= required_quiet:
                                self._endpoint_reason = (
                                    f"speech_end(vad={neural_prob:.2f},energy={energy:.4f},"
                                    f"quiet_frames={low_frames})"
                                )
                                break
                break
            except Exception as exc:
                if attempt == 0 and reinitialize_audio_devices():
                    with self._input_lock:
                        self._input_topology = ()
                    self.refresh_input_device(force=True)
                    time.sleep(0.2)
                    continue
                print(f"[Mic] Microphone stream unavailable: {exc}")
                return None

        if not chunks:
            self.last_audio = None
            return None
        audio = np.concatenate(chunks).reshape(-1)
        duration = audio.size / rate
        raw_rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
        # Discard background noise, faint room hum, or clicks that lack real speech body
        if duration < 0.25 or raw_rms < self._calibrated_threshold * 1.03:
            self.last_audio = None
            return None
        if self._vad_ready and peak_prob < 0.25:
            self.last_audio = None
            return None
        # Boost/AGC only after the speech boundary is known, so room noise is not
        # continually amplified while Meera is waiting for the user's voice.
        audio = self._enhance_captured_audio(audio)
        self.last_audio = audio
        return audio

    def capture_stream(self):
        """Capture audio and yield streaming chunks before endpointing."""
        import numpy as np
        import sounddevice as sd
        import time
        from collections import deque

        self.refresh_input_device()
        rate = self.config.sample_rate
        frame_samples = 512
        block_seconds = frame_samples / rate
        pre_roll_frames = max(1, int(self.config.pre_roll_seconds / block_seconds))
        pre_roll = deque(maxlen=pre_roll_frames)
        chunks = []
        started = False
        speech_frames = 0
        low_frames = 0
        ambiguous_frames = 0
        recent_probs = deque(maxlen=24)
        recent_energies = deque(maxlen=24)
        self._endpoint_reason = ""
        self._reset_vad()

        start_prob = 0.55
        continue_prob = 0.35
        end_prob = 0.20
        min_quiet_frames = max(1, int(round(max(0.35, self.config.silence_seconds) / block_seconds)))
        
        last_yield_time = time.monotonic()
        yield_interval = 0.6  # yield partial transcript every 600ms of active speech

        for attempt in range(2):
            chunks = []
            started = False
            speech_frames = 0
            low_frames = 0
            ambiguous_frames = 0
            peak_prob = 0.0
            has_backchanneled = False
            last_voice_at = 0.0
            pre_roll.clear()
            recent_probs.clear()
            recent_energies.clear()
            self._reset_vad()
            
            try:
                import queue
                q = queue.Queue()
                def audio_callback(indata, frames, time, status):
                    if status:
                        pass # Ignore overflows gracefully
                    q.put(indata.copy())
                    
                with sd.InputStream(
                    device=self.input_device,
                    samplerate=rate,
                    channels=1,
                    dtype="float32",
                    blocksize=frame_samples,
                    callback=audio_callback,
                ):
                    deadline = time.monotonic() + self.config.max_utterance_seconds
                    while time.monotonic() < deadline:
                        try:
                            block = q.get(timeout=0.1)
                        except queue.Empty:
                            continue
                            
                        mono = block.reshape(-1).astype(np.float32, copy=True)
                        if mono.size < frame_samples:
                            continue
                        mono -= float(np.mean(mono))
                        energy = float(np.sqrt(np.mean(np.square(mono))) + 1e-8)
                        neural_prob = self._vad_probability(mono)
                        energy_prob = self._fallback_voice_probability(energy)
                        prob = max(neural_prob, energy_prob * 0.55)
                        recent_probs.append(prob)
                        recent_energies.append(energy)
                        peak_prob = max(peak_prob, prob)

                        if not started:
                            pre_roll.append(mono)
                            if neural_prob < 0.08 and len(recent_energies) >= 8:
                                idle_floor = float(np.median(np.asarray(recent_energies, dtype=np.float32)))
                                self._noise_rms = self._noise_rms * 0.92 + idle_floor * 0.08
                                self._noise_p90 = max(self._noise_rms, self._noise_p90 * 0.95 + energy * 0.05)
                                self._calibrated_threshold = max(
                                    self.config.energy_threshold,
                                    self._noise_rms * 1.20,
                                    self._noise_p90 * 1.05,
                                )
                            is_voice = (neural_prob >= 0.55 if self._vad_ready else prob >= start_prob) and energy >= self._calibrated_threshold * 1.03
                            if is_voice:
                                speech_frames += 1
                            else:
                                speech_frames = 0
                                
                            if speech_frames >= 7:
                                started = True
                                now = time.monotonic()
                                self.last_speech_started_at = now - min(
                                    self.config.pre_roll_seconds,
                                    len(pre_roll) * block_seconds,
                                )
                                last_voice_at = now
                                chunks.extend(pre_roll)
                                low_frames = 0
                                ambiguous_frames = 0
                                last_yield_time = time.monotonic()
                        else:
                            chunks.append(mono)
                            if prob >= continue_prob:
                                low_frames = 0
                                ambiguous_frames = 0
                                last_voice_at = time.monotonic()
                            elif prob <= end_prob:
                                low_frames += 1
                                ambiguous_frames = 0
                            else:
                                ambiguous_frames += 1
                                low_frames = 0

                            recent_mean = float(np.mean(recent_probs)) if recent_probs else 0.0
                            recent_strong = sum(p >= continue_prob for p in recent_probs)
                            
                            if neural_prob <= 0.08 and energy <= self._calibrated_threshold * 1.25:
                                adaptive_quiet = 10
                            elif recent_mean >= 0.48 and recent_strong >= 10:
                                adaptive_quiet = 14
                            elif ambiguous_frames:
                                adaptive_quiet = 18
                            else:
                                adaptive_quiet = 12
                                
                            required_quiet = max(min_quiet_frames, adaptive_quiet)
                            
                            # Deep Semantic Endpointing (Phase 2)
                            text = self.last_streaming_text.strip().lower()
                            if text and low_frames >= adaptive_quiet:
                                if text != getattr(self, "_last_checked_text", ""):
                                    from meera_runtime.semantic_endpointer import is_thought_complete
                                    self._last_checked_text = text
                                    self._last_checked_result = is_thought_complete(text)
                                is_complete = getattr(self, "_last_checked_result", True)
                                if not is_complete:
                                    # Give obvious trailing syntax a little more room,
                                    # without a blocking LLM call or a two-second gap.
                                    required_quiet += 18
                                    has_backchanneled = True
                                    
                            is_final = low_frames >= required_quiet
                            now = time.monotonic()
                            if is_final or (now - last_yield_time >= yield_interval):
                                audio_arr = np.concatenate(chunks).reshape(-1)
                                enhanced = self._enhance_captured_audio(audio_arr)
                                # Commit endpoint telemetry before yielding. The
                                # caller breaks on the final item, so code after
                                # yield is not guaranteed to resume.
                                if is_final:
                                    self.last_endpoint_at = now
                                    if last_voice_at:
                                        self.last_endpoint_latency_ms = max(0.0, (now - last_voice_at) * 1000)
                                yield (enhanced, is_final)
                                last_yield_time = now
                                if is_final:
                                    break
                break
            except Exception as exc:
                if attempt == 0 and reinitialize_audio_devices():
                    with self._input_lock:
                        self._input_topology = ()
                    self.refresh_input_device(force=True)
                    time.sleep(0.2)
                    continue
                print(f"[Mic Stream] Fatal exception: {exc}")
                yield (None, True)
                return

        if not chunks:
            yield (None, True)
            return

        audio = np.concatenate(chunks).reshape(-1)
        duration = audio.size / rate
        raw_rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
        if duration < 0.25 or raw_rms < self._calibrated_threshold * 1.03 or (self._vad_ready and peak_prob < 0.25):
            yield (None, True)
            return
            
        enhanced = self._enhance_captured_audio(audio)
        self.last_audio = enhanced
        # Final yield is already handled inside the loop when is_final == True.
    def capture_for_duration(self, seconds: float = 8.0):
        """Listen to the acoustic scene without waiting for a speech endpoint.

        Used after an explicit request such as "what song is this?" so the music
        that continues after the user's sentence is actually captured.
        """
        import numpy as np
        import sounddevice as sd

        self.refresh_input_device()
        rate = self.config.sample_rate
        blocksize = int(rate * 0.1)
        chunks = []
        deadline = time.monotonic() + max(1.0, min(15.0, float(seconds)))
        for attempt in range(2):
            chunks = []
            try:
                with sd.InputStream(
                    device=self.input_device,
                    samplerate=rate,
                    channels=1,
                    dtype="float32",
                    blocksize=blocksize,
                ) as stream:
                    while time.monotonic() < deadline:
                        block, _ = stream.read(blocksize)
                        chunks.append(block.reshape(-1).copy())
                break
            except Exception as exc:
                if attempt == 0 and reinitialize_audio_devices():
                    with self._input_lock:
                        self._input_topology = ()
                    self.refresh_input_device(force=True)
                    time.sleep(0.2)
                    continue
                return None
        if not chunks:
            return None
        audio = np.concatenate(chunks).reshape(-1)
        self.last_audio = audio
        return audio

    def analyze_scene(self, audio, text: str = "") -> AudioContext:
        return analyze_audio(audio, self.config.sample_rate, speech_present=True, transcript=text)

    def identify_music(self, audio, seconds: float = 8.0) -> AudioContext:
        if audio is None:
            return AudioContext()
        path = save_wav(audio, self.config.sample_rate, self.config.runtime_root / "audio-scene") if hasattr(self.config, "runtime_root") else None
        if path is None:
            # ASRConfig intentionally contains no filesystem path; keep a local temp.
            import tempfile
            path = save_wav(audio, self.config.sample_rate, Path(tempfile.gettempdir()) / "meera-audio")
        return recognize_song(path)

    def listen(self) -> str:
        audio = self.capture()
        return self.transcribe(audio) if audio is not None else ""


class BargeInCapture:
    """Detect near-end speech while Meera talks and reject her speaker echo."""

    def __init__(self, listener: MicrophoneASR) -> None:
        self.listener = listener
        self._reference = deque()
        self._reference_samples = 0
        self._lock = threading.Lock()

    def feed_playback(self, samples, sample_rate: int) -> None:
        """Receive exactly the PCM sent to the output device."""
        import numpy as np

        source = np.asarray(samples, dtype=np.float32).reshape(-1)
        target_rate = self.listener.config.sample_rate
        if sample_rate != target_rate and source.size:
            step = sample_rate / target_rate
            count = max(1, round(source.size / step))
            indices = np.clip((np.arange(count) * step).astype(np.int32), 0, source.size - 1)
            source = source[indices]
        with self._lock:
            self._reference.append(source)
            self._reference_samples += source.size
            limit = target_rate * 3
            while self._reference and self._reference_samples > limit:
                self._reference_samples -= self._reference.popleft().size

    def _recent_reference_rms(self) -> float:
        import numpy as np

        with self._lock:
            if not self._reference:
                return 0.0
            ref = self._reference[-1]
            return float(np.sqrt(np.mean(np.square(ref)))) if ref.size else 0.0

    def _echo_correlation(self, microphone) -> float:
        import numpy as np

        mic = np.asarray(microphone, dtype=np.float32).reshape(-1)
        with self._lock:
            if not self._reference:
                return 0.0
            reference = np.concatenate(tuple(self._reference))
        if mic.size < 80 or reference.size < mic.size:
            return 0.0
        mic = mic - float(np.mean(mic))
        mic_norm = float(np.linalg.norm(mic))
        if mic_norm < 1e-6:
            return 1.0
        # Search recent output delays up to 500 ms with fine phase alignment.
        search_start = max(0, reference.size - mic.size - int(self.listener.config.sample_rate * .50))
        best = 0.0
        best_pos = search_start
        for start in range(search_start, reference.size - mic.size + 1, 16):
            candidate = reference[start:start + mic.size]
            candidate = candidate - float(np.mean(candidate))
            denominator = mic_norm * float(np.linalg.norm(candidate))
            if denominator > 1e-6:
                corr = abs(float(np.dot(mic, candidate)) / denominator)
                if corr > best:
                    best = corr
                    best_pos = start
        if best > 0.15:
            fine_start = max(0, best_pos - 16)
            fine_end = min(reference.size - mic.size, best_pos + 16)
            for start in range(fine_start, fine_end + 1, 2):
                candidate = reference[start:start + mic.size]
                candidate = candidate - float(np.mean(candidate))
                denominator = mic_norm * float(np.linalg.norm(candidate))
                if denominator > 1e-6:
                    best = max(best, abs(float(np.dot(mic, candidate)) / denominator))
        return best

    def capture_while(self, running, interrupt) -> object | None:
        """Detect a user interruption with the same neural endpointing as normal turns."""
        import numpy as np
        import sounddevice as sd

        rate = self.listener.config.sample_rate
        frame_samples = 512
        block_seconds = frame_samples / rate
        pre_roll = deque(maxlen=max(2, int(self.listener.config.pre_roll_seconds / block_seconds)))
        candidates = []
        chunks = []
        started = False
        low_frames = 0
        recent_probs = deque(maxlen=20)
        self.listener._reset_vad()

        # Higher than normal turn-start threshold because Meera's own playback is
        # present.  Echo correlation remains an independent second gate.
        start_prob = 0.40
        # Once the user has interrupted, retain their natural pause rather than
        # immediately resuming Meera in the middle of what they were saying.
        min_quiet_frames = max(
            1,
            int(round(max(0.35, self.listener.config.barge_in_silence_seconds) / block_seconds)),
        )
        continue_prob = 0.23
        end_prob = 0.12
        ref_rms = self._recent_reference_rms()
        speech_floor = max(self.listener.calibrated_threshold * 1.35, ref_rms * 0.40, 0.0016)

        def classify_candidate(audio_arr, *, final: bool) -> tuple[str, str]:
            """Return wait, backchannel, or interrupt without confusing agreement with takeover."""
            text = self.listener.transcribe(audio_arr).strip().lower()
            normalized = re.sub(r"[^a-z0-9']+", " ", text).strip()
            duration = len(audio_arr) / rate
            rms = float(np.sqrt(np.mean(np.square(audio_arr)))) if len(audio_arr) else 0.0
            ratio = rms / max(speech_floor, 1e-6)
            return classify_barge_in(
                normalized, duration_seconds=duration, energy_ratio=ratio, final=final
            ), normalized

        try:
            with sd.InputStream(
                device=self.listener.input_device,
                samplerate=rate,
                channels=1,
                dtype="float32",
                blocksize=frame_samples,
            ) as stream:
                while not running.done() or started:
                    block, _ = stream.read(frame_samples)
                    mono = block.reshape(-1).astype(np.float32, copy=True)
                    if mono.size < frame_samples:
                        continue
                    mono -= float(np.mean(mono))
                    energy = float(np.sqrt(np.mean(np.square(mono))) + 1e-8)
                    neural_prob = self.listener._vad_probability(mono)
                    energy_prob = self.listener._fallback_voice_probability(energy)
                    prob = max(neural_prob, energy_prob * 0.50)
                    recent_probs.append(prob)

                    ref_rms = self._recent_reference_rms()
                    speech_floor = max(self.listener.calibrated_threshold * 1.35, ref_rms * 0.45, 0.0016)

                    if not started:
                        if running.done():
                            return None
                        pre_roll.append(mono)
                        echo = self._echo_correlation(mono)
                        max_echo = 0.25 if ref_rms > 0.003 else 0.34
                        is_voice = prob >= 0.55 and (neural_prob >= 0.55 or energy >= speech_floor * 1.50) and energy >= speech_floor and echo < max_echo
                        if is_voice:
                            candidates.append(mono)
                        else:
                            candidates.clear()
                        # Require 6 frames (~192 ms) of sustained speech so transient clicks
                        # and brief breath noise never cut Meera off prematurely.
                        if len(candidates) >= 6:
                            started = True
                            # Preserve the short acoustic lead-in so the first phoneme
                            # doesn't disappear while VAD decides that speech has begun.
                            chunks.extend(pre_roll)
                            # DO NOT interrupt immediately. Wait for ~800ms of speech to classify if it's a backchannel.
                    else:
                        chunks.append(mono)

                        # Evaluate explicit/meaningful takeovers at ~450 ms, then
                        # classify ordinary short agreement at ~700 ms. A bare
                        # "yes" is a backchannel; "yes, but stop" is an interruption.
                        if len(chunks) in {14, 22}:
                            audio_arr = np.concatenate(chunks).reshape(-1)
                            decision, candidate_text = classify_candidate(audio_arr, final=False)
                            if decision == "backchannel":
                                print(f"\n[Meera] (Heard agreement without yielding the floor: {candidate_text})")
                                started = False
                                chunks.clear()
                                candidates.clear()
                                continue
                            if decision == "interrupt":
                                interrupt()

                        if prob >= continue_prob:
                            low_frames = 0
                        elif prob <= end_prob:
                            low_frames += 1
                        else:
                            low_frames = 0

                        recent_mean = float(np.mean(recent_probs)) if recent_probs else 0.0
                        if neural_prob <= 0.07 and energy <= speech_floor * 1.1:
                            adaptive_quiet = 12
                        elif recent_mean >= 0.45:
                            adaptive_quiet = 18
                        else:
                            adaptive_quiet = 24
                        required_quiet = max(min_quiet_frames, adaptive_quiet)
                        if low_frames >= required_quiet:
                            audio_arr = np.concatenate(chunks).reshape(-1)
                            decision, candidate_text = classify_candidate(audio_arr, final=True)
                            if decision == "backchannel":
                                print(f"\n[Meera] (Heard agreement without yielding the floor: {candidate_text})")
                                started = False
                                chunks.clear()
                                candidates.clear()
                                low_frames = 0
                                continue
                            if decision == "wait":
                                started = False
                                chunks.clear()
                                candidates.clear()
                                low_frames = 0
                                continue
                            interrupt()

                            self.listener._endpoint_reason = (
                                f"barge_speech_end(vad={neural_prob:.2f},energy={energy:.4f},"
                                f"quiet_frames={low_frames})"
                            )
                            break
        except Exception as exc:
            # Never terminate/reinitialize global PortAudio while Meera's output
            # stream is active in another thread. That corrupts the Windows MME
            # heap and kills Python without a traceback. A barge-in detector
            # failure is non-fatal: finish the current speech and retry listening
            # normally on the next turn.
            print(f"[Barge-in] Monitoring unavailable for this reply ({type(exc).__name__}: {exc}).")
            return None

        if not chunks:
            return None
        audio = np.concatenate(chunks).reshape(-1)
        audio = self.listener._enhance_captured_audio(audio)
        self.listener.last_audio = audio
        return audio


def play_wav(path: Path) -> None:
    import numpy as np
    import sounddevice as sd
    try:
        with wave.open(str(path), "rb") as wav:
            channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
            raw = wav.readframes(wav.getnframes())
        dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[width]
        sd.play(np.frombuffer(raw, dtype=dtype).reshape(-1, channels), rate)
        sd.wait()
    except Exception:
        reinitialize_audio_devices()


def stop_playback() -> None:
    import sounddevice as sd
    try:
        sd.stop()
    except Exception:
        pass


def warm_audio_output() -> None:
    """Initialize PortAudio silently during startup instead of on Meera's first reply."""
    import sounddevice as sd

    try:
        with sd.OutputStream(
            samplerate=24000, channels=1, dtype="float32", latency="low", blocksize=0
        ):
            pass
    except Exception:
        reinitialize_audio_devices()
