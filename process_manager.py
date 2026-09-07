"""Managed long-running workspace processes with bounded output and cancellation."""

from __future__ import annotations

import asyncio
import json
import os
import signal
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from workspace_manager import WorkspaceManager
from workspace_security import WorkspaceAccessError
from agent_runtime import CommandRisk, classify_command


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ManagedProcess:
    id: str
    workspace_id: str
    command: str
    cwd: str
    risk: str = CommandRisk.LOW.value
    state: str = "starting"
    pid: Optional[int] = None
    exit_code: Optional[int] = None
    started_at: str = field(default_factory=_now)
    ended_at: Optional[str] = None
    output: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ProcessManager:
    def __init__(self, storage_path: str | Path, workspaces: WorkspaceManager, max_output_lines: int = 500):
        self.storage_path = Path(storage_path)
        self.workspaces = workspaces
        self.max_output_lines = max_output_lines
        self.processes: dict[str, ManagedProcess] = {}
        self._children: dict[str, asyncio.subprocess.Process] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists():
            return
        try:
            payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            for item in payload.get("processes", ()):
                item.setdefault("risk", CommandRisk.LOW.value)
                if item.get("state") in {"running", "starting"}:
                    item["state"] = "stopped"
                    item["ended_at"] = item.get("ended_at") or _now()
                self.processes[item["id"]] = ManagedProcess(**item)
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"version": 1, "processes": [item.to_dict() for item in self.processes.values()]}, indent=2), encoding="utf-8")
        temporary.replace(self.storage_path)

    def get(self, process_id: str) -> ManagedProcess:
        process = self.processes.get(process_id)
        if not process:
            raise WorkspaceAccessError("process not found")
        return process

    def list(self) -> list[ManagedProcess]:
        return list(self.processes.values())

    def _append_output(self, process: ManagedProcess, stream: str, text: str) -> None:
        for line in text.splitlines():
            process.output.append({"stream": stream, "text": line, "timestamp": _now()})
        if len(process.output) > self.max_output_lines:
            del process.output[:-self.max_output_lines]

    async def _pump(self, process: ManagedProcess, stream: str, reader: asyncio.StreamReader) -> None:
        while True:
            line = await reader.readline()
            if not line:
                break
            self._append_output(process, stream, line.decode("utf-8", errors="replace").rstrip("\r\n"))
            self._save()

    async def _watch(self, process: ManagedProcess, child: asyncio.subprocess.Process) -> None:
        await asyncio.gather(
            self._pump(process, "stdout", child.stdout),
            self._pump(process, "stderr", child.stderr),
        )
        process.exit_code = await child.wait()
        if process.state not in {"stopping", "stopped"}:
            process.state = "exited" if process.exit_code == 0 else "failed"
        else:
            process.state = "stopped"
        process.ended_at = _now()
        self._children.pop(process.id, None)
        self._tasks.pop(process.id, None)
        self._save()

    async def start(self, workspace_id: str, command: str, cwd: str = "", env: Optional[dict[str, str]] = None, confirmed: bool = False) -> ManagedProcess:
        workspace = self.workspaces.get(workspace_id)
        approved = self.workspaces._approved(workspace_id)
        working_dir = approved.resolve(cwd or ".")
        if not working_dir.is_dir():
            raise WorkspaceAccessError("process cwd must be a directory")
        if not command.strip():
            raise WorkspaceAccessError("command is required")
        risk = classify_command(command)
        if risk != CommandRisk.LOW and not confirmed:
            raise WorkspaceAccessError(f"{risk.value}-risk process requires explicit confirmation")
        process = ManagedProcess(f"proc_{uuid.uuid4().hex[:12]}", workspace_id, command.strip(), str(working_dir), risk.value)
        self.processes[process.id] = process
        try:
            kwargs: dict[str, Any] = {
                "cwd": str(working_dir), "stdout": asyncio.subprocess.PIPE, "stderr": asyncio.subprocess.PIPE,
                "env": {**os.environ, **(env or {})},
            }
            if os.name != "nt":
                kwargs["start_new_session"] = True
            child = await asyncio.create_subprocess_shell(process.command, **kwargs)
        except Exception:
            process.state = "failed"
            process.ended_at = _now()
            self._save()
            raise
        process.pid = child.pid
        process.state = "running"
        self._children[process.id] = child
        self._tasks[process.id] = asyncio.create_task(self._watch(process, child))
        self._save()
        return process

    async def stop(self, process_id: str, force: bool = False) -> ManagedProcess:
        process = self.get(process_id)
        child = self._children.get(process_id)
        if not child or child.returncode is not None:
            return process
        process.state = "stopping"
        try:
            if os.name != "nt" and process.pid:
                os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
            else:
                child.kill() if force else child.terminate()
        except ProcessLookupError:
            pass
        self._save()
        return process

    async def restart(self, process_id: str) -> ManagedProcess:
        previous = self.get(process_id)
        await self.stop(process_id)
        return await self.start(previous.workspace_id, previous.command, Path(previous.cwd).relative_to(self.workspaces._approved(previous.workspace_id).root).as_posix(), confirmed=True)

    def output_snapshot(self, process_id: str) -> list[dict[str, Any]]:
        return list(self.get(process_id).output)
