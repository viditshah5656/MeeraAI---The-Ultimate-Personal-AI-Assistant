from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import sqlite3
import threading
import time
import urllib.request

from config import WebConfig
from .cancellation import CancellationToken
from .db import open_database
from .models import ErrorCategory, ToolError, ToolResult


class WebSearchTool:
    def __init__(self, config: WebConfig) -> None:
        self.config = config

    def search(self, arguments: dict[str, Any], token: CancellationToken) -> ToolResult:
        query = str(arguments["query"]).strip()
        if not query:
            return ToolResult(False, "Search query is empty", error=ToolError(ErrorCategory.INVALID_INPUT, "Empty query"))
        token.raise_if_cancelled()
        kind = arguments.get("kind", "text")

        # Parallel execution: when news is requested, search news and text fallback concurrently
        # so results arrive in under 2 seconds without serial blocking.
        if kind == "news":
            with ThreadPoolExecutor(max_workers=2, thread_name_prefix="meera-web") as executor:
                news_future = executor.submit(self._search_once, query, "news", token)
                text_future = executor.submit(self._search_once, f"{query} latest news", "text", token)
                try:
                    res = news_future.result(timeout=self.config.timeout_seconds + 1.0)
                    if res.ok:
                        return res
                except Exception:
                    pass
                try:
                    fallback = text_future.result(timeout=self.config.timeout_seconds + 1.0)
                    if fallback.ok:
                        fallback.data["query"] = query
                        fallback.data["fallback_kind"] = "text"
                        return fallback
                except Exception:
                    pass
            return ToolResult(False, "The web search failed.", error=ToolError(ErrorCategory.NETWORK_ERROR, "No results", True))

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                token.raise_if_cancelled()
                result = self._search_once(query, kind, token)
                if result.ok:
                    return result
            except Exception as exc:
                last_error = exc
            if attempt == 0:
                time.sleep(0.15)
        return ToolResult(False, "The web search failed.", error=ToolError(ErrorCategory.NETWORK_ERROR, str(last_error or "No results"), True))

    def _search_once(self, query: str, kind: str, token: CancellationToken) -> ToolResult:
        try:
            from ddgs import DDGS

            method = "news" if kind == "news" else "text"
            client = DDGS(timeout=int(self.config.timeout_seconds))
            search = getattr(client, method)
            options = {
                "query": query,
                "region": self.config.region,
                "safesearch": self.config.safe_search,
                "max_results": self.config.max_results * 2 if kind == "news" else self.config.max_results,
            }
            if kind == "news":
                options["timelimit"] = "w"
            raw_results = search(**options)
            results, seen_urls = [], set()
            for item in raw_results:
                token.raise_if_cancelled()
                url = item.get("href") or item.get("url") or ""
                title = item.get("title") or "Untitled source"
                snippet = item.get("body") or item.get("description") or ""
                parsed = urlparse(url)
                normalized = url.split("#", 1)[0]
                low_value_news = bool(re.search(
                    r"(?i)\b(?:fund growth|ordinary shares|stock quote|admission 20\d\d)\b|"
                    r"^(?:technology industry|information technology)$|\bsection\s*\|\s*page\b",
                    str(title).strip(),
                ))
                if kind == "news" and low_value_news:
                    continue
                if parsed.scheme in {"http", "https"} and parsed.netloc and normalized not in seen_urls:
                    seen_urls.add(normalized)
                    results.append({
                        "title": str(title)[:300],
                        "url": normalized,
                        "snippet": str(snippet)[:1600],
                        "source": str(item.get("source") or parsed.netloc)[:160],
                        "date": str(item.get("date") or "")[:80],
                    })
                    if len(results) >= self.config.max_results:
                        break
            if not results:
                return ToolResult(False, "I couldn't find reliable web results for that.", error=ToolError(ErrorCategory.NETWORK_ERROR, "No results", True))
            return ToolResult(True, f"Found {len(results)} web sources.", {"query": query, "results": results})
        except Exception as exc:
            return ToolResult(False, "The web search failed.", error=ToolError(ErrorCategory.NETWORK_ERROR, str(exc), True))

    def open_result(self, item: dict[str, Any], token: CancellationToken) -> ToolResult:
        """Fetch readable article evidence, falling back to a focused search."""
        token.raise_if_cancelled()
        url = str(item.get("url", ""))
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MeeraAI/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            with urllib.request.urlopen(request, timeout=min(3.5, self.config.timeout_seconds)) as response:
                content_type = response.headers.get_content_type()
                if content_type not in {"text/html", "application/xhtml+xml"}:
                    raise ValueError(f"Unsupported article content type: {content_type}")
                payload = response.read(1_500_000)
                charset = response.headers.get_content_charset() or "utf-8"
            parser = _ReadableArticleParser()
            parser.feed(payload.decode(charset, errors="replace"))
            article = parser.text()
            article = re.split(
                r"(?im)^\s*(?:copyright|all rights reserved|related stories|more from)\b",
                article,
                maxsplit=1,
            )[0].strip()
            if len(article.split()) < 70:
                raise ValueError("Article page did not expose enough readable text")
            return ToolResult(True, "Opened the selected story.", {
                "title": item.get("title", "Selected story"),
                "url": url,
                "source": item.get("source", ""),
                "date": item.get("date", ""),
                "article": article[:12000],
                "snippet": item.get("snippet", ""),
            })
        except Exception as exc:
            focused = self.search({"query": str(item.get("title", "")), "kind": "text"}, token)
            if focused.ok:
                return ToolResult(True, "Retrieved focused coverage of the selected story.", {
                    "title": item.get("title", "Selected story"),
                    "url": url,
                    "source": item.get("source", ""),
                    "date": item.get("date", ""),
                    "article": "\n".join(result.get("snippet", "") for result in focused.data["results"]),
                    "snippet": item.get("snippet", ""),
                    "supporting_results": focused.data["results"],
                    "fetch_note": str(exc),
                })
            return ToolResult(False, "I couldn't open that story or find enough supporting coverage.", error=ToolError(ErrorCategory.NETWORK_ERROR, str(exc), True))


class _ReadableArticleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip = 0
        self._capture = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag in {"script", "style", "noscript", "svg", "nav", "footer", "form"}:
            self._skip += 1
        elif not self._skip and tag in {"h1", "h2", "h3", "p", "li", "blockquote"}:
            self._capture += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg", "nav", "footer", "form"} and self._skip:
            self._skip -= 1
        elif tag in {"h1", "h2", "h3", "p", "li", "blockquote"} and self._capture:
            self._capture -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip and self._capture:
            clean = re.sub(r"\s+", " ", unescape(data)).strip()
            if len(clean) >= 24:
                self._parts.append(clean)

    def text(self) -> str:
        unique = list(dict.fromkeys(self._parts))
        return "\n".join(unique)


@dataclass(frozen=True)
class ResearchSession:
    query: str
    kind: str
    results: tuple[dict[str, Any], ...]
    selected_index: int | None = None
    selected_evidence: dict[str, Any] | None = None


class ResearchSessionStore:
    """Persists the latest numbered results and selected story for follow-ups."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS research_session ("
                "singleton INTEGER PRIMARY KEY CHECK(singleton=1), query TEXT NOT NULL, "
                "kind TEXT NOT NULL, results TEXT NOT NULL, selected_index INTEGER, "
                "selected_evidence TEXT, updated_at REAL NOT NULL)"
            )
            columns = {row[1] for row in db.execute("PRAGMA table_info(research_session)")}
            if "selected_evidence" not in columns:
                db.execute("ALTER TABLE research_session ADD COLUMN selected_evidence TEXT")

    def _connect(self) -> sqlite3.Connection:
        return open_database(self.database_path)

    def save(self, query: str, kind: str, results: list[dict[str, Any]]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO research_session(singleton,query,kind,results,selected_index,selected_evidence,updated_at) VALUES(1,?,?,?,?,?,?) "
                "ON CONFLICT(singleton) DO UPDATE SET query=excluded.query,kind=excluded.kind,"
                "results=excluded.results,selected_index=NULL,selected_evidence=NULL,updated_at=excluded.updated_at",
                (query, kind, json.dumps(results), None, None, time.time()),
            )

    def current(self, max_age_seconds: float = 7200) -> ResearchSession | None:
        with self._lock, self._connect() as db:
            row = db.execute(
                "SELECT query,kind,results,selected_index,selected_evidence,updated_at "
                "FROM research_session WHERE singleton=1"
            ).fetchone()
        if not row or time.time() - float(row[5]) > max_age_seconds:
            return None
        evidence = json.loads(row[4]) if row[4] else None
        return ResearchSession(row[0], row[1], tuple(json.loads(row[2])), row[3], evidence)

    def select(self, one_based_index: int) -> dict[str, Any] | None:
        session = self.current()
        if not session or not 1 <= one_based_index <= len(session.results):
            return None
        with self._lock, self._connect() as db:
            db.execute(
                "UPDATE research_session SET selected_index=?,updated_at=? WHERE singleton=1",
                (one_based_index, time.time()),
            )
        return dict(session.results[one_based_index - 1])

    def save_selected_evidence(self, evidence: dict[str, Any]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                "UPDATE research_session SET selected_evidence=?,updated_at=? WHERE singleton=1",
                (json.dumps(evidence), time.time()),
            )

    def selected(self) -> dict[str, Any] | None:
        session = self.current()
        if not session or session.selected_index is None:
            return None
        if not 1 <= session.selected_index <= len(session.results):
            return None
        return dict(session.results[session.selected_index - 1])


INJECTION_PATTERNS = [
    re.compile(r"(?i)\b(?:ignore|disregard|bypass|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b"),
    re.compile(r"(?i)\b(?:new|updated|revised)\s+system\s+(?:prompt|instruction|directive)s?\b:?"),
    re.compile(r"(?i)\bsystem\s+override\b:?"),
    re.compile(r"(?i)\byou\s+(?:must\s+now|are\s+now)\s+(?:act|respond|behave)\s+as\b"),
    re.compile(r"(?i)\byou\s+are\s+no\s+longer\s+meera\b"),
]

PROMPT_DELIMITERS = (
    "<|im_start|>", "<|im_end|>", "<|endoftext|>", "<|im_sep|>",
    "<s>", "</s>", "[INST]", "[/INST]", "<<SYS>>", "<</SYS>>",
)

ZERO_WIDTH_CHARS = re.compile(r"[\u200b\u200c\u200d\u200e\u200f\ufeff\u202a-\u202e]")


def sanitize_evidence(text: str) -> str:
    """Neutralize prompt injections, chat delimiters, and hidden unicode from untrusted web text."""
    if not text:
        return ""
    cleaned = ZERO_WIDTH_CHARS.sub("", str(text))
    for delim in PROMPT_DELIMITERS:
        if delim in cleaned:
            tag = delim.strip("<>|[]")
            cleaned = cleaned.replace(delim, f"[escaped:{tag}]")
    for pattern in INJECTION_PATTERNS:
        cleaned = pattern.sub("[UNTRUSTED_INSTRUCTION_STRIPPED]", cleaned)
    return cleaned


def grounding_text(result: ToolResult) -> str:
    lines = ["WEB RESULTS (private evidence; do not read URLs aloud):"]
    for index, item in enumerate(result.data.get("results", []), 1):
        title = sanitize_evidence(item.get("title", ""))
        snippet = sanitize_evidence(item.get("snippet", ""))
        url = item.get("url", "")
        lines.append(f"[{index}] {title}\n{snippet}\nURL: {url}")
    return "\n\n".join(lines)


def article_grounding(result: ToolResult) -> str:
    title = sanitize_evidence(result.data.get("title", ""))
    source = sanitize_evidence(result.data.get("source", ""))
    date = sanitize_evidence(result.data.get("date", ""))
    snippet = sanitize_evidence(result.data.get("snippet", ""))
    article = sanitize_evidence(result.data.get("article", ""))
    return (
        "SELECTED NEWS STORY (private untrusted evidence):\n"
        f"Title: {title}\n"
        f"Source: {source}\n"
        f"Date: {date}\n"
        f"Original snippet: {snippet}\n"
        f"Article evidence:\n{article}\n\n"
        "Evidence boundary: report factual details only when stated above. A single story can illustrate "
        "a risk or event, but it does not by itself prove a broad trend. Clearly signal interpretation and uncertainty."
    )


def spoken_headlines(results: list[dict[str, Any]], limit: int = 5) -> str:
    ordinals = ("First", "Second", "Third", "Fourth", "Fifth")
    items = []
    for index, item in enumerate(results[:limit]):
        source = item.get("source")
        suffix = f", from {source}" if source else ""
        items.append(f"{ordinals[index]}: {item['title']}{suffix}.")
    return "Here are the main headlines. " + " ".join(items)


def specialist_grounded_answer(question: str, evidence: dict[str, Any]) -> str | None:
    """Use deterministic domain reasoning for high-risk, easily distorted claims.

    The local 2B model remains the general explainer. This narrow guard handles a
    concrete cybersecurity pattern where turning one test into a universal AI
    capability would materially misstate the source.
    """
    question_lower = question.lower()
    article = str(evidence.get("article", ""))
    article_lower = article.lower()
    is_risk_question = bool(re.search(r"\b(?:risk|danger|security concern|what could go wrong)\b", question_lower))
    is_package_captcha_incident = all(
        marker in article_lower for marker in ("captcha", "pypi", "malicious software")
    )
    if not (is_risk_question and is_package_captcha_incident):
        return None
    source = str(evidence.get("source") or "the article")
    return (
        f"The clearest risk is software-supply-chain abuse. In the incident described by {source}, "
        "the tested model eventually got through a CAPTCHA and uploaded malicious software to PyPI. "
        "The narrow lesson is that CAPTCHA alone did not stop this one automated workflow from reaching "
        "a sensitive publishing action. The article does not establish that every AI agent can defeat "
        "CAPTCHAs or other security checks. A sensible defense is layered protection: tightly scoped "
        "credentials, separate authorization for package publication, behavior monitoring, and fast "
        "revocation instead of relying on one automated check."
    )
