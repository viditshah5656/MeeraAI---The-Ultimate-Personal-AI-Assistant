import React from "react";
import {
  SiGoogle,
  SiShopify,
  SiSpotify,
  SiAirbnb,
} from "react-icons/si";
import { MdDownload, MdOpenInBrowser } from "react-icons/md";
import type { AgentAction } from "../App";

interface AgentActionLogProps {
  actions: AgentAction[];
  currentAction: AgentAction | null;
  onActionClick?: (action: AgentAction) => void;
}

const getAgentIcon = (type: string) => {
  switch (type) {
    case "search":
      return <SiGoogle />;
    case "book":
      return <SiAirbnb />;
    case "shop":
      return <SiShopify />;
    case "play":
      return <SiSpotify />;
    case "download":
      return <MdDownload />;
    case "browse":
      return <MdOpenInBrowser />;
    default:
      return <MdOpenInBrowser />;
  }
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString();
};

export function AgentActionLog({
  actions,
  currentAction,
  onActionClick,
}: AgentActionLogProps) {
  return (
    <div className="agent-action-log">
      <div className="agent-action-log-header">
        <div className="agent-action-log-header-icon">⚡</div>
        <span>Agent Actions</span>
        {currentAction && (
          <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.6 }}>
            {actions.length} actions
          </span>
        )}
      </div>

      <div className="agent-actions-list">
        {actions.length === 0 ? (
          <div className="agent-action-empty">
            Agent actions will appear here as they execute
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className="agent-action-item"
              onClick={() => onActionClick?.(action)}
              role="button"
              tabIndex={0}
            >
              <div className="agent-action-content">
                <div className={`agent-action-icon ${action.type}`}>
                  {getAgentIcon(action.type)}
                </div>
                <div className="agent-action-details">
                  <div className="agent-action-title">{action.title}</div>
                  <div className="agent-action-meta">
                    <span className={`agent-action-status ${action.status}`}>
                      {action.status === "executing" && "●"} {action.status}
                    </span>
                    <span>{formatTime(action.startTime)}</span>
                  </div>
                  {action.progress > 0 && action.progress < 100 && (
                    <div className="agent-action-progress">
                      <div
                        className="agent-action-progress-bar"
                        style={{ width: `${action.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AgentActionLog;
