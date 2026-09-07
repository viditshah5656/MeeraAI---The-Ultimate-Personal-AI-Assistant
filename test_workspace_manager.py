import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from workspace_manager import WorkspaceManager
from workspace_security import WorkspaceAccessError


class WorkspaceManagerTests(unittest.TestCase):
    def test_open_persists_and_reads_bounded_project_files(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            root.mkdir()
            (root / "package.json").write_text(json.dumps({"name": "demo", "scripts": {"test": "pytest"}}), encoding="utf-8")
            (root / "README.md").write_text("one\ntwo\nthree\n", encoding="utf-8")
            manager = WorkspaceManager(Path(folder) / "workspaces.json")
            record = manager.open(str(root))
            assert manager.read_file(record.id, "README.md", 2, 2)["content"] == "two"
            assert manager.inspect(record.id)["project"]["package_name"] == "demo"
            restored = WorkspaceManager(Path(folder) / "workspaces.json")
            assert restored.get(record.id).root_path == str(root.resolve())

    def test_sensitive_and_escape_paths_are_rejected(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            root.mkdir()
            (root / ".env").write_text("TOKEN=secret", encoding="utf-8")
            manager = WorkspaceManager(Path(folder) / "workspaces.json")
            record = manager.open(str(root))
            with self.assertRaises(WorkspaceAccessError):
                manager.read_file(record.id, ".env")
            with self.assertRaises(WorkspaceAccessError):
                manager.list_files(record.id, "../")
            self.assertTrue(any(item["outcome"] == "denied" for item in manager.audit_events(record.id)))

    def test_write_patch_snapshot_restore_and_ledger(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            root.mkdir()
            target = root / "app.py"
            target.write_text("value = 1\n", encoding="utf-8")
            manager = WorkspaceManager(Path(folder) / "workspaces.json")
            record = manager.open(str(root))
            snapshot = manager.snapshot(record.id, ["app.py"], "task-1")
            manager.patch_file(record.id, "app.py", "value = 1", "value = 2", "task-1")
            manager.write_file(record.id, "new.txt", "created", "task-1")
            assert target.read_text(encoding="utf-8") == "value = 2\n"
            assert len(manager.changes(record.id)) == 2
            diff = manager.diff_snapshot(record.id, snapshot["id"])
            assert diff["changed_files"] == 1
            assert "+value = 2" in diff["files"][0]["diff"]
            manager.restore_snapshot(record.id, snapshot["id"])
            assert target.read_text(encoding="utf-8") == "value = 1\n"

    def test_workspace_lock_prevents_concurrent_owners(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            root.mkdir()
            manager = WorkspaceManager(Path(folder) / "workspaces.json")
            record = manager.open(str(root))
            manager.acquire(record.id, "task-a")
            with self.assertRaises(WorkspaceAccessError):
                manager.acquire(record.id, "task-b")
            manager.release(record.id, "task-a")
            manager.acquire(record.id, "task-b")


if __name__ == "__main__":
    unittest.main()