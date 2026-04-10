"""
classifiers.py — Rule-based industry and experience-level inference.

Both functions are intentionally dependency-free (no LLM, no external API).
They work by keyword matching on title, company, and existing skill tags.
"""

from __future__ import annotations

import re

# ── Industry keyword map ───────────────────────────────────────────────────────
# Ordered from most-specific to least-specific.
# First match wins.

_INDUSTRY_RULES: list[tuple[str, list[str]]] = [
    ("Insurtech",             ["insurtech"]),
    ("Insurance",             ["insurance", "insurer", "underwriting", "reinsurance", "actuar"]),
    ("Banking & Finance",     ["bank", "banking", "nbfc", "mutual fund", "investment", "fund manager",
                                "wealth management", "portfolio management", "credit", "ca ", "cfa", "cpa",
                                "asset management", "capital market"]),
    ("Venture Capital",       ["venture capital", "venture capitalist", " vc ", "angel invest", "seed fund"]),
    ("Agentic / Generative AI", ["agentic ai", "gen ai", "generative ai", "llm", "large language"]),
    ("Artificial Intelligence / ML", ["artificial intelligence", " ai ", "machine learning", " ml ", "deep learning",
                                       "nlp", "computer vision", "data science"]),
    ("Technology",            ["software", "tech ", "technology", "developer", "engineer", "it ", "cloud",
                                "saas", "platform", "devops", "cybersecurity", "cyber security", "sdlc",
                                "data architect", "data platform"]),
    ("Data & Analytics",      ["data analysis", "business intelligence", "analytics", "bi ", "data analyst"]),
    ("Healthcare",            ["health", "medical", "pharma", "clinical", "hospital", "biotech", "life science"]),
    ("Legal",                 ["law", "legal", "attorney", "lawyer", "litigation", "compliance", "regulatory"]),
    ("Education & Training",  ["faculty", "professor", "teaching", "educator", "university", "college",
                                "training", "learning & development", "l&d"]),
    ("HR & People",           ["human resource", " hr ", "talent", "recruitment", "people operations",
                                "hrbp", "workforce"]),
    ("Supply Chain & Ops",    ["supply chain", "logistics", "procurement", "operations", "vendor management",
                                "outsourc", "offsourc", "bpo"]),
    ("Marketing",             ["marketing", "brand", "digital marketing", "seo", "content market",
                                "email marketing", "demand gen", "growth market"]),
    ("Sales & Business Dev",  ["sales", "business development", "gtm", "go-to-market", "pre-sales",
                                "presales", "account management", "revenue"]),
    ("Food & FMCG",           ["food", "fmcg", "consumer goods", "retail", "restaurant"]),
    ("Construction & Infra",  ["construction", "infrastructure", "real estate", "civil"]),
    ("Media & Publishing",    ["media", "newspaper", "publishing", "journalism", "content creator"]),
    ("Management Consulting", ["consulting", "consultant", "advisory", "advisor", "management consulting"]),
    ("Entrepreneurship",      ["founder", "co-founder", "entrepreneur", "startup"]),
    ("Finance (General)",     ["finance", "financial", "cfo", "treasurer", "accounting", "audit"]),
    ("General Management",    ["ceo", "cxo", "coo", "managing director", "president", "general manager"]),
]

# Skill-tag columns that map directly to an industry
_SKILL_TAG_INDUSTRY: dict[str, str] = {
    "Insurance":           "Insurance",
    "Insurtech":           "Insurtech",
    "Banking":             "Banking & Finance",
    "Finance":             "Banking & Finance",
    "CA/CFA/CPA":          "Banking & Finance",
    "Mutual Fund/Investment": "Banking & Finance",
    "Credit Risk":         "Banking & Finance",
    "Reinsurance":         "Insurance",
    "Underwriting":        "Insurance",
    "Acturial":            "Insurance",
    "Technology":          "Technology",
    "Agentic AI":          "Agentic / Generative AI",
    "Gen AI":              "Agentic / Generative AI",
    "AI":                  "Artificial Intelligence / ML",
    "Machine learning":    "Artificial Intelligence / ML",
    "Data Analysis":       "Data & Analytics",
    "Business Intelligence": "Data & Analytics",
    "Data/Platform Architect": "Data & Analytics",
    "Cyber Security":      "Technology",
    "Healthcare":          "Healthcare",
    "Law":                 "Legal",
    "Faculty":             "Education & Training",
    "Supply Chain":        "Supply Chain & Ops",
    "BPO":                 "Supply Chain & Ops",
    "Outsourcing/Offsourcing": "Supply Chain & Ops",
    "Marketing":           "Marketing",
    "Digital Marketing":   "Marketing",
    "E-mail Marketing":    "Marketing",
    "Sales":               "Sales & Business Dev",
    "Business development": "Sales & Business Dev",
    "Pre-sales":           "Sales & Business Dev",
    "GTM":                 "Sales & Business Dev",
    "Venture Capitalist":  "Venture Capital",
    "Food Industry":       "Food & FMCG",
    "Constructions":       "Construction & Infra",
    "Newspaper":           "Media & Publishing",
    "Consultant":          "Management Consulting",
    "Entrepreneurs":       "Entrepreneurship",
}

# ── Experience-level keyword map ───────────────────────────────────────────────

_EXPERIENCE_RULES: list[tuple[str, list[str]]] = [
    ("C-Suite",   ["chief ", "ceo", "cto", "cfo", "coo", "cmo", "chro", "cxo", "ciso",
                   "c-suite", "president", "managing director", "md,"]),
    ("VP / SVP",  ["vice president", " vp ", "svp", "evp", "avp", "senior vice"]),
    ("Director",  ["director", "head of", "global head", "group head", "country head",
                   "regional head", "divisional head"]),
    ("Principal / Partner", ["principal", "partner", "founder", "co-founder", "owner"]),
    ("Manager",   ["manager", "lead ", " lead,", "team lead", "group manager", "senior manager"]),
    ("Senior IC", ["senior ", "sr.", "sr ", "staff ", "principal engineer", "principal analyst"]),
    ("Mid-Level", ["associate", "analyst", "specialist", "consultant", "advisor", "executive"]),
    ("Junior",    ["junior", "jr.", "jr ", "assistant", "intern", "trainee", "graduate", "fresher"]),
]


def _normalise(text: str) -> str:
    return " " + text.lower() + " "


def infer_industry(
    title: str | None,
    company: str | None,
    skills_from_sheet: list[str] | None = None,
) -> str:
    """
    Return the most likely industry string.

    Priority order:
    1. Skill-tag columns (already encoded in the Excel)
    2. Keyword match on title
    3. Keyword match on company
    4. "Unknown"
    """
    # 1. Sheet skill tags — use the first recognised tag
    if skills_from_sheet:
        for tag in skills_from_sheet:
            if tag in _SKILL_TAG_INDUSTRY:
                return _SKILL_TAG_INDUSTRY[tag]

    combined = _normalise(f"{title or ''} {company or ''}")

    # 2 & 3. Keyword rules
    for industry, keywords in _INDUSTRY_RULES:
        for kw in keywords:
            if kw in combined:
                return industry

    return "Unknown"


def infer_experience(title: str | None) -> str:
    """
    Return seniority level from the job title.

    Levels: C-Suite · VP/SVP · Director · Principal/Partner ·
            Manager · Senior IC · Mid-Level · Junior · Unknown
    """
    if not title:
        return "Unknown"

    normalised = _normalise(title)

    for level, keywords in _EXPERIENCE_RULES:
        for kw in keywords:
            if kw in normalised:
                return level

    # Fall back to year-of-experience hints sometimes embedded in About text
    # (not available here, handled at call site if needed)
    return "Mid-Level"   # reasonable default for LinkedIn professionals
