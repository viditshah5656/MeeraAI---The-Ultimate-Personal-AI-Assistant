"""Controlled coding-task runtime built above Meera's existing terminal service."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from workspace_manager import WorkspaceManager
from workspace_security import WorkspaceAccessError


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentState(str, Enum):
    IDLE = "idle"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    INSPECTING = "inspecting"
    EDITING = "editing"
    RUNNING = "running"
    VERIFYING = "verifying"
    WAITING_FOR_APPROVAL = "waiting_for_approval"
    WAITING_FOR_ACCEPTANCE = "waiting_for_acceptance"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class CommandRisk(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class AgentEvent:
    id: str
    task_id: str
    event: str
    message: str
    state: AgentState
    timestamp: str = field(default_factory=_now)
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentStep:
    id: str
    kind: str
    description: str
    path: Optional[str] = None
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    command: Optional[str] = None
    state: str = "pending"
    result: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentTask:
    id: str
    workspace_id: str
    objective: str
    command: Optional[str] = None
    steps: list[AgentStep] = field(default_factory=list)
    verification_command: Optional[str] = None
    snapshot_id: Optional[str] = None
    state: AgentState = AgentState.IDLE
    risk: Optional[CommandRisk] = None
    approval_required: bool = False
    approval_granted: bool = False
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["state"] = self.state.value
        value["risk"] = self.risk.value if self.risk else None
        value["steps"] = [step.to_dict() for step in self.steps]
        return value


def classify_command(command: str) -> CommandRisk:
    lowered = command.lower().strip()
    if re.search(r"(^|\s)(sudo|rm|rmdir|del|format|mkfs|chmod|chown)(\s|$)", lowered) or "git reset --hard" in lowered:
        return CommandRisk.HIGH
    if re.search(r"\b(npm install|pip install|uv add|docker build|git checkout|git switch|git clean)\b", lowered):
        return CommandRisk.MEDIUM
    return CommandRisk.LOW


class AgentTaskManager:
    def __init__(self, storage_path: str | Path, workspaces: WorkspaceManager):
        self.storage_path = Path(storage_path)
        self.workspaces = workspaces
        self.tasks: dict[str, AgentTask] = {}
        self.events: dict[str, list[AgentEvent]] = {}
        self._running: dict[str, asyncio.Task] = {}
        self._cancel: dict[str, asyncio.Event] = {}
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists():
            return
        try:
            payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            for item in payload.get("tasks", ()):
                state = AgentState(str(item.get("state", AgentState.FAILED.value)))
                risk = item.get("risk")
                steps = [AgentStep(**step) for step in item.get("steps", [])]
                self.tasks[item["id"]] = AgentTask(**{**item, "steps": steps, "state": state, "risk": CommandRisk(risk) if risk else None})
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"version": 1, "tasks": [task.to_dict() for task in self.tasks.values()]}, indent=2), encoding="utf-8")
        temporary.replace(self.storage_path)

    def _emit(self, task: AgentTask, event: str, message: str, data: Optional[dict[str, Any]] = None) -> AgentEvent:
        task.updated_at = _now()
        item = AgentEvent(f"evt_{uuid.uuid4().hex[:10]}", task.id, event, message, task.state, data=data or {})
        self.events.setdefault(task.id, []).append(item)
        self._save()
        return item

    def create(self, workspace_id: str, objective: str, command: Optional[str] = None, plan: Optional[list[dict[str, Any]]] = None, verification_command: Optional[str] = None) -> AgentTask:
        self.workspaces.get(workspace_id)
        steps = []
        for item in plan or []:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind") or "inspect").strip().lower()
            if kind not in {"inspect", "edit", "run", "verify"}:
                raise WorkspaceAccessError(f"unsupported agent step: {kind}")
            steps.append(AgentStep(
                id=f"step_{uuid.uuid4().hex[:10]}", kind=kind,
                description=str(item.get("description") or kind), path=item.get("path"),
                old_text=item.get("old_text"), new_text=item.get("new_text"), command=item.get("command"),
            ))
        task = AgentTask(f"task_{uuid.uuid4().hex[:12]}", workspace_id, objective.strip(), command.strip() if command else None, steps=steps, verification_command=verification_command)
        if task.command or task.steps:
            task.risk = classify_command(task.command or "")
            task.approval_required = bool(task.command and task.risk != CommandRisk.LOW)
            task.state = AgentState.WAITING_FOR_APPROVAL if task.approval_required else AgentState.ANALYZING
        else:
            task.state = AgentState.ANALYZING
        self.tasks[task.id] = task
        self._emit(task, "agent.started", "Coding task started.", {"objective": task.objective, "risk": task.risk.value if task.risk else None})
        if task.approval_required:
            self._emit(task, "agent.awaiting_approval", "This command requires approval before execution.", {"command": task.command})
        self._save()
        return task

    def get(self, task_id: str) -> AgentTask:
        if task_id not in self.tasks:
            raise WorkspaceAccessError("agent task not found")
        return self.tasks[task_id]

    def approve(self, task_id: str) -> AgentTask:
        task = self.get(task_id)
        if task.state != AgentState.WAITING_FOR_APPROVAL:
            return task
        task.approval_granted = True
        task.state = AgentState.ANALYZING
        self._emit(task, "agent.approved", "Approval received; task may execute.")
        return task

    def cancel(self, task_id: str) -> AgentTask:
        task = self.get(task_id)
        event = self._cancel.get(task_id)
        if event:
            event.set()
        if task.state not in {AgentState.COMPLETED, AgentState.FAILED, AgentState.CANCELLED, AgentState.REJECTED}:
            task.state = AgentState.CANCELLED
            self._emit(task, "agent.cancelled", "Task cancellation requested.")
        return task

    async def run(self, task_id: str, executor: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]) -> AgentTask:
        task = self.get(task_id)
        if task.state == AgentState.WAITING_FOR_APPROVAL and not task.approval_granted:
            return task
        if task_id in self._running:
            return task
        stop = asyncio.Event()
        self.workspaces.acquire(task.workspace_id, task.id)
        self._cancel[task_id] = stop
        self._running[task_id] = asyncio.current_task()
        try:
            task.state = AgentState.PLANNING
            self._emit(task, "agent.planning", "Preparing a controlled execution plan.")
            if stop.is_set():
                task.state = AgentState.CANCELLED
                return task
            task.state = AgentState.INSPECTING
            workspace = self.workspaces.get(task.workspace_id)
            self._emit(task, "workspace.inspecting", "Inspecting the approved workspace.", {"workspace_id": workspace.id})
            if any(step.kind == "edit" for step in task.steps):
                task.snapshot_id = self.workspaces.snapshot(task.workspace_id, [step.path for step in task.steps if step.kind == "edit" and step.path], task.id)["id"]
                self._emit(task, "workspace.snapshot", "Created a reversible pre-edit snapshot.", {"snapshot_id": task.snapshot_id})
            for step in task.steps:
                if stop.is_set():
                    task.state = AgentState.CANCELLED
                    return task
                step.state = "running"
                if step.kind == "inspect":
                    step.result = self.workspaces.inspect(task.workspace_id)
                    task.state = AgentState.INSPECTING
                    self._emit(task, "workspace.inspected", step.description, {"step_id": step.id})
                elif step.kind == "edit":
                    task.state = AgentState.EDITING
                    if not step.path:
                        raise WorkspaceAccessError("edit step requires a path")
                    if step.old_text is not None:
                        step.result = self.workspaces.patch_file(task.workspace_id, step.path, step.old_text, step.new_text or "", task.id)
                    else:
                        step.result = self.workspaces.write_file(task.workspace_id, step.path, step.new_text or "", task.id)
                    self._emit(task, "file.changed", f"Changed {step.path}.", {"step_id": step.id, "path": step.path})
                elif step.kind in {"run", "verify"}:
                    task.state = AgentState.RUNNING
                    command = step.command or task.verification_command
                    if not command:
                        raise WorkspaceAccessError(f"{step.kind} step requires a command")
                    result = await executor({"command": command, "cwd": workspace.root_path, "confirmed": True})
                    step.result = result
                    self._emit(task, "tool.completed", f"Completed {step.kind} step.", {"step_id": step.id, "exit_code": result.get("exit_code", 0)})
                    if result.get("is_error") or result.get("exit_code", 0) not in (0, None):
                        raise RuntimeError(f"{step.kind} command failed")
                step.state = "completed"
            if task.command:
                task.state = AgentState.RUNNING
                self._emit(task, "tool.started", "Running the approved workspace command.", {"command": task.command})
                result = await executor({"command": task.command, "cwd": workspace.root_path, "confirmed": task.approval_granted})
                task.result = result
                if stop.is_set():
                    task.state = AgentState.CANCELLED
                elif result.get("is_error") or result.get("exit_code", 0) not in (0, None):
                    task.state = AgentState.FAILED
                    task.error = str(result.get("content") or result.get("stderr") or "Command failed")
                    self._emit(task, "tool.failed", "Command failed.", {"exit_code": result.get("exit_code")})
                else:
                    task.state = AgentState.VERIFYING
                    self._emit(task, "tool.completed", "Command completed; result captured.", {"exit_code": result.get("exit_code", 0)})
                    task.state = AgentState.COMPLETED
                    self._emit(task, "agent.completed", "Task completed with execution evidence.")
            elif task.snapshot_id:
                task.state = AgentState.WAITING_FOR_ACCEPTANCE
                task.result = {"diff": self.workspaces.diff_snapshot(task.workspace_id, task.snapshot_id)}
                self._emit(task, "agent.awaiting_acceptance", "Changes are ready for review.", {"snapshot_id": task.snapshot_id, "diff": task.result["diff"]})
            else:
                task.state = AgentState.COMPLETED
                self._emit(task, "agent.completed", "Task plan created; no command was requested.")
        except asyncio.CancelledError:
            task.state = AgentState.CANCELLED
            self._emit(task, "agent.cancelled", "Task execution cancelled.")
        except Exception as exc:
            task.state = AgentState.FAILED
            task.error = str(exc)
            self._emit(task, "agent.failed", "Task failed safely.", {"error": str(exc)})
        finally:
            self._running.pop(task_id, None)
            self._cancel.pop(task_id, None)
            self.workspaces.release(task.workspace_id, task.id)
            self._save()
        return task

    def accept(self, task_id: str) -> AgentTask:
        task = self.get(task_id)
        if task.state == AgentState.WAITING_FOR_ACCEPTANCE:
            task.state = AgentState.COMPLETED
            self._emit(task, "agent.accepted", "Changes accepted into the workspace.")
        return task

    def reject(self, task_id: str) -> AgentTask:
        task = self.get(task_id)
        if task.state == AgentState.WAITING_FOR_ACCEPTANCE and task.snapshot_id:
            self.workspaces.restore_snapshot(task.workspace_id, task.snapshot_id)
            task.state = AgentState.REJECTED
            self._emit(task, "agent.rejected", "Changes rejected and snapshot restored.", {"snapshot_id": task.snapshot_id})
        return task

    def event_snapshot(self, task_id: str) -> list[dict[str, Any]]:
        return [asdict(event) | {"state": event.state.value} for event in self.events.get(task_id, [])]