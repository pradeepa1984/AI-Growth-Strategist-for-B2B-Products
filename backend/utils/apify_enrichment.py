"""
LinkedIn Enrichment via Apify
================================
Enriches lead data by scraping LinkedIn profiles and company pages
using Apify actors. This is the fallback when dynamic lead generation
doesn't yield sufficient email coverage.

Apify actors used:
  - linkedin-profile-scraper  (2eMkcp2xjVQqT4ByX) — person profile
  - linkedin-company-scraper  (9VsBB5ojfVzKnmBVe) — company page

Environment variables required:
  APIFY_API_TOKEN   — your Apify API token (free tier: 5 actor runs/month)

Enrichment output per lead:
  - recent_posts:    last 3 LinkedIn post summaries
  - skills:          top skills from profile
  - experience:      current and recent roles
  - about:           LinkedIn bio
  - company_size:    from company page
  - company_desc:    company page description
  - enriched_at:     ISO timestamp

Storage: enriched data is saved to DynamoDB enrichment table (see aws_storage.py)
"""

import logging
import os
import time
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

APIFY_BASE_URL = "https://api.apify.com/v2"
ACTOR_PROFILE = "2eMkcp2xjVQqT4ByX"    # Apify LinkedIn Profile Scraper
ACTOR_COMPANY = "9VsBB5ojfVzKnmBVe"    # Apify LinkedIn Company Scraper

# How long to poll for actor run completion (seconds)
POLL_INTERVAL = 5
MAX_POLL_TIME = 120   # 2 minutes max wait per run


# ── Apify Runner ──────────────────────────────────────────────────────────────

def _run_actor(actor_id: str, input_data: dict, api_token: str) -> dict | None:
    """
    Start an Apify actor run synchronously (poll until done or timeout).
    Returns the first dataset item, or None on failure.

    Uses Apify's "run-sync-get-dataset-items" endpoint to avoid
    managing webhooks — simpler for lower-volume enrichment calls.
    """
    url = f"{APIFY_BASE_URL}/acts/{actor_id}/run-sync-get-dataset-items"
    params = {"token": api_token, "timeout": MAX_POLL_TIME}

    try:
        resp = requests.post(url, json=input_data, params=params, timeout=MAX_POLL_TIME + 10)
        if resp.status_code == 200:
            items = resp.json()
            if isinstance(items, list) and items:
                return items[0]
        elif resp.status_code == 402:
            logger.warning("Apify quota exceeded — enrichment skipped")
        else:
            logger.error(f"Apify actor {actor_id} returned {resp.status_code}: {resp.text[:300]}")
        return None
    except requests.Timeout:
        logger.warning(f"Apify actor {actor_id} timed out after {MAX_POLL_TIME}s")
        return None
    except requests.RequestException as e:
        logger.error(f"Apify request failed: {e}")
        return None


# ── Profile Scraper ────────────────────────────────────────────────────────────

def scrape_linkedin_profile(linkedin_url: str, api_token: str) -> dict:
    """
    Scrape a LinkedIn person profile via Apify.

    Returns structured dict with:
      about, headline, experience, skills, recent_posts
    """
    if not linkedin_url or "linkedin.com" not in linkedin_url:
        return {}

    logger.info(f"Enriching LinkedIn profile: {linkedin_url}")
    result = _run_actor(
        ACTOR_PROFILE,
        {"profileUrls": [linkedin_url]},
        api_token,
    )

    if not result:
        return {}

    # Extract most recent 3 posts (if actor returns them)
    posts_raw = result.get("posts") or []
    recent_posts = [
        {
            "text": p.get("text", "")[:300],
            "likes": p.get("numLikes", 0),
            "date": p.get("date", ""),
        }
        for p in posts_raw[:3]
    ]

    # Extract experience — current + last role only
    experience_raw = result.get("experience") or []
    experience = [
        {
            "title": exp.get("title", ""),
            "company": exp.get("company", ""),
            "duration": exp.get("duration", ""),
        }
        for exp in experience_raw[:2]   # current + one prior
    ]

    return {
        "about": (result.get("about") or "")[:500],
        "headline": result.get("headline", ""),
        "skills": (result.get("skills") or [])[:10],
        "experience": experience,
        "recent_posts": recent_posts,
        "connection_count": result.get("connectionsCount", 0),
    }


# ── Company Scraper ───────────────────────────────────────────────────────────

def scrape_linkedin_company(company_linkedin_url: str, api_token: str) -> dict:
    """
    Scrape a LinkedIn company page via Apify.

    Returns structured dict with:
      description, size, industry, specialities, recent_posts
    """
    if not company_linkedin_url or "linkedin.com" not in company_linkedin_url:
        return {}

    logger.info(f"Enriching LinkedIn company page: {company_linkedin_url}")
    result = _run_actor(
        ACTOR_COMPANY,
        {"startUrls": [{"url": company_linkedin_url}]},
        api_token,
    )

    if not result:
        return {}

    return {
        "company_desc": (result.get("description") or "")[:500],
        "company_size": result.get("staffCount", ""),
        "company_size_range": result.get("employeeCountRange", ""),
        "industry": result.get("industries", []),
        "specialities": (result.get("specialities") or [])[:8],
        "founded": result.get("founded", ""),
        "headquarters": result.get("headquarter", {}).get("city", ""),
    }


# ── Full Enrichment Pipeline ──────────────────────────────────────────────────

def enrich_lead(lead: dict) -> dict:
    """
    Enrich a single lead using LinkedIn data from Apify.

    Input:  lead dict (must have 'linkedin' and optionally 'company_linkedin')
    Output: lead dict with extra 'enrichment' key containing all scraped data

    Gracefully returns the original lead if Apify is not configured
    or if scraping fails.
    """
    api_token = os.environ.get("APIFY_API_TOKEN", "")
    if not api_token:
        logger.warning("APIFY_API_TOKEN not set — enrichment skipped")
        return {**lead, "enrichment": None, "enrichment_status": "skipped_no_token"}

    profile_data: dict = {}
    company_data: dict = {}

    # Scrape person profile
    person_linkedin = lead.get("linkedin", "")
    if person_linkedin:
        profile_data = scrape_linkedin_profile(person_linkedin, api_token)
        time.sleep(1)   # brief pause between actor runs

    # Scrape company page (if provided separately; else skip)
    company_linkedin = lead.get("company_linkedin", "")
    if company_linkedin:
        company_data = scrape_linkedin_company(company_linkedin, api_token)

    enrichment = {
        **profile_data,
        **company_data,
        "enriched_at": datetime.now(timezone.utc).isoformat(),
    }

    enrichment_status = "success" if (profile_data or company_data) else "no_data"

    return {
        **lead,
        "enrichment": enrichment,
        "enrichment_status": enrichment_status,
    }


def enrich_leads_batch(leads: list[dict], max_enrichments: int = 10) -> list[dict]:
    """
    Enrich up to max_enrichments leads with LinkedIn data.

    Prioritizes leads with a LinkedIn URL. Leads without LinkedIn
    are returned unchanged.

    max_enrichments: cap to protect Apify quota (free tier: 5 runs/month).
    """
    api_token = os.environ.get("APIFY_API_TOKEN", "")
    if not api_token:
        logger.warning("APIFY_API_TOKEN not set — batch enrichment skipped")
        return leads

    enriched_count = 0
    results = []

    for lead in leads:
        if enriched_count >= max_enrichments:
            results.append(lead)
            continue

        if lead.get("linkedin"):
            enriched = enrich_lead(lead)
            results.append(enriched)
            enriched_count += 1
        else:
            results.append(lead)

    logger.info(f"Enriched {enriched_count}/{len(leads)} leads via Apify")
    return results
