import React, { useState, useCallback, useId } from "react";
import {
  LuDownload,
  LuEye,
  LuCopy,
  LuCheck,
  LuFileText,
  LuLayers,
  LuShieldCheck,
  LuExternalLink
} from "react-icons/lu";

export interface DocumentItem {
  format: "pdf" | "docx" | "html" | "markdown" | string;
  url: string;
  filename: string;
  filesize?: string | number;
  page_count?: number;
  word_count?: number;
  reading_time_minutes?: number;
  label?: string;
  document_id?: string;
}

export interface DocumentDownloadHubProps {
  title?: string;
  documentId?: string;
  documents: DocumentItem[];
  timestamp?: string;
  summary?: string;
  onPreview?: (doc: DocumentItem) => void;
  onDownload?: (doc: DocumentItem) => void;
}

// Bespoke Vector SVG Emblems
const PdfEmblem: React.FC = () => (
  <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="PDF Emblem">
    <rect x="1" y="1" width="34" height="42" rx="5" fill="#1C1822" stroke="#E11D48" strokeWidth="1.5" strokeOpacity="0.4" />
    <path d="M22 1V10C22 11.1046 22.8954 12 24 12H35" stroke="#E11D48" strokeWidth="1.5" strokeOpacity="0.6" />
    <rect x="4" y="24" width="28" height="13" rx="3" fill="#E11D48" />
    <text x="18" y="33.5" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" letterSpacing="0.05em">PDF</text>
    <line x1="8" y1="16" x2="18" y2="16" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    <line x1="8" y1="20" x2="15" y2="20" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
  </svg>
);

const DocxEmblem: React.FC = () => (
  <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="DOCX Emblem">
    <rect x="1" y="1" width="34" height="42" rx="5" fill="#121D2C" stroke="#2563EB" strokeWidth="1.5" strokeOpacity="0.4" />
    <path d="M22 1V10C22 11.1046 22.8954 12 24 12H35" stroke="#2563EB" strokeWidth="1.5" strokeOpacity="0.6" />
    <rect x="4" y="24" width="28" height="13" rx="3" fill="#2563EB" />
    <text x="18" y="33.5" fill="#FFFFFF" fontSize="7.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" letterSpacing="0.03em">DOCX</text>
    <line x1="8" y1="16" x2="18" y2="16" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    <line x1="8" y1="20" x2="16" y2="20" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
  </svg>
);

const HtmlEmblem: React.FC = () => (
  <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="HTML Emblem">
    <rect x="1" y="1" width="34" height="42" rx="5" fill="#122521" stroke="#059669" strokeWidth="1.5" strokeOpacity="0.4" />
    <path d="M22 1V10C22 11.1046 22.8954 12 24 12H35" stroke="#059669" strokeWidth="1.5" strokeOpacity="0.6" />
    <rect x="4" y="24" width="28" height="13" rx="3" fill="#059669" />
    <text x="18" y="33.5" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" letterSpacing="0.05em">HTML</text>
    <path d="M10 17L7 19L10 21" stroke="#34D399" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 17L20 19L17 21" stroke="#34D399" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="14.5" y1="16" x2="12.5" y2="22" stroke="#34D399" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const MarkdownEmblem: React.FC = () => (
  <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Markdown Emblem">
    <rect x="1" y="1" width="34" height="42" rx="5" fill="#1E162B" stroke="#7C3AED" strokeWidth="1.5" strokeOpacity="0.4" />
    <path d="M22 1V10C22 11.1046 22.8954 12 24 12H35" stroke="#7C3AED" strokeWidth="1.5" strokeOpacity="0.6" />
    <rect x="4" y="24" width="28" height="13" rx="3" fill="#7C3AED" />
    <text x="18" y="33.5" fill="#FFFFFF" fontSize="8.5" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" letterSpacing="0.05em">MD</text>
    <path d="M8 17V21M8 17L10.5 19.5L13 17V21" stroke="#C084FC" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 19.5L19 21.5L21 19.5M19 17V21.5" stroke="#C084FC" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function formatBytes(bytes?: number | string): string {
  if (!bytes) return "";
  if (typeof bytes === "string") {
    if (bytes.toLowerCase().includes("kb") || bytes.toLowerCase().includes("mb")) {
      return bytes;
    }
    const num = parseFloat(bytes);
    if (isNaN(num)) return bytes;
    bytes = num;
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFormatMeta(format: string): {
  name: string;
  tagClass: string;
  emblem: React.ReactNode;
  description: string;
} {
  const norm = format.toLowerCase().trim();
  if (norm.includes("pdf")) {
    return {
      name: "PDF Monograph",
      tagClass: "pdf",
      emblem: <PdfEmblem />,
      description: "Print-ready publication with structured sections & citations",
    };
  }
  if (norm.includes("doc") || norm.includes("word")) {
    return {
      name: "Word Document",
      tagClass: "docx",
      emblem: <DocxEmblem />,
      description: "Editable docx with headings, callouts & executive styling",
    };
  }
  if (norm.includes("htm")) {
    return {
      name: "Interactive HTML",
      tagClass: "html",
      emblem: <HtmlEmblem />,
      description: "Responsive web dossier with interactive code blocks & themes",
    };
  }
  return {
    name: "Markdown Source",
    tagClass: "markdown",
    emblem: <MarkdownEmblem />,
    description: "Portable GitHub-Flavored Markdown for notes and knowledge bases",
  };
}

export const DocumentDownloadHub: React.FC<DocumentDownloadHubProps> = ({
  title = "Research Monograph & Dossier",
  documentId,
  documents = [],
  timestamp,
  summary,
  onPreview,
  onDownload,
}) => {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [batchCopied, setBatchCopied] = useState(false);
  const fallbackSerialSuffix = useId().replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();

  // Deduplicate documents by format or URL
  const uniqueDocs = React.useMemo(() => {
    const seen = new Set<string>();
    return documents.filter((doc) => {
      const key = `${(doc.format || "").toLowerCase()}_${doc.filename || doc.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [documents]);

  const serialId = React.useMemo(() => {
    if (documentId) return documentId;
    for (const d of uniqueDocs) {
      if (d.document_id) return d.document_id;
    }
    return `DOC-${fallbackSerialSuffix || "SYNTH"}`;
  }, [documentId, uniqueDocs, fallbackSerialSuffix]);

  const handleDownload = useCallback((doc: DocumentItem) => {
    setDownloadingFormat(doc.format);
    if (onDownload) {
      onDownload(doc);
    } else {
      const link = document.createElement("a");
      link.href = doc.url;
      link.download = doc.filename || `document.${doc.format}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => {
      setDownloadingFormat(null);
    }, 1200);
  }, [onDownload]);

  const handlePreview = useCallback((doc: DocumentItem) => {
    if (onPreview) {
      onPreview(doc);
      return;
    }
    if (typeof (window as any).__meeraOpenDocument === "function") {
      (window as any).__meeraOpenDocument(doc.url, doc.filename, doc.format);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("meera:open-document", {
        detail: {
          url: doc.url,
          filename: doc.filename,
          format: doc.format,
        },
      })
    );
  }, [onPreview]);

  const handleCopyLink = useCallback((doc: DocumentItem) => {
    if (!doc || !doc.url) return;
    const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
    const fullUrl = doc.url.startsWith("http")
      ? doc.url
      : `${origin}${doc.url}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullUrl).catch(() => {});
    }
    setCopiedFormat(doc.format || "doc");
    setTimeout(() => {
      setCopiedFormat(null);
    }, 1500);
  }, []);

  const handleDownloadAll = useCallback(() => {
    uniqueDocs.forEach((doc, idx) => {
      setTimeout(() => {
        handleDownload(doc);
      }, idx * 300);
    });
  }, [uniqueDocs, handleDownload]);

  const handleCopyAllLinks = useCallback(() => {
    const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
    const manifest = uniqueDocs
      .map((d) => {
        const url = d.url || "";
        const fmt = (d.format || "doc").toUpperCase();
        const fullUrl = url.startsWith("http")
          ? url
          : `${origin}${url}`;
        return `${fmt}: ${fullUrl}`;
      })
      .join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(manifest).catch(() => {});
    }
    setBatchCopied(true);
    setTimeout(() => {
      setBatchCopied(false);
    }, 1600);
  }, [uniqueDocs]);

  if (!uniqueDocs.length) {
    return null;
  }

  return (
    <div className="doc-hub-container">
      {/* Header */}
      <div className="doc-hub-header">
        <div className="doc-hub-header-left">
          <div className="doc-hub-badge-icon" title="Synthesized Document Suite">
            <LuFileText size={18} />
          </div>
          <div className="doc-hub-meta-wrap">
            <div className="doc-hub-title">
              <span>{title}</span>
              <span className="doc-hub-id-badge">{serialId}</span>
            </div>
            <div className="doc-hub-subtext">
              {uniqueDocs.length} publication format{uniqueDocs.length > 1 ? "s" : ""} generated
              {timestamp ? ` • ${timestamp}` : ""}
            </div>
          </div>
        </div>

        <div className="doc-hub-header-right">
          <button
            type="button"
            className="doc-hub-batch-btn"
            onClick={handleDownloadAll}
            title="Download all formats"
          >
            <LuLayers size={13} />
            <span>Download All ({uniqueDocs.length})</span>
          </button>
          <button
            type="button"
            className="doc-action-icon-only"
            onClick={handleCopyAllLinks}
            title={batchCopied ? "Copied all links!" : "Copy all download links"}
          >
            {batchCopied ? <LuCheck size={14} color="#10b981" /> : <LuCopy size={14} />}
          </button>
        </div>
      </div>

      {/* Grid of Document Formats */}
      <div className="doc-hub-grid">
        {uniqueDocs.map((doc) => {
          const meta = getFormatMeta(doc.format);
          const sizeStr = formatBytes(doc.filesize);
          const isDownloading = downloadingFormat === doc.format;
          const isCopied = copiedFormat === doc.format;

          return (
            <div key={`${doc.format}_${doc.filename}`} className="doc-format-card">
              <div className="doc-format-header">
                <div className="doc-vector-emblem">{meta.emblem}</div>
                <div className="doc-format-info">
                  <div className="doc-format-name" title={doc.filename || meta.name}>
                    {doc.label || meta.name}
                  </div>
                  <div className="doc-format-meta">
                    <span className={`doc-format-tag ${meta.tagClass}`}>
                      {doc.format.toUpperCase()}
                    </span>
                    {sizeStr && <span>• {sizeStr}</span>}
                    {doc.page_count && doc.page_count > 0 && (
                      <span>• {doc.page_count} pg{doc.page_count > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions per card */}
              <div className="doc-format-actions">
                <button
                  type="button"
                  className="doc-action-btn primary"
                  onClick={() => handleDownload(doc)}
                  disabled={isDownloading}
                  title={`Download ${meta.name}`}
                >
                  <LuDownload size={13} />
                  <span>{isDownloading ? "Saving..." : "Download"}</span>
                </button>

                <button
                  type="button"
                  className="doc-action-btn"
                  onClick={() => handlePreview(doc)}
                  title={`In-App Preview ${meta.name}`}
                >
                  <LuEye size={13} />
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  className="doc-action-icon-only"
                  onClick={() => handleCopyLink(doc)}
                  title={isCopied ? "Copied URL!" : "Copy download link"}
                >
                  {isCopied ? <LuCheck size={13} color="#10b981" /> : <LuCopy size={13} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Security / Verification Status */}
      <div className="doc-hub-footer">
        <div className="doc-hub-footer-left">
          <span className="doc-verify-badge">
            <LuShieldCheck size={12} /> Integrity Verified
          </span>
          <span>• Generated by Meera Autonomous Swarm</span>
        </div>
        <div>
          <span>Direct HTTPS Delivery</span>
        </div>
      </div>
    </div>
  );
};

export default DocumentDownloadHub;
