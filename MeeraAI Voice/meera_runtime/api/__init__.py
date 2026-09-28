"""Meera Gateway API package."""

from __future__ import annotations

from .app import create_app, ConnectionManager, get_app

__all__ = ["create_app", "ConnectionManager", "get_app", "app"]


def __getattr__(name: str):
    if name == "app":
        return get_app()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")