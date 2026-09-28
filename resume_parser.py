"""Deterministic, privacy-preserving resume-to-profile extraction for MeeraAI."""

from __future__ import annotations

from html import unescape
from pathlib import Path
import re
from typing import Any, Optional


SECTION_ALIASES = {
    "summary": {"summary", "professional summary", "profile", "professional profile", "about", "about me", "objective", "career objective"},
    "skills": {"skills", "technical skills", "core skills", "core competencies", "competencies", "technologies", "tech stack", "expertise"},
    "experience": {"experience", "work experience", "professional experience", "employment", "employment history", "career history"},
    "education": {"education", "academic background", "academic qualifications", "qualifications"},
    "projects": {"projects", "selected projects", "personal projects", "key projects"},
    "certifications": {"certifications", "certificates", "licenses", "courses"},
}
ALL_HEADINGS = {value for values in SECTION_ALIASES.values() for value in values}
ROLE_WORDS = {
    "engineer", "developer", "designer", "manager", "student", "director", "consultant",
    "specialist", "analyst", "lead", "architect", "scientist", "officer", "founder",
    "president", "executive", "administrator", "researcher", "professor", "teacher",
    "intern", "accountant", "marketer", "writer", "editor", "product", "operations",
    "sales", "recruiter", "entrepreneur", "ceo", "cto", "cfo", "coo", "vp",
}
NAME_STOPWORDS = ALL_HEADINGS | {
    "resume", "curriculum vitae", "cv", "contact", "details", "personal details",
    "phone", "email", "address", "linkedin", "github", "portfolio",
}


def clean_line(value: str) -> str:
    value = unescape(str(value or "")).replace("\u00a0", " ")
    value = re.sub(r"[\t ]+", " ", value)
    return value.strip(" \t\r\n|•·▪■►–—-")


def heading_key(line: str) -> Optional[str]:
    normalized = re.sub(r"[^a-z ]", "", line.casefold()).strip()
    for key, aliases in SECTION_ALIASES.items():
        if normalized in aliases:
            return key
    return None


def section(lines: list[str], key: str, max_lines: int) -> list[str]:
    collecting = False
    result: list[str] = []
    for line in lines:
        heading = heading_key(line)
        if heading:
            if collecting:
                break
            collecting = heading == key
            continue
        if collecting:
            result.append(line)
            if len(result) >= max_lines:
                break
    return result


def parse_resume_profile_text(text: str, filename: str = "resume") -> dict[str, Any]:
    """Extract onboarding fields from resume text without transmitting it externally."""
    normalized_text = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [clean_line(line) for line in normalized_text.split("\n")]
    lines = [line for line in lines if line]
    if not lines:
        raise ValueError("The resume did not contain readable text.")

    email_match = re.search(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", normalized_text)
    phone_match = re.search(r"(?<!\d)(?:\+?\d[\d ().-]{7,}\d)(?!\d)", normalized_text)
    linkedin_match = re.search(r"(?i)(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_%\-/.]+", normalized_text)
    github_match = re.search(r"(?i)(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+", normalized_text)

    def is_contact_line(line: str) -> bool:
        lowered = line.casefold()
        return bool(
            re.search(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", line)
            or re.search(r"(?<!\d)(?:\+?\d[\d ().-]{7,}\d)(?!\d)", line)
            or "linkedin" in lowered or "github" in lowered or "http://" in lowered or "https://" in lowered
        )

    name = ""
    best_name_score = -100.0
    for index, line in enumerate(lines[:24]):
        words = line.split()
        lowered = line.casefold().rstrip(":")
        if (
            is_contact_line(line) or lowered in NAME_STOPWORDS or heading_key(line)
            or len(line) > 55 or not 2 <= len(words) <= 5 or any(char.isdigit() for char in line)
            or any(separator in line for separator in (",", "|", ";", ":", " / "))
            or any(word.casefold().strip(".,") in ROLE_WORDS for word in words)
        ):
            continue
        alpha_words = [re.sub(r"[^A-Za-zÀ-ž'’-]", "", word) for word in words]
        if not alpha_words or any(not word for word in alpha_words):
            continue
        title_ratio = sum(word[:1].isupper() for word in alpha_words) / len(alpha_words)
        letters = "".join(alpha_words)
        if title_ratio < .66 and not letters.isupper():
            continue
        score = 12 - index * .55 + title_ratio * 4
        if 2 <= len(words) <= 3:
            score += 3
        if line.isupper():
            score += 1
        if score > best_name_score:
            name = line.title() if line.isupper() else line
            best_name_score = score

    if not name:
        stem = re.sub(r"[_\-.]+", " ", Path(filename).stem)
        stem = re.sub(r"(?i)\b(resume|cv|curriculum|vitae|profile|updated|final|copy)\b", " ", stem)
        stem = re.sub(r"\s+", " ", stem).strip()
        if 2 <= len(stem.split()) <= 5 and not any(char.isdigit() for char in stem):
            name = stem.title()

    role = ""
    role_score = -100.0
    title_pattern = re.compile(r"(?i)\b(" + "|".join(sorted(ROLE_WORDS, key=len, reverse=True)) + r")\b")
    for index, line in enumerate(lines[:40]):
        if line == name or is_contact_line(line) or heading_key(line) or len(line) > 90:
            continue
        role_hits = title_pattern.findall(line)
        if not role_hits:
            continue
        score = 10 - index * .2 + min(3, len(role_hits))
        if re.search(r"\b(19|20)\d{2}\b|\b(present|current)\b", line, re.I):
            score -= 3
        if any(separator in line for separator in (" | ", " – ", " — ", " at ", " @ ")):
            score += 1
        candidate = re.split(r"\s+[|•]\s+|\s+[–—]\s+|\s+at\s+|\s+@\s+", line, maxsplit=1, flags=re.I)[0]
        candidate = candidate.strip(" ,;:-")
        if 2 <= len(candidate) <= 70 and score > role_score:
            role, role_score = candidate, score

    summary_lines = section(lines, "summary", 8)
    experience_lines = section(lines, "experience", 8)
    education_lines = section(lines, "education", 4)
    project_lines = section(lines, "projects", 5)
    skill_lines = section(lines, "skills", 6)
    skills: list[str] = []
    seen_skills: set[str] = set()
    for skill_line in skill_lines:
        for item in re.split(r"[,|•·;]|\s{2,}", skill_line):
            item = clean_line(item)
            key = item.casefold()
            if 1 < len(item) <= 45 and key not in seen_skills and not re.search(r"\b(19|20)\d{2}\b", item):
                skills.append(item)
                seen_skills.add(key)
            if len(skills) >= 18:
                break
        if len(skills) >= 18:
            break

    bio_parts: list[str] = []
    if summary_lines:
        bio_parts.append("Professional summary: " + " ".join(summary_lines)[:900])
    elif role:
        bio_parts.append(f"Professional background: {role}.")
    if skills:
        bio_parts.append("Key skills: " + ", ".join(skills) + ".")
    if experience_lines:
        bio_parts.append("Recent experience: " + " ".join(experience_lines)[:650])
    if project_lines:
        bio_parts.append("Selected projects: " + " ".join(project_lines)[:450])
    if education_lines:
        bio_parts.append("Education: " + " ".join(education_lines)[:350])
    bio = "\n\n".join(bio_parts).strip()[:2400]

    found = sum(bool(value) for value in (name, role, bio, skills))
    confidence = "high" if name and role and bio else "medium" if found >= 2 else "low"
    return {
        "name": name,
        "preferred_name": name.split()[0] if name else "",
        "role": role,
        "bio": bio,
        "skills": skills,
        "contact": {
            "email": email_match.group(0) if email_match else "",
            "phone": phone_match.group(0).strip() if phone_match else "",
            "linkedin": linkedin_match.group(0) if linkedin_match else "",
            "github": github_match.group(0) if github_match else "",
        },
        "confidence": confidence,
        "characters_read": len(normalized_text),
    }
