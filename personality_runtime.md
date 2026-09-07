# Personality Runtime

MeeraAI now has a backend-owned, model-independent personality runtime in
`personality_runtime.py`. Definitions and active role state are persisted in
the application data directory as `personalities.json` using an atomic replace.

## Runtime model

Each `Personality` keeps identity, objective, expertise, traits, communication
style, reasoning preferences, tool permissions, research requirements, memory
scope, workspace policy, verification methodology, safety constraints, and a
versioned `KnowledgeSnapshot` as separate fields. The runtime composes these
sections into context only when a role is active; ordinary chat keeps the
existing Meera system prompt unchanged.

Built-in roles currently include Coding Agent, IELTS Teacher, and Research
Assistant. Custom roles can be created from concise name, purpose, and objective
fields through the personality API.

## Lifecycle and API

Roles support session, persistent, task, and project lifecycle labels and can be
activated or exited without deleting their definitions. The backend exposes:

- `GET /api/personalities`
- `POST /api/personalities`
- `POST /api/personalities/{id}/activate`
- `POST /api/personalities/{id}/deactivate`

Chat requests may select `personality_id`; natural requests such as “Become my
IELTS teacher” and “Switch to coding mode” are also detected by the runtime.
Explicit exit language removes the active top role.

The desktop top bar includes a compact selector for activating and exiting the
built-in roles. The selected role is included in the shared chat request
builder, so streamed and non-streamed chat use the same runtime state.

## Workspace boundary

`workspace_security.py` provides `ApprovedWorkspace`, the backend primitive for
path containment. It resolves paths canonically and rejects traversal,
absolute-path escapes, symlink escapes, and configured excluded directories.
Frontend restrictions must not replace this backend check.

## Next integration boundary

The existing `meera_memory.py` SQLite system remains the long-term memory
store. Role-aware retrieval, durable personality persistence, project workspace
records, transactional snapshots, and a full coding-agent state machine should
be layered onto these runtime seams rather than implemented as prompt-only
presets or a second chat stack.