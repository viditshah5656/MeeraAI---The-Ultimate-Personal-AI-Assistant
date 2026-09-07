# Managed Processes

`process_manager.py` provides persistent lifecycle control for long-running
commands inside an approved workspace. Each process records its workspace,
command, canonical working directory, PID, state, exit code, timestamps, and a
bounded output buffer.

## API

- `GET /api/processes` lists persisted process records.
- `POST /api/processes` starts a process in an approved workspace.
- `GET /api/processes/{id}` returns current state and buffered output.
- `GET /api/processes/{id}/events` streams stdout/stderr as SSE frames.
- `POST /api/processes/{id}/stop` terminates the process or its POSIX group.
- `POST /api/processes/{id}/restart` starts the same command again.

On POSIX, each process starts a new session and stop requests target the whole
process group. Output is capped to prevent an unbounded memory stream. Processes
that were running when the backend restarts are marked stopped rather than
reported as still active.

The desktop coding-agent panel exposes command entry, live output, PID/state,
stop, and restart controls after a workspace is approved.