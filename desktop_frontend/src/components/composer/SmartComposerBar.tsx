import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  FiMaximize2,
  FiX,
  FiSend,
  FiCode,
  FiGrid,
  FiSearch,
  FiAlertTriangle,
  FiTrash2,
  FiZap,
  FiClock,
  FiPaperclip,
  FiMic,
  FiMicOff,
  FiSquare,
  FiCheck,
  FiCopy,
  FiCpu,
  FiCommand,
} from "react-icons/fi";
import { LuWandSparkles, LuCalculator, LuSigma } from "react-icons/lu";
import {
  detectMathContext,
  evaluateQuickMath,
  scanForSecrets,
  redactPII,
  autoFenceCode,
  prettifyJsonOrSql,
  type MathModeSetting,
  type QuickMathResult,
} from "./MathEngine";
import MathToolbar from "./MathToolbar";
import ComposerZenModal from "./ComposerZenModal";
import "./smart-composer.css";

export interface SmartComposerBarProps {
  input: string;
  setInput: (value: string) => void;
  inputCaret: number;
  setInputCaret: (caret: number) => void;
  isSending: boolean;
  stopActiveRequest: () => void;
  sendMessage: (text: string) => Promise<void>;
  isRecording: boolean;
  startVoiceInput: () => void;
  voiceRepliesEnabled: boolean;
  openAttachmentPicker: () => void;
  attachmentsBusy: boolean;
  chatInputRef: React.RefObject<HTMLTextAreaElement>;
  chatGhostRef: React.RefObject<HTMLDivElement>;
  inlineGhostSuffix: string;
  onSmartInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSmartInputPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onChatInputSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onChatInputFocus: () => void;
  onChatInputBlur: () => void;
  onSmartComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  mathMode: MathModeSetting;
  setMathMode: (mode: MathModeSetting) => void;
  activeSessionId?: string;
}

const SLASH_COMMANDS = [
  { cmd: "/refactor", title: "Refactor Code", desc: "Refactor code for clean architecture, readability & performance", insert: "Refactor this code to follow clean architecture, best practices, and high readability:\n\n" },
  { cmd: "/explain", title: "Explain Simply", desc: "Explain the underlying concept or code clearly step-by-step", insert: "Explain how this works clearly and step-by-step, including edge cases:\n\n" },
  { cmd: "/test", title: "Generate Unit Tests", desc: "Write comprehensive unit tests with mocks and boundary cases", insert: "Write comprehensive unit tests covering happy paths, edge cases, and error conditions for:\n\n" },
  { cmd: "/debug", title: "Debug & Fix Issue", desc: "Find the root cause of the error and provide the exact fix", insert: "Diagnose this error, identify the root cause, and provide the exact fix:\n\n" },
  { cmd: "/summarize", title: "Executive Summary", desc: "Provide an executive TL;DR with key bullet takeaways", insert: "Provide a crisp executive summary with key takeaways and action items for:\n\n" },
  { cmd: "/table", title: "Format as Markdown Table", desc: "Structure data or comparisons into a clean table", insert: "Organize the following information into a clear, comprehensive Markdown table:\n\n" },
  { cmd: "/json", title: "Strict JSON Schema", desc: "Return response exclusively in valid, typed JSON format", insert: "Analyze the following and respond exclusively in valid JSON format matching this schema:\n\n" },
  { cmd: "/doc", title: "Technical Documentation", desc: "Generate full Markdown docs with parameters and examples", insert: "Generate complete, publication-ready technical documentation for:\n\n" },
  { cmd: "/regex", title: "Regex Generator & Tester", desc: "Generate and explain regular expressions", insert: "Create and explain an optimal regular expression for the following pattern:\n\n" },
];

const MENTION_TAGS = [
  { tag: "@active-file", desc: "Attach current active editor file", insert: "[Context: Current active file]\n" },
  { tag: "@system", desc: "Inject current OS & hardware specs", insert: "[Context: macOS Darwin, Apple Silicon, Node.js + Python]\n" },
  { tag: "@clipboard", desc: "Paste clipboard contents as code block", insert: "[Clipboard snippet]\n" },
  { tag: "@web", desc: "Force live internet search retrieval", insert: "[Instruction: Use live web search to verify latest information]\n" },
  { tag: "@deep-reasoning", desc: "Enforce multi-step deep reasoning", insert: "[Instruction: Provide deep step-by-step reasoning before output]\n" },
];

export const SmartComposerBar: React.FC<SmartComposerBarProps> = ({
  input,
  setInput,
  inputCaret,
  setInputCaret,
  isSending,
  stopActiveRequest,
  sendMessage,
  isRecording,
  startVoiceInput,
  voiceRepliesEnabled,
  openAttachmentPicker,
  attachmentsBusy,
  chatInputRef,
  chatGhostRef,
  inlineGhostSuffix,
  onSmartInputChange,
  onSmartInputPaste,
  onChatInputSelect,
  onChatInputFocus,
  onChatInputBlur,
  onSmartComposerKeyDown,
  mathMode,
  setMathMode,
  activeSessionId = "default",
}) => {
  // ── States ────────────────────────────────────────────────────────────────
  const [zenModalOpen, setZenModalOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [enhanceMenuOpen, setEnhanceMenuOpen] = useState(false);
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [clearedUndoText, setClearedUndoText] = useState<string | null>(null);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [deepReasoning, setDeepReasoning] = useState(false);

  // ── Math & Security Analysis ──────────────────────────────────────────────
  const mathAnalysis = useMemo(() => detectMathContext(input, mathMode), [input, mathMode]);
  const quickMath = useMemo<QuickMathResult | null>(() => evaluateQuickMath(input), [input]);
  const secretAnalysis = useMemo(() => scanForSecrets(input), [input]);

  // ── Live Token & Word Metrics ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const chars = input.length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const lines = input ? input.split("\n").length : 0;
    const estTokens = Math.ceil(chars / 3.8);
    const readingTimeSec = Math.max(1, Math.round((words / 200) * 60));
    return { chars, words, lines, estTokens, readingTimeSec };
  }, [input]);

  // ── Draft Autosave & Restore ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId) return;
    const draftKey = `meera_draft_${activeSessionId}`;
    if (input.trim()) {
      try {
        localStorage.setItem(draftKey, input);
      } catch {}
    } else {
      try {
        localStorage.removeItem(draftKey);
      } catch {}
    }
  }, [input, activeSessionId]);

  // ── Restore Draft on Initial Load ─────────────────────────────────────────
  useEffect(() => {
    if (!activeSessionId) return;
    const draftKey = `meera_draft_${activeSessionId}`;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && !input) {
        setInput(saved);
        setInputCaret(saved.length);
      }
    } catch {}
  }, [activeSessionId]);

  // ── Quick Insert Helper ───────────────────────────────────────────────────
  const insertTextAtCursor = useCallback(
    (textToInsert: string, cursorOffset?: number) => {
      const textarea = chatInputRef.current;
      const start = textarea?.selectionStart ?? inputCaret;
      const end = textarea?.selectionEnd ?? start;
      const nextValue = `${input.slice(0, start)}${textToInsert}${input.slice(end)}`;
      const nextCaret = cursorOffset !== undefined ? start + cursorOffset : start + textToInsert.length;
      setInput(nextValue);
      setInputCaret(nextCaret);
      window.requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [input, inputCaret, chatInputRef, setInput, setInputCaret]
  );

  // ── Handle Clear with Undo Toast ──────────────────────────────────────────
  const handleClearInput = () => {
    if (!input.trim()) return;
    setClearedUndoText(input);
    setInput("");
    setInputCaret(0);
    setTimeout(() => setClearedUndoText(null), 5000);
  };

  const handleUndoClear = () => {
    if (clearedUndoText) {
      setInput(clearedUndoText);
      setInputCaret(clearedUndoText.length);
      setClearedUndoText(null);
    }
  };

  // ── Prompt Enhancer Presets ───────────────────────────────────────────────
  const enhancePrompt = (style: "polish" | "concise" | "architect" | "steps") => {
    const raw = input.trim();
    if (!raw) return;
    let enhanced = raw;
    if (style === "polish") {
      enhanced = `Please provide a high-precision, well-structured response with clear explanations, best practices, and edge case considerations for the following:\n\n${raw}`;
    } else if (style === "concise") {
      enhanced = `Provide an ultra-concise, direct answer with minimal preamble, key bullet points, and exact solution for:\n\n${raw}`;
    } else if (style === "architect") {
      enhanced = `You are a Senior Principal Architect. Thoroughly analyze the following task, outlining architectural design, performance trade-offs, modularity, security, and exact implementation steps:\n\n${raw}`;
    } else if (style === "steps") {
      enhanced = `Break down the solution for the following request into numbered, step-by-step actionable phases with code or derivations where appropriate:\n\n${raw}`;
    }
    setInput(enhanced);
    setInputCaret(enhanced.length);
    setEnhanceMenuOpen(false);
  };

  // ── Search & Replace ──────────────────────────────────────────────────────
  const handleReplaceAll = () => {
    if (!searchTerm) return;
    const next = input.replaceAll(searchTerm, replaceTerm);
    setInput(next);
    setSearchReplaceOpen(false);
  };

  // ── Draggable Resizer ─────────────────────────────────────────────────────
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startH = chatInputRef.current?.offsetHeight ?? 60;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const nextH = Math.max(50, Math.min(480, startH + delta));
      setCustomHeight(nextH);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // ── Keydown Interceptor for Shortcuts (/ and @ and Alt+Z) ─────────────────
  const handleEnhancedKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Alt+Z or Option+Z: Open Zen Mode
    if (event.altKey && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      setZenModalOpen(true);
      return;
    }

    // Ctrl+F / Cmd+F: Toggle in-composer find & replace
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setSearchReplaceOpen((prev) => !prev);
      return;
    }

    // Bracket & Quote Auto-Enclose when text is selected
    const target = event.currentTarget;
    const selStart = target.selectionStart;
    const selEnd = target.selectionEnd;
    if (selStart !== selEnd) {
      const pairs: Record<string, string> = {
        "(": ")",
        "[": "]",
        "{": "}",
        '"': '"',
        "'": "'",
        "`": "`",
        "$": "$",
      };
      if (pairs[event.key]) {
        event.preventDefault();
        const selected = input.slice(selStart, selEnd);
        const wrapped = `${event.key}${selected}${pairs[event.key]}`;
        const nextVal = `${input.slice(0, selStart)}${wrapped}${input.slice(selEnd)}`;
        setInput(nextVal);
        setInputCaret(selStart + wrapped.length);
        return;
      }
    }

    // Trigger Slash Menu when user types "/" at beginning of line
    if (event.key === "/" && (input.length === 0 || input.endsWith("\n"))) {
      setSlashMenuOpen(true);
    } else if (event.key === "@") {
      setMentionMenuOpen(true);
    } else if (event.key === "Escape") {
      setSlashMenuOpen(false);
      setMentionMenuOpen(false);
      setEnhanceMenuOpen(false);
      setSearchReplaceOpen(false);
    }

    // Delegate to existing app composer keydown handler
    onSmartComposerKeyDown(event);
  };

  // ── Submit Wrapper ────────────────────────────────────────────────────────
  const handleSendPrompt = async () => {
    if (!input.trim() || isSending) return;
    let finalPrompt = input;
    if (deepReasoning && !finalPrompt.includes("[DEEP_REASONING]")) {
      finalPrompt = `[DEEP_REASONING]\nPlease provide deep, exhaustive chain-of-thought derivation and rationale before answering:\n\n${finalPrompt}`;
    }
    await sendMessage(finalPrompt);
  };

  return (
    <div className="smart-composer-container">
      {/* ── Auxiliary Top Bar (Tokens, Math Status, Security, Zen Mode Trigger) ── */}
      <div className="smart-composer-aux-bar">
        <div className="smart-composer-aux-left">
          {/* Math Engine Tri-State Pill & Symbol Palette */}
          <MathToolbar
            mathMode={mathMode}
            setMathMode={setMathMode}
            isMathDetected={mathAnalysis.isMath}
            latexSnippets={mathAnalysis.latexSnippets}
            onInsertSymbol={insertTextAtCursor}
          />

          {/* Quick Arithmetic Calculation Result Tooltip */}
          {quickMath && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono cursor-pointer hover:bg-emerald-500/20"
              onClick={() => insertTextAtCursor(` = ${quickMath.result}`)}
              title="Click to insert calculated answer"
            >
              <LuCalculator className="text-emerald-400" />
              <span>{quickMath.expression} = <strong>{quickMath.result}</strong></span>
            </div>
          )}

          {/* Deep Reasoning Switch */}
          <button
            type="button"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              deepReasoning
                ? "bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-sm"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setDeepReasoning(!deepReasoning)}
            title="Enforce structured deep reasoning steps"
          >
            <span>🧠</span>
            <span>Deep Think</span>
          </button>
        </div>

        <div className="smart-composer-aux-right">
          {/* Live Token & Word Counter Pill */}
          <div
            className={`composer-stats-pill ${
              stats.estTokens > 3000 ? "danger" : stats.estTokens > 1500 ? "warning" : ""
            }`}
            title={`${stats.words} words · ${stats.lines} lines · ~${stats.estTokens} tokens · ~${stats.readingTimeSec}s read`}
          >
            <span className="token-meter-dot" />
            <span>{stats.words}w</span>
            <span>·</span>
            <span>{stats.estTokens} tok</span>
          </div>

          {/* Zen Workspace Modal Trigger */}
          <button
            type="button"
            className="composer-tool-btn"
            onClick={() => setZenModalOpen(true)}
            title="Expand into Fullscreen Zen Workspace (Alt+Z)"
            aria-label="Expand Workspace"
          >
            <FiMaximize2 />
          </button>
        </div>
      </div>

      {/* ── Secret / API Key Leak Alert Banner ─────────────────────────────────── */}
      {secretAnalysis.hasLeak && (
        <div className="composer-leak-warning">
          <FiAlertTriangle className="text-rose-400 text-base flex-shrink-0" />
          <span>
            <strong>Security Alert:</strong> Detected sensitive credentials ({secretAnalysis.findings.map((f) => f.type).join(", ")}).
          </span>
          <button
            type="button"
            className="composer-leak-warning-btn"
            onClick={() => {
              const { redactedText } = redactPII(input);
              setInput(redactedText);
            }}
          >
            Mask Secrets
          </button>
        </div>
      )}

      {/* ── Undo Clear Toast Notification ─────────────────────────────────────── */}
      {clearedUndoText && (
        <div className="flex items-center justify-between px-3 py-1.5 mx-2 my-1 bg-sky-500/10 border border-sky-500/30 rounded-lg text-xs text-sky-200 animate-fade-in">
          <span>Input cleared.</span>
          <button
            type="button"
            className="font-semibold underline text-sky-300 hover:text-sky-100"
            onClick={handleUndoClear}
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Search & Replace Bar ──────────────────────────────────────────────── */}
      {searchReplaceOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 border-b border-white/10 text-xs">
          <FiSearch className="text-slate-400" />
          <input
            type="text"
            placeholder="Find..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2 py-1 bg-black/40 border border-white/15 rounded text-white text-xs outline-none focus:border-sky-400"
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="px-2 py-1 bg-black/40 border border-white/15 rounded text-white text-xs outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={handleReplaceAll}
            className="px-2 py-1 bg-sky-500/20 border border-sky-500/40 rounded text-sky-200 hover:bg-sky-500/30"
          >
            Replace All
          </button>
          <button
            type="button"
            onClick={() => setSearchReplaceOpen(false)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <FiX />
          </button>
        </div>
      )}

      {/* ── Main Input Row ────────────────────────────────────────────────────── */}
      <div className="smart-composer-input-row">
        {/* Attachment Picker Button */}
        <button
          className="chat-icon-btn chat-input-btn-left"
          type="button"
          aria-label="Attach files"
          title="Attach files or documents"
          onClick={openAttachmentPicker}
          disabled={isSending || attachmentsBusy}
        >
          <FiPaperclip />
        </button>

        {/* Textarea & Autocomplete Ghost Overlay */}
        <div className="smart-composer-textarea-wrap">
          {inlineGhostSuffix ? (
            <div ref={chatGhostRef} className="chat-input-ghost" aria-hidden="true">
              <span className="chat-input-ghost-typed">{input.slice(0, inputCaret)}</span>
              <span className="chat-input-ghost-suffix">{inlineGhostSuffix}</span>
            </div>
          ) : null}

          <textarea
            ref={chatInputRef}
            rows={1}
            value={input}
            onChange={onSmartInputChange}
            onPaste={onSmartInputPaste}
            onSelect={onChatInputSelect}
            onFocus={onChatInputFocus}
            onBlur={onChatInputBlur}
            onKeyDown={handleEnhancedKeyDown}
            placeholder={
              mathMode === "forced"
                ? "Enter math equation or theorem to solve..."
                : "Ask Meera anything... (/ for templates, @ for context, Alt+Z for Zen mode)"
            }
            className="smart-composer-textarea"
            style={customHeight ? { height: `${customHeight}px` } : undefined}
          />

          {/* Draggable Vertical Resizer */}
          <div
            className="composer-resizer-handle"
            onMouseDown={handleMouseDownResize}
            title="Drag to resize input area height"
          >
            <div className="w-2 h-0.5 bg-slate-500 rounded-full mb-0.5" />
            <div className="w-2 h-0.5 bg-slate-500 rounded-full" />
          </div>
        </div>

        {/* Voice Input Microphone Button */}
        <button
          className={`chat-icon-btn ${isRecording ? "active text-rose-400 animate-pulse" : ""}`}
          type="button"
          aria-label={isRecording ? "Stop voice input" : "Talk to Meera"}
          title={voiceRepliesEnabled ? "Voice replies enabled" : "Talk to Meera"}
          onClick={startVoiceInput}
        >
          {isRecording ? <FiMicOff /> : <FiMic />}
        </button>

        {/* Send / Stop Primary Action Button */}
        <div className="chat-actions">
          {isSending ? (
            <button className="chat-action-btn stop" type="button" onClick={stopActiveRequest}>
              <FiSquare />
              <span>Stop</span>
            </button>
          ) : (
            <button
              className="chat-action-btn send"
              type="button"
              disabled={!input.trim()}
              onClick={handleSendPrompt}
            >
              <FiSend />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom Smart Action Tools ─────────────────────────────────────────── */}
      <div className="smart-composer-bottom-bar">
        <div className="smart-composer-tools">
          {/* 1. Prompt Enhancer ("Magic Wand") */}
          <button
            type="button"
            className={`composer-tool-btn ${enhanceMenuOpen ? "active" : ""}`}
            onClick={() => setEnhanceMenuOpen(!enhanceMenuOpen)}
            title="Smart Prompt Enhancer / Polisher"
          >
            <LuWandSparkles />
          </button>

          {/* 2. Slash Commands Picker */}
          <button
            type="button"
            className={`composer-tool-btn ${slashMenuOpen ? "active" : ""}`}
            onClick={() => setSlashMenuOpen(!slashMenuOpen)}
            title="Prompt Templates (/ slash commands)"
          >
            <FiCommand />
          </button>

          {/* 3. Code Block Wrapper */}
          <button
            type="button"
            className="composer-tool-btn"
            onClick={() => {
              const formatted = autoFenceCode(input);
              setInput(formatted);
            }}
            title="Auto-wrap Code Block (```)"
          >
            <FiCode />
          </button>

          {/* 4. Markdown Table Inserter */}
          <button
            type="button"
            className="composer-tool-btn"
            onClick={() => {
              const table = "\n| Feature | Description | Status |\n| :--- | :--- | :--- |\n| Item 1 | Details here | Active |\n| Item 2 | Details here | Ready |\n";
              insertTextAtCursor(table);
            }}
            title="Insert Markdown Table Template"
          >
            <FiGrid />
          </button>

          {/* 5. Prettify JSON / SQL */}
          <button
            type="button"
            className="composer-tool-btn"
            onClick={() => {
              const res = prettifyJsonOrSql(input);
              if (res.changed) setInput(res.formatted);
            }}
            title="Format / Prettify JSON"
          >
            <FiZap />
          </button>

          {/* 6. Quick Clear */}
          {input.trim().length > 0 && (
            <button
              type="button"
              className="composer-tool-btn hover:text-rose-400"
              onClick={handleClearInput}
              title="Clear input"
            >
              <FiTrash2 />
            </button>
          )}
        </div>

        {/* ── Target Output Format Quick Chips ──────────────────────────────── */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mr-1">Output:</span>
          {[
            { label: "Table", insert: "\n[Format: Structure output in a Markdown table]" },
            { label: "JSON", insert: "\n[Format: Respond in valid JSON schema]" },
            { label: "Steps", insert: "\n[Format: Provide step-by-step instructions]" },
            { label: "Bullets", insert: "\n[Format: High-density bullet points]" },
          ].map((fmt) => (
            <button
              key={fmt.label}
              type="button"
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 border border-white/10 text-slate-300 hover:bg-sky-500/15 hover:border-sky-500/30 hover:text-sky-200 transition-colors"
              onClick={() => insertTextAtCursor(fmt.insert)}
            >
              {fmt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Slash Menu Popover ───────────────────────────────────────────────── */}
      {slashMenuOpen && (
        <div className="composer-dropdown-menu">
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/10 mb-1">
            Prompt Templates (/ Slash Commands)
          </div>
          {SLASH_COMMANDS.map((item) => (
            <button
              key={item.cmd}
              type="button"
              className="composer-dropdown-item"
              onClick={() => {
                insertTextAtCursor(item.insert);
                setSlashMenuOpen(false);
              }}
            >
              <span className="font-mono text-sky-400 font-medium">{item.cmd}</span>
              <span className="text-slate-200">{item.title}</span>
              <span className="composer-dropdown-item-desc">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Mentions Popover ─────────────────────────────────────────────────── */}
      {mentionMenuOpen && (
        <div className="composer-dropdown-menu">
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/10 mb-1">
            Context Attachments (@ Mentions)
          </div>
          {MENTION_TAGS.map((item) => (
            <button
              key={item.tag}
              type="button"
              className="composer-dropdown-item"
              onClick={() => {
                insertTextAtCursor(item.insert);
                setMentionMenuOpen(false);
              }}
            >
              <span className="font-mono text-purple-400 font-medium">{item.tag}</span>
              <span className="composer-dropdown-item-desc">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Prompt Enhancer Popover ──────────────────────────────────────────── */}
      {enhanceMenuOpen && (
        <div className="composer-dropdown-menu">
          <div className="px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/10 mb-1">
            Smart Prompt Enhancer
          </div>
          <button
            type="button"
            className="composer-dropdown-item"
            onClick={() => enhancePrompt("polish")}
          >
            <span>✨</span>
            <div>
              <div className="font-medium">Polish & Refine</div>
              <div className="text-[11px] text-slate-400">Adds constraints, clarity, and edge case coverage</div>
            </div>
          </button>
          <button
            type="button"
            className="composer-dropdown-item"
            onClick={() => enhancePrompt("concise")}
          >
            <span>⚡</span>
            <div>
              <div className="font-medium">Executive Concise</div>
              <div className="text-[11px] text-slate-400">Forces direct, punchy, minimal preamble answer</div>
            </div>
          </button>
          <button
            type="button"
            className="composer-dropdown-item"
            onClick={() => enhancePrompt("architect")}
          >
            <span>🏛️</span>
            <div>
              <div className="font-medium">Senior Architect</div>
              <div className="text-[11px] text-slate-400">Deep system design, trade-offs, and modularity</div>
            </div>
          </button>
          <button
            type="button"
            className="composer-dropdown-item"
            onClick={() => enhancePrompt("steps")}
          >
            <span>🔢</span>
            <div>
              <div className="font-medium">Step-by-Step Breakdown</div>
              <div className="text-[11px] text-slate-400">Structures into numbered actionable phases</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Fullscreen Zen Mode Workspace Modal ───────────────────────────────── */}
      <ComposerZenModal
        isOpen={zenModalOpen}
        onClose={() => setZenModalOpen(false)}
        initialText={input}
        onApplyAndSend={(text) => {
          setInput(text);
          setZenModalOpen(false);
          void sendMessage(text);
        }}
        onSaveDraft={(text) => {
          setInput(text);
          setZenModalOpen(false);
        }}
      />
    </div>
  );
};

export default SmartComposerBar;
