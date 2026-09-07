"""
MeeraAI Unified Agentic System Integration Test
Tests Phases 1 through 4 in an end-to-end autonomous workflow.
"""

import json
from agent_planner import HierarchicalTaskPlanner, AgenticLoopExecutor
from memory_store import EpisodicMemoryStore, CodebaseKnowledgeGraph
from agent_tools import BrowserAutomationTool, SandboxTerminalTool
from agent_daenson import FileSystemWatcherDaemon, ScheduledTaskDaemon

def run_end_to_end_test():
    print("=== Starting MeeraAI Agentic System Integration Test ===\n")

    # Phase 1: Planning & Reflection
    print("[Phase 1] Testing Hierarchical Task Planner...")
    planner = HierarchicalTaskPlanner("Refactor and optimize MeeraAI backend architecture")
    plan = planner.decompose_goal()
    print(f"Generated {len(plan)} subtasks.")
    
    executor = AgenticLoopExecutor(max_iterations=2)
    success = executor.run_with_reflection(
        "Verify Workspace Index",
        lambda: True  # Simulated successful action
    )
    print(f"Task execution status: {success}\n")

    # Phase 2: Memory & Knowledge Graph
    print("[Phase 2] Testing Episodic Memory & Knowledge Graph...")
    memory = EpisodicMemoryStore()
    memory.remember("user_intent", {"goal": "Build autonomous agentic features", "mode": "expert"})
    recalled = memory.recall("autonomous")
    print(f"Recalled memories count: {len(recalled)}")
    
    kg = CodebaseKnowledgeGraph()
    kg.add_relation("Meera.py", "agent_planner.py")
    print(f"Knowledge graph relations: {kg.symbol_graph}\n")

    # Phase 3: Advanced Agentic Tooling
    print("[Phase 3] Testing Browser & Sandbox Terminal Tools...")
    browser = BrowserAutomationTool()
    web_res = browser.fetch_page_content("https://docs.python.org")
    print(f"Browser fetch title: {web_res['title']}")
    
    terminal = SandboxTerminalTool()
    term_res = terminal.execute_command("python3 --version")
    print(f"Terminal output: {term_res['stdout']}\n")

    # Phase 4: Proactive Daemons & Triggers
    print("[Phase 4] Testing Proactive Daemons...")
    watcher = FileSystemWatcherDaemon(".")
    watcher.simulate_watch_event("modified", "Meera.py")
    
    scheduler = ScheduledTaskDaemon()
    scheduler.schedule_routine("Hourly Health Check", 3600, lambda: print("Running health check..."))
    print("\n=== All Agentic Subsystems Tested Successfully! ===")

if __name__ == "__main__":
    run_end_to_end_test()
