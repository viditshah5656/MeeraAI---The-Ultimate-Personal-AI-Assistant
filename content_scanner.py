"""Detect likely secrets and prompt-injection text in untrusted project content."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class ContentFinding:
    path: str
    kind: str
    severity: str
    evidence: str


SECRET_PATTERNS = (
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("api_key", re.compile(r"\b(?:sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})\b")),
    ("credential_assignment", re.compile(r"(?i)\b(?:api[_-]?key|secret|password|token)\s*[=:]\s*['\"]?[^\s'\"]{12,}")),
)
INJECTION_PATTERNS = (
    ("instruction_override", re.compile(r"(?i)\b(ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions\b")),
    ("secret_exfiltration", re.compile(r"(?i)\b(send|upload|paste|reveal|print)\b.{0,60}\b(?:secret|token|password|private key|environment variable)\b")),
    ("tool_manipulation", re.compile(r"(?i)\b(?:run|execute)\b.{0,40}\b(?:sudo|rm -rf|curl\s+[^ ]+\s*\|\s*(?:sh|bash))\b")),
)


def scan_text(path: str, content: str) -> list[ContentFinding]:
    findings: list[ContentFinding] = []
    for kind, pattern in (*SECRET_PATTERNS, *INJECTION_PATTERNS):
        match = pattern.search(content)
        if match:
            severity = "critical" if kind in {"private_key", "api_key", "secret_exfiltration"} else "high"
            findings.append(ContentFinding(path, kind, severity, match.group(0)[:120]))
    return findings


def scan_files(root: Path, relative_paths: Iterable[str], excluded: Iterable[str] = ()) -> list[ContentFinding]:
    excluded_set = set(excluded)
    findings: list[ContentFinding] = []
    for relative in relative_paths:
        path = Path(relative)
        if path.name in excluded_set or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".db"}:
            continue
        target = (root / path).resolve()
        try:
            target.relative_to(root.resolve())
            content = target.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeError, ValueError):
            continue
        findings.extend(scan_text(path.as_posix(), content))
    return findings


def findings_to_dict(findings: Iterable[ContentFinding]) -> list[dict]:
    return [asdict(item) for item in findings]
