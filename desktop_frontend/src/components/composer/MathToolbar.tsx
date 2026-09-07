import React, { useState, useMemo } from "react";
import { FiChevronDown, FiChevronUp, FiCheck } from "react-icons/fi";
import { type MathModeSetting } from "./MathEngine";

export interface MathToolbarProps {
  mathMode: MathModeSetting;
  setMathMode: (mode: MathModeSetting) => void;
  isMathDetected: boolean;
  latexSnippets: string[];
  onInsertSymbol: (symbol: string, cursorOffset?: number) => void;
}

interface MathSymbolGroup {
  name: string;
  symbols: { label: string; insert: string; latex: string; cursorOffset?: number }[];
}

const MATH_SYMBOL_GROUPS: MathSymbolGroup[] = [
  {
    name: "Calculus",
    symbols: [
      { label: "∫ dx", insert: "\\int_{a}^{b} f(x) \\, dx", latex: "\\int" },
      { label: "d/dx", insert: "\\frac{d}{dx}\\left[ x \\right]", latex: "\\frac{d}{dx}" },
      { label: "lim", insert: "\\lim_{x \\to 0} ", latex: "\\lim" },
      { label: "∑", insert: "\\sum_{i=1}^{n} ", latex: "\\sum" },
      { label: "∏", insert: "\\prod_{i=1}^{n} ", latex: "\\prod" },
      { label: "∂", insert: "\\partial ", latex: "\\partial" },
      { label: "∇", insert: "\\nabla ", latex: "\\nabla" },
      { label: "√x", insert: "\\sqrt{x}", latex: "\\sqrt{x}" },
    ],
  },
  {
    name: "Greek",
    symbols: [
      { label: "α", insert: "\\alpha ", latex: "\\alpha" },
      { label: "β", insert: "\\beta ", latex: "\\beta" },
      { label: "θ", insert: "\\theta ", latex: "\\theta" },
      { label: "π", insert: "\\pi ", latex: "\\pi" },
      { label: "σ", insert: "\\sigma ", latex: "\\sigma" },
      { label: "λ", insert: "\\lambda ", latex: "\\lambda" },
      { label: "μ", insert: "\\mu ", latex: "\\mu" },
      { label: "Δ", insert: "\\Delta ", latex: "\\Delta" },
      { label: "Ω", insert: "\\Omega ", latex: "\\Omega" },
    ],
  },
  {
    name: "Operators & Sets",
    symbols: [
      { label: "±", insert: "\\pm ", latex: "\\pm" },
      { label: "≠", insert: "\\neq ", latex: "\\neq" },
      { label: "≤", insert: "\\le ", latex: "\\le" },
      { label: "≥", insert: "\\ge ", latex: "\\ge" },
      { label: "≈", insert: "\\approx ", latex: "\\approx" },
      { label: "∞", insert: "\\infty ", latex: "\\infty" },
      { label: "∈", insert: "\\in ", latex: "\\in" },
      { label: "⊂", insert: "\\subset ", latex: "\\subset" },
      { label: "∪", insert: "\\cup ", latex: "\\cup" },
      { label: "∩", insert: "\\cap ", latex: "\\cap" },
      { label: "ℝ", insert: "\\mathbb{R} ", latex: "\\mathbb{R}" },
    ],
  },
  {
    name: "Matrix & Structures",
    symbols: [
      {
        label: "2x2 Matrix",
        insert: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
        latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
      },
      {
        label: "Fraction",
        insert: "\\frac{numerator}{denominator}",
        latex: "\\frac{a}{b}",
      },
      {
        label: "Cases",
        insert: "\\begin{cases} x & \\text{if } x \\ge 0 \\\\ -x & \\text{if } x < 0 \\end{cases}",
        latex: "\\begin{cases} ... \\end{cases}",
      },
    ],
  },
];

export const MathToolbar: React.FC<MathToolbarProps> = ({
  mathMode,
  setMathMode,
  isMathDetected,
  latexSnippets,
  onInsertSymbol,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Cycle tri-state mode on click: Auto -> Forced -> Off -> Auto
  const cycleMode = () => {
    if (mathMode === "auto") setMathMode("forced");
    else if (mathMode === "forced") setMathMode("off");
    else setMathMode("auto");
  };

  const modeBadge = useMemo(() => {
    if (mathMode === "forced") {
      return { label: "Math: Forced On", className: "mode-forced", hint: "Math solving envelope active for all queries" };
    }
    if (mathMode === "off") {
      return { label: "Math: Off", className: "mode-off", hint: "Math mode disabled (natural chat mode)" };
    }
    return {
      label: isMathDetected ? "Math: Detected (Auto)" : "Math: Auto",
      className: "mode-auto",
      hint: isMathDetected ? "Auto-detected mathematical query" : "Auto-detection enabled",
    };
  }, [mathMode, isMathDetected]);

  return (
    <div className="smart-composer-math-toolbar-wrapper">
      {/* 1. Live KaTeX Micro-Preview Tooltip when user types LaTeX */}
      {latexSnippets.length > 0 && (
        <div className="composer-latex-preview-tooltip" title="Formula syntax preview">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400 opacity-80">TeX:</span>
          <code className="font-mono text-xs max-w-md truncate text-sky-200">${latexSnippets[latexSnippets.length - 1]}$</code>
        </div>
      )}

      {/* 2. Tri-state Math Mode Pill & Palette Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={`composer-math-pill ${modeBadge.className}`}
          onClick={cycleMode}
          title={`${modeBadge.hint} (Click to toggle Auto / Forced / Off)`}
        >
          <span>∑</span>
          <span>{modeBadge.label}</span>
        </button>

        <button
          type="button"
          className={`composer-tool-btn ${paletteOpen ? "active" : ""}`}
          onClick={() => setPaletteOpen(!paletteOpen)}
          title="Toggle Math Formula & Symbol Palette"
          aria-label="Toggle Math Symbol Palette"
        >
          {paletteOpen ? <FiChevronUp /> : <FiChevronDown />}
        </button>
      </div>

      {/* 3. Collapsible Math Symbol Palette Drawer */}
      {paletteOpen && (
        <div className="composer-math-palette">
          <div className="math-palette-tabs">
            {MATH_SYMBOL_GROUPS.map((group, idx) => (
              <button
                key={group.name}
                type="button"
                className={`math-palette-tab ${activeTab === idx ? "active" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                {group.name}
              </button>
            ))}
          </div>

          <div className="math-symbol-grid">
            {MATH_SYMBOL_GROUPS[activeTab]?.symbols.map((sym) => (
              <button
                key={sym.label}
                type="button"
                className="math-symbol-btn"
                onClick={() => onInsertSymbol(sym.insert, sym.cursorOffset)}
                title={`Insert ${sym.label}`}
              >
                {sym.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MathToolbar;
