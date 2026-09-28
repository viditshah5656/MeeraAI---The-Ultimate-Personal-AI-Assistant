"""Fast, deterministic end-of-turn hints for the microphone loop.

This module deliberately does not call the dialogue model. Endpointing runs on
the audio hot path; competing for the LLM/GPU here creates silence before every
answer and can deadlock with speech priority.
"""

from __future__ import annotations

import re


_TRAILING_WORDS = {
    "a", "about", "an", "and", "as", "at", "because", "between", "but", "by", "for", "from",
    "if", "in", "into", "of", "or", "so", "than", "that", "the", "then",
    "to", "unless", "until", "versus", "when", "where", "which", "while", "who",
    "with", "without",
}


def is_thought_complete(partial_text: str) -> bool:
    """Return False only for strong, cheap evidence that speech trails off.

    VAD remains authoritative. This hint merely extends the silence window for
    obvious unfinished syntax; uncertain text ends normally instead of paying
    for another model inference.
    """
    text = " ".join(partial_text.split()).strip()
    if not text:
        return True
    if re.search(r"(?:\.{2,}|â€¦)$", text):
        return False
    if re.search(r"[.!?][\"']?$", text):
        return True
    if text.endswith((",", ":", ";", "-", "—")):
        return False
    words = re.findall(r"[a-z0-9']+", text.casefold())
    return not words or words[-1] not in _TRAILING_WORDS
