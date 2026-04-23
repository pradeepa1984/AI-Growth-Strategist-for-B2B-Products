import os
import json
import logging
import re
from urllib.parse import urljoin, urlparse

import boto3
from firecrawl import V1FirecrawlApp
from utils.firecrawl_client import get_firecrawl_app
from utils.aws_storage import save_markdown_to_s3, save_intelligence_to_dynamodb, get_cached_intelligence
from utils.normalize_url import normalize_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
MAX_PAGES = 7
MAX_ITERATIONS = 3
DEFAULT_THRESHOLD = 0.78

INITIAL_PATHS = ["/", "/about", "/services", "/products"]

ADDITIONAL_PATHS = [
    "/solutions",
    "/use-cases",
    "/industries",
    "/platform",
    "/features",
    "/case-studies",
    "/about-us",
    "/what-we-do",
    "/offerings",
]

# Crawled separately (dedicated location pass) — not counted against MAX_PAGES
LOCATION_PATHS = [
    "/contact",
    "/contact-us",
    "/locations",
    "/offices",
    "/global-offices",
    "/where-we-are",
]

# Pages to deprioritize (blog/news/generic)
SKIP_PATTERNS = ["/blog", "/news", "/press", "/careers", "/jobs", "/legal", "/privacy", "/terms"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _base_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _is_business_relevant(path: str) -> bool:
    return not any(skip in path.lower() for skip in SKIP_PATTERNS)


def _parse_llm_json(text: str) -> dict:
    """Robustly extract JSON from LLM response."""
    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    return json.loads(text.strip())


# ── Core functions ────────────────────────────────────────────────────────────

def crawl_page(app: V1FirecrawlApp, url: str) -> str | None:
    """Crawl a single URL and return markdown content, or None on failure."""
    try:
        result = app.scrape_url(url, formats=["markdown"])
        content = result.markdown or ""
        return content if len(content) > 100 else None
    except Exception as e:
        logger.warning(f"Failed to crawl {url}: {e}")
        return None


def crawl_initial_pages(base_url: str) -> tuple[dict, object, str]:
    """
    Crawl the homepage, /about, /services, /products.
    Returns (crawled_content_dict, app_instance, base_url).
    """
    app = get_firecrawl_app()
    base = _base_url(base_url)
    crawled = {}

    for path in INITIAL_PATHS:
        url = urljoin(base, path)
        logger.info(f"[Initial] Crawling: {url}")
        content = crawl_page(app, url)
        if content:
            crawled[url] = content
            logger.info(f"[Initial] Got {len(content)} chars from {url}")
        else:
            logger.info(f"[Initial] No usable content from {url}")

    return crawled, app, base


def select_additional_pages(base: str, already_crawled: set) -> list[str]:
    """
    Pick up to 2 candidate pages not yet crawled, business-relevant only.
    """
    candidates = []
    for path in ADDITIONAL_PATHS:
        url = urljoin(base, path)
        if url not in already_crawled and _is_business_relevant(path):
            candidates.append(url)
        if len(candidates) == 2:
            break
    return candidates


def crawl_location_pages(base: str, app: V1FirecrawlApp) -> dict:
    """
    Crawl location/contact pages specifically for office extraction.
    Runs independently of the main page budget — stops after first 3 successful pages.
    """
    extra = {}
    hits = 0
    for path in LOCATION_PATHS:
        if hits >= 3:
            break
        url = urljoin(base, path)
        logger.info(f"[Location] Crawling: {url}")
        content = crawl_page(app, url)
        if content:
            extra[url] = content
            hits += 1
            logger.info(f"[Location] Got {len(content)} chars from {url}")
    return extra


# ── Bedrock client (shared, created once) ─────────────────────────────────────

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")

def _get_bedrock_client():
    return boto3.client("bedrock-runtime", region_name=AWS_REGION)


def extract_company_intelligence(crawled_content: dict) -> dict:
    """
    Pass all crawled content to Bedrock Claude and return structured intelligence JSON.
    """
    # Build content block — cap each page at 3000 chars to stay within token limits
    content_blocks = "\n\n---\n\n".join(
        f"[PAGE: {url}]\n{text[:3000]}"
        for url, text in crawled_content.items()
    )

    prompt = f"""You are a business intelligence analyst. Analyze the crawled website content below and extract structured company intelligence.

=== CRAWLED CONTENT ===
{content_blocks}
=== END OF CONTENT ===

Return a single JSON object with exactly these fields:

{{
  "company_name": "<official company name>",
  "company_summary": "<factual summary of the company, max 400 words>",
  "industry": "<e.g. B2B SaaS / Workflow Automation>",
  "company_location": "<city and country where the company is headquartered, e.g. 'Mumbai, India' or 'San Francisco, USA'. Extract from footer, contact page, or About Us. Leave empty string if not found.>",
  "icp": ["<target customer segment 1>", "<segment 2>", ...],
  "services": ["<service or product 1>", "<service 2>", ...],
  "keywords": ["<keyword 1>", ..., "<keyword 15>"],
  "confidence_score": <float 0.0 to 1.0>,
  "confidence_reason": "<brief explanation of why this confidence score was assigned>"
}}

Rules:
- Extract ONLY from the provided content. Do not hallucinate facts not present.
- If information is thin or ambiguous, assign a lower confidence_score (below 0.78).
- Keywords must be derived from the actual content — normalize to clean, business-relevant terms.
- icp and services must be arrays of strings (not nested objects).
- company_location must be a plain string like "City, Country" — never an object.
- Return only valid JSON with no markdown fences or extra commentary.
"""

    client = _get_bedrock_client()

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    })

    logger.info(f"Invoking Bedrock model: {BEDROCK_MODEL_ID}")
    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )

    response_body = json.loads(response["body"].read())
    raw = response_body["content"][0]["text"]
    return _parse_llm_json(raw)


def extract_product_location_intelligence(crawled_content: dict) -> dict:
    """
    Second Bedrock pass on crawled pages (main + location-specific pages):
    extracts Product Intelligence + Location Intelligence.
    Returns {products, locations, country_summary} — empty lists if nothing found.
    """
    # Location-specific pages need a much higher char cap — a 30-office list easily
    # exceeds 3000 chars and truncation is what causes incomplete country extraction.
    location_keywords = ("contact", "location", "office", "where-we-are", "worldwide")

    def _page_limit(url: str) -> int:
        return 12000 if any(kw in url.lower() for kw in location_keywords) else 3000

    content_blocks = "\n\n---\n\n".join(
        f"[PAGE: {url}]\n{text[:_page_limit(url)]}"
        for url, text in crawled_content.items()
    )

    prompt = f"""You are a business intelligence analyst. From the crawled website content below, extract structured product and location data.

=== CRAWLED CONTENT ===
{content_blocks}
=== END OF CONTENT ===

Return a single JSON object with exactly these three keys:

{{
  "products": [
    {{
      "name": "<product or service name>",
      "description": "<comprehensive 2-3 sentence description: what the product does, its key features or capabilities, the core problem it solves, and its primary value proposition — drawn only from the content>",
      "target_customers": "<explicitly mentioned target customers, or empty string if not stated>",
      "market_category": "<market category — infer only if clearly derivable from the content>",
      "importance": "<High | Medium | Low>",
      "reason": "<one sentence explaining the importance level based on content prominence>"
    }}
  ],
  "locations": [
    {{
      "country": "<country name>",
      "cities": [
        {{
          "city": "<city name — use 'Unspecified' only if the country is mentioned but no city is given>",
          "type": "<copy the exact office type label from the content — e.g. HQ, Headquarters, Engineering Center, Regional, Delivery Center, R&D, Office — use the exact wording from the source; default to Office only if no type is stated>"
        }}
      ]
    }}
  ],
  "country_summary": [
    {{
      "country": "<country name>",
      "location_count": <number of distinct city entries for this country>
    }}
  ]
}}

PRODUCT rules:
- Extract each distinct product/service explicitly named in the content.
- Description must be 2-3 full sentences. Do not truncate. Include: what it does, key features, value it delivers.
- Importance: High = homepage/nav/flagship language; Medium = dedicated product section; Low = brief mention.
- Do not fabricate product names or capabilities not present in the content.

LOCATION rules — this is critical:
- Scan EVERY part of the content for location signals: addresses, city names, country names, "we have offices in...", regional presence sections, footer addresses, office listing tables, "global presence" sections.
- Extract ALL countries and cities mentioned as office locations — even if 10, 15, or 20 countries are present, list ALL of them.
- Each distinct city in a country = a separate entry in that country's cities array.
- If a country is listed with multiple offices (e.g., "New York, Chicago, San Francisco"), list each city separately.
- country_summary location_count = number of city entries for that country.
- If no location data found at all, return empty arrays.

Return only valid JSON. No markdown fences, no extra commentary.
"""

    client = _get_bedrock_client()
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
    })

    logger.info("Invoking Bedrock for product/location intelligence…")
    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    response_body = json.loads(response["body"].read())
    raw = response_body["content"][0]["text"]

    parsed = _parse_llm_json(raw)
    return {
        "products": parsed.get("products") or [],
        "locations": parsed.get("locations") or [],
        "country_summary": parsed.get("country_summary") or [],
    }


def should_recrawl(confidence_score: float, threshold: float = DEFAULT_THRESHOLD) -> bool:
    return confidence_score < threshold


# ── Main orchestration loop ───────────────────────────────────────────────────

def run_website_intelligence(url: str, threshold: float = DEFAULT_THRESHOLD, force_refresh: bool = False) -> dict:
    """
    Agentic loop:
    1. Normalize URL and check DynamoDB cache (unless force_refresh=True).
    2. Crawl initial high-value pages.
    3. Extract intelligence via LLM.
    4. If confidence is low and budget allows, crawl more pages and retry.
    5. Stop when confident, or max pages/iterations hit.
    """
    normalized = normalize_url(url)
    logger.info(f"=== Starting Website Intelligence for: {normalized} (force_refresh={force_refresh}) ===")

    # ── Cache check ───────────────────────────────────────────────────────────
    if not force_refresh:
        cached = get_cached_intelligence(normalized)
        if cached:
            cached["from_cache"] = True
            return cached
        logger.info("Cache miss — running full crawl pipeline")

    # Preserve manually locked location even on force refresh
    locked_location = None
    existing = get_cached_intelligence(normalized)
    if existing and existing.get("company_location_locked"):
        locked_location = existing.get("company_location", "")

    crawled_content, app, base = crawl_initial_pages(normalized)

    if not crawled_content:
        raise ValueError(f"Could not crawl any usable pages from: {url}")

    pages_crawled = list(crawled_content.keys())
    result = None
    stop_reason = None

    for iteration in range(1, MAX_ITERATIONS + 1):
        logger.info(f"--- Iteration {iteration}: Extracting from {len(crawled_content)} pages ---")

        result = extract_company_intelligence(crawled_content)
        confidence = result.get("confidence_score", 0.0)

        logger.info(
            f"Iteration {iteration} complete — "
            f"confidence={confidence:.2f}, "
            f"reason={result.get('confidence_reason', 'n/a')}"
        )

        # Stop: confidence is good enough
        if not should_recrawl(confidence, threshold):
            stop_reason = "confidence_reached"
            logger.info(f"Stopping: confidence {confidence:.2f} >= threshold {threshold}")
            break

        # Stop: page budget exhausted
        if len(pages_crawled) >= MAX_PAGES:
            stop_reason = "max_pages_reached"
            logger.info(f"Stopping: max pages ({MAX_PAGES}) reached")
            break

        # Stop: last iteration — don't crawl more
        if iteration == MAX_ITERATIONS:
            stop_reason = "max_iterations_reached"
            logger.info(f"Stopping: max iterations ({MAX_ITERATIONS}) reached")
            break

        # Select and crawl additional pages
        additional = select_additional_pages(base, set(pages_crawled))
        if not additional:
            stop_reason = "no_more_candidates"
            logger.info("Stopping: no more candidate pages to crawl")
            break

        for page_url in additional:
            if len(pages_crawled) >= MAX_PAGES:
                break
            logger.info(f"[Additional] Crawling: {page_url}")
            content = crawl_page(app, page_url)
            if content:
                crawled_content[page_url] = content
                pages_crawled.append(page_url)
                logger.info(f"[Additional] Got {len(content)} chars from {page_url}")
            else:
                logger.info(f"[Additional] No usable content from {page_url}")
    else:
        stop_reason = "max_iterations_reached"

    logger.info(
        f"=== Done — iterations={iteration}, pages={len(pages_crawled)}, "
        f"confidence={result.get('confidence_score', 0):.2f}, stop={stop_reason} ==="
    )

    result["pages_crawled"] = pages_crawled
    result["iterations"] = iteration
    result["stop_reason"] = stop_reason

    # ── Dedicated location page crawl (separate budget, for accurate office data) ──
    logger.info("Running dedicated location page crawl…")
    location_content = crawl_location_pages(base, app)
    combined_for_pl = {**crawled_content, **location_content}

    # ── Product & Location Intelligence (second Bedrock pass) ─────────────────
    try:
        logger.info("Running product/location intelligence extraction…")
        pl_intel = extract_product_location_intelligence(combined_for_pl)
        result["products"] = pl_intel["products"]
        result["locations"] = pl_intel["locations"]
        result["country_summary"] = pl_intel["country_summary"]
    except Exception as e:
        logger.warning(f"Product/location extraction failed (non-fatal): {e}")
        result["products"] = []
        result["locations"] = []
        result["country_summary"] = []

    # Restore manually locked company_location (overrides LLM extraction)
    if locked_location is not None:
        result["company_location"] = locked_location
        result["company_location_locked"] = True

    # ── Persist to S3 + DynamoDB ──────────────────────────────────────────────
    logger.info("Saving raw markdown to S3…")
    s3_key = save_markdown_to_s3(normalized, crawled_content)

    logger.info("Saving structured intelligence to DynamoDB…")
    save_intelligence_to_dynamodb(normalized, result, s3_key)

    result["from_cache"] = False

    return result
