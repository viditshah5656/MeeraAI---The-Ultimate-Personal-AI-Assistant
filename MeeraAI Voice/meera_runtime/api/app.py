"""FastAPI and WebSocket IPC gateway for headless Meera daemon."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import asdict
import json
import logging
import time
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from ..models import AgentEvent, AgentResult, AgentState
from ..cancellation import CancellationToken
from ..supervisor import Supervisor


logger = logging.getLogger("meera.gateway")


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MeeraAI Control Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(20, 27, 45, 0.85);
      --border: rgba(99, 102, 241, 0.25);
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.4);
      --accent: #ec4899;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    header { padding: 1.25rem 2rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); background: rgba(11, 15, 25, 0.8); backdrop-filter: blur(12px); }
    .brand { display: flex; align-items: center; gap: 0.75rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; }
    .brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--success); box-shadow: 0 0 12px var(--success); }
    .badge { font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 9999px; background: rgba(99,102,241,0.15); border: 1px solid var(--border); color: #a5b4fc; }
    .links a { color: var(--text-muted); text-decoration: none; margin-left: 1.2rem; font-size: 0.875rem; transition: color 0.2s; }
    .links a:hover { color: var(--primary); }
    main { max-width: 1200px; width: 100%; margin: 0 auto; padding: 2rem; display: grid; grid-template-columns: 1fr 380px; gap: 1.5rem; flex: 1; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
    .panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; backdrop-filter: blur(16px); display: flex; flex-direction: column; }
    .orb-container { height: 200px; display: flex; align-items: center; justify-content: center; position: relative; }
    .orb { width: 110px; height: 110px; border-radius: 50%; background: radial-gradient(circle, #ec4899 0%, #6366f1 60%, transparent 100%); filter: blur(2px); box-shadow: 0 0 40px var(--primary-glow); transition: transform 0.08s ease, box-shadow 0.08s ease; }
    .orb-pulse { position: absolute; width: 130px; height: 130px; border-radius: 50%; border: 2px solid var(--primary); opacity: 0.3; animation: ripple 2s infinite ease-out; }
    @keyframes ripple { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
    .chat-history { flex: 1; min-height: 260px; max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 0; border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); }
    .msg { padding: 0.75rem 1rem; border-radius: 12px; font-size: 0.92rem; line-height: 1.5; max-width: 85%; }
    .msg.user { align-self: flex-end; background: var(--primary); color: white; }
    .msg.assistant { align-self: flex-start; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); }
    .input-row { display: flex; gap: 0.5rem; margin-top: 1rem; }
    input[type="text"] { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 1rem; color: white; font-size: 0.95rem; outline: none; }
    input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }
    button { background: var(--primary); color: white; border: none; border-radius: 10px; padding: 0.75rem 1.25rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    button:hover { filter: brightness(1.15); transform: translateY(-1px); }
    button.btn-danger { background: #ef4444; }
    button.btn-secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); }
    .side-section { margin-bottom: 1.25rem; }
    .side-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
    .stat-card { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 0.75rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    .stat-row { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
    .stat-val { font-weight: 600; color: #e2e8f0; }
    .event-log { font-family: "Consolas", monospace; font-size: 0.75rem; color: var(--text-muted); height: 160px; overflow-y: auto; background: rgba(0,0,0,0.35); border-radius: 8px; padding: 0.5rem; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-dot"></div>
      MeeraAI
      <span class="badge">Daemon v1.0.0</span>
    </div>
    <div class="links">
      <a href="/docs" target="_blank">Swagger API</a>
      <a href="/api/v1/status" target="_blank">Status JSON</a>
    </div>
  </header>
  <main>
    <div class="panel">
      <div class="orb-container">
        <div class="orb-pulse" id="orbPulse"></div>
        <div class="orb" id="orb"></div>
      </div>
      <div class="chat-history" id="chat">
        <div class="msg assistant">Hey! I'm Meera. Connected live over WebSocket. How can I help?</div>
      </div>
      <div class="input-row">
        <input type="text" id="userInput" placeholder="Type a message to Meera..." onkeydown="if(event.key==='Enter') sendMsg()">
        <button onclick="sendMsg()">Send</button>
        <button class="btn-danger" onclick="interrupt()">Stop</button>
      </div>
    </div>
    <div class="panel">
      <div class="side-section">
        <div class="side-title">System Status</div>
        <div class="stat-card" id="statusCard">Loading status...</div>
      </div>
      <div class="side-section">
        <div class="side-title">Actions</div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-secondary" style="flex:1" onclick="runGC()">Reclaim RAM / GC</button>
          <button class="btn-secondary" style="flex:1" onclick="fetchStatus()">Refresh</button>
        </div>
      </div>
      <div class="side-section" style="flex: 1; display: flex; flex-direction: column;">
        <div class="side-title">Real-Time Event Stream</div>
        <div class="event-log" id="eventLog" style="flex: 1;"></div>
      </div>
    </div>
  </main>
  <script>
    const wsUrl = `ws://${location.host}/ws`;
    let ws = null;
    const orb = document.getElementById('orb');
    const orbPulse = document.getElementById('orbPulse');
    const chat = document.getElementById('chat');
    const eventLog = document.getElementById('eventLog');

    function connectWS() {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => logEvent('[WS] Connected to daemon.');
      ws.onclose = () => {
        logEvent('[WS] Disconnected. Reconnecting...');
        setTimeout(connectWS, 2000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'audio_rms') {
            const scale = 1.0 + Math.min(msg.rms * 5.0, 0.8);
            orb.style.transform = `scale(${scale})`;
            orb.style.boxShadow = `0 0 ${40 + msg.rms * 100}px rgba(236,72,153,${0.4 + msg.rms * 2})`;
          } else if (msg.type === 'agent_event') {
            logEvent(`[${msg.event}] ${msg.message}`);
            if (msg.event === 'task_completed') {
              appendMsg(msg.message, 'assistant');
            }
          }
        } catch(err) {}
      };
    }

    function logEvent(txt) {
      const line = document.createElement('div');
      line.textContent = `${new Date().toLocaleTimeString()} ${txt}`;
      eventLog.appendChild(line);
      eventLog.scrollTop = eventLog.scrollHeight;
    }

    function appendMsg(txt, role) {
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      div.textContent = txt;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    async function sendMsg() {
      const input = document.getElementById('userInput');
      const txt = input.value.trim();
      if (!txt) return;
      input.value = '';
      appendMsg(txt, 'user');
      logEvent(`[User] ${txt}`);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'interact', text: txt }));
      } else {
        const res = await fetch('/api/v1/interact', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ text: txt })
        });
        const data = await res.json();
        appendMsg(data.summary, 'assistant');
      }
    }

    async function interrupt() {
      await fetch('/api/v1/interrupt', { method: 'POST' });
      logEvent('[Action] Interrupted active speech.');
    }

    async function runGC() {
      await fetch('/api/v1/gc', { method: 'POST' });
      logEvent('[Action] Triggered RAM & GPU cache reclamation.');
      fetchStatus();
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/v1/status');
        const data = await res.json();
        const d = data.data || {};
        const workers = d.workers || {};
        const workersHtml = Object.entries(workers).map(([k, v]) => `<div>${k}: <b>${v.status || 'running'}</b> (pid ${v.pid || '?'})</div>`).join('') || 'None';
        document.getElementById('statusCard').innerHTML = `
          <div class="stat-row"><span>TTS Engine:</span><span class="stat-val">${d.tts_ready ? 'Ready' : 'Pending'}</span></div>
          <div class="stat-row"><span>Free Disk:</span><span class="stat-val">${d.disk_free_gb || 0} GB</span></div>
          <div class="stat-row"><span>Platform:</span><span class="stat-val">${d.platform || ''}</span></div>
          <div style="margin-top:0.5rem; font-size:0.75rem; color:#94a3b8;"><b>Workers:</b>${workersHtml}</div>
        `;
      } catch (e) {
        document.getElementById('statusCard').textContent = 'Failed to load status.';
      }
    }

    connectWS();
    fetchStatus();
  </script>
</body>
</html>
"""


class ConnectionManager:
    """Thread-safe WebSocket broadcast hub for connected UI clients."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_async(self, data: dict[str, Any]) -> None:
        payload = json.dumps(data)
        stale: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                stale.append(connection)
        for dead in stale:
            self.disconnect(dead)

    def broadcast(self, data: dict[str, Any]) -> None:
        """Thread-safe entry point to broadcast from background supervisor threads."""
        if not self.active_connections:
            return
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_async(data), self._loop)


class InteractRequest(BaseModel):
    text: str
    correlation_id: str | None = None


class MemoryCreateRequest(BaseModel):
    content: str
    kind: str = "semantic"


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, Any]


def create_app(supervisor: Supervisor | None = None) -> FastAPI:
    """Create and configure the FastAPI daemon application."""
    if supervisor is None:
        supervisor = Supervisor()

    manager = ConnectionManager()
    thread_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="meera-api")

    @asynccontextmanager
    async def lifespan(fastapi_app: FastAPI):
        manager.set_loop(asyncio.get_running_loop())
        logger.info("Meera API Gateway initialized and listening.")
        yield
        try:
            supervisor.close()
        except Exception:
            pass

    app = FastAPI(title="MeeraAI Daemon Gateway", version="1.0.0", lifespan=lifespan)

    # The daemon exposes personal memory and actions. Credentialed wildcard
    # CORS lets any website drive it through the user's browser, so only local
    # dashboard origins are accepted by default.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Wire supervisor events to WebSocket broadcast
    def on_supervisor_event(event: AgentEvent) -> None:
        manager.broadcast({
            "type": "agent_event",
            "event": event.event,
            "task_id": event.task_id,
            "state": event.state.value if hasattr(event.state, "value") else str(event.state),
            "message": event.message,
            "tool": event.tool,
            "correlation_id": event.correlation_id,
            "created_at": getattr(event, "timestamp", getattr(event, "created_at", "")),
        })

    supervisor.events.subscribe(on_supervisor_event)

    # Wire TTS playback observer for live audio waveform RMS streaming
    last_rms_time = 0.0

    def on_playback_samples(samples, rate: int) -> None:
        nonlocal last_rms_time
        now = time.monotonic()
        # Throttle to max 30 fps for smooth UI without saturating the websocket
        if now - last_rms_time < 0.033:
            return
        last_rms_time = now
        try:
            import numpy as np
            arr = np.asarray(samples, dtype=np.float32).reshape(-1)
            if arr.size == 0:
                return
            rms = float(np.sqrt(np.mean(np.square(arr))) + 1e-8)
            peak = float(np.max(np.abs(arr)))
            manager.broadcast({
                "type": "audio_rms",
                "rms": round(rms, 4),
                "peak": round(peak, 4),
                "source": "tts_output",
            })
        except Exception:
            pass

    supervisor.tts.set_playback_observer(on_playback_samples)

    @app.get("/", response_class=HTMLResponse)
    async def dashboard() -> str:
        return DASHBOARD_HTML

    @app.get("/favicon.ico")
    async def favicon() -> Response:
        return Response(status_code=204)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "app": "MeeraAI"}

    @app.get("/api/v1/status")
    async def system_status() -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(
            thread_pool, supervisor._system_status, {}, CancellationToken()
        )
        return {"ok": res.ok, "summary": res.summary, "data": res.data}

    @app.get("/api/v1/memories")
    async def list_memories() -> list[dict[str, Any]]:
        return supervisor.memory.all()

    @app.post("/api/v1/memories")
    async def create_memory(req: MemoryCreateRequest) -> dict[str, Any]:
        ok = supervisor.memory.remember(req.content, req.kind)
        if not ok:
            raise HTTPException(status_code=400, detail="Memory rejected (empty or sensitive).")
        return {"ok": True, "content": req.content}

    @app.delete("/api/v1/memories/{item_id}")
    async def delete_memory(item_id: str) -> dict[str, Any]:
        ok = supervisor.memory.forget(item_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Memory not found.")
        return {"ok": True, "deleted": item_id}

    @app.get("/api/v1/settings")
    async def get_settings() -> dict[str, Any]:
        return supervisor.settings.all()

    @app.post("/api/v1/settings")
    async def update_settings(req: SettingsUpdateRequest) -> dict[str, Any]:
        for k, v in req.settings.items():
            supervisor.settings.set(k, v)
            if k == "speech_rate":
                try:
                    supervisor.tts.set_speech_rate(float(v))
                except Exception:
                    pass
        return {"ok": True, "settings": supervisor.settings.all()}

    @app.post("/api/v1/interact")
    async def interact(req: InteractRequest) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        result: AgentResult = await loop.run_in_executor(
            thread_pool, supervisor.execute, req.text, req.correlation_id
        )
        return {
            "ok": result.ok,
            "summary": result.summary,
            "observations": result.observations,
            "artifacts": [asdict(a) for a in result.artifacts],
        }

    @app.post("/api/v1/interrupt")
    async def interrupt_task() -> dict[str, Any]:
        if supervisor.active_task_id:
            supervisor.cancellations.cancel(supervisor.active_task_id)
            return {"ok": True, "interrupted_task_id": supervisor.active_task_id}
        return {"ok": True, "message": "No active task running."}

    @app.post("/api/v1/gc")
    async def garbage_collect() -> dict[str, Any]:
        try:
            from brain import idle_cleanup
            idle_cleanup()
        except Exception:
            pass
        return {"ok": True, "message": "Memory and GPU cache collected."}

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        try:
            # Send initial greeting and state packet
            await websocket.send_text(json.dumps({
                "type": "welcome",
                "daemon": "MeeraAI",
                "version": "1.0.0",
                "active_task": supervisor.active_task_id,
            }))
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                action = msg.get("action")
                if action == "interrupt":
                    if supervisor.active_task_id:
                        supervisor.cancellations.cancel(supervisor.active_task_id)
                elif action == "interact":
                    text = msg.get("text", "").strip()
                    if text:
                        loop = asyncio.get_running_loop()
                        loop.run_in_executor(
                            thread_pool, supervisor.execute, text, msg.get("correlation_id")
                        )
        except WebSocketDisconnect:
            manager.disconnect(websocket)
    return app


_default_app: FastAPI | None = None


def get_app() -> FastAPI:
    global _default_app
    if _default_app is None:
        _default_app = create_app()
    return _default_app
