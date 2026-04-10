"""
lead_enricher.py — Location + keyword scoring for Apollo CSV leads.

Two scoring criteria (as required):

  (A) location_score  — Company HQ location vs lead's location
      Source of company location: Company Intelligence → company_location field
      (extracted from the website's About/Contact/Footer by the CI LLM).

      +2  city match:    lead's City matches the company's city
      +1  country match: lead's Country matches the company's country (no city match)
       0  no match, or company_location not available

  (B) keyword_score  — CSV Keywords vs CI keywords
      Source of lead keywords: CSV 'Keywords' column (Apollo-exported, comma-separated)
      Source of company keywords: Company Intelligence → keywords list

      +1 per CI keyword found in the lead's CSV keyword list
      (normalised comparison — case-insensitive, trimmed)

  final_score = location_score + keyword_score
  rank        = 1-based global position after sorting by final_score desc

Industry grouping uses 'canonical_industry' when set (by classify_leads_industry),
otherwise falls back to the raw 'industry' CSV field.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Country normalisation ──────────────────────────────────────────────────────
# Maps common short-forms and aliases → canonical lowercase country string.
# Keeps location matching robust even when CI says "India" and lead says "IN".

_COUNTRY_ALIASES: dict[str, str] = {
    "india": "india", "in": "india", "indian": "india", "bharat": "india",
    "usa": "united states", "us": "united states", "u.s.": "united states",
    "united states": "united states", "united states of america": "united states",
    "uk": "united kingdom", "britain": "united kingdom", "england": "united kingdom",
    "united kingdom": "united kingdom", "great britain": "united kingdom",
    "uae": "uae", "dubai": "uae", "abu dhabi": "uae",
    "united arab emirates": "uae",
    "singapore": "singapore", "sg": "singapore",
    "australia": "australia", "au": "australia",
    "canada": "canada", "ca": "canada",
    "germany": "germany", "deutschland": "germany", "de": "germany",
    "france": "france", "fr": "france",
    "netherlands": "netherlands", "holland": "netherlands", "nl": "netherlands",
    "japan": "japan", "jp": "japan",
    "south korea": "south korea", "korea": "south korea", "kr": "south korea",
    "china": "china", "prc": "china", "cn": "china",
    "brazil": "brazil", "brasil": "brazil", "br": "brazil",
    "indonesia": "indonesia", "id": "indonesia",
    "malaysia": "malaysia", "my": "malaysia",
    "thailand": "thailand", "th": "thailand",
    "philippines": "philippines", "ph": "philippines",
    "vietnam": "vietnam", "viet nam": "vietnam", "vn": "vietnam",
    "south africa": "south africa", "za": "south africa",
    "nigeria": "nigeria", "ng": "nigeria",
    "kenya": "kenya", "ke": "kenya",
}


def _canonical_country(raw: str) -> str:
    """Normalise a raw country string to a canonical form for comparison."""
    c = raw.lower().strip().rstrip(".")
    return _COUNTRY_ALIASES.get(c, c)


def _location_tokens(text: str) -> set[str]:
    """Extract word tokens (length >= 3) for fuzzy location matching."""
    return set(re.findall(r'\b[a-z]{3,}\b', text.lower()))


# ── (A) Location scoring ──────────────────────────────────────────────────────

def parse_company_location(ci_data: Optional[dict]) -> tuple[str, str]:
    """
    Extract city and country from CI's company_location field.

    company_location is expected as "City, Country" e.g. "Mumbai, India".
    Handles missing or malformed values gracefully.

    Returns (city_lower, country_canonical).
    """
    loc = (ci_data or {}).get("company_location", "").strip()
    if not loc:
        return "", ""

    # Split on comma: "Mumbai, India" → city="Mumbai", country="India"
    parts = [p.strip() for p in loc.split(",")]
    if len(parts) >= 2:
        city    = parts[0].lower()
        country = _canonical_country(parts[-1])
    elif len(parts) == 1:
        # Only one part — try to determine if it's a city or country
        single = parts[0].lower()
        canonical = _canonical_country(single)
        # If it maps to a country, treat as country-only
        if canonical != single or single in _COUNTRY_ALIASES:
            city, country = "", canonical
        else:
            city, country = single, ""
    else:
        return "", ""

    return city, country


def score_location(lead: dict, company_city: str, company_country: str) -> tuple[int, str]:
    """
    Compare lead's city/country (from CSV) to company's HQ location (from CI).

    Scoring:
      +2 → lead's city matches company city (exact or token overlap)
      +1 → lead's country matches company country (no city match)
       0 → no match, or location data unavailable

    Returns (score, explanation).
    """
    if not company_city and not company_country:
        return 0, "company_location not set in CI"

    lead_city    = (lead.get("city")    or "").lower().strip()
    lead_country = (lead.get("country") or "").lower().strip()

    if not lead_city and not lead_country:
        return 0, "lead has no location in CSV"

    # ── City match (+2) ───────────────────────────────────────────────────────
    if company_city and lead_city:
        # Substring check (bidirectional)
        if company_city in lead_city or lead_city in company_city:
            return 2, f"city match: '{lead_city}' = '{company_city}'"
        # Token overlap (handles "Bengaluru" vs "Bangalore" partially, at least for shared tokens)
        if _location_tokens(company_city) & _location_tokens(lead_city):
            return 2, f"city token match: '{lead_city}' ~ '{company_city}'"

    # ── Country match (+1) ────────────────────────────────────────────────────
    if company_country and lead_country:
        lead_canonical = _canonical_country(lead_country)
        if lead_canonical == company_country:
            return 1, f"country match: '{lead_country}' = '{company_country}'"

    return 0, f"no match: lead='{lead_city},{lead_country}' company='{company_city},{company_country}'"


# ── (B) Keyword scoring ───────────────────────────────────────────────────────

def score_keywords(
    lead: dict,
    ci_keywords: list[str],
) -> tuple[int, list[str]]:
    """
    Count how many Company Intelligence keywords appear in the lead's
    CSV Keywords field.

    Lead keywords come from the CSV 'Keywords' column (stored as csv_keywords list).
    Each matching CI keyword → +1 point.

    Returns (score, list_of_matched_keywords).
    """
    if not ci_keywords:
        return 0, []

    # Lead's own keywords from the Apollo CSV 'Keywords' column
    lead_kws_raw: list[str] = lead.get("csv_keywords") or []
    if not lead_kws_raw:
        return 0, []

    # Build a normalised set of lead keywords for fast lookup
    lead_kw_set: set[str] = {k.lower().strip() for k in lead_kws_raw if k.strip()}

    matched: list[str] = []
    for ci_kw in ci_keywords:
        ci_kw_lower = ci_kw.lower().strip()
        if not ci_kw_lower or len(ci_kw_lower) < 3:
            continue
        # Exact match first
        if ci_kw_lower in lead_kw_set:
            matched.append(ci_kw)
            continue
        # Substring match: CI keyword contained in any lead keyword phrase, or vice versa
        for lead_kw in lead_kw_set:
            if ci_kw_lower in lead_kw or lead_kw in ci_kw_lower:
                matched.append(ci_kw)
                break

    return len(matched), matched


# ── Full enrichment pipeline ──────────────────────────────────────────────────

def enrich_and_rank(
    leads: list[dict],
    ci_data: Optional[dict],
    mi_data: Optional[dict],   # kept for API compatibility; not used for scoring
) -> tuple[list[dict], list[str], dict]:
    """
    Enrich every lead with location_score, keyword_score, final_score, rank.

    Scoring is based on exactly two criteria:
      (A) CI company_location (HQ city/country) vs lead's CSV city/country
      (B) CI keywords vs lead's CSV Keywords field

    Args:
        leads:    Lead dicts parsed from leads.csv (must include 'csv_keywords')
        ci_data:  Company Intelligence dict — provides company_location + keywords
        mi_data:  Not used for scoring; kept for signature compatibility

    Returns:
        (enriched_leads, industry_list, industry_groups)
    """
    # ── Extract CI signals ────────────────────────────────────────────────────
    company_city, company_country = parse_company_location(ci_data)
    ci_keywords: list[str] = list((ci_data or {}).get("keywords", []))

    logger.info(
        "Lead enricher — company_location: city='%s' country='%s' | ci_keywords: %d",
        company_city, company_country, len(ci_keywords),
    )

    # ── Score every lead ──────────────────────────────────────────────────────
    enriched: list[dict] = []
    for lead in leads:
        loc_score, loc_reason = score_location(lead, company_city, company_country)
        kw_score, kw_matched  = score_keywords(lead, ci_keywords)
        final                 = loc_score + kw_score

        # Canonical industry: prefer already-set canonical_industry, then raw CSV field
        canonical = (
            lead.get("canonical_industry")
            or lead.get("industry")
            or "Other"
        ).strip() or "Other"

        enriched.append({
            **lead,
            "canonical_industry": canonical,
            "location_score":     loc_score,
            "location_reason":    loc_reason,
            "keyword_score":      kw_score,
            "keyword_matches":    kw_matched[:8],   # top 8 for display
            "final_score":        final,
            "rank":               0,                 # assigned below
        })

    # ── Sort by final_score desc, company as tiebreaker ───────────────────────
    enriched.sort(key=lambda x: (-x["final_score"], x.get("company", "").lower()))
    for i, lead in enumerate(enriched):
        lead["rank"] = i + 1

    # ── Build industry groups ─────────────────────────────────────────────────
    industry_counts: dict[str, int] = {}
    for lead in enriched:
        k = lead["canonical_industry"]
        industry_counts[k] = industry_counts.get(k, 0) + 1

    sorted_items = sorted(
        industry_counts.items(),
        key=lambda x: (x[0] == "Other", -x[1], x[0].lower()),
    )
    industry_list   = [k for k, _ in sorted_items]
    industry_groups = dict(sorted_items)

    return enriched, industry_list, industry_groups
