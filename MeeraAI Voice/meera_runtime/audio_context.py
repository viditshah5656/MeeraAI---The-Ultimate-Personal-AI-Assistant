from __future__ import annotations

import asyncio
import math
import re
import tempfile
import wave
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class AudioContext:
    """What the microphone heard around the user's turn.

    This is deliberately separate from ASR.  Speech recognition answers "what
    words were spoken"; this layer answers "what else was in the acoustic scene".
    """

    speech_present: bool = False
    music_present: bool = False
    ambient_present: bool = False
    rms: float = 0.0
    peak: float = 0.0
    duration_seconds: float = 0.0
    scene: str = "quiet"
    music_confidence: float = 0.0
    song_title: str = ""
    song_artist: str = ""
    song_album: str = ""
    song_year: str = ""
    song_confidence: float = 0.0
    recognition_error: str = ""
    sample_path: str = ""
    
    # Adaptive Prosody Metrics
    user_wpm: float = 0.0
    user_pitch: float = 0.0
    user_volume: float = 0.0
    # Confidence-rated paralinguistic cues. These describe how the turn
    # sounded relative to this speaker's own baseline; they are never treated
    # as proof of a private emotional state.
    vocal_arousal: float = 0.5
    vocal_valence: float = 0.0
    vocal_confidence: float = 0.0
    vocal_state: str = "uncertain"
    volume_ratio: float = 1.0
    pitch_ratio: float = 1.0
    pace_ratio: float = 1.0

    def prompt_text(self) -> str:
        parts = [f"Acoustic scene: {self.scene}."]
        if self.speech_present:
            parts.append("The user's voice is present.")
        if self.music_present:
            parts.append(f"Music is present (confidence {self.music_confidence:.2f}).")
        if self.song_title:
            artist = f" by {self.song_artist}" if self.song_artist else ""
            parts.append(f"The music recognizer identified: {self.song_title}{artist}.")
            if self.song_album:
                parts.append(f"Album: {self.song_album}.")
            if self.song_year:
                parts.append(f"Year: {self.song_year}.")
        if self.vocal_confidence >= 0.55 and self.vocal_state != "uncertain":
            parts.append(
                f"The voice sounded {self.vocal_state} relative to the speaker's baseline "
                f"(confidence {self.vocal_confidence:.2f}); treat this as a vocal cue, not a fact about feelings."
            )
        return " ".join(parts)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _spectral_features(samples, sample_rate: int) -> tuple[float, float, float]:
    import numpy as np

    if samples.size < 512:
        return 0.0, 0.0, 0.0
    window = samples[-min(samples.size, sample_rate * 4):]
    window = window * np.hanning(window.size)
    spectrum = np.abs(np.fft.rfft(window)) + 1e-9
    freqs = np.fft.rfftfreq(window.size, 1.0 / sample_rate)
    total = float(np.sum(spectrum))
    centroid = float(np.sum(freqs * spectrum) / total) if total else 0.0
    flatness = float(np.exp(np.mean(np.log(spectrum))) / np.mean(spectrum))
    zcr = float(np.mean(np.abs(np.diff(np.signbit(window)))))
    return centroid, flatness, zcr


def _pitch_autocorrelation(samples, sample_rate: int) -> float:
    import numpy as np
    if samples.size == 0:
        return 0.0
    # Downsample to 8kHz for faster/more robust fundamental frequency detection
    target_rate = 8000
    if sample_rate > target_rate:
        step = int(sample_rate / target_rate)
        audio = samples[::step]
        sr = target_rate
    else:
        audio = samples
        sr = sample_rate
    # Correlate
    corr = np.correlate(audio, audio, mode='full')
    corr = corr[len(corr)//2:]
    # Find the first peak after the initial zero-crossing
    zero_crossings = np.where(np.diff(np.signbit(corr)))[0]
    if len(zero_crossings) == 0:
        return 0.0
    first_zc = zero_crossings[0]
    if first_zc >= len(corr) - 1:
        return 0.0
    peak_idx = first_zc + np.argmax(corr[first_zc:])
    if peak_idx == 0:
        return 0.0
    return float(sr / peak_idx)

def analyze_audio(samples, sample_rate: int = 16000, *, speech_present: bool = True, transcript: str = "") -> AudioContext:
    import numpy as np

    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    if audio.size == 0:
        return AudioContext()
    rms = float(np.sqrt(np.mean(np.square(audio))))
    peak = float(np.max(np.abs(audio)))
    centroid, flatness, zcr = _spectral_features(audio, sample_rate)
    pitch = _pitch_autocorrelation(audio, sample_rate) if speech_present else 0.0
    
    duration_minutes = (audio.size / sample_rate) / 60.0
    wpm = len(transcript.split()) / duration_minutes if duration_minutes > 0 and transcript else 0.0

    # This is a scene estimate, not a claim of perfect audio classification. Music
    # tends to have sustained harmonic energy and lower spectral flatness than room
    # noise. Speech is separately known from the VAD/ASR path.
    harmonic_score = 0.0
    if 250 <= centroid <= 5000:
        harmonic_score += 0.35
    if flatness < 0.35:
        harmonic_score += 0.35
    if zcr < 0.18:
        harmonic_score += 0.15
    if audio.size / sample_rate >= 1.5 and rms > 0.006:
        harmonic_score += 0.15

    music_confidence = max(0.0, min(1.0, harmonic_score))
    music_present = music_confidence >= 0.58
    if speech_present and music_present:
        scene = "speech with background music"
    elif music_present:
        scene = "music"
    elif speech_present and rms > 0.003:
        scene = "speech with ambient sound"
    elif rms > 0.0015:
        scene = "ambient sound"
    else:
        scene = "quiet"
    ctx = AudioContext(
        speech_present=speech_present,
        music_present=music_present,
        ambient_present=rms > 0.0015,
        rms=rms,
        peak=peak,
        duration_seconds=audio.size / sample_rate,
        scene=scene,
        music_confidence=music_confidence,
        user_wpm=wpm,
        user_pitch=pitch,
        user_volume=rms,
    )
    return ctx


class VocalStateTracker:
    """Personalized, conservative vocal-state estimator.

    Acoustic energy is useful for arousal but weak for positive-versus-negative
    valence.  We therefore normalize against the owner's rolling baseline and
    only name happy/upset/sad-like states when lexical and acoustic evidence
    agree.  The settings interface only needs ``get`` and ``set``.
    """

    _POSITIVE = re.compile(r"(?i)\b(?:great|amazing|awesome|happy|excited|love|won|fixed|perfect|yes!)\b")
    _NEGATIVE = re.compile(
        r"(?i)\b(?:angry|mad|hate|annoyed|frustrated|sad|upset|hurt|terrible|awful|failed|"
        r"broken|wrong|useless|not working|doesn't work|does not work)\b"
    )
    _SAD = re.compile(r"(?i)\b(?:sad|down|hurt|lonely|lost|grief|crying)\b")

    def __init__(self, settings) -> None:
        self.settings = settings
        raw = settings.get("owner_vocal_baseline", {}) or {}
        self.volume = float(raw.get("volume", 0.0) or 0.0)
        self.pitch = float(raw.get("pitch", 0.0) or 0.0)
        self.wpm = float(raw.get("wpm", 0.0) or 0.0)
        self.samples = int(raw.get("samples", 0) or 0)

    @staticmethod
    def _ratio(value: float, baseline: float) -> float:
        if value <= 0 or baseline <= 0:
            return 1.0
        return max(0.25, min(4.0, value / baseline))

    def enrich(self, context: AudioContext, transcript: str = "") -> AudioContext:
        if not context.speech_present:
            return context
        vr = self._ratio(context.user_volume, self.volume)
        pr = self._ratio(context.user_pitch, self.pitch)
        wr = self._ratio(context.user_wpm, self.wpm)
        context.volume_ratio, context.pitch_ratio, context.pace_ratio = vr, pr, wr

        # Log ratios keep one loud sample from dominating. Pitch and pace are
        # intentionally lower-weight because short ASR turns make them noisy.
        log_v = math.log2(vr)
        log_p = math.log2(pr)
        log_w = math.log2(wr)
        activation = max(-1.0, min(1.0, .58 * log_v + .22 * log_p + .20 * log_w))
        context.vocal_arousal = max(0.0, min(1.0, .5 + .42 * activation))

        positive = bool(self._POSITIVE.search(transcript))
        negative = bool(self._NEGATIVE.search(transcript))
        sad_words = bool(self._SAD.search(transcript))
        context.vocal_valence = 0.65 if positive and not negative else (-0.65 if negative else 0.0)

        enough_baseline = self.samples >= 3
        cue_strength = min(1.0, abs(activation))
        context.vocal_confidence = (0.30 + .50 * cue_strength) if enough_baseline else 0.15
        if negative and context.vocal_arousal >= .65:
            context.vocal_state = "possibly upset and highly activated"
            context.vocal_confidence = max(context.vocal_confidence, .68)
        elif positive and context.vocal_arousal >= .62:
            context.vocal_state = "possibly excited or happy"
            context.vocal_confidence = max(context.vocal_confidence, .68)
        elif sad_words and context.vocal_arousal <= .42:
            context.vocal_state = "possibly low or sad"
            context.vocal_confidence = max(context.vocal_confidence, .64)
        elif context.vocal_arousal >= .72:
            context.vocal_state = "loud or highly activated"
        elif context.vocal_arousal <= .30:
            context.vocal_state = "quiet or low-energy"
        else:
            context.vocal_state = "uncertain"

        # Learn ordinary turns slowly. Strong or lexically emotional turns are
        # excluded so the baseline does not immediately normalize them away.
        if not positive and not negative and .30 <= context.vocal_arousal <= .70:
            alpha = .35 if self.samples < 5 else .06
            self.volume = context.user_volume if self.volume <= 0 else (1 - alpha) * self.volume + alpha * context.user_volume
            if context.user_pitch > 0:
                self.pitch = context.user_pitch if self.pitch <= 0 else (1 - alpha) * self.pitch + alpha * context.user_pitch
            if context.user_wpm > 0:
                self.wpm = context.user_wpm if self.wpm <= 0 else (1 - alpha) * self.wpm + alpha * context.user_wpm
            self.samples += 1
            self.settings.set("owner_vocal_baseline", {
                "volume": self.volume, "pitch": self.pitch, "wpm": self.wpm, "samples": self.samples,
            })
        return context


def save_wav(samples, sample_rate: int, directory: Path) -> Path:
    import numpy as np

    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"audio_scene_{next(tempfile._get_candidate_names())}.wav"
    audio = np.asarray(samples, dtype=np.float32).reshape(-1)
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return path


def recognize_song(path: Path, timeout_seconds: float = 15.0) -> AudioContext:
    """Try Shazam recognition when the user explicitly asks about the music.

    ShazamIO is optional so normal offline voice operation never depends on it.
    """
    result = AudioContext(music_present=True, scene="music", sample_path=str(path))
    try:
        from shazamio import Shazam
    except Exception as exc:
        result.recognition_error = f"song recognition unavailable: {exc}"
        return result

    async def _recognize():
        return await Shazam().recognize(str(path))

    try:
        data = asyncio.run(asyncio.wait_for(_recognize(), timeout=timeout_seconds))
        track = data.get("track", {}) if isinstance(data, dict) else {}
        result.song_title = str(track.get("title") or "").strip()
        result.song_artist = str(track.get("subtitle") or "").strip()
        sections = track.get("sections") or []
        metadata = {}
        if sections and isinstance(sections[0], dict):
            for item in sections[0].get("metadata") or []:
                if isinstance(item, dict) and item.get("title"):
                    metadata[str(item["title"]).lower()] = str(item.get("text") or "")
        result.song_album = metadata.get("album", "")
        result.song_year = metadata.get("released", "")
        result.song_confidence = 0.95 if result.song_title else 0.0
        if not result.song_title:
            result.recognition_error = "no matching song was returned"
    except Exception as exc:
        result.recognition_error = f"song recognition failed: {exc}"
    return result
