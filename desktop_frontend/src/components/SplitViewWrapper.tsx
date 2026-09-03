import React, { ReactNode, useEffect, useRef, useState } from "react";
import { AgentActionLog } from "./AgentActionLog";
import type { AgentAction } from "../App";

interface SplitViewWrapperProps {
  showSplitView: boolean;
  agentActions: AgentAction[];
  currentAgentAction: AgentAction | null;
  browserUrl: string;
  chatContent: ReactNode;
  onAgentActionClick?: (action: AgentAction) => void;
  onCloseSplitView?: () => void;
}

export function SplitViewWrapper({
  showSplitView,
  agentActions,
  currentAgentAction,
  browserUrl,
  chatContent,
  onAgentActionClick,
  onCloseSplitView,
}: SplitViewWrapperProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [position, setPosition] = useState<{ right?: number; bottom?: number; left?: number; top?: number } | null>(null);
  const clampPanel = (left: number, top: number) => {
    const panel = panelRef.current;
    const width = panel?.offsetWidth ?? 360;
    const height = panel?.offsetHeight ?? 640;
    return {
      left: Math.min(Math.max(16, left), Math.max(16, window.innerWidth - width - 16)),
      top: Math.min(Math.max(124, top), Math.max(124, window.innerHeight - height - 24)),
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const newLeft = startRef.current.left + dx;
      const newTop = startRef.current.top + dy;
      setPosition(clampPanel(newLeft, newTop));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "auto";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    draggingRef.current = true;
    startRef.current.x = e.clientX;
    startRef.current.y = e.clientY;
    const rect = panel.getBoundingClientRect();
    startRef.current.left = rect.left;
    startRef.current.top = rect.top;
    document.body.style.userSelect = "none";
  };

  if (!showSplitView) {
    return <>{chatContent}</>;
  }

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>{chatContent}</div>

      {/* Floating Agent Panel */}
      <div
        ref={panelRef}
        className="agent-floating-panel"
        style={
          position
            ? { position: "fixed", left: position.left + "px", top: position.top + "px" }
            : undefined
        }
      >
        <div className="agent-panel-header" onMouseDown={onHeaderMouseDown}>
          <div className="agent-panel-header-content">
            <div className="agent-panel-title">
              <span className="agent-panel-title-icon">🌐</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "monospace" }}>
                {browserUrl ? new URL(browserUrl).hostname : "browser.meera.ai"}
              </span>
            </div>
          </div>
          <div className="agent-panel-actions">
            <button className="agent-panel-btn" onClick={onCloseSplitView} aria-label="Close browser panel">✕</button>
          </div>
        </div>

        <div className="agent-panel-content">
          <AgentActionLog actions={agentActions} currentAction={currentAgentAction} onActionClick={onAgentActionClick} />
        </div>
      </div>
    </div>
  );
}

export default SplitViewWrapper;
