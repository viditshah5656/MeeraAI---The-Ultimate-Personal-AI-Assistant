"""Versioned, provenance-aware role knowledge snapshots."""

from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class KnowledgeSource:
    url: str
    title: str = ""
    retrieved_at: str = field(default_factory=_now)
    confidence: float = 1.0


@dataclass(frozen=True)
class KnowledgeFact:
    id: str
    summary: str
    topics: tuple[str, ...] = ()
    source_ids: tuple[str, ...] = ()
    freshness_days: Optional[int] = None
    confidence: float = 1.0


@dataclass(frozen=True)
class KnowledgeVersion:
    version: int
    role_id: str
    created_at: str
    sources: tuple[KnowledgeSource, ...] = ()
    facts: tuple[KnowledgeFact, ...] = ()

    def to_dict(self) -> dict:
        return {
            "version": self.version, "role_id": self.role_id, "created_at": self.created_at,
            "sources": [asdict(source) for source in self.sources],
            "facts": [asdict(fact) for fact in self.facts],
        }


class KnowledgeStore:
    def __init__(self, storage_path: str | Path):
        self.storage_path = Path(storage_path)
        self._versions: dict[str, list[KnowledgeVersion]] = {}
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists(): return
        try:
            payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            for role_id, versions in payload.get("roles", {}).items():
                self._versions[role_id] = [self._from_dict(item) for item in versions]
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError): return

    @staticmethod
    def _from_dict(item: dict) -> KnowledgeVersion:
        return KnowledgeVersion(
            version=int(item["version"]), role_id=str(item["role_id"]), created_at=str(item["created_at"]),
            sources=tuple(KnowledgeSource(**source) for source in item.get("sources", ())),
            facts=tuple(KnowledgeFact(**fact) for fact in item.get("facts", ())),
        )

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"version": 1, "roles": {role: [item.to_dict() for item in versions] for role, versions in self._versions.items()}}, indent=2), encoding="utf-8")
        temporary.replace(self.storage_path)

    def latest(self, role_id: str) -> Optional[KnowledgeVersion]:
        versions = self._versions.get(role_id, [])
        return versions[-1] if versions else None

    def publish(self, role_id: str, facts: list[KnowledgeFact], sources: list[KnowledgeSource]) -> KnowledgeVersion:
        previous = self.latest(role_id)
        version = (previous.version if previous else 0) + 1
        snapshot = KnowledgeVersion(version, role_id, _now(), tuple(sources), tuple(facts))
        self._versions.setdefault(role_id, []).append(snapshot)
        self._save()
        return snapshot

    def history(self, role_id: str) -> list[KnowledgeVersion]:
        return list(self._versions.get(role_id, []))

    def search(self, role_id: str, query: str, limit: int = 8) -> list[KnowledgeFact]:
        snapshot = self.latest(role_id)
        if not snapshot: return []
        tokens = {token.lower() for token in query.split() if len(token) > 2}
        scored = []
        for fact in snapshot.facts:
            haystack = f"{fact.summary} {' '.join(fact.topics)}".lower()
            score = sum(token in haystack for token in tokens)
            if score: scored.append((score, fact))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [fact for _, fact in scored[:max(1, limit)]]
