"""Persisted, backend-owned project workspace records and file access."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import uuid
import difflib
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from workspace_security import ApprovedWorkspace, WorkspaceAccessError


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WorkspaceRecord:
    id: str
    name: str
    root_path: str
    created_at: str
    last_opened_at: str
    excluded: tuple[str, ...] = (".git", "node_modules", ".venv", "__pycache__")


class WorkspaceManager:
    def __init__(self, storage_path: str | Path):
        self.storage_path = Path(storage_path)
        self.records: dict[str, WorkspaceRecord] = {}
        self._locks: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        if not self.storage_path.exists():
            return
        try:
            payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            for item in payload.get("workspaces", ()):
                record = WorkspaceRecord(
                    id=str(item["id"]), name=str(item["name"]), root_path=str(item["root_path"]),
                    created_at=str(item["created_at"]), last_opened_at=str(item["last_opened_at"]),
                    excluded=tuple(str(value) for value in item.get("excluded", ())),
                )
                if Path(record.root_path).is_dir():
                    self.records[record.id] = record
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix(self.storage_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"version": 1, "workspaces": [asdict(item) for item in self.records.values()]}, indent=2), encoding="utf-8")
        temporary.replace(self.storage_path)

    def list(self) -> list[WorkspaceRecord]:
        return list(self.records.values())

    def open(self, root_path: str, name: Optional[str] = None) -> WorkspaceRecord:
        root = Path(root_path).expanduser().resolve(strict=True)
        if not root.is_dir():
            raise WorkspaceAccessError("workspace root must be a directory")
        for record in self.records.values():
            if Path(record.root_path) == root:
                record.last_opened_at = _now()
                self._save()
                return record
        now = _now()
        record = WorkspaceRecord(
            id=f"ws_{uuid.uuid4().hex[:12]}", name=(name or root.name or "Workspace").strip(),
            root_path=str(root), created_at=now, last_opened_at=now,
        )
        self.records[record.id] = record
        self._save()
        return record

    def get(self, workspace_id: str) -> WorkspaceRecord:
        record = self.records.get(workspace_id)
        if not record:
            raise WorkspaceAccessError("workspace not found")
        return record

    def acquire(self, workspace_id: str, owner: str) -> None:
        self.get(workspace_id)
        current = self._locks.get(workspace_id)
        if current and current != owner:
            raise WorkspaceAccessError("workspace is already locked by another task")
        self._locks[workspace_id] = owner

    def release(self, workspace_id: str, owner: str) -> None:
        if self._locks.get(workspace_id) == owner:
            self._locks.pop(workspace_id, None)

    def _approved(self, workspace_id: str) -> ApprovedWorkspace:
        record = self.get(workspace_id)
        return ApprovedWorkspace(record.root_path, record.excluded)

    def _workspace_state_dir(self, workspace_id: str) -> Path:
        path = self.storage_path.parent / "workspace_state" / workspace_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def audit(self, workspace_id: str, action: str, path: str = "", outcome: str = "allowed", metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        entry = {"id": f"audit_{uuid.uuid4().hex[:12]}", "timestamp": _now(), "workspace_id": workspace_id, "action": action, "path": path, "outcome": outcome, "metadata": metadata or {}}
        with (self._workspace_state_dir(workspace_id) / "security_audit.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry) + "\n")
        return entry

    def audit_events(self, workspace_id: str, limit: int = 100) -> list[dict[str, Any]]:
        path = self._workspace_state_dir(workspace_id) / "security_audit.jsonl"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()[-max(1, min(limit, 500)):][::-1] if line.strip()]

    @staticmethod
    def _hash_text(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_sensitive(path: Path) -> bool:
        return path.name.startswith(".env") or path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}

    def list_files(self, workspace_id: str, subpath: str = "", limit: int = 200) -> list[dict[str, Any]]:
        directory = self._approved(workspace_id).resolve(subpath)
        if not directory.is_dir():
            raise WorkspaceAccessError("requested path is not a directory")
        entries = []
        for item in sorted(directory.iterdir(), key=lambda path: (path.is_file(), path.name.lower()))[:max(1, min(limit, 500))]:
            relative = item.relative_to(self._approved(workspace_id).root).as_posix()
            if item.name in self.get(workspace_id).excluded:
                continue
            entries.append({"name": item.name, "path": relative, "kind": "directory" if item.is_dir() else "file", "size": item.stat().st_size if item.is_file() else None})
        return entries

    def read_file(self, workspace_id: str, path: str, start_line: int = 1, end_line: int = 400) -> dict[str, Any]:
        try:
            target = self._approved(workspace_id).resolve(path)
        except WorkspaceAccessError:
            self.audit(workspace_id, "read", path, "denied")
            raise
        if not target.is_file():
            raise WorkspaceAccessError("requested path is not a file")
        if self._is_sensitive(target):
            self.audit(workspace_id, "read", path, "denied", {"reason": "sensitive_file"})
            raise WorkspaceAccessError("sensitive files are not readable through this API")
        start = max(1, int(start_line))
        end = max(start, min(int(end_line), start + 999))
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
        self.audit(workspace_id, "read", path)
        return {"path": target.relative_to(self._approved(workspace_id).root).as_posix(), "content": "\n".join(lines[start - 1:end]), "start_line": start, "end_line": min(end, len(lines)), "total_lines": len(lines)}

    def snapshot(self, workspace_id: str, paths: Optional[list[str]] = None, task_id: Optional[str] = None) -> dict[str, Any]:
        approved = self._approved(workspace_id)
        snapshot_id = f"snap_{uuid.uuid4().hex[:12]}"
        snapshot_dir = self._workspace_state_dir(workspace_id) / "snapshots" / snapshot_id
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        selected = paths or [item["path"] for item in self.list_files(workspace_id, "", 500) if item["kind"] == "file"]
        manifest = {"id": snapshot_id, "workspace_id": workspace_id, "task_id": task_id, "created_at": _now(), "files": {}}
        for relative in selected:
            source = approved.resolve(relative, allow_missing=True)
            if not source.is_file() or self._is_sensitive(source):
                continue
            destination = snapshot_dir / Path(relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            content = source.read_text(encoding="utf-8", errors="replace")
            manifest["files"][Path(relative).as_posix()] = {"hash": self._hash_text(content), "size": source.stat().st_size}
        (snapshot_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def restore_snapshot(self, workspace_id: str, snapshot_id: str) -> dict[str, Any]:
        approved = self._approved(workspace_id)
        snapshot_dir = self._workspace_state_dir(workspace_id) / "snapshots" / snapshot_id
        manifest_path = snapshot_dir / "manifest.json"
        if not manifest_path.exists():
            raise WorkspaceAccessError("snapshot not found")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        restored = []
        for relative in manifest.get("files", {}):
            source = snapshot_dir / relative
            target = approved.resolve(relative, allow_missing=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            restored.append(relative)
        return {"snapshot_id": snapshot_id, "restored": restored}

    def diff_snapshot(self, workspace_id: str, snapshot_id: str) -> dict[str, Any]:
        """Return reviewable unified diffs between a snapshot and current files."""
        approved = self._approved(workspace_id)
        snapshot_dir = self._workspace_state_dir(workspace_id) / "snapshots" / snapshot_id
        manifest_path = snapshot_dir / "manifest.json"
        if not manifest_path.exists():
            raise WorkspaceAccessError("snapshot not found")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = []
        additions = 0
        deletions = 0
        for relative in manifest.get("files", {}):
            before_path = snapshot_dir / relative
            current_path = approved.resolve(relative, allow_missing=True)
            before = before_path.read_text(encoding="utf-8", errors="replace") if before_path.exists() else ""
            after = current_path.read_text(encoding="utf-8", errors="replace") if current_path.is_file() else ""
            if before == after:
                continue
            diff_lines = list(difflib.unified_diff(
                before.splitlines(keepends=True), after.splitlines(keepends=True),
                fromfile=f"a/{relative}", tofile=f"b/{relative}",
            ))
            additions += sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++") )
            deletions += sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---") )
            files.append({"path": relative, "diff": "".join(diff_lines), "before_hash": self._hash_text(before), "after_hash": self._hash_text(after)})
        return {"snapshot_id": snapshot_id, "files": files, "additions": additions, "deletions": deletions, "changed_files": len(files)}

    def _record_change(self, workspace_id: str, task_id: Optional[str], operation: str, relative: str, before: Optional[str], after: Optional[str], snapshot_id: Optional[str]) -> dict[str, Any]:
        entry = {"id": f"change_{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, "task_id": task_id, "timestamp": _now(), "operation": operation, "path": relative, "before_hash": before, "after_hash": after, "snapshot_id": snapshot_id}
        ledger_path = self._workspace_state_dir(workspace_id) / "changes.jsonl"
        with ledger_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry) + "\n")
        return entry

    def changes(self, workspace_id: str, limit: int = 100) -> list[dict[str, Any]]:
        path = self._workspace_state_dir(workspace_id) / "changes.jsonl"
        if not path.exists():
            return []
        lines = path.read_text(encoding="utf-8").splitlines()[-max(1, min(limit, 500)):]
        return [json.loads(line) for line in reversed(lines) if line.strip()]

    def write_file(self, workspace_id: str, path: str, content: str, task_id: Optional[str] = None) -> dict[str, Any]:
        target = self._approved(workspace_id).resolve(path, allow_missing=True)
        if self._is_sensitive(target):
            self.audit(workspace_id, "write", path, "denied", {"reason": "sensitive_file"})
            raise WorkspaceAccessError("sensitive files are not writable through this API")
        previous = target.read_text(encoding="utf-8", errors="replace") if target.exists() else None
        snapshot = self.snapshot(workspace_id, [path], task_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".meera-tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(target)
        change = self._record_change(workspace_id, task_id, "write", Path(path).as_posix(), self._hash_text(previous) if previous is not None else None, self._hash_text(content), snapshot["id"])
        self.audit(workspace_id, "write", path, metadata={"task_id": task_id, "change_id": change["id"]})
        return {"path": Path(path).as_posix(), "bytes": len(content.encode("utf-8")), "change": change}

    def patch_file(self, workspace_id: str, path: str, old_text: str, new_text: str, task_id: Optional[str] = None) -> dict[str, Any]:
        target = self._approved(workspace_id).resolve(path)
        if self._is_sensitive(target):
            raise WorkspaceAccessError("sensitive files are not patchable through this API")
        current = target.read_text(encoding="utf-8")
        if old_text not in current:
            raise WorkspaceAccessError("patch context was not found")
        return self.write_file(workspace_id, path, current.replace(old_text, new_text, 1), task_id)

    def inspect(self, workspace_id: str) -> dict[str, Any]:
        record = self.get(workspace_id)
        root = self._approved(workspace_id).root
        files = {path.name for path in root.iterdir() if path.is_file()}
        package = {}
        package_path = root / "package.json"
        if package_path.exists():
            try:
                package = json.loads(package_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, json.JSONDecodeError):
                package = {}
        git_branch = None
        if (root / ".git").exists():
            try:
                git_branch = subprocess.run(["git", "-C", str(root), "branch", "--show-current"], capture_output=True, text=True, timeout=5, check=False).stdout.strip() or None
            except (OSError, subprocess.SubprocessError):
                git_branch = None
        return {"workspace": asdict(record), "project": {"files": sorted(files), "package_name": package.get("name"), "scripts": package.get("scripts", {}), "git_branch": git_branch}}