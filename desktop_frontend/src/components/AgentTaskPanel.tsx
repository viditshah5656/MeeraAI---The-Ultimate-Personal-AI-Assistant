import { useEffect, useRef, useState } from "react";
import { PiCheck, PiFolderOpen, PiPause, PiPlay, PiPlus, PiSpinnerGap, PiStop } from "react-icons/pi";
import ProcessPanel from "./ProcessPanel";

type Workspace = { id: string; name: string; root_path: string };
type AgentTask = {
  id: string;
  workspace_id: string;
  objective: string;
  command?: string | null;
  state: string;
  risk?: string | null;
  approval_required?: boolean;
  approval_granted?: boolean;
  error?: string | null;
};
type AgentEvent = { id: string; event: string; message: string; state: string; timestamp: string; data?: Record<string, unknown> };

type AgentTaskPanelProps = { apiBase: string };

export default function AgentTaskPanel({ apiBase }: AgentTaskPanelProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [objective, setObjective] = useState("");
  const [command, setCommand] = useState("");
  const [task, setTask] = useState<AgentTask | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refreshWorkspaces = async () => {
    try {
      const response = await fetch(`${apiBase}/api/v1/workspaces`);
      if (!response.ok) return;
      const payload = await response.json();
      const next = Array.isArray(payload.workspaces) ? payload.workspaces : [];
      setWorkspaces(next);
      if (!workspaceId && next[0]) setWorkspaceId(next[0].id);
    } catch {
      // The panel remains available if the backend is temporarily offline.
    }
  };

  useEffect(() => {
    void refreshWorkspaces();
    return () => eventSourceRef.current?.close();
  }, [apiBase]);

  const openWorkspace = async () => {
    if (!workspacePath.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/workspaces/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root_path: workspacePath.trim() }),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload.workspace?.id) setWorkspaceId(payload.workspace.id);
        await refreshWorkspaces();
        setWorkspacePath("");
      }
    } finally {
      setBusy(false);
    }
  };

  const subscribe = (taskId: string) => {
    eventSourceRef.current?.close();
    const source = new EventSource(`${apiBase}/api/v1/agent/tasks/${encodeURIComponent(taskId)}/events`);
    source.addEventListener("agent", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent).data) as AgentEvent;
        setEvents((current) => current.some((item) => item.id === next.id) ? current : [...current, next]);
        setTask((current) => current ? { ...current, state: next.state } : current);
      } catch {
        // Ignore malformed activity frames without interrupting the task panel.
      }
    });
    source.onerror = () => source.close();
    eventSourceRef.current = source;
  };

  const createTask = async () => {
    if (!workspaceId || !objective.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/agent/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, objective: objective.trim(), command: command.trim() || undefined }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      setTask(payload.task);
      setEvents(payload.events ?? []);
      subscribe(payload.task.id);
    } finally {
      setBusy(false);
    }
  };

  const taskAction = async (action: "approve" | "cancel") => {
    if (!task) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/agent/tasks/${encodeURIComponent(task.id)}/${action}`, { method: "POST" });
      if (!response.ok) return;
      const payload = await response.json();
      setTask(payload.task);
      setEvents(payload.events ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="agent-task-panel" aria-label="Coding agent task">
      <div className="agent-task-panel-heading">
        <div><span className="agent-task-kicker">Controlled workspace</span><strong>Coding task</strong></div>
        <span className={`agent-task-state ${task?.state ?? "idle"}`}>{task?.state ?? "idle"}</span>
      </div>
      <div className="agent-task-fields">
        <label>Workspace
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={busy}>
            <option value="">Select approved workspace</option>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <div className="agent-task-open-row">
          <input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="/path/to/project" aria-label="Project folder path" />
          <button type="button" onClick={() => void openWorkspace()} disabled={busy || !workspacePath.trim()} title="Approve project folder" aria-label="Approve project folder"><PiFolderOpen /></button>
        </div>
        <label>Objective
          <input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Run the test suite" disabled={busy || Boolean(task)} />
        </label>
        <label>Command <span className="agent-task-optional">optional</span>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="pytest" disabled={busy || Boolean(task)} />
        </label>
      </div>
      {!task ? (
        <button className="agent-task-primary" type="button" onClick={() => void createTask()} disabled={busy || !workspaceId || !objective.trim()}><PiPlay /> Start task</button>
      ) : (
        <div className="agent-task-actions">
          {task.state === "waiting_for_approval" && <button className="agent-task-primary" type="button" onClick={() => void taskAction("approve")} disabled={busy}><PiCheck /> Approve command</button>}
          {!(["completed", "failed", "cancelled"].includes(task.state)) && <button className="agent-task-stop" type="button" onClick={() => void taskAction("cancel")} disabled={busy}><PiStop /> Stop</button>}
          {task.state === "completed" && <span className="agent-task-success"><PiCheck /> Verified result captured</span>}
        </div>
      )}
      <div className="agent-task-events" aria-live="polite">
        {events.length === 0 ? <span className="agent-task-empty"><PiSpinnerGap /> Activity will appear here.</span> : events.slice(-8).map((event) => <div className="agent-task-event" key={event.id}><span className={`agent-task-event-dot ${event.state}`} /><span>{event.message}</span></div>)}
      </div>
      {task?.error && <div className="agent-task-error">{task.error}</div>}
      {workspaceId && <ProcessPanel apiBase={apiBase} workspaceId={workspaceId} />}
    </section>
  );
}
