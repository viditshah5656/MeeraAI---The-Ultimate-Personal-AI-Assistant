import tempfile
import unittest
from pathlib import Path

import numpy as np

from config import SpeakerConfig
from meera_runtime.speaker import VoiceAccessController, VoiceprintError, VoiceprintProtector, VoiceprintStore


class PlainProtector:
    def protect(self, data: bytes) -> bytes:
        return b"protected:" + data

    def unprotect(self, data: bytes) -> bytes:
        return data.removeprefix(b"protected:")


class FakeEmbeddings:
    def start(self):
        pass

    def close(self):
        pass

    def embed(self, audio):
        marker = round(float(np.mean(audio)), 2)
        vector = {
            .10: np.array([1.0, 0.0, 0.0], dtype=np.float32),
            -.10: np.array([0.0, 1.0, 0.0], dtype=np.float32),
        }.get(marker, np.array([0.0, 0.0, 1.0], dtype=np.float32))
        return vector


class SpeakerTests(unittest.TestCase):
    def controller(self, directory):
        config = SpeakerConfig(enrollment_samples=3, min_sample_seconds=1.0, enforce_identity=True)
        path = Path(directory) / "voice.db"
        store = VoiceprintStore(path, PlainProtector())
        return VoiceAccessController(config, path, Path(directory), FakeEmbeddings(), store)

    def soft_controller(self, directory):
        config = SpeakerConfig(enrollment_samples=3, min_sample_seconds=1.0, enforce_identity=False)
        path = Path(directory) / "voice.db"
        store = VoiceprintStore(path, PlainProtector())
        return VoiceAccessController(config, path, Path(directory), FakeEmbeddings(), store)

    @staticmethod
    def audio(level):
        return np.full(32000, level, dtype=np.float32)

    def test_owner_enrollment_locks_and_rejects_unknown_speaker(self):
        with tempfile.TemporaryDirectory() as directory:
            access = self.controller(directory)
            self.assertFalse(access.locked)
            access.enroll("owner", "owner", [self.audio(.10)] * 3)
            self.assertTrue(access.locked)
            self.assertEqual(access.authenticate(self.audio(.10)).role, "owner")
            self.assertFalse(access.authenticate(self.audio(.03)).accepted)

    def test_soft_voice_lock_continues_for_normal_chat(self):
        with tempfile.TemporaryDirectory() as directory:
            access = self.soft_controller(directory)
            access.enroll("owner", "owner", [self.audio(.10)] * 3)
            match = access.authenticate(self.audio(.03))
            self.assertTrue(match.accepted)
            self.assertEqual(match.role, "unverified")
            self.assertEqual(match.reason, "voice_mismatch_soft")
            self.assertFalse(access.authenticate(self.audio(.03), strict=True).accepted)

    def test_second_voice_requires_owner_to_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            access = self.controller(directory)
            with self.assertRaises(VoiceprintError):
                access.enroll("trusted-2", "secondary", [self.audio(-.10)] * 3)
            access.enroll("owner", "owner", [self.audio(.10)] * 3)
            access.enroll("trusted-2", "secondary", [self.audio(-.10)] * 3)
            self.assertEqual(access.authenticate(self.audio(-.10)).role, "secondary")

    def test_windows_voiceprint_encryption_round_trip(self):
        payload = b"not raw audio; an embedding template"
        encrypted = VoiceprintProtector().protect(payload)
        self.assertNotEqual(encrypted, payload)
        self.assertEqual(VoiceprintProtector().unprotect(encrypted), payload)


if __name__ == "__main__":
    unittest.main()
