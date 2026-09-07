import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import "./MeeraGlassLoader.css";

export interface MeeraGlassLoaderProps {
  active?: boolean;
  variant?: "fullscreen" | "section" | "inline" | "button";
  title?: string;
  subtitle?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Premium glassmorphic loading animation representing Meera AI's quantum neural synthesis core.
 * Uses GPU-accelerated CSS transforms for buttery smooth 60fps performance on low & high spec machines.
 */
export const MeeraGlassLoader: React.FC<MeeraGlassLoaderProps> = ({
  active = true,
  variant = "fullscreen",
  title = "Synthesizing Neural Layout",
  subtitle = "Calibrating Hardware & Memory Layers",
  className = "",
  style = {},
}) => {
  if (!active && variant === "button") return null;

  if (variant === "button") {
    return (
      <span className={`meera-btn-loader ${className}`} style={style}>
        <span className="meera-micro-orb" aria-hidden="true" />
        {title && <span style={{ fontSize: "0.85em" }}>{title}</span>}
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`meera-glass-inline ${className}`} style={style}>
        <div className="meera-quantum-orb" aria-hidden="true">
          <div className="meera-orbital-ring-outer" />
          <div className="meera-orbital-ring-mid" />
          <div className="meera-crystal-core">
            <svg className="meera-core-spark" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong style={{ fontSize: "0.86rem", fontWeight: 700, color: "#1e293b" }}>{title}</strong>
          <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{subtitle}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`meera-glass-overlay ${variant === "section" ? "is-section" : ""} ${active ? "is-active" : ""} ${className}`}
      style={style}
      aria-live="polite"
      aria-busy={active}
    >
      <div className="meera-loader-stage">


        {/* High-Glass HUD Card */}
        <div className="meera-loader-hud">
          <div className="meera-loader-title">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00f2fe, #f72585)",
                boxShadow: "0 0 8px #00f2fe",
              }}
              aria-hidden="true"
            />
            {title}
          </div>
          {subtitle && <div className="meera-loader-subtitle">{subtitle}</div>}
          <div className="meera-quantum-track">
            <div className="meera-quantum-bar" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Global Layout Transition Context & Hook ────────────────────────────── */

interface LayoutTransitionContextValue {
  isTransitioning: boolean;
  transitionTitle: string;
  transitionSubtitle: string;
  triggerTransition: (
    action: () => void | Promise<void>,
    options?: { title?: string; subtitle?: string; minDuration?: number }
  ) => Promise<void>;
}

const LayoutTransitionContext = createContext<LayoutTransitionContextValue>({
  isTransitioning: false,
  transitionTitle: "Synthesizing Neural Layout",
  transitionSubtitle: "Calibrating Hardware & Memory Layers",
  triggerTransition: async () => {},
});

export const LayoutTransitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionTitle, setTransitionTitle] = useState("Synthesizing Neural Layout");
  const [transitionSubtitle, setTransitionSubtitle] = useState("Calibrating Hardware & Memory Layers");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerTransition = useCallback(
    async (
      action: () => void | Promise<void>,
      options?: { title?: string; subtitle?: string; minDuration?: number }
    ) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setTransitionTitle(options?.title || "Synthesizing Neural Layout");
      setTransitionSubtitle(options?.subtitle || "Optimizing Interface for Smoothness");
      setIsTransitioning(true);

      const minDuration = options?.minDuration ?? 200;
      const startTime = Date.now();

      try {
        await Promise.resolve(action());
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minDuration - elapsed);

        timeoutRef.current = setTimeout(() => {
          setIsTransitioning(false);
        }, remaining);
      }
    },
    []
  );

  return (
    <LayoutTransitionContext.Provider
      value={{
        isTransitioning,
        transitionTitle,
        transitionSubtitle,
        triggerTransition,
      }}
    >
      {children}
      {/* Global glassmorphic transition overlay */}
      {isTransitioning && (
        <MeeraGlassLoader
          active={isTransitioning}
          variant="fullscreen"
          title={transitionTitle}
          subtitle={transitionSubtitle}
        />
      )}
    </LayoutTransitionContext.Provider>
  );
};

export const useLayoutTransition = () => useContext(LayoutTransitionContext);

export default MeeraGlassLoader;
