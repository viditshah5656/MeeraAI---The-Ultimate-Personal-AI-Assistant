import React, { useEffect, useRef, useState } from "react";
import { FiPlus, FiMic, FiMicOff, FiSend, FiSquare } from "react-icons/fi";
import ComposerZenModal from "./ComposerZenModal";
import type { MathModeSetting } from "./MathEngine";
import "./smart-composer-v2.css";

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

const SmartComposerBar: React.FC<SmartComposerBarProps> = (props) => {
  const {
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
    activeSessionId = "default",
  } = props;

  const [zenModalOpen, setZenModalOpen] = useState(false);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => resizeCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    const draftKey = `meera_draft_${activeSessionId}`;
    try {
      if (input.trim()) localStorage.setItem(draftKey, input);
      else localStorage.removeItem(draftKey);
    } catch {
      // Draft persistence is best-effort.
    }
  }, [input, activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || input) return;
    const draftKey = `meera_draft_${activeSessionId}`;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        setInput(saved);
        setInputCaret(saved.length);
      }
    } catch {
      // Draft restoration is best-effort.
    }
  }, [activeSessionId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    await sendMessage(input);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.altKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      setZenModalOpen(true);
      return;
    }
    onSmartComposerKeyDown(event);
  };

  const handleResizeStart = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);

    const startY = event.clientY;
    const startHeight = chatInputRef.current?.offsetHeight ?? 32;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = Math.max(32, Math.min(220, startHeight + delta));
      setCustomHeight(nextHeight);
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      resizeCleanupRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    resizeCleanupRef.current = onUp;
  };

  const placeholder =
    mathMode === "forced"
      ? "Enter math equation or theorem to solve..."
      : "Ask Meera anything...";

  return (
    <>
      <div
        className={`meera-composer-v2${isResizing ? " is-resizing" : ""}`}
        data-sending={isSending ? "true" : "false"}
        data-recording={isRecording ? "true" : "false"}
      >
        <div className="meera-composer-v2__surface">
          <button
            type="button"
            className="meera-composer-v2__icon-button meera-composer-v2__attach"
            aria-label="Attach files"
            title="Attach files or documents"
            onClick={openAttachmentPicker}
            disabled={isSending || attachmentsBusy}
          >
            <FiPlus aria-hidden="true" />
          </button>

          <div className="meera-composer-v2__editor">
            {inlineGhostSuffix ? (
              <div ref={chatGhostRef} className="meera-composer-v2__ghost" aria-hidden="true">
                <span>{input.slice(0, inputCaret)}</span>
                <span className="meera-composer-v2__ghost-suffix">{inlineGhostSuffix}</span>
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
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label="Message Meera"
              className="meera-composer-v2__textarea"
              style={customHeight ? { height: `${customHeight}px` } : undefined}
            />
          </div>

          <div className="meera-composer-v2__right-controls">
            <button
              type="button"
              className={`meera-composer-v2__icon-button meera-composer-v2__mic${isRecording ? " is-recording" : ""}`}
              aria-label={isRecording ? "Stop voice input" : "Talk to Meera"}
              title={voiceRepliesEnabled ? "Voice replies enabled" : "Talk to Meera"}
              onClick={startVoiceInput}
            >
              {isRecording ? <FiMicOff aria-hidden="true" /> : <FiMic aria-hidden="true" />}
            </button>

            <button
              type="button"
              className={`meera-composer-v2__send${isSending ? " is-stop" : ""}`}
              aria-label={isSending ? "Stop generating" : "Send message"}
              title={isSending ? "Stop generating" : "Send message"}
              onClick={isSending ? stopActiveRequest : handleSend}
              disabled={!isSending && !input.trim()}
            >
              {isSending ? <FiSquare aria-hidden="true" /> : <FiSend aria-hidden="true" />}
            </button>
          </div>

          <button
            type="button"
            className="meera-composer-v2__resize"
            aria-label="Resize message composer"
            title="Drag upward to make the composer taller"
            onMouseDown={handleResizeStart}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <ComposerZenModal
        isOpen={zenModalOpen}
        onClose={() => setZenModalOpen(false)}
        initialText={input}
        onApplyAndSend={(text) => {
          setInput(text);
          setInputCaret(text.length);
          setZenModalOpen(false);
          void sendMessage(text);
        }}
        onSaveDraft={(text) => {
          setInput(text);
          setInputCaret(text.length);
          setZenModalOpen(false);
        }}
      />
    </>
  );
};

export default SmartComposerBar;
