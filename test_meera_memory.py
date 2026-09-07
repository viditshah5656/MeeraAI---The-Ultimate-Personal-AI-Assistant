"""
Meera Memory System — Comprehensive Test Suite
================================================
Tests all components without requiring an LLM or network.
Uses mock callbacks for extract, route, and embed functions.
"""

import asyncio
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meera_memory import (
    MemoryDB, HybridRetriever, MeeraMemory, cosine_similarity,
    MemoryRouter, MemoryExtractor, ContradictionDetector
)

# === Mock Callbacks ===

async def mock_extract_callback(prompt: str) -> str:
    """Simulates LLM extraction by returning canned JSON."""
    text = prompt.lower()
    if "postgresql" in text:
        return json.dumps([{
            "content": "User prefers PostgreSQL",
            "type": "preference",
            "importance": 0.9,
            "confidence": 0.95,
            "entities": ["PostgreSQL"],
            "keywords": ["database", "postgresql"]
        }])
    if "python" in text:
        return json.dumps([{
            "content": "User prefers Python for backend",
            "type": "preference",
            "importance": 0.85,
            "confidence": 0.9,
            "entities": ["Python"],
            "keywords": ["python", "backend"]
        }])
    if "remember" in text and ("dark mode" in text or "dark" in text):
        return json.dumps([{
            "content": "User prefers dark mode",
            "type": "preference",
            "importance": 0.8,
            "confidence": 0.9,
            "entities": ["dark mode"],
            "keywords": ["dark", "mode", "theme", "ui"]
        }])
    if "remember" in text:
        # Generic remember
        return json.dumps([{
            "content": "User stated something worth remembering",
            "type": "personal_fact",
            "importance": 0.8,
            "confidence": 0.9,
            "entities": [],
            "keywords": []
        }])
    return "[]"

async def mock_route_callback(prompt: str) -> str:
    text = prompt.lower()
    if any(k in text for k in ["prefer", "database", "remember", "decision", "stack"]):
        return "YES"
    return "NO"

async def mock_embed_callback(text: str) -> list:
    """Deterministic hash-based embedding for testing."""
    import hashlib
    h = hashlib.sha256(text.lower().encode()).digest()
    return [float(b) / 255.0 for b in h]

# === Tests ===

def test_cosine_similarity():
    print("Test: cosine_similarity...")
    a = [1.0, 0.0, 0.0]
    b = [1.0, 0.0, 0.0]
    assert abs(cosine_similarity(a, b) - 1.0) < 0.001, "Identical vectors should have similarity 1.0"

    c = [0.0, 1.0, 0.0]
    assert abs(cosine_similarity(a, c)) < 0.001, "Orthogonal vectors should have similarity ~0.0"

    d = [-1.0, 0.0, 0.0]
    assert cosine_similarity(a, d) < 0, "Opposite vectors should have negative similarity"

    assert cosine_similarity([], []) == 0.0, "Empty vectors should return 0"
    print("  ✅ PASSED")

def test_memory_db_crud():
    print("Test: MemoryDB CRUD operations...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db = MemoryDB(os.path.join(tmpdir, "test.db"))

        # Create
        mem = {
            "id": "mem_test001",
            "user_id": "user1",
            "scope": "global",
            "project_id": None,
            "type": "preference",
            "content": "User prefers dark mode",
            "embedding": [0.1, 0.2, 0.3],
            "importance": 0.9,
            "confidence": 0.95,
            "entities": ["dark mode"],
            "keywords": ["dark", "mode", "theme"],
            "status": "active"
        }
        db.add_memory(mem)

        # Read
        result = db.get_memory_by_id("mem_test001")
        assert result is not None, "Should find memory by ID"
        assert result["content"] == "User prefers dark mode"
        assert result["importance"] == 0.9
        assert "dark mode" in result["entities"]

        # List active
        actives = db.get_active_memories()
        assert len(actives) == 1

        # Search by content
        found = db.search_by_content("dark mode")
        assert len(found) == 1

        # Delete (soft)
        db.delete_memory("mem_test001")
        actives = db.get_active_memories()
        assert len(actives) == 0, "Deleted memory should not appear in active list"

        # Verify it's still in DB but with deleted status
        deleted = db.get_memory_by_id("mem_test001")
        assert deleted is not None
        assert deleted["status"] == "deleted"

        print("  ✅ PASSED")

def test_memory_db_scoping():
    print("Test: MemoryDB scoped queries...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db = MemoryDB(os.path.join(tmpdir, "test.db"))

        db.add_memory({"id": "m1", "content": "Global fact", "scope": "global", "embedding": []})
        db.add_memory({"id": "m2", "content": "Meera project fact", "scope": "project", "project_id": "meera", "embedding": []})
        db.add_memory({"id": "m3", "content": "Other project fact", "scope": "project", "project_id": "other", "embedding": []})

        all_active = db.get_active_memories()
        assert len(all_active) == 3

        global_only = db.get_active_memories(scope="global")
        assert len(global_only) == 1

        meera_only = db.get_active_memories(scope="project", project_id="meera")
        assert len(meera_only) == 1
        assert meera_only[0]["content"] == "Meera project fact"

        print("  ✅ PASSED")

def test_hybrid_retrieval():
    print("Test: HybridRetriever scoring...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db = MemoryDB(os.path.join(tmpdir, "test.db"))

        db.add_memory({
            "id": "m_pg", "content": "User prefers PostgreSQL for databases",
            "embedding": [0.5] * 32, "importance": 0.9,
            "entities": ["PostgreSQL"], "keywords": ["database", "postgresql"],
            "type": "preference", "scope": "global"
        })
        db.add_memory({
            "id": "m_py", "content": "User likes Python for backend",
            "embedding": [0.3] * 32, "importance": 0.85,
            "entities": ["Python"], "keywords": ["python", "backend"],
            "type": "preference", "scope": "global"
        })
        db.add_memory({
            "id": "m_tz", "content": "User's timezone is IST",
            "embedding": [0.1] * 32, "importance": 0.5,
            "entities": ["IST"], "keywords": ["timezone"],
            "type": "personal_fact", "scope": "global"
        })

        retriever = HybridRetriever(db)
        results = retriever.retrieve("What database do I prefer?", [0.5] * 32, top_k=2)

        assert len(results) <= 2, "Should return at most top_k results"
        assert "PostgreSQL" in results[0]["content"], (
            f"Expected PostgreSQL first, got: {results[0]['content']}"
        )
        print("  ✅ PASSED")

def test_memory_router_deterministic():
    print("Test: MemoryRouter deterministic classification...")
    router = MemoryRouter(mock_route_callback)

    # Simple math — no memory needed
    result = asyncio.run(router.classify("What is 15 * 20?"))
    assert result["should_retrieve"] == False, "Math should not trigger retrieval"

    # Greeting — no memory
    result = asyncio.run(router.classify("Hello!"))
    assert result["should_retrieve"] == False, "Greeting should not trigger retrieval"

    # OK/acknowledgment — no memory
    result = asyncio.run(router.classify("ok"))
    assert result["should_retrieve"] == False

    # Remember command — should write
    result = asyncio.run(router.classify("Remember that I prefer dark mode"))
    assert result["should_write"] == True, "'Remember' should trigger write"

    # What do you remember — should read
    result = asyncio.run(router.classify("What do you remember about me?"))
    assert result["should_retrieve"] == True, "'What do you remember' should trigger read"

    # Forget command
    result = asyncio.run(router.classify("Forget my preference for Python"))
    assert result["should_forget"] == True, "'Forget' should trigger forget"

    # Decision recall
    result = asyncio.run(router.classify("What did we decide about the database?"))
    assert result["should_retrieve"] == True

    print("  ✅ PASSED")

def test_contradiction_detection():
    print("Test: ContradictionDetector...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db = MemoryDB(os.path.join(tmpdir, "test.db"))

        db.add_memory({
            "id": "m_old", "content": "User prefers React for frontend",
            "type": "preference", "entities": ["React"],
            "keywords": ["react", "frontend", "framework"],
            "embedding": [0.1] * 32, "importance": 0.8, "scope": "global"
        })

        detector = ContradictionDetector(db)
        new_mem = {
            "content": "User now prefers Svelte for frontend",
            "type": "preference",
            "entities": ["Svelte"],
            "keywords": ["svelte", "frontend", "framework"],
            "scope": "global",
        }
        conflicts = detector.detect(new_mem)
        assert len(conflicts) >= 1, "Should detect React vs Svelte as a conflict"
        assert conflicts[0]["content"] == "User prefers React for frontend"

        # Resolve: mark old as historical
        detector.resolve_conflicts(conflicts, new_mem)
        old = db.get_memory_by_id("m_old")
        assert old["status"] == "historical", "Old memory should be marked historical"
        assert old["valid_until"] is not None

        print("  ✅ PASSED")

def test_full_memory_lifecycle():
    print("Test: Full MeeraMemory lifecycle (store → retrieve → forget)...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        mem = MeeraMemory(db_path, mock_extract_callback, mock_route_callback, mock_embed_callback)

        # 1. Explicit remember
        asyncio.run(mem.remember("User prefers PostgreSQL for all projects"))
        memories = mem.list_memories()
        assert len(memories) >= 1, "Should have at least 1 memory after remember"
        print(f"    Stored {len(memories)} memory(ies)")

        # 2. Retrieve context
        context = asyncio.run(mem.process_before_generation("What database do I prefer?"))
        # Context should contain the memory (router will say YES because of 'prefer' + 'database')
        print(f"    Retrieved context: {context[:100]}..." if context else "    No context (router filtered)")

        # 3. Forget
        count = asyncio.run(mem.forget("PostgreSQL"))
        assert count >= 1, "Should have forgotten at least 1 memory"
        print(f"    Forgot {count} memory(ies)")

        # 4. Verify forgotten
        remaining = mem.list_memories()
        for m in remaining:
            assert "PostgreSQL" not in m["content"], "Forgotten memory should not appear"

        print("  ✅ PASSED")

def test_memory_extraction_patterns():
    print("Test: MemoryExtractor explicit pattern detection...")
    extractor = MemoryExtractor(mock_extract_callback)

    assert extractor.is_explicit_memory_candidate("Remember that I use Arch Linux")
    assert extractor.is_explicit_memory_candidate("I prefer dark mode")
    assert extractor.is_explicit_memory_candidate("My name is Rockstar")
    assert extractor.is_explicit_memory_candidate("From now on use TypeScript")
    assert extractor.is_explicit_memory_candidate("We decided to use PostgreSQL")
    assert not extractor.is_explicit_memory_candidate("What's the weather?")
    assert not extractor.is_explicit_memory_candidate("Hello!")

    print("  ✅ PASSED")

def test_access_stats():
    print("Test: Access stats tracking...")
    with tempfile.TemporaryDirectory() as tmpdir:
        db = MemoryDB(os.path.join(tmpdir, "test.db"))
        db.add_memory({
            "id": "m_access", "content": "Test memory",
            "embedding": [0.1] * 8, "scope": "global"
        })

        db.update_access_stats("m_access")
        db.update_access_stats("m_access")
        db.update_access_stats("m_access")

        m = db.get_memory_by_id("m_access")
        assert m["access_count"] == 3, f"Expected 3 accesses, got {m['access_count']}"
        assert m["last_accessed_at"] is not None

        print("  ✅ PASSED")


if __name__ == "__main__":
    print("=" * 60)
    print("MEERA MEMORY SYSTEM — COMPREHENSIVE TEST SUITE")
    print("=" * 60)
    print()

    test_cosine_similarity()
    test_memory_db_crud()
    test_memory_db_scoping()
    test_hybrid_retrieval()
    test_memory_router_deterministic()
    test_contradiction_detection()
    test_full_memory_lifecycle()
    test_memory_extraction_patterns()
    test_access_stats()

    print()
    print("=" * 60)
    print("ALL TESTS PASSED ✅")
    print("=" * 60)
