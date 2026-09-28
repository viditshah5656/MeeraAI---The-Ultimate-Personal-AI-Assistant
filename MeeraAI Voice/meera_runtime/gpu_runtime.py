"""Cross-component scheduling for the single local GPU.

The web request may run while Meera speaks, but llama.cpp generation must not
compete with qwentts.cpp codec decoding on a 6 GB laptop GPU. Doing so makes TTS
slower than real time and causes audible output starvation.
"""
from __future__ import annotations

import threading
import time


_speech_priority = threading.Event()


def begin_speech_priority() -> None:
    pass


def end_speech_priority() -> None:
    pass


def wait_for_speech_priority() -> None:
    pass


def speech_has_priority() -> bool:
    return False
