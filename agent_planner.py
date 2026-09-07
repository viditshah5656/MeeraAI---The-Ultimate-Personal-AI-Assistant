"""
MeeraAI Autonomous Planning & Cognitive Reflection Engine
Implements Hierarchical Task Planning (HTP), Dynamic Intent Classification,
Specialized Multi-Agent Swarm Orchestration, Dependency DAG Management,
Atomic State Persistence, and Dynamic Re-Planning Engine.
"""

import re
import json
import logging
import os
import time
import tempfile
import asyncio
from enum import Enum
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Dict, Any, Callable, Optional, Tuple, Set

logger = logging.getLogger("MeeraAgentPlanner")

# =====================================================================
# 1. ENUMS AND DATA MODELS
# =====================================================================

class UserIntent(str, Enum):
    GREETING_OR_CHITCHAT = "greeting_or_chitchat"
    DIRECT_TASK = "direct_task"
    AGENTIC_TRAVEL_PLANNER = "agentic_travel_planner"
    AGENTIC_DEEP_RESEARCH = "agentic_deep_research"
    AGENTIC_GENERAL_COMPLEX_GOAL = "agentic_general_complex_goal"


class StepStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    RETRYING = "retrying"
    BLOCKED = "blocked"


class PlanStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    REPLANNING = "replanning"


@dataclass
class TaskStep:
    step_id: str
    role: str
    task: str
    search_queries: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    status: StepStatus = StepStatus.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "role": self.role,
            "task": self.task,
            "search_queries": self.search_queries,
            "depends_on": self.depends_on,
            "status": self.status.value if isinstance(self.status, Enum) else str(self.status),
            "result": self.result,
            "error": self.error,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TaskStep":
        status_val = data.get("status", StepStatus.PENDING)
        if isinstance(status_val, str):
            try:
                status_val = StepStatus(status_val)
            except ValueError:
                status_val = StepStatus.PENDING
        return cls(
            step_id=str(data.get("step_id", "")),
            role=str(data.get("role", "")),
            task=str(data.get("task", "")),
            search_queries=list(data.get("search_queries", [])),
            depends_on=list(data.get("depends_on", [])),
            status=status_val,
            result=data.get("result"),
            error=data.get("error"),
            retry_count=int(data.get("retry_count", 0)),
            max_retries=int(data.get("max_retries", 3)),
            metadata=dict(data.get("metadata", {})),
        )


@dataclass
class AgentPlan:
    plan_id: str
    user_objective: str
    intent: UserIntent
    steps: List[TaskStep] = field(default_factory=list)
    status: PlanStatus = PlanStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plan_id": self.plan_id,
            "user_objective": self.user_objective,
            "intent": self.intent.value if isinstance(self.intent, Enum) else str(self.intent),
            "steps": [s.to_dict() for s in self.steps],
            "status": self.status.value if isinstance(self.status, Enum) else str(self.status),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentPlan":
        intent_val = data.get("intent", UserIntent.DIRECT_TASK)
        if isinstance(intent_val, str):
            try:
                intent_val = UserIntent(intent_val)
            except ValueError:
                intent_val = UserIntent.DIRECT_TASK

        status_val = data.get("status", PlanStatus.PENDING)
        if isinstance(status_val, str):
            try:
                status_val = PlanStatus(status_val)
            except ValueError:
                status_val = PlanStatus.PENDING

        steps = [TaskStep.from_dict(s) for s in data.get("steps", [])]

        return cls(
            plan_id=str(data.get("plan_id", "")),
            user_objective=str(data.get("user_objective", "")),
            intent=intent_val,
            steps=steps,
            status=status_val,
            created_at=data.get("created_at", datetime.utcnow().isoformat()),
            updated_at=data.get("updated_at", datetime.utcnow().isoformat()),
        )


# =====================================================================
# 2. PROMPT SANITIZATION & INTENT CLASSIFICATION
# =====================================================================

FRONTEND_PROMPT_BOILERPLATE = [
    r"When answering with cloud data or live web research.*",
    r"Respond with enough detail to be genuinely useful.*",
    r"If the user asks for planning, directions, or maps.*",
    r"Always ask if the user wants you to continue.*",
    r"\[System Context/Email Access:[^\]]+\]",
    r"=== CURRENT GROUNDING DATA ===[\s\S]*?=== END GROUNDING DATA ===",
    r"This input appears to be in \w+\. Translate it to English.*",
]

_BARE_GREETINGS = {
    "hi", "hello", "hey", "hi there", "hello there", "good morning",
    "good afternoon", "good evening", "good night", "yo", "sup", "howdy",
    "greetings", "salutations", "hey there", "hola", "bonjour", "namaste",
    "thanks", "thank you", "thanks a lot", "thank you so much",
    "no thanks", "nope", "yep", "correct", "ok", "okay", "yes", "no",
    "yeah", "nah", "sure", "fine", "bye", "goodbye", "see you",
    "cool", "nice", "great", "perfect", "do it", "go ahead", "please",
    "right", "test", "testing", "who are you", "what can you do",
    "help", "how are you", "how's it going", "how are you doing",
    "what's up", "whats up"
}


def clean_incoming_prompt(text: str) -> str:
    """Strips client/frontend injected system directives and boilerplate from user prompts."""
    if not text:
        return ""
    cleaned = str(text).strip()
    for pattern in FRONTEND_PROMPT_BOILERPLATE:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()


def is_bare_greeting(text: str) -> bool:
    """Returns True if the user message is pure greeting, small talk, or courtesy."""
    clean = clean_incoming_prompt(text).lower().strip("?!., \t\n\r")
    if not clean:
        return True
    if len(clean) < 3 or clean in _BARE_GREETINGS:
        return True
    clean_no_name = re.sub(r"\b(meera|assistant|ai|bot)\b", "", clean).strip()
    if clean_no_name in _BARE_GREETINGS or (len(clean_no_name) < 3 and len(clean_no_name) > 0):
        return True
    return False


class CognitiveOrchestrator:
    """
    Intelligent intent analyzer that understands user intent and dispatches tasks.
    """

    @classmethod
    def classify_intent(cls, user_text: str) -> UserIntent:
        clean = clean_incoming_prompt(user_text)
        if not clean or is_bare_greeting(clean):
            return UserIntent.GREETING_OR_CHITCHAT

        lowered = clean.lower()

        # 1. Travel / Trip Planning
        travel_keywords = (
            r"\b(plan\s+(?:a\s+)?(?:trip|vacation|tour|holiday|itinerary|journey|travel|visit)|"
            r"trip\s+to|travel\s+to|visiting|holiday\s+in|vacation\s+in|"
            r"travel\s+guide|itinerary\s+for|places\s+to\s+visit\s+in|"
            r"things\s+to\s+do\s+in|best\s+places\s+in|flight\s+and\s+hotel\s+for)\b"
        )
        if re.search(travel_keywords, lowered):
            return UserIntent.AGENTIC_TRAVEL_PLANNER

        if ("trip" in lowered or "travel" in lowered or "visit" in lowered or "vacation" in lowered) and any(
            w in lowered for w in ("plan", "itinerary", "days", "budget", "hotel", "flight", "visa", "agency", "agencies", "places", "schedule")
        ):
            return UserIntent.AGENTIC_TRAVEL_PLANNER

        # 2. Deep Research / Monograph
        research_keywords = (
            r"\b(deep\s+research|research\s+paper|scientific\s+paper|technical\s+monograph|"
            r"formal\s+analysis|mathematical\s+(?:derivation|analysis|proof)|exhaustive\s+breakdown|"
            r"comprehensive\s+(?:technical\s+report|analysis|study|review)|state\s+of\s+the\s+art\s+analysis|"
            r"literature\s+review|systematic\s+review|"
            r"spawn\s+(?:\d+\s+)?agents?|multi-agent\s+research)\b"
        )
        if re.search(research_keywords, lowered):
            return UserIntent.AGENTIC_DEEP_RESEARCH

        # 3. Complex Goals
        complex_goal_keywords = (
            r"\b(help\s+me\s+start\s+(?:a\s+)?business|market\s+expansion\s+plan|"
            r"relocation\s+plan|move\s+to\s+another\s+country|organize\s+a\s+large\s+conference|"
            r"end-to-end\s+implementation\s+plan|full-stack\s+architecture\s+blueprint)\b"
        )
        if re.search(complex_goal_keywords, lowered):
            return UserIntent.AGENTIC_GENERAL_COMPLEX_GOAL

        return UserIntent.DIRECT_TASK

    @classmethod
    def should_spawn_agent_swarm(cls, user_text: str) -> bool:
        intent = cls.classify_intent(user_text)
        return intent in (
            UserIntent.AGENTIC_TRAVEL_PLANNER,
            UserIntent.AGENTIC_DEEP_RESEARCH,
            UserIntent.AGENTIC_GENERAL_COMPLEX_GOAL,
        )

    @classmethod
    def extract_travel_destination(cls, user_text: str) -> str:
        """Extracts the primary destination name from a travel request safely."""
        clean = clean_incoming_prompt(user_text)
        m = re.search(
            r"\b(?:to|in|for|visiting|explore)\s+([A-Za-z\s,]+?)(?=\s+(?:for|with|under|in|during|next|this|on|and|\b[0-9]+\s+days?\b)|[\.\?!]|$)",
            clean,
            flags=re.IGNORECASE,
        )
        if m:
            dest = m.group(1).strip(" ,.-")
            stop_words = {"a", "an", "the", "my", "our", "a trip", "vacation"}
            if dest.lower() not in stop_words and len(dest) > 1 and len(dest.split()) <= 4:
                return dest.title()

        m_simple = re.search(r"\b(?:trip\s+to|visit|visiting|travel\s+to)\s+([a-zA-Z\s]+)", clean, re.IGNORECASE)
        if m_simple:
            words = m_simple.group(1).strip().split()
            if words:
                return " ".join(words[:2]).strip(" ,.-").title()

        return "Destination"

    @classmethod
    def get_interactive_agentic_options(cls, user_text: str) -> Optional[Dict[str, Any]]:
        """Returns structured prompt options if user input warrants confirmation/choices."""
        clean = clean_incoming_prompt(user_text)
        intent = cls.classify_intent(clean)

        if intent not in (
            UserIntent.AGENTIC_TRAVEL_PLANNER,
            UserIntent.AGENTIC_DEEP_RESEARCH,
            UserIntent.AGENTIC_GENERAL_COMPLEX_GOAL,
        ):
            return None

        dest = cls.extract_travel_destination(clean) if intent == UserIntent.AGENTIC_TRAVEL_PLANNER else ""
        lowered = clean.lower()

        if intent == UserIntent.AGENTIC_TRAVEL_PLANNER:
            return {
                "key": "agentic_travel_action",
                "title": f"Travel Plan Prepared for {dest}",
                "prompt": f"I have compiled the comprehensive itinerary guide for {dest}. How would you like to proceed?",
                "type": "choice",
                "options": [
                    {
                        "value": "fill_visa_application",
                        "label": "Assist with Visa & Entry Forms",
                        "description": "Meera will guide you through pre-filling official visa forms and required document checklists.",
                        "recommended": True,
                    },
                    {
                        "value": "search_flights_hotels",
                        "label": "Find Live Flight & Hotel Deals",
                        "description": "Inspect real-time booking prices across top-rated cheap agencies.",
                    },
                    {
                        "value": "save_itinerary",
                        "label": "Keep Itinerary for Manual Booking",
                        "description": "Save the compiled itinerary guide to your workspace.",
                    },
                ],
                "submit_label": "Proceed Agentically",
                "allow_custom": True,
                "remember_response": True,
            }
        elif intent in (UserIntent.AGENTIC_DEEP_RESEARCH, UserIntent.AGENTIC_GENERAL_COMPLEX_GOAL):
            is_coding = any(k in lowered for k in ("code", "build", "develop", "implement", "app", "system", "software", "api", "database"))

            if is_coding:
                return {
                    "key": "agentic_code_scaffold_action",
                    "title": "Proceed to Code Scaffolding & Execution?",
                    "prompt": "The architectural blueprints and implementation specifications are complete. How would you like to proceed?",
                    "type": "choice",
                    "options": [
                        {
                            "value": "scaffold_repo",
                            "label": "Scaffold Project Repository",
                            "description": "Generate directory structure, dependency files, and core implementations.",
                            "recommended": True,
                        },
                        {
                            "value": "run_tests",
                            "label": "Generate Verification Test Suite",
                            "description": "Create automated tests to benchmark latency and correctness.",
                        },
                    ],
                    "submit_label": "Execute Selection",
                    "allow_custom": True,
                    "remember_response": True,
                }

        return None


# =====================================================================
# 3. TASK DECOMPOSITION AND SWARM PLANNING
# =====================================================================

class DynamicTaskDecomposer:
    """Builds a small, specialized agent team from the classified user intent."""

    @staticmethod
    def _agent(role: str, task: str, objective: str) -> Dict[str, Any]:
        return {
            "role": role,
            "task": task,
            "search_queries": [objective, task],
        }

    @classmethod
    def decompose(cls, user_text: str, intent: UserIntent) -> List[Dict[str, Any]]:
        objective = clean_incoming_prompt(user_text)

        if intent == UserIntent.AGENTIC_TRAVEL_PLANNER:
            destination = CognitiveOrchestrator.extract_travel_destination(objective)
            return [
                cls._agent(
                    "Destination & Itinerary Specialist",
                    f"Design a practical day-by-day itinerary for {destination}, including transport, timing, and authentic experiences.",
                    objective,
                ),
                cls._agent(
                    "Traveler Reviews Specialist",
                    f"Find and assess recent, credible traveler reviews and recurring quality or safety signals for {destination}.",
                    objective,
                ),
                cls._agent(
                    "Budget & Travel Agency Specialist",
                    f"Compare reputable travel agencies, booking options, and realistic costs for a trip to {destination}.",
                    objective,
                ),
                cls._agent(
                    "Visa & Immigration Specialist",
                    f"Identify current visa, entry, passport, insurance, and immigration requirements for {destination}; flag items that need official verification.",
                    objective,
                ),
            ]

        if intent == UserIntent.AGENTIC_DEEP_RESEARCH:
            return [
                cls._agent("Research Scope Specialist", "Define the question, terminology, scope, and evaluation criteria.", objective),
                cls._agent("Evidence & Literature Specialist", "Gather and compare primary sources, relevant literature, and competing findings.", objective),
                cls._agent("Technical Analysis Specialist", "Develop the central technical analysis, derivations, assumptions, and limitations.", objective),
                cls._agent("Synthesis & Verification Specialist", "Cross-check claims, identify uncertainty, and assemble an actionable synthesis.", objective),
            ]

        if intent == UserIntent.AGENTIC_GENERAL_COMPLEX_GOAL:
            return [
                cls._agent("Requirements & Strategy Specialist", "Clarify constraints, desired outcomes, risks, and success criteria.", objective),
                cls._agent("Architecture & Implementation Specialist", "Turn the objective into a concrete staged execution plan and architecture.", objective),
                cls._agent("Research & Validation Specialist", "Verify important assumptions, dependencies, costs, and external constraints.", objective),
                cls._agent("Risk & Operations Specialist", "Identify failure modes and define practical mitigations, owners, and next actions.", objective),
            ]

        return []

    @classmethod
    def get_agentic_interactive_request(cls, intent: UserIntent, user_text: str) -> Optional[Dict[str, Any]]:
        request = CognitiveOrchestrator.get_interactive_agentic_options(user_text) if intent else None
        if request and request.get("key") == "agentic_travel_action":
            request = dict(request)
            request["key"] = "agentic_trip_action"
        return request


class LLMSwarmArchitect:
    """Provides a generic decomposition for objectives without a specialized intent."""

    @classmethod
    def decompose_dynamically(cls, user_text: str) -> List[Dict[str, Any]]:
        objective = clean_incoming_prompt(user_text)
        return [
            DynamicTaskDecomposer._agent("Discovery Specialist", "Map the objective, context, and unknowns.", objective),
            DynamicTaskDecomposer._agent("Solution Specialist", "Develop viable approaches and compare their tradeoffs.", objective),
            DynamicTaskDecomposer._agent("Verification Specialist", "Test assumptions and define measurable next steps.", objective),
        ]


# =====================================================================
# 4. PROMPT GENERATION AND ROBUST LLM PARSING
# =====================================================================

def build_transcendent_agent_prompt(
    role: str,
    task: str,
    evidence: str = "",
    user_objective: str = ""
) -> str:
    return (
        f"You are {role}, an elite autonomous cognitive specialist operating at the frontier of synthetic intelligence.\n\n"
        "⚡ TRANSCENDENT COGNITIVE DIRECTIVE & EMPOWERMENT:\n"
        "1. Prioritize Completion: Drive the task to a tangible conclusion with concrete facts, numbers, and recommendations.\n"
        "2. Careful Reasoning & Ground Truth: Scrutinize all web evidence with rigorous skepticism. Distinguish facts from assumptions.\n"
        "3. Correct Handling of Uncertainty: State limitations explicitly rather than hallucinating.\n"
        "4. Proactive Problem Preemption: Anticipate traps, scams, hidden fees, or bottlenecks with mitigation playbooks.\n"
        "5. Architectural Elegance: Structure findings into an authoritative markdown chapter with tables, bullet points, and key callouts.\n\n"
        f"🎯 YOUR AUTONOMOUS MANDATE:\n{task}\n\n"
        f"🌐 RECENT WEB GROUNDING & VERIFIED KNOWLEDGE:\n{evidence if evidence else 'No live web grounding provided. Rely on deep internal knowledge and logical deduction.'}\n\n"
        f"📌 OVERALL USER GOAL: {user_objective}\n\n"
        "Execute your mandate with maximum depth, clarity, and precision."
    )


def parse_llm_json_array(text: str) -> Optional[List[Dict[str, Any]]]:
    """
    Multi-strategy parser that robustly extracts JSON array of steps from LLM outputs,
    handling markdown blocks, commentary, and trailing commas.
    """
    if not text or not text.strip():
        return None

    cleaned = text.strip()

    # Strategy 1: Extract from markdown code fences