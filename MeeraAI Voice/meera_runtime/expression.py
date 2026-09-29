"""Context-aware emotional continuity and speech-performance planning for Meera.

The subsystem never touches tool arguments or factual content.  It maintains a
small affective state, selects restrained conversational reactions, and converts
the result into instructions supported by qwentts.cpp's CustomVoice endpoint.
"""

from __future__ import annotations

import json
import math
import re
import sqlite3
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from config import EmotionConfig
from .db import open_database


class Reaction(str, Enum):
    NONE = "none"
    ACKNOWLEDGEMENT = "acknowledgement"
    CURIOSITY = "curiosity"
    SURPRISE = "surprise"
    AMUSEMENT = "amusement"
    LAUGHTER = "laughter"
    CONCERN = "concern"
    EMPATHY = "empathy"
    EXCITEMENT = "excitement"
    RELIEF = "relief"
    CONFUSION = "confusion"
    PLAYFUL_TEASING = "playful_teasing"
    ENCOURAGEMENT = "encouragement"
    CELEBRATION = "celebration"
    THOUGHTFULNESS = "thoughtfulness"
    FRUSTRATION = "frustration"
    CALMING = "calming"


class ResponseType(str, Enum):
    GREETING = "greeting"
    CASUAL_CHAT = "casual_chat"
    QUESTION = "question"
    EXPLANATION = "explanation"
    JOKE = "joke"
    GOOD_NEWS = "good_news"
    BAD_NEWS = "bad_news"
    SURPRISE = "surprise"
    USER_FRUSTRATION = "user_frustration"
    USER_CONFUSION = "user_confusion"
    USER_EXCITEMENT = "user_excitement"
    TASK_START = "task_start"
    TASK_SUCCESS = "task_success"
    TASK_FAILURE = "task_failure"
    ERROR = "error"
    WARNING = "warning"
    IMPORTANT_INFORMATION = "important_information"
    EMOTIONAL_SUPPORT = "emotional_support"
    THINKING = "thinking"
    UNCERTAINTY = "uncertainty"
    GOODBYE = "goodbye"
    NEWS_GENERAL = "news_general"
    NEWS_ENTERTAINMENT = "news_entertainment"
    NEWS_SERIOUS = "news_serious"
    TECH_REVIEW = "tech_review"



@dataclass(frozen=True)
class PersonalityProfile:
    warmth: float = 0.40
    playfulness: float = 0.60
    confidence: float = 0.92
    curiosity: float = 0.76
    humor: float = 0.55
    emotional_expressiveness: float = 0.55
    formality: float = 0.82
    spontaneity: float = 0.70
    patience: float = 0.90
    teasing: float = 0.30


@dataclass(frozen=True)
class VoiceProfile:
    speaker: str
    preferred_energy: float
    preferred_warmth: float
    laughter_style: str
    default_pace: float

    @classmethod
    def for_speaker(cls, speaker: str) -> "VoiceProfile":
        profiles = {
            "vivian": cls("vivian", 0.72, 0.70, "short", 0.66),
            # Serena should remain expressive without acquiring the fast,
            # bright delivery that can make her sound noticeably younger.
            "serena": cls("serena", 0.61, 0.74, "short", 0.56),
            "ryan": cls("ryan", 0.66, 0.68, "short", 0.63),
            "aiden": cls("aiden", 0.62, 0.72, "short", 0.61),
            "dylan": cls("dylan", 0.65, 0.66, "dry", 0.64),
            "eric": cls("eric", 0.59, 0.70, "short", 0.60),
            "ono_anna": cls("ono_anna", 0.57, 0.80, "light", 0.58),
            "sohee": cls("sohee", 0.59, 0.82, "light", 0.59),
            "uncle_fu": cls("uncle_fu", 0.52, 0.76, "warm", 0.55),
        }
        key = speaker.strip().lower()
        return profiles.get(key, cls(key or "designed_female_en", 0.73, 0.68, "short", 0.67))


@dataclass
class EmotionState:
    mood: str = "warm"
    energy: float = 0.64
    warmth: float = 0.70
    curiosity: float = 0.58
    amusement: float = 0.08
    excitement: float = 0.18
    concern: float = 0.06
    surprise: float = 0.05
    frustration: float = 0.02
    confidence: float = 0.88
    social_engagement: float = 0.72
    turn: int = 0
    last_laughter_turn: int = -20
    last_filler_turn: int = -20
    updated_at: float = field(default_factory=time.time)

    def clamp(self) -> None:
        for name in (
            "energy", "warmth", "curiosity", "amusement", "excitement",
            "concern", "surprise", "frustration", "confidence", "social_engagement",
        ):
            value = getattr(self, name)
            setattr(self, name, max(0.0, min(1.0, float(value) if math.isfinite(float(value)) else 0.0)))


@dataclass(frozen=True)
class EmotionContext:
    user_text: str
    response_text: str
    recent_turns: tuple[tuple[str, str], ...] = ()
    task_state: str | None = None
    tool_used: bool = False
    success: bool = True
    speaker: str = "vivian"
    audio_context: Any = None


@dataclass
class SpeechPerformancePlan:
    response_type: ResponseType = ResponseType.CASUAL_CHAT
    primary_emotion: str = "warmth"
    secondary_emotion: str = "calm"
    emotion_intensity: float = 0.25
    reaction: Reaction = Reaction.NONE
    reaction_confidence: float = 0.5
    energy: float = 0.50
    warmth: float = 0.80
    pace: float = 0.55
    pitch_variation: float = 0.34
    vocal_intensity: float = 0.48
    rhythm: str = "conversational"
    sentence_end: str = "natural"
    pause_before: tuple[str, ...] = ()
    emphasis: tuple[str, ...] = ()
    laughter_level: int = 0
    hesitation: bool = False
    filler: str | None = None
    language: str = "en"
    bypassed: bool = False
    fallback_reason: str | None = None

    @classmethod
    def from_mapping(
        cls, payload: dict[str, Any], baseline: "SpeechPerformancePlan | None" = None
    ) -> "SpeechPerformancePlan":
        """Strictly validate untrusted structured output from a local specialist."""
        if not isinstance(payload, dict):
            raise ValueError("Expression output must be a JSON object")
        if len(json.dumps(payload, ensure_ascii=True)) > 8192:
            raise ValueError("Expression output is too large")
        allowed = {
            "primary_emotion", "secondary_emotion", "emotion_intensity", "reaction",
            "reaction_confidence", "energy", "warmth", "pace", "pitch_variation",
            "vocal_intensity", "rhythm", "sentence_end", "laughter_level", "hesitation",
        }
        unknown = set(payload) - allowed
        if unknown:
            raise ValueError(f"Unknown expression fields: {', '.join(sorted(unknown))}")
        numeric = {
            "emotion_intensity", "reaction_confidence", "energy", "warmth", "pace",
            "pitch_variation", "vocal_intensity", "laughter_level",
        }
        for name in numeric.intersection(payload):
            value = payload[name]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                raise ValueError(f"Expression field {name} must be a finite number")
        for name in {"primary_emotion", "secondary_emotion", "rhythm", "sentence_end"}.intersection(payload):
            if not isinstance(payload[name], str) or len(payload[name]) > 64:
                raise ValueError(f"Expression field {name} must be a short string")
        if "hesitation" in payload and not isinstance(payload["hesitation"], bool):
            raise ValueError("Expression field hesitation must be boolean")
        values = asdict(baseline) if baseline else {}
        values.update(payload)
        if "response_type" in values:
            values["response_type"] = ResponseType(values["response_type"])
        if "reaction" in values:
            values["reaction"] = Reaction(values["reaction"])
        return cls(**values).validate()

    def validate(self) -> "SpeechPerformancePlan":
        if not isinstance(self.response_type, ResponseType):
            self.response_type = ResponseType(str(self.response_type))
        if not isinstance(self.reaction, Reaction):
            self.reaction = Reaction(str(self.reaction))
        for name in (
            "emotion_intensity", "reaction_confidence", "energy", "warmth",
            "pace", "pitch_variation", "vocal_intensity",
        ):
            raw = float(getattr(self, name))
            setattr(self, name, max(0.0, min(1.0, raw if math.isfinite(raw) else 0.0)))
        self.laughter_level = max(0, min(4, int(self.laughter_level)))
        self.primary_emotion = str(self.primary_emotion)[:32]
        self.secondary_emotion = str(self.secondary_emotion)[:32]
        self.pause_before = tuple(str(v)[:40] for v in self.pause_before[:4])
        self.emphasis = tuple(str(v)[:40] for v in self.emphasis[:4])
        self.filler = str(self.filler)[:20] if self.filler else None
        return self


@dataclass(frozen=True)
class ExpressionOutput:
    text: str
    tts_instruction: str
    plan: SpeechPerformancePlan
    latency_ms: int


class EmotionStateStore:
    """Persists only compact state and counters, never conversation text."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS emotion_state ("
                "id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at REAL NOT NULL)"
            )

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def load(self) -> EmotionState:
        with self._lock, self._connect() as db:
            row = db.execute("SELECT payload FROM emotion_state WHERE id=1").fetchone()
        if not row:
            return EmotionState()
        try:
            allowed = EmotionState.__dataclass_fields__.keys()
            payload = {key: value for key, value in json.loads(row[0]).items() if key in allowed}
            state = EmotionState(**payload)
            state.clamp()
            return state
        except (TypeError, ValueError, json.JSONDecodeError):
            return EmotionState()

    def save(self, state: EmotionState) -> None:
        state.clamp()
        payload = json.dumps(asdict(state), separators=(",", ":"), ensure_ascii=True)
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO emotion_state(id,payload,updated_at) VALUES(1,?,?) "
                "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
                (payload, time.time()),
            )


class ContextualPerformancePlanner:
    """Low-latency fallback that uses discourse, task outcome and affect together."""

    _tool_markup = re.compile(r"(?is)<tool_call>|</tool_call>|```(?:json|python|powershell|bash)?")
    _numbers_or_targets = re.compile(r"(?:https?://|[A-Za-z]:\\|\b\d+(?:\.\d+)?\b)")

    def __init__(self, config: EmotionConfig, personality: PersonalityProfile) -> None:
        self.config = config
        self.personality = personality

    @staticmethod
    def language(text: str) -> str:
        if re.search(r"[\u0a80-\u0aff]", text):
            return "gu"
        if re.search(r"[\u0900-\u097f]", text):
            return "hi"
        return "en"

    @staticmethod
    def _has(text: str, *patterns: str) -> bool:
        return any(re.search(pattern, text, re.I) for pattern in patterns)

    def classify(self, context: EmotionContext) -> ResponseType:
        user, response = context.user_text.strip(), context.response_text.strip()
        combined = f"{user} {response}"
        if context.task_state == "running":
            return ResponseType.TASK_START
        if context.task_state == "failed" or not context.success:
            return ResponseType.TASK_FAILURE
        if context.task_state == "completed" and context.tool_used:
            return ResponseType.TASK_SUCCESS
            
        if self._has(user, r"\b(news|headlines|update on|what's happening|tech|apple|phone|software|ai|google)\b") or self._has(response, r"\b(news|headlines|update|tech|apple|phone|software|ai|google)\b"):
            if self._has(combined, r"\b(funny|comedy|hilarious|bizarre|florida man|laugh|haha)\b"):
                return ResponseType.NEWS_ENTERTAINMENT
            if self._has(combined, r"\b(die|death|tragedy|accident|crash|sad|serious)\b"):
                return ResponseType.NEWS_SERIOUS
            if self._has(combined, r"\b(apple|tech|phone|software|ai|google|specs|device)\b"):
                return ResponseType.TECH_REVIEW
            return ResponseType.NEWS_GENERAL

        if self._has(user, r"\b(goodbye|bye|good night|see you)\b"):
            return ResponseType.GOODBYE
        if self._has(user, r"\b(hello|hey|hi|good morning|good evening)\b") and len(user.split()) < 10:
            return ResponseType.GREETING
        if self._has(user, r"\b(finally|it works|fixed it|got it done|finished it|passed)\b"):
            return ResponseType.GOOD_NEWS
        if self._has(user, r"\b(lost|deleted|broke|failed|gone|bad news|died|hurt)\b"):
            return ResponseType.BAD_NEWS
        if self._has(user, r"\b(stupid|damn|annoy|frustrat|still (?:isn't|is not|won't|will not)|driving me crazy)\b"):
            return ResponseType.USER_FRUSTRATION
        if self._has(user, r"\b(i don't understand|confused|makes no sense|what do you mean)\b"):
            return ResponseType.USER_CONFUSION
        if self._has(user, r"\b(guess what|no way|you won't believe|seriously)\b"):
            return ResponseType.SURPRISE
        if self._has(user, r"\b(lol|funny|joke|hilarious)\b") or (user.count("!") >= 2 and "?" in user):
            return ResponseType.JOKE
        if self._has(user, r"\b(i'm worried|i am worried|upset|scared|sad|overwhelmed)\b"):
            return ResponseType.EMOTIONAL_SUPPORT
        vocal_state = str(getattr(context.audio_context, "vocal_state", ""))
        vocal_confidence = float(getattr(context.audio_context, "vocal_confidence", 0.0) or 0.0)
        if vocal_confidence >= .64:
            if "upset" in vocal_state:
                return ResponseType.USER_FRUSTRATION
            if "sad" in vocal_state or "low" in vocal_state:
                return ResponseType.EMOTIONAL_SUPPORT
            if "excited" in vocal_state or "happy" in vocal_state:
                return ResponseType.USER_EXCITEMENT
        if self._has(user, r"\b(think|analy[sz]e|consider|reason through|work out|figure out|deep dive)\b"):
            return ResponseType.THINKING
        if self._has(response, r"\b(not sure|uncertain|may|might|probably)\b"):
            return ResponseType.UNCERTAINTY
        if user.endswith("?"):
            return ResponseType.QUESTION
        if len(response.split()) > 45:
            return ResponseType.EXPLANATION
        return ResponseType.CASUAL_CHAT

    def significance(self, kind: ResponseType, context: EmotionContext) -> float:
        base = {
            ResponseType.BAD_NEWS: 0.90, ResponseType.EMOTIONAL_SUPPORT: 0.88,
            ResponseType.GOOD_NEWS: 0.82, ResponseType.USER_FRUSTRATION: 0.82,
            ResponseType.USER_EXCITEMENT: 0.74,
            ResponseType.TASK_FAILURE: 0.82, ResponseType.SURPRISE: 0.78,
            ResponseType.JOKE: 0.68, ResponseType.USER_CONFUSION: 0.62,
            ResponseType.THINKING: 0.60,
            ResponseType.TASK_SUCCESS: 0.58, ResponseType.GREETING: 0.32,
            ResponseType.QUESTION: 0.16, ResponseType.EXPLANATION: 0.12,
        }.get(kind, 0.24)
        continuity = 0.08 if context.recent_turns and kind in {
            ResponseType.GOOD_NEWS, ResponseType.BAD_NEWS, ResponseType.USER_FRUSTRATION
        } else 0.0
        punctuation = min(0.08, 0.025 * context.user_text.count("!"))
        return min(1.0, base + continuity + punctuation)

    def _targets(self, kind: ResponseType, significance: float) -> dict[str, float]:
        targets = {"energy": 0.64, "warmth": 0.70, "curiosity": 0.55, "amusement": 0.05,
                   "excitement": 0.12, "concern": 0.05, "surprise": 0.04,
                   "frustration": 0.01, "confidence": 0.88, "social_engagement": 0.72}
        changes = {
            ResponseType.GOOD_NEWS: {"energy": .78, "excitement": .78, "warmth": .90, "surprise": .30},
            ResponseType.USER_EXCITEMENT: {"energy": .76, "excitement": .68, "warmth": .86},
            ResponseType.BAD_NEWS: {"energy": .52, "concern": .72, "warmth": .74, "confidence": .90, "amusement": 0.0},
            ResponseType.USER_FRUSTRATION: {"energy": .58, "concern": .52, "warmth": .70, "confidence": .92, "frustration": .12},
            ResponseType.EMOTIONAL_SUPPORT: {"energy": .50, "concern": .66, "warmth": .78, "confidence": .88},
            ResponseType.JOKE: {"energy": .67, "amusement": .70, "warmth": .86},
            ResponseType.SURPRISE: {"energy": .72, "surprise": .82, "curiosity": .78},
            ResponseType.USER_CONFUSION: {"energy": .46, "concern": .40, "patience": .95},
            ResponseType.TASK_FAILURE: {"energy": .43, "concern": .56, "confidence": .68},
            ResponseType.TASK_SUCCESS: {"energy": .67, "excitement": .50, "confidence": .88},
            ResponseType.GREETING: {"energy": .61, "warmth": .89, "social_engagement": .84},
        }.get(kind, {})
        targets.update({k: v for k, v in changes.items() if k in targets})
        return {key: value * (0.72 + 0.28 * significance) for key, value in targets.items()}

    def update_state(self, state: EmotionState, kind: ResponseType, significance: float) -> EmotionState:
        elapsed = max(0.0, time.time() - state.updated_at)
        time_decay = min(0.32, elapsed / 900.0)
        baselines = EmotionState()
        for name in ("energy", "amusement", "excitement", "concern", "surprise", "frustration"):
            setattr(state, name, getattr(state, name) * (1.0 - time_decay) + getattr(baselines, name) * time_decay)
        alpha = 0.18 + 0.34 * significance
        for name, target in self._targets(kind, significance).items():
            if hasattr(state, name):
                setattr(state, name, getattr(state, name) * (1.0 - alpha) + target * alpha)
        state.turn += 1
        state.updated_at = time.time()
        state.mood = max(
            ("concerned", state.concern), ("amused", state.amusement),
            ("excited", state.excitement), ("warm", state.warmth * 0.72),
            key=lambda item: item[1],
        )[0]
        state.clamp()
        return state

    def _reaction(self, kind: ResponseType, state: EmotionState, significance: float) -> tuple[Reaction, float]:
        mapping = {
            ResponseType.GOOD_NEWS: Reaction.RELIEF if state.concern > .28 else Reaction.CELEBRATION,
            ResponseType.USER_EXCITEMENT: Reaction.EXCITEMENT,
            ResponseType.BAD_NEWS: Reaction.CONCERN,
            ResponseType.USER_FRUSTRATION: Reaction.CALMING,
            ResponseType.EMOTIONAL_SUPPORT: Reaction.EMPATHY,
            ResponseType.JOKE: Reaction.AMUSEMENT,
            ResponseType.SURPRISE: Reaction.SURPRISE,
            ResponseType.USER_CONFUSION: Reaction.THOUGHTFULNESS,
            ResponseType.THINKING: Reaction.THOUGHTFULNESS,
            ResponseType.TASK_SUCCESS: Reaction.ACKNOWLEDGEMENT,
            ResponseType.TASK_FAILURE: Reaction.FRUSTRATION,
            ResponseType.GREETING: Reaction.ACKNOWLEDGEMENT,
        }
        reaction = mapping.get(kind, Reaction.NONE)
        confidence = significance if reaction is not Reaction.NONE else max(.65, 1.0 - significance)
        return reaction, confidence

    def plan(self, context: EmotionContext, state: EmotionState) -> tuple[SpeechPerformancePlan, EmotionState]:
        kind = self.classify(context)
        significance = self.significance(kind, context)
        state = self.update_state(state, kind, significance)
        reaction, confidence = self._reaction(kind, state, significance)
        voice = VoiceProfile.for_speaker(context.speaker)
        primary = max(
            ("amusement", state.amusement), ("excitement", state.excitement),
            ("concern", state.concern), ("surprise", state.surprise),
            ("warmth", state.warmth * .68),
            key=lambda item: item[1],
        )[0]
        pace = voice.default_pace
        if kind in {ResponseType.BAD_NEWS, ResponseType.EMOTIONAL_SUPPORT}:
            pace -= .04
        elif kind in {ResponseType.GOOD_NEWS, ResponseType.USER_EXCITEMENT, ResponseType.JOKE, ResponseType.TASK_SUCCESS}:
            pace += .07
            
        vocal_intensity = min(.78, .38 + significance * .35)
        
        # Adaptive Prosody Mirroring
        if context.audio_context:
            user_wpm = context.audio_context.user_wpm
            user_volume = context.audio_context.user_volume
            vocal_state = str(getattr(context.audio_context, "vocal_state", ""))
            vocal_confidence = float(getattr(context.audio_context, "vocal_confidence", 0.0) or 0.0)
            
            # Mirror pace: gently adjust towards user's WPM
            if user_wpm > 180:
                pace += 0.08  # Speak faster if user is fast
            elif 0 < user_wpm < 120:
                pace -= 0.06  # Speak thoughtfully if user is slow
                
            # Mirror volume: whisper or speak softly if user is quiet
            if 0 < user_volume < 0.005:  # Very quiet/whisper
                vocal_intensity -= 0.25
            elif user_volume > 0.08:  # Loud
                vocal_intensity += 0.15
            # Do not mirror anger by becoming louder. When acoustic and lexical
            # evidence agree, Meera de-escalates; positive activation can be
            # mirrored lightly. These are confidence-rated vocal cues, not mind reading.
            if vocal_confidence >= .64 and "upset" in vocal_state:
                pace -= .07
                vocal_intensity = min(vocal_intensity - .12, .52)
            elif vocal_confidence >= .64 and ("excited" in vocal_state or "happy" in vocal_state):
                pace += .04
                vocal_intensity += .05
            elif vocal_confidence >= .64 and ("sad" in vocal_state or "low" in vocal_state):
                pace -= .08
                vocal_intensity -= .10

        factual = kind in {ResponseType.QUESTION, ResponseType.EXPLANATION, ResponseType.IMPORTANT_INFORMATION}
        bypass = factual and significance < .20
        filler = self._choose_filler(context, state, reaction, significance) if not bypass else None
        laughter = 0
        if (self.config.laughter and (kind == ResponseType.JOKE or primary == "amusement") and significance >= .55
                and state.turn - state.last_laughter_turn >= 3):
            laughter = 1
            state.last_laughter_turn = state.turn
        if filler:
            state.last_filler_turn = state.turn
        plan = SpeechPerformancePlan(
            response_type=kind,
            primary_emotion=primary,
            secondary_emotion="relief" if reaction is Reaction.RELIEF else "calm",
            emotion_intensity=min(.80, significance * self.config.intensity),
            reaction=reaction if self.config.contextual_reactions else Reaction.NONE,
            reaction_confidence=confidence,
            energy=max(.42, min(.86, (state.energy + voice.preferred_energy) / 2)),
            warmth=(state.warmth + voice.preferred_warmth) / 2,
            pace=max(.38, min(.76, pace)),
            # Keep enough movement for emotion while preventing excitement from
            # pushing the mature voice into a bright, high-pitched register.
            pitch_variation=min(.58, .28 + significance * .26),
            vocal_intensity=max(0.1, min(0.85, vocal_intensity)),
            rhythm="fluid conversational",
            sentence_end="steady" if state.concern > .45 else "confident",
            laughter_level=laughter,
            hesitation=kind in {ResponseType.THINKING, ResponseType.UNCERTAINTY},
            filler=filler,
            language=self.language(context.response_text or context.user_text),
            bypassed=bypass,
        )
        return plan.validate(), state

    def _choose_filler(
        self, context: EmotionContext, state: EmotionState, reaction: Reaction, significance: float
    ) -> str | None:
        if not self.config.fillers or state.turn - state.last_filler_turn < 4 or significance < .55:
            return None
        language = self.language(context.response_text or context.user_text)
        options = {
            "en": {
                Reaction.SURPRISE: "Wait...", Reaction.CONCERN: "Oh...",
                Reaction.RELIEF: "Oh, finally...", Reaction.THOUGHTFULNESS: "Hmm...",
                Reaction.FRUSTRATION: "Hmm...", Reaction.CALMING: "Okay...",
                Reaction.AMUSEMENT: "Heh...",
            },
            "hi": {
                Reaction.SURPRISE: "अरे...", Reaction.CONCERN: "ओह...",
                Reaction.RELIEF: "अच्छा, आखिरकार...", Reaction.THOUGHTFULNESS: "हम्म...",
                Reaction.CALMING: "ठीक है...",
            },
            "gu": {
                Reaction.SURPRISE: "અરે...", Reaction.CONCERN: "ઓહ...",
                Reaction.RELIEF: "સારું, આખરે...", Reaction.THOUGHTFULNESS: "હમ્મ...",
                Reaction.CALMING: "ઠીક છે...",
            },
        }
        return options.get(language, {}).get(reaction)


class SpeechExpressionRenderer:
    """Renders only natural text plus supported free-text TTS instructions."""

    _existing_opening = re.compile(r"(?i)^(oh|wait|hmm|hm|yeah|okay|well|ah|heh|haha)[,.!…\s-]+")
    _protected = re.compile(r"(?is)<tool_call>.*?</tool_call>|```.*?```")

    def __init__(self, base_instruction: str) -> None:
        self.base_instruction = base_instruction

    def render(self, response: str, plan: SpeechPerformancePlan) -> tuple[str, str]:
        text = response.strip()
        protected = bool(self._protected.search(text))

        # Let the performance layer add very small, context-appropriate human
        # reactions. These are deliberately sparse: they should feel like a
        # spontaneous reaction, not a script full of "hmm", "oh", and "haha".
        reaction_prefix = self._natural_reaction(plan, text)
        if reaction_prefix and not protected and not self._existing_opening.match(text):
            text = f"{reaction_prefix} {text}".strip()

        # A deliberative hesitation belongs inside the thought, not stapled to
        # every opening. It is inserted only when the planner marks genuine
        # thinking/uncertainty and its cooldown selected a filler.
        if plan.hesitation and plan.filler and not protected and not re.search(r"(?i)\b(?:hmm|uh|erm)\b", text):
            text = self._insert_hesitation(text, plan.filler)

        # CustomVoice locks speaker identity separately, so a small performance
        # suffix can vary prosody without redesigning the person. Keep it bounded
        # and never describe age, accent, or timbre here. VoiceDesign callers still
        # receive an immutable identity prompt inside the backend.
        performance = ""
        if plan.response_type in {ResponseType.BAD_NEWS, ResponseType.EMOTIONAL_SUPPORT}:
            performance = " Use understated warmth and precise pacing without changing Serena's mature vocal identity."
        elif plan.response_type is ResponseType.USER_FRUSTRATION:
            performance = " Stay calm and grounded; do not mirror anger; retain the same mature timbre."
        elif plan.response_type in {ResponseType.GOOD_NEWS, ResponseType.USER_EXCITEMENT}:
            performance = " Add only restrained satisfaction; retain the same mature timbre and register."
        elif plan.response_type in {ResponseType.THINKING, ResponseType.UNCERTAINTY}:
            performance = " Use thoughtful connected phrasing with one natural reflective pause."
        elif plan.response_type == ResponseType.NEWS_ENTERTAINMENT:
            performance = " Sound lightly amused without laughter, caricature, or a brighter younger register."
        elif plan.response_type == ResponseType.NEWS_SERIOUS:
            performance = " Speak with a deeply serious, grounded, and respectful tone like a professional news anchor delivering heavy news."
        elif plan.response_type == ResponseType.TECH_REVIEW:
            performance = " Use focused interest with restrained energy; keep the same mature Serena timbre."
        elif plan.response_type == ResponseType.NEWS_GENERAL:
            performance = " Speak with a crisp, authoritative, and engaging news anchor delivery, maintaining perfect pacing and clear enunciation."
        return text, (self.base_instruction[:360] + performance)[:500]

    @staticmethod
    def _insert_hesitation(text: str, filler: str) -> str:
        if len(text.split()) < 16:
            return text
        comma = re.search(r",\s+", text)
        if comma and len(text[:comma.start()].split()) >= 5:
            return f"{text[:comma.end()]}{filler} {text[comma.end():]}"
        sentence = re.search(r"(?<=[.!?])\s+", text)
        if sentence:
            return f"{text[:sentence.end()]}{filler} {text[sentence.end():]}"
        return text

    def render_sentence(self, sentence: str, index: int, total_sentences: int, plan: SpeechPerformancePlan) -> tuple[str, str]:
        """Produce sentence-specific expressive instructions for pipelined speech."""
        text = sentence.strip()
        if not text:
            return "", ""
            
        import dataclasses
        local_plan = dataclasses.replace(plan)
        
        # Micro-expression local overrides
        lowered = text.lower()
        if re.search(r"\b(haha|lol|funny|joke|absurd|hilarious|comedy)\b", lowered):
            local_plan = dataclasses.replace(local_plan, response_type=ResponseType.NEWS_ENTERTAINMENT)
            if index > 0: text = f"Haha. {text}"
        elif re.search(r"\b(wow|crazy|suddenly|amazing|unbelievable)\b", lowered) or text.count("!") >= 2:
            local_plan = dataclasses.replace(local_plan, response_type=ResponseType.SURPRISE)
            if index > 0: text = f"Oh wow! {text}"
        elif re.search(r"\b(failed|died|unfortunately|sadly|tragedy|accident|crash|serious)\b", lowered):
            local_plan = dataclasses.replace(local_plan, response_type=ResponseType.NEWS_SERIOUS)
            if index > 0: text = f"Ohh. {text}"
        elif re.search(r"^(so|well|i think|actually|to be honest)\b", lowered):
            local_plan = dataclasses.replace(local_plan, response_type=ResponseType.THINKING)
            if index > 0: text = f"Hmm... {text}"
            
        # Natural Pacing and Breathing Gaps
        words = text.split()
        if len(words) > 8 and local_plan.response_type == ResponseType.THINKING:
            text = text.replace(", ", "... ", 1)
        elif len(words) > 15 and ", " in text:
            text = text.replace(", ", "... ", 1)
            instruction_modifier = " Take a small breath during the pause."
            
        text, instruction = self.render(text, local_plan)
        
        if 'instruction_modifier' in locals():
            instruction = (instruction[:450] + instruction_modifier)
            
        # Conclusive tone for final sentence
        if index == total_sentences - 1 and len(words) > 3:
            instruction = (instruction[:450] + " Drop pitch slightly at the end for a resolute conclusion.")
            
        return text, instruction

    @staticmethod
    def _natural_reaction(plan: SpeechPerformancePlan, text: str) -> str | None:
        """Return one tiny spoken reaction, or nothing.

        This gives the TTS model real expressive material directly in the text,
        which is much safer than modifying the VoiceDesign prompt.
        """
        if not text:
            return None
            
        reactions = []
        if plan.laughter_level:
            reactions.append("Heh.")
            
        if plan.reaction_confidence >= .30 and plan.emotion_intensity >= .20:
            choices = {
                Reaction.SURPRISE: "Oh, wow.",
                Reaction.AMUSEMENT: "Haha, nice.",
                Reaction.RELIEF: "Phew, that's good.",
                Reaction.CELEBRATION: "Oh wow, that's awesome.",
                Reaction.EMPATHY: "Ohh, I see.",
                Reaction.CONCERN: "Ohh, that's serious.",
                # Deliberative hesitation is inserted inside the sentence below;
                # putting it here makes every thoughtful answer begin theatrically.
                Reaction.THOUGHTFULNESS: None,
                Reaction.CALMING: "It's alright.",
                Reaction.EXCITEMENT: "Oh wow!",
                Reaction.CURIOSITY: "Oh?",
                Reaction.ACKNOWLEDGEMENT: None,
            }
            if plan.reaction in choices and choices[plan.reaction]:
                reactions.append(choices[plan.reaction])

        if not reactions:
            return None
            
        return " ".join(reactions)


class LocalGGUFExpressionModel:
    """Optional CPU-resident specialist; it refines plans but never writes speech."""

    def __init__(self, model_path: Path) -> None:
        self.model_path = model_path
        self._model = None
        self._lock = threading.RLock()

    def preload(self) -> None:
        with self._lock:
            if self._model is None:
                from llama_cpp import Llama

                self._model = Llama(
                    model_path=str(self.model_path), n_ctx=2048, n_gpu_layers=0,
                    n_threads=max(2, min(6, (os_cpu_count() or 4) - 1)), verbose=False,
                )

    def refine(self, context: EmotionContext, baseline: SpeechPerformancePlan) -> SpeechPerformancePlan:
        self.preload()
        recent = "\n".join(
            f"User: {user[-240:]}\nMeera: {assistant[-240:]}"
            for user, assistant in context.recent_turns[-4:]
        )
        prompt = (
            "You are Meera's speech performance director, not her conversational brain. "
            "Return one JSON object only. Infer social meaning from the full context. "
            "Never produce speech, facts, tool calls, or rewritten text. Refine only these fields: "
            "primary_emotion, secondary_emotion, emotion_intensity, reaction, reaction_confidence, "
            "energy, warmth, pace, pitch_variation, vocal_intensity, rhythm, sentence_end, "
            "laughter_level, hesitation. Values must be finite; scalar values are 0..1. "
            f"Valid reactions: {', '.join(value.value for value in Reaction)}.\n"
            f"Recent context:\n{recent or '(none)'}\n"
            f"Current user: {context.user_text[-500:]}\n"
            f"Meera's factual response: {context.response_text[-700:]}\n"
            f"Task state: {context.task_state or 'none'}; success={context.success}.\n"
            f"Baseline plan: {json.dumps(asdict(baseline), default=str)}"
        )
        assert self._model is not None
        with self._lock:
            result = self._model.create_chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1, max_tokens=220,
            )
        text = str(result["choices"][0]["message"].get("content", ""))
        text = re.sub(r"(?is)<think>.*?</think>", "", text).strip()
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise ValueError("Specialist returned no JSON object")
        return SpeechPerformancePlan.from_mapping(json.loads(match.group(0)), baseline)


def os_cpu_count() -> int | None:
    # Kept behind a tiny function so importing this module has no heavy side effects.
    import os
    return os.cpu_count()


class EmotionEngine:
    """Thread-safe facade with persistence, validation, fallback and telemetry."""

    def __init__(
        self,
        config: EmotionConfig,
        database_path: Path,
        log_path: Path,
        speaker: str,
        base_tts_instruction: str,
        personality: PersonalityProfile | None = None,
    ) -> None:
        self.config = config
        self.store = EmotionStateStore(database_path)
        self.state = self.store.load()
        self.speaker = speaker
        self.planner = ContextualPerformancePlanner(config, personality or PersonalityProfile())
        self.renderer = SpeechExpressionRenderer(base_tts_instruction)
        self.specialist = (
            LocalGGUFExpressionModel(config.specialist_model)
            if config.specialist_model and config.specialist_model.is_file() else None
        )
        self.recent_turns: deque[tuple[str, str]] = deque(maxlen=6)
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def preload(self) -> None:
        if self.specialist is not None:
            print("[Meera] Loading expression specialist on CPU...")
            self.specialist.preload()
            print("[Meera] Expression specialist ready.")

    def process(
        self,
        user_text: str,
        response_text: str,
        *,
        task_state: str | None = None,
        tool_used: bool = False,
        success: bool = True,
        audio_context: Any = None,
    ) -> ExpressionOutput:
        started = time.perf_counter()
        with self._lock:
            if not self.config.enabled or ContextualPerformancePlanner._tool_markup.search(response_text):
                plan = SpeechPerformancePlan(bypassed=True, fallback_reason="disabled_or_protected")
            else:
                context = EmotionContext(
                    user_text=user_text,
                    response_text=response_text,
                    recent_turns=tuple(self.recent_turns),
                    task_state=task_state,
                    tool_used=tool_used,
                    success=success,
                    speaker=self.speaker,
                    audio_context=audio_context,
                )
                try:
                    plan, self.state = self.planner.plan(context, self.state)
                    significance = plan.emotion_intensity / max(.01, self.config.intensity)
                    if self.specialist is not None and significance >= self.config.specialist_min_significance:
                        specialist_started = time.perf_counter()
                        refined = self.specialist.refine(context, plan)
                        specialist_ms = int((time.perf_counter() - specialist_started) * 1000)
                        if specialist_ms <= self.config.specialist_timeout_ms:
                            plan = refined
                        else:
                            plan.fallback_reason = f"specialist_latency_{specialist_ms}ms"
                    self.store.save(self.state)
                except Exception as exc:
                    plan = SpeechPerformancePlan(bypassed=True, fallback_reason=type(exc).__name__)
            spoken, instruction = self.renderer.render(response_text, plan)
            self.recent_turns.append((user_text[-500:], response_text[-500:]))
            latency_ms = int((time.perf_counter() - started) * 1000)
            self._observe(plan, latency_ms)
            return ExpressionOutput(spoken, instruction, plan, latency_ms)

    def _observe(self, plan: SpeechPerformancePlan, latency_ms: int) -> None:
        record = {
            "timestamp": time.time(), "latency_ms": latency_ms,
            "emotion": plan.primary_emotion, "intensity": round(plan.emotion_intensity, 3),
            "reaction": plan.reaction.value, "response_type": plan.response_type.value,
            "energy": round(plan.energy, 3), "pace": round(plan.pace, 3),
            "fallback_reason": plan.fallback_reason,
        }
        try:
            with self.log_path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(record, separators=(",", ":")) + "\n")
        except OSError:
            pass
        if self.config.debug:
            print(
                f"[Emotion] {plan.primary_emotion} {plan.emotion_intensity:.2f} | "
                f"reaction={plan.reaction.value} | energy={plan.energy:.2f} | "
                f"pace={plan.pace:.2f} | {latency_ms} ms"
            )
