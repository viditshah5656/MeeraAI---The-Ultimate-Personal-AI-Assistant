"""
╔══════════════════════════════════════════════════════════════════╗
║  Meera AI — Enterprise Research Document Generator               ║
║  Generates professional PDF, DOCX, HTML & Markdown documents     ║
║  from structured research content with math, code, and tables    ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import re
import json
import uuid
import time
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Tuple, Any

logger = logging.getLogger("meera.document_generator")

# ─── Output directory ──────────────────────────────────────────
DOCUMENTS_DIR = Path(__file__).parent / "generated_documents"


def ensure_docs_dir() -> Path:
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    return DOCUMENTS_DIR


def _sanitize_filename(title: str) -> str:
    """Create a safe filename from a title."""
    safe = re.sub(r'[^\w\s-]', '', title.lower())
    safe = re.sub(r'[\s]+', '_', safe).strip('_')
    return safe[:60] or "research_document"


def _timestamp_str() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _clean_xml_string(s: str) -> str:
    """Strip characters invalid in XML 1.0 documents (DOCX)."""
    if not isinstance(s, str):
        s = str(s)
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)


BOX_DRAWING_MAP = {
    "┌": "+", "┐": "+", "└": "+", "┘": "+",
    "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
    "─": "-", "│": "|", "═": "=", "║": "|",
    "╔": "+", "╗": "+", "╚": "+", "╝": "+",
    "╠": "+", "╣": "+", "╦": "+", "╩": "+", "╬": "+",
    "▲": "^", "▼": "v", "►": ">", "◄": "<",
    "█": "#", "░": ".", "▒": ":", "▓": "#",
    "•": "*", "→": "->", "←": "<-", "↔": "<->",
    "⇒": "=>", "⇐": "<=", "⇔": "<=>",
    "…": "...", "–": "-", "—": "--",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~=",
}

def _clean_code_text(text: str) -> str:
    """Sanitize code and ASCII diagrams for PDF code blocks."""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    for k, v in BOX_DRAWING_MAP.items():
        text = text.replace(k, v)
    return text.encode('latin-1', 'replace').decode('latin-1')


def _clean_pdf_text(text: str) -> str:
    """Replace problematic characters, control codes, and emojis for standard PDF fonts."""
    # Strip XML/terminal control characters first
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    emoji_map = {
        "🧠": "[Cognition]", "📐": "[Math]", "🏗️": "[Architecture]", "🔬": "[Research]",
        "📊": "[Metrics]", "🛑": "[Bottlenecks]", "⏱️": "[Timeline]", "🚀": "[Launch]",
        "✅": "[OK]", "⚠️": "[Warning]", "📝": "[Note]", "💡": "[Insight]",
        "📦": "[Package]", "📄": "[PDF]", "🌐": "[Web]", "📋": "[Clipboard]",
        "🎯": "[Objective]", "⚡": "[Compute]", "🤖": "[AI]", "🔑": "[Key]",
        "👥": "[Experts]", "💻": "[Code]", "🔮": "[Future]",
        "—": "--", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...",
        "•": "*", "×": "x", "≈": "~=", "≠": "!=", "≤": "<=", "≥": ">=",
    }
    for k, v in emoji_map.items():
        text = text.replace(k, v)
    for k, v in BOX_DRAWING_MAP.items():
        text = text.replace(k, v)
    return text


# ═══════════════════════════════════════════════════════════════
#  MARKDOWN → HTML CONVERTER (zero external deps)
# ═══════════════════════════════════════════════════════════════


CURATED_DESTINATION_PHOTOS = {
    "tegallalang": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
    "ubud": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
    "kelingking": "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80",
    "nusa penida": "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80",
    "uluwatu": "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1200&q=80",
    "kecak": "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1200&q=80",
    "tanah lot": "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?auto=format&fit=crop&w=1200&q=80",
    "tirta empul": "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1200&q=80",
    "tirta gangga": "https://images.unsplash.com/photo-1578469550956-0e16b69c6a3d?auto=format&fit=crop&w=1200&q=80",
    "waterfall": "https://images.unsplash.com/photo-1546484475-7f7bd55792da?auto=format&fit=crop&w=1200&q=80",
    "nasi campur": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=80",
    "bali": "https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8?auto=format&fit=crop&w=1200&q=80",
}

def resolve_doc_image(src, alt="", caption=""):
    if src and src.startswith("http") and "image_agent_tag" not in src:
        return src
    combined = f"{alt} {caption} {src}".lower()
    for k, u in CURATED_DESTINATION_PHOTOS.items():
        if k in combined:
            return u
    return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80"

def parse_ascii_table_to_html(text):
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    table_lines = [l for l in lines if any(c in l for c in ["┌", "┬", "┐", "├", "┼", "┤", "└", "┴", "┘", "│", "+-", "+="]) or ("|" in l and not l.startswith("#"))]
    if len(table_lines) < 3:
        return None
        
    rows = []
    headers = []
    for l in table_lines:
        if any(c in l for c in ["┌", "└"]) and not ("│" in l or "|" in l):
            continue
        if ("├" in l or ("+" in l and "-" in l)) and not ("│" in l):
            continue
        if "│" in l or "|" in l:
            sep = "│" if "│" in l else "|"
            cells = [c.strip() for c in l.split(sep)]
            if len(cells) > 1 and cells[0] == "": cells.pop(0)
            if len(cells) > 0 and cells[-1] == "": cells.pop()
            if cells:
                if not headers:
                    headers = cells
                else:
                    rows.append(cells)
                    
    if not headers:
        return None
        
    html = ['<table class="research-table">', '<thead><tr>']
    for h in headers:
        html.append(f'<th>{h}</th>')
    html.append('</tr></thead><tbody>')
    for r in rows:
        html.append('<tr>')
        for c in r:
            html.append(f'<td>{c}</td>')
        html.append('</tr>')
    html.append('</tbody></table>')
    return ''.join(html)

def _md_to_html(md_text: str) -> str:
    """Convert markdown to HTML with KaTeX math, tables, code blocks."""
    lines = md_text.split('\n')
    html_parts = []
    in_code_block = False
    code_lang = ""
    code_lines = []
    in_list = False
    list_type = ""
    in_table = False
    table_rows = []
    
    def close_list():
        nonlocal in_list, list_type
        if in_list:
            html_parts.append(f"</{list_type}>")
            in_list = False
    
    def close_table():
        nonlocal in_table, table_rows
        if in_table and table_rows:
            html_parts.append('<table class="research-table">')
            for idx, row in enumerate(table_rows):
                cells = [c.strip() for c in row.split('|') if c.strip()]
                tag = 'th' if idx == 0 else 'td'
                if idx == 1 and all(set(c.strip()) <= {'-', ':', ' '} for c in cells):
                    continue  # Skip separator row
                html_parts.append('<tr>')
                for cell in cells:
                    html_parts.append(f'<{tag}>{_inline_format(cell)}</{tag}>')
                html_parts.append('</tr>')
            html_parts.append('</table>')
            table_rows = []
            in_table = False
    
    def _inline_format(text: str) -> str:
        # Inline code
        text = re.sub(r'`([^`]+)`', r'<code class="inline-code">\1</code>', text)
        # Bold + italic
        text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', text)
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # Italic
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        # Links
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank">\1</a>', text)
        # Inline math $...$
        text = re.sub(r'(?<!\$)\$([^$\n]+)\$(?!\$)', r'<span class="math-inline">\1</span>', text)
        return text
    
    for line in lines:
        stripped = line.strip()
        
        # Display math $$...$$
        if stripped.startswith('$$') and stripped.endswith('$$') and len(stripped) > 4:
            close_list()
            close_table()
            math_content = stripped[2:-2].strip()
            html_parts.append(f'<div class="math-display">{math_content}</div>')
            continue
        
        # Code blocks
        if stripped.startswith('```'):
            if in_code_block:
                code_content = '\n'.join(code_lines)
                table_html = parse_ascii_table_to_html(code_content)
                if table_html:
                    html_parts.append(table_html)
                else:
                    html_parts.append(
                        f'<pre class="code-block"><code class="language-{code_lang}">'
                        f'{code_content}</code></pre>'
                    )
                code_lines = []
                in_code_block = False
            else:
                close_list()
                close_table()
                code_lang = stripped[3:].strip() or "text"
                in_code_block = True
            continue
        
        if in_code_block:
            escaped = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            code_lines.append(escaped)
            continue
        
        # Empty line
        if not stripped:
            close_list()
            close_table()
            continue
        
        # Table rows
        if '|' in stripped and not stripped.startswith('#'):
            if not in_table:
                close_list()
                in_table = True
            table_rows.append(stripped)
            continue
        else:
            close_table()
        
        # Horizontal rule
        if re.match(r'^---+$|^\*\*\*+$|^___+$', stripped):
            close_list()
            html_parts.append('<hr class="section-divider">')
            continue
        
        # Headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if heading_match:
            close_list()
            level = len(heading_match.group(1))
            text = _inline_format(heading_match.group(2))
            anchor = re.sub(r'[^\w\s-]', '', heading_match.group(2).lower())
            anchor = re.sub(r'\s+', '-', anchor)
            html_parts.append(f'<h{level} id="{anchor}" class="section-heading">{text}</h{level}>')
            continue
        
        # Blockquotes
        if stripped.startswith('>'):
            close_list()
            quote_text = _inline_format(stripped.lstrip('> '))
            html_parts.append(f'<blockquote class="research-quote">{quote_text}</blockquote>')
            continue
        
        # Unordered lists
        list_match = re.match(r'^[\*\-\+]\s+(.+)$', stripped)
        if list_match:
            if not in_list or list_type != 'ul':
                close_list()
                in_list = True
                list_type = 'ul'
                html_parts.append('<ul class="research-list">')
            html_parts.append(f'<li>{_inline_format(list_match.group(1))}</li>')
            continue
        
        # Ordered lists
        ol_match = re.match(r'^\d+\.\s+(.+)$', stripped)
        if ol_match:
            if not in_list or list_type != 'ol':
                close_list()
                in_list = True
                list_type = 'ol'
                html_parts.append('<ol class="research-list">')
            html_parts.append(f'<li>{_inline_format(ol_match.group(1))}</li>')
            continue
        
        # Check custom XML tags
        if stripped.startswith('<Image') or '<Image' in stripped:
            close_list()
            close_table()
            img_m = re.search(r'<Image\s+([^>]*)/?>', stripped)
            if img_m:
                attrs = img_m.group(1)
                alt = re.search(r'alt="([^"]*)"', attrs)
                caption = re.search(r'caption="([^"]*)"', attrs)
                src = re.search(r'src="([^"]*)"', attrs)
                alt_txt = alt.group(1) if alt else ""
                cap_txt = caption.group(1) if caption else alt_txt
                src_txt = src.group(1) if src else ""
                resolved = resolve_doc_image(src_txt, alt_txt, cap_txt)
                html_parts.append(
                    f'<figure class="doc-figure" style="margin:16px 0;text-align:center;">'
                    f'<img src="{resolved}" alt="{alt_txt}" style="max-width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);" />'
                    f'<figcaption style="font-size:12px;color:#64748b;margin-top:6px;font-style:italic;">{cap_txt}</figcaption>'
                    f'</figure>'
                )
                continue
        if stripped.startswith('<TimelineEvent') or '<TimelineEvent' in stripped:
            close_list()
            close_table()
            time_m = re.search(r'time="([^"]*)"', stripped) or re.search(r'date="([^"]*)"', stripped)
            title_m = re.search(r'title="([^"]*)"', stripped)
            t_txt = time_m.group(1) if time_m else ""
            h_txt = title_m.group(1) if title_m else ""
            body_txt = re.sub(r'<[^>]+>', '', stripped).strip()
            html_parts.append(
                f'<div class="doc-timeline-card" style="margin:10px 0;padding:10px 14px;border-left:3px solid #6366f1;background:rgba(99,102,241,0.05);border-radius:4px;">'
                f'<div style="font-size:11px;font-weight:600;color:#6366f1;text-transform:uppercase;">{t_txt}</div>'
                f'<div style="font-size:13.5px;font-weight:600;margin:3px 0;">{h_txt}</div>'
                f'<p style="margin:0;font-size:12.5px;">{body_txt}</p>'
                f'</div>'
            )
            continue
        if stripped.startswith('<Step') or '<Step' in stripped:
            close_list()
            close_table()
            title_m = re.search(r'title="([^"]*)"', stripped)
            sub_m = re.search(r'subtitle="([^"]*)"', stripped)
            h_txt = title_m.group(1) if title_m else ""
            s_txt = sub_m.group(1) if sub_m else ""
            body_txt = re.sub(r'<[^>]+>', '', stripped).strip()
            html_parts.append(
                f'<div class="doc-step-card" style="margin:10px 0;padding:10px 14px;border-left:3px solid #10b981;background:rgba(16,185,129,0.05);border-radius:4px;">'
                f'<div style="font-size:13px;font-weight:600;color:#10b981;">{h_txt} <span style="font-size:11px;color:#64748b;font-weight:normal;">({s_txt})</span></div>'
                f'<p style="margin:4px 0 0;font-size:12.5px;">{body_txt}</p>'
                f'</div>'
            )
            continue
        if stripped.startswith('<Elicitation') or '<Elicitation' in stripped or stripped.startswith('<FollowUp') or '<FollowUp' in stripped:
            label_m = re.search(r'label="([^"]*)"', stripped)
            if label_m:
                html_parts.append(f'<li class="doc-followup-item" style="margin:4px 0;font-size:12.5px;">💡 {label_m.group(1)}</li>')
                continue
        if any(stripped.startswith(t) for t in ['<Carousel>', '</Carousel>', '<Timeline>', '</Timeline>', '<Sequence>', '</Sequence>', '</ElicitationsGroup>']) or stripped.startswith('<ElicitationsGroup'):
            continue

        # Regular paragraph
        close_list()
        html_parts.append(f'<p>{_inline_format(stripped)}</p>')
    
    close_list()
    close_table()
    if in_code_block:
        code_content = '\n'.join(code_lines)
        html_parts.append(f'<pre class="code-block"><code>{code_content}</code></pre>')
    
    return '\n'.join(html_parts)


def _extract_toc(md_text: str) -> str:
    """Extract table of contents from markdown headings."""
    toc_items = []
    for match in re.finditer(r'^(#{1,3})\s+(.+)$', md_text, re.MULTILINE):
        level = len(match.group(1))
        text = re.sub(r'[*_`\[\]()]', '', match.group(2)).strip()
        # Exclude table, figure, and asset captions (e.g. Table 1.1:, Figure 2:)
        if re.match(r'^(?:Table|Figure|Listing|Box|Chart)\s+\d', text, re.IGNORECASE):
            continue
        anchor = re.sub(r'[^\w\s-]', '', text.lower())
        anchor = re.sub(r'\s+', '-', anchor)
        indent = '  ' * (level - 1)
        toc_items.append(
            f'{indent}<li class="toc-level-{level}">'
            f'<a href="#{anchor}">{text}</a></li>'
        )
    if not toc_items:
        return ""
    return '<nav class="table-of-contents"><h2>📑 Table of Contents</h2><ul>' + \
           '\n'.join(toc_items) + '</ul></nav>'



# ═══════════════════════════════════════════════════════════════
#  HTML DOCUMENT GENERATOR
# ═══════════════════════════════════════════════════════════════

_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        
        :root {{
            --primary: #1a1a2e;
            --accent: #6c63ff;
            --accent-light: #8b83ff;
            --bg: #ffffff;
            --bg-alt: #f8f9fc;
            --text: #2d3748;
            --text-muted: #718096;
            --border: #e2e8f0;
            --code-bg: #1e1e2e;
            --code-text: #cdd6f4;
        }}
        
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        
        body {{
            font-family: 'Merriweather', Georgia, serif;
            color: var(--text);
            background: var(--bg);
            line-height: 1.85;
            font-size: 16px;
        }}
        
        .document {{
            max-width: 920px;
            margin: 0 auto;
            padding: 40px 60px;
        }}
        
        .title-page {{
            text-align: center;
            padding: 80px 0 60px;
            border-bottom: 3px solid var(--accent);
            margin-bottom: 50px;
        }}
        
        .title-page h1 {{
            font-family: 'Inter', sans-serif;
            font-size: 2.8em;
            font-weight: 800;
            color: var(--primary);
            line-height: 1.25;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
        }}
        
        .title-page .subtitle {{
            font-size: 1.15em;
            color: var(--accent);
            font-weight: 600;
            font-family: 'Inter', sans-serif;
            margin-bottom: 10px;
        }}
        
        .title-page .meta {{
            font-size: 0.95em;
            color: var(--text-muted);
            font-style: italic;
        }}
        
        .title-page .badge {{
            display: inline-block;
            padding: 6px 18px;
            background: linear-gradient(135deg, var(--accent), var(--accent-light));
            color: white;
            border-radius: 20px;
            font-family: 'Inter', sans-serif;
            font-size: 0.82em;
            font-weight: 600;
            margin-top: 20px;
            letter-spacing: 0.05em;
        }}
        
        .table-of-contents {{
            background: var(--bg-alt);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 30px 40px;
            margin-bottom: 50px;
        }}
        
        .table-of-contents h2 {{
            font-family: 'Inter', sans-serif;
            font-size: 1.3em;
            margin-bottom: 15px;
            color: var(--primary);
        }}
        
        .table-of-contents ul {{ list-style: none; padding-left: 0; }}
        .table-of-contents li {{ padding: 5px 0; font-family: 'Inter', sans-serif; font-size: 0.95em; }}
        .table-of-contents li a {{ color: var(--accent); text-decoration: none; }}
        .table-of-contents li a:hover {{ text-decoration: underline; }}
        .toc-level-2 {{ padding-left: 20px !important; }}
        .toc-level-3 {{ padding-left: 40px !important; font-size: 0.9em !important; }}
        
        .section-heading {{
            font-family: 'Inter', sans-serif;
            color: var(--primary);
            margin-top: 50px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--border);
        }}
        
        h1.section-heading {{ font-size: 2.2em; border-bottom-color: var(--accent); }}
        h2.section-heading {{ font-size: 1.65em; }}
        h3.section-heading {{ font-size: 1.3em; border-bottom: none; }}
        
        p {{ margin-bottom: 20px; text-align: justify; }}
        strong {{ color: var(--primary); }}
        a {{ color: var(--accent); text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
        
        .research-list {{ margin: 15px 0 25px 30px; }}
        .research-list li {{ margin-bottom: 10px; }}
        
        .code-block {{
            background: var(--code-bg);
            color: var(--code-text);
            border-radius: 10px;
            padding: 24px 28px;
            margin: 25px 0;
            overflow-x: auto;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.88em;
            line-height: 1.6;
            border: 1px solid #313244;
        }}
        
        .inline-code {{
            background: var(--bg-alt);
            color: var(--accent);
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9em;
            border: 1px solid var(--border);
        }}
        
        .math-inline {{
            font-family: 'KaTeX_Math', 'Times New Roman', serif;
            font-style: italic;
            color: var(--primary);
            padding: 0 4px;
        }}
        
        .math-display {{
            text-align: center;
            padding: 22px;
            margin: 25px 0;
            background: var(--bg-alt);
            border-radius: 8px;
            border-left: 4px solid var(--accent);
            font-family: 'KaTeX_Math', 'Times New Roman', serif;
            font-size: 1.15em;
            overflow-x: auto;
        }}
        
        .research-quote {{
            border-left: 4px solid var(--accent);
            padding: 15px 25px;
            margin: 25px 0;
            background: var(--bg-alt);
            border-radius: 0 8px 8px 0;
            font-style: italic;
            color: var(--text-muted);
        }}
        
        .research-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            font-family: 'Inter', sans-serif;
            font-size: 0.92em;
        }}
        
        .research-table th {{
            background: var(--primary);
            color: white;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
        }}
        
        .research-table td {{
            padding: 10px 16px;
            border-bottom: 1px solid var(--border);
        }}
        
        .research-table tr:nth-child(even) td {{
            background: var(--bg-alt);
        }}
        
        .section-divider {{
            border: none;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
            margin: 40px 0;
        }}
        
        .document-footer {{
            margin-top: 60px;
            padding-top: 30px;
            border-top: 2px solid var(--border);
            text-align: center;
            font-family: 'Inter', sans-serif;
            font-size: 0.85em;
            color: var(--text-muted);
        }}
        
        .document-footer .logo {{
            font-size: 1.2em;
            font-weight: 700;
            color: var(--accent);
            margin-bottom: 8px;
        }}
        
        @media print {{
            body {{ font-size: 12pt; }}
            .document {{ padding: 0; max-width: none; }}
            .title-page {{ page-break-after: always; }}
            .table-of-contents {{ page-break-after: always; }}
            .code-block {{ background: #f5f5f5 !important; color: #333 !important; }}
        }}
    </style>
</head>
<body>
    <div class="document">
        <div class="title-page">
            <h1>{title}</h1>
            <p class="subtitle">🔬 Advanced Research Paper — Meera AI</p>
            <p class="meta">Published: {date} • Autonomous Cognitive Engine</p>
            <span class="badge">AUTONOMOUS SCIENTIFIC REPORT</span>
        </div>
        
        {toc}
        
        <div class="content">
            {content}
        </div>
        
        <div class="document-footer">
            <div class="logo">✦ Meera AI Autonomous Research Engine</div>
            <p>Comprehensive scientific paper synthesized with deep multi-source research & formal derivations.</p>
            <p>Document ID: {doc_id} • Generated on {date}</p>
        </div>
    </div>
    
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script defer>
        document.addEventListener('DOMContentLoaded', function() {{
            document.querySelectorAll('.math-inline').forEach(function(el) {{
                try {{
                    katex.render(el.textContent, el, {{ throwOnError: false, displayMode: false }});
                }} catch(e) {{}}
            }});
            document.querySelectorAll('.math-display').forEach(function(el) {{
                try {{
                    katex.render(el.textContent, el, {{ throwOnError: false, displayMode: true }});
                }} catch(e) {{}}
            }});
        }});
    </script>
</body>
</html>"""


def generate_html_document(title: str, content: str, metadata: dict = None) -> Tuple[str, int]:
    """Generate a self-contained HTML research document."""
    ensure_docs_dir()
    meta = metadata or {}
    doc_id = meta.get("document_id") or uuid.uuid4().hex[:12]
    ts_str = meta.get("timestamp_str") or _timestamp_str()
    date_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    html_content = _md_to_html(content)
    toc = _extract_toc(content)
    
    full_html = _HTML_TEMPLATE.format(
        title=title,
        date=date_str,
        content=html_content,
        toc=toc,
        doc_id=doc_id,
    )
    
    filename = f"{_sanitize_filename(title)}_{ts_str}.html"
    filepath = DOCUMENTS_DIR / filename
    filepath.write_text(full_html, encoding='utf-8')
    return filename, filepath.stat().st_size


# ═══════════════════════════════════════════════════════════════
#  PDF DOCUMENT GENERATOR (fpdf2)
# ═══════════════════════════════════════════════════════════════

def generate_pdf_document(title: str, content: str, metadata: dict = None) -> Optional[Tuple[str, int]]:
    """Generate a high-resolution PDF document with table support and math formatting."""
    try:
        from fpdf import FPDF
    except ImportError:
        logger.warning("fpdf2 not installed — skipping PDF generation")
        return None
    
    ensure_docs_dir()
    clean_title = _clean_pdf_text(title)
    
    class ResearchPDF(FPDF):
        def header(self):
            if self.page_no() > 1:
                self.set_font('ArialUni' if hasattr(self, '_has_uni') else 'Helvetica', 'I' if not hasattr(self, '_has_uni') else '', 8)
                self.set_text_color(150, 150, 150)
                self.cell(0, 8, f'Meera AI Research Report -- {clean_title[:55]}', align='C')
                self.ln(5)
                self.set_draw_color(108, 99, 255)
                self.line(10, 15, self.w - 10, 15)
                self.ln(6)
        
        def footer(self):
            self.set_y(-18)
            self.set_font('ArialUni' if hasattr(self, '_has_uni') else 'Helvetica', 'I' if not hasattr(self, '_has_uni') else '', 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')
    
    pdf = ResearchPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    
    # Load system Unicode font if available
    font_paths = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    has_uni = False
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                pdf.add_font('ArialUni', '', fp)
                bold_fp = "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if os.path.exists("/System/Library/Fonts/Supplemental/Arial Bold.ttf") else fp
                pdf.add_font('ArialUni', 'B', bold_fp)
                italic_fp = "/System/Library/Fonts/Supplemental/Arial Italic.ttf" if os.path.exists("/System/Library/Fonts/Supplemental/Arial Italic.ttf") else fp
                pdf.add_font('ArialUni', 'I', italic_fp)
                has_uni = True
                pdf._has_uni = True
                break
            except Exception:
                pass
    
    main_font = 'ArialUni' if has_uni else 'Helvetica'
    
    # ── Title Page ──
    pdf.add_page()
    pdf.ln(45)
    pdf.set_font(main_font, '' if has_uni else 'B', 24)
    pdf.set_text_color(26, 26, 46)
    pdf.multi_cell(0, 12, clean_title, align='C')
    pdf.ln(12)
    pdf.set_font(main_font, '', 13)
    pdf.set_text_color(108, 99, 255)
    pdf.cell(0, 10, 'Advanced Technical Research Paper -- Meera AI', align='C')
    pdf.ln(8)
    pdf.set_font(main_font, '', 10)
    pdf.set_text_color(113, 128, 150)
    date_str = datetime.now().strftime("%B %d, %Y")
    pdf.cell(0, 8, f'Autonomous Scientific Synthesis -- {date_str}', align='C')
    pdf.ln(6)
    pdf.cell(0, 8, f'Document ID: {uuid.uuid4().hex[:12]}', align='C')
    pdf.ln(25)
    pdf.set_draw_color(108, 99, 255)
    pdf.line(40, pdf.get_y(), pdf.w - 40, pdf.get_y())
    
    # ── Content ──
    pdf.add_page()
    lines = content.split('\n')
    in_code_block = False
    code_buffer = []
    in_table = False
    table_rows = []
    
    def render_pdf_table():
        nonlocal in_table, table_rows
        if in_table and table_rows:
            try:
                parsed_rows = []
                for row in table_rows:
                    cells = [_clean_pdf_text(c.strip()) for c in row.split('|') if c.strip()]
                    if cells and not (len(cells) > 0 and all(set(c.strip()) <= {'-', ':', ' '} for c in cells)):
                        parsed_rows.append(cells)
                if parsed_rows:
                    pdf.ln(3)
                    with pdf.table(borders_layout="HORIZONTAL_LINES") as table:
                        for row_idx, r in enumerate(parsed_rows):
                            row = table.row()
                            for cell in r:
                                row.cell(cell)
                    pdf.ln(4)
            except Exception as e:
                logger.warning(f"PDF table render failed: {e}")
            table_rows = []
            in_table = False
    
    for line in lines:
        stripped = line.strip()
        
        # Display Math $$...$$
        if stripped.startswith('$$') and stripped.endswith('$$') and len(stripped) > 4:
            render_pdf_table()
            math_text = _clean_pdf_text(stripped[2:-2].strip())
            pdf.ln(3)
            pdf.set_font(main_font, '', 11)
            pdf.set_fill_color(245, 246, 250)
            pdf.set_text_color(26, 26, 46)
            pdf.multi_cell(0, 8, f"    {math_text}", fill=True, align='C')
            pdf.ln(3)
            continue
        
        # Code block handling
        if stripped.startswith('```'):
            render_pdf_table()
            if in_code_block:
                pdf.set_font('Courier', '', 8)
                pdf.set_fill_color(30, 30, 46)
                pdf.set_text_color(205, 214, 244)
                code_text = _clean_code_text('\n'.join(code_buffer))
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(pdf.epw, 4.5, code_text, fill=True)
                pdf.ln(3)
                pdf.set_text_color(45, 55, 72)
                code_buffer = []
                in_code_block = False
            else:
                in_code_block = True
            continue
        
        if in_code_block:
            code_buffer.append(line)
            continue
        
        # Tables
        if '|' in stripped and not stripped.startswith('#'):
            in_table = True
            table_rows.append(stripped)
            continue
        else:
            render_pdf_table()
        
        if not stripped:
            pdf.ln(2)
            continue
        
        if re.match(r'^---+$', stripped):
            pdf.ln(4)
            pdf.set_draw_color(226, 232, 240)
            pdf.line(15, pdf.get_y(), pdf.w - 15, pdf.get_y())
            pdf.ln(4)
            continue
        
        # Headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if heading_match:
            level = len(heading_match.group(1))
            htext = _clean_pdf_text(re.sub(r'[*_`\[\]()]', '', heading_match.group(2)))
            pdf.ln(5 if level > 2 else 8)
            pdf.set_font(main_font, '' if has_uni else 'B', 17 if level == 1 else (14 if level == 2 else 11))
            pdf.set_text_color(26, 26, 46)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(pdf.epw, 7, htext)
            if level <= 2:
                pdf.set_draw_color(108, 99, 255 if level == 1 else 226)
                pdf.line(10, pdf.get_y() + 1, pdf.w - 10, pdf.get_y() + 1)
            pdf.ln(2)
            continue
        
        # Lists
        list_match = re.match(r'^[\*\-\+]\s+(.+)$', stripped)
        ol_match = re.match(r'^(\d+)\.\s+(.+)$', stripped)
        if list_match or ol_match:
            item_text = _clean_pdf_text(list_match.group(1) if list_match else ol_match.group(2))
            item_text = re.sub(r'[*_`]', '', item_text)
            prefix = '* ' if list_match else f'{ol_match.group(1)}. '
            pdf.set_font(main_font, '', 9.5)
            pdf.set_text_color(45, 55, 72)
            pdf.set_x(pdf.l_margin + 5)
            pdf.multi_cell(pdf.epw - 5, 5, f'{prefix}{item_text}')
            continue
        
        # Paragraph
        ptext = _clean_pdf_text(re.sub(r'[*_`]', '', stripped))
        pdf.set_font(main_font, '', 9.5)
        pdf.set_text_color(45, 55, 72)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 5, ptext)
        pdf.ln(1.5)
    
    render_pdf_table()
    
    meta = metadata or {}
    ts_str = meta.get("timestamp_str") or _timestamp_str()
    filename = f"{_sanitize_filename(title)}_{ts_str}.pdf"
    filepath = DOCUMENTS_DIR / filename
    pdf.output(str(filepath))
    if isinstance(metadata, dict):
        metadata["_pdf_pages"] = pdf.page_no()
    return filename, filepath.stat().st_size


# ═══════════════════════════════════════════════════════════════
#  DOCX DOCUMENT GENERATOR (python-docx)
# ═══════════════════════════════════════════════════════════════

def generate_docx_document(title: str, content: str, metadata: dict = None) -> Optional[Tuple[str, int]]:
    """Generate a professional Word DOCX document with native tables and clean XML."""
    try:
        from docx import Document
        from docx.shared import Inches, Pt, Cm, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.oxml.ns import qn
    except ImportError:
        logger.warning("python-docx not installed — skipping DOCX generation")
        return None
    
    ensure_docs_dir()
    doc = Document()
    
    # Base styling
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Calibri'
    font.size = Pt(11)
    font.color.rgb = RGBColor(45, 55, 72)
    style.paragraph_format.line_spacing = 1.3
    style.paragraph_format.space_after = Pt(6)
    
    # Title Page
    title_para = doc.add_paragraph()
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_para.space_before = Pt(80)
    run = title_para.add_run(_clean_xml_string(title))
    run.bold = True
    run.font.size = Pt(26)
    run.font.color.rgb = RGBColor(26, 26, 46)
    run.font.name = 'Calibri'
    
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run('🔬 Advanced Research Report -- Meera AI')
    run.font.size = Pt(13)
    run.font.color.rgb = RGBColor(108, 99, 255)
    
    date_para = doc.add_paragraph()
    date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    run = date_para.add_run(f'Autonomous Scientific Report -- {date_str}')
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(113, 128, 150)
    run.italic = True
    
    doc.add_page_break()
    
    # Body lines
    lines = content.split('\n')
    in_code_block = False
    code_buffer = []
    in_table = False
    table_rows = []
    
    def render_docx_table():
        nonlocal in_table, table_rows
        if in_table and table_rows:
            try:
                parsed = []
                for row in table_rows:
                    cells = [_clean_xml_string(c.strip()) for c in row.split('|') if c.strip()]
                    if cells and not (len(cells) > 0 and all(set(c.strip()) <= {'-', ':', ' '} for c in cells)):
                        parsed.append(cells)
                if parsed:
                    max_cols = max(len(r) for r in parsed)
                    tbl = doc.add_table(rows=len(parsed), cols=max_cols)
                    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
                    for r_idx, r_data in enumerate(parsed):
                        row_elem = tbl.rows[r_idx]
                        for c_idx, cell_value in enumerate(r_data):
                            if c_idx < max_cols:
                                cell = row_elem.cells[c_idx]
                                cell.text = cell_value
                                if r_idx == 0:
                                    # Header styling
                                    for p in cell.paragraphs:
                                        for r in p.runs:
                                            r.bold = True
                                            r.font.color.rgb = RGBColor(255, 255, 255)
                                    shading = cell._tc.get_or_add_tcPr()
                                    shd = shading.makeelement(qn('w:shd'), {
                                        qn('w:fill'): '1A1A2E',
                                        qn('w:val'): 'clear',
                                    })
                                    shading.append(shd)
                    doc.add_paragraph()
            except Exception as e:
                logger.warning(f"DOCX table render failed: {e}")
            table_rows = []
            in_table = False
    
    for line in lines:
        stripped = line.strip()
        
        # Display Math $$...$$
        if stripped.startswith('$$') and stripped.endswith('$$') and len(stripped) > 4:
            render_docx_table()
            math_text = _clean_xml_string(stripped[2:-2].strip())
            para = doc.add_paragraph()
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = para.add_run(math_text)
            run.italic = True
            run.font.name = 'Cambria Math'
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(26, 26, 46)
            continue
        
        # Code block
        if stripped.startswith('```'):
            render_docx_table()
            if in_code_block:
                code_text = _clean_xml_string('\n'.join(code_buffer))
                code_para = doc.add_paragraph()
                code_para.paragraph_format.space_before = Pt(8)
                code_para.paragraph_format.space_after = Pt(8)
                run = code_para.add_run(code_text)
                run.font.name = 'Consolas'
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(205, 214, 244)
                shading = code_para.paragraph_format.element.get_or_add_pPr()
                shd = shading.makeelement(qn('w:shd'), {
                    qn('w:fill'): '1E1E2E',
                    qn('w:val'): 'clear',
                })
                shading.append(shd)
                code_buffer = []
                in_code_block = False
            else:
                in_code_block = True
            continue
        
        if in_code_block:
            code_buffer.append(line)
            continue
        
        # Table lines
        if '|' in stripped and not stripped.startswith('#'):
            in_table = True
            table_rows.append(stripped)
            continue
        else:
            render_docx_table()
        
        if not stripped:
            continue
        
        if re.match(r'^---+$', stripped):
            doc.add_paragraph('─' * 55)
            continue
        
        # Headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if heading_match:
            level = len(heading_match.group(1))
            htext = _clean_xml_string(re.sub(r'[*_`\[\]()]', '', heading_match.group(2)))
            doc.add_heading(htext, level=min(level, 4))
            continue
        
        # Lists
        list_match = re.match(r'^[\*\-\+]\s+(.+)$', stripped)
        ol_match = re.match(r'^(\d+)\.\s+(.+)$', stripped)
        if list_match:
            ltext = _clean_xml_string(re.sub(r'[*_`]', '', list_match.group(1)))
            doc.add_paragraph(ltext, style='List Bullet')
            continue
        elif ol_match:
            otext = _clean_xml_string(re.sub(r'[*_`]', '', ol_match.group(2)))
            doc.add_paragraph(otext, style='List Number')
            continue
        
        # Paragraph with bold detection
        para = doc.add_paragraph()
        clean_line = _clean_xml_string(stripped)
        parts = re.split(r'(\*\*[^*]+\*\*)', clean_line)
        for part in parts:
            bold_match = re.match(r'\*\*(.+?)\*\*', part)
            if bold_match:
                r = para.add_run(bold_match.group(1))
                r.bold = True
            else:
                para.add_run(re.sub(r'[*_`]', '', part))
    
    render_docx_table()
    
    # Save
    meta = metadata or {}
    ts_str = meta.get("timestamp_str") or _timestamp_str()
    filename = f"{_sanitize_filename(title)}_{ts_str}.docx"
    filepath = DOCUMENTS_DIR / filename
    doc.save(str(filepath))
    return filename, filepath.stat().st_size


# ═══════════════════════════════════════════════════════════════
#  MARKDOWN DOCUMENT
# ═══════════════════════════════════════════════════════════════

def generate_markdown_document(title: str, content: str, metadata: dict = None) -> Tuple[str, int]:
    """Generate a clean formatted Markdown document."""
    ensure_docs_dir()
    date_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    meta = metadata or {}
    doc_id = meta.get("document_id") or uuid.uuid4().hex[:12]
    ts_str = meta.get("timestamp_str") or _timestamp_str()
    doc_type = meta.get("document_type")
    t_lower = (title + " " + content[:400]).lower()
    if not doc_type:
        if any(k in t_lower for k in ("travel", "trip", "itinerary", "vacation", "flight", "visa", "hotel")):
            doc_type = "Comprehensive Travel Itinerary & Strategic Guide"
            badge_icon = "✈️"
        elif any(k in t_lower for k in ("business", "market", "tam", "financial", "pricing")):
            doc_type = "Strategic Market & Business Intelligence Dossier"
            badge_icon = "📊"
        else:
            doc_type = "Autonomous Scientific Research Dossier"
            badge_icon = "🔬"
    else:
        badge_icon = "📋"

    author = meta.get("author", "Meera AI Autonomous Cognitive Engine")
    
    md_doc = f"""---
title: "{title}"
author: "{author}"
date: "{date_str}"
document_id: "{doc_id}"
---

# {title}

> {badge_icon} **{doc_type}** -- Generated by Meera AI on {date_str}

---

{content}

---

*✦ Autonomously synthesized by Meera AI's multi-agent cognitive pipeline.*
*Document ID: {doc_id}*
"""
    filename = f"{_sanitize_filename(title)}_{ts_str}.md"
    filepath = DOCUMENTS_DIR / filename
    filepath.write_text(md_doc, encoding='utf-8')
    return filename, filepath.stat().st_size


# ═══════════════════════════════════════════════════════════════
#  MAIN ENTRY POINT -- Generate all formats
# ═══════════════════════════════════════════════════════════════

def generate_research_documents(title: str, content: str, metadata: dict = None) -> Dict[str, Dict[str, Any]]:
    """Generate research documents in all available formats with rich metadata."""
    meta = dict(metadata or {})
    doc_id = meta.get("document_id") or f"doc_{uuid.uuid4().hex[:10]}"
    ts_str = meta.get("timestamp_str") or _timestamp_str()
    meta["document_id"] = doc_id
    meta["timestamp_str"] = ts_str

    words = len(re.findall(r'\b\w+\b', content))
    est_read_min = max(1, (words + 199) // 200)
    est_pages = max(1, (words + 449) // 450)

    results = {
        "_meta": {
            "document_id": doc_id,
            "timestamp": ts_str,
            "word_count": words,
            "reading_time_min": est_read_min,
            "estimated_pages": est_pages,
            "title": title,
        }
    }
    
    # 1. PDF
    try:
        pdf_res = generate_pdf_document(title, content, meta)
        if pdf_res:
            fname, fsize = pdf_res
            actual_pages = meta.get("_pdf_pages", est_pages)
            results["pdf"] = {
                "filename": fname,
                "size": fsize,
                "formatted_size": format_file_size(fsize),
                "url": f"/api/documents/{fname}",
                "label": "PDF Report",
                "icon": "📄",
                "format": "pdf",
                "mime_type": "application/pdf",
                "doc_id": doc_id,
                "page_count": actual_pages,
                "word_count": words,
            }
    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
    
    # 2. Word (DOCX)
    try:
        docx_res = generate_docx_document(title, content, meta)
        if docx_res:
            fname, fsize = docx_res
            results["docx"] = {
                "filename": fname,
                "size": fsize,
                "formatted_size": format_file_size(fsize),
                "url": f"/api/documents/{fname}",
                "label": "Word Document",
                "icon": "📝",
                "format": "docx",
                "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "doc_id": doc_id,
                "page_count": est_pages,
                "word_count": words,
            }
    except Exception as e:
        logger.error(f"DOCX generation failed: {e}", exc_info=True)
    
    # 3. HTML
    try:
        fname, fsize = generate_html_document(title, content, meta)
        results["html"] = {
            "filename": fname,
            "size": fsize,
            "formatted_size": format_file_size(fsize),
            "url": f"/api/documents/{fname}",
            "label": "Interactive HTML",
            "icon": "🌐",
            "format": "html",
            "mime_type": "text/html",
            "doc_id": doc_id,
            "word_count": words,
        }
    except Exception as e:
        logger.error(f"HTML generation failed: {e}", exc_info=True)
    
    # 4. Markdown
    try:
        fname, fsize = generate_markdown_document(title, content, meta)
        results["md"] = {
            "filename": fname,
            "size": fsize,
            "formatted_size": format_file_size(fsize),
            "url": f"/api/documents/{fname}",
            "label": "Markdown Source",
            "icon": "📋",
            "format": "md",
            "mime_type": "text/markdown",
            "doc_id": doc_id,
            "word_count": words,
        }
    except Exception as e:
        logger.error(f"Markdown generation failed: {e}", exc_info=True)
    
    return results


def format_file_size(size_bytes: int) -> str:
    """Format file size for human display."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
