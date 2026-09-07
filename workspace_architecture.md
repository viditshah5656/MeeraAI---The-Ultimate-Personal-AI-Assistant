# Controlled Project Workspaces

`workspace_manager.py` provides the backend workspace boundary for project
work. A workspace is an approved, persisted root directory rather than a copy
of the project. Records are stored in `data/workspaces.json` and include the
root path, display name, timestamps, and excluded directories.

## API

- `GET /api/workspaces` lists approved workspace records.
- `POST /api/workspaces/open` explicitly approves an existing directory and
  returns its compact project map.
- `GET /api/workspaces/{id}` refreshes project metadata, including package
  scripts and the current Git branch when available.
- `GET /api/workspaces/{id}/files` lists bounded direct children.
- `GET /api/workspaces/{id}/file` reads bounded line ranges.
- `POST /api/workspaces/{id}/file` atomically writes a text file.
- `POST /api/workspaces/{id}/patch` applies an exact-context replacement.
- `POST /api/workspaces/{id}/snapshot` creates a reversible task snapshot.
- `POST /api/workspaces/{id}/restore/{snapshot_id}` restores a snapshot.
- `GET /api/workspaces/{id}/diff/{snapshot_id}` returns per-file unified diffs.
- `GET /api/workspaces/{id}/changes` reads the persistent change ledger.

Every path is resolved through `ApprovedWorkspace`. Traversal, absolute escapes,
symlink escapes, and excluded directories are rejected by the backend. Sensitive
files such as `.env`, private keys, and certificates are not readable through
the workspace file API.

Writes and patches use the same workspace ID and resolver, snapshot existing
content before replacement, and append operation metadata to a persistent
JSONL change ledger. Command execution and process management should use this
same workspace ID rather than accepting independent filesystem roots.

Diff responses include changed file paths, unified diff text, before/after
hashes, and aggregate addition/deletion counts. This is the review surface for
the future accept/reject UI; rollback remains available through snapshot
restoration.