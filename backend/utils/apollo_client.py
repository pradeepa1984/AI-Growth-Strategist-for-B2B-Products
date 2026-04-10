import os
import logging
import requests

logger = logging.getLogger(__name__)

APOLLO_ENDPOINT = "https://api.apollo.io/v1/organizations/search"
MAX_RESULTS     = 20
MAX_QUERIES     = 7

# Industries to drop as irrelevant
IRRELEVANT_INDUSTRIES = {
    "information technology and services",
    "computer software",
    "internet",
    "staffing and recruiting",
    "management consulting",
    "outsourcing/offshoring",
    "financial services",  # too broad — keep only explicit insurance
}


def _build_queries(target_customers: list, buyer_industry: str, offerings: list) -> list:
    """
    Build up to MAX_QUERIES focused query strings.
    Priority: ICP + offering → ICP only → industry + offering
    """
    queries = []

    # ICP + offering combinations
    for icp in target_customers:
        for offering in offerings:
            queries.append(f"{icp} {offering}")
            if len(queries) >= MAX_QUERIES:
                return queries

    # ICP-only fallbacks
    for icp in target_customers:
        queries.append(icp)
        if len(queries) >= MAX_QUERIES:
            return queries

    # Industry + offering fallbacks
    for offering in offerings:
        queries.append(f"{buyer_industry} {offering}")
        if len(queries) >= MAX_QUERIES:
            return queries

    return queries


def _call_apollo(q_keywords: str, buyer_industry: str, api_key: str) -> list:
    """Single Apollo call. Returns raw organization dicts or empty list."""
    payload = {
        "q_keywords": q_keywords,
        "page": 1,
        "per_page": 10,
    }
    if buyer_industry:
        payload["q_organization_keyword_tags"] = [buyer_industry]

    headers = {
        "X-Api-Key": api_key,
        "Content-Type": "application/json",
    }

    logger.info(f"Apollo query: '{q_keywords}'")
    try:
        response = requests.post(APOLLO_ENDPOINT, json=payload, headers=headers, timeout=15)
    except requests.exceptions.RequestException as e:
        logger.error(f"Apollo request failed for query '{q_keywords}': {e}")
        return []

    logger.info(f"Apollo response status: {response.status_code}")
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"Apollo raw response: {response.text}")

    if response.status_code != 200:
        logger.error(f"Apollo returned {response.status_code} for query '{q_keywords}': {response.text}")
        return []

    orgs = response.json().get("organizations") or []
    logger.info(f"Results for '{q_keywords}': {len(orgs)}")
    return orgs


def _is_relevant(org: dict, buyer_industry: str) -> bool:
    """Keep only companies whose industry contains the buyer industry keyword."""
    industry = (org.get("industry") or "").lower()
    buyer    = buyer_industry.lower()

    if not industry:
        return False
    if buyer and buyer in industry:
        return True
    # Hard drop obvious irrelevant industries
    if industry in IRRELEVANT_INDUSTRIES:
        return False
    # If no buyer_industry filter set, accept anything not in the drop list
    if not buyer:
        return True
    return False


def get_leads(context: dict) -> list:
    """
    Iterative Apollo organization search with query refinement.

    context = {
        "target_customers": ["Life Insurers", "Health Insurers"],
        "buyer_industry": "insurance",
        "offerings": ["Claims Management System", "Policy Management"]
    }
    """
    target_customers = context.get("target_customers") or []
    buyer_industry   = context.get("buyer_industry", "")
    offerings        = context.get("offerings") or []

    # Normalise target_customers — accept both str and list
    if isinstance(target_customers, str):
        target_customers = [target_customers]

    if not target_customers and not buyer_industry:
        logger.warning("No target_customers or buyer_industry provided — returning empty list")
        return {"leads": [], "organizations": []}

    api_key = os.environ.get("APOLLO_API_KEY", "")
    if not api_key:
        logger.error("APOLLO_API_KEY not set")
        return {"leads": [], "organizations": []}

    queries = _build_queries(target_customers, buyer_industry, offerings)
    logger.info(f"Built {len(queries)} queries: {queries}")

    # ── Iterate queries ────────────────────────────────────────────────────────
    seen_names: set = set()
    raw_results: list = []

    for q in queries:
        if len(raw_results) >= MAX_RESULTS:
            logger.info(f"Reached {MAX_RESULTS} results — stopping early")
            break

        orgs = _call_apollo(q, buyer_industry, api_key)
        for org in orgs:
            name = (org.get("name") or "").strip()
            if not name or name.lower() in seen_names:
                continue
            if not _is_relevant(org, buyer_industry):
                logger.debug(f"Dropped irrelevant company: {name} (industry={org.get('industry')})")
                continue
            seen_names.add(name.lower())
            raw_results.append((org, q))

    logger.info(f"Total after dedup + filter: {len(raw_results)}")

    # ── Map + log ──────────────────────────────────────────────────────────────
    leads = []
    organizations = []
    for org, q_used in raw_results[:MAX_RESULTS]:
        lead = {
            "company":  org.get("name") or "",
            "website":  org.get("website_url") or "",
            "industry": org.get("industry") or "",
            "source":   "apollo",
        }
        leads.append(lead)
        organizations.append(org)

    logger.info(f"Returning {len(leads)} leads")
    return {"leads": leads, "organizations": organizations}
