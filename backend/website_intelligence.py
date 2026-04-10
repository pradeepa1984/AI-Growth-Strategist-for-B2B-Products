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


# ── Bedrock client (shared, created once) ─────────────────────────────────────

AWS_PROFILE = "Website-intel-dev"
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")

def _get_bedrock_client():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.client("bedrock-runtime")


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

    # ── Persist to S3 + DynamoDB ──────────────────────────────────────────────
    logger.info("Saving raw markdown to S3…")
    s3_key = save_markdown_to_s3(normalized, crawled_content)

    logger.info("Saving structured intelligence to DynamoDB…")
    save_intelligence_to_dynamodb(normalized, result, s3_key)

    result["from_cache"] = False

    return result
