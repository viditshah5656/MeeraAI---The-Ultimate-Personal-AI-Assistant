import React, { useState, useMemo, useCallback } from "react";
import { LuTable, LuCopy, LuCheck, LuGitBranch, LuCode, LuLayoutGrid } from "react-icons/lu";
import { copyText } from "../utils/clipboard";

export interface ParsedAsciiTable {
  title: string;
  headers: string[];
  rows: string[][];
}

// Check if a block of text represents an ASCII or box-drawing table
export function isAsciiTable(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lines = text.trim().split("\n");
  if (lines.length < 3) return false;

  const hasBoxChars = lines.some((l) => /[┌┬┐├┼┤└┴┘│─]/.test(l));
  const hasAsciiBorders = lines.some((l) => /^\+[-+=\s]+\+$/.test(l.trim()));
  const hasPipeRows = lines.filter((l) => l.includes("|") || l.includes("│")).length >= 2;

  return (hasBoxChars || hasAsciiBorders) && hasPipeRows;
}

// Parses an ASCII/box-drawing table into structured title, headers, and rows with cell-wrapping support
export function parseAsciiTable(text: string): ParsedAsciiTable | null {
  if (!isAsciiTable(text)) return null;

  const rawLines = text.trim().split("\n").map((l) => l.trimEnd());
  let title = "";
  const tableLines: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isBorder = /[┌┬┐├┼┤└┴┘─]/.test(trimmed) || /^\+[-+=\s]+\+$/.test(trimmed);
    const hasPipe = trimmed.includes("│") || trimmed.includes("|");

    if (isBorder || hasPipe) {
      tableLines.push(line);
    } else if (tableLines.length === 0) {
      // Possible title line above table (e.g. "SEASONALITY & PRICING MATRIX")
      title = (title ? title + " " : "") + trimmed;
    }
  }

  if (tableLines.length < 3) return null;

  const headerLines: string[][] = [];
  const dataRows: string[][] = [];
  let currentRowLines: string[][] = [];
  let isHeaderSection = true;

  for (const line of tableLines) {
    const trimmed = line.trim();
    const isTopBorder = /^[┌+].*[┐+]$/.test(trimmed) && !trimmed.includes("│") && !/\|[^+]/.test(trimmed);
    const isBottomBorder = /^[└+].*[┘+]$/.test(trimmed) && !trimmed.includes("│") && !/\|[^+]/.test(trimmed);
    const isDivider =
      (/[├┼┤]/.test(trimmed) || (/^[+\-]+$/.test(trimmed) && trimmed.includes("+"))) &&
      !trimmed.includes("│");

    if (isTopBorder) continue;

    if (isDivider || isBottomBorder) {
      if (isHeaderSection && currentRowLines.length > 0) {
        const numCols = Math.max(...currentRowLines.map((r) => r.length));
        const merged: string[] = Array(numCols).fill("");
        for (const r of currentRowLines) {
          for (let i = 0; i < numCols; i++) {
            if (r[i]) merged[i] = (merged[i] + " " + r[i]).trim();
          }
        }
        headerLines.push(merged);
        isHeaderSection = false;
        currentRowLines = [];
      } else if (currentRowLines.length > 0) {
        const numCols =
          headerLines.length > 0 && headerLines[0].length > 0
            ? headerLines[0].length
            : Math.max(...currentRowLines.map((r) => r.length));
        const merged: string[] = Array(numCols).fill("");
        for (const r of currentRowLines) {
          for (let i = 0; i < numCols; i++) {
            if (r[i]) merged[i] = (merged[i] + " " + r[i]).trim();
          }
        }
        dataRows.push(merged);
        currentRowLines = [];
      }
      continue;
    }

    if (line.includes("│") || line.includes("|")) {
      const sep = line.includes("│") ? "│" : "|";
      let cells = line.split(sep).map((c) => c.trim());
      if (cells.length > 1 && cells[0] === "") cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      if (cells.length > 0) {
        currentRowLines.push(cells);
      }
    }
  }

  // Flush any trailing row
  if (currentRowLines.length > 0) {
    if (isHeaderSection && headerLines.length === 0) {
      headerLines.push(currentRowLines[0]);
    } else {
      const numCols =
        headerLines.length > 0 && headerLines[0].length > 0
          ? headerLines[0].length
          : Math.max(...currentRowLines.map((r) => r.length));
      const merged: string[] = Array(numCols).fill("");
      for (const r of currentRowLines) {
        for (let i = 0; i < numCols; i++) {
          if (r[i]) merged[i] = (merged[i] + " " + r[i]).trim();
        }
      }
      dataRows.push(merged);
    }
  }

  const finalHeaders = headerLines.length > 0 ? headerLines[0] : [];
  if (finalHeaders.length === 0 && dataRows.length === 0) return null;

  return {
    title: title.replace(/^[#*_\-\s]+|[#*_\-\s]+$/g, "").trim(),
    headers: finalHeaders,
    rows: dataRows,
  };
}

// Check if a block represents an ASCII flowchart, route graph, or process diagram
export function isAsciiDiagram(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (isAsciiTable(text)) return false;

  const lines = text.trim().split("\n");
  if (lines.length < 2) return false;

  const arrowPattern = /(?:──>|-->|<──|◄──|▲|▼|►|◄|\->|<\-)/;
  const transitPattern = /(?:transit|transfer|mins?|hours?|harbor|airport|flight|drive)/i;
  const stepFlowPattern = /^(?:Day \d+|\d{1,2}:\d{2}\s*(?:AM|PM)|Step \d+)/im;
  const routeBoxPattern = /\[[^\]]+\]\s*(?:──>|-->|<──|\|)/;

  const hasArrows = lines.some((l) => arrowPattern.test(l));
  const hasStepFlow = lines.some((l) => stepFlowPattern.test(l) && arrowPattern.test(l));
  const hasRouteBoxes = lines.some((l) => routeBoxPattern.test(l));
  const hasTransitFlow = lines.filter((l) => (l.includes("│") || l.includes("|")) && transitPattern.test(l)).length >= 2;

  return hasArrows || hasStepFlow || hasRouteBoxes || hasTransitFlow;
}

export function extractDiagramTitle(text: string): { title: string; body: string } {
  const lines = text.trim().split("\n");
  if (lines.length > 1) {
    const first = lines[0].trim();
    if (
      /^(?:BALI ROUTE FLOWCHART|\d+-DAY ROUTING FLOW|[A-Z0-9\s_\-]{4,50}(?:FLOW|CHART|DIAGRAM|LAYOUT|STEPS|ROADMAP|PROCESS|PIPELINE))$/i.test(
        first
      ) &&
      !/[┌├└─│|]/.test(first)
    ) {
      return {
        title: first.replace(/^[#*_\-\s]+|[#*_\-\s]+$/g, "").trim(),
        body: lines.slice(1).join("\n").trim(),
      };
    }
  }
  return { title: "", body: text.trim() };
}

// ============================================================================
// COMPONENT 1: AsciiTableCard
// ============================================================================
export const AsciiTableCard: React.FC<{
  rawContent?: string;
  parsed?: ParsedAsciiTable;
}> = ({ rawContent, parsed: inputParsed }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    if (inputParsed) return inputParsed;
    if (rawContent) return parseAsciiTable(rawContent);
    return null;
  }, [inputParsed, rawContent]);

  const handleCopy = useCallback(async () => {
    if (!parsed) {
      if (rawContent) await copyText(rawContent);
      return;
    }
    // Format as clean TSV / Markdown
    const tsv = [
      parsed.headers.join("\t"),
      ...parsed.rows.map((r) => r.join("\t")),
    ].join("\n");
    if (await copyText(tsv)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }, [parsed, rawContent]);

  if (!parsed && !rawContent) return null;

  const displayTitle = parsed?.title || "Comparative Data Matrix";

  return (
    <div className="ascii-table-card">
      <div className="ascii-card-header">
        <div className="ascii-header-left">
          <span className="ascii-badge table-badge">
            <LuTable className="ascii-badge-icon" />
            <span>Table Matrix</span>
          </span>
          <h4 className="ascii-card-title">{displayTitle}</h4>
        </div>
        <div className="ascii-header-actions">
          <button
            type="button"
            className="ascii-btn-toggle"
            onClick={() => setShowRaw((prev) => !prev)}
            title="Toggle raw ASCII text"
          >
            {showRaw ? <LuLayoutGrid size={13} /> : <LuCode size={13} />}
            <span>{showRaw ? "Formatted" : "Raw"}</span>
          </button>
          <button
            type="button"
            className="ascii-btn-copy"
            onClick={handleCopy}
            title="Copy table data"
          >
            {copied ? <LuCheck size={13} /> : <LuCopy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div className="ascii-table-body">
        {showRaw && rawContent ? (
          <pre className="ascii-raw-pre">{rawContent}</pre>
        ) : parsed && parsed.headers.length > 0 ? (
          <div className="ascii-table-scroll">
            <table className="ascii-html-table">
              <thead>
                <tr>
                  {parsed.headers.map((h, i) => (
                    <th key={`th-${i}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${rIdx}-${cIdx}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rawContent ? (
          <pre className="ascii-raw-pre">{rawContent}</pre>
        ) : null}
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT 2: AsciiDiagramCard
// ============================================================================
export const AsciiDiagramCard: React.FC<{
  content: string;
  title?: string;
}> = ({ content, title: propTitle }) => {
  const [copied, setCopied] = useState(false);

  const { title: detectedTitle, body } = useMemo(() => {
    return extractDiagramTitle(content);
  }, [content]);

  const displayTitle = propTitle || detectedTitle || "Routing & Architecture Flowchart";

  const handleCopy = useCallback(async () => {
    if (await copyText(content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }, [content]);

  // Transform lines to highlight nodes, arrows, and transit labels
  const formattedHtml = useMemo(() => {
    const lines = body.split("\n");
    return lines
      .map((line) => {
        let escaped = line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        // Highlight bracketed nodes: [Ubud (6 Days)]
        escaped = escaped.replace(
          /\[([^\]]+)\]/g,
          '<span class="diagram-node">[$1]</span>'
        );

        // Highlight arrows
        escaped = escaped.replace(
          /(──&gt;|--&gt;|&lt;──|◄──|▲|▼|►|◄|--&gt;|&lt;--)/g,
          '<span class="diagram-arrow">$1</span>'
        );

        // Highlight timing/transit info
        escaped = escaped.replace(
          /(\([0-9a-zA-Z\s\-–]+\b(?:transit|transfer|boat|min|hr|hours?|days?)\b[0-9a-zA-Z\s\-–]*\))/gi,
          '<span class="diagram-transit">$1</span>'
        );

        return escaped;
      })
      .join("\n");
  }, [body]);

  return (
    <div className="ascii-diagram-card">
      <div className="ascii-card-header">
        <div className="ascii-header-left">
          <span className="ascii-badge diagram-badge">
            <LuGitBranch className="ascii-badge-icon" />
            <span>Process Flowchart</span>
          </span>
          <h4 className="ascii-card-title">{displayTitle}</h4>
        </div>
        <div className="ascii-header-actions">
          <button
            type="button"
            className="ascii-btn-copy"
            onClick={handleCopy}
            title="Copy flowchart diagram"
          >
            {copied ? <LuCheck size={13} /> : <LuCopy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div className="ascii-diagram-body">
        <div className="ascii-diagram-scroll">
          <pre
            className="ascii-diagram-canvas"
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        </div>
      </div>
    </div>
  );
};
