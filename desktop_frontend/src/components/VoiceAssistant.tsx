import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./voice-assistant.css";

export type VoicePreparationPhase =
  | "idle"
  | "checking"
  | "unloading"
  | "loading"
  | "connecting"
  | "ready"
  | "error";

export type VoicePreparationState = {
  phase: VoicePreparationPhase;
  progress: number;
  detail: string;
  error?: string;
};

export type VoiceCaption = {
  speaker: "meera" | "you" | "status";
  text: string;
};

type VoiceAssistantProps = {
  open: boolean;
  preparation: VoicePreparationState;
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  isThinking: boolean;
  audioLevel: number;
  caption: VoiceCaption | null;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onInterrupt: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onClose: () => void;
};

type VoiceVisualState = "preparing" | "ready" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

const VOICE_STATE_ICONS: Record<VoiceVisualState, string> = {
  preparing: "progress_activity",
  ready: "mic",
  listening: "stop",
  transcribing: "graphic_eq",
  thinking: "more_horiz",
  speaking: "volume_up",
  error: "refresh",
};

export function VoiceAssistant({
  open,
  preparation,
  isListening,
  isSpeaking,
  isTranscribing,
  isThinking,
  audioLevel,
  caption,
  onStart,
  onStop,
  onInterrupt,
  onRetry,
  onClose,
}: VoiceAssistantProps) {
  const ready = preparation.phase === "ready";
  const orbRef = useRef<HTMLButtonElement | null>(null);
  let voiceState: VoiceVisualState = "preparing";
  if (preparation.phase === "error") voiceState = "error";
  else if (isListening) voiceState = "listening";
  else if (isSpeaking) voiceState = "speaking";
  else if (isTranscribing) voiceState = "transcribing";
  else if (isThinking) voiceState = "thinking";
  else if (ready) voiceState = "ready";

  const stateLabels: Record<VoiceVisualState, string> = {
    preparing: preparation.detail || "Preparing voice",
    ready: "Ready. Click to speak",
    listening: "Listening. Click to stop and send",
    transcribing: "Understanding what you said",
    thinking: "Meera is responding. Click to interrupt",
    speaking: "Meera is speaking. Click to interrupt and speak",
    error: "Voice setup failed. Click to retry",
  };
  const stateTitles: Record<VoiceVisualState, string> = {
    preparing: "Preparing Meera",
    ready: "Ready when you are",
    listening: "I'm listening",
    transcribing: "Understanding you",
    thinking: "Working on that",
    speaking: "Speaking",
    error: "Voice unavailable",
  };
  const stateLabel = stateLabels[voiceState];
  const captionText = caption?.text || stateLabel;
  const captionSpeaker = caption?.speaker === "meera" ? "MEERA" : caption?.speaker === "you" ? "YOU" : "MEERA VOICE";
  const captionState: Record<VoiceVisualState, string> = {
    preparing: "INITIALIZING",
    ready: "READY",
    listening: "LISTENING",
    transcribing: "UNDERSTANDING",
    thinking: "THINKING",
    speaking: "SPEAKING",
    error: "NEEDS ATTENTION",
  };
  const interactionHint: Record<VoiceVisualState, string> = {
    preparing: "Preparing local voice",
    ready: "Click the orb or press Space to speak",
    listening: "Speak naturally · tap when you're finished",
    transcribing: "Turning your voice into a request",
    thinking: "Click the orb or press Space to interrupt",
    speaking: "Click the orb or press Space to interrupt",
    error: "Click the orb to retry",
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.code === "Space" && !isTranscribing && event.target === document.body) {
        if (!ready && preparation.phase !== "error") return;
        event.preventDefault();
        if (preparation.phase === "error") {
          void onRetry();
        } else if (isThinking || isSpeaking) {
          void onInterrupt();
        } else {
          void (isListening ? onStop() : onStart());
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListening, isSpeaking, isThinking, isTranscribing, onClose, onInterrupt, onRetry, onStart, onStop, open, preparation.phase, ready]);

  const handleLogoClick = () => {
    if (voiceState === "error") {
      void onRetry();
      return;
    }
    if (!ready || isTranscribing) return;
    if (isThinking || isSpeaking) {
      void onInterrupt();
      return;
    }
    void (isListening ? onStop() : onStart());
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    event.currentTarget.style.setProperty("--voice-pointer-x", `${x}%`);
    event.currentTarget.style.setProperty("--voice-pointer-y", `${y}%`);
  };

  const resetPointerLight = () => {
    orbRef.current?.style.setProperty("--voice-pointer-x", "34%");
    orbRef.current?.style.setProperty("--voice-pointer-y", "24%");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="meera-voice-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
          aria-label="Meera voice conversation"
        >
          <div className="meera-voice-atmosphere" aria-hidden="true">
            <span /><span /><span />
          </div>
          <motion.div
            className="meera-voice-session"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, delay: 0.16 }}
          >
            <span className="meera-voice-session-dot" data-state={voiceState} aria-hidden="true" />
            <span>Meera Voice</span>
            <i aria-hidden="true" />
            <span className="meera-voice-session-state">{stateTitles[voiceState]}</span>
          </motion.div>
          <motion.button
            className="meera-voice-close"
            type="button"
            onClick={onClose}
            aria-label="End voice conversation"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.35, delay: 0.18 }}
          >
            <span>End</span>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </motion.button>
          <div className="meera-voice-body">
            <motion.div
              className="meera-voice-presence"
              data-state={voiceState}
              initial={{ opacity: 0, scale: 0.72, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 18 }}
              transition={{ type: "spring", stiffness: 210, damping: 22, mass: 0.92, delay: 0.2 }}
            >
              <span className="meera-voice-orbit meera-voice-orbit-one" aria-hidden="true" />
              <motion.button
                ref={orbRef}
                className="meera-voice-logo"
                data-state={voiceState}
                type="button"
                onClick={handleLogoClick}
                onPointerMove={handlePointerMove}
                onPointerLeave={resetPointerLight}
                disabled={voiceState === "preparing" || voiceState === "transcribing"}
                aria-label={stateLabel}
                aria-busy={voiceState === "preparing" || voiceState === "thinking" || voiceState === "transcribing"}
                style={{
                  "--voice-progress": `${Math.max(12, preparation.progress) * 3.6}deg`,
                  "--voice-reactive-scale": String(1.03 + Math.max(0, Math.min(1, audioLevel)) * 0.22),
                  "--voice-reactive-opacity": String(0.16 + Math.max(0, Math.min(1, audioLevel)) * 0.5),
                } as React.CSSProperties}
                whileTap={{ scale: 0.965 }}
              >
                <span className="meera-voice-aura" aria-hidden="true" />
                <span className="meera-voice-rim" aria-hidden="true" />
                <span className="meera-voice-light" aria-hidden="true" />
                <img src={`${import.meta.env.BASE_URL}logo.png`} alt="MeeraAI" />
                <span className="meera-voice-waveform" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i /><i />
                </span>
                <span className="meera-voice-state-icon material-symbols-outlined" aria-hidden="true">
                  {VOICE_STATE_ICONS[voiceState]}
                </span>
                <span className="meera-voice-sr-status" aria-live="polite">{stateLabel}</span>
              </motion.button>
            </motion.div>
            <motion.div
              className="meera-voice-caption"
              data-state={voiceState}
              initial={{ opacity: 0, y: 15, scale: 0.965, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              role="status"
              aria-live="polite"
            >
              <div className="meera-voice-caption-meta">
                <span className="meera-voice-caption-speaker">
                  <i aria-hidden="true" />
                  {captionSpeaker}
                </span>
                <span className="meera-voice-caption-state">{captionState[voiceState]}</span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={captionText}
                  initial={{ opacity: 0, y: 7, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -5, filter: "blur(3px)" }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  {captionText}
                </motion.p>
              </AnimatePresence>
              {(voiceState === "thinking" || voiceState === "transcribing") && (
                <span className="meera-voice-caption-progress" aria-hidden="true" />
              )}
              <div className="meera-voice-caption-hint">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {voiceState === "speaking" || voiceState === "thinking" ? "touch_app" : "keyboard_voice"}
                </span>
                {interactionHint[voiceState]}
              </div>
              <span className="meera-voice-caption-glint" aria-hidden="true" />
            </motion.div>
            <motion.div
              className="meera-voice-shortcuts"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              aria-hidden="true"
            >
              <span><kbd>Space</kbd>{isSpeaking || isThinking ? "Interrupt" : isListening ? "Send" : "Talk"}</span>
              <i />
              <span><kbd>Esc</kbd>End session</span>
            </motion.div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
