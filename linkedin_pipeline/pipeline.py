"""
pipeline.py — Orchestrates the full enrichment pipeline.

Flow
----
1.  Load leads from Excel (reader.py)
2.  Submit all LinkedIn URLs to Apify in batches (apify_scraper.py)
3.  Merge Apify results into each lead (fill blanks only)
4.  Merge sheet skills + scraped skills
5.  Run infer_industry() and infer_experience()
6.  Write enriched_leads.csv
7.  Log failed URLs to failed_profiles.log
8.  Print dashboard summary
"""

from __future__ import annotations

import csv
import json
import logging
import os
import sys
from pathlib import Path

from classifiers import infer_experience, infer_industry
from config import (
    FAILED_LOG, OUTPUT_FILE, SCRAPE_ENABLED, SCRAPE_MISSING_ONLY,
)
from dashboard import generate_dashboard_data, print_dashboard
from reader import load_leads

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("pipeline.log", encoding="utf-8", errors="replace"),
    ],
)
logger = logging.getLogger(__name__)


# ── Output field order ─────────────────────────────────────────────────────────
OUTPUT_FIELDS = [
    "name", "linkedin_url", "email",
    "title", "company", "location",
    "skills",
    "industry", "experience_level",
    "about", "geo_exposure", "status", "followers",
]


def _load_env(env_path: str = ".env") -> None:
    """
    Minimal .env loader — reads KEY=VALUE lines and sets os.environ.
    No external dependency (no python-dotenv required).

    Search order:
      1. Explicit env_path argument
      2. linkedin_pipeline/.env
      3. project root .env
      4. backend/.env   ← where APIFY_API_TOKEN already lives
    """
    candidates = [
        Path(env_path),
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
        Path(__file__).parent.parent / "backend" / ".env",
    ]
    p = next((c for c in candidates if c.exists()), None)
    if p is None:
        return

    with p.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val

    logger.info("Loaded environment from %s", p.resolve())


def _needs_scraping(lead: dict) -> bool:
    """Return True if any priority field is blank."""
    return not all([lead.get("title"), lead.get("company"), lead.get("location")])


def _merge_skills(from_sheet: list[str], from_scraper: list[str]) -> list[str]:
    """Combine and deduplicate skills from both sources (sheet tags first)."""
    seen: set[str] = set()
    merged: list[str] = []
    for skill in (from_sheet or []) + (from_scraper or []):
        key = skill.lower().strip()
        if key and key not in seen:
            seen.add(key)
            merged.append(skill.strip())
    return merged


def _write_csv(leads: list[dict], path: str) -> None:
    out = Path(path)

    def _do_write(target: Path) -> None:
        with target.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
            writer.writeheader()
            for lead in leads:
                row = dict(lead)
                row["skills"] = json.dumps(row.get("skills") or [], ensure_ascii=False)
                writer.writerow(row)

    try:
        _do_write(out)
        logger.info("Wrote %d rows -> %s", len(leads), out.resolve())
    except PermissionError:
        # File is open in Excel or another program -- write to a timestamped copy
        from datetime import datetime
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        fallback = out.with_stem(f"{out.stem}_{stamp}")
        _do_write(fallback)
        logger.warning(
            "Could not write to %s (file open in another program).\n"
            "  Saved to: %s\n"
            "  Close the file in Excel and rename if needed.",
            out.name, fallback.resolve(),
        )


def _log_failed(failed: list[dict], path: str) -> None:
    if not failed:
        return
    out = Path(path)
    with out.open("w", encoding="utf-8") as f:
        for entry in failed:
            f.write(f"{entry['url']}\t{entry.get('reason', '')}\n")
    logger.warning("Logged %d failed URLs -> %s", len(failed), out.resolve())


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run(input_file: str | None = None) -> list[dict]:
    """
    Execute the full enrichment pipeline.

    Parameters
    ----------
    input_file : override path for the Excel file

    Returns
    -------
    List of enriched lead dicts
    """
    _load_env()

    leads = load_leads(input_file)
    total = len(leads)
    logger.info("Starting enrichment for %d leads", total)

    # ── Apify scraping phase ───────────────────────────────────────────────────
    if SCRAPE_ENABLED:
        if not os.environ.get("APIFY_API_TOKEN"):
            logger.error(
                "APIFY_API_TOKEN is not set.\n"
                "  Create a .env file in the project root with:\n"
                "    APIFY_API_TOKEN=apify_api_xxxx\n"
                "  Or run:  set APIFY_API_TOKEN=apify_api_xxxx  (Windows)\n"
                "  Skipping scrape phase."
            )
        else:
            # Select which leads to scrape
            if SCRAPE_MISSING_ONLY:
                to_scrape = [l for l in leads if _needs_scraping(l)]
                logger.info(
                    "SCRAPE_MISSING_ONLY=True: %d/%d leads have missing fields",
                    len(to_scrape), total,
                )
            else:
                to_scrape = leads

            if to_scrape:
                try:
                    from apify_scraper import scrape_profiles_batch, enrich_lead_from_apify

                    urls = [l["linkedin_url"] for l in to_scrape if l.get("linkedin_url")]
                    logger.info("Submitting %d URLs to Apify ...", len(urls))

                    apify_results = scrape_profiles_batch(urls)

                    # Merge results back into all leads by URL
                    url_to_idx = {
                        (l.get("linkedin_url") or "").rstrip("/"): i
                        for i, l in enumerate(leads)
                    }
                    for url_key, scraped in apify_results.items():
                        idx = url_to_idx.get(url_key)
                        if idx is not None:
                            from apify_scraper import enrich_lead_from_apify
                            leads[idx] = enrich_lead_from_apify(leads[idx], apify_results)

                    # Log URLs that got no data back
                    returned_urls = set(apify_results.keys())
                    failed = [
                        {"url": l["linkedin_url"], "reason": "no data from Apify"}
                        for l in to_scrape
                        if (l.get("linkedin_url") or "").rstrip("/") not in returned_urls
                    ]
                    _log_failed(failed, FAILED_LOG)

                except Exception as exc:
                    logger.error("Apify scraping failed: %s", exc, exc_info=True)
    else:
        logger.info("SCRAPE_ENABLED=False — using existing Excel data only")

    # ── Classification phase ───────────────────────────────────────────────────
    logger.info("Running classifiers ...")
    enriched: list[dict] = []
    for lead in leads:
        lead["skills"] = _merge_skills(
            lead.get("skills_from_sheet") or [],
            lead.get("skills_scraped")    or [],
        )
        lead["industry"] = infer_industry(
            lead.get("title"),
            lead.get("company"),
            lead.get("skills_from_sheet"),
        )
        lead["experience_level"] = infer_experience(lead.get("title"))
        enriched.append(lead)

    # ── Output ─────────────────────────────────────────────────────────────────
    _write_csv(enriched, OUTPUT_FILE)

    # ── Dashboard ──────────────────────────────────────────────────────────────
    dashboard = generate_dashboard_data(enriched)
    print_dashboard(dashboard)

    logger.info(
        "Done. %d leads enriched -> %s", len(enriched), OUTPUT_FILE
    )
    return enriched


if __name__ == "__main__":
    run()
