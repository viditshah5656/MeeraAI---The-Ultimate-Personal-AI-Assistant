import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LuSearch,
  LuGlobe,
  LuTerminal,
  LuCode,
  LuFileText,
  LuBrain,
  LuLink,
  LuLayers,
  LuCheck,
  LuX,
  LuChevronDown,
  LuChevronUp,
  LuClock,
  LuExternalLink,
  LuCopy,
  LuSparkles
} from "react-icons/lu";
import { copyText } from "../utils/clipboard";

export type AgentStatus =
  | "queued"
  | "running"
  | "searching"
  | "synthesizing"
  | "completed"
  | "failed";

export interface AgentStepTrace {
  timestamp: string;
  type: "search" | "fetch" | "reasoning" | "synthesis" | "tool" | "done" | "info";
  message: string;
  detail?: string;
  query?: string;
  url?: string;
}

export interface SwarmAgentState {
  id: string;
  name: string;
  role: string;
  task: string;
  status: AgentStatus;
  progress: number; // 0 to 100
  startTime?: number;
  endTime?: number;
  elapsedSeconds?: number;
  searchQueries?: string[];
  sources?: { title?: string; url: string }[];
  steps?: AgentStepTrace[];
  chapterDraft?: string;
  characterCount?: number;
  citationCount?: number;
  error?: string;
}

export interface SwarmMonitorState {
  swarmId?: string;
  title?: string;
  topic?: string;
  status: "idle" | "running" | "completed" | "partial_failure";
  agents: SwarmAgentState[];
  totalProgress: number; // 0 to 100
  elapsedSeconds?: number;
  startTime?: number;
  endTime?: number;
}

export interface AgentSwarmMonitorProps {
  monitor: SwarmMonitorState;
  onAgentClick?: (agent: SwarmAgentState) => void;
  className?: string;
}

function getAgentRoleIcon(role: string): React.ReactNode {
  const r = (role || "").toLowerCase();
  if (r.includes("search") || r.includes("retriev") || r.includes("investigat")) {
    return <LuSearch size={14} />;
  }
  if (r.includes("code") || r.includes("developer") || r.includes("engineer")) {
    return <LuCode size={14} />;
  }
  if (r.includes("web") || r.includes("browser") || r.includes("scrap")) {
    return <LuGlobe size={14} />;
  }
  if (r.includes("terminal") || r.includes("system") || r.includes("bash")) {
    return <LuTerminal size={14} />;
  }
  if (r.includes("doc") || r.includes("writer") || r.includes("author") || r.includes("editor")) {
    return <LuFileText size={14} />;
  }
  if (r.includes("deep") || r.includes("reason") || r.includes("analyst") || r.includes("architect")) {
    return <LuBrain size={14} />;
  }
  return <LuLayers size={14} />;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export const AgentSwarmMonitor: React.FC<AgentSwarmMonitorProps> = ({
  monitor,
  onAgentClick,
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<SwarmAgentState | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<"steps" | "sources" | "chapter">("steps");
  const [copiedChapter, setCopiedChapter] = useState(false);

  // Keep track of live active agent in inspector if updated
  useEffect(() => {
    if (selectedAgent) {
      const fresh = monitor.agents.find((a) => a.id === selectedAgent.id);
      if (fresh) {
        setSelectedAgent(fresh);
      }
    }
  }, [monitor.agents]);

  // Handle escape key to close inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedAgent) {
        setSelectedAgent(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAgent]);

  const agents = monitor.agents || [];
  const completedCount = useMemo(
    () => agents.filter((a) => a.status === "completed").length,
    [agents]
  );
  const runningCount = useMemo(
    () => agents.filter((a) => a.status === "running" || a.status === "searching" || a.status === "synthesizing").length,
    [agents]
  );
  const isAllCompleted = agents.length > 0 && completedCount === agents.length;
  const isRunning = runningCount > 0;

  const handleOpenInspector = useCallback((agent: SwarmAgentState, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAgent(agent);
    // Auto-select best initial tab
    if (agent.chapterDraft) {
      setActiveInspectorTab("chapter");
    } else if (agent.steps && agent.steps.length > 0) {
      setActiveInspectorTab("steps");
    } else {
      setActiveInspectorTab("sources");
    }
    if (onAgentClick) onAgentClick(agent);
  }, [onAgentClick]);

  const handleCopyChapter = useCallback(async () => {
    if (!selectedAgent?.chapterDraft) return;
    if (await copyText(selectedAgent.chapterDraft)) {
      setCopiedChapter(true);
      setTimeout(() => setCopiedChapter(false), 1600);
    }
  }, [selectedAgent?.chapterDraft]);

  if (!agents || agents.length === 0) {
    return null;
  }

  return (
    <div className={`swarm-monitor-container ${className}`}>
      {/* Header */}
      <div
        className="swarm-monitor-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="swarm-header-left">
          <div className="swarm-icon-pulse">
            <LuSparkles size={16} />
            <div className={`swarm-pulse-dot ${isRunning ? "running" : ""}`} />
          </div>
          <div className="swarm-title-wrap">
            <div className="swarm-title-text">
              <span>{monitor.title || "Autonomous Multi-Agent Swarm"}</span>
            </div>
            <div className="swarm-subtitle-text">
              {agents.length} agent{agents.length > 1 ? "s" : ""} coordinated
              {monitor.topic ? ` • ${monitor.topic}` : ""}
            </div>
          </div>
        </div>

        <div className="swarm-header-right">
          {isAllCompleted ? (
            <span className="swarm-stat-badge completed">
              <LuCheck size={12} />
              <span>{completedCount}/{agents.length} Completed</span>
            </span>
          ) : (
            <span className={`swarm-stat-badge ${isRunning ? "active" : ""}`}>
              <span>
                {completedCount}/{agents.length} Completed
                {runningCount > 0 ? ` • ${runningCount} Active` : ""}
              </span>
            </span>
          )}

          <button
            type="button"
            className="swarm-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-label={isExpanded ? "Collapse swarm" : "Expand swarm"}
          >
            {isExpanded ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Global Progress Track */}
      <div className="swarm-progress-track-global">
        <div
          className="swarm-progress-bar-global"
          style={{ width: `${Math.min(100, Math.max(0, monitor.totalProgress))}%` }}
        />
      </div>

      {/* Body / Cards Grid */}
      {isExpanded && (
        <div className="swarm-monitor-body">
          <div className="swarm-grid">
            {agents.map((agent) => {
              const roleIcon = getAgentRoleIcon(agent.role);
              const isActive =
                agent.status === "running" ||
                agent.status === "searching" ||
                agent.status === "synthesizing";
              const isCompleted = agent.status === "completed";
              const isFailed = agent.status === "failed";
              const queryCount = agent.searchQueries?.length || 0;
              const sourceCount = agent.sources?.length || 0;

              return (
                <div
                  key={agent.id}
                  className={`swarm-card ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""} ${isFailed ? "failed" : ""}`}
                  onClick={() => handleOpenInspector(agent)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Card Header */}
                  <div className="swarm-card-header">
                    <div className="swarm-card-avatar-wrap">
                      <div className="swarm-agent-icon">{roleIcon}</div>
                      <span className="swarm-agent-role" title={agent.role || agent.name}>
                        {agent.role || agent.name}
                      </span>
                    </div>

                    <span className={`swarm-status-pill ${agent.status}`}>
                      {agent.status}
                    </span>
                  </div>

                  {/* Card Task / Mandate */}
                  <div className="swarm-card-task" title={agent.task}>
                    {agent.task || "Analyzing research directive and gathering intelligence..."}
                  </div>

                  {/* Card Progress Bar */}
                  <div className="swarm-card-progress-wrap">
                    <div className="swarm-card-progress-track">
                      <div
                        className="swarm-card-progress-bar"
                        style={{ width: `${Math.min(100, Math.max(0, agent.progress))}%` }}
                      />
                    </div>
                  </div>

                  {/* Card Meta & Action */}
                  <div className="swarm-card-meta">
                    <div className="swarm-card-metric">
                      <LuClock size={11} />
                      <span>{formatDuration(agent.elapsedSeconds)}</span>
                    </div>

                    {(queryCount > 0 || sourceCount > 0) && (
                      <div className="swarm-card-metric" title={`${queryCount} queries, ${sourceCount} sources`}>
                        <LuGlobe size={11} />
                        <span>{queryCount + sourceCount} refs</span>
                      </div>
                    )}

                    <div className="swarm-inspect-badge">
                      <span>Inspect</span>
                      <LuExternalLink size={10} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deep Inspector Modal */}
      {selectedAgent && (
        <div className="swarm-inspector-overlay" onClick={() => setSelectedAgent(null)}>
          <div
            className="swarm-inspector-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Inspector Header */}
            <div className="swarm-inspector-header">
              <div className="swarm-inspector-title">
                <div className="swarm-agent-icon">
                  {getAgentRoleIcon(selectedAgent.role)}
                </div>
                <div>
                  <div className="swarm-inspector-name">
                    {selectedAgent.role || selectedAgent.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--swarm-text-muted)", marginTop: "2px" }}>
                    ID: {selectedAgent.id} • Status: {selectedAgent.status.toUpperCase()} • Duration: {formatDuration(selectedAgent.elapsedSeconds)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`swarm-status-pill ${selectedAgent.status}`}>
                  {selectedAgent.status}
                </span>
                <button
                  type="button"
                  className="swarm-inspector-close"
                  onClick={() => setSelectedAgent(null)}
                  aria-label="Close inspector"
                >
                  <LuX size={16} />
                </button>
              </div>
            </div>

            {/* Inspector Tabs */}
            <div className="swarm-inspector-tabs">
              <button
                type="button"
                className={`swarm-tab-btn ${activeInspectorTab === "steps" ? "active" : ""}`}
                onClick={() => setActiveInspectorTab("steps")}
              >
                Cognitive Trace ({selectedAgent.steps?.length || 0})
              </button>
              <button
                type="button"
                className={`swarm-tab-btn ${activeInspectorTab === "sources" ? "active" : ""}`}
                onClick={() => setActiveInspectorTab("sources")}
              >
                Sources & Queries ({(selectedAgent.searchQueries?.length || 0) + (selectedAgent.sources?.length || 0)})
              </button>
              <button
                type="button"
                className={`swarm-tab-btn ${activeInspectorTab === "chapter" ? "active" : ""}`}
                onClick={() => setActiveInspectorTab("chapter")}
              >
                Synthesized Output {selectedAgent.chapterDraft ? "✓" : ""}
              </button>
            </div>

            {/* Inspector Body */}
            <div className="swarm-inspector-body">
              {/* Tab 1: Cognitive Trace / Steps */}
              {activeInspectorTab === "steps" && (
                <div className="swarm-step-list">
                  {(!selectedAgent.steps || selectedAgent.steps.length === 0) ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "var(--swarm-text-muted)" }}>
                      No granular trace steps recorded yet. Agent is initializing or running background operations.
                    </div>
                  ) : (
                    selectedAgent.steps.map((step, idx) => (
                      <div key={idx} className="swarm-step-item">
                        <div className="swarm-step-icon">
                          {step.type === "search" ? <LuSearch size={14} /> :
                           step.type === "fetch" ? <LuGlobe size={14} /> :
                           step.type === "synthesis" ? <LuSparkles size={14} /> :
                           step.type === "done" ? <LuCheck size={14} color="#10b981" /> :
                           <LuTerminal size={14} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="swarm-step-desc">{step.message}</div>
                          {step.detail && (
                            <div style={{ fontSize: "11px", color: "var(--swarm-text-muted)", marginTop: "4px" }}>
                              {step.detail}
                            </div>
                          )}
                        </div>
                        <div className="swarm-step-time">{step.timestamp || ""}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Sources & Queries */}
              {activeInspectorTab === "sources" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--swarm-text-muted)", marginBottom: "8px" }}>
                      Search Queries Executed ({selectedAgent.searchQueries?.length || 0})
                    </h4>
                    {(!selectedAgent.searchQueries || selectedAgent.searchQueries.length === 0) ? (
                      <div style={{ fontSize: "12px", color: "var(--swarm-text-muted)" }}>No search queries dispatched.</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {selectedAgent.searchQueries.map((q, idx) => (
                          <span
                            key={idx}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "rgba(99, 102, 241, 0.12)",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                              color: "#a5b4fc",
                              fontSize: "11px"
                            }}
                          >
                            <LuSearch size={11} /> {q}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--swarm-text-muted)", marginBottom: "8px" }}>
                      Sources & Evidence Gathered ({selectedAgent.sources?.length || 0})
                    </h4>
                    {(!selectedAgent.sources || selectedAgent.sources.length === 0) ? (
                      <div style={{ fontSize: "12px", color: "var(--swarm-text-muted)" }}>No external source links indexed yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {selectedAgent.sources.map((s, idx) => (
                          <a
                            key={idx}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              background: "rgba(255, 255, 255, 0.03)",
                              border: "1px solid var(--swarm-border)",
                              color: "var(--swarm-text-primary)",
                              fontSize: "12px",
                              textDecoration: "none"
                            }}
                          >
                            <LuLink size={13} color="var(--swarm-cyan)" />
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.title || s.url}
                            </span>
                            <LuExternalLink size={12} color="var(--swarm-text-muted)" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Synthesized Chapter */}
              {activeInspectorTab === "chapter" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "12px", color: "var(--swarm-text-muted)" }}>
                      {selectedAgent.characterCount ? `${selectedAgent.characterCount} characters` : ""}
                      {selectedAgent.citationCount ? ` • ${selectedAgent.citationCount} citations` : ""}
                    </div>
                    {selectedAgent.chapterDraft && (
                      <button
                        type="button"
                        className="doc-action-btn"
                        style={{ maxWidth: "140px" }}
                        onClick={handleCopyChapter}
                      >
                        {copiedChapter ? <LuCheck size={12} color="#10b981" /> : <LuCopy size={12} />}
                        <span>{copiedChapter ? "Copied Chapter!" : "Copy Markdown"}</span>
                      </button>
                    )}
                  </div>

                  <div className="swarm-chapter-container">
                    {selectedAgent.chapterDraft || "Chapter synthesis in progress. The autonomous agent is processing research notes..."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSwarmMonitor;
