from resume_parser import parse_resume_profile_text


SAMPLE_RESUME = """PRIYA SHARMA
Senior Software Engineer | AI Platform
priya@example.com | +91 98765 43210

PROFESSIONAL SUMMARY
Software engineer with 7 years of experience building reliable AI products and distributed systems.

TECHNICAL SKILLS
Python, TypeScript, React, FastAPI, PostgreSQL, AWS

PROFESSIONAL EXPERIENCE
Senior Software Engineer at Acme Labs | 2022 - Present
Led platform engineering and mentoring.

EDUCATION
B.Tech in Computer Science, Example University
"""


def test_resume_profile_extracts_high_signal_fields():
    profile = parse_resume_profile_text(SAMPLE_RESUME, "Priya_Sharma_Resume.pdf")

    assert profile["name"] == "Priya Sharma"
    assert profile["preferred_name"] == "Priya"
    assert profile["role"] == "Senior Software Engineer"
    assert profile["confidence"] == "high"
    assert "FastAPI" in profile["skills"]
    assert "Professional summary" in profile["bio"]
    assert profile["contact"]["email"] == "priya@example.com"


def test_resume_profile_uses_safe_filename_fallback_for_name():
    profile = parse_resume_profile_text(
        "SKILLS\nPython, SQL\nEXPERIENCE\nData Analyst at Example Corp",
        "Aarav_Patel_Resume_Final.txt",
    )

    assert profile["name"] == "Aarav Patel"
    assert profile["preferred_name"] == "Aarav"
    assert profile["role"] == "Data Analyst"


def test_resume_profile_rejects_empty_text():
    try:
        parse_resume_profile_text("  \n\t", "empty.pdf")
    except ValueError as error:
        assert "readable text" in str(error)
    else:
        raise AssertionError("Expected empty resume text to be rejected")
