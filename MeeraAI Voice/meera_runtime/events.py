from __future__ import annotations

import threading
from collections.abc import Callable

from .models import AgentEvent


class EventBus:
    def __init__(self) -> None:
        self._subscribers: list[Callable[[AgentEvent], None]] = []
        self._lock = threading.Lock()

    def subscribe(self, callback: Callable[[AgentEvent], None]) -> Callable[[], None]:
        with self._lock:
            self._subscribers.append(callback)

        def unsubscribe() -> None:
            with self._lock:
                if callback in self._subscribers:
                    self._subscribers.remove(callback)

        return unsubscribe

    def publish(self, event: AgentEvent) -> None:
        with self._lock:
            subscribers = tuple(self._subscribers)
        for callback in subscribers:
            callback(event)
