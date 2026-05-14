"""
news_fetcher.py — Google News RSS integration for market intelligence context.

fetch_industry_news() returns a (context_str, headlines_list) tuple.
Falls back to ("", []) on any failure so the MI pipeline is never blocked.
"""

import re
import logging
import xml.etree.ElementTree as ET

import requests

logger = logging.getLogger(__name__)

_TIMEOUT  = 5   # seconds — fast enough for ECS, doesn't block the MI pipeline
_BASE_URL = "https://news.google.com/rss/search"


def fetch_industry_news(
    industry: str,
    geography: str = "global",
    max_items: int = 7,
) -> tuple[str, list[str]]:
    """
    Fetch recent headlines from Google News RSS for an industry + geography.

    Returns:
        (news_context_str, headlines_list)
        news_context_str — formatted block ready for LLM prompt injection
        headlines_list   — raw headline strings for the frontend PDF report
    Both values are empty on failure (graceful degradation).
    """
    try:
        query   = f"{industry} {geography} B2B technology market"
        encoded = "+".join(query.split())
        url     = f"{_BASE_URL}?q={encoded}&hl=en-US&gl=US&ceid=US:en"

        resp = requests.get(
            url,
            timeout=_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AIGrowthStrategist/1.0)"},
        )
        resp.raise_for_status()

        root  = ET.fromstring(resp.content)
        items = root.findall(".//item")

        headlines: list[str] = []
        for item in items[:max_items]:
            title_el = item.find("title")
            if title_el is not None and title_el.text:
                # Strip trailing " - Source Name" suffix added by Google News
                title = re.sub(r"\s+[-–]\s+[^-–]+$", "", title_el.text.strip())
                if title:
                    headlines.append(title)

        if not headlines:
            return "", []

        context = "Recent Industry News:\n" + "\n".join(f"- {h}" for h in headlines)
        logger.info("[news_fetcher] Fetched %d headlines for industry=%r geography=%r", len(headlines), industry, geography)
        return context, headlines

    except Exception as exc:
        logger.warning("[news_fetcher] News fetch failed (non-fatal): %s", exc)
        return "", []
