"""Centralized, hardened SQLite database manager for MeeraAI.

Enables Write-Ahead Logging (WAL) for high concurrency, robust busy timeouts,
and idempotent versioned schema migrations.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


_lock = threading.RLock()


def open_database(database_path: Path, *, row_factory: bool = False) -> sqlite3.Connection:
    """Return a hardened SQLite connection with WAL mode and generous busy timeout."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(database_path), timeout=15.0, check_same_thread=False)
    if row_factory:
        conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _migration_001_baseline(conn: sqlite3.Connection) -> None:
    """Baseline schema covering tasks, memories, pronunciations, emotion, voice, and research."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            content TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pronunciations (
            alias TEXT PRIMARY KEY COLLATE NOCASE,
            canonical TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS emotion_state (
            id INTEGER PRIMARY KEY CHECK(id=1),
            payload TEXT NOT NULL,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runtime_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS voice_profiles (
            name TEXT PRIMARY KEY COLLATE NOCASE,
            role TEXT NOT NULL,
            voiceprint BLOB NOT NULL,
            threshold REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS one_voice_owner ON voice_profiles(role) WHERE role='owner';

        CREATE TABLE IF NOT EXISTS research_session (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1),
            query TEXT NOT NULL,
            kind TEXT NOT NULL,
            results TEXT NOT NULL,
            selected_index INTEGER,
            selected_evidence TEXT,
            updated_at REAL NOT NULL
        );
    """)


def _migration_002_performance_indices(conn: sqlite3.Connection) -> None:
    """Add indices for fast lookups on memories and settings."""
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pronunciations_updated ON pronunciations(updated_at DESC);
    """)


def _migration_003_persona_preferences(conn: sqlite3.Connection) -> None:
    """Persist Meera's own source-tagged, stable persona choices."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS assistant_preferences (
            domain TEXT PRIMARY KEY COLLATE NOCASE,
            choice TEXT NOT NULL,
            reason TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)


MIGRATIONS: list[tuple[int, str, Callable[[sqlite3.Connection], None]]] = [
    (1, "baseline_tables", _migration_001_baseline),
    (2, "performance_indices", _migration_002_performance_indices),
    (3, "persona_preferences", _migration_003_persona_preferences),
]


def run_migrations(database_path: Path) -> int:
    """Apply all pending migrations in order within transactions. Return applied count."""
    with _lock:
        conn = open_database(database_path)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS _schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                )
            """)
            conn.commit()

            applied_rows = conn.execute("SELECT version FROM _schema_migrations ORDER BY version").fetchall()
            applied_versions = {row[0] for row in applied_rows}

            applied_count = 0
            for version, name, migration_fn in MIGRATIONS:
                if version not in applied_versions:
                    with conn:
                        migration_fn(conn)
                        conn.execute(
                            "INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                            (version, name, utc_now()),
                        )
                    applied_count += 1
            return applied_count
        finally:
            conn.close()
