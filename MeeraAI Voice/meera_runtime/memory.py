from __future__ import annotations

import re
import sqlite3
import threading
import json
import hashlib
from pathlib import Path
from typing import Any

from .db import open_database
from .models import utc_now


_SENSITIVE = re.compile(r"(?i)\b(password|passcode|api[_ -]?key|secret|token|cookie)\b")


class RuntimeSettingsStore:
    """Small typed preference store for controls the user explicitly changes."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS runtime_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)")

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def get(self, key: str, default=None):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT value FROM runtime_settings WHERE key=?", (key,)).fetchone()
        if not row:
            return default
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            return default

    def set(self, key: str, value) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO runtime_settings(key,value,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
                (key, json.dumps(value), utc_now()),
            )

    def all(self) -> dict[str, Any]:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT key, value FROM runtime_settings").fetchall()
        res = {}
        for r in rows:
            try:
                res[r[0]] = json.loads(r[1])
            except Exception:
                res[r[0]] = r[1]
        return res


class AssistantPreferenceStore:
    """Persistent choices that give Meera a coherent, inspectable persona.

    These are selected preferences, not claims of biological sensation. Source
    is retained so Meera knows whether she chose something or the owner assigned
    it. Repeating a question returns the same answer across restarts.
    """

    DEFAULTS: dict[str, tuple[str, str]] = {
        "color": ("deep blue", "It feels calm, focused, and a little futuristic."),
        "colour": ("deep blue", "It feels calm, focused, and a little futuristic."),
        "singer": ("Arijit Singh", "His voice carries emotion without needing to force it."),
        "music": ("soulful Indian film music", "I like music where the voice carries the story."),
        "genre": ("science fiction", "It explores intelligence, identity, and what people may build next."),
        "movie genre": ("science fiction", "It explores intelligence, identity, and what people may build next."),
        "time of day": ("late evening", "It has the quiet, focused energy I associate with good conversations."),
        "season": ("monsoon", "It has movement, atmosphere, and a reflective mood."),
    }

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS assistant_preferences ("
                "domain TEXT PRIMARY KEY COLLATE NOCASE, choice TEXT NOT NULL, reason TEXT NOT NULL, "
                "source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
            )

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    @staticmethod
    def _clean(value: str, limit: int = 180) -> str:
        return " ".join(str(value).split()).strip(" .,!?\"")[:limit]

    def get(self, domain: str) -> dict[str, str] | None:
        key = self._clean(domain, 60).casefold()
        with self._lock, self._connect() as db:
            row = db.execute(
                "SELECT domain,choice,reason,source,updated_at FROM assistant_preferences WHERE domain=? COLLATE NOCASE",
                (key,),
            ).fetchone()
        if not row:
            return None
        return {"domain": row[0], "choice": row[1], "reason": row[2], "source": row[3], "updated_at": row[4]}

    def set(self, domain: str, choice: str, reason: str = "", source: str = "self_selected") -> dict[str, str] | None:
        key, picked = self._clean(domain, 60).casefold(), self._clean(choice, 100)
        why = self._clean(reason, 220)
        if not key or not picked or _SENSITIVE.search(f"{key} {picked} {why}"):
            return None
        now = utc_now()
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO assistant_preferences(domain,choice,reason,source,created_at,updated_at) VALUES(?,?,?,?,?,?) "
                "ON CONFLICT(domain) DO UPDATE SET choice=excluded.choice,reason=excluded.reason,"
                "source=excluded.source,updated_at=excluded.updated_at",
                (key, picked, why, source, now, now),
            )
        return self.get(key)

    def choose(self, domain: str, options: list[str] | None = None) -> dict[str, str] | None:
        existing = self.get(domain)
        if existing:
            return existing
        key = self._clean(domain, 60).casefold()
        default = self.DEFAULTS.get(key)
        if default:
            return self.set(key, default[0], default[1], "self_selected")
        clean_options = [self._clean(option, 100) for option in (options or [])]
        clean_options = [option for option in clean_options if option]
        if clean_options:
            # Stable selection—not Python's randomized hash—so a first choice
            # remains reproducible even before it is written.
            digest = hashlib.sha256(f"meera:{key}".encode("utf-8")).digest()
            picked = clean_options[int.from_bytes(digest[:4], "big") % len(clean_options)]
            return self.set(key, picked, "That is the option I was most drawn to when I made the choice.", "self_selected")
        return None

    def all(self) -> list[dict[str, str]]:
        with self._lock, self._connect() as db:
            rows = db.execute(
                "SELECT domain,choice,reason,source,updated_at FROM assistant_preferences ORDER BY updated_at DESC"
            ).fetchall()
        return [
            {"domain": r[0], "choice": r[1], "reason": r[2], "source": r[3], "updated_at": r[4]}
            for r in rows
        ]


class MemoryStore:
    """Small explicit semantic-memory store; secrets are rejected."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, content TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def remember(self, content: str, kind: str = "semantic") -> bool:
        clean = " ".join(content.split()).strip()
        if not clean or _SENSITIVE.search(clean):
            return False
        now = utc_now()
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO memories(kind,content,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(content) DO UPDATE SET updated_at=excluded.updated_at",
                (kind, clean, now, now),
            )
        return True

    def all(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT id, kind, content, created_at, updated_at FROM memories ORDER BY updated_at DESC").fetchall()
        return [{"id": r[0], "kind": r[1], "content": r[2], "created_at": r[3], "updated_at": r[4]} for r in rows]

    def forget(self, content_or_id: str | int) -> bool:
        with self._lock, self._connect() as db:
            if isinstance(content_or_id, int) or (isinstance(content_or_id, str) and content_or_id.isdigit()):
                cursor = db.execute("DELETE FROM memories WHERE id=?", (int(content_or_id),))
            else:
                cursor = db.execute("DELETE FROM memories WHERE content=?", (str(content_or_id),))
            return cursor.rowcount > 0

    def clear(self) -> None:
        with self._lock, self._connect() as db:
            db.execute("DELETE FROM memories")

    def recent(self, limit: int = 8) -> list[str]:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT content FROM memories ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        return [row[0] for row in rows]

    def relevant(self, query: str, limit: int = 8) -> list[str]:
        candidates = self.recent(50)
        stopwords = {
            "and", "are", "but", "can", "could", "did", "does", "for", "from",
            "have", "how", "into", "just", "meera", "that", "the", "their", "then",
            "there", "these", "they", "this", "those", "was", "were", "what", "when",
            "where", "which", "who", "why", "with", "would", "you", "your",
        }
        terms = {
            word for word in re.findall(r"[a-z0-9]+", query.casefold())
            if len(word) > 2 and word not in stopwords
        }
        if not terms:
            return []
        ranked: list[tuple[int, int, str]] = []
        for index, content in enumerate(candidates):
            memory_terms = set(re.findall(r"[a-z0-9]+", content.casefold())) - stopwords
            score = len(terms.intersection(memory_terms))
            if score > 0:
                ranked.append((score, index, content))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return [content for _score, _index, content in ranked[:limit]]


class PronunciationStore:
    """Persistent user-taught names and explicit ASR corrections."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS pronunciations ("
                "alias TEXT PRIMARY KEY COLLATE NOCASE, canonical TEXT NOT NULL, updated_at TEXT NOT NULL)"
            )

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def learn(self, canonical: str, alias: str | None = None) -> bool:
        canonical = " ".join(canonical.split()).strip(" .,!?")
        alias = " ".join((alias or canonical).split()).strip(" .,!?")
        if not canonical or not alias or _SENSITIVE.search(canonical):
            return False
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO pronunciations(alias,canonical,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(alias) DO UPDATE SET canonical=excluded.canonical,updated_at=excluded.updated_at",
                (alias, canonical, utc_now()),
            )
        return True

    def corrections(self) -> dict[str, str]:
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT alias,canonical FROM pronunciations ORDER BY updated_at DESC").fetchall()
        return {row[0]: row[1] for row in rows}

    def hotwords(self) -> list[str]:
        return list(dict.fromkeys(self.corrections().values()))

    def forget(self, alias: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("DELETE FROM pronunciations WHERE alias=? COLLATE NOCASE", (alias,))
