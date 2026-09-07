import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from knowledge_store import KnowledgeFact, KnowledgeSource, KnowledgeStore


class KnowledgeStoreTests(unittest.TestCase):
    def test_versions_provenance_and_scoped_search(self):
        with TemporaryDirectory() as folder:
            store = KnowledgeStore(Path(folder) / "knowledge.json")
            first = store.publish("ielts-teacher", [KnowledgeFact("fact-1", "Official speaking band descriptors", ("IELTS", "speaking"))], [KnowledgeSource("https://ielts.org", "IELTS")])
            second = store.publish("ielts-teacher", [KnowledgeFact("fact-2", "Updated examiner criteria", ("IELTS", "criteria"))], [KnowledgeSource("https://ielts.org/criteria", "Criteria")])
            self.assertEqual(first.version, 1)
            self.assertEqual(second.version, 2)
            self.assertEqual(store.latest("ielts-teacher").version, 2)
            self.assertEqual(store.search("ielts-teacher", "examiner criteria")[0].id, "fact-2")
            self.assertEqual(store.latest("coding-agent"), None)


if __name__ == "__main__":
    unittest.main()
