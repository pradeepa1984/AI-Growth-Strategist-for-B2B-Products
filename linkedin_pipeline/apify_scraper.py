"""
apify_scraper.py -- Batch LinkedIn profile enrichment via Apify.

Actor used
----------
  harvestapi/linkedin-profile-scraper  (ID: LpVuK3Zozwuipa5bp)
  Input: { "profileUrls": [...], "cookie": "li_at=AQEDATxxx..." }

Environment variables (both already in backend/.env)
-----------------------------------------------------
  APIFY_API_TOKEN   -- Apify API token
  LINKEDIN_COOKIE   -- your LinkedIn li_at session cookie value

How to get your li_at cookie
-----------------------------
  1. Log in to LinkedIn in Chrome / Firefox
  2. Open DevTools (F12) -> Application -> Cookies -> www.linkedin.com
  3. Find "li_at" and copy its Value
  4. Add to backend/.env:   LINKEDIN_COOKIE=AQEDATxxxxxxx...

Batching strategy
-----------------
  URLS_PER_RUN profiles per actor run (default 50).
  Runs are started sequentially; each polled until done.
  Results collected into a URL -> enrichment dict.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests

from config import MAX_POLL_SECS, POLL_INTERVAL, URLS_PER_RUN

logger = logging.getLogger(__name__)

APIFY_BASE    = "https://api.apify.com/v2"
ACTOR_PROFILE = "LpVuK3Zozwuipa5bp"   # harvestapi/linkedin-profile-scraper

REQUEST_TIMEOUT = 30     # seconds for individual HTTP calls


# -- Internal helpers ----------------------------------------------------------

def _token() -> str:
    tok = os.environ.get("APIFY_API_TOKEN", "").strip()
    if not tok:
        raise EnvironmentError(
            "APIFY_API_TOKEN is not set.\n"
            "  Add to backend/.env:  APIFY_API_TOKEN=apify_api_xxxx\n"
            "  Get your token at: https://console.apify.com/account/integrations"
        )
    return tok


def _cookie() -> str | None:
    """
    Return the LinkedIn li_at cookie string, or None if not configured.

    The cookie can be stored in backend/.env as either:
      LINKEDIN_COOKIE=AQEDATxxxxxx           (value only)
      LINKEDIN_COOKIE=li_at=AQEDATxxxxxx     (full cookie string)
    """
    raw = os.environ.get("LINKEDIN_COOKIE", "").strip()
    if not raw:
        return None
    # Normalise to "li_at=VALUE" format expected by the actor
    if not raw.startswith("li_at="):
        raw = f"li_at={raw}"
    return raw


def _start_run(urls: list[str], api_token: str) -> str:
    """Start an async actor run and return the run ID."""
    cookie = _cookie()

    payload: dict[str, Any] = {"profileUrls": urls}
    if cookie:
        payload["cookie"] = cookie
    else:
        logger.warning(
            "LINKEDIN_COOKIE is not set. The actor may return empty results.\n"
            "  Add to backend/.env:  LINKEDIN_COOKIE=AQEDATxxxxxxx\n"
            "  (copy the li_at cookie from your browser DevTools)"
        )

    endpoint = f"{APIFY_BASE}/acts/{ACTOR_PROFILE}/runs"
    resp = requests.post(
        endpoint,
        params={"token": api_token},
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to start Apify run: {resp.status_code} {resp.text[:300]}"
        )
    run_id = resp.json()["data"]["id"]
    logger.info("Started Apify run %s for %d URLs", run_id, len(urls))
    return run_id


def _poll_run(run_id: str, api_token: str) -> str:
    """Poll until run status is terminal. Returns the status string."""
    endpoint = f"{APIFY_BASE}/actor-runs/{run_id}"
    elapsed  = 0

    while elapsed < MAX_POLL_SECS:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

        try:
            resp = requests.get(endpoint, params={"token": api_token}, timeout=REQUEST_TIMEOUT)
            if resp.status_code != 200:
                logger.warning("Poll returned %d -- retrying", resp.status_code)
                continue

            status = resp.json()["data"]["status"]
            logger.info("  Run %s: %s (%ds elapsed)", run_id, status, elapsed)

            if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                return status

        except requests.RequestException as exc:
            logger.warning("Poll request failed: %s -- retrying", exc)

    logger.error("Run %s did not finish within %ds", run_id, MAX_POLL_SECS)
    return "TIMED-OUT"


def _fetch_results(run_id: str, api_token: str) -> list[dict]:
    """Fetch all dataset items for a completed run."""
    run_resp = requests.get(
        f"{APIFY_BASE}/actor-runs/{run_id}",
        params={"token": api_token},
        timeout=REQUEST_TIMEOUT,
    )
    dataset_id = run_resp.json()["data"]["defaultDatasetId"]

    items_resp = requests.get(
        f"{APIFY_BASE}/datasets/{dataset_id}/items",
        params={"token": api_token, "format": "json", "clean": "true"},
        timeout=REQUEST_TIMEOUT,
    )
    if items_resp.status_code != 200:
        logger.error("Failed to fetch dataset %s: %d", dataset_id, items_resp.status_code)
        return []

    items = items_resp.json()
    logger.info("  Fetched %d results from dataset %s", len(items), dataset_id)
    return items if isinstance(items, list) else []


# -- Public API ----------------------------------------------------------------

def normalise_profile(raw: dict) -> dict:
    """
    Convert a raw Apify actor result into the standard enrichment dict.

    Handles field name variations across actor versions.
    Returns dict with keys: url, title, company, location, skills_scraped.
    """
    # URL -- join key
    url = (
        raw.get("url")
        or raw.get("profileUrl")
        or raw.get("linkedinUrl")
        or raw.get("linkedin_url")
        or ""
    ).rstrip("/")

    # Title / headline
    title = (
        raw.get("headline")
        or raw.get("title")
        or raw.get("jobTitle")
        or raw.get("occupation")
        or None
    )

    # Company -- from experience list or dedicated field
    company = None
    for exp_key in ("experience", "positions", "experiences"):
        experience = raw.get(exp_key) or []
        if experience and isinstance(experience, list):
            first = experience[0]
            company = (
                first.get("company")
                or first.get("companyName")
                or first.get("organizationName")
                or None
            )
            if company:
                break
    if not company:
        company = (
            raw.get("currentCompany")
            or raw.get("company")
            or raw.get("company_name")
            or None
        )

    # Location -- build from city + country if separate fields
    location = raw.get("location") or raw.get("addressWithCountry") or raw.get("geo")
    if not location:
        city    = raw.get("city") or raw.get("geoCity") or ""
        country = raw.get("country") or raw.get("geoCountry") or ""
        parts   = [p.strip() for p in [city, country] if p.strip()]
        location = ", ".join(parts) or None

    # Skills
    skills_raw = raw.get("skills") or []
    skills: list[str] = []
    if isinstance(skills_raw, list):
        for s in skills_raw:
            if isinstance(s, str) and s.strip():
                skills.append(s.strip())
            elif isinstance(s, dict):
                name = s.get("name") or s.get("skill") or ""
                if name.strip():
                    skills.append(name.strip())

    return {
        "url":            url,
        "title":          title,
        "company":        company,
        "location":       location,
        "skills_scraped": skills,
    }


def scrape_profiles_batch(urls: list[str]) -> dict[str, dict]:
    """
    Scrape LinkedIn profiles via Apify.

    Parameters
    ----------
    urls : list of LinkedIn profile URLs

    Returns
    -------
    dict mapping normalised URL -> enrichment dict.
    Profiles with no data are absent from the dict.
    """
    api_token = _token()
    result_map: dict[str, dict] = {}

    clean_urls = list({u.rstrip("/") for u in urls if u and "linkedin.com" in u})
    total = len(clean_urls)
    logger.info("Submitting %d URLs to Apify in batches of %d", total, URLS_PER_RUN)

    batches = [clean_urls[i : i + URLS_PER_RUN] for i in range(0, total, URLS_PER_RUN)]

    for batch_num, batch in enumerate(batches, start=1):
        logger.info("=== Apify batch %d/%d (%d URLs) ===", batch_num, len(batches), len(batch))

        try:
            run_id = _start_run(batch, api_token)
            status = _poll_run(run_id, api_token)

            if status != "SUCCEEDED":
                logger.error("Batch %d run %s ended with status %s -- skipping", batch_num, run_id, status)
                continue

            items = _fetch_results(run_id, api_token)

            for raw in items:
                normed  = normalise_profile(raw)
                url_key = normed["url"]
                if url_key:
                    result_map[url_key] = normed

        except Exception as exc:
            logger.error("Batch %d failed: %s", batch_num, exc)

    logger.info("Apify done: %d/%d profiles returned data", len(result_map), total)
    return result_map


def enrich_lead_from_apify(lead: dict, apify_results: dict[str, dict]) -> dict:
    """
    Merge Apify data into a lead dict (fill blanks only, never overwrite).
    """
    url_key = (lead.get("linkedin_url") or "").rstrip("/")
    scraped = apify_results.get(url_key) or {}

    if not scraped:
        return lead

    lead = dict(lead)

    if not lead.get("title")    and scraped.get("title"):
        lead["title"]    = scraped["title"]
    if not lead.get("company")  and scraped.get("company"):
        lead["company"]  = scraped["company"]
    if not lead.get("location") and scraped.get("location"):
        lead["location"] = scraped["location"]

    lead["skills_scraped"] = scraped.get("skills_scraped") or []
    return lead
