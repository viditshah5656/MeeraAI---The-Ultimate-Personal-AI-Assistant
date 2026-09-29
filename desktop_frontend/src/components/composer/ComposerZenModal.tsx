import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { nightOwl } from "react-syntax-highlighter/dist/esm/styles/prism";
import { copyText } from "../../utils/clipboard";
import {
  FiX,
  FiSend,
  FiCheck,
  FiSearch,
  FiCode,
  FiGrid,
  FiList,
  FiCheckSquare,
  FiColumns,
  FiEye,
  FiEdit2,
  FiBold,
  FiItalic,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiTrash2,
  FiCornerDownLeft,
  FiFileText,
  FiCpu,
  FiClock,
  FiMaximize2,
} from "react-icons/fi";
import "./smart-composer.css";

// ── Math / KaTeX Loader & Renderer ──────────────────────────────────────────
let zenKatexLoaded = typeof window !== "undefined" && Boolean((window as any).katex);
let zenKatexLoading = false;
const zenKatexCallbacks: Array<() => void> = [];

function loadKaTeXForZen(onReady: () => void): void {
  if (typeof window === "undefined") return;
  if ((window as any).katex) {
    onReady();
    return;
  }
  zenKatexCallbacks.push(onReady);
  if (zenKatexLoading) return;
  zenKatexLoading = true;

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
    zenKatexLoaded = true;
    zenKatexLoading = false;
    zenKatexCallbacks.splice(0).forEach((cb) => cb());
  };
  script.onerror = () => {
    zenKatexLoading = false;
  };
  document.head.appendChild(script);
}

function KaTeXMathPreview({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const [ready, setReady] = useState(zenKatexLoaded);

  useEffect(() => {
    if (!zenKatexLoaded) {
      loadKaTeXForZen(() => setReady(true));
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
      // Fallback
    }
    return "";
  }, [ready, latex, displayMode]);

  if (html) {
    return (
      <span
        className={displayMode ? "katex-display block my-2.5 overflow-x-auto py-1 text-center" : "katex-inline inline-block mx-1 align-baseline"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return displayMode ? (
    <pre className="p-2 my-2 bg-slate-900/90 rounded-md font-mono text-sky-300 text-xs border border-sky-500/20 overflow-x-auto">
      {`$$ ${latex} $$`}
    </pre>
  ) : (
    <code className="px-1.5 py-0.5 bg-slate-900/90 rounded font-mono text-sky-300 text-xs border border-sky-500/20">
      {`$${latex}$`}
    </code>
  );
}

// ── Code Block with Copy ────────────────────────────────────────────────────
function ZenCodeBlock({ language, value }: { language?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative my-2.5 rounded-lg overflow-hidden border border-slate-700/60 bg-[#090e1a]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50 text-[11px] text-slate-400 font-mono select-none">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-white transition-colors"
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

// ── Preprocess Math for Markdown Preview ────────────────────────────────────
function preprocessMathForPreview(text: string): string {
  if (!text) return "";
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => {
    return `\n\`\`\`math\n${eq.trim()}\n\`\`\`\n`;
  });
  result = result.replace(/(^|[^\\])\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (_, prefix, eq) => {
    return `${prefix}\`math-inline:${eq.trim()}\``;
  });
  return result;
}

const zenMarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const rawContent = String(children).replace(/\n$/, "");

    if (match && match[1] === "math") {
      return <KaTeXMathPreview latex={rawContent} displayMode={true} />;
    }

    if (inline && typeof rawContent === "string" && rawContent.startsWith("math-inline:")) {
      const latex = rawContent.slice("math-inline:".length);
      return <KaTeXMathPreview latex={latex} displayMode={false} />;
    }

    if (!inline && (match || rawContent.includes("\n"))) {
      return <ZenCodeBlock language={match ? match[1] : undefined} value={rawContent} />;
    }

    return (
      <code
        className="px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-300 font-mono text-[12px] border border-slate-700/50"
        {...props}
      >
        {children}
      </code>
    );
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-3 rounded-lg border border-slate-700/60 bg-slate-900/40">
        <table className="min-w-full text-xs text-left text-slate-200 border-collapse">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-slate-800/80 border-b border-slate-700/60 font-semibold">{children}</thead>;
  },
  tbody({ children }: any) {
    return <tbody className="divide-y divide-slate-800/60">{children}</tbody>;
  },
  tr({ children }: any) {
    return <tr className="hover:bg-slate-800/40 transition-colors">{children}</tr>;
  },
  th({ children }: any) {
    return <th className="px-3 py-2 text-slate-200 font-medium">{children}</th>;
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
      <blockquote className="border-l-3 border-sky-500/70 bg-sky-500/10 pl-3.5 pr-2 py-1.5 my-2.5 rounded-r text-slate-300 italic">
        {children}
      </blockquote>
    );
  },
  ul({ children }: any) {
    return <ul className="list-disc pl-5 my-1.5 space-y-1 text-slate-200">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="list-decimal pl-5 my-1.5 space-y-1 text-slate-200">{children}</ol>;
  },
  p({ children }: any) {
    return <p className="mb-2.5 last:mb-0 leading-relaxed text-slate-100">{children}</p>;
  },
  h1({ children }: any) {
    return (
      <h1 className="text-xl font-bold text-white mt-4 mb-2 pb-1 border-b border-slate-700/50">
        {children}
      </h1>
    );
  },
  h2({ children }: any) {
    return (
      <h2 className="text-lg font-bold text-sky-200 mt-3 mb-1.5 pb-1 border-b border-slate-700/40">
        {children}
      </h2>
    );
  },
  h3({ children }: any) {
    return <h3 className="text-base font-semibold text-slate-100 mt-2 mb-1">{children}</h3>;
  },
};

// ── Types ───────────────────────────────────────────────────────────────────
export type ZenViewMode = "split" | "editor" | "preview";

export interface ComposerZenModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Modal close callback (Escape, Close button, Done) */
  onClose: () => void;
  /** Current prompt draft string */
  value?: string;
  /** Initial prompt draft string when opening modal */
  initialText?: string;
  /** Callback fired whenever draft changes */
  onChange?: (value: string) => void;
  /** Primary submission callback fired on "Send to Meera" or Cmd/Ctrl+Enter */
  onSubmit?: (value: string) => void;
  /** Alternate submission handler called on send */
  onApplyAndSend?: (value: string) => void;
  /** Draft save callback */
  onSaveDraft?: (value: string) => void;
  /** Optional placeholder for the textarea editor */
  placeholder?: string;
  /** Optional modal title override (default: "Zen Composer") */
  title?: string;
}

/**
 * ComposerZenModal
 *
 * Fullscreen / Zen mode workspace modal for drafting, structuring, and editing
 * large prompts without feeling cramped in a tiny input box.
 *
 * Features:
 * - Controlled open/close via isOpen & onClose props (supports Alt+Z)
 * - Split-pane layout (Split, Editor Only, Preview Only) with responsive behavior
 * - Multi-line textarea editor with synchronized line numbers gutter and auto-indent
 * - Real-time live Markdown & KaTeX mathematical preview
 * - In-editor Find & Replace bar (Ctrl+F / Cmd+F) with match navigation and Replace All
 * - Live stats bar: Words, Chars, Lines, Token Estimate, Reading Time, and Token Gauge
 * - Quick Insert tools: Code blocks, Markdown tables, KaTeX formulas, Bullet/Check lists
 * - Keyboard shortcut handler (Escape to close, Cmd/Ctrl+Enter to submit, Ctrl+F to find)
 * - "Send to Meera" primary gradient action button & "Done / Apply" button
 */
export const ComposerZenModal: React.FC<ComposerZenModalProps> = ({
  isOpen,
  onClose,
  value,
  initialText,
  onChange,
  onSubmit,
  onApplyAndSend,
  onSaveDraft,
  placeholder = "Draft your comprehensive prompt, code architecture, or query here...",
  title = "Zen Composer",
}) => {
  const [internalDraft, setInternalDraft] = useState<string>(() => value ?? initialText ?? "");

  useEffect(() => {
    if (isOpen) {
      if (value !== undefined) {
        setInternalDraft(value);
      } else if (initialText !== undefined) {
        setInternalDraft(initialText);
      }
    }
  }, [isOpen, value, initialText]);

  const activeValue = (value !== undefined ? value : internalDraft) || "";

  const updateDraft = useCallback((nextVal: string) => {
    setInternalDraft(nextVal);
    onChange?.(nextVal);
  }, [onChange]);

  const [viewMode, setViewMode] = useState<ZenViewMode>("split");
  const [showFindReplace, setShowFindReplace] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>("");
  const [replaceQuery, setReplaceQuery] = useState<string>("");
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle Synchronized Scroll between Textarea and Line Numbers Gutter
  const handleEditorScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Split lines for line numbers
  const lines = useMemo(() => {
    return (activeValue || "").split("\n");
  }, [activeValue]);

  // Update active cursor line number
  const updateCursorLine = useCallback(() => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBeforeCursor = (activeValue || "").slice(0, pos);
    const currentLineIndex = textBeforeCursor.split("\n").length - 1;
    setActiveLine(currentLineIndex);
  }, [activeValue]);

  // Find matches across text
  const matches = useMemo(() => {
    if (!findQuery) return [];
    const results: Array<{ start: number; end: number }> = [];
    const flags = matchCase ? "g" : "gi";
    try {
      const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(activeValue)) !== null) {
        results.push({ start: match.index, end: match.index + match[0].length });
        if (!regex.global) break;
      }
    } catch {
      // Regex parsing error fallback
    }
    return results;
  }, [activeValue, findQuery, matchCase]);

  // Adjust match index bounds if matches change
  useEffect(() => {
    if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(Math.max(0, matches.length - 1));
    }
  }, [matches, currentMatchIndex]);

  // Navigate to a specific match and select it in textarea
  const scrollToMatch = useCallback(
    (index: number) => {
      if (!matches.length || !textareaRef.current) return;
      const target = matches[index];
      if (!target) return;

      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(target.start, target.end);

      // Rough scroll into view calculation
      const linesBefore = (activeValue || "").slice(0, target.start).split("\n").length;
      const lineHeight = 21; // ~21px per line
      textareaRef.current.scrollTop = Math.max(0, (linesBefore - 4) * lineHeight);
      if (gutterRef.current) {
        gutterRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    },
    [matches, activeValue]
  );

  const handleNextMatch = useCallback(() => {
    if (!matches.length) return;
    const next = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(next);
    scrollToMatch(next);
  }, [currentMatchIndex, matches.length, scrollToMatch]);

  const handlePrevMatch = useCallback(() => {
    if (!matches.length) return;
    const prev = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prev);
    scrollToMatch(prev);
  }, [currentMatchIndex, matches.length, scrollToMatch]);

  // Replace current match
  const handleReplaceSingle = useCallback(() => {
    if (!matches.length || !textareaRef.current) return;
    const current = matches[currentMatchIndex];
    if (!current) return;

    const before = activeValue.slice(0, current.start);
    const after = activeValue.slice(current.end);
    const updated = before + replaceQuery + after;
    updateDraft(updated);

    setStatusNotification("Match replaced");
    setTimeout(() => setStatusNotification(null), 1800);
  }, [matches, currentMatchIndex, activeValue, replaceQuery, updateDraft]);

  // Replace all matches
  const handleReplaceAll = useCallback(() => {
    if (!findQuery || !matches.length) return;
    const flags = matchCase ? "g" : "gi";
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, flags);
    const updated = activeValue.replace(regex, replaceQuery);
    const count = matches.length;
    updateDraft(updated);

    setStatusNotification(`Replaced ${count} occurrence${count > 1 ? "s" : ""}`);
    setTimeout(() => setStatusNotification(null), 2500);
  }, [findQuery, matches.length, matchCase, activeValue, replaceQuery, updateDraft]);

  // Helper to insert markdown or templates at cursor
  const insertTemplateAtCursor = useCallback(
    (before: string, after: string, defaultText: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        updateDraft(activeValue + before + defaultText + after);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = activeValue.slice(start, end);

      const inserted = selected ? before + selected + after : before + defaultText + after;
      const updated = activeValue.slice(0, start) + inserted + activeValue.slice(end);
      updateDraft(updated);

      setTimeout(() => {
        textarea.focus();
        if (selected) {
          textarea.setSelectionRange(start, start + inserted.length);
        } else {
          textarea.setSelectionRange(start + before.length, start + before.length + defaultText.length);
        }
      }, 10);
    },
    [activeValue, updateDraft]
  );

  // Tab & Auto-Indent handler in Textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Tab key -> Insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const updated = activeValue.slice(0, start) + "  " + activeValue.slice(end);
      updateDraft(updated);
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      }, 0);
      return;
    }

    // Enter key -> Auto-indentation
    if (e.key === "Enter" && !e.shiftKey) {
      const start = textarea.selectionStart;
      const linesBeforeCursor = activeValue.slice(0, start).split("\n");
      const currentLineText = linesBeforeCursor[linesBeforeCursor.length - 1] || "";
      const matchIndent = currentLineText.match(/^(\s+)/);
      const matchBullet = currentLineText.match(/^(\s*)([-*]|\d+\.)\s+/);

      if (matchBullet) {
        // If bullet list item is completely empty, clear it on enter
        if (currentLineText.trim() === matchBullet[2]) {
          e.preventDefault();
          const lineStart = start - currentLineText.length;
          const updated = activeValue.slice(0, lineStart) + activeValue.slice(start);
          updateDraft(updated);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }

        // Continue list bullet
        e.preventDefault();
        const bulletPrefix = matchBullet[2].includes(".")
          ? `${parseInt(matchBullet[2], 10) + 1}. `
          : `${matchBullet[2]} `;
        const insertString = "\n" + matchBullet[1] + bulletPrefix;
        const updated = activeValue.slice(0, start) + insertString + activeValue.slice(start);
        updateDraft(updated);
        setTimeout(() => {
          textarea.setSelectionRange(start + insertString.length, start + insertString.length);
        }, 0);
        return;
      }

      if (matchIndent) {
        e.preventDefault();
        const insertString = "\n" + matchIndent[1];
        const updated = activeValue.slice(0, start) + insertString + activeValue.slice(start);
        updateDraft(updated);
        setTimeout(() => {
          textarea.setSelectionRange(start + insertString.length, start + insertString.length);
        }, 0);
        return;
      }
    }
  };

  // Primary Submission
  const handlePrimarySubmit = useCallback(() => {
    if (onApplyAndSend) {
      onApplyAndSend(activeValue);
    } else if (onSubmit) {
      onSubmit(activeValue);
    }
    onClose();
  }, [onApplyAndSend, onSubmit, activeValue, onClose]);

  // Global Keyboard Shortcuts (Escape, Cmd+Enter, Cmd+F, Alt+Z)
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape -> close modal
      if (e.key === "Escape") {
        if (showFindReplace) {
          setShowFindReplace(false);
        } else {
          onClose();
        }
        return;
      }

      // Cmd+Enter or Ctrl+Enter -> submit
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlePrimarySubmit();
        return;
      }

      // Cmd+F or Ctrl+F -> toggle find & replace
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowFindReplace((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => findInputRef.current?.focus(), 50);
          }
          return next;
        });
        return;
      }

      // Alt+Z / Option+Z -> toggle modal
      if (e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, showFindReplace, onClose, handlePrimarySubmit]);

  // Live Statistics Calculations
  const wordCount = useMemo(() => {
    const trimmed = (activeValue || "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [activeValue]);

  const charCount = useMemo(() => (activeValue || "").length, [activeValue]);

  const lineCount = useMemo(() => lines.length, [lines]);

  const estimatedTokens = useMemo(() => {
    // LLM token rule of thumb: ~4 characters per token
    return Math.ceil((activeValue || "").length / 4);
  }, [activeValue]);

  const readingTime = useMemo(() => {
    if (wordCount < 100) return "< 1 min";
    const minutes = Math.ceil(wordCount / 200);
    return `~${minutes} min read`;
  }, [wordCount]);

  // Token Gauge color
  const tokenBadgeColor = useMemo(() => {
    if (estimatedTokens < 2000) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (estimatedTokens < 8000) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
    return "text-rose-400 border-rose-500/30 bg-rose-500/10";
  }, [estimatedTokens]);

  const processedPreviewMarkdown = useMemo(() => {
    return preprocessMathForPreview(activeValue || "");
  }, [activeValue]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="composer-zen-overlay fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="composer-zen-modal relative flex flex-col w-full max-w-[1340px] h-[92vh] max-h-[920px] rounded-2xl bg-[#0b1220]/95 border border-sky-500/20 shadow-2xl shadow-black/80 overflow-hidden"
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="composer-zen-header flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-900/60 backdrop-blur select-none">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                <FiMaximize2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
                <p className="text-[11px] text-slate-400">
                  Distraction-free workspace for large prompts • <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Alt+Z</kbd>
                </p>
              </div>
            </div>

            {/* Layout Switcher Tabs */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                  viewMode === "split"
                    ? "bg-sky-500 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Split View (Editor + Live Preview)"
              >
                <FiColumns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("editor")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                  viewMode === "editor"
                    ? "bg-sky-500 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Editor Only"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Editor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                  viewMode === "preview"
                    ? "bg-sky-500 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Live Preview Only"
              >
                <FiEye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </div>

            {/* Close Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close Zen Workspace (Esc)"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── Quick Insert Tools Toolbar ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-2 bg-slate-900/40 border-b border-slate-700/40 gap-2 flex-wrap select-none text-xs">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mr-1">Insert:</span>

              {/* Code Block */}
              <button
                type="button"
                onClick={() => insertTemplateAtCursor("```typescript\n", "\n```", "// Code snippet here")}
                className="composer-tool-btn inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-sky-300 border border-slate-700/40 transition-colors text-[11px]"
                title="Insert Code Block"
              >
                <FiCode className="w-3 h-3" />
                <span>Code</span>
              </button>

              {/* Markdown Table */}
              <button
                type="button"
                onClick={() =>
                  insertTemplateAtCursor(
                    "\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Data 1 | Data 2 | Data 3 |\n| Data 4 | Data 5 | Data 6 |\n",
                    "",
                    ""
                  )
                }
                className="composer-tool-btn inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-sky-300 border border-slate-700/40 transition-colors text-[11px]"
                title="Insert Markdown Table"
              >
                <FiGrid className="w-3 h-3" />
                <span>Table</span>
              </button>

              {/* KaTeX Math Formula */}
              <button
                type="button"
                onClick={() =>
                  insertTemplateAtCursor(
                    "\n$$\n",
                    "\n$$\n",
                    "f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2\\pi i \\xi x} d\\xi"
                  )
                }
                className="composer-tool-btn inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-sky-300 border border-slate-700/40 transition-colors text-[11px]"
                title="Insert KaTeX Math Formula ($$ ... $$)"
              >
                <span className="font-serif italic font-bold">∑</span>
                <span>Math</span>
              </button>

              {/* Bullet List */}
              <button
                type="button"
                onClick={() => insertTemplateAtCursor("\n- ", "\n", "Key requirement 1\n- Key requirement 2")}
                className="composer-tool-btn inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-sky-300 border border-slate-700/40 transition-colors text-[11px]"
                title="Insert Bullet List"
              >
                <FiList className="w-3 h-3" />
                <span>Bullets</span>
              </button>

              {/* Task Checklist */}
              <button
                type="button"
                onClick={() => insertTemplateAtCursor("\n- [ ] ", "\n", "Implement module\n- [ ] Write tests")}
                className="composer-tool-btn inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-sky-300 border border-slate-700/40 transition-colors text-[11px]"
                title="Insert Task Checklist"
              >
                <FiCheckSquare className="w-3 h-3" />
                <span>Tasks</span>
              </button>

              {/* Bold & Italic */}
              <div className="h-4 w-px bg-slate-700/50 mx-1" />
              <button
                type="button"
                onClick={() => insertTemplateAtCursor("**", "**", "bold text")}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Bold (**text**)"
              >
                <FiBold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertTemplateAtCursor("*", "*", "italic text")}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Italic (*text*)"
              >
                <FiItalic className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Find & Replace Trigger & Clear */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFindReplace((prev) => {
                    const next = !prev;
                    if (next) setTimeout(() => findInputRef.current?.focus(), 50);
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                  showFindReplace
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                    : "bg-slate-800/60 text-slate-300 border-slate-700/40 hover:text-white"
                }`}
                title="Find & Replace in Editor (Cmd+F / Ctrl+F)"
              >
                <FiSearch className="w-3 h-3" />
                <span>Find & Replace</span>
                <kbd className="hidden sm:inline font-mono text-[9px] text-slate-400 ml-1">⌘F</kbd>
              </button>

              {activeValue && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear the entire draft?")) {
                      updateDraft("");
                    }
                  }}
                  className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Clear entire draft"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ── In-Editor Find & Replace Bar ────────────────────────────────── */}
          <AnimatePresence>
            {showFindReplace && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="border-b border-sky-500/30 bg-slate-900/90 px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs overflow-hidden"
              >
                <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                  {/* Find Query Input */}
                  <div className="relative flex-1">
                    <input
                      ref={findInputRef}
                      type="text"
                      value={findQuery}
                      onChange={(e) => {
                        setFindQuery(e.target.value);
                        setCurrentMatchIndex(0);
                      }}
                      placeholder="Find in prompt..."
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-800/90 text-white placeholder-slate-500 text-xs border border-slate-700/70 focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  {/* Match Counter Badge */}
                  <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 whitespace-nowrap">
                    {findQuery
                      ? matches.length > 0
                        ? `${currentMatchIndex + 1} of ${matches.length}`
                        : "0 matches"
                      : "Find"}
                  </span>

                  {/* Previous Match */}
                  <button
                    type="button"
                    onClick={handlePrevMatch}
                    disabled={!matches.length}
                    className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    title="Previous Match (Shift+F3)"
                  >
                    <FiChevronUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Next Match */}
                  <button
                    type="button"
                    onClick={handleNextMatch}
                    disabled={!matches.length}
                    className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    title="Next Match (F3)"
                  >
                    <FiChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Case Sensitive Toggle */}
                  <button
                    type="button"
                    onClick={() => setMatchCase((p) => !p)}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                      matchCase
                        ? "bg-sky-500/30 text-sky-300 border-sky-500/60"
                        : "bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300"
                    }`}
                    title="Match Case Sensitive"
                  >
                    Aa
                  </button>
                </div>

                {/* Replace Controls */}
                <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                  <input
                    type="text"
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder="Replace with..."
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800/90 text-white placeholder-slate-500 text-xs border border-slate-700/70 focus:outline-none focus:border-sky-400"
                  />

                  <button
                    type="button"
                    onClick={handleReplaceSingle}
                    disabled={!matches.length}
                    className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] whitespace-nowrap disabled:opacity-40"
                  >
                    Replace
                  </button>

                  <button
                    type="button"
                    onClick={handleReplaceAll}
                    disabled={!matches.length}
                    className="px-2.5 py-1.5 rounded-md bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] whitespace-nowrap disabled:opacity-40"
                  >
                    Replace All
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFindReplace(false)}
                    className="p-1 rounded text-slate-400 hover:text-white"
                    title="Close find bar"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status Toast Banner */}
          {statusNotification && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-sky-600 text-white text-xs shadow-lg z-50 font-medium">
              {statusNotification}
            </div>
          )}

          {/* ── Main Workspace Body ─────────────────────────────────────────── */}
          <div className="composer-zen-body flex-1 grid overflow-hidden relative" style={{
            gridTemplateColumns: viewMode === "split" ? "1fr 1fr" : "1fr"
          }}>
            {/* Left Pane: Multi-Line Editor with Synchronized Line Numbers */}
            {(viewMode === "split" || viewMode === "editor") && (
              <div className="composer-zen-editor-pane flex flex-col h-full overflow-hidden border-r border-slate-700/40 bg-[#080d17]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400 select-none">
                  <span className="font-mono">PROMPT EDITOR</span>
                  <span className="font-mono text-slate-500">
                    Line {activeLine + 1}, Col {(textareaRef.current?.selectionStart || 0) + 1}
                  </span>
                </div>

                <div className="relative flex flex-1 h-full overflow-hidden">
                  {/* Line Numbers Gutter */}
                  <div
                    ref={gutterRef}
                    className="zen-gutter w-12 py-3 bg-slate-950/60 border-r border-slate-800/80 font-mono text-[12px] leading-[21px] text-slate-600 text-right pr-3 select-none overflow-hidden"
                  >
                    {lines.map((_, i) => (
                      <div
                        key={i}
                        className={`transition-colors ${
                          i === activeLine ? "text-sky-400 font-bold bg-sky-500/10 rounded-l" : ""
                        }`}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Textarea Multi-line Editor */}
                  <textarea
                    ref={textareaRef}
                    value={activeValue}
                    onChange={(e) => {
                      updateDraft(e.target.value);
                      updateCursorLine();
                    }}
                    onScroll={handleEditorScroll}
                    onSelect={updateCursorLine}
                    onClick={updateCursorLine}
                    onKeyUp={updateCursorLine}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={placeholder}
                    spellCheck={false}
                    className="zen-textarea flex-1 h-full p-3 bg-transparent text-slate-100 font-mono text-[13px] leading-[21px] resize-none outline-none overflow-y-auto selection:bg-sky-500/30"
                  />
                </div>
              </div>
            )}

            {/* Right Pane: Live Markdown & KaTeX Preview */}
            {(viewMode === "split" || viewMode === "preview") && (
              <div className="composer-zen-preview-pane flex flex-col h-full overflow-hidden bg-[#070b14]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400 select-none">
                  <span className="font-mono">LIVE MARKDOWN & KATEX PREVIEW</span>
                  <span className="text-[10px] text-emerald-400/80 font-mono">Real-time sync</span>
                </div>

                <div className="flex-1 p-6 overflow-y-auto zen-preview-scroll">
                  {activeValue.trim() ? (
                    <div className="text-slate-100 text-[14px] leading-relaxed max-w-3xl">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={zenMarkdownComponents}>
                        {processedPreviewMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 select-none text-center p-8">
                      <div className="w-12 h-12 rounded-full bg-slate-800/40 border border-slate-700/40 flex items-center justify-center text-sky-400/60 mb-3">
                        <FiFileText className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">Live Preview Area</p>
                      <p className="text-xs text-slate-500 max-w-md mt-1">
                        Formatted Markdown headings, code blocks, tables, and KaTeX mathematical equations will render here in real time as you draft your prompt.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Live Statistics Footer & Primary Action Controls ─────────────── */}
          <div className="composer-zen-footer flex items-center justify-between px-5 py-3 border-t border-slate-700/50 bg-slate-900/80 backdrop-blur select-none flex-wrap gap-3">
            {/* Live Statistics Bar */}
            <div className="flex items-center gap-3 text-xs flex-wrap font-mono">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300">
                <FiFileText className="w-3.5 h-3.5 text-sky-400" />
                <span>{wordCount} words</span>
                <span className="text-slate-600">•</span>
                <span>{charCount} chars</span>
                <span className="text-slate-600">•</span>
                <span>{lineCount} lines</span>
              </span>

              {/* Estimated Tokens Pill */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${tokenBadgeColor}`}>
                <FiCpu className="w-3 h-3" />
                <span>~{estimatedTokens.toLocaleString()} tokens</span>
              </span>

              {/* Reading Time */}
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-400 text-[11px]">
                <FiClock className="w-3 h-3 text-slate-500" />
                <span>{readingTime}</span>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 ml-auto">
              {/* Cancel / Close */}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-medium transition-colors"
              >
                Close
              </button>

              {/* Done / Apply Draft */}
              <button
                type="button"
                onClick={() => {
                  if (onSaveDraft) {
                    onSaveDraft(activeValue);
                  }
                  onChange?.(activeValue);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 text-xs font-medium transition-all"
              >
                <FiCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>Done</span>
              </button>

              {/* Send to Meera Primary Gradient Button */}
              <button
                type="button"
                onClick={handlePrimarySubmit}
                disabled={!activeValue.trim()}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-sky-500/25 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                <FiSend className="w-3.5 h-3.5" />
                <span>Send to Meera</span>
                <kbd className="px-1 py-0.2 bg-black/25 rounded text-[10px] font-mono text-sky-100">⌘↵</kbd>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ComposerZenModal;
