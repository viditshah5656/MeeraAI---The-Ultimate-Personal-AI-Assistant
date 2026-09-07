# Coding-Agent Runtime

`agent_runtime.py` is the controlled task layer above Meera's existing
`ChatService` terminal executor.

## State machine

Tasks move through explicit states:

`idle` -> `analyzing` -> `planning` -> `inspecting` -> `running` ->
`verifying` -> `completed`

They can instead become `waiting_for_approval`, `failed`, or `cancelled`.
The runtime emits concise activity events such as `agent.planning`,
`workspace.inspecting`, `tool.started`, `tool.completed`, and
`agent.awaiting_approval`. It never emits hidden model reasoning.

## Safety

Commands are classified as low, medium, or high risk. Low-risk commands can
run after task creation. Medium and high-risk commands remain in
`waiting_for_approval` until the explicit approval endpoint is called.
Cancellation propagates to the running asyncio task, while the underlying
terminal executor remains the single command execution boundary.

## API

- `POST /api/agent/tasks` creates a task.
- `GET /api/agent/tasks/{id}` returns task state and recorded events.
- `GET /api/agent/tasks/{id}/events` streams concise SSE activity events.
- `POST /api/agent/tasks/{id}/approve` releases an approval-gated task.
- `POST /api/agent/tasks/{id}/cancel` requests cancellation.

Tasks are persisted in `data/agent_tasks.json`. Workspace commands use the
approved root from the workspace manager, so the task runtime does not accept
an unrelated working directory.

The desktop split view now includes `AgentTaskPanel`, which lists approved
workspaces, approves a project folder, starts a task, handles approval and stop
controls, and renders the last activity events from the SSE endpoint.