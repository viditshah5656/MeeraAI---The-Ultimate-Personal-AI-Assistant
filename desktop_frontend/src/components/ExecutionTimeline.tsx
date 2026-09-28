import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from 'react-markdown';
import { copyText } from "../utils/clipboard";
import {
  MdAutoAwesome,
  MdError,
} from "react-icons/md";
import {
  LuChevronRight,
  LuSearch, LuGlobe, LuTerminal, LuCode,
  LuFileText, LuBrain, LuLink, LuInfo,
  LuCheck, LuLoader, LuLayers, LuLightbulb
} from "react-icons/lu";
import type { ExecutionEvent, ExecutionStatus } from "../App";

interface ExecutionNode extends ExecutionEvent {
  children: ExecutionNode[];
}

interface ExecutionTimelineProps {
  events: Record<string, ExecutionEvent>;
  inline?: boolean;
}

/* ------------------------------------------------------------------ */
/* Icon selection                                                      */
/* ------------------------------------------------------------------ */

const getIconForNode = (title: string, tool?: string) => {
  const t = (title || "").toLowerCase();
  const k = (tool || "").toLowerCase();

  if (k.includes("bash") || k.includes("terminal") || k.includes("shell") || k.includes("powershell") || k.includes("cmd")) return LuTerminal;
  if (k.includes("python") || k.includes("code")) return LuCode;
  if (t.includes("search") || t.includes("query") || k.includes("search")) return LuSearch;
  if (t.includes("found") || t.includes("web") || t.includes("browse") || t.includes("wiki") || t.includes("url") || t.includes("http")) return LuGlobe;
  if (t.includes("extract") || t.includes("read") || t.includes("file") || t.includes("data")) return LuFileText;
  if (t.includes("link")) return LuLink;
  if (t.includes("plan") || t.includes("step") || t.includes("phase")) return LuLayers;
  if (t.includes("generat") || t.includes("response") || t.includes("think") || t.includes("reason")) return LuBrain;
  if (t.includes("connect") || t.includes("model") || t.includes("initializ")) return LuLightbulb;
  if (t.includes("done") || t.includes("complete") || t.includes("success") || t.includes("finish")) return LuCheck;

  return LuInfo;
};

/* Does this node look like a shell/code invocation with output, so it
   should render as a dark terminal card rather than a plain markdown block. */
const isTerminalLike = (node: ExecutionNode) => {
  const k = (node.tool || "").toLowerCase();
  if (k.includes("bash") || k.includes("terminal") || k.includes("shell") || k.includes("powershell") || k.includes("cmd") || k.includes("python")) return true;
  if (!node.metadata) return false;
  const keys = Object.keys(node.metadata).map(x => x.toLowerCase());
  return keys.some(k2 => ["command", "output", "code", "stdout", "script"].includes(k2));
};

/* ------------------------------------------------------------------ */
/* Terminal-style metadata card (mirrors .claude-toolcall visuals)     */
/* ------------------------------------------------------------------ */

const TerminalMetaCard: React.FC<{ node: ExecutionNode }> = ({ node }) => {
  const [cmdCopied, setCmdCopied] = useState(false);
  const [outCopied, setOutCopied] = useState(false);
  const meta = node.metadata || {};

  const commandEntry = Object.entries(meta).find(([k]) =>
    ["command", "code", "script"].includes(k.toLowerCase())
  );
  const outputEntry = Object.entries(meta).find(([k]) =>
    ["output", "stdout", "result"].includes(k.toLowerCase())
  );
  const rest = Object.entries(meta).filter(
    ([k]) => k !== commandEntry?.[0] && k !== outputEntry?.[0]
  );

  const copy = async (text: string, which: "cmd" | "out") => {
    try {
      if (!(await copyText(text))) return;
      if (which === "cmd") { setCmdCopied(true); setTimeout(() => setCmdCopied(false), 1200); }
      else { setOutCopied(true); setTimeout(() => setOutCopied(false), 1200); }
    } catch { /* ignore */ }
  };

  const shellLabel = (node.tool || "shell").toUpperCase();

  return (
    <div className="et-terminal-card">
      <div className="et-terminal-card-header">
        <LuTerminal className="et-terminal-icon" aria-hidden="true" />
        <span className="et-terminal-preview">
          {typeof commandEntry?.[1] === "string" ? commandEntry[1] : node.title}
        </span>
      </div>

      <div className="et-terminal-body">
        {commandEntry && (
          <div className="et-terminal-section">
            <div className="et-terminal-section-head">
              <span>{shellLabel}</span>
              <button type="button" onClick={() => copy(String(commandEntry[1]), "cmd")} aria-label="Copy command">
                {cmdCopied ? <LuCheck size={12} /> : <span className="et-copy-label">Copy</span>}
              </button>
            </div>
            <pre className="et-terminal-code">{String(commandEntry[1])}</pre>
          </div>
        )}

        {outputEntry && (
          <div className="et-terminal-section">
            <div className="et-terminal-section-head">
              <span>OUTPUT</span>
              <button type="button" onClick={() => copy(String(outputEntry[1]), "out")} aria-label="Copy output">
                {outCopied ? <LuCheck size={12} /> : <span className="et-copy-label">Copy</span>}
              </button>
            </div>
            <pre className="et-terminal-output">{String(outputEntry[1]) || "No output."}</pre>
          </div>
        )}

        {rest.map(([key, value]) => (
          <div className="et-terminal-section" key={key}>
            <div className="et-terminal-section-head">
              <span>{key.replace(/_/g, " ").toUpperCase()}</span>
            </div>
            <div className="et-terminal-note markdown-body">
              {typeof value === "string" ? (
                <ReactMarkdown>{value}</ReactMarkdown>
              ) : (
                <pre className="et-terminal-output">{JSON.stringify(value, null, 2)}</pre>
              )}
            </div>
          </div>
        ))}

        <div className="et-terminal-footer">
          {(node.status === "completed") && (
            <span className="et-terminal-done"><LuCheck size={12} aria-hidden="true" /> Done</span>
          )}
          {((node.status as string) === "error" || node.status === "failed") && (
            <span className="et-terminal-failed"><MdError size={12} aria-hidden="true" /> Failed</span>
          )}
          {(node.status === "running") && (
            <span className="et-terminal-running"><LuLoader size={12} className="et-spin" aria-hidden="true" /> Running</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Plain metadata (non-terminal) rendered as compact markdown          */
/* ------------------------------------------------------------------ */

const PlainMetaCard: React.FC<{ node: ExecutionNode }> = ({ node }) => (
  <div className="et-meta-card">
    {Object.entries(node.metadata!).map(([key, value]) => (
      <div className="et-meta-row" key={key}>
        {Object.keys(node.metadata!).length > 1 && (
          <span className="et-meta-key">{key.replace(/_/g, " ")}</span>
        )}
        <div className="et-meta-value markdown-body">
          {typeof value === "string" ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <pre className="et-terminal-output">{JSON.stringify(value, null, 2)}</pre>
          )}
        </div>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Single node row (recursive)                                         */
/* ------------------------------------------------------------------ */

const ExecutionNodeView: React.FC<{
  node: ExecutionNode;
  depth: number;
  index?: number;
}> = ({ node, depth, index = 0 }) => {
  const hasChildren = node.children.length > 0;
  const hasDetails = !!(node.metadata && Object.keys(node.metadata).length > 0);
  const canExpand = hasChildren || hasDetails;

  // Collapsed by default except: top-level heading rows always show their
  // children; anything actively running or errored auto-opens; leaf detail
  // drawers (terminal/metadata) stay collapsed until the user asks for them.
  const defaultOpen =
    depth === 0 ||
    node.status === "running" ||
    (node.status as string) === "error" ||
    node.status === "failed";

  const [childrenOpen, setChildrenOpen] = useState(hasChildren ? defaultOpen : false);
  const [detailsOpen, setDetailsOpen] = useState(hasDetails ? (node.status === "running" || (node.status as string) === "error" || node.status === "failed") : false);

  React.useEffect(() => {
    if (node.status === "completed") {
      setChildrenOpen(false);
      setDetailsOpen(false);
    }
  }, [node.status]);

  const isHeading = depth === 0;
  const Icon = getIconForNode(node.title, node.tool);
  const terminal = hasDetails && isTerminalLike(node);

  const statusIcon = () => {
    if (node.status === "running") return <LuLoader size={isHeading ? 13 : 12} className="et-spin" />;
    if ((node.status as string) === "error" || node.status === "failed") return <MdError size={isHeading ? 13 : 12} />;
    return <Icon size={isHeading ? 13 : 12} />;
  };

  return (
    <div className={`et-node et-depth-${Math.min(depth, 3)}`}>
      <div
        className={`et-row ${isHeading ? "et-row-heading" : "et-row-sub"} et-status-${node.status}`}
        onClick={() => {
          if (hasChildren) setChildrenOpen(o => !o);
          else if (hasDetails) setDetailsOpen(o => !o);
        }}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
      >
        <span className={`et-row-icon et-icon-${node.status}`}>{statusIcon()}</span>

        <span className="et-row-title">{node.title}</span>

        {node.description && !isHeading && (
          <span className="et-row-desc">{node.description}</span>
        )}

        {canExpand && (
          <motion.span
            className="et-row-caret"
            animate={{ rotate: (hasChildren ? childrenOpen : detailsOpen) ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <LuChevronRight size={12} />
          </motion.span>
        )}
      </div>

      {isHeading && node.description && (
        <div className="et-heading-desc">{node.description}</div>
      )}

      {/* Detail drawer for leaf nodes (terminal card or plain metadata) */}
      {hasDetails && !hasChildren && (
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              className="et-details-wrap"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              {terminal ? <TerminalMetaCard node={node} /> : <PlainMetaCard node={node} />}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Children */}
      {hasChildren && (
        <AnimatePresence initial={false}>
          {childrenOpen && (
            <motion.div
              className="et-children"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div className="et-children-inner">
                {node.children.map((child, i) => (
                  <ExecutionNodeView key={child.id} node={child} depth={depth + 1} index={i} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* If a heading also carries its own details (rare), show them too */}
      {isHeading && hasDetails && hasChildren && (
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              className="et-details-wrap"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              {terminal ? <TerminalMetaCard node={node} /> : <PlainMetaCard node={node} />}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Root                                                                 */
/* ------------------------------------------------------------------ */

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({ events, inline }) => {
  const rootNodes = useMemo(() => {
    const nodes: Record<string, ExecutionNode> = {};
    const roots: ExecutionNode[] = [];

    Object.values(events).forEach(event => {
      nodes[event.id] = { ...event, children: [] };
    });

    Object.values(nodes).forEach(node => {
      if (node.parent && nodes[node.parent]) {
        nodes[node.parent].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (n: ExecutionNode[]) => {
      n.sort((a, b) => a.timestamp - b.timestamp);
      n.forEach(child => sortNodes(child.children));
    };

    sortNodes(roots);
    return roots;
  }, [events]);

  return (
    <div className="et-root" style={inline ? { background: "transparent", border: "none", boxShadow: "none", padding: 0 } : {}}>
      {!inline && (
        <div className="et-header">
          <div className="et-header-icon">
            <MdAutoAwesome size={13} />
          </div>
          <span>Execution Engine</span>
          {rootNodes.length > 0 && (
            <span className="et-header-count">{Object.keys(events).length} events</span>
          )}
        </div>
      )}

      <div className="et-list">
        {rootNodes.length === 0 ? (
          <div className="et-empty">Execution timeline will appear here as the AI plans and acts.</div>
        ) : (
          rootNodes.map((node, i) => (
            <ExecutionNodeView key={node.id} node={node} depth={0} index={i} />
          ))
        )}
      </div>
    </div>
  );
};

export default ExecutionTimeline;
