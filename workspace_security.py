"""Backend-enforced path containment for approved Meera workspaces."""

from __future__ import annotations

import os
from pathlib import Path


class WorkspaceAccessError(ValueError):
    """Raised when a path escapes the approved workspace."""


class ApprovedWorkspace:
    def __init__(self, root: str | Path, excluded: tuple[str, ...] = ()):
        self.root = Path(root).expanduser().resolve(strict=True)
        self.excluded = tuple(Path(item).as_posix().strip("/") for item in excluded)

    def resolve(self, requested: str | Path, *, allow_missing: bool = False) -> Path:
        candidate = Path(requested).expanduser()
        if candidate.is_absolute():
            raw = candidate
        else:
            raw = self.root / candidate
        try:
            resolved = raw.resolve(strict=not allow_missing)
        except FileNotFoundError as exc:
            raise WorkspaceAccessError("path does not exist") from exc
        try:
            relative = resolved.relative_to(self.root)
        except ValueError as exc:
            raise WorkspaceAccessError("path is outside the approved workspace") from exc
        relative_text = relative.as_posix()
        if any(relative_text == item or relative_text.startswith(f"{item}/") for item in self.excluded):
            raise WorkspaceAccessError("path is excluded from the approved workspace")
        return resolved

    def is_allowed(self, requested: str | Path, *, allow_missing: bool = False) -> bool:
        try:
            self.resolve(requested, allow_missing=allow_missing)
            return True
        except WorkspaceAccessError:
            return False