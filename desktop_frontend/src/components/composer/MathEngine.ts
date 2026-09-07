/**
 * MathEngine.ts - Advanced Mathematical Semantic Engine & Security Scanner for MeeraAI
 * 
 * Solves:
 * 1. False positive math mode on conversational words ("solve", "sum", "pi", "limit", "proof", "simplify")
 * 2. False positive math mode on date ranges ("2024-2025"), versions ("3.10-3.11"), fractions, and times ("9-5")
 * 3. Accurate detection of true mathematical equations, LaTeX, calculus, and matrix expressions
 * 4. Micro-arithmetic calculator evaluator (instant preview without LLM call)
 * 5. Secret / API key leak detector (OpenAI, GitHub, AWS, private keys)
 * 6. PII redaction (emails, phone numbers, credit cards)
 * 7. Code auto-fence formatter and JSON / SQL prettifier
 */

export type MathModeSetting = "auto" | "forced" | "off";

export interface MathDetectionResult {
  isMath: boolean;
  confidence: number; // 0 to 1
  reason: string;
  latexSnippets: string[];
  hasFormulas: boolean;
  detectedTopics: string[];
}

export interface SecretFinding {
  type: string;
  snippet: string;
  description: string;
  index: number;
}

export interface SecretScanResult {
  hasLeak: boolean;
  findings: SecretFinding[];
}

export interface QuickMathResult {
  expression: string;
  result: string;
  type: "arithmetic" | "unit" | "percentage";
}

// ── 1. PRECISION MATH CONTEXT DETECTION ──────────────────────────────────────

// Conversational phrases that contain words like "solve", "limit", "pi", "proof", "sum", "simplify"
// but are strictly NOT mathematical tasks.
const NON_MATH_PHRASES = [
  /\b(?:solve|solving|fix|debug)\s+(?:this\s+)?(?:bug|issue|problem|error|conflict|glitch|crash|mystery|dispute|crisis|ticket|blocker)\b/i,
  /\b(?:solve|handle)\s+(?:world\s+hunger|climate\s+change|unemployment|inflation)\b/i,
  /\b(?:rate|time|speed|character|word|age|memory|request|daily|file|storage)\s+limit\b/i,
  /\b(?:limit|limits)\s+of\s+(?:human|ai|technology|growth|science|memory|patience)\b/i,
  /\b(?:without|no|upper|lower)\s+limit\b/i,
  /\b(?:raspberry|orange|banana)\s+pi\b/i,
  /\bpi\s+(?:hole|zero|model|board|os)\b/i,
  /\b(?:proof\s+of\s+concept|bulletproof|social\s+proof|foolproof|proofread|waterproof|proofreading)\b/i,
  /\b(?:sum\s+up|in\s+sum|summarize|summary|summaries)\b/i,
  /\b(?:simplify|simplifying)\s+(?:our\s+)?(?:process|workflow|life|system|architecture|code|design|ui|explanation|language)\b/i,
  /\b(?:to\s+simplify|keep\s+it\s+simple)\b/i,
  /\bversion\s+\d/i,
];

// Date and Version ranges: "2020-2024", "1990 - 2000", "v3.10 - 3.11", "pages 1-5", "9-5", "10/12/2024"
const NON_MATH_RANGES = [
  /\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)?\d{2}\b/, // Year ranges e.g. 2024-2025
  /\bv?\d+\.\d+(?:\.\d+)?\s*[-–]\s*v?\d+\.\d+(?:\.\d+)?\b/i, // Version ranges e.g. 3.10-3.12
  /\b(?:page|pages|p\.|ch\.|chapter|section|sec\.|room|grades?|step|steps)\s+\d+\s*[-–]\s*\d+\b/i,
  /\b\d{1,2}\s*[-–]\s*\d{1,2}\s*(?:am|pm|hours?|days?|weeks?|months?|years?|mins?|minutes?|secs?)\b/i, // "9-5 pm", "1-2 weeks"
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, // Dates e.g. 10/12/2024
  /\b\d+\s*[-–]\s*\d+\s+(?:score|ratio|win|loss|record)\b/i, // Score e.g. 2-1 win
  /\b(?:score|ratio)\s+(?:is|was)?\s*\d+\s*[-–:]\s*\d+\b/i,
  /\b(?:top|first|last)\s+\d+\s*[-–]\s*\d+\b/i,
];

// Mathematical equation patterns requiring actual algebraic / mathematical structure
const MATH_EQUATION_PATTERNS = [
  // Explicit formulas: y = mx + b, f(x) = x^2, E = mc^2
  /\b[a-zA-Z]\s*\([a-zA-Z,\s]+\)\s*=\s*[^=]/,
  /\b[yxfg]\s*=\s*[-+]?(?:\d+|[a-z])[\w\s+\-*/^().]+(?:=|\n|$)/i,
  // Polynomials / exponents: x^2, x^3, 2x^2 + 5x - 3 = 0
  /\b\d*[a-zA-Z]\^[0-9a-zA-Z]/,
  /\b\d*[a-zA-Z]\s*[+\-*/]\s*\d*[a-zA-Z]\s*=\s*[-+]?\d+/i,
  // Fractions: \frac{a}{b} or algebraic fraction with variables
  /\\frac\{[^}]+\}\{[^}]+\}/,
  // Calculus: \int, \sum, \lim, \prod, \partial, \nabla, d/dx, dy/dx
  /\\(?:int|iint|iiint|oint|sum|prod|lim|infty|partial|nabla|sqrt|cdot|times|div|pm|mp|approx|neq|leq|geq)(?![a-zA-Z])/,
  /\b(?:d[yxzt]\s*\/\s*d[xzt]|d\/d[xzt])\b/i,
  /\blim(?:sup|inf)?\s*(?:_|\bas\b)\s*[\w\\]+\s*(?:->|\\to|approaches)/i,
  // Greek letters in math context
  /\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Sigma|Phi|Psi|Omega)(?![a-zA-Z])/,
  // Matrices / Vectors
  /\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|Bmatrix|cases)\}/,
  /\b(?:det|eigenvalues?|eigenvectors?|determinants?|trace|rank)\b/i,
  // Set theory & logic symbols
  /[\u2200-\u22FF]/, // Mathematical Operators block: ∀, ∃, ∅, ∇, ∈, ∉, ∏, ∑, ∫, etc.
  // Explicit variable solving: "solve for x:", "solve 2x + 4 = 10", "evaluate integral of"
  /\b(?:solve\s+for\s+[a-z]|differentiate\s+[\w^+\-*/()]+|evaluate\s+the\s+(?:integral|derivative|limit|sum)|integrate\s+[\w^+\-*/()]+)\b/i,
  // Boxed equations: $$ ... $$ or $ ... $ with math characters inside
  /\$\$(?:[^$]|\\\$)+\$\$/,
  /\$(?:[^$\n]|\\\$)+[\^\\_=+\-*/<>](?:[^$\n]|\\\$)*\$/,
];

// Clean arithmetic operators isolated between numbers without date/version flags
// e.g. "calculate 45 * 12" or "what is 144 / 12" or "78 + 92"
const EXPLICIT_ARITHMETIC_PATTERN = /\b(?:calculate|compute|what\s+is|evaluate)\s+[-+]?\d+(?:\.\d+)?\s*(?:[+*x×÷/^-]|\*\*)\s*[-+]?\d+(?:\.\d+)?/i;

export function detectMathContext(text: string, manualMode: MathModeSetting = "auto"): MathDetectionResult {
  if (manualMode === "forced") {
    return {
      isMath: true,
      confidence: 1.0,
      reason: "Manual Override: Math mode is explicitly enabled by user.",
      latexSnippets: extractLatexSnippets(text),
      hasFormulas: true,
      detectedTopics: ["user-forced"],
    };
  }

  if (manualMode === "off") {
    return {
      isMath: false,
      confidence: 0.0,
      reason: "Manual Override: Math mode is explicitly disabled by user.",
      latexSnippets: [],
      hasFormulas: false,
      detectedTopics: [],
    };
  }

  const raw = (text || "").trim();
  if (!raw || raw.length < 2) {
    return { isMath: false, confidence: 0, reason: "Input too short", latexSnippets: [], hasFormulas: false, detectedTopics: [] };
  }

  const detectedTopics: string[] = [];
  const latexSnippets = extractLatexSnippets(raw);

  // 1. Check for genuine LaTeX formulas
  if (latexSnippets.length > 0) {
    return {
      isMath: true,
      confidence: 0.98,
      reason: `Detected ${latexSnippets.length} LaTeX formula expression(s).`,
      latexSnippets,
      hasFormulas: true,
      detectedTopics: ["latex-formula"],
    };
  }

  // 2. Check for Non-Math conversational exclusions
  for (const nonMathPhrase of NON_MATH_PHRASES) {
    if (nonMathPhrase.test(raw)) {
      // If conversational exclusion is present and there are NO explicit math symbols/equations, reject math
      const hasMathChars = /[\u2200-\u22FF\\^]/.test(raw) || /=\s*[-+]?\d+/.test(raw);
      if (!hasMathChars) {
        return {
          isMath: false,
          confidence: 0.05,
          reason: "Identified conversational usage (e.g. solve bug, time limit, summarize).",
          latexSnippets: [],
          hasFormulas: false,
          detectedTopics: ["conversational-disambiguation"],
        };
      }
    }
  }

  // 3. Check for Date / Range exclusions
  for (const rangePattern of NON_MATH_RANGES) {
    if (rangePattern.test(raw)) {
      // If it only matched because of year ranges or versions like "2024-2025" or "3.10-3.11", reject math
      const hasRealMathEquation = MATH_EQUATION_PATTERNS.some((pat) => pat.test(raw));
      if (!hasRealMathEquation) {
        return {
          isMath: false,
          confidence: 0.05,
          reason: "Identified date, version, or numerical range rather than arithmetic operation.",
          latexSnippets: [],
          hasFormulas: false,
          detectedTopics: ["range-disambiguation"],
        };
      }
    }
  }

  // 4. Check for Explicit Equations & Mathematical Constructs
  for (const pattern of MATH_EQUATION_PATTERNS) {
    if (pattern.test(raw)) {
      detectedTopics.push("algebraic-equation");
    }
  }

  // 5. Check for Calculus
  if (/\b(integral|derivative|calculus|differentiat|anti-derivative|taylor\s+series)\b/i.test(raw)) {
    detectedTopics.push("calculus");
  }

  // 6. Check for Linear Algebra / Matrices
  if (/\b(matrix\s+multiplication|eigenvalue|eigenvector|determinant\s+of|cross\s+product|dot\s+product)\b/i.test(raw)) {
    detectedTopics.push("linear-algebra");
  }

  // 7. Check for Explicit Arithmetic computation request
  if (EXPLICIT_ARITHMETIC_PATTERN.test(raw)) {
    detectedTopics.push("arithmetic-computation");
  }

  const isMath = detectedTopics.length > 0;
  const confidence = isMath ? Math.min(0.95, 0.6 + detectedTopics.length * 0.15) : 0;

  return {
    isMath,
    confidence,
    reason: isMath
      ? `Mathematical intent verified: ${detectedTopics.join(", ")}.`
      : "Standard natural language prompt.",
    latexSnippets,
    hasFormulas: latexSnippets.length > 0,
    detectedTopics,
  };
}

export function extractLatexSnippets(text: string): string[] {
  const results: string[] = [];
  // Match $$ ... $$
  const blockMatches = text.matchAll(/\$\$([\s\S]*?)\$\$/g);
  for (const match of blockMatches) {
    const formula = match[1]?.trim();
    if (formula) results.push(formula);
  }
  // Match $ ... $ (ensuring not currency $10 or $100)
  const inlineMatches = text.matchAll(/(?<!\$)\$(?!\$)([^\n$]+?)(?<!\$)\$(?!\$)/g);
  for (const match of inlineMatches) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    // Disqualify currency patterns e.g. "$50", "$ 1,000.00"
    if (/^\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s*(?:usd|eur|aud|dollars|bucks|per|mo|yr))?$/i.test(candidate)) {
      continue;
    }
    // Must contain math indicators (operators, backslash, superscripts, subscripts, Greek, equality)
    if (/[\\^_=+*<>/\u2200-\u22FF]/.test(candidate) || /\b[a-zA-Z]\b/.test(candidate)) {
      results.push(candidate);
    }
  }
  return results;
}

// ── 2. QUICK ARITHMETIC & UNIT CALCULATOR EVALUATOR ──────────────────────────

export function evaluateQuickMath(text: string): QuickMathResult | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  // Direct calculation query: "calc: 125 * 1.18" or "= 45 + 55"
  let expr = "";
  if (/^calc:\s*/i.test(trimmed)) {
    expr = trimmed.replace(/^calc:\s*/i, "").trim();
  } else if (/^=\s*\d/.test(trimmed)) {
    expr = trimmed.replace(/^=\s*/, "").trim();
  } else if (/^(?:what\s+is|calculate|compute)\s+([\d\s+\-*/().^%x×÷]+)\??$/i.test(trimmed)) {
    const m = trimmed.match(/^(?:what\s+is|calculate|compute)\s+([\d\s+\-*/().^%x×÷]+)\??$/i);
    expr = m?.[1]?.trim() ?? "";
  } else if (/^[-+]?\d+(?:\.\d+)?\s*(?:[+*x×÷/^-]|\*\*)\s*[-+]?\d+(?:\.\d+)?(?:\s*(?:[+*x×÷/^-]|\*\*)\s*[-+]?\d+(?:\.\d+)?)*$/.test(trimmed)) {
    // Pure arithmetic string e.g. "45 * 12 + 10"
    expr = trimmed;
  }

  if (!expr) return null;

  // Normalize operators: "x", "×" -> "*", "÷" -> "/", "^" -> "**"
  const sanitized = expr
    .replace(/[x×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/\^/g, "**")
    .replace(/\s+/g, "");

  // Safe characters check
  if (!/^[\d+\-*/().%]+$/.test(sanitized)) {
    return null;
  }

  try {
    // Safe evaluation using Function with isolated scope
    const evalFn = new Function(`"use strict"; return (${sanitized});`);
    const val = evalFn();
    if (typeof val === "number" && !Number.isNaN(val) && Number.isFinite(val)) {
      // Format cleanly (e.g. 12.3456 -> 12.35 if long decimals, or exact)
      const formatted = Number.isInteger(val) ? val.toString() : parseFloat(val.toFixed(6)).toString();
      return {
        expression: expr,
        result: formatted,
        type: "arithmetic",
      };
    }
  } catch {
    // Ignore syntax or computation errors
  }

  return null;
}

// ── 3. SECRET & CREDENTIAL LEAK SCANNER ─────────────────────────────────────

const SECRET_PATTERNS: { type: string; description: string; regex: RegExp }[] = [
  { type: "OpenAI API Key", description: "OpenAI Secret Key", regex: /\bsk-[A-Za-z0-9-_]{20,64}\b/g },
  { type: "GitHub Token", description: "GitHub Personal Access Token", regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g },
  { type: "AWS Access Key", description: "Amazon Web Services Access Key ID", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "AWS Secret Key", description: "AWS Secret Access Key", regex: /\b[A-Za-z0-9/+=]{40}\b(?=.*aws)/gi },
  { type: "HuggingFace Token", description: "HuggingFace API Token", regex: /\bhf_[A-Za-z0-9]{34,64}\b/g },
  { type: "Private Key", description: "RSA / SSH Private Cryptographic Key", regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
  { type: "Slack Token", description: "Slack Bot / User Token", regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,72}\b/g },
  { type: "Stripe Key", description: "Stripe Secret API Key", regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,99}\b/g },
];

export function scanForSecrets(text: string): SecretScanResult {
  const findings: SecretFinding[] = [];
  if (!text) return { hasLeak: false, findings: [] };

  for (const item of SECRET_PATTERNS) {
    const matches = text.matchAll(item.regex);
    for (const match of matches) {
      const val = match[0];
      const masked = `${val.slice(0, 4)}...${val.slice(-4)}`;
      findings.push({
        type: item.type,
        snippet: masked,
        description: item.description,
        index: match.index ?? 0,
      });
    }
  }

  return {
    hasLeak: findings.length > 0,
    findings,
  };
}

// ── 4. PII (PERSONALLY IDENTIFIABLE INFORMATION) REDACTION ───────────────────

export function redactPII(text: string): { redactedText: string; count: number } {
  if (!text) return { redactedText: "", count: 0 };
  let current = text;
  let count = 0;

  // 1. Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
  current = current.replace(emailRegex, () => {
    count++;
    return "[EMAIL_REDACTED]";
  });

  // 2. Credit Cards (Luhn formatted digits: 13 to 19 digits with optional spaces or dashes)
  const ccRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{15,16}\b/g;
  current = current.replace(ccRegex, () => {
    count++;
    return "[CARD_REDACTED]";
  });

  // 3. Social Security Numbers (SSN: XXX-XX-XXXX)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  current = current.replace(ssnRegex, () => {
    count++;
    return "[SSN_REDACTED]";
  });

  // 4. International / US Phone numbers
  const phoneRegex = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  current = current.replace(phoneRegex, () => {
    count++;
    return "[PHONE_REDACTED]";
  });

  return { redactedText: current, count };
}

// ── 5. CODE AUTO-FENCE & BEAUTIFIER ──────────────────────────────────────────

export function autoFenceCode(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return text;

  // If already fenced, return as-is
  if (/^```[\s\S]*```$/m.test(trimmed)) {
    return text;
  }

  // Detect predominant language
  let lang = "text";
  if (/(?:import\s+React|export\s+default|const\s+\w+\s*=|function\s+\w+\s*\(|<[a-zA-Z0-9]+.*>)/.test(trimmed)) {
    lang = /<[a-zA-Z0-9]+.*>/.test(trimmed) ? "tsx" : "typescript";
  } else if (/(?:def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|class\s+\w+:|if\s+__name__\s*==)/.test(trimmed)) {
    lang = "python";
  } else if (/(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE)/i.test(trimmed)) {
    lang = "sql";
  } else if (/^<!DOCTYPE html>|<html[\s>]/i.test(trimmed)) {
    lang = "html";
  } else if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      lang = "json";
    } catch {
      // not json
    }
  }

  return `\`\`\`${lang}\n${trimmed}\n\`\`\``;
}

export function prettifyJsonOrSql(text: string): { formatted: string; changed: boolean } {
  const trimmed = (text || "").trim();
  if (!trimmed) return { formatted: text, changed: false };

  // Try JSON prettification
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      const formatted = JSON.stringify(parsed, null, 2);
      if (formatted !== trimmed) {
        return { formatted, changed: true };
      }
    } catch {
      // ignore
    }
  }

  return { formatted: text, changed: false };
}
