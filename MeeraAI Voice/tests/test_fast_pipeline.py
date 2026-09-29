from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from config import ASR, WEB, WebConfig
from brain import clean_sentence, stream_sentences
from meera_runtime.supervisor import Supervisor
from meera_runtime.cancellation import CancellationToken
from meera_runtime.research import WebSearchTool
from meera_runtime.models import ToolResult
from main import _speak_stream_interruptibly


class FastPipelineTests(unittest.TestCase):
    def test_fast_config_defaults(self):
        self.assertLessEqual(ASR.silence_seconds, 0.60)
        self.assertLessEqual(ASR.barge_in_silence_seconds, 0.60)
        self.assertEqual(ASR.beam_size, 1)
        self.assertLessEqual(WEB.timeout_seconds, 4.0)

    def test_clean_sentence_filters_boilerplate_and_markdown(self):
        sentence = "**Sure!** I am here to help you today."
        self.assertEqual(clean_sentence(sentence), "")

        valid = "I *think* that sounds like a great idea."
        self.assertEqual(clean_sentence(valid), "I think that sounds like a great idea.")

    def test_stream_sentences_yields_at_boundaries(self):
        tokens = [
            "Hey ", "there! ", "This ", "is ", "the ", "first ", "sentence. ",
            "And ", "here ", "is ", "the ", "second ", "one."
        ]

        with patch("brain.stream_meera", return_value=iter(tokens)):
            sentences = list(stream_sentences("hello"))

        self.assertEqual(len(sentences), 3)
        self.assertEqual(sentences[0], "Hey there!")
        self.assertEqual(sentences[1], "This is the first sentence.")
        self.assertEqual(sentences[2], "And here is the second one.")

    def test_stream_sentences_emits_a_safe_clause_before_sentence_end(self):
        tokens = [
            "The important thing is that Meera can begin speaking naturally, ",
            "while the rest of the response is still being generated."
        ]
        with patch("brain.stream_meera", return_value=iter(tokens)):
            phrases = list(stream_sentences("explain the new pipeline"))
        self.assertEqual(phrases[0], "The important thing is that Meera can begin speaking naturally,")
        self.assertEqual(phrases[1], "while the rest of the response is still being generated.")

    def test_supervisor_stream_dialogue(self):
        supervisor = Supervisor()
        mock_sentences = ["First thought.", "Second thought."]
        with patch("brain.stream_sentences", return_value=iter(mock_sentences)):
            results = list(supervisor.stream_dialogue("tell me something"))

        self.assertEqual(len(results), 2)
        sent1, inst1 = results[0]
        sent2, inst2 = results[1]
        self.assertEqual(sent1, "First thought.")
        self.assertIsInstance(inst1, str)
        self.assertEqual(sent2, "Second thought.")
        self.assertIsInstance(inst2, str)

    def test_parallel_news_search_execution(self):
        web = WebSearchTool(WebConfig(timeout_seconds=3.0))
        token = CancellationToken()

        def fake_search_once(query, kind, tok):
            if kind == "news":
                return ToolResult(False, "News down")
            return ToolResult(True, "Found results", {"query": query, "results": [{"title": "News 1", "url": "https://example.com/1"}]})

        with patch.object(web, "_search_once", side_effect=fake_search_once):
            res = web.search({"query": "AI news", "kind": "news"}, token)

        self.assertTrue(res.ok)
        self.assertEqual(res.data.get("fallback_kind"), "text")

    def test_speak_stream_interruptibly_ignores_false_alarms(self):
        supervisor = MagicMock()
        listener = MagicMock()
        listener.config.sample_rate = 16000
        listener.calibrated_threshold = 0.01

        supervisor.speak_live.return_value = ToolResult(True, "Spoken")
        supervisor.sentence_instruction.return_value = "instruction"

        import numpy as np
        short_noise = np.zeros(100, dtype=np.float32)

        with patch("main.BargeInCapture") as mock_barge:
            detector = MagicMock()
            detector.capture_while.return_value = short_noise
            mock_barge.return_value = detector

            sentences = [("First sentence.", "inst1"), ("Second sentence.", "inst2")]
            last_res, interrupted, spoken = _speak_stream_interruptibly(
                supervisor, listener, iter(sentences)
            )

            self.assertIsNone(interrupted)
            self.assertEqual(len(spoken), 2)


if __name__ == "__main__":
    unittest.main()
