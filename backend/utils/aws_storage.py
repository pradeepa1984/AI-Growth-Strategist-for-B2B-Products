import os
import logging
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Key
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

AWS_PROFILE = "Website-intel-dev"
AWS_REGION  = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET   = os.environ.get("S3_BUCKET")
DYNAMO_TABLE = "company_intelligence"


def _session():
    return boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)


def _domain(url: str) -> str:
    return urlparse(url).netloc.replace("www.", "")


# ── S3 ────────────────────────────────────────────────────────────────────────

def save_markdown_to_s3(company_url: str, crawled_content: dict) -> str | None:
    """
    Combine all crawled page markdown and save as a single .md file in S3.
    Returns the S3 key, or None if S3_BUCKET is not configured.
    """
    if not S3_BUCKET:
        logger.warning("S3_BUCKET not set — skipping S3 upload")
        return None

    domain    = _domain(company_url)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_key    = f"raw-crawls/{domain}/{timestamp}.md"

    # Build combined markdown with page headers
    sections = [
        f"# Crawl: {company_url}\nTimestamp: {timestamp}\n\n"
    ]
    for page_url, markdown in crawled_content.items():
        sections.append(f"---\n## {page_url}\n\n{markdown}\n")
    combined = "\n".join(sections)

    try:
        s3 = _session().client("s3")
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=combined.encode("utf-8"),
            ContentType="text/markdown",
        )
        logger.info(f"Saved markdown to s3://{S3_BUCKET}/{s3_key}")
        return s3_key
    except Exception as e:
        logger.error(f"Failed to save to S3: {e}")
        return None


# ── DynamoDB ──────────────────────────────────────────────────────────────────

def save_intelligence_to_dynamodb(company_url: str, data: dict, s3_key: str | None) -> bool:
    """
    Persist structured company intelligence to DynamoDB.
    Table: company_intelligence
    PK: company_url  |  SK: analysed_at (ISO timestamp)
    """
    analysed_at = datetime.now(timezone.utc).isoformat()

    # Write back into data so the caller's result dict has these fields
    data["analysed_at"] = analysed_at
    data["company_url"] = company_url
    data["human_approved_ind"] = "N"

    item = {
        "company_url":      company_url,
        "analysed_at":      analysed_at,
        "company_name":     data.get("company_name", ""),
        "company_summary":  data.get("company_summary", ""),
        "industry":         data.get("industry", ""),
        "company_location": data.get("company_location", ""),
        "services":         data.get("services", []),
        "keywords":         data.get("keywords", []),
        "icp":              data.get("icp", []),
        "confidence_score": Decimal(str(data.get("confidence_score", 0))),
        "confidence_reason":data.get("confidence_reason", ""),
        "pages_crawled":    data.get("pages_crawled", []),
        "iterations":       data.get("iterations", 0),
        "stop_reason":          data.get("stop_reason", ""),
        "human_approved_ind":   "N",
    }

    if s3_key:
        item["s3_markdown_key"] = s3_key

    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(DYNAMO_TABLE)
        table.put_item(Item=item)
        logger.info(f"Saved to DynamoDB [{DYNAMO_TABLE}]: {company_url} @ {analysed_at}")
        return True
    except Exception as e:
        logger.error(f"Failed to save to DynamoDB: {e}")
        return False


def _deserialize(obj):
    """Recursively convert DynamoDB Decimal types to int or float."""
    if isinstance(obj, dict):
        return {k: _deserialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deserialize(v) for v in obj]
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    return obj


def get_cached_intelligence(company_url: str) -> dict | None:
    """
    Look up the most recent analysis for a given company_url from DynamoDB.
    Returns the item as a plain dict (Decimals converted to float), or None if not found.
    """
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(DYNAMO_TABLE)

        response = table.query(
            KeyConditionExpression=Key("company_url").eq(company_url),
            ScanIndexForward=False,  # descending — latest analysed_at first
            Limit=1,
        )

        items = response.get("Items", [])
        if not items:
            logger.info(f"Cache miss for: {company_url}")
            return None

        item = items[0]
        # Convert all Decimal values → native Python types for JSON serialisation
        item = _deserialize(item)

        logger.info(f"Cache hit for: {company_url} (analysed_at={item.get('analysed_at')})")
        return item

    except Exception as e:
        logger.error(f"Cache lookup failed: {e}")
        return None


def record_exists(company_url: str) -> bool:
    """Check if any record exists in DynamoDB for the given company_url."""
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(DYNAMO_TABLE)
        response = table.query(
            KeyConditionExpression=Key("company_url").eq(company_url),
            Limit=1,
            ProjectionExpression="company_url",
        )
        return len(response.get("Items", [])) > 0
    except Exception as e:
        logger.error(f"record_exists check failed: {e}")
        return False


def update_intelligence(company_url: str, analysed_at: str, updates: dict) -> bool:
    """
    Update editable fields of a company_intelligence record.
    Allowed fields: company_summary, industry, icp, services, keywords.
    """
    ALLOWED = {"company_summary", "industry", "icp", "services", "keywords"}
    filtered = {k: v for k, v in updates.items() if k in ALLOWED}
    if not filtered:
        logger.warning("update_intelligence called with no valid fields")
        return False

    set_parts  = [f"#f_{i} = :v_{i}" for i, k in enumerate(filtered)]
    expr_names = {f"#f_{i}": k for i, k in enumerate(filtered)}
    expr_vals  = {f":v_{i}": v for i, (k, v) in enumerate(filtered.items())}

    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(DYNAMO_TABLE)
        table.update_item(
            Key={"company_url": company_url, "analysed_at": analysed_at},
            UpdateExpression="SET " + ", ".join(set_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_vals,
        )
        logger.info(f"Updated fields {list(filtered.keys())} for {company_url}")
        return True
    except Exception as e:
        logger.error(f"Failed to update record: {e}")
        return False


def approve_intelligence(company_url: str, analysed_at: str) -> bool:
    """
    Set human_approved_ind = 'Y' for a specific company_intelligence record.
    """
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(DYNAMO_TABLE)
        table.update_item(
            Key={"company_url": company_url, "analysed_at": analysed_at},
            UpdateExpression="SET human_approved_ind = :val",
            ExpressionAttributeValues={":val": "Y"},
        )
        logger.info(f"Approved: {company_url} @ {analysed_at}")
        return True
    except Exception as e:
        logger.error(f"Failed to approve record: {e}")
        return False


# ── Market Intelligence Cache ──────────────────────────────────────────────────

MI_TABLE = "market_intelligence"


def save_market_intelligence_to_dynamodb(company_url: str, data: dict) -> bool:
    """
    Persist market intelligence results to DynamoDB.
    Table: market_intelligence  |  PK: company_url  |  SK: analysed_at
    """
    analysed_at = datetime.now(timezone.utc).isoformat()
    item = {
        "company_url":      company_url,
        "analysed_at":      analysed_at,
        "keyword_clusters": data.get("keyword_clusters", []),
        "content_topics":   data.get("content_topics", []),
        "target_segments":  data.get("target_segments", []),
        "top_competitors":  data.get("top_competitors", []),
        "market_strategy":  data.get("market_strategy", {}),
    }
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(MI_TABLE)
        table.put_item(Item=item)
        logger.info(f"Saved MI to DynamoDB [{MI_TABLE}]: {company_url} @ {analysed_at}")
        return True
    except Exception as e:
        logger.error(f"Failed to save MI to DynamoDB: {e}")
        return False


def get_cached_market_intelligence(company_url: str) -> dict | None:
    """
    Look up the most recent market intelligence for a given company_url.
    Returns the item as a plain dict, or None if not found / table missing.
    """
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(MI_TABLE)
        response = table.query(
            KeyConditionExpression=Key("company_url").eq(company_url),
            ScanIndexForward=False,
            Limit=1,
        )
        items = response.get("Items", [])
        if not items:
            logger.info(f"MI cache miss for: {company_url}")
            return None
        item = _deserialize(items[0])
        logger.info(f"MI cache hit for: {company_url}")
        return item
    except Exception as e:
        logger.warning(f"MI cache lookup failed (table may not exist yet): {e}")
        return None


# ── Content Generation Cache ───────────────────────────────────────────────────

CG_TABLE = "content_generation"


def save_content_generation_to_dynamodb(company_url: str, topic: str, data: dict) -> bool:
    """
    Persist a generated content item to DynamoDB.
    Table: content_generation  |  PK: company_url  |  SK: topic_slug#generated_at
    """
    generated_at = datetime.now(timezone.utc).isoformat()
    topic_slug   = topic.lower().replace(" ", "_")[:60]
    sk           = f"{topic_slug}#{generated_at}"

    item = {
        "company_url":      company_url,
        "sk":               sk,
        "topic":            topic,
        "content_type":     data.get("content_type", ""),
        "template_used":    data.get("template_used", ""),
        "template_name":    data.get("template_name", ""),
        "content":          data.get("content", ""),
        "structured_content": data.get("structured_content", {}),
        "tone":             data.get("tone", ""),
        "audience_level":   data.get("audience_level", ""),
        "length":           data.get("length", ""),
        "keywords":         data.get("keywords", []),
        "generated_at":     generated_at,
    }
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(CG_TABLE)
        table.put_item(Item=item)
        logger.info(f"Saved CG to DynamoDB [{CG_TABLE}]: {company_url} / {topic_slug}")
        return True
    except Exception as e:
        logger.error(f"Failed to save CG to DynamoDB: {e}")
        return False


def get_cached_content_generation(company_url: str, topic: str, content_type: str, template: str) -> dict | None:
    """
    Look up cached generated content for a specific company + topic + type + template.
    Returns the most recent match, or None.
    """
    topic_slug = topic.lower().replace(" ", "_")[:60]
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(CG_TABLE)
        response = table.query(
            KeyConditionExpression=Key("company_url").eq(company_url) & Key("sk").begins_with(topic_slug + "#"),
            ScanIndexForward=False,
            Limit=10,
        )
        items = response.get("Items", [])
        for item in items:
            if item.get("content_type") == content_type and item.get("template_used") == template:
                return _deserialize(item)
        return None
    except Exception as e:
        logger.warning(f"CG cache lookup failed (table may not exist yet): {e}")
        return None


# ── Lead Discovery ─────────────────────────────────────────────────────────────

LEADDISCOVERY_TABLE = "leaddiscovery"


def _serialize_for_dynamo(obj):
    """Recursively convert floats to Decimal and drop None values for DynamoDB compatibility."""
    if isinstance(obj, dict):
        return {k: _serialize_for_dynamo(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_serialize_for_dynamo(v) for v in obj]
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def get_cached_leads(source_company_url: str) -> list | None:
    """
    Return the cached leads list for a given source company URL, or None if not cached.
    Cache records are stored with company_url = "cache:<url>" and analysed_at = "cache".
    """
    cache_key = f"cache:{source_company_url}"
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(LEADDISCOVERY_TABLE)
        response = table.get_item(Key={"company_url": cache_key, "analysed_at": "cache"})
        item = response.get("Item")
        if not item:
            logger.info(f"Lead cache miss for: {source_company_url}")
            return None
        leads = _deserialize(item.get("lead_list", []))
        logger.info(f"Lead cache hit for: {source_company_url} ({len(leads)} leads)")
        return leads
    except Exception as e:
        logger.error(f"get_cached_leads failed: {e}")
        return None


def save_leads_cache(source_company_url: str, leads: list) -> bool:
    """
    Persist the full leads list for a source company URL into the leaddiscovery table.
    Uses company_url = "cache:<url>" and analysed_at = "cache" as the key.
    """
    cache_key = f"cache:{source_company_url}"
    cached_at = datetime.now(timezone.utc).isoformat()
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(LEADDISCOVERY_TABLE)
        table.put_item(Item={
            "company_url":   cache_key,
            "analysed_at":   "cache",
            "lead_list":     _serialize_for_dynamo(leads),
            "cached_at":     cached_at,
        })
        logger.info(f"Saved {len(leads)} leads to cache for: {source_company_url}")
        return True
    except Exception as e:
        logger.error(f"save_leads_cache failed: {e}")
        return False


def save_to_leaddiscovery_table(
    source_company_url: str,
    company_name: str,
    organization_list: list,
    lead_list: list,
) -> bool:
    """
    Save Apollo lead discovery results to the leaddiscovery DynamoDB table.
    PK: company_url  |  SK: analysed_at
    """
    analysed_at = datetime.now(timezone.utc).isoformat()
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(LEADDISCOVERY_TABLE)
        table.put_item(Item={
            "company_url":       source_company_url,
            "analysed_at":       analysed_at,
            "company_name":      company_name,
            "organization_list": _serialize_for_dynamo(organization_list),
            "lead_list":         _serialize_for_dynamo(lead_list),
        })
        logger.info(f"Saved {len(lead_list)} leads to [{LEADDISCOVERY_TABLE}] for: {source_company_url}")
        return True
    except Exception as e:
        logger.error(f"save_to_leaddiscovery_table failed: {e}")
        return False


def log_lead_discovery(lead: dict, context: dict) -> bool:
    """
    Log a discovered lead to the leaddiscovery DynamoDB table.
    lead    = { "company": "...", "website": "...", "industry": "...", "source": "apollo" }
    context = { "target_customers": "...", "buyer_industry": "...", "q_keywords": "..." }
    """
    company_url   = lead.get("website") or lead.get("company", "unknown")
    discovered_at = datetime.now(timezone.utc).isoformat()
    item = {
        "company_url":      company_url,
        "discovered_at":    discovered_at,
        "company_name":     lead.get("company", ""),
        "industry":         lead.get("industry", ""),
        "source":           lead.get("source", "apollo"),
        "target_customers": context.get("target_customers", ""),
        "buyer_industry":   context.get("buyer_industry", ""),
        "q_keywords":       context.get("q_keywords", ""),
    }
    try:
        dynamo = _session().resource("dynamodb")
        table  = dynamo.Table(LEADDISCOVERY_TABLE)
        table.put_item(Item=item)
        logger.info(f"Logged lead to DynamoDB [{LEADDISCOVERY_TABLE}]: {company_url} @ {discovered_at}")
        return True
    except Exception as e:
        logger.error(f"Failed to log lead to DynamoDB: {e}")
        return False
