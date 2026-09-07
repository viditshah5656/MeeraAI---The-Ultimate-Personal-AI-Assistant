# Deep Agent Runtime

The coding agent now accepts structured plans containing `inspect`, `edit`,
`run`, and `verify` steps. An edit plan creates a pre-edit workspace snapshot,
executes exact-context changes through the workspace manager, and produces a
unified diff. The task enters `waiting_for_acceptance` until the user accepts
the change or rejects it, which restores the snapshot.

Role knowledge is stored as versioned snapshots with source URL, retrieval time,
confidence, freshness, and atomic facts. Active personality context retrieves
only facts matching the current request. Project chat requests pass their
project ID into the existing scoped memory retriever.

Workspace reads, writes, denied sensitive-file attempts, and task-associated
changes emit persistent JSONL audit events. Workspace locks prevent two active
agent tasks from modifying the same approved root simultaneously.

The remaining production expansion is automatic research fetching and source
validation, richer multi-step model planning, preview hosting, and end-to-end
API/UI tests against a running backend.