from __future__ import annotations

import threading


class CancelledError(RuntimeError):
    pass


class CancellationToken:
    def __init__(self) -> None:
        self._event = threading.Event()

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    def cancel(self) -> None:
        self._event.set()

    def raise_if_cancelled(self) -> None:
        if self.cancelled:
            raise CancelledError("Operation cancelled")


class CancellationRegistry:
    def __init__(self) -> None:
        self._tokens: dict[str, CancellationToken] = {}
        self._lock = threading.Lock()

    def create(self, task_id: str) -> CancellationToken:
        with self._lock:
            token = CancellationToken()
            self._tokens[task_id] = token
            return token

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            token = self._tokens.get(task_id)
        if token is None:
            return False
        token.cancel()
        return True

    def finish(self, task_id: str) -> None:
        with self._lock:
            self._tokens.pop(task_id, None)
