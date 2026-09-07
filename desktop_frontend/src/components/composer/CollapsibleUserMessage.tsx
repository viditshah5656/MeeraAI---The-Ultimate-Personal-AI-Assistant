import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { nightOwl } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiCheck,
  FiEdit3,
  FiFileText,
  FiHash,
} from "react-icons/fi";
import "./smart-composer.css";

// ── Math / KaTeX Loader & Renderer ──────────────────────────────────────────
let katexLoaded = typeof window !== "undefined" && Boolean((window as any).katex);
let katexLoading = false;
const katexCallbacks: Array<() => void> = [];

function loadKaTeXOnDemand(onReady: () => void): void {
  if (typeof window === "undefined") return;
  if ((window as any).katex) {
    onReady();
    return;
  }
  katexCallbacks.push(onReady);
  if (katexLoading) return;
  katexLoading = true;

  const cssId = "katex-css";
  if (!document.getElementById(cssId)) {
    const link = document.createElement("link");
    link.id = cssId;
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
    document.head.appendChild(link);
  }

  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
  script.defer = true;
  script.onload = () => {
    katexLoaded = true;
    katexLoading = false;
    katexCallbacks.splice(0).forEach((cb) => cb());
  };
  script.onerror = () => {
    katexLoading = false;
  };
  document.head.appendChild(script);
}

function KaTeXMathRender({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const [ready, setReady] = useState(katexLoaded);

  useEffect(() => {
    if (!katexLoaded) {
      loadKaTeXOnDemand(() => setReady(true));
    }
  }, []);

  const html = useMemo(() => {
    if (!ready || typeof window === "undefined") return "";
    try {
      const katex = (window as any).katex;
      if (katex?.renderToString) {
        return katex.renderToString(latex, {
          throwOnError: false,
          displayMode,
          output: "html",
        });
      }
    } catch {
      // fallback to raw text
    }
    return "";
  }, [ready, latex, displayMode]);

  if (html) {
    return (
      <span
        className={displayMode ? "katex-display block my-2 overflow-x-auto py-1 text-center" : "katex-inline inline-block mx-1 align-baseline"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return displayMode ? (
    <pre className="p-2 my-1.5 bg-slate-900/80 rounded-md font-mono text-sky-300 text-xs border border-sky-500/20 overflow-x-auto">
      {`$$ ${latex} $$`}
    </pre>
  ) : (
    <code className="px-1.5 py-0.5 bg-slate-900/80 rounded font-mono text-sky-300 text-xs border border-sky-500/20">
      {`$${latex}$`}
    </code>
  );
}

// ── Code Block with Copy Button ─────────────────────────────────────────────
function CodeBlock({ language, value }: { language?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className="relative my-2 rounded-lg overflow-hidden border border-slate-700/50 bg-[#0d1424]">
      <div className="flex items-center justify-between px-3 py-1 bg-slate-800/60 border-b border-slate-700/40 text-[11px] text-slate-400 font-mono select-none">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <FiCheck className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <FiCopy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="text-xs">
        <SyntaxHighlighter
          language={language || "text"}
          style={nightOwl}
          customStyle={{
            margin: 0,
            padding: "12px",
            background: "transparent",
            fontSize: "12px",
            lineHeight: "1.5",
          }}
          wrapLongLines={false}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// ── Preprocess Math Syntax to prevent Markdown mangling ─────────────────────
function preprocessMarkdownForMath(text: string): string {
  if (!text) return "";
  // Transform $$ ... $$ into ```math ... ``` blocks
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => {
    return `\n\`\`\`math\n${eq.trim()}\n\`\`\`\n`;
  });
  // Transform $inline$ into `math-inline:formula` code spans
  result = result.replace(/(^|[^\\])\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (_, prefix, eq) => {
    return `${prefix}\`math-inline:${eq.trim()}\``;
  });
  return result;
}

// ── Markdown Components for Chat Messages ───────────────────────────────────
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const rawContent = String(children).replace(/\n$/, "");

    if (match && match[1] === "math") {
      return <KaTeXMathRender latex={rawContent} displayMode={true} />;
    }

    if (inline && typeof rawContent === "string" && rawContent.startsWith("math-inline:")) {
      const latex = rawContent.slice("math-inline:".length);
      return <KaTeXMathRender latex={latex} displayMode={false} />;
    }

    if (!inline && (match || rawContent.includes("\n"))) {
      return <CodeBlock language={match ? match[1] : undefined} value={rawContent} />;
    }

    return (
      <code
        className="px-1.5 py-0.5 rounded bg-slate-800/80 text-sky-300 font-mono text-[12px] border border-slate-700/40"
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-2 rounded-lg border border-slate-700/50">
        <table className="min-w-full text-xs text-left text-slate-200 border-collapse">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-slate-800/70 border-b border-slate-700/50 font-semibold">{children}</thead>;
  },
  tbody({ children }: any) {
    return <tbody className="divide-y divide-slate-800/50">{children}</tbody>;
  },
  tr({ children }: any) {
    return <tr className="hover:bg-slate-800/30 transition-colors">{children}</tr>;
  },
  th({ children }: any) {
    return <th className="px-3 py-2 text-slate-300 font-medium">{children}</th>;
  },
  td({ children }: any) {
    return <td className="px-3 py-2">{children}</td>;
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-2 border-sky-500/60 bg-sky-500/5 pl-3 pr-2 py-1 my-2 rounded-r text-slate-300 italic">
        {children}
      </blockquote>
    );
  },
  ul({ children }: any) {
    return <ul className="list-disc pl-5 my-1 space-y-0.5 text-slate-200">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal pl-5 my-1 space-y-0.5 text-slate-200">{children}</ol>;
  },
  p({ children }: any) {
    return <p className="mb-2 last:mb-0 leading-relaxed text-slate-100">{children}</p>;
  },
};

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
 * Wraps user messages in the chat feed to solve the problem of long user messages
 * taking up excessive vertical space and requiring endless scrolling.
 *
 * Provides:
 * - Line, character, and word count calculation
 * - Smart threshold detection (> 6 lines or > 260 chars or > 200px rendered height)
 * - Sleek collapsed state (max 180px) with bottom gradient fade overlay
 * - Smooth animated expand/collapse transition
 * - Clean custom scrollbar container (max 480px) so even a 2,000-line prompt never blows up the page
 * - Quick "Copy prompt" button with copied checkmark state
 * - "Edit prompt into composer" button callback
 * - Header badge showing word count and line count
 * - Markdown & KaTeX mathematical rendering
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

  // Compute text statistics
  const lineCount = useMemo(() => {
    if (!content) return 0;
    return content.split(/\r\n|\r|\n/).length;
  }, [content]);

  const charCount = useMemo(() => (content ? content.length : 0), [content]);

  const wordCount = useMemo(() => {
    const trimmed = (content || "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [content]);

  // Preprocess text for math rendering
  const processedContent = useMemo(() => {
    return preprocessMarkdownForMath(content || "");
  }, [content]);

  // Initial threshold check based on text properties
  const isHeuristicLong = lineCount > lineThreshold || charCount > charThreshold;

  // DOM height measurement check for wrapped lines
  useEffect(() => {
    if (contentWrapperRef.current) {
      const scrollH = contentWrapperRef.current.scrollHeight;
      if (scrollH > heightThreshold) {
        setMeasuredHeightExceeded(true);
      }
    }
  }, [content, heightThreshold]);

  const isLongMessage = isHeuristicLong || measuredHeightExceeded;

  // Copy prompt handler
  const handleCopyPrompt = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [content]);

  // Edit in composer handler
  const handleEditPrompt = useCallback(() => {
    if (onEditPrompt) {
      onEditPrompt(content);
    }
  }, [onEditPrompt, content]);

  // Toggle expand / collapse
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // If short message, render standard clean bubble without collapsible chrome
  if (!isLongMessage) {
    return (
      <div className={`relative group select-text ${className}`}>
        <div ref={contentWrapperRef} className="text-slate-100 text-[14px] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`collapsible-user-container group relative flex flex-col w-full rounded-xl overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Top Header Badge Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/70 border-b border-slate-700/40 text-[11px] text-slate-400 select-none">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-sky-400/90 border border-sky-500/20">
            <FiFileText className="w-3 h-3 text-sky-400" />
            <span>{wordCount} words</span>
            <span className="text-slate-600">•</span>
            <span>{lineCount} lines</span>
          </span>
          {timestamp && <span className="text-slate-500 text-[10px]">{timestamp}</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Edit prompt in composer */}
          {onEditPrompt && (
            <button
              type="button"
              onClick={handleEditPrompt}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-300 transition-colors"
              title="Edit prompt into composer"
              aria-label="Edit prompt in composer"
            >
              <FiEdit3 className="w-3 h-3" />
              <span className="text-[10px]">Edit</span>
            </button>
          )}

          {/* Quick Copy Prompt */}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Copy entire prompt"
            aria-label="Copy prompt"
          >
            {isCopied ? (
              <>
                <FiCheck className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <FiCopy className="w-3 h-3" />
                <span className="text-[10px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Content Area */}
      <motion.div
        layout
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{
          maxHeight: isExpanded ? maxExpandedHeight : maxCollapsedHeight,
        }}
        className={`relative w-full ${
          isExpanded
            ? "overflow-y-auto pr-1 collapsible-scroll"
            : "overflow-hidden"
        }`}
      >
        <div ref={contentWrapperRef} className="p-3 text-slate-100 text-[14px] leading-relaxed select-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {processedContent}
          </ReactMarkdown>
        </div>

        {/* Bottom Gradient Fade Overlay (collapsed state only) */}
        {!isExpanded && (
          <div
            className="collapsible-fade-overlay pointer-events-none absolute bottom-0 left-0 right-0 h-20"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, rgba(13, 20, 36, 0.96) 100%)",
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

        <span className="text-[10px] text-slate-500 font-mono">
          {isExpanded ? `Scroll enabled (max ${maxExpandedHeight}px)` : `Collapsed (${maxCollapsedHeight}px)`}
        </span>
      </div>
    </div>
  );
};

export default CollapsibleUserMessage;
