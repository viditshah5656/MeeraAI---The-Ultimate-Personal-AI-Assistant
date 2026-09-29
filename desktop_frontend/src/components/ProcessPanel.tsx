import { useEffect, useRef, useState } from "react";
import { PiArrowClockwise, PiPlay, PiStop } from "react-icons/pi";

type ManagedProcess = { id: string; command: string; state: string; pid?: number | null; exit_code?: number | null; output?: Array<{ stream: string; text: string }> };

type ProcessPanelProps = { apiBase: string; workspaceId: string };

export default function ProcessPanel({ apiBase, workspaceId }: ProcessPanelProps) {
  const [command, setCommand] = useState("");
  const [process, setProcess] = useState<ManagedProcess | null>(null);
  const [output, setOutput] = useState<Array<{ stream: string; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const subscribe = (id: string) => {
    sourceRef.current?.close();
    const source = new EventSource(`${apiBase}/api/v1/processes/${encodeURIComponent(id)}/events`);
    source.addEventListener("process", (event) => {
      try {
        const line = JSON.parse((event as MessageEvent).data) as { stream: string; text: string };
        setOutput((current) => [...current, line].slice(-300));
      } catch { /* Ignore malformed output frames. */ }
    });
    source.onerror = () => source.close();
    sourceRef.current = source;
  };

  const start = async () => {
    if (!workspaceId || !command.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/processes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, command: command.trim() }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      setProcess(payload.process);
      setOutput(payload.process.output ?? []);
      subscribe(payload.process.id);
    } finally { setBusy(false); }
  };

  const action = async (name: "stop" | "restart") => {
    if (!process) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/processes/${encodeURIComponent(process.id)}/${name}`, { method: "POST" });
      if (!response.ok) return;
      const payload = await response.json();
      setProcess(payload.process);
      setOutput(payload.process.output ?? []);
      if (name === "restart") subscribe(payload.process.id);
    } finally { setBusy(false); }
  };

  return (
    <section className="managed-process-panel" aria-label="Managed process">
      <div className="managed-process-heading"><strong>Managed process</strong><span>{process?.state ?? "idle"}{process?.pid ? ` · PID ${process.pid}` : ""}</span></div>
      <div className="managed-process-input">
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npm run dev" disabled={busy || Boolean(process && ["running", "starting", "stopping"].includes(process.state))} aria-label="Process command" />
        {!process || ["exited", "failed", "stopped"].includes(process.state) ? <button type="button" onClick={() => void start()} disabled={busy || !workspaceId || !command.trim()} aria-label="Start process" title="Start process"><PiPlay /></button> : <button type="button" onClick={() => void action("stop")} disabled={busy} aria-label="Stop process" title="Stop process"><PiStop /></button>}
        {process && ["exited", "failed", "stopped"].includes(process.state) && <button type="button" onClick={() => void action("restart")} disabled={busy} aria-label="Restart process" title="Restart process"><PiArrowClockwise /></button>}
      </div>
      <pre className="managed-process-output">{output.length ? output.map((line, index) => <span className={line.stream === "stderr" ? "stderr" : ""} key={`${index}-${line.text}`}>{line.text}{"\n"}</span>) : "Output will stream here."}</pre>
    </section>
  );
}
