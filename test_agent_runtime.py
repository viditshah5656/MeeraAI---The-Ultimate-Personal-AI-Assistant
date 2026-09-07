import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from agent_runtime import AgentState, AgentTaskManager, CommandRisk, classify_command
from workspace_manager import WorkspaceManager


class AgentRuntimeTests(unittest.TestCase):
    def test_command_risk_and_approval_gate(self):
        self.assertEqual(classify_command("pytest"), CommandRisk.LOW)
        self.assertEqual(classify_command("npm install"), CommandRisk.MEDIUM)
        self.assertEqual(classify_command("rm -rf build"), CommandRisk.HIGH)

    def test_task_runs_and_emits_lifecycle_events(self):
        async def scenario():
            with TemporaryDirectory() as folder:
                root = Path(folder) / "project"
                root.mkdir()
                workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
                workspace = workspaces.open(str(root))
                manager = AgentTaskManager(Path(folder) / "tasks.json", workspaces)
                task = manager.create(workspace.id, "run tests", "pytest")
                self.assertEqual(task.state, AgentState.ANALYZING)
                await manager.run(task.id, lambda args: asyncio.sleep(0, result={"exit_code": 0}))
                self.assertEqual(manager.get(task.id).state, AgentState.COMPLETED)
                self.assertIn("agent.completed", [event["event"] for event in manager.event_snapshot(task.id)])
        asyncio.run(scenario())

    def test_medium_command_waits_for_approval(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "project"
            root.mkdir()
            workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
            workspace = workspaces.open(str(root))
            manager = AgentTaskManager(Path(folder) / "tasks.json", workspaces)
            task = manager.create(workspace.id, "install dependencies", "npm install")
            self.assertEqual(task.state, AgentState.WAITING_FOR_APPROVAL)
            self.assertTrue(task.approval_required)

    def test_structured_edit_plan_waits_for_acceptance_and_can_reject(self):
        async def scenario():
            with TemporaryDirectory() as folder:
                root = Path(folder) / "project"
                root.mkdir()
                target = root / "app.py"
                target.write_text("value = 1\n", encoding="utf-8")
                workspaces = WorkspaceManager(Path(folder) / "workspaces.json")
                workspace = workspaces.open(str(root))
                manager = AgentTaskManager(Path(folder) / "tasks.json", workspaces)
                task = manager.create(workspace.id, "update value", plan=[{"kind": "inspect", "description": "Inspect app"}, {"kind": "edit", "path": "app.py", "old_text": "value = 1", "new_text": "value = 2", "description": "Update value"}])
                await manager.run(task.id, lambda args: asyncio.sleep(0, result={"exit_code": 0}))
                self.assertEqual(manager.get(task.id).state, AgentState.WAITING_FOR_ACCEPTANCE)
                self.assertIn("+value = 2", manager.get(task.id).result["diff"]["files"][0]["diff"])
                manager.reject(task.id)
                self.assertEqual(manager.get(task.id).state, AgentState.REJECTED)
                self.assertEqual(target.read_text(encoding="utf-8"), "value = 1\n")
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()