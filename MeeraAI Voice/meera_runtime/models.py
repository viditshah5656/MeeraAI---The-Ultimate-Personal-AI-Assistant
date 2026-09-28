from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StringEnum(str, Enum):
    def __str__(self) -> str:
        return self.value


class TaskStatus(StringEnum):
    PENDING = "pending"
    PLANNING = "planning"
    RUNNING = "running"
    BLOCKED = "blocked"
    WAITING_USER = "waiting_user"
    WAITING_EXTERNAL = "waiting_external"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(StringEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class AgentState(StringEnum):
    IDLE = "idle"
    UNDERSTANDING = "understanding"
    PLANNING = "planning"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    WAITING_USER = "waiting_user"
    WAITING_AUTH = "waiting_auth"
    WAITING_EXTERNAL = "waiting_external"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PermissionClass(StringEnum):
    READ_ONLY = "read_only"
    REVERSIBLE_WRITE = "reversible_write"
    IRREVERSIBLE_WRITE = "irreversible_write"
    EXTERNAL_SIDE_EFFECT = "external_side_effect"


class ErrorCategory(StringEnum):
    NETWORK_ERROR = "network_error"
    TIMEOUT = "timeout"
    AUTH_REQUIRED = "auth_required"
    PERMISSION_DENIED = "permission_denied"
    FILE_NOT_FOUND = "file_not_found"
    PROCESS_FAILED = "process_failed"
    INVALID_INPUT = "invalid_input"
    TOOL_ERROR = "tool_error"
    MODEL_ERROR = "model_error"
    DEPENDENCY_ERROR = "dependency_error"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


@dataclass
class Artifact:
    type: str
    path: str
    description: str
    created_by: str
    task_id: str
    timestamp: str = field(default_factory=utc_now)


@dataclass
class ToolError:
    category: ErrorCategory
    message: str
    retryable: bool = False
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResult:
    ok: bool
    summary: str
    data: dict[str, Any] = field(default_factory=dict)
    error: ToolError | None = None
    duration_ms: int = 0
    artifacts: list[Artifact] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentResult:
    success: bool
    summary: str
    artifacts: list[Artifact] = field(default_factory=list)
    observations: list[str] = field(default_factory=list)
    errors: list[ToolError] = field(default_factory=list)
    next_actions: list[str] = field(default_factory=list)
    speech_text: str | None = None
    speech_instruction: str | None = None
    speech_stream: Any = None
    performance: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.success



@dataclass
class Task:
    title: str
    description: str
    id: str = field(default_factory=lambda: str(uuid4()))
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.NORMAL
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    project: str | None = None
    working_directory: str | None = None
    parent_task: str | None = None
    subtasks: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    current_step: str | None = None
    completed_steps: list[str] = field(default_factory=list)
    next_step: str | None = None
    artifacts: list[Artifact] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    retry_count: int = 0
    owner_agent: str = "supervisor"
    monitoring_requirements: dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: str(uuid4()))


@dataclass
class AgentEvent:
    event: str
    task_id: str
    state: AgentState
    message: str
    agent: str = "supervisor"
    tool: str | None = None
    correlation_id: str | None = None
    timestamp: str = field(default_factory=utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def created_at(self) -> str:
        return self.timestamp

