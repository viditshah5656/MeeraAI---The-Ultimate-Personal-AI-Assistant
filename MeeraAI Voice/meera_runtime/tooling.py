from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .cancellation import CancellationToken
from .models import ErrorCategory, PermissionClass, ToolError, ToolResult


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    permission: PermissionClass
    timeout_seconds: float
    handler: Callable[[dict[str, Any], CancellationToken], ToolResult]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Duplicate tool: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def definitions(self) -> tuple[ToolDefinition, ...]:
        return tuple(self._tools.values())

    def execute(self, name: str, arguments: dict[str, Any], token: CancellationToken) -> ToolResult:
        started = time.monotonic()
        tool = self.get(name)
        if not tool:
            return ToolResult(False, f"Unknown tool: {name}", error=ToolError(ErrorCategory.INVALID_INPUT, name))
        error = validate_arguments(arguments, tool.input_schema)
        if error:
            return ToolResult(False, error, error=ToolError(ErrorCategory.INVALID_INPUT, error))
        try:
            result = tool.handler(arguments, token)
        except Exception as exc:
            result = ToolResult(False, f"{name} failed", error=ToolError(ErrorCategory.TOOL_ERROR, str(exc)))
        result.duration_ms = int((time.monotonic() - started) * 1000)
        return result


def validate_arguments(arguments: dict[str, Any], schema: dict[str, Any]) -> str | None:
    if not isinstance(arguments, dict):
        return "Arguments must be an object"
    properties = schema.get("properties", {})
    for key in schema.get("required", []):
        if key not in arguments:
            return f"Missing required argument: {key}"
    if schema.get("additionalProperties") is False:
        unknown = set(arguments) - set(properties)
        if unknown:
            return f"Unknown argument(s): {', '.join(sorted(unknown))}"
    types = {"string": str, "integer": int, "number": (int, float), "boolean": bool}
    for key, value in arguments.items():
        expected = properties.get(key, {}).get("type")
        if expected in types and not isinstance(value, types[expected]):
            return f"Argument {key} must be {expected}"
    return None
