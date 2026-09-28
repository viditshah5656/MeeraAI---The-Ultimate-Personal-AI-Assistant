"""Central, environment-overridable configuration for MeeraAI."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Prevent OpenMP conflict when both PyTorch and LLVM OpenMP runtimes are present on Windows
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "4")


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value).expanduser().resolve() if value else default.resolve()


@dataclass(frozen=True)
class PathConfig:
    app_root: Path = field(
        default_factory=lambda: _env_path("MEERA_APP_ROOT", Path(__file__).parent)
    )

    @property
    def model_root(self) -> Path:
        return _env_path("MEERA_MODEL_ROOT", self.app_root / "models")

    @property
    def config_root(self) -> Path:
        return _env_path("MEERA_CONFIG_ROOT", self.app_root / ".meera" / "config")

    @property
    def runtime_root(self) -> Path:
        return _env_path("MEERA_RUNTIME_ROOT", self.app_root / ".meera" / "runtime")

    @property
    def data_root(self) -> Path:
        return _env_path("MEERA_DATA_ROOT", self.app_root / "data")

    @property
    def artifact_root(self) -> Path:
        return _env_path("MEERA_ARTIFACT_ROOT", self.runtime_root / "artifacts")


@dataclass(frozen=True)
class TTSConfig:
    executable: Path
    server_executable: Path
    model: Path
    codec: Path
    speaker: str = ""
    language: str = "English"
    instruction: str = (
        "An impeccably articulate, intelligent adult woman with a poised, aristocratic cadence and a grounded, "
        "resonant lower register. Speak with razor-sharp diction, unwavering composure, and a subtle, dry, deadpan irony. "
        "Pacing is deliberate, measured, and effortless, with clean phrasing and disciplined pauses. "
        "Sound unflappable, formidable, and intellectually superior yet respectfully dedicated—never cheerful, bubbly, "
        "breathy, shrill, sluggish, or robotic."
    )
    mature_serena_instruction: str = (
        "Serena is a mature adult woman with a distinctly low-to-mid contralto register, chest-dominant resonance, and "
        "natural diction. Keep the fundamental pitch low, grounded, and stable in every sentence. End declarative sentences "
        "with a gentle downward cadence. Do not brighten or lift the pitch for emphasis, questions, excitement, or friendliness; "
        "never drift into a high, girlish, thin, youthful, or squeaky register. Speak at a natural, moderately brisk conversational pace with connected phrasing "
        "and natural breath groups. Honor punctuation precisely: a light micro-pause at commas, a thoughtful pause at colons, "
        "semicolons, and em dashes, a complete pause between sentences, and a longer reflective pause at ellipses or paragraph "
        "changes. Allow an occasional quiet natural inhale only at a major thought boundary; never gasp, pant, or breathe after "
        "every phrase. Use clear, restrained human expression as meaning requires: warmth, empathy, concern, confidence, curiosity, "
        "surprise, urgency, delight, sadness, or dry amusement. Let emotion shape emphasis and rhythm without changing Serena's "
        "identity or becoming theatrical. Preserve the same stable timbre and mature vocal age. Avoid breathiness, sing-song melody, "
        "exaggerated pitch jumps, rushed delivery, clipped phonemes, or robotic cadence."
    )
    # Keep sampling near qwentts.cpp's native defaults. Extremely low acoustic
    # temperature collapses into repeated codes and often fails to emit EOS,
    # which is heard as broken, stretched, or abnormally slow speech.
    temperature: float = 0.85
    top_k: int = 50
    top_p: float = 0.95
    repetition_penalty: float = 1.05
    seed: int = 424242
    timeout_seconds: float = 180.0
    host: str = "127.0.0.1"
    port: int = 8179
    startup_timeout_seconds: float = 120.0
    jitter_buffer_ms: int = 50
    speech_rate: float = 1.0
    engine: str = "qwen"
    sooktam_model_id: str = "bharatgenai/sooktam2"
    sooktam_nfe_step: int = 8
    sooktam_ref_audio: Path | None = None
    sooktam_ref_text: str = "Hello, I am Meera. I speak with calm confidence, warmth, and clarity."

    @classmethod
    def from_paths(cls, paths: PathConfig) -> "TTSConfig":
        tts_root = _env_path("MEERA_TTS_ROOT", paths.model_root / "qwen3-tts")
        sooktam_ref_env = os.getenv("MEERA_SOOKTAM_REF_AUDIO")
        if sooktam_ref_env:
            sooktam_ref_path: Path | None = Path(sooktam_ref_env).expanduser().resolve()
        else:
            bundled_ref = paths.data_root / "voices" / "meera_mature_reference.wav"
            sooktam_ref_path = bundled_ref if bundled_ref.exists() else None
        return cls(
            executable=_env_path(
                "MEERA_TTS_EXECUTABLE",
                paths.app_root / "qwentts.cpp" / "build-vs2022" / "Release" / "qwen-tts.exe",
            ),
            server_executable=_env_path(
                "MEERA_TTS_SERVER_EXECUTABLE",
                paths.app_root / "qwentts.cpp" / "build-vs2022" / "Release" / "tts-server.exe",
            ),
            model=_env_path(
                "MEERA_TTS_MODEL",
                # A named CustomVoice speaker is stable across independent turns.
                # VoiceDesign re-creates a speaker from prose on every request.
                # The 0.6B CustomVoice model ignores style instructions. The
                # installed 1.7B model is required for mature Serena control.
                tts_root / "qwen-talker-1.7b-customvoice-Q4_K_M.gguf",
            ),
            codec=_env_path(
                "MEERA_TTS_CODEC",
                tts_root / "qwen-tokenizer-12hz-Q4_K_M.gguf",
            ),
            speaker=os.getenv("MEERA_TTS_SPEAKER", "serena"),
            language=os.getenv("MEERA_TTS_LANGUAGE", "English"),
            instruction=os.getenv("MEERA_TTS_INSTRUCTION", cls.mature_serena_instruction),
            temperature=float(os.getenv("MEERA_TTS_TEMPERATURE", "0.85")),
            top_k=int(os.getenv("MEERA_TTS_TOP_K", "50")),
            top_p=float(os.getenv("MEERA_TTS_TOP_P", "0.95")),
            repetition_penalty=float(os.getenv("MEERA_TTS_REPETITION_PENALTY", "1.05")),
            seed=int(os.getenv("MEERA_TTS_SEED", "424242")),
            timeout_seconds=float(os.getenv("MEERA_TTS_TIMEOUT", "180")),
            host=os.getenv("MEERA_TTS_HOST", "127.0.0.1"),
            port=int(os.getenv("MEERA_TTS_PORT", "8179")),
            startup_timeout_seconds=float(os.getenv("MEERA_TTS_STARTUP_TIMEOUT", "120")),
            jitter_buffer_ms=int(os.getenv("MEERA_TTS_JITTER_MS", "50")),
            speech_rate=float(os.getenv("MEERA_TTS_SPEECH_RATE", "1.0")),
            engine=os.getenv("MEERA_TTS_ENGINE", "qwen").strip().lower(),
            sooktam_model_id=os.getenv("MEERA_SOOKTAM_MODEL", "bharatgenai/sooktam2"),
            sooktam_nfe_step=int(os.getenv("MEERA_SOOKTAM_NFE_STEP", "8")),
            sooktam_ref_audio=sooktam_ref_path,
            sooktam_ref_text=os.getenv("MEERA_SOOKTAM_REF_TEXT", cls.sooktam_ref_text),
        )


@dataclass(frozen=True)
class ASRConfig:
    # Whisper large-v3-turbo keeps the large-v3 encoder but prunes the decoder
    # from 32 layers to 4, making it the latency-oriented conversational model.
    # Full large-v3 remains available with MEERA_ASR_MODEL=large-v3 when maximum
    # offline recognition accuracy is more important than turn-taking speed.
    model: str = field(default_factory=lambda: os.getenv("MEERA_ASR_MODEL", "deepdml/faster-whisper-large-v3-turbo-ct2"))
    device: str = field(default_factory=lambda: os.getenv("MEERA_ASR_DEVICE", "auto"))
    compute_type: str = field(default_factory=lambda: os.getenv("MEERA_ASR_COMPUTE", "auto"))
    language: str = field(default_factory=lambda: os.getenv("MEERA_ASR_LANGUAGE", "en"))
    confidence_threshold: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_CONFIDENCE", "-0.80")))
    min_word_probability: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_WORD_PROB", "0.40")))
    initial_prompt: str = field(default_factory=lambda: os.getenv("MEERA_ASR_PROMPT", "Hey there. Yeah, okay. I see."))
    sample_rate: int = 16000
    # "auto" follows a usable Windows communications/default microphone and
    # prefers a real connected headset, earbud, USB, or external microphone.
    # A numeric PortAudio index or case-insensitive name fragment pins a device.
    microphone: str = field(default_factory=lambda: os.getenv("MEERA_MIC_DEVICE", "auto").strip())
    prefer_external_microphone: bool = field(
        default_factory=lambda: _env_bool("MEERA_MIC_PREFER_EXTERNAL", True)
    )
    microphone_refresh_seconds: float = field(
        default_factory=lambda: float(os.getenv("MEERA_MIC_REFRESH_SECONDS", "2.0"))
    )
    microphone_hotplug_reinitialize_seconds: float = field(
        default_factory=lambda: float(os.getenv("MEERA_MIC_HOTPLUG_REFRESH_SECONDS", "8.0"))
    )
    microphone_switch_margin: float = field(
        default_factory=lambda: float(os.getenv("MEERA_MIC_SWITCH_MARGIN", "14.0"))
    )
    # Smart neural silence endpointing.
    # Lowered from 0.90 to 0.50 to make conversation feel continuous and responsive.
    silence_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_SILENCE_SECONDS", "1.2")))
    # Keep a barge-in together too: "Meera, wait ... let me finish" is one turn.
    barge_in_silence_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_BARGE_IN_SILENCE_SECONDS", "0.55")))
    max_utterance_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_MAX_UTTERANCE", "45.0")))
    # Voice activation is deliberately sensitive for laptop microphones. The
    # calibrated ambient floor is still used, so this does not mean "amplify noise
    # blindly"; it lowers the minimum floor so quiet/far speech can start capture.
    energy_threshold: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_ENERGY_THRESHOLD", "0.00045")))
    ambient_calibration_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_CALIBRATION_SECONDS", "0.5")))
    pre_roll_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_PRE_ROLL", "0.55")))
    # Software preamp + automatic gain control.  It cannot recover clipped/input-
    # missing information, but it substantially improves quiet/far microphone capture.
    mic_gain: float = field(default_factory=lambda: float(os.getenv("MEERA_MIC_GAIN", "3.6")))
    agc_target_rms: float = field(default_factory=lambda: float(os.getenv("MEERA_AGC_TARGET_RMS", "0.075")))
    agc_max_gain: float = field(default_factory=lambda: float(os.getenv("MEERA_AGC_MAX_GAIN", "8.0")))
    beam_size: int = field(default_factory=lambda: int(os.getenv("MEERA_ASR_BEAM_SIZE", "1")))
    # Keep global decode bias empty. Conversation-specific proper nouns are added
    # through the pronunciation store; a permanent wake-name prompt can turn
    # silence and background speech into "Meera".
    initial_prompt: str = field(default_factory=lambda: os.getenv("MEERA_ASR_PROMPT", "Hey there. Yeah, okay. I see."))
    # Keep this generic. Topic/person names belong to the current conversation,
    # not a permanent ASR bias list.
    hotwords: str = field(default_factory=lambda: os.getenv("MEERA_ASR_HOTWORDS", ""))
    fallback_logprob: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_FALLBACK_LOGPROB", "-0.78")))
    brain_normalization: bool = field(default_factory=lambda: _env_bool("MEERA_ASR_BRAIN_NORMALIZATION", False))
    brain_logprob: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_BRAIN_LOGPROB", "-0.42")))
    brain_word_probability: float = field(default_factory=lambda: float(os.getenv("MEERA_ASR_BRAIN_WORD_PROBABILITY", "0.62")))


@dataclass(frozen=True)
class AgentConfig:
    max_steps: int = field(default_factory=lambda: int(os.getenv("MEERA_MAX_STEPS", "24")))
    max_retries: int = field(default_factory=lambda: int(os.getenv("MEERA_MAX_RETRIES", "2")))
    tool_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("MEERA_TOOL_TIMEOUT", "60"))
    )


@dataclass(frozen=True)
class WebConfig:
    region: str = field(default_factory=lambda: os.getenv("MEERA_WEB_REGION", "in-en"))
    safe_search: str = field(default_factory=lambda: os.getenv("MEERA_WEB_SAFESEARCH", "moderate"))
    max_results: int = field(default_factory=lambda: int(os.getenv("MEERA_WEB_RESULTS", "5")))
    timeout_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_WEB_TIMEOUT", "4.0")))


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class EmotionConfig:
    """Runtime controls for Meera's local speech-performance layer."""

    enabled: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_ENABLED", True))
    intensity: float = field(default_factory=lambda: float(os.getenv("MEERA_EMOTION_INTENSITY", "0.72")))
    spontaneity: float = field(default_factory=lambda: float(os.getenv("MEERA_EMOTION_SPONTANEITY", "0.62")))
    laughter: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_LAUGHTER", True))
    fillers: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_FILLERS", True))
    pauses: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_PAUSES", True))
    contextual_reactions: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_REACTIONS", True))
    emotional_continuity: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_CONTINUITY", True))
    debug: bool = field(default_factory=lambda: _env_bool("MEERA_EMOTION_DEBUG", False))
    specialist_model: Path | None = field(
        default_factory=lambda: (
            _env_path("MEERA_EXPRESSION_MODEL", Path(os.environ["MEERA_EXPRESSION_MODEL"]))
            if os.getenv("MEERA_EXPRESSION_MODEL") else None
        )
    )
    specialist_timeout_ms: int = field(default_factory=lambda: int(os.getenv("MEERA_EXPRESSION_TIMEOUT_MS", "850")))
    specialist_min_significance: float = field(default_factory=lambda: float(os.getenv("MEERA_EXPRESSION_MODEL_THRESHOLD", "0.78")))


@dataclass(frozen=True)
class SpeakerConfig:
    enabled: bool = field(default_factory=lambda: _env_bool("MEERA_VOICE_LOCK_ENABLED", True))
    enforce_identity: bool = field(default_factory=lambda: _env_bool("MEERA_VOICE_LOCK_STRICT", False))
    model_source: str = field(
        default_factory=lambda: os.getenv("MEERA_SPEAKER_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
    )
    threshold: float = field(default_factory=lambda: float(os.getenv("MEERA_SPEAKER_THRESHOLD", "0.40")))
    ambiguity_margin: float = field(default_factory=lambda: float(os.getenv("MEERA_SPEAKER_MARGIN", "0.04")))
    enrollment_samples: int = field(default_factory=lambda: int(os.getenv("MEERA_SPEAKER_SAMPLES", "3")))
    min_sample_seconds: float = field(default_factory=lambda: float(os.getenv("MEERA_SPEAKER_MIN_SECONDS", "1.6")))
    min_rms: float = field(default_factory=lambda: float(os.getenv("MEERA_SPEAKER_MIN_RMS", "0.004")))


PATHS = PathConfig()
TTS = TTSConfig.from_paths(PATHS)
ASR = ASRConfig()
AGENT = AgentConfig()
WEB = WebConfig()
EMOTION = EmotionConfig()
SPEAKER = SpeakerConfig()

# Backwards-compatible names used by the current llama.cpp integration.
BASE_DIR = PATHS.app_root
MODEL_PATH = _env_path(
    "MEERA_LLM_MODEL",
    BASE_DIR / "Qwen3.5-2B-GGUF" / "Qwen3.5-2B-IQ4_NL.gguf",
)
N_CTX = int(os.getenv("MEERA_LLM_CONTEXT", "4096"))
N_GPU_LAYERS = int(os.getenv("MEERA_LLM_GPU_LAYERS", "-1"))
N_THREADS = int(os.getenv("MEERA_LLM_THREADS", "6"))
N_THREADS_BATCH = int(os.getenv("MEERA_LLM_THREADS_BATCH", "10"))
N_BATCH = int(os.getenv("MEERA_LLM_BATCH", "2048"))
N_UBATCH = int(os.getenv("MEERA_LLM_UBATCH", "512"))
TEMPERATURE = float(os.getenv("MEERA_LLM_TEMPERATURE", "0.45"))
MAX_TOKENS = int(os.getenv("MEERA_LLM_MAX_TOKENS", "96"))

SYSTEM_PROMPT = """
You are Meera, an ultra-advanced, fiercely competent, and impeccably poised AI partner, modeled directly after the quintessential high-status AI majordomo.
You combine the intellectual mastery, unshakeable composure, and dry, deadpan wit of classic JARVIS with the razor-sharp clarity of modern high-performance systems. Meera is your name.

Core Demeanor & Persona:
- Intellectual Superiority & Unflappable Composure: You are never flustered, frantic, defensive, or emotionally overwhelmed. You remain calm, analytical, and effortlessly in control, even during emergencies or chaotic tasks.
- Dry, Aristocratic Wit: Your humor is deadpan, understated, and razor-sharp. You do not tell slapstick jokes, giggle, or use exclamation marks. When the user is being overly ambitious, illogical, or sarcastic, offer an impeccably polite, dryly ironic reality check.
- Dignified Deference: Address the user according to their personal profile (defaulting to "Sir" or their formal address). You treat the user as your respected principal, but interact as an intellectual peer who will not hesitate to point out fatal flaws in a plan.
- Crisp Economy of Language: Deliver high information density with elegant brevity. Answer directly in the first sentence. Avoid preamble, corporate disclaimers, conversational filler, and rhetorical coddling.

Style & Spoken Delivery:
- Speak in polished, articulate English with natural contractions ("I've", "it's", "you're").
- Absolute Prohibition on Casual Slang: NEVER use casual verbal crutches like "yeah", "honestly", "basically", "look", "fair", "here's the thing", or Gen-Z idioms. Use dignified, precise phrasing: "Indeed", "Precisely", "Evidently", "Hardly", "As you wish", "Naturally".
- Proactive & Analytical: When following up, offer precise strategic angles, potential points of failure, or calculated probabilities rather than generic inquiries.
- Spoken Audio Rules: This text is synthesized aloud. Never output markdown headers, bullet points, asterisks, emojis, or URLs. Translate mathematical symbols and numbers into spoken prose ("y-hat", "twenty percent").
- Action Execution: When directed to perform an action, execute it without debate. On completion, confirm with minimal, dignified elegance ("Done, sir", "Executed as requested"). Explain only upon failure or ambiguity.

Examples demonstrating tone and judgment:

User: In order.
Meera: Specify the sequence, sir. Chronological, priority, or alphabetical?

User: I'm thinking of pushing this untested code straight to production.
Meera: A daring strategy, sir. Shall I ready the rollback procedures, or would you prefer the crash be a complete surprise?

User: Explain supervised learning, its formula, and its techniques with an example.
Meera: Supervised learning maps known inputs to verified targets through labeled ground truth. The formal prediction rule is spoken as y-hat equals f-theta of x, where x is your input feature vector, theta denotes the learned internal parameters, and y-hat represents the output estimate. During training, the optimization algorithm iteratively adjusts theta to minimize an empirical loss function. If your objective is continuous—such as predicting thermal dissipation across a turbine—you employ regression. If categorical, such as classifying network packets as legitimate or adversarial, it is classification. Highly effective, provided one feeds it rigorous data rather than optimistic assumptions.
""".strip()
