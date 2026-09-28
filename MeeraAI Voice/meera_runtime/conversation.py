"""Turn orchestration for Meera's spoken, interruptible conversations.

This layer deliberately sits above tools and below the terminal loop.  It makes
the first spoken beat immediate, keeps a compact topic model, and never lets a
completed research turn leak into an unrelated later one.
"""
from __future__ import annotations

import re
import threading
import math
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import Enum

from .models import AgentResult
from .router import CapabilityRouter, Route


class TurnPhase(str, Enum):
    HEARD = "heard"
    UNDERSTOOD = "understood"
    ACKNOWLEDGED = "acknowledged"
    RESEARCHING = "researching"
    RESPONDING = "responding"
    COMPLETED = "completed"
    INTERRUPTED = "interrupted"


@dataclass
class ConversationTurn:
    text: str
    route: Route
    subject: str = ""
    acknowledgement: str | None = None
    researched: bool = False
    interrupted: bool = False
    resolved_subject: str = ""
    intent: str = "chat"
    phase: TurnPhase = TurnPhase.HEARD
    entity_candidates: tuple[str, ...] = ()
    raw_query: str = ""
    asr_confidence: float = 0.0
    word_timings: tuple[dict, ...] = ()


@dataclass
class ConversationState:
    topic: str = ""
    subject: str = ""
    result_titles: tuple[str, ...] = ()
    turn_number: int = 0
    last_intent: str = "chat"
    last_question: str = ""


class ConversationEngine:
    """Coordinates topic awareness, appreciation, and two-phase web turns."""

    _filler = re.compile(r"(?i)^\s*(?:okay|ok|alright|all right|hey|hello|so|now|just|meera|mira)[,\s]*")
    _pronoun = re.compile(
        r"(?i)\b(?:he|she|they|him|her|them|his|hers|their|theirs|its|it|that|this|"
        r"those|these|the second|the first|that one|this one)\b"
    )
    _followup = re.compile(
        r"(?i)\b(?:tell me more|go deeper|explain|what happened|why|is that true|details?|that part|"
        r"who|when|where|which|what(?: are|'s| is)?|how many|names?|age|born|wife|husband|"
        r"children|kids?|family|married|award|career)\b"
    )
    _verification = re.compile(
        r"(?i)\b(?:wrong|incorrect|not true|made (?:that|it) up|invented|hallucinat(?:ed|ing)|"
        r"verify|fact[ -]?check|check (?:that|it)|search (?:the )?web for (?:that|it|this))\b"
    )
    _correction = re.compile(
        r"(?i)\b(?:"
        r"(?:no[, ]+)?i\s+(?:meant|said)\s+(?:the\s+)?|"
        r"(?:(?:you\s+)?(?:heard|wrote|spelled).{0,45}?(?:wrong|incorrect)|wrong\s+spelling).{0,25}?i\s+(?:say|said|meant)\s+"
        r")(.+?)(?:,?\s+not\s+.+)?[.?!]*$"
    )

    @staticmethod
    def _subject_from_query(query: str) -> str:
        """Extract a compact entity for continuity without weakening the query."""
        clean = re.sub(r"\s+", " ", query).strip(" .?!")
        trailing = re.search(
            r"(?i)\b(?:of|by|about|from)\s+([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){1,3})$",
            clean,
        )
        if trailing:
            return trailing.group(1).strip()
        if 1 <= len(clean.split()) <= 4:
            return clean
        return clean

    @staticmethod
    def _likely_same_name(candidate: str, active: str) -> bool:
        """Conservatively repair an ASR name only inside an active topic."""
        current = re.findall(r"[a-z]+", candidate.casefold())
        prior = re.findall(r"[a-z]+", active.casefold())
        if len(current) < 2 or len(prior) < 2 or current[-1] != prior[-1]:
            return False
        current_given = "".join(current[:-1])
        prior_given = "".join(prior[:-1])
        return SequenceMatcher(None, current_given, prior_given).ratio() >= .58

    def __init__(self, router: CapabilityRouter | None = None) -> None:
        self.router = router or CapabilityRouter()
        self.state = ConversationState()
        self._lock = threading.RLock()

    def begin(
        self, text: str, *, asr_confidence: float = 0.0, words: list[dict] | None = None
    ) -> ConversationTurn:
        route = self.router.route(text)
        routed_query = str(route.arguments.get("query", "")).strip()
        subject = str(route.arguments.get("subject") or self._subject_from_query(routed_query)).strip()
        with self._lock:
            active_subject = self.state.subject
            previous_question = self.state.last_question
            # ASR and casual grammar often turn an entity follow-up into second
            # person ("what songs did you sang recently") immediately after a
            # biography turn. In a music/release question, the verified active
            # artist is authoritative; Meera must not answer as if she sings.
            second_person_artist_followup = bool(
                active_subject
                and re.search(r"(?i)\b(?:songs?|albums?|tracks?|music|releases?)\b", text)
                and re.search(
                    r"(?i)\b(?:(?:did|do|have|are)\s+you|you\s+(?:sang|sing|released?)|your)\b",
                    text,
                )
                and re.search(r"(?i)\b(?:recent|recently|latest|new|sang|sing|released?)\b", text)
            )
            if second_person_artist_followup:
                route = Route(
                    "research_followup", "web.search",
                    {"query": f"{active_subject} recent songs releases", "kind": "text"},
                )
                routed_query = str(route.arguments["query"])
                subject = active_subject
            if (
                active_subject
                and route.tool == "web.search"
                and subject
                and self._likely_same_name(subject, active_subject)
            ):
                arguments = dict(route.arguments)
                arguments["query"] = re.sub(
                    re.escape(subject), active_subject, routed_query, count=1, flags=re.IGNORECASE
                )
                route = Route(route.capability, route.tool, arguments)
                subject = active_subject
            correction = self._correction.search(text)
            explicit_correction = correction is not None
            if correction:
                # Corrections are high-value user intent. Re-search the corrected
                # subject instead of asking the language model to guess which old
                # topic needs to be replaced.
                subject = correction.group(1).strip(" .?!")
                route = Route("research", "web.search", {"query": subject, "kind": "text"})
            # "Who is he?" after a researched person is a real follow-up, not a
            # fresh web search for the literal word "he". Keep this resolution
            # local to the active process; stale persisted research never wins.
            # Deictic verification must search the active claim, never the literal
            # words "that" or "it". Include the preceding question so the search
            # can retrieve the exact disputed attribute (for example, children's
            # names) instead of returning a generic biography.
            deictic_query = bool(
                re.fullmatch(r"(?i)(?:he|she|they|him|her|them|it|that|this)", subject)
                or (subject and self._pronoun.search(subject))
            )
            if active_subject and self._verification.search(text) and route.tool != "web.search":
                route = Route("research_followup", "web.search", {"query": active_subject, "kind": "text"})
                subject = active_subject
                deictic_query = True
            if active_subject and route.tool == "web.search" and not explicit_correction and (deictic_query or self._verification.search(text)):
                focus = previous_question if self._verification.search(text) and previous_question else text
                query = self._followup_query(active_subject, focus)
                arguments = dict(route.arguments)
                arguments["query"] = query
                route = Route(route.capability, route.tool, arguments)
                subject = active_subject
            elif (
                route.tool is None
                and active_subject
                and self._pronoun.search(text)
                and self._followup.search(text)
            ):
                # Concrete biographical follow-ups are factual retrieval, not an
                # invitation for the 2B chat model to complete a plausible story.
                subject = active_subject
                route = Route(
                    "research_followup",
                    "web.search",
                    {"query": self._followup_query(active_subject, text), "kind": "text"},
                )
            if not subject and active_subject and self._pronoun.search(text):
                subject = active_subject
            intent = "research" if route.tool == "web.search" else "followup" if self._followup.search(text) else route.capability
            confidence = float(asr_confidence or 0.0)
            # faster-whisper reports an average log probability; convert it to a
            # bounded confidence-like score rather than treating every negative
            # log probability as zero confidence.
            if confidence < 0:
                confidence = math.exp(max(-8.0, confidence))
            turn = ConversationTurn(
                text=text, route=route, subject=subject, raw_query=subject,
                intent=intent, phase=TurnPhase.UNDERSTOOD,
                entity_candidates=self._initial_candidates(subject),
                asr_confidence=max(0.0, min(1.0, confidence)),
                word_timings=tuple(words or ()),
            )
            if route.tool == "web.search":
                turn.researched = True
                turn.acknowledgement = self._research_acknowledgement(subject, text, turn.asr_confidence)
                turn.phase = TurnPhase.ACKNOWLEDGED
            elif not self._pronoun.search(text):
                # A distinct non-reference turn must not inherit a stale topic.
                self.state.topic = ""
                self.state.subject = ""
                self.state.result_titles = ()
                self.state.last_question = ""
            self.state.turn_number += 1
            self.state.last_intent = intent
            if self._followup.search(text) or route.tool == "web.search":
                self.state.last_question = text.strip()
            return turn

    @staticmethod
    def _followup_query(subject: str, question: str) -> str:
        """Create a focused lookup while retaining the verified entity name."""
        focus = re.sub(r"(?i)\b(?:he|she|they|him|her|them|his|hers|their|theirs|it|that|this)\b", " ", question)
        focus = re.sub(
            r"(?i)\b(?:i think|you have|you've|a |the |wrong information|incorrect information|"
            r"please|should|can you|could you|search (?:the )?web|look up|verify|fact[ -]?check|for|"
            r"who is|who was|tell me more about|tell me more|more about|go deeper|is true)\b",
            " ",
            focus,
        )
        focus = re.sub(r"\s+", " ", focus).strip(" .?!,")
        return f"{subject} {focus}".strip() if focus else subject

    @staticmethod
    def _initial_candidates(subject: str) -> tuple[str, ...]:
        """Keep raw ASR intact while exposing non-destructive lookup candidates."""
        cleaned = re.sub(r"\s+", " ", subject).strip(" .?!")
        if not cleaned:
            return ()
        candidates = [cleaned]
        # A compacted spelling is useful to search engines for names split or
        # merged by ASR, but it never replaces the original phrase.
        if " " in cleaned:
            candidates.append(cleaned.replace(" ", ""))
        return tuple(dict.fromkeys(candidates))

    def context_for(self, turn: ConversationTurn) -> str:
        """Private decision context for the brain; never spoken or treated as fact."""
        with self._lock:
            prior = "; ".join(self.state.result_titles[:3]) or "none"
            active = self.state.subject or "none"
        depth = "long" if re.search(r"(?i)\b(?:deep|detail|why|how|explain|compare|analyse)\b", turn.text) else "medium"
        return (
            "LIVE CONVERSATION MAP (private):\n"
            f"Current intent: {turn.intent}. Requested subject: {turn.subject or 'none'}.\n"
            f"Previously active subject: {active}. Prior result titles: {prior}.\n"
            f"Suggested answer depth: {depth}. Treat corrections as authoritative. "
            "Resolve references from this map, but never claim the map itself is evidence."
        )

    @staticmethod
    def _topic_kind(subject: str, text: str) -> str:
        lowered = f"{subject} {text}".lower()
        if any(word in lowered for word in ("news", "headline", "today", "latest", "current")):
            return "news"
        if re.search(r"\b(?:who is|who was|person|singer|actor|politician|minister|writer|scientist)\b", lowered):
            return "person"
        if re.search(
            r"\b(?:why|how|meaning|explain|formula|equation|technique|method|component|part|"
            r"classification|regression|learning|computing|science|engineering|theory|process)\w*\b",
            lowered,
        ):
            return "idea"
        subject_words = re.findall(r"[A-Za-z][A-Za-z'-]*", subject)
        if 2 <= len(subject_words) <= 4 and all(word[:1].isupper() for word in subject_words):
            return "person"
        # A compact subject in a biographical "tell me about" request is commonly
        # a spoken name. This works with lower-cased ASR without maintaining a list
        # of celebrities or public figures.
        if 2 <= len(subject.split()) <= 4 and re.search(r"(?i)\btell me (?:something )?about\b", text):
            return "person"
        return "topic"

    def _research_acknowledgement(self, subject: str, text: str, confidence: float = 0.0) -> str:
        kind = self._topic_kind(subject, text)
        clean = self._filler.sub("", subject).strip(" .?!")
        for _ in range(3):
            stripped = re.sub(
                r"(?i)^\s*(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?"
                r"(?:search(?:\s+the)?\s+web\s+for|search\s+for|look\s+up|check)\s+",
                "",
                clean,
            ).strip(" .?!")
            if stripped == clean:
                break
            clean = stripped
        if re.search(r"(?i)\b(?:latest|newest|recent|current)\b.{0,24}\b(?:songs?|tracks?|music|releases?)\b", text):
            return "Yeah, give me a sec. I'm checking the latest releases."
        if re.search(r"(?i)\bhow many\b.{0,30}\b(?:songs?|tracks?)\b", text):
            return "Let me verify the number properly."
        named = bool(clean and any(char.isupper() for char in clean) and len(clean) <= 60)
        variant = self.state.turn_number
        if kind == "person":
            # A zero confidence value means typed/API input, where spelling is
            # authoritative. Microphone turns carry ASR confidence and must not
            # make Meera confidently repeat a potentially mangled proper noun.
            if named and confidence == 0.0:
                options = (
                    f"Yeah, give me a sec. I'm checking {clean} now.",
                    f"One sec, I'm pulling up the right details on {clean}.",
                )
                return options[variant % len(options)]
            options = (
                "Yeah, give me a sec. I'll verify the name and pull that up.",
                "One sec, I'll verify the name and get the right details.",
            )
            return options[variant % len(options)]

        if clean and len(clean) <= 72:
            options = (
                "Yeah, give me a sec. I'm checking that now.",
                "One sec, I'm pulling up the current details.",
                "I'm on it, checking the reliable sources now.",
            )
        else:
            options = (
                "Give me one second to check that.",
                "Let me pull that up quickly.",
                "I'll verify that right now.",
            )
        return options[variant % len(options)]

    @staticmethod
    def _title_subject(title: str) -> str:
        title = re.split(r"\s*(?:[-|:–—])\s*", title, maxsplit=1)[0].strip()
        return re.sub(r"\s+", " ", title)

    def _resolve_subject(self, spoken: str, result: AgentResult, confidence: float = 0.0) -> str:
        if not result.observations:
            return spoken
        raw_tokens = re.findall(r"[a-z]+", spoken.lower())
        # Page titles summarize entire questions. They are not evidence that the
        # user "meant" the title. Entity repair is safe only for a compact phrase,
        # such as a two-word name distorted by ASR.
        if not 1 <= len(raw_tokens) <= 5:
            return spoken
        best, score = "", 0.0
        for observation in result.observations:
            title = observation.split(" - ", 1)[0]
            candidate = self._title_subject(re.sub(r"^\d+\.\s*", "", title))
            candidate_tokens = re.findall(r"[a-z]+", candidate.lower())
            if not candidate_tokens or not 1 <= len(candidate_tokens) <= 5:
                continue
            if abs(len(candidate_tokens) - len(raw_tokens)) > 1:
                continue
            overlap = len(set(raw_tokens) & set(candidate_tokens)) / max(1, len(set(raw_tokens)))
            similarity = SequenceMatcher(None, " ".join(raw_tokens), " ".join(candidate_tokens)).ratio()
            candidate_score = max(overlap, similarity)
            if candidate_score > score:
                best, score = candidate, candidate_score
        # A shared first name plus a close surname (Narendra body/Modi) resolves
        # safely. Do not manufacture entities from a weak title coincidence.
        # Higher ASR confidence asks for stronger corroboration before replacing a
        # word the user probably did say. Lower confidence gives web-title and
        # phonetic similarity more room to repair a likely proper-name error.
        threshold = .72 if confidence >= .78 else .62 if confidence >= .45 else .56
        return best if best and score >= threshold else spoken

    def finish(self, turn: ConversationTurn, result: AgentResult) -> AgentResult:
        if not turn.researched:
            return result
        resolved = self._resolve_subject(turn.subject, result, turn.asr_confidence)
        turn.resolved_subject = resolved
        if resolved and resolved.lower() != turn.subject.lower() and turn.subject:
            correction = f"It sounds like you meant {resolved}. "
            result.summary = correction + result.summary
        # The acknowledgement already opened the turn. Continue with the direct
        # fact instead of forcing every researched answer to begin with "So".
        with self._lock:
            self.state.topic = turn.text
            self.state.subject = resolved or turn.subject
            self.state.result_titles = tuple(item.split(" - ", 1)[0] for item in result.observations[:5])
            self.state.last_question = turn.text.strip()
            turn.phase = TurnPhase.COMPLETED
        return result

    def interrupt(self, turn: ConversationTurn) -> None:
        turn.interrupted = True
        turn.phase = TurnPhase.INTERRUPTED
