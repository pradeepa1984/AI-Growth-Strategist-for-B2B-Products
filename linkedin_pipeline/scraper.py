"""
scraper.py — Playwright-based LinkedIn profile scraper.

Strategy
--------
* First run:  browser opens visibly so you can log in manually.
              After login, cookies are saved to COOKIES_FILE.
* Later runs: cookies are loaded; browser can run headless.

LinkedIn selectors change frequently — the ones below target the
stable `data-*` attributes and aria roles that have been consistent
since 2023.  If a selector breaks, update the constant at the top.

Install:
    pip install playwright
    playwright install chromium
"""

from __future__ import annotations

import json
import logging
import random
import time
from pathlib import Path
from typing import Any

from config import COOKIES_FILE, DELAY_MAX, DELAY_MIN, HEADLESS, MAX_RETRIES

logger = logging.getLogger(__name__)

# ── CSS selectors (update here if LinkedIn changes its markup) ─────────────────
SEL_HEADLINE   = "div.text-body-medium.break-words"          # title / headline
SEL_LOCATION   = "span.text-body-small.inline.t-black--light.break-words"
SEL_TOP_CARD   = "div.ph5.pb5"
SEL_COMPANY    = "span.t-14.t-normal"                        # in top card
SEL_SKILLS_BTN = "a[href*='skills']"                        # "Show all X skills"
SEL_SKILL_ITEM = "span.mr1.t-bold"                          # inside skills modal

LINKEDIN_LOGIN = "https://www.linkedin.com/login"
LINKEDIN_FEED  = "https://www.linkedin.com/feed/"


class LinkedInScraper:
    """Context-manager wrapper around a Playwright browser session."""

    def __init__(self) -> None:
        self._playwright = None
        self._browser    = None
        self._context    = None
        self._page       = None
        self._cookies_path = Path(COOKIES_FILE)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def __enter__(self) -> "LinkedInScraper":
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise ImportError(
                "Playwright is not installed.\n"
                "Run:  pip install playwright && playwright install chromium"
            )

        self._playwright = sync_playwright().start()
        self._browser    = self._playwright.chromium.launch(headless=HEADLESS)
        self._context    = self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )

        if self._cookies_path.exists():
            cookies = json.loads(self._cookies_path.read_text(encoding="utf-8"))
            self._context.add_cookies(cookies)
            logger.info("Loaded %d cookies from %s", len(cookies), self._cookies_path)
        else:
            logger.info("No cookie file found — manual login required.")

        self._page = self._context.new_page()
        self._ensure_logged_in()
        return self

    def __exit__(self, *_: Any) -> None:
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    # ── Login ──────────────────────────────────────────────────────────────────

    def _ensure_logged_in(self) -> None:
        """Navigate to the feed; if redirected to login, wait for manual login."""
        page = self._page
        page.goto(LINKEDIN_FEED, wait_until="domcontentloaded", timeout=30_000)

        if "login" in page.url or "authwall" in page.url:
            logger.warning(
                "\n\n>>> LinkedIn login required.\n"
                ">>> Please log in manually in the browser window.\n"
                ">>> The script will continue automatically once you reach the feed.\n"
            )
            # Wait up to 3 minutes for the user to log in
            page.wait_for_url("**/feed/**", timeout=180_000)
            self._save_cookies()
            logger.info("Login successful — cookies saved.")
        else:
            logger.info("Already logged in (cookies valid).")

    def _save_cookies(self) -> None:
        cookies = self._context.cookies()
        self._cookies_path.write_text(
            json.dumps(cookies, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info("Saved %d cookies to %s", len(cookies), self._cookies_path)

    # ── Profile scraping ───────────────────────────────────────────────────────

    def scrape_profile(self, url: str) -> dict:
        """
        Visit one LinkedIn profile URL and extract available fields.

        Returns a dict with keys: title, company, location, skills_scraped.
        Any unavailable field is None / [].
        """
        page = self._page
        result: dict = {
            "title":          None,
            "company":        None,
            "location":       None,
            "skills_scraped": [],
        }

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            _random_delay(0.5, 1.5)   # short wait for JS rendering

            # Check for private / unavailable profile
            if self._is_unavailable(page):
                logger.warning("Private or inaccessible: %s", url)
                return result

            result["title"]    = self._extract_text(page, SEL_HEADLINE)
            result["location"] = self._extract_text(page, SEL_LOCATION)
            result["company"]  = self._extract_company(page)
            result["skills_scraped"] = self._extract_skills(page)

        except Exception as exc:
            logger.error("Error scraping %s: %s", url, exc)

        return result

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _is_unavailable(page: Any) -> bool:
        text = page.content().lower()
        signals = [
            "page not found",
            "this account has been restricted",
            "profile not available",
            "join linkedin",
        ]
        return any(s in text for s in signals)

    @staticmethod
    def _extract_text(page: Any, selector: str) -> str | None:
        try:
            el = page.query_selector(selector)
            if el:
                text = el.inner_text().strip()
                return text if text else None
        except Exception:
            pass
        return None

    @staticmethod
    def _extract_company(page: Any) -> str | None:
        """Extract current company from the experience section top card."""
        try:
            # Try the experience section first (most reliable)
            exp = page.query_selector("section#experience-section li:first-child span.t-14.t-normal")
            if exp:
                text = exp.inner_text().strip()
                if text:
                    return text.split("\n")[0].strip()

            # Fallback: subtitle in top card
            subtitle = page.query_selector(SEL_COMPANY)
            if subtitle:
                text = subtitle.inner_text().strip()
                return text.split("\n")[0].strip() or None
        except Exception:
            pass
        return None

    @staticmethod
    def _extract_skills(page: Any) -> list[str]:
        """Click 'Show all skills' and scrape the skill list (if accessible)."""
        skills: list[str] = []
        try:
            btn = page.query_selector(SEL_SKILLS_BTN)
            if btn:
                btn.click()
                page.wait_for_selector(SEL_SKILL_ITEM, timeout=5_000)
                elements = page.query_selector_all(SEL_SKILL_ITEM)
                skills = [el.inner_text().strip() for el in elements if el.inner_text().strip()]
                # Close the modal
                page.keyboard.press("Escape")
        except Exception:
            pass
        return skills


# ── Utility ────────────────────────────────────────────────────────────────────

def _random_delay(lo: float = DELAY_MIN, hi: float = DELAY_MAX) -> None:
    time.sleep(random.uniform(lo, hi))


def scrape_with_retry(
    scraper: LinkedInScraper,
    url: str,
    retries: int = MAX_RETRIES,
) -> dict | None:
    """
    Attempt to scrape `url` up to `retries` times.

    Returns the result dict on success, None on permanent failure.
    """
    for attempt in range(1, retries + 1):
        try:
            result = scraper.scrape_profile(url)
            return result
        except Exception as exc:
            logger.warning("Attempt %d/%d failed for %s: %s", attempt, retries, url, exc)
            if attempt < retries:
                _random_delay(DELAY_MIN * attempt, DELAY_MAX * attempt)

    logger.error("All %d attempts failed for %s", retries, url)
    return None
