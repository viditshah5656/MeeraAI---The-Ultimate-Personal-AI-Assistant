"""Regression checks for spoken lookup routing and name cleanup."""

import ast
import asyncio
from pathlib import Path
import re
import unittest

from Meera import ChatService


class VoiceGroundingTests(unittest.TestCase):
    def test_public_person_uses_web_in_chat_and_voice(self):
        question = "Can you tell me something about Arjit Singh?"
        self.assertEqual(ChatService._request_retrieval_route(question, False), "web")
        self.assertEqual(ChatService._request_retrieval_route(question, True), "web")

    def test_local_questions_do_not_leak_to_web(self):
        self.assertIsNone(ChatService._request_retrieval_route("Explain gradient descent", True))
        self.assertEqual(ChatService._request_retrieval_route("Tell me about my project", True), "terminal")

    def test_voice_person_query_skips_query_model_pass(self):
        service = ChatService.__new__(ChatService)
        queries, reason = asyncio.run(service._ai_generate_search_queries(
            "Can you tell me something about Arjit Singh?",
            [], "__native__", "local", "meera-mini", max_queries=1, fast=True,
        ))
        self.assertEqual(queries, ["Arijit Singh overview"])
        self.assertEqual(reason, "deterministic named-person lookup")

    def test_asr_repairs_specific_name_without_rewriting_other_words(self):
        source = ast.parse(Path("MeeraAI Voice/meera_runtime/asr_bridge.py").read_text(encoding="utf-8"))
        node = next(item for item in source.body if isinstance(item, ast.FunctionDef) and item.name == "clean_transcript")
        scope = {"re": re}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "<asr-cleanup>", "exec"), scope)
        self.assertEqual(
            scope["clean_transcript"]("Can you tell me something about Arjit Singh?"),
            "Can you tell me something about Arijit Singh?",
        )
        self.assertEqual(scope["clean_transcript"]("Tell me about this song."), "Tell me about this song.")


if __name__ == "__main__":
    unittest.main()
