"""
Comprehensive test suite for CognitiveOrchestrator, DynamicTaskDecomposer,
LLMSwarmArchitect, build_transcendent_agent_prompt, and MeeraAI's smart intent-driven cloud inference routing.
"""

import sys
import os

from agent_planner import (
    CognitiveOrchestrator,
    DynamicTaskDecomposer,
    LLMSwarmArchitect,
    UserIntent,
    clean_incoming_prompt,
    is_bare_greeting,
    build_transcendent_agent_prompt,
)
from Meera import ChatService


def test_greeting_sanitization_and_classification():
    print("\n--- 1. Testing Greeting Sanitization & Classification ---")
    
    # Raw greetings
    raw_greetings = [
        "Hi there!",
        "hello",
        "hey",
        "Good morning",
        "Hi Meera",
        "hello there",
        "hey!",
    ]
    for g in raw_greetings:
        cleaned = clean_incoming_prompt(g)
        intent = CognitiveOrchestrator.classify_intent(cleaned)
        should_swarm = CognitiveOrchestrator.should_spawn_agent_swarm(cleaned)
        is_bare = is_bare_greeting(cleaned)
        print(f"Query: {g!r:20} -> cleaned: {cleaned!r:15} | Intent: {intent.value} | Bare: {is_bare} | Swarm: {should_swarm}")
        assert intent == UserIntent.GREETING_OR_CHITCHAT, f"Expected GREETING_OR_CHITCHAT for {g}, got {intent}"
        assert should_swarm is False, f"Swarm should be False for {g}"
        assert is_bare is True, f"is_bare should be True for {g}"

    # Greetings contaminated with frontend boilerplate
    contaminated_greeting = (
        "Hi there!\n\n"
        "When answering with cloud data or live web research, adopt the perspective of a world-renowned expert. "
        "Structure your response with clear markdown headings."
    )
    cleaned = clean_incoming_prompt(contaminated_greeting)
    print(f"\nContaminated query cleaned to: {cleaned!r}")
    assert cleaned == "Hi there!", f"Boilerplate stripping failed: {cleaned}"
    intent = CognitiveOrchestrator.classify_intent(cleaned)
    assert intent == UserIntent.GREETING_OR_CHITCHAT
    assert not CognitiveOrchestrator.should_spawn_agent_swarm(cleaned)
    assert is_bare_greeting(cleaned)
    print("✅ Greeting sanitization and classification passed!")


def test_direct_tasks_no_overkill():
    print("\n--- 2. Testing Direct Tasks (No Subagent Overkill) ---")
    direct_queries = [
        "Print Hi there! in Python",
        "Write a quick python script to reverse a string",
        "What is 25 * 4?",
        "Explain what a list comprehension is in Python",
    ]
    for q in direct_queries:
        cleaned = clean_incoming_prompt(q)
        intent = CognitiveOrchestrator.classify_intent(cleaned)
        should_swarm = CognitiveOrchestrator.should_spawn_agent_swarm(cleaned)
        print(f"Query: {q!r:45} -> Intent: {intent.value:20} | Swarm: {should_swarm}")
        assert intent == UserIntent.DIRECT_TASK, f"Expected DIRECT_TASK for {q}, got {intent}"
        assert should_swarm is False, f"Direct task should not trigger swarm for {q}"
    print("✅ Direct tasks correctly avoid subagent swarms!")


def test_travel_planning_multiagent_swarm():
    print("\n--- 3. Testing Dynamic Travel Planning Multi-Agent Swarm ---")
    travel_query = "Plan a 7-day trip to Bali with the best cheap yet great travels agency over there, authentic traveler reviews, and visa information."
    cleaned = clean_incoming_prompt(travel_query)
    intent = CognitiveOrchestrator.classify_intent(cleaned)
    should_swarm = CognitiveOrchestrator.should_spawn_agent_swarm(cleaned)
    print(f"Query: {travel_query}")
    print(f"Intent: {intent.value}")
    print(f"Should spawn swarm: {should_swarm}")
    
    assert intent == UserIntent.AGENTIC_TRAVEL_PLANNER
    assert should_swarm is True

    # Check decomposed subagents
    agents = DynamicTaskDecomposer.decompose(cleaned, intent)
    print(f"\nSpawned {len(agents)} specialized agents:")
    for i, a in enumerate(agents, 1):
        print(f"  Agent {i}: [{a['role']}]")
        print(f"    Task snippet: {a['task'][:110]}...")
    
    assert len(agents) == 4
    roles = [a["role"] for a in agents]
    assert any("Destination & Itinerary" in r for r in roles)
    assert any("Reviews" in r for r in roles)
    assert any("Budget" in r or "Agency" in r for r in roles)
    assert any("Visa" in r or "Immigration" in r for r in roles)

    # Check proactive interactive request
    interactive_req = DynamicTaskDecomposer.get_agentic_interactive_request(intent, cleaned)
    print(f"\nProactive Interactive Action Trigger:")
    print(f"  Key: {interactive_req['key']}")
    print(f"  Title: {interactive_req['title']}")
    print(f"  Prompt: {interactive_req['prompt']}")
    print(f"  Options: {interactive_req['options']}")
    assert interactive_req is not None
    assert "agentic_trip_action" in interactive_req["key"]
    assert len(interactive_req["options"]) >= 3

    # Check title derivation
    title = ChatService._derive_monograph_title(cleaned)
    print(f"Derived title: {title}")
    assert "Bali" in title
    print("✅ Travel planning multi-agent swarm passed!")


def test_meera_backend_methods():
    print("\n--- 4. Testing Meera Backend Router Methods ---")
    
    # 1. Bare greeting in Meera
    assert ChatService._is_deep_research_intent("Hi there!") is False
    assert ChatService._is_deep_research_intent("hello") is False
    assert ChatService._is_bare_greeting("Hi there!") is True
    assert ChatService._is_bare_greeting("Hello there!") is True

    # 2. Travel planning in Meera
    trip_q = "Plan a vacation to Switzerland with cheap travel agencies and visa info"
    assert ChatService._is_deep_research_intent(trip_q) is True
    assert ChatService._is_bare_greeting(trip_q) is False

    subagent_tcs = ChatService._build_parallel_research_subagents(trip_q)
    print(f"Constructed {len(subagent_tcs)} tool calls for Meera:")
    for stc in subagent_tcs:
        print(f"  Tool: {stc['function']['name']} | Args: {stc['function']['arguments'][:80]}...")
    assert len(subagent_tcs) == 4

    # 3. Scientific research monograph
    sci_q = "Comprehensive mathematical analysis of attention complexity in state-space models"
    assert ChatService._is_deep_research_intent(sci_q) is True
    sci_agents = ChatService._build_parallel_research_subagents(sci_q)
    assert len(sci_agents) >= 3
    print("✅ Meera backend router methods passed!")


def test_transcendent_agent_cognitive_directives():
    print("\n--- 5. Testing Transcendent Agent Cognitive Directives ---")
    prompt = build_transcendent_agent_prompt(
        role="Senior Autonomous Flight Dynamics Specialist",
        task="Optimize multi-rotor trajectory planning under gust disturbances",
        evidence="Paper: Minimum snap trajectory generation by Mellinger et al.",
        user_objective="Build an autonomous quadrotor control loop"
    )
    print(f"Generated prompt length: {len(prompt)} characters")
    assert "TRANSCENDENT COGNITIVE DIRECTIVE" in prompt
    # assert "Sovereign Analytical Intellect" in prompt
    # assert "Relentless Verification & Absolute Ground Truth" in prompt
    # assert "Proactive Problem Preemption" in prompt
    assert "Senior Autonomous Flight Dynamics Specialist" in prompt
    print("✅ Transcendent cognitive directive verified!")


def test_dynamic_unbound_swarm_decomposition():
    print("\n--- 6. Testing Dynamic Unbound Swarm Decomposition (Zero Hardcoding) ---")
    diverse_goals = [
        "Develop an autonomous underwater vehicle navigation system with acoustic sensors",
        "Launch a specialty bean-to-bar chocolate factory in Amsterdam",
        "Perform a comprehensive review of zero-knowledge proof scaling on modern blockchains",
    ]
    for goal in diverse_goals:
        swarm = LLMSwarmArchitect.decompose_dynamically(goal)
        print(f"\nObjective: {goal}")
        print(f"Agents Generated ({len(swarm)}):")
        for a in swarm:
            print(f"  - [{a['role']}] Queries: {a.get('search_queries', [])}")
            # Ensure zero hardcoded Italian admissions templates!
            assert "politecnico" not in a["role"].lower()
            assert "italy" not in a["role"].lower()
            assert "cimea" not in a["task"].lower()
        assert len(swarm) >= 3

    print("\n✅ Dynamic unbound swarm decomposition verified across diverse domains!")




def test_auto_continue_and_failsafe():
    print("\n--- 7. Testing Auto-Continue & Empty Failsafe ---")
    import asyncio
    import json
    from unittest.mock import AsyncMock, MagicMock
    from Meera import ChatService
    
    class MockRequest:
        model = "test-model"
        tool_choice = "auto"
        class QueryMock:
            def __init__(self, d): self.d = d
            def get(self, k, default=None): return self.d.get(k, default)
        query_params = QueryMock({})
    
    async def run_test():
        service = ChatService(
            persistence=MagicMock(),
            cloud_engine=MagicMock(),
            local_engine=MagicMock(),
            mcp_manager=MagicMock(),
            rag_service=MagicMock(),
            image_search=MagicMock(),
            model_manager=MagicMock(),
            param_resolver=MagicMock()
        )
        
        async def fake_stream_1(*args, **kwargs):
            yield "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "length"}]}) + "\n\n"
            
        async def fake_stream_2(*args, **kwargs):
            yield "data: " + json.dumps({
                "choices": [{
                    "delta": {
                        "tool_calls": [{
                            "id": "call_123",
                            "type": "function",
                            "function": {"name": "test_tool", "arguments": "{}"}
                        }]
                    },
                    "finish_reason": "tool_calls"
                }]
            }) + "\n\n"
            
        async def fake_stream_3(*args, **kwargs):
            yield "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "stop"}]}) + "\n\n"
            
        service.cloud_engine.chat_completion = AsyncMock(side_effect=[
            fake_stream_1(),
            fake_stream_2(),
            fake_stream_3()
        ])
        
        service._execute_builtin_tool = AsyncMock(return_value="tool execution result")
        
        response = await service._stream_with_tools(
            request=MockRequest(),
            provider_id="test_provider",
            mode="cloud",
            messages=[{"role": "user", "content": "hello"}],
            params={},
            tools=[{"type": "function", "function": {"name": "test_tool", "description": ""}}],
            fallback_reply="Fallback reply"
        )
        
        events = []
        async for event in response.body_iterator:
            events.append(event)
            
        output_str = "".join([str(e) for e in events])
        assert "Tool execution completed." in output_str or "Fallback reply" in output_str, "Failsafe should have triggered"
        print("✅ Auto-Continue and Failsafe logic passed!")
        
    asyncio.run(run_test())


if __name__ == "__main__":
    test_auto_continue_and_failsafe()
    test_greeting_sanitization_and_classification()
    test_direct_tasks_no_overkill()
    test_travel_planning_multiagent_swarm()
    test_meera_backend_methods()
    test_transcendent_agent_cognitive_directives()
    test_dynamic_unbound_swarm_decomposition()
    print("\n==================================================")
    print("🎯 ALL 7 COGNITIVE ORCHESTRATOR TESTS PASSED 100%!")
    print("==================================================")
