"""
Meera Memory Integration Verification Test
Tests that Meera.py and meera_memory.py are wired together properly.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meera_memory import init_meera_memory, get_meera_memory
from Meera import ChatService

def test_builtin_tool_registration():
    print("Testing Meera.py builtin tool registration...")
    expected_tools = {"meera_remember", "meera_forget", "meera_list_memories"}
    missing = expected_tools - ChatService._BUILTIN_TOOL_NAMES
    assert not missing, f"Missing memory tools in ChatService._BUILTIN_TOOL_NAMES: {missing}"
    print("  ✅ All memory tools are registered in ChatService._BUILTIN_TOOL_NAMES")

def test_memory_singleton_wiring():
    print("Testing Meera Memory singleton wiring...")
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "test_wiring_mem.db")

    async def mock_extract(p): return "[]"
    async def mock_route(p): return "NO"
    async def mock_embed(t): return [0.1] * 16

    mem = init_meera_memory(db_path, mock_extract, mock_route, mock_embed)
    assert get_meera_memory() is mem, "Singleton get_meera_memory() must return the initialized instance"
    print("  ✅ init_meera_memory and get_meera_memory work seamlessly")

    # Clean up test db if created
    if os.path.exists(db_path):
        os.remove(db_path)

if __name__ == "__main__":
    print("=" * 60)
    print("MEERA MEMORY INTEGRATION VERIFICATION")
    print("=" * 60)
    test_builtin_tool_registration()
    test_memory_singleton_wiring()
    print("=" * 60)
    print("ALL INTEGRATION CHECKS PASSED ✅")
    print("=" * 60)
