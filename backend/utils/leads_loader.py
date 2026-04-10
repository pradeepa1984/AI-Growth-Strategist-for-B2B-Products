"""
leads_loader.py — Load and serve leads from both CSV sources.

Sources
-------
  "apollo"  →  L&D Managers Chief Distribution contacts (1).csv
               2,789 insurance/financial leads, rich data (industry, keywords, email, location)

  "ks"      →  linkedin_pipeline/enriched_leads.csv
               399 KS LinkedIn connections, industry already inferred by pipeline

Keyword matching is computed on every request (never stored or cached on disk).
The `keywords_text` field is built once at load time and used for fast string search.
"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ── File paths ─────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent.parent          # AI_Growth_Strategist/

APOLLO_CSV_PATH = _ROOT / "L&D Managers Chief Distribution contacts (1).csv"
KS_CSV_PATH     = _ROOT / "linkedin_pipeline" / "enriched_leads.csv"

# ── In-memory cache (loaded once per server process) ──────────────────────────
_apollo_cache: list[dict] | None = None
_ks_cache:     list[dict] | None = None


# ── Loaders ───────────────────────────────────────────────────────────────────

def _load_apollo() -> list[dict]:
    global _apollo_cache
    if _apollo_cache is not None:
        return _apollo_cache

    if not APOLLO_CSV_PATH.exists():
        logger.error("Apollo CSV not found: %s", APOLLO_CSV_PATH)
        return []

    leads: list[dict] = []
    with open(APOLLO_CSV_PATH, encoding="utf-8-sig", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            g = lambda k: (row.get(k) or "").strip()

            name = f"{g('First Name')} {g('Last Name')}".strip()
            loc  = ", ".join(p for p in [g("City"), g("State"), g("Country")] if p)

            leads.append({
                "id":               g("Apollo Contact Id") or f"apollo_{i}",
                "source":           "apollo",
                "name":             name or None,
                "first_name":       g("First Name") or None,
                "last_name":        g("Last Name")  or None,
                "title":            g("Title")       or None,
                "company":          g("Company Name") or None,
                "email":            g("Email")        or None,
                "industry":         g("Industry").title() or None,
                "seniority":        g("Seniority")    or None,
                "departments":      g("Departments")  or None,
                "sub_departments":  g("Sub Departments") or None,
                "location":         loc or None,
                "city":             g("City")    or None,
                "state":            g("State")   or None,
                "country":          g("Country") or None,
                "company_city":     g("Company City")    or None,
                "company_state":    g("Company State")   or None,
                "company_country":  g("Company Country") or None,
                "linkedin_url":     g("Person Linkedin Url") or None,
                "company_linkedin": g("Company Linkedin Url") or None,
                "website":          g("Website") or None,
                "employees":        g("# Employees") or None,
                "annual_revenue":   g("Annual Revenue") or None,
                "technologies":     g("Technologies") or None,
                "stage":            g("Stage") or None,
                # csv_keywords: the raw Apollo Keywords column as a list (sent to client for display)
                "csv_keywords": [k.strip() for k in g("Keywords").split(",") if k.strip()],
                # keywords_text: used only for matching — stripped before sending to client
                "keywords_text": " ".join(filter(None, [
                    g("Title"), g("Company Name"), g("Industry"),
                    g("Departments"), g("Sub Departments"), g("Keywords"),
                ])).lower(),
            })

    _apollo_cache = leads
    logger.info("Loaded %d Apollo leads", len(leads))
    return leads


def _load_ks() -> list[dict]:
    global _ks_cache
    if _ks_cache is not None:
        return _ks_cache

    if not KS_CSV_PATH.exists():
        logger.error("KS CSV not found: %s", KS_CSV_PATH)
        return []

    leads: list[dict] = []
    with open(KS_CSV_PATH, encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            g = lambda k: (row.get(k) or "").strip()

            try:
                skills: list[str] = json.loads(g("skills")) if g("skills") else []
            except (json.JSONDecodeError, ValueError):
                skills = []

            leads.append({
                "id":               f"ks_{i}",
                "source":           "ks",
                "name":             g("name")     or None,
                "title":            g("title")    or None,
                "company":          g("company")  or None,
                "email":            g("email")    or None,
                "industry":         g("industry") or None,
                "experience_level": g("experience_level") or None,
                "location":         g("location") or None,
                "linkedin_url":     g("linkedin_url") or None,
                "about":            g("about")    or None,
                "skills":           skills,
                "geo_exposure":     g("geo_exposure") or None,
                "status":           g("status")   or None,
                "followers":        g("followers") or None,
                "keywords_text": " ".join(filter(None, [
                    g("title"), g("company"), g("industry"),
                    g("about"), " ".join(skills),
                ])).lower(),
            })

    _ks_cache = leads
    logger.info("Loaded %d KS leads", len(leads))
    return leads


# ── Keyword matching ──────────────────────────────────────────────────────────

def compute_keyword_match(lead: dict, keywords: list[str]) -> str:
    """
    Return "YES", "NO", or "N/A" (if no keywords supplied).

    Searches the pre-built keywords_text (title + company + industry + Apollo keywords).
    Computed fresh on every request — never persisted.
    """
    if not keywords:
        return "N/A"
    text = lead.get("keywords_text", "")
    return "YES" if any(kw.lower() in text for kw in keywords) else "NO"


# ── Main query function ───────────────────────────────────────────────────────

def get_unique_values(source: str) -> dict:
    """
    Return sorted lists of unique industries and companies for the given source.
    Used to populate dropdown filters in the frontend.
    Called once at page load — O(n) over in-memory cache, very fast.
    """
    if source == "apollo":
        raw = _load_apollo()
    elif source == "ks":
        raw = _load_ks()
    else:
        raw = _load_ks() + _load_apollo()

    industries: list[str] = sorted({
        (l.get("industry") or "").strip()
        for l in raw
        if (l.get("industry") or "").strip()
    })
    companies: list[str] = sorted({
        (l.get("company") or "").strip()
        for l in raw
        if (l.get("company") or "").strip()
    })
    return {"industries": industries, "companies": companies}


def get_leads(
    source: str,
    keywords: list[str],
    page: int,
    limit: int,
    filter_match: str,
    search: str = "",
    industry_filter: str = "",
    company_filter: str = "",
) -> dict:
    """
    Load leads from the requested source, compute keyword_match, apply filters,
    and return a paginated response dict.

    Parameters
    ----------
    source          : "apollo" | "ks" | "all"
    keywords        : CI keywords for dynamic matching
    page            : 1-based page number
    limit           : items per page
    filter_match    : "all" | "yes" | "no"
    search          : substring search on name / company / title / industry
    industry_filter : exact industry name filter (empty = no filter)
    company_filter  : exact company name filter (empty = no filter)
    """
    if source == "apollo":
        raw = _load_apollo()
    elif source == "ks":
        raw = _load_ks()
    else:
        raw = _load_ks() + _load_apollo()

    # Add dynamic keyword_match (not stored on lead objects)
    leads = [{**lead, "keyword_match": compute_keyword_match(lead, keywords)}
             for lead in raw]

    # Filter by keyword match
    if filter_match == "yes":
        leads = [l for l in leads if l["keyword_match"] == "YES"]
    elif filter_match == "no":
        leads = [l for l in leads if l["keyword_match"] == "NO"]

    # Industry filter (exact match)
    if industry_filter:
        leads = [l for l in leads if (l.get("industry") or "") == industry_filter]

    # Company filter (exact match)
    if company_filter:
        leads = [l for l in leads if (l.get("company") or "") == company_filter]

    # Search (substring across name / company / title / industry)
    if search:
        q = search.lower()
        leads = [
            l for l in leads
            if q in (l.get("name")     or "").lower()
            or q in (l.get("company")  or "").lower()
            or q in (l.get("title")    or "").lower()
            or q in (l.get("industry") or "").lower()
        ]

    total   = len(leads)
    matched = sum(1 for l in leads if l.get("keyword_match") == "YES")
    pages   = max(1, (total + limit - 1) // limit)
    page    = max(1, min(page, pages))

    start      = (page - 1) * limit
    page_leads = leads[start : start + limit]

    # Strip keywords_text before sending to client (large payload, not needed in list view)
    for l in page_leads:
        l.pop("keywords_text", None)

    return {
        "leads":   page_leads,
        "total":   total,
        "matched": matched,
        "page":    page,
        "pages":   pages,
        "limit":   limit,
    }


def get_lead_detail(lead_id: str) -> dict | None:
    """Fetch a single lead by id. Strips keywords_text (too large to send)."""
    if lead_id.startswith("ks_"):
        leads = _load_ks()
        try:
            idx = int(lead_id.removeprefix("ks_"))
            lead = leads[idx] if idx < len(leads) else None
        except ValueError:
            lead = None
    else:
        lead = next((l for l in _load_apollo() if l["id"] == lead_id), None)

    if lead:
        result = dict(lead)
        result.pop("keywords_text", None)
        return result
    return None


def reload_caches() -> None:
    """Force reload of both CSVs (call after pipeline re-runs enriched_leads.csv)."""
    global _apollo_cache, _ks_cache
    _apollo_cache = None
    _ks_cache     = None
    logger.info("Lead caches cleared — will reload on next request")
