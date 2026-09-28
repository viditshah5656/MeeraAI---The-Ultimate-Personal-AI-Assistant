from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from config import TTSConfig
from meera_runtime.cancellation import CancellationToken
from meera_runtime.sooktam_tts import detect_language_for_sooktam
from meera_runtime.voice import HybridTTSBackend, QwenCppTTSBackend


class TestHybridTTS(unittest.TestCase):
    def setUp(self):
        self.dummy_config = TTSConfig(
            executable=Path("dummy_executable"),
            server_executable=Path("dummy_server"),
            model=Path("dummy_model"),
            codec=Path("dummy_codec"),
            engine="sooktam",
            sooktam_nfe_step=18,
        )

    def test_language_detection(self):
        self.assertEqual(detect_language_for_sooktam("नमस्ते मीरा, क्या हाल है?"), "hindi")
        self.assertEqual(detect_language_for_sooktam("નમસ્તે મીરા, તમે કેમ છો?"), "gujarati")
        self.assertEqual(detect_language_for_sooktam("Hello Meera, how are you?"), "english")
        self.assertEqual(detect_language_for_sooktam("வணக்கம்"), "tamil")
        self.assertEqual(detect_language_for_sooktam("నమస్కారం"), "telugu")

    def test_hybrid_engine_initialization(self):
        hybrid = HybridTTSBackend(self.dummy_config)
        self.assertIsInstance(hybrid.qwen_backend, QwenCppTTSBackend)
        self.assertEqual(hybrid.config.engine, "sooktam")

    def test_speech_rate_delegation(self):
        hybrid = HybridTTSBackend(self.dummy_config)
        new_rate = hybrid.set_speech_rate(1.15)
        self.assertAlmostEqual(new_rate, 1.15)
        self.assertAlmostEqual(hybrid.speech_rate, 1.15)

    def test_fallback_to_qwen_when_sooktam_fails(self):
        hybrid = HybridTTSBackend(self.dummy_config)
        mock_sooktam = MagicMock()
        mock_sooktam.speak.side_effect = RuntimeError("GPU out of memory simulation")
        hybrid._sooktam_backend = mock_sooktam

        token = CancellationToken()
        with patch.object(hybrid.qwen_backend, "speak_streaming") as mock_qwen:
            from meera_runtime.tooling import ToolResult
            mock_qwen.return_value = ToolResult(True, "Fallback speech generated")
            result = hybrid.speak_streaming("Test text", Path("outputs/test.wav"), token)
            self.assertTrue(result.ok)
            mock_qwen.assert_called_once()

    def test_qwen_primary_when_configured(self):
        qwen_config = TTSConfig(
            executable=Path("dummy_executable"),
            server_executable=Path("dummy_server"),
            model=Path("dummy_model"),
            codec=Path("dummy_codec"),
            engine="qwen",
        )
        hybrid = HybridTTSBackend(qwen_config)
        token = CancellationToken()
        with patch.object(hybrid.qwen_backend, "speak_streaming") as mock_qwen:
            from meera_runtime.tooling import ToolResult
            mock_qwen.return_value = ToolResult(True, "Qwen primary speech")
            result = hybrid.speak_streaming("Hello", Path("outputs/test.wav"), token)
            self.assertTrue(result.ok)
            mock_qwen.assert_called_once()


if __name__ == "__main__":
    unittest.main()
