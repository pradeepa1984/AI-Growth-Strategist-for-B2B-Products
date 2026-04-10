"""
Apify Scraper Verification Script
===================================
Standalone test — does NOT start FastAPI, does NOT touch any DB.

Run from the backend directory (with venv active):
    python tests/test_apify_scrapers.py

What this tests:
  1. LinkedIn Profile Scraper  (actor: 2eMkcp2xjVQqT4ByX)
  2. LinkedIn Company Scraper  (actor: 9VsBB5ojfVzKnmBVe)

For each scraper it verifies:
  - Actor call succeeds (HTTP 200)
  - Dataset is non-empty
  - Key fields are present in the response
  - First 2 results are printed in readable JSON
"""

import json
import logging
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Load .env from backend/ ───────────────────────────────────────────────────
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("apify_test")

# ── Constants ─────────────────────────────────────────────────────────────────
APIFY_BASE_URL = "https://api.apify.com/v2"
ACTOR_PROFILE  = "2eMkcp2xjVQqT4ByX"   # LinkedIn Profile Scraper
ACTOR_COMPANY  = "9VsBB5ojfVzKnmBVe"   # LinkedIn Company Scraper
MAX_WAIT_SEC   = 120

# ── Hardcoded test URLs (change these to any public LinkedIn page) ─────────────
TEST_PROFILE_URL = "https://www.linkedin.com/in/satyanadella/"
TEST_COMPANY_URL = "https://www.linkedin.com/company/microsoft/"

# ── Key fields we expect in a healthy response ────────────────────────────────
PROFILE_REQUIRED_FIELDS = ["fullName", "headline"]
PROFILE_OPTIONAL_FIELDS = ["about", "experience", "skills", "companyName"]

COMPANY_REQUIRED_FIELDS = ["name"]
COMPANY_OPTIONAL_FIELDS = ["industry", "staffCount", "employeeCountRange", "description", "specialities"]


# ── Core runner (mirrors _run_actor in apify_enrichment.py) ───────────────────

def run_actor_debug(actor_id: str, actor_label: str, input_data: dict, api_token: str) -> list:
    """
    Call Apify synchronous endpoint, return ALL items (not just first).
    Logs actor name, input, HTTP status, and item count.
    """
    sep = "─" * 60
    log.info(sep)
    log.info(f"ACTOR      : {actor_label}  ({actor_id})")
    log.info(f"INPUT      : {json.dumps(input_data, indent=2)}")

    url = f"{APIFY_BASE_URL}/acts/{actor_id}/run-sync-get-dataset-items"
    params = {"token": api_token, "timeout": MAX_WAIT_SEC}

    try:
        log.info("Calling Apify... (this may take 20-60s)")
        resp = requests.post(url, json=input_data, params=params, timeout=MAX_WAIT_SEC + 15)
    except requests.Timeout:
        log.error(f"TIMEOUT: actor did not finish within {MAX_WAIT_SEC}s")
        return []
    except requests.RequestException as exc:
        log.error(f"NETWORK ERROR: {exc}")
        return []

    log.info(f"HTTP STATUS: {resp.status_code}")

    if resp.status_code == 402:
        log.error("QUOTA EXCEEDED: Apify free-tier limit reached. Upgrade or wait for reset.")
        return []

    if resp.status_code == 401:
        log.error("AUTH ERROR: APIFY_API_TOKEN is invalid or missing.")
        return []

    if resp.status_code != 200:
        log.error(f"UNEXPECTED STATUS {resp.status_code}: {resp.text[:400]}")
        return []

    try:
        items = resp.json()
    except Exception:
        log.error(f"RESPONSE NOT JSON: {resp.text[:400]}")
        return []

    if not isinstance(items, list):
        log.error(f"UNEXPECTED SHAPE: expected list, got {type(items).__name__}: {str(items)[:300]}")
        return []

    log.info(f"ITEMS RETURNED: {len(items)}")
    return items


# ── Field validator ────────────────────────────────────────────────────────────

def validate_fields(item: dict, required: list, optional: list, label: str):
    """Check required and optional fields; log warnings for anything missing."""
    missing_required = [f for f in required if not item.get(f)]
    missing_optional = [f for f in optional if not item.get(f)]

    if missing_required:
        log.warning(f"[{label}] MISSING REQUIRED FIELDS: {missing_required}")
    else:
        log.info(f"[{label}] All required fields present: {required}")

    if missing_optional:
        log.info(f"[{label}] Optional fields absent (may be normal): {missing_optional}")


# ── Pretty-print helper ───────────────────────────────────────────────────────

def print_item(item: dict, index: int, label: str):
    """Print a result item in readable JSON, truncating long strings."""
    truncated = {}
    for k, v in item.items():
        if isinstance(v, str) and len(v) > 300:
            truncated[k] = v[:300] + "…"
        elif isinstance(v, list) and len(v) > 5:
            truncated[k] = v[:5] + [f"… (+{len(v)-5} more)"]
        else:
            truncated[k] = v
    log.info(f"\n{'═'*60}\n  {label} — RESULT #{index+1}\n{'═'*60}\n"
             + json.dumps(truncated, indent=2, default=str))


# ── Profile scraper test ───────────────────────────────────────────────────────

def test_profile_scraper(api_token: str):
    log.info("\n" + "█"*60)
    log.info("  TEST 1: LinkedIn PROFILE Scraper")
    log.info("█"*60)

    input_data = {"profileUrls": [TEST_PROFILE_URL]}
    items = run_actor_debug(ACTOR_PROFILE, "LinkedIn Profile Scraper", input_data, api_token)

    if not items:
        log.error("RESULT: No data returned from profile scraper.")
        log.error("  → Check: is the LinkedIn URL public and correct?")
        log.error("  → Check: has your Apify quota been exceeded?")
        return False

    log.info(f"RESULT: {len(items)} profile(s) returned.")

    # Print first 2 results
    for i, item in enumerate(items[:2]):
        print_item(item, i, "PROFILE")

        # Highlight key fields specifically
        log.info(f"  KEY FIELDS for result #{i+1}:")
        log.info(f"    fullName    : {item.get('fullName', '⚠ MISSING')}")
        log.info(f"    headline    : {item.get('headline', '⚠ MISSING')}")
        log.info(f"    companyName : {item.get('companyName', '⚠ MISSING')}")

        experience = item.get("experience") or []
        if experience:
            log.info(f"    experience  : {len(experience)} role(s)")
            for exp in experience[:2]:
                log.info(f"      - {exp.get('title','')} @ {exp.get('company','')} ({exp.get('duration','')})")
        else:
            log.warning("    experience  : ⚠ MISSING or empty")

        validate_fields(item, PROFILE_REQUIRED_FIELDS, PROFILE_OPTIONAL_FIELDS, "Profile")

    return True


# ── Company scraper test ───────────────────────────────────────────────────────

def test_company_scraper(api_token: str):
    log.info("\n" + "█"*60)
    log.info("  TEST 2: LinkedIn COMPANY Scraper")
    log.info("█"*60)

    input_data = {"startUrls": [{"url": TEST_COMPANY_URL}]}
    items = run_actor_debug(ACTOR_COMPANY, "LinkedIn Company Scraper", input_data, api_token)

    if not items:
        log.error("RESULT: No data returned from company scraper.")
        log.error("  → Check: is the LinkedIn company URL public and correct?")
        log.error("  → Check: has your Apify quota been exceeded?")
        return False

    log.info(f"RESULT: {len(items)} company record(s) returned.")

    for i, item in enumerate(items[:2]):
        print_item(item, i, "COMPANY")

        log.info(f"  KEY FIELDS for result #{i+1}:")
        log.info(f"    companyName   : {item.get('name', item.get('companyName', '⚠ MISSING'))}")
        log.info(f"    industry      : {item.get('industries', item.get('industry', '⚠ MISSING'))}")
        log.info(f"    employeeCount : {item.get('staffCount', item.get('employeeCount', '⚠ MISSING'))}")
        log.info(f"    size range    : {item.get('employeeCountRange', '⚠ MISSING')}")

        validate_fields(item, COMPANY_REQUIRED_FIELDS, COMPANY_OPTIONAL_FIELDS, "Company")

    return True


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info("  Apify Scraper Verification — AI Growth Strategist")
    log.info("=" * 60)

    api_token = os.environ.get("APIFY_API_TOKEN", "").strip()
    if not api_token:
        log.error("APIFY_API_TOKEN is not set in backend/.env — aborting.")
        sys.exit(1)

    log.info(f"Token loaded: {api_token[:8]}{'*' * (len(api_token) - 8)}")
    log.info(f"Profile URL : {TEST_PROFILE_URL}")
    log.info(f"Company URL : {TEST_COMPANY_URL}")

    profile_ok = test_profile_scraper(api_token)
    company_ok = test_company_scraper(api_token)

    log.info("\n" + "=" * 60)
    log.info("  SUMMARY")
    log.info("=" * 60)
    log.info(f"  Profile scraper : {'PASS' if profile_ok else 'FAIL'}")
    log.info(f"  Company scraper : {'PASS' if company_ok else 'FAIL'}")
    log.info("=" * 60)

    if not profile_ok or not company_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
