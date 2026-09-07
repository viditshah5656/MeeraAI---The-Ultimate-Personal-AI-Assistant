from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from workspace_security import ApprovedWorkspace, WorkspaceAccessError


class WorkspaceSecurityTests(unittest.TestCase):
    def test_workspace_rejects_traversal_and_absolute_escape(self):
        with TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            root = tmp_path / "project"
            root.mkdir()
            (root / "src").mkdir()
            workspace = ApprovedWorkspace(root)

            self.assertEqual(workspace.resolve("src"), (root / "src").resolve())
            for candidate in ("../outside", tmp_path / "outside"):
                with self.assertRaises(WorkspaceAccessError):
                    workspace.resolve(candidate)


    def test_workspace_rejects_symlink_escape_and_excluded_paths(self):
        with TemporaryDirectory() as temp_dir:
            tmp_path = Path(temp_dir)
            root = tmp_path / "project"
            root.mkdir()
            outside = tmp_path / "outside"
            outside.mkdir()
            (root / "secret-link").symlink_to(outside, target_is_directory=True)
            (root / "node_modules").mkdir()
            workspace = ApprovedWorkspace(root, excluded=("node_modules",))

            self.assertFalse(workspace.is_allowed("secret-link"))
            self.assertFalse(workspace.is_allowed("node_modules"))
            self.assertTrue(workspace.is_allowed("new/file.txt", allow_missing=True))


if __name__ == "__main__":
    unittest.main()