"""
Meera Selective Long-Term Memory System
========================================
Production-grade, model-independent memory architecture.

Design principles:
- Store atomic facts, NOT conversations
- Hybrid retrieval: semantic + keyword + entity + temporal
- Memory budget: max 5 memories, ~800 tokens injected
- Contradiction detection with temporal awareness
- Explicit remember/forget commands
- Silent by default — memory informs answers without announcing itself

Storage: SQLite (zero-setup local)
Embeddings: provided via callback from Meera.py's existing embedding infrastructure
"""

import sqlite3
import json
import logging
import os
import re
import time
import uuid
import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Callable, Awaitable, Tuple

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

logger = logging.getLogger("MeeraMemory")

# ---------------------------------------------------------------------------
# Vector math
# ---------------------------------------------------------------------------

def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    if HAS_NUMPY:
        a_arr = np.array(a, dtype=np.float32)
        b_arr = np.array(b, dtype=np.float32)
        norm_a = np.linalg.norm(a_arr)
        norm_b = np.linalg.norm(b_arr)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))
    else:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

# ---------------------------------------------------------------------------
# Database layer
# ---------------------------------------------------------------------------

class MemoryDB:
    """SQLite-backed persistent memory store."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._init_db()

    def _get_connection(self):
        """Helper to obtain a SQLite connection configured for concurrent access."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id              TEXT PRIMARY KEY,
                    user_id         TEXT,
                    scope           TEXT DEFAULT 'global',
                    project_id      TEXT,
                    type            TEXT DEFAULT 'fact',
                    content         TEXT NOT NULL,
                    embedding       TEXT,
                    importance      REAL DEFAULT 0.5,
                    confidence      REAL DEFAULT 0.8,
                    created_at      TEXT,
                    updated_at      TEXT,
                    last_accessed_at TEXT,
                    access_count    INTEGER DEFAULT 0,
                    entities        TEXT DEFAULT '[]',
                    keywords        TEXT DEFAULT '[]',
                    status          TEXT DEFAULT 'active',
                    valid_from      TEXT,
                    valid_until     TEXT,
                    source_message  TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_status
                ON memories(status)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_memories_scope
                ON memories(scope, project_id)
            """)
            conn.commit()

    # -- helpers --

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        for json_field in ("embedding", "entities", "keywords"):
            if d.get(json_field):
                try:
                    d[json_field] = json.loads(d[json_field])
                except (json.JSONDecodeError, TypeError):
                    d[json_field] = []
            else:
                d[json_field] = []
        return d

    # -- CRUD --

    def add_memory(self, memory: Dict[str, Any]):
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO memories
                (id, user_id, scope, project_id, type, content, embedding,
                 importance, confidence, created_at, updated_at,
                 last_accessed_at, access_count, entities, keywords,
                 status, valid_from, valid_until, source_message)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                memory.get("id", f"mem_{uuid.uuid4().hex[:12]}"),
                memory.get("user_id"),
                memory.get("scope", "global"),
                memory.get("project_id"),
                memory.get("type", "fact"),
                memory["content"],
                json.dumps(memory.get("embedding", [])),
                memory.get("importance", 0.5),
                memory.get("confidence", 0.8),
                memory.get("created_at", now),
                memory.get("updated_at", now),
                None,
                0,
                json.dumps(memory.get("entities", [])),
                json.dumps(memory.get("keywords", [])),
                memory.get("status", "active"),
                memory.get("valid_from", now),
                memory.get("valid_until"),
                memory.get("source_message"),
            ))
            conn.commit()

    def get_memory_by_id(self, mem_id: str) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM memories WHERE id=?", (mem_id,)).fetchone()
            return self._row_to_dict(row) if row else None

    def get_active_memories(self, scope: Optional[str] = None,
                            project_id: Optional[str] = None) -> List[Dict]:
        query = "SELECT * FROM memories WHERE status='active'"
        params: list = []
        if scope:
            query += " AND scope=?"
            params.append(scope)
        if project_id:
            query += " AND project_id=?"
            params.append(project_id)
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def update_memory(self, mem_id: str, updates: Dict[str, Any]):
        if not updates:
            return
        now = datetime.now(timezone.utc).isoformat()
        updates["updated_at"] = now
        set_clause = ", ".join(f"{k}=?" for k in updates)
        vals = list(updates.values()) + [mem_id]
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(f"UPDATE memories SET {set_clause} WHERE id=?", vals)
            conn.commit()

    def delete_memory(self, mem_id: str):
        """Soft-delete: sets status to 'deleted'."""
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE memories SET status='deleted', valid_until=? WHERE id=?",
                (now, mem_id)
            )
            conn.commit()

    def update_access_stats(self, mem_id: str):
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE memories SET access_count=access_count+1, last_accessed_at=? WHERE id=?",
                (now, mem_id)
            )
            conn.commit()

    def search_by_content(self, query: str) -> List[Dict]:
        """Simple LIKE search for keyword matching."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM memories WHERE status='active' AND content LIKE ?",
                (f"%{query}%",)
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_memories_by_entity(self, entity: str) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM memories WHERE status='active' AND entities LIKE ?",
                (f"%{entity}%",)
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

# ---------------------------------------------------------------------------
# Hybrid Retriever
# ---------------------------------------------------------------------------

class HybridRetriever:
    """
    Multi-signal retrieval combining:
      0.35 * semantic_similarity
      0.20 * keyword_match
      0.15 * entity_match
      0.10 * temporal_relevance
      0.10 * importance
      0.05 * recency
      0.05 * access_frequency
    """

    def __init__(self, db: MemoryDB):
        self.db = db

    def retrieve(self, query_text: str, query_embedding: List[float],
                 scope: Optional[str] = None, project_id: Optional[str] = None,
                 top_k: int = 5) -> List[Dict]:
        memories = self.db.get_active_memories(scope, project_id)
        if not memories:
            return []

        query_lower = query_text.lower()
        query_words = set(re.findall(r'\b[a-z]{2,}\b', query_lower))
        now_ts = time.time()
        scored: List[Tuple[float, Dict]] = []

        for m in memories:
            # 1. Semantic similarity
            semantic = 0.0
            if query_embedding and m.get("embedding"):
                semantic = max(0.0, cosine_similarity(query_embedding, m["embedding"]))

            # 2. Keyword match (Jaccard-like)
            mem_words = set(re.findall(r'\b[a-z]{2,}\b', m["content"].lower()))
            kw_overlap = len(query_words & mem_words)
            keyword_score = kw_overlap / max(1, len(query_words))

            # Also check explicit keywords field
            mem_keywords = set(k.lower() for k in m.get("keywords", []))
            kw_field_overlap = len(query_words & mem_keywords)
            keyword_score = max(keyword_score, kw_field_overlap / max(1, len(query_words)))

            # 3. Entity match
            entity_score = 0.0
            entities = m.get("entities", [])
            if entities:
                matched = sum(1 for e in entities if e.lower() in query_lower)
                entity_score = matched / len(entities)

            # 4. Temporal relevance (current memories score higher by default)
            temporal = 1.0 if not m.get("valid_until") else 0.3

            # 5. Importance
            importance = m.get("importance", 0.5)

            # 6. Recency (exponential decay, half-life ~30 days)
            updated = m.get("updated_at") or m.get("created_at") or ""
            recency = 0.5
            if updated:
                try:
                    updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                    days_ago = (datetime.now(timezone.utc) - updated_dt).total_seconds() / 86400
                    recency = math.exp(-0.023 * days_ago)  # ~30-day half-life
                except (ValueError, TypeError):
                    pass

            # 7. Access frequency (normalized, capped)
            access = min(m.get("access_count", 0), 100) / 100.0

            # Weighted composite score
            score = (
                0.35 * semantic +
                0.20 * keyword_score +
                0.15 * entity_score +
                0.10 * temporal +
                0.10 * importance +
                0.05 * recency +
                0.05 * access
            )
            scored.append((score, m))

        scored.sort(key=lambda x: x[0], reverse=True)
        # Update access stats for returned memories
        top = scored[:top_k]
        for _, m in top:
            try:
                self.db.update_access_stats(m["id"])
            except Exception:
                pass
        return [m for _, m in top]

# ---------------------------------------------------------------------------
# Contradiction Detector
# ---------------------------------------------------------------------------

class ContradictionDetector:
    """Detects potential conflicts between new and existing memories."""

    def __init__(self, db: MemoryDB):
        self.db = db

    def detect(self, new_memory: Dict) -> List[Dict]:
        """Return existing memories that may contradict the new one."""
        conflicts: List[Dict] = []
        new_type = new_memory.get("type", "")
        new_keywords = set(k.lower() for k in new_memory.get("keywords", []))
        new_entities = set(e.lower() for e in new_memory.get("entities", []))
        new_content = new_memory.get("content", "").lower()

        # Check memories of the same type
        existing = self.db.get_active_memories(
            scope=new_memory.get("scope"),
            project_id=new_memory.get("project_id")
        )

        for m in existing:
            if m.get("type") != new_type:
                continue

            old_keywords = set(k.lower() for k in m.get("keywords", []))
            old_entities = set(e.lower() for e in m.get("entities", []))
            old_content = m.get("content", "").lower()

            # Same type + overlapping keywords/entities + different content = conflict
            keyword_overlap = new_keywords & old_keywords
            entity_overlap = new_entities & old_entities

            if (keyword_overlap or entity_overlap) and old_content != new_content:
                conflicts.append(m)

        return conflicts

    def resolve_conflicts(self, conflicts: List[Dict], new_memory: Dict):
        """Mark conflicting memories as historical and set valid_until."""
        now = datetime.now(timezone.utc).isoformat()
        for conflict in conflicts:
            self.db.update_memory(conflict["id"], {
                "status": "historical",
                "valid_until": now,
            })
            logger.info(
                f"Memory '{conflict['id']}' marked historical "
                f"(superseded by new memory: {new_memory.get('content', '')[:60]})"
            )

# ---------------------------------------------------------------------------
# Memory Extractor
# ---------------------------------------------------------------------------

class MemoryExtractor:
    """Uses an LLM callback to extract atomic facts from user messages."""

    # Patterns that indicate high-importance explicit memory commands
    EXPLICIT_PATTERNS = [
        r"\bremember\s+(?:that|this)\b",
        r"\bmy\s+name\s+is\b",
        r"\bi\s+prefer\b",
        r"\bi\s+always\s+use\b",
        r"\blet'?s?\s+use\b",
        r"\bwe\s+decided\b",
        r"\bfrom\s+now\s+on\b",
        r"\bi\s+(?:work|live|am)\s+(?:at|in|on|from)\b",
    ]

    def __init__(self, extract_callback: Callable[[str], Awaitable[str]]):
        self.extract_callback = extract_callback

    def is_explicit_memory_candidate(self, text: str) -> bool:
        text_lower = text.lower()
        return any(re.search(p, text_lower) for p in self.EXPLICIT_PATTERNS)

    async def extract_memories(self, text: str) -> List[Dict]:
        """Extract atomic memory facts from user text."""
        prompt = (
            "You are a memory extraction engine. Extract atomic, durable facts from "
            "the following user message. Ignore pleasantries, temporary tasks, transient "
            "questions, or things not worth remembering long-term.\n\n"
            "Return ONLY a JSON array. Each object must have:\n"
            '- "content": short atomic fact (one sentence max)\n'
            '- "type": one of [preference, personal_fact, project_fact, decision, goal, constraint, procedural]\n'
            '- "importance": 0.0 to 1.0\n'
            '- "confidence": 0.0 to 1.0\n'
            '- "entities": list of key entity strings\n'
            '- "keywords": list of searchable keyword strings\n\n'
            "If nothing is worth remembering, return [].\n\n"
            f'User message: """{text}"""\n\n'
            "JSON Array:"
        )
        try:
            result_text = await self.extract_callback(prompt)
            # Find JSON array in response
            match = re.search(r'\[.*?\]', result_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list):
                    # Validate structure
                    valid = []
                    for item in parsed:
                        if isinstance(item, dict) and "content" in item:
                            item.setdefault("type", "fact")
                            item.setdefault("importance", 0.5)
                            item.setdefault("confidence", 0.8)
                            item.setdefault("entities", [])
                            item.setdefault("keywords", [])
                            valid.append(item)
                    return valid
        except Exception as e:
            logger.warning(f"Memory extraction failed: {e}")
        return []

# ---------------------------------------------------------------------------
# Memory Router
# ---------------------------------------------------------------------------

class MemoryRouter:
    """Decides whether to read/write memory for a given message."""

    # Patterns that NEVER need memory
    NO_MEMORY_PATTERNS = [
        r"^\s*(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you)\s*[!.\s]*$",
        r"^\s*(?:what(?:'s| is)\s+\d+\s*[\+\-\*\/×÷%]\s*\d+|calculate\s)",
        r"^\s*(?:ok|okay|sure|yes|no|yep|nope|got\s+it|alright)\s*[!.\s]*$",
    ]

    # Patterns that trigger WRITE
    WRITE_PATTERNS = [
        r"\bremember\s+(?:that|this)\b",
        r"\bdon'?t\s+forget\b",
        r"\bkeep\s+(?:in\s+mind|note)\b",
        r"\bfrom\s+now\s+on\b",
        r"\bwe\s+decided\b",
        r"\blet'?s?\s+(?:go\s+with|use|switch\s+to)\b",
        r"\bi\s+prefer\b",
        r"\bi\s+always\b",
        r"\bmy\s+name\s+is\b",
    ]

    # Patterns that trigger READ
    READ_PATTERNS = [
        r"\bwhat\s+(?:do\s+you\s+)?remember\b",
        r"\bwhat\s+(?:did\s+)?(?:we|i)\s+(?:decide|choose|pick|settle)\b",
        r"\bwhat\s+(?:do\s+)?i\s+prefer\b",
        r"\bmy\s+preference\b",
        r"\bwhat\s+(?:database|stack|framework|language)\b",
        r"\bpreviously\b",
        r"\bwhat\s+did\s+(?:i|we)\s+(?:say|tell|mention)\b",
    ]

    # Patterns that trigger FORGET
    FORGET_PATTERNS = [
        r"\bforget\s+(?:that|this|about|my)\b",
        r"\bdon'?t\s+remember\b",
        r"\bremove\s+(?:that\s+)?memor",
        r"\bdelete\s+(?:that\s+)?memor",
        r"\bclear\s+(?:my\s+)?memor",
    ]

    def __init__(self, route_callback: Callable[[str], Awaitable[str]]):
        self.route_callback = route_callback

    async def classify(self, text: str) -> Dict[str, bool]:
        """Classify user intent regarding memory operations."""
        text_lower = text.lower().strip()

        # Fast deterministic pass
        # No memory needed
        for pattern in self.NO_MEMORY_PATTERNS:
            if re.match(pattern, text_lower, re.IGNORECASE):
                return {"should_retrieve": False, "should_write": False, "should_forget": False}

        should_write = any(re.search(p, text_lower) for p in self.WRITE_PATTERNS)
        should_read = any(re.search(p, text_lower) for p in self.READ_PATTERNS)
        should_forget = any(re.search(p, text_lower) for p in self.FORGET_PATTERNS)

        if should_write or should_read or should_forget:
            return {
                "should_retrieve": should_read or should_forget,
                "should_write": should_write,
                "should_forget": should_forget,
            }

        # Ambiguous: use lightweight LLM classification
        try:
            prompt = (
                "Does answering this message require recalling stored long-term memories, "
                "user preferences, or project decisions? Reply ONLY with YES or NO.\n\n"
                f"Message: {text[:300]}"
            )
            result = await self.route_callback(prompt)
            needs_memory = "YES" in result.upper()
            return {
                "should_retrieve": needs_memory,
                "should_write": False,  # Implicit writes handled by extraction
                "should_forget": False,
            }
        except Exception:
            # Default: try retrieval for safety, don't write
            return {"should_retrieve": True, "should_write": False, "should_forget": False}

# ---------------------------------------------------------------------------
# MeeraMemory — Main Orchestrator
# ---------------------------------------------------------------------------

class MeeraMemory:
    """
    Central memory system for Meera.

    Usage:
        mem = MeeraMemory(db_path, extract_cb, route_cb, embed_cb)
        context = await mem.process_before_generation(user_text)
        # ... give context to LLM ...
        await mem.process_after_generation(user_text, assistant_text)
    """

    MAX_RETRIEVED = 5
    MAX_MEMORY_TOKENS = 800  # approximate

    def __init__(self, db_path: str,
                 extract_callback: Callable[[str], Awaitable[str]],
                 route_callback: Callable[[str], Awaitable[str]],
                 embed_callback: Callable[[str], Awaitable[List[float]]]):
        self.db = MemoryDB(db_path)
        self.extractor = MemoryExtractor(extract_callback)
        self.router = MemoryRouter(route_callback)
        self.retriever = HybridRetriever(self.db)
        self.contradiction = ContradictionDetector(self.db)
        self.embed_callback = embed_callback
        logger.info(f"MeeraMemory initialized (db: {db_path})")

    # -- Public API --

    async def process_before_generation(self, user_text: str,
                                        scope: str = "global",
                                        project_id: Optional[str] = None) -> str:
        """Called BEFORE LLM generation. Returns memory context string or ''."""
        try:
            classification = await self.router.classify(user_text)

            if not classification.get("should_retrieve"):
                return ""

            query_embedding = await self.embed_callback(user_text)
            memories = self.retriever.retrieve(
                user_text, query_embedding,
                scope=scope, project_id=project_id,
                top_k=self.MAX_RETRIEVED
            )
            if not memories:
                return ""

            # Budget: truncate to ~MAX_MEMORY_TOKENS
            lines = []
            token_estimate = 0
            for i, m in enumerate(memories):
                line = f"{i+1}. {m['content']}"
                token_est = len(line.split()) * 1.3  # rough token estimate
                if token_estimate + token_est > self.MAX_MEMORY_TOKENS:
                    break
                lines.append(line)
                token_estimate += token_est

            if not lines:
                return ""

            return (
                "\n\n<meera_memory>\n"
                "Relevant memories:\n"
                + "\n".join(lines)
                + "\n</meera_memory>\n"
            )
        except Exception as e:
            logger.warning(f"Memory retrieval failed: {e}")
            return ""

    async def process_after_generation(self, user_text: str,
                                       assistant_text: str = "",
                                       scope: str = "global",
                                       project_id: Optional[str] = None):
        """Called AFTER LLM generation. Extracts and stores new memories."""
        try:
            # Check if the message is worth extracting from
            classification = await self.router.classify(user_text)
            is_explicit = self.extractor.is_explicit_memory_candidate(user_text)

            if not (classification.get("should_write") or is_explicit):
                # For non-explicit messages, still try extraction but don't force it
                facts = await self.extractor.extract_memories(user_text)
                # Only store high-importance facts from implicit extraction
                facts = [f for f in facts if f.get("importance", 0) >= 0.7]
            else:
                facts = await self.extractor.extract_memories(user_text)
                # Boost importance for explicit commands
                if is_explicit:
                    for f in facts:
                        f["importance"] = max(f.get("importance", 0.5), 0.85)
                        f["confidence"] = max(f.get("confidence", 0.5), 0.90)

            for fact in facts:
                await self._store_fact(fact, scope, project_id, user_text)

        except Exception as e:
            logger.warning(f"Memory extraction failed: {e}")

    async def remember(self, text: str, scope: str = "global",
                       project_id: Optional[str] = None) -> Dict:
        """Explicit 'remember this' command."""
        embedding = await self.embed_callback(text)
        # Extract keywords/entities from the text
        words = re.findall(r'\b[A-Z][a-z]+\b|\b[A-Z]{2,}\b', text)
        keywords = list(set(re.findall(r'\b[a-z]{3,}\b', text.lower())))[:10]

        memory = {
            "id": f"mem_{uuid.uuid4().hex[:12]}",
            "content": text,
            "type": "personal_fact",
            "importance": 0.90,
            "confidence": 0.99,
            "embedding": embedding,
            "entities": words[:10],
            "keywords": keywords,
            "scope": scope,
            "project_id": project_id,
            "source_message": text,
        }

        # Check for contradictions
        conflicts = self.contradiction.detect(memory)
        if conflicts:
            self.contradiction.resolve_conflicts(conflicts, memory)

        self.db.add_memory(memory)
        logger.info(f"Explicitly remembered: {text[:60]}")
        return memory

    async def forget(self, query: str) -> int:
        """Forget memories matching the query. Returns count of forgotten memories."""
        # Search by content match
        matches = self.db.search_by_content(query)

        # Also try entity search
        entity_matches = self.db.get_memories_by_entity(query)
        seen_ids = {m["id"] for m in matches}
        for m in entity_matches:
            if m["id"] not in seen_ids:
                matches.append(m)

        count = 0
        for m in matches:
            self.db.delete_memory(m["id"])
            count += 1
            logger.info(f"Forgot memory: {m['content'][:60]}")

        return count

    def list_memories(self, scope: Optional[str] = None,
                      project_id: Optional[str] = None) -> List[Dict]:
        """List all active memories."""
        return self.db.get_active_memories(scope, project_id)

    # -- Internal --

    async def _store_fact(self, fact: Dict, scope: str,
                          project_id: Optional[str],
                          source_message: str):
        """Store a single extracted fact with embedding and conflict detection."""
        content = fact.get("content", "").strip()
        if not content or len(content) < 5:
            return

        embedding = await self.embed_callback(content)

        memory = {
            "id": f"mem_{uuid.uuid4().hex[:12]}",
            "content": content,
            "type": fact.get("type", "fact"),
            "importance": fact.get("importance", 0.5),
            "confidence": fact.get("confidence", 0.8),
            "embedding": embedding,
            "entities": fact.get("entities", []),
            "keywords": fact.get("keywords", []),
            "scope": scope,
            "project_id": project_id,
            "source_message": source_message[:500],
        }

        # Contradiction detection
        conflicts = self.contradiction.detect(memory)
        if conflicts:
            self.contradiction.resolve_conflicts(conflicts, memory)

        self.db.add_memory(memory)
        logger.info(f"Stored atomic memory: {content[:60]}")


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_memory_instance: Optional[MeeraMemory] = None


def get_meera_memory() -> Optional[MeeraMemory]:
    """Return the global MeeraMemory instance, or None if not initialized."""
    return _memory_instance


def init_meera_memory(db_path: str,
                      extract_callback: Callable[[str], Awaitable[str]],
                      route_callback: Callable[[str], Awaitable[str]],
                      embed_callback: Callable[[str], Awaitable[List[float]]]) -> MeeraMemory:
    """Initialize the global MeeraMemory singleton."""
    global _memory_instance
    _memory_instance = MeeraMemory(db_path, extract_callback, route_callback, embed_callback)
    return _memory_instance
