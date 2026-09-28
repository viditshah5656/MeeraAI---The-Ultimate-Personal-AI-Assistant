import json
import tempfile
import time
import unittest
from pathlib import Path

from config import EmotionConfig
from meera_runtime.expression import (
    EmotionContext,
    EmotionEngine,
    EmotionState,
    EmotionStateStore,
    ContextualPerformancePlanner,
    PersonalityProfile,
    Reaction,
    ResponseType,
    SpeechPerformancePlan,
    SpeechExpressionRenderer,
)
from meera_runtime.audio_context import AudioContext


def config(**changes):
    values = {
        "enabled": True, "intensity": .72, "spontaneity": .62,
        "laughter": True, "fillers": True, "pauses": True,
        "contextual_reactions": True, "emotional_continuity": True,
        "debug": False, "specialist_model": None,
        "specialist_timeout_ms": 850, "specialist_min_significance": .78,
    }
    values.update(changes)
    return EmotionConfig(**values)


class ExpressionTests(unittest.TestCase):
    def setUp(self):
        self.planner = ContextualPerformancePlanner(config(), PersonalityProfile())

    def plan(self, user, response="Okay.", state=None, **kwargs):
        context = EmotionContext(user, response, speaker="vivian", **kwargs)
        return self.planner.plan(context, state or EmotionState())

    def test_joke_is_amused_but_laughter_is_restrained(self):
        plan, state = self.plan("That bug was hiding in plain sight. Hilarious!")
        self.assertEqual(plan.response_type, ResponseType.JOKE)
        self.assertGreater(state.amusement, .20)
        self.assertLessEqual(plan.laughter_level, 1)

    def test_bad_news_suppresses_playfulness(self):
        plan, state = self.plan("I lost the project files.", "We can check recovery options.")
        self.assertEqual(plan.response_type, ResponseType.BAD_NEWS)
        self.assertEqual(plan.reaction, Reaction.CONCERN)
        self.assertGreater(state.concern, state.amusement)
        self.assertLess(plan.pace, .67)

    def test_confident_vocal_upset_cue_deescalates_delivery(self):
        audio = AudioContext(
            speech_present=True, user_volume=.08, user_wpm=185,
            vocal_state="possibly upset and highly activated", vocal_confidence=.78,
        )
        plan, _ = self.plan("This still does not work", audio_context=audio)
        self.assertEqual(plan.response_type, ResponseType.USER_FRUSTRATION)
        self.assertEqual(plan.reaction, Reaction.CALMING)
        self.assertLess(plan.vocal_intensity, .55)
        _, instruction = SpeechExpressionRenderer("One stable Meera voice.").render("I'll fix it.", plan)
        self.assertIn("do not mirror anger", instruction)
        self.assertIn("One stable Meera voice", instruction)

    def test_success_after_frustration_carries_relief(self):
        state = EmotionState(concern=.72, frustration=.50)
        first, state = self.plan("This stupid thing still isn't working.", state=state)
        second, _ = self.plan(
            "It finally works!", "Nice, you found it.", state=state,
            recent_turns=(("This stupid thing still isn't working.", "Let's isolate it."),),
        )
        self.assertEqual(first.response_type, ResponseType.USER_FRUSTRATION)
        self.assertEqual(second.reaction, Reaction.RELIEF)

    def test_neutral_factual_question_uses_zero_cost_fast_path(self):
        plan, _ = self.plan("What time does the store close?", "It closes at 8 PM.")
        self.assertEqual(plan.response_type, ResponseType.QUESTION)
        self.assertTrue(plan.bypassed)
        self.assertEqual(plan.reaction, Reaction.NONE)
        self.assertIsNone(plan.filler)

    def test_deliberative_turn_can_place_one_hesitation_inside_the_thought(self):
        state = EmotionState(turn=8, last_filler_turn=0)
        plan, _ = self.plan(
            "Analyze this architecture deeply.",
            "The first layer captures audio reliably, while the second layer resolves intent before any external action is selected.",
            state=state,
        )
        rendered, _ = SpeechExpressionRenderer("One stable voice.").render(
            "The first layer captures audio reliably, while the second layer resolves intent before any external action is selected.",
            plan,
        )
        self.assertEqual(plan.response_type, ResponseType.THINKING)
        self.assertEqual(rendered.lower().count("hmm"), 1)
        self.assertFalse(rendered.lower().startswith("hmm"))

    def test_tool_failure_is_truthful_and_calm(self):
        plan, _ = self.plan(
            "Open the file", "That failed because the file does not exist.",
            task_state="failed", tool_used=True, success=False,
        )
        self.assertEqual(plan.response_type, ResponseType.TASK_FAILURE)
        self.assertNotEqual(plan.reaction, Reaction.CELEBRATION)

    def test_renderer_never_changes_numbers_paths_or_urls(self):
        source = r"Use C:\MeeraAI\main.py, port 8179, and https://example.com/a."
        plan = SpeechPerformancePlan(filler="Hmm...")
        rendered, _ = SpeechExpressionRenderer("Natural voice.").render(source, plan)
        self.assertIn(r"C:\MeeraAI\main.py", rendered)
        self.assertIn("8179", rendered)
        self.assertIn("https://example.com/a", rendered)

    def test_tool_markup_is_never_rewritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            engine = EmotionEngine(config(), root / "state.db", root / "emotion.jsonl", "vivian", "Natural voice.")
            source = '<tool_call>{"path":"C:\\\\MeeraAI"}</tool_call>'
            output = engine.process("Open it", source, tool_used=True)
            self.assertEqual(output.text, source)
            self.assertTrue(output.plan.bypassed)

    def test_language_specific_fillers_do_not_inject_english(self):
        state = EmotionState(turn=8, last_filler_turn=0)
        plan, _ = self.plan("मुझे बहुत चिंता हो रही है।", "मैं समझ रही हूँ।", state=state)
        self.assertEqual(plan.language, "hi")
        if plan.filler:
            self.assertNotRegex(plan.filler, r"(?i)wait|okay|hmm|oh")

    def test_state_store_round_trip_contains_no_conversation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.db"
            store = EmotionStateStore(path)
            state = EmotionState(mood="concerned", concern=.74, turn=12)
            store.save(state)
            restored = store.load()
            self.assertEqual(restored.turn, 12)
            self.assertAlmostEqual(restored.concern, .74)
            with sqlite_connection(path) as db:
                payload = db.execute("SELECT payload FROM emotion_state").fetchone()[0]
            self.assertNotIn("user_text", payload)

    def test_invalid_values_are_clamped(self):
        plan = SpeechPerformancePlan(energy=8, warmth=-2, laughter_level=99)
        plan.validate()
        self.assertEqual(plan.energy, 1)
        self.assertEqual(plan.warmth, 0)
        self.assertEqual(plan.laughter_level, 4)

    def test_structured_output_rejects_unknown_fields_and_nan(self):
        with self.assertRaises(ValueError):
            SpeechPerformancePlan.from_mapping({"execute_tool": "delete"})
        with self.assertRaises(ValueError):
            SpeechPerformancePlan.from_mapping({"energy": float("nan")})

    def test_engine_is_fast_and_writes_private_telemetry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "emotion.jsonl"
            engine = EmotionEngine(config(), root / "state.db", log, "vivian", "Natural voice.")
            output = engine.process("It finally works!", "That's excellent. You fixed it.")
            self.assertLess(output.latency_ms, 100)
            record = json.loads(log.read_text(encoding="utf-8").splitlines()[-1])
            self.assertNotIn("user_text", record)
            self.assertNotIn("response_text", record)


class sqlite_connection:
    def __init__(self, path):
        import sqlite3
        self.connection = sqlite3.connect(path)

    def __enter__(self):
        return self.connection

    def __exit__(self, *_):
        self.connection.close()


if __name__ == "__main__":
    unittest.main()
