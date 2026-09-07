import asyncio
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from process_manager import ProcessManager
from workspace_security import WorkspaceAccessError
from workspace_manager import WorkspaceManager


class ProcessManagerTests(unittest.TestCase):
    def test_process_streams_output_and_exits(self):
        async def scenario():
            with TemporaryDirectory() as folder:
                root = Path(folder) / "project"
                root.mkdir()
                workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
                workspace = workspaces.open(str(root))
                manager = ProcessManager(Path(folder) / "processes.json", workspaces)
                command = f'{sys.executable} -u -c "print(\\\"hello-process\\\")"'
                process = await manager.start(workspace.id, command)
                await manager._tasks[process.id]
                current = manager.get(process.id)
                self.assertEqual(current.state, "exited")
                self.assertEqual(current.exit_code, 0)
                self.assertTrue(any(item["text"] == "hello-process" for item in current.output))
        asyncio.run(scenario())

    def test_stop_terminates_long_running_process(self):
        async def scenario():
            with TemporaryDirectory() as folder:
                root = Path(folder) / "project"
                root.mkdir()
                workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
                workspace = workspaces.open(str(root))
                manager = ProcessManager(Path(folder) / "processes.json", workspaces)
                command = f'{sys.executable} -u -c "import time; print(\\\"ready\\\", flush=True); time.sleep(30)"'
                process = await manager.start(workspace.id, command)
                await asyncio.sleep(0.1)
                await manager.stop(process.id)
                await manager._tasks[process.id]
                self.assertEqual(manager.get(process.id).state, "stopped")
        asyncio.run(scenario())

    def test_medium_risk_process_requires_confirmation(self):
        async def scenario():
            with TemporaryDirectory() as folder:
                root = Path(folder) / "project"
                root.mkdir()
                workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
                workspace = workspaces.open(str(root))
                manager = ProcessManager(Path(folder) / "processes.json", workspaces)
                with self.assertRaises(WorkspaceAccessError):
                    await manager.start(workspace.id, "npm install")
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
