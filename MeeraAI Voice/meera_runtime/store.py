from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import asdict
from pathlib import Path

from .db import open_database
from .models import Artifact, Task, TaskPriority, TaskStatus, utc_now


class TaskStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_at DESC)")

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path, row_factory=True)

    def save(self, task: Task) -> None:
        task.updated_at = utc_now()
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO tasks VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,payload=excluded.payload",
                (task.id, task.status.value, task.updated_at, json.dumps(asdict(task))),
            )

    @staticmethod
    def _decode(row: sqlite3.Row) -> Task:
        data = json.loads(row["payload"])
        data["status"] = TaskStatus(data["status"])
        data["priority"] = TaskPriority(data["priority"])
        data["artifacts"] = [Artifact(**item) for item in data.get("artifacts", [])]
        return Task(**data)

    def get(self, task_id: str) -> Task | None:
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return self._decode(row) if row else None

    def most_recent_unfinished(self) -> Task | None:
        with self._lock, self._connect() as db:
            row = db.execute(
                "SELECT * FROM tasks WHERE status NOT IN ('completed','failed','cancelled') ORDER BY updated_at DESC LIMIT 1"
            ).fetchone()
        return self._decode(row) if row else None
