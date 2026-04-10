"""
Dynamic Lead Generation Module
================================
Replaces the static Apollo CSV with a multi-source, API-first pipeline:

Priority order:
  1. Google Custom Search API  → finds company domains matching the ICP query
  2. Hunter.io Domain Search   → discovers emails on those domains
  3. Firecrawl                 → scrapes company homepages for extra context
  4. Apollo CSV (fallback)     → static file, used when live sources yield < MIN_LEADS

Environment variables required:
  GOOGLE_CSE_API_KEY   — Google Custom Search API key (100 free queries/day)
  GOOGLE_CSE_CX        — Custom Search Engine ID (configure at cse.google.com)
  HUNTER_API_KEY       — Hunter.io API key (25 free domain searches/month)

Optional (already in system):
  FIRECRAWL_API_KEY    — used to enrich company pages

Rate limits respected:
  - Google CSE: 100 queries/day → we stay within 10 per call
  - Hunter.io:  25 searches/month → batched, deduplicated per domain
  - Firecrawl:  uses existing client wrapper
"""

import logging
import os
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"
HUNTER_DOMAIN_URL = "https://api.hunter.io/v2/domain-search"
HUNTER_EMAIL_URL = "https://api.hunter.io/v2/email-finder"

MAX_GOOGLE_RESULTS_PER_QUERY = 10   # Google CSE max per request
MAX_COMPANIES = 20                   # total companies to discover
MIN_LEADS = 5                        # below this, fall back to CSV
RATE_LIMIT_DELAY = 0.5              # seconds between API calls


# ── Google Custom Search ──────────────────────────────────────────────────────

def _search_google_cse(query: str, api_key: str, cx: str, num: int = 10) -> list[dict]:
    """
    Run one Google Custom Search query.
    Returns list of {title, link, snippet} dicts.
    Handles quota errors gracefully (returns empty list).
    """
    params = {
        "key": api_key,
        "cx": cx,
        "q": query,
        "num": min(num, 10),   # Google CSE max is 10 per request
    }
    try:
        resp = requests.get(GOOGLE_CSE_URL, params=params, timeout=10)
        if resp.status_code == 429:
            logger.warning("Google CSE rate limit hit — skipping remaining queries")
            return []
        if resp.status_code != 200:
            logger.error(f"Google CSE error {resp.status_code}: {resp.text[:200]}")
            return []
        items = resp.json().get("items") or []
        return [{"title": i.get("title", ""), "link": i.get("link", ""), "snippet": i.get("snippet", "")} for i in items]
    except requests.RequestException as e:
        logger.error(f"Google CSE request failed: {e}")
        return []


def _extract_domain(url: str) -> str:
    """Strip protocol and path from a URL to get the root domain."""
    from urllib.parse import urlparse
    parsed = urlparse(url if "://" in url else f"https://{url}")
    domain = parsed.netloc.lower()
    return domain.replace("www.", "").split(":")[0]


def discover_companies_via_google(
    target_customers: list[str],
    buyer_industry: str,
    offerings: list[str],
    api_key: str,
    cx: str,
) -> list[dict]:
    """
    Build ICP-targeted search queries and discover company domains via Google CSE.

    Strategy:
      - Query: "<ICP> <offering> company"  e.g. "Life Insurer claims management software"
      - Deduplicate by domain
      - Return up to MAX_COMPANIES unique company dicts
    """
    queries = []

    # ICP + offering (highest precision)
    for icp in target_customers[:3]:
        for offering in offerings[:2]:
            queries.append(f"{icp} {offering} company")

    # ICP + industry fallback
    for icp in target_customers[:3]:
        queries.append(f"{icp} {buyer_industry} software")

    # Industry + offering fallback
    for offering in offerings[:2]:
        queries.append(f"{buyer_industry} {offering} vendor")

    seen_domains: set[str] = set()
    companies: list[dict] = []

    for query in queries[:8]:   # cap at 8 queries to stay within daily quota
        if len(companies) >= MAX_COMPANIES:
            break

        results = _search_google_cse(query, api_key, cx)
        time.sleep(RATE_LIMIT_DELAY)

        for item in results:
            domain = _extract_domain(item["link"])
            if not domain or domain in seen_domains:
                continue
            # Filter out non-company results (aggregators, Wikipedia, etc.)
            if any(skip in domain for skip in ["wikipedia", "linkedin", "twitter", "facebook", "crunchbase", "glassdoor", "indeed"]):
                continue
            seen_domains.add(domain)
            companies.append({
                "company": item["title"].split(" - ")[0].split(" | ")[0].strip(),
                "website": f"https://{domain}",
                "domain": domain,
                "snippet": item["snippet"],
                "source": "google_cse",
            })
            if len(companies) >= MAX_COMPANIES:
                break

    logger.info(f"Google CSE discovered {len(companies)} unique companies")
    return companies


# ── Hunter.io Email Discovery ─────────────────────────────────────────────────

def find_emails_hunter(domain: str, api_key: str, limit: int = 5) -> list[dict]:
    """
    Search Hunter.io for email addresses associated with a company domain.
    Returns list of {name, email, role, linkedin} dicts.
    """
    params = {
        "domain": domain,
        "api_key": api_key,
        "limit": limit,
    }
    try:
        resp = requests.get(HUNTER_DOMAIN_URL, params=params, timeout=10)
        if resp.status_code == 429:
            logger.warning(f"Hunter.io rate limit hit for domain {domain}")
            return []
        if resp.status_code != 200:
            logger.debug(f"Hunter.io {resp.status_code} for {domain}")
            return []

        data = resp.json().get("data", {})
        emails_raw = data.get("emails") or []

        results = []
        for e in emails_raw:
            first = (e.get("first_name") or "").strip()
            last = (e.get("last_name") or "").strip()
            results.append({
                "name": f"{first} {last}".strip() or "—",
                "first_name": first,
                "last_name": last,
                "email": e.get("value", ""),
                "title": e.get("position", ""),
                "linkedin": e.get("linkedin", ""),
                "email_status": "verified" if e.get("verification", {}).get("status") == "valid" else "unverified",
            })
        return results
    except requests.RequestException as e:
        logger.error(f"Hunter.io request failed for {domain}: {e}")
        return []


def find_single_email_hunter(domain: str, first_name: str, last_name: str, api_key: str) -> Optional[str]:
    """
    Use Hunter.io Email Finder to guess a specific person's email address.
    Returns the email string or None.
    """
    params = {
        "domain": domain,
        "first_name": first_name,
        "last_name": last_name,
        "api_key": api_key,
    }
    try:
        resp = requests.get(HUNTER_EMAIL_URL, params=params, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json().get("data", {})
        email = data.get("email")
        score = data.get("score", 0)
        if email and score >= 50:   # Only return if confidence ≥ 50%
            return email
        return None
    except requests.RequestException:
        return None


# ── Lead Assembly ─────────────────────────────────────────────────────────────

def _normalize_title_for_icp(title: str, target_customers: list[str]) -> bool:
    """
    Lightweight check: does this person's job title suggest they're in the ICP?
    Returns True if the role is relevant (decision-maker or influencer).
    """
    title_lower = title.lower()
    relevant_roles = [
        "ceo", "cto", "coo", "cfo", "vp", "vice president", "director",
        "head of", "chief", "president", "founder", "owner", "manager",
        "svp", "evp", "avp", "principal",
    ]
    # Also check ICP-specific terms
    icp_terms = [t.lower() for t in target_customers]

    return (
        any(r in title_lower for r in relevant_roles)
        or any(t in title_lower for t in icp_terms)
    )


def generate_leads_dynamic(
    target_customers: list[str],
    buyer_industry: str,
    offerings: list[str],
) -> dict:
    """
    Main entry point for dynamic lead generation.

    Steps:
      1. Discover companies via Google CSE
      2. For each company, find contacts via Hunter.io
      3. Assemble structured lead objects
      4. Return {leads, sources, total}

    Falls back gracefully if API keys are missing.
    """
    google_key = os.environ.get("GOOGLE_CSE_API_KEY", "")
    google_cx = os.environ.get("GOOGLE_CSE_CX", "")
    hunter_key = os.environ.get("HUNTER_API_KEY", "")

    leads: list[dict] = []
    sources_used: list[str] = []

    # ── Step 1: Company Discovery ─────────────────────────────────────────────
    companies: list[dict] = []

    if google_key and google_cx:
        companies = discover_companies_via_google(
            target_customers, buyer_industry, offerings, google_key, google_cx
        )
        if companies:
            sources_used.append("google_cse")
    else:
        logger.warning("GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX not set — skipping Google CSE discovery")

    # ── Step 2: Contact Discovery per Company ─────────────────────────────────
    seen_emails: set[str] = set()

    for company in companies:
        domain = company.get("domain", "")
        if not domain:
            continue

        contacts: list[dict] = []

        if hunter_key:
            contacts = find_emails_hunter(domain, hunter_key, limit=3)
            time.sleep(RATE_LIMIT_DELAY)   # respect Hunter.io rate limits
            if contacts:
                sources_used.append("hunter_io")

        if contacts:
            for contact in contacts:
                email = contact.get("email", "")
                if not email or email in seen_emails:
                    continue
                seen_emails.add(email)

                # Filter to decision-maker roles when possible
                title = contact.get("title", "")
                if title and not _normalize_title_for_icp(title, target_customers):
                    continue

                leads.append({
                    "name": contact.get("name", "—"),
                    "first_name": contact.get("first_name", ""),
                    "last_name": contact.get("last_name", ""),
                    "title": title,
                    "company": company.get("company", ""),
                    "email": email,
                    "email_status": contact.get("email_status", "unverified"),
                    "website": company.get("website", ""),
                    "industry": buyer_industry,
                    "linkedin": contact.get("linkedin", ""),
                    "city": "",
                    "country": "",
                    "source": "dynamic",
                    "snippet": company.get("snippet", ""),
                })
        else:
            # No contacts found — add company record without person (for scoring pipeline)
            leads.append({
                "name": "—",
                "first_name": "",
                "last_name": "",
                "title": "",
                "company": company.get("company", ""),
                "email": "",
                "email_status": "",
                "website": company.get("website", ""),
                "industry": buyer_industry,
                "linkedin": "",
                "city": "",
                "country": "",
                "source": "dynamic",
                "snippet": company.get("snippet", ""),
            })

    logger.info(f"Dynamic lead generation produced {len(leads)} leads from sources: {list(set(sources_used))}")

    return {
        "leads": leads,
        "sources_used": list(set(sources_used)),
        "total": len(leads),
        "fallback_needed": len([l for l in leads if l.get("email")]) < MIN_LEADS,
    }
