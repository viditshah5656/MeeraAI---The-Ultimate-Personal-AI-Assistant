import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiCheck,
  FiEdit3,
} from "react-icons/fi";
import "./smart-composer.css";
import { copyText } from "../../utils/clipboard";

// ── Props Interface ─────────────────────────────────────────────────────────
export interface CollapsibleUserMessageProps {
  /** The message text (raw or markdown) */
  content: string;
  /** Optional callback to edit this prompt back into the composer */
  onEditPrompt?: (content: string) => void;
  /** Optional additional class name for the container */
  className?: string;
  /** Maximum height in pixels when collapsed (default: 180) */
  maxCollapsedHeight?: number;
  /** Maximum height in pixels when expanded with scrollbar (default: 480) */
  maxExpandedHeight?: number;
  /** Line count threshold to trigger collapsible behavior (default: 6) */
  lineThreshold?: number;
  /** Character count threshold to trigger collapsible behavior (default: 260) */
  charThreshold?: number;
  /** Rendered pixel height threshold to trigger collapsible behavior (default: 200) */
  heightThreshold?: number;
  /** Optional timestamp or meta label */
  timestamp?: string;
  /** Force collapse initially (default: false) */
  defaultExpanded?: boolean;
}

/**
 * CollapsibleUserMessage
 *
 * Wraps user messages in the chat feed. Renders user text as clean plain text
 * (no markdown formatting) with a collapsible container for long messages.
 */
export const CollapsibleUserMessage: React.FC<CollapsibleUserMessageProps> = ({
  content,
  onEditPrompt,
  className = "",
  maxCollapsedHeight = 180,
  maxExpandedHeight = 480,
  lineThreshold = 6,
  charThreshold = 260,
  heightThreshold = 200,
  timestamp,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [measuredHeightExceeded, setMeasuredHeightExceeded] = useState<boolean>(false);
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  const cleanContent = useMemo(() => {
    if (!content) return "";
    let cleaned = content
      .replace(/\n*📝\s*FORMATTING MANDATE:[\s\S]*?(?:Do NOT skip any section[^\n]*|$)/gi, "")
      .replace(/\n*FORMATTING MANDATE:[\s\S]*?(?:Do NOT skip any section[^\n]*|$)/gi, "")
      .trim();

    // If the message is a massive raw context dump that was converted into a file
    if (cleaned.length > 800 && (cleaned.includes("| --- |") || cleaned.includes("|---|") || (cleaned.startsWith("|") && cleaned.length > 2000))) {
      const cellMatch = cleaned.match(/^\|\s*([^|\n]+?)\s*\|/);
      if (cellMatch && cellMatch[1].trim().length > 10 && cellMatch[1].trim().length < 250) {
        return cellMatch[1].trim();
      }
      const firstLine = cleaned.split(/\r?\n/)[0]?.replace(/^\|\s*/, "").split("|")[0]?.trim() || "";
      if (firstLine && firstLine.length > 5 && firstLine.length < 250) {
        return firstLine;
      }
      return "Prompt context attached as document.";
    }

    return cleaned;
  }, [content]);

  // Compute text statistics
  const lineCount = useMemo(() => {
    if (!cleanContent) return 0;
    return cleanContent.split(/\r\n|\r|\n/).length;
  }, [cleanContent]);

  const charCount = useMemo(() => (cleanContent ? cleanContent.length : 0), [cleanContent]);

  // Initial threshold check based on text properties
  const isHeuristicLong = lineCount > lineThreshold || charCount > charThreshold;

  // DOM height measurement check for wrapped lines
  // DOM height measurement check for wrapped lines
  useEffect(() => {
    if (contentWrapperRef.current) {
      const scrollH = contentWrapperRef.current.scrollHeight;
      if (scrollH > heightThreshold) {
        setMeasuredHeightExceeded(true);
      }
    }
  }, [cleanContent, heightThreshold]);

  const isLongMessage = isHeuristicLong || measuredHeightExceeded;

  // Copy prompt handler
  const handleCopyPrompt = useCallback(async () => {
    if (!cleanContent) return;
    if (await copyText(cleanContent)) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [cleanContent]);

  // Toggle expand / collapse
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // If short message, render clean plain text without collapsible chrome
  if (!isLongMessage) {
    return (
      <div className={`relative select-text w-full overflow-hidden ${className}`}>
        <div
          ref={contentWrapperRef}
          className="text-slate-100 text-[14px] leading-relaxed break-words"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" }}
        >
          {cleanContent}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`collapsible-user-container group relative flex flex-col w-full rounded-xl overflow-hidden transition-all duration-200 ${className}`}
      style={{ boxSizing: "border-box", maxWidth: "100%" }}
    >
      {/* Collapsible Content Area */}
      <motion.div
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{
          maxHeight: isExpanded ? maxExpandedHeight : maxCollapsedHeight,
          overflow: isExpanded ? "auto" : "hidden",
        }}
        className={`relative w-full ${
          isExpanded
            ? "overflow-y-auto pr-1 collapsible-scroll"
            : "overflow-hidden"
        }`}
      >
        <div
          ref={contentWrapperRef}
          className="p-3 text-slate-100 text-[14px] leading-relaxed select-text break-words"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" }}
        >
          {cleanContent}
        </div>

        {/* Bottom Gradient Fade Overlay (collapsed state only) */}
        {!isExpanded && (
          <div
            className="collapsible-fade-overlay pointer-events-none absolute bottom-0 left-0 right-0 h-16"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, rgba(13, 20, 36, 0.98) 100%)",
            }}
          />
        )}
      </motion.div>

      {/* Interactive Toggle Button Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-t border-slate-700/30 text-xs">
        <button
          type="button"
          onClick={handleToggle}
          className="collapsible-toggle-btn inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 text-[11px] font-medium transition-all shadow-sm"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              <FiChevronUp className="w-3.5 h-3.5" />
              <span>Show less</span>
            </>
          ) : (
            <>
              <FiChevronDown className="w-3.5 h-3.5" />
              <span>
                Show more ({lineCount > lineThreshold ? `${lineCount} lines` : `${charCount} chars`})
              </span>
            </>
          )}
        </button>

        <div className="flex items-center gap-1.5">
          {onEditPrompt && (
            <button
              type="button"
              onClick={() => onEditPrompt(content)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-300 transition-colors"
              title="Edit prompt"
              aria-label="Edit prompt"
            >
              <FiEdit3 className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Copy prompt"
            aria-label="Copy prompt"
          >
            {isCopied ? (
              <FiCheck className="w-3 h-3 text-emerald-400" />
            ) : (
              <FiCopy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CollapsibleUserMessage;
