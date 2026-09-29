"""Deterministic dialogue-depth and conversational-reference planning."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ResponsePlan:
    depth: str
    max_tokens: int
    target_min_words: int
    target_max_words: int
    guidance: str


SHORT = ResponsePlan(
    "short", 72, 4, 22,
    "Answer effortlessly in one or two sentences. Be razor-sharp, warm, and highly capable. Use subtle wit if appropriate.",
)
MEDIUM = ResponsePlan(
    "medium", 180, 20, 48,
    "Respond like a brilliant, trusted partner. Share perspective, pick up on any indirect meaning or sarcasm, and avoid reading like an encyclopedia. Keep it grounded and conversational.",
)
LONG = ResponsePlan(
    "long", 300, 40, 85,
    "Talk deeply and thoughtfully about the subject as if exploring it with an intellectual peer. Show genuine perspective, sharp wit, or empathy where appropriate. Do not sound like a structured essay; weave information effortlessly into a warm, highly capable conversation.",
)


def plan_response(text: str, *, research_followup: bool = False) -> ResponsePlan:
    clean = " ".join(text.lower().split())
    if re.search(
        r"\b(?:in detail|deep(?:ly)?|thorough(?:ly)?|comprehensive(?:ly)?|everything about|"
        r"full explanation|step by step|walk me through|break it down|elaborate|long answer|"
        r"analyse|analyze|compare and contrast|pros and cons)\b",
        clean,
    ):
        return LONG
    # Multi-part educational questions require an actual explanation even when
    # the speaker did not explicitly say "in detail". These cues describe the
    # requested shape of the answer rather than any particular subject.
    if re.search(
        r"\b(?:formula(?:s)?|equation(?:s)?|technique(?:s)?|method(?:s)?|approach(?:es)?|"
        r"components?|different parts?|key parts?|types? and|advantages? and disadvantages?|"
        r"with examples?|how it works and|more about|something more)\b",
        clean,
    ):
        return LONG
    if research_followup and re.search(
        r"\b(?:tell me more|go deeper|full story|whole story|expand on|walk me through)\b",
        clean,
    ):
        return LONG
    if re.fullmatch(
        r"(?:hey|hi|hello|thanks|thank you|okay|ok|got it|yes|no|sure|goodbye|bye|"
        r"how are you|how is it going|what's up|tell me a joke|say something funny)[,.?! ]*",
        clean,
    ):
        return SHORT
    if re.search(
        r"^(?:why|how|what (?:is|are|does|do))\b|\b(?:explain|reason|meaning|impact|implications|difference between|"
        r"how does|how do|what happened|what does .* mean|tell me about)\b",
        clean,
    ):
        return LONG
    if re.search(r"^what (?:time|date|day)\b", clean):
        return SHORT
    if len(clean.split()) <= 5 and re.match(r"^(?:is|are|can|could|will|would|do|does|did)\b", clean):
        return SHORT
    return MEDIUM


def reference_language(text: str) -> bool:
    """True only when wording explicitly depends on recent conversational context."""
    return bool(re.search(
        r"(?i)(?:^(?:and|but|so)\b|\bwhat about\b|"
        r"\b(?:it|they|them|their|he|she|his|her|the same|that story|"
        r"this story|that news|this news|the article|the headline|what happened next|"
        r"why did|what does that|is that|does that|the (?:main )?(?:risk|reason|cause|"
        r"impact|implication|point|source))\b)",
        text,
    ))
