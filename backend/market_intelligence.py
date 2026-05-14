import os
import json
import logging
import re

import boto3
import anthropic

from utils.scale_classifier import (
    enrich_competitors_with_scale,
    filter_competitors_by_scale,
    rank_competitors,
    classify_company_scale_from_ci,
)

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
USE_BEDROCK      = os.getenv("USE_BEDROCK", "false").lower() == "true"
AWS_REGION       = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-haiku-20241022-v1:0")
ANTHROPIC_MODEL  = os.environ.get("ANTHROPIC_MODEL_ID", "claude-sonnet-4-6")


# ── Bedrock client (kept intact, used when USE_BEDROCK=true) ──────────────────

def _get_bedrock_client():
    profile = os.environ.get("AWS_PROFILE")
    session = (
        boto3.Session(profile_name=profile, region_name=AWS_REGION)
        if profile
        else boto3.Session(region_name=AWS_REGION)
    )
    return session.client("bedrock-runtime")


# ── LLM dispatcher ─────────────────────────────────────────────────────────────
# USE_BEDROCK=true  → AWS Bedrock  (local dev)
# USE_BEDROCK=false → Anthropic API (ECS default)

def _call_llm(prompt: str, max_tokens: int = 800, temperature: float = 0.2) -> str:
    if USE_BEDROCK:
        client = _get_bedrock_client()
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        })
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]
    else:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_llm_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    return json.loads(text.strip())


def _validate_market_strategy(strategy: dict) -> dict:
    required_scales = ["large_scale", "mid_scale", "small_scale"]
    required_levels = ["global", "india"]

    for scale in required_scales:
        if scale not in strategy:
            raise ValueError(f"market_strategy missing scale: '{scale}'")
        for level in required_levels:
            if level not in strategy[scale]:
                raise ValueError(f"market_strategy['{scale}'] missing level: '{level}'")
            items = strategy[scale][level]
            if not isinstance(items, list) or len(items) == 0:
                raise ValueError(
                    f"market_strategy['{scale}']['{level}'] must be a non-empty list"
                )
            for item in items:
                if "region" not in item or "reason" not in item:
                    raise ValueError(
                        f"Item in market_strategy['{scale}']['{level}'] missing 'region' or 'reason': {item}"
                    )
                if level == "india" and "sub_regions" not in item:
                    raise ValueError(
                        f"India item in market_strategy['{scale}']['india'] missing 'sub_regions': {item}"
                    )
    return strategy


def _get_best_fit_scale(ci_data: dict) -> str:
    icp_text     = " ".join(ci_data.get("icp", [])).lower()
    summary_text = (ci_data.get("company_summary") or "").lower()
    combined     = icp_text + " " + summary_text

    enterprise_signals = ["enterprise", "large company", "corporation", "fortune", "global", "multinational"]
    startup_signals    = ["startup", "sme", "small business", "small and medium", "niche", "early stage", "bootstrapped"]

    if any(k in combined for k in enterprise_signals):
        return "large_scale"
    if any(k in combined for k in startup_signals):
        return "small_scale"
    return "mid_scale"


def _build_strategy_prompt(industry: str, icp: str, segments: str, keywords: str) -> str:
    return f"""You are a B2B market expansion strategist.

Given:
- Industry: {industry}
- ICP (Target Customers): {icp}
- Target Segments: {segments or "Not specified"}
- Keywords: {keywords}

Generate a multi-scale market expansion strategy. Each scale has TWO sections:
  1. "global" — worldwide geographic regions to target at that scale.
  2. "india"  — specific Indian cities or business clusters to target at that scale.

CRITICAL RULES — read carefully before generating:
- The "india" section is MANDATORY for ALL THREE scales. Never leave it empty.
- The "india" section does NOT mean "is India suitable for this scale globally."
  It means: "which Indian cities/clusters best represent this scale's deployment focus."
  Examples by scale:
    • large_scale india  → major enterprise hubs: "Mumbai", "Delhi NCR", "Bengaluru CBD"
    • mid_scale india    → growing tech corridors: "Bengaluru", "Hyderabad HITEC City", "Pune IT Corridor"
    • small_scale india  → emerging startup ecosystems: "Jaipur", "Ahmedabad", "Kochi", "Coimbatore"
- global sections: suggest 2–4 named geographic regions. Each scale must use DIFFERENT regions.
- india sections: suggest 2–4 specific cities or clusters. Each scale may use DIFFERENT cities.
- Each "reason" must be exactly 1 concise sentence specific to the industry and ICP.
- Output STRICT JSON only — no markdown fences, no extra text.

Return exactly this JSON structure:

{{
  "large_scale": {{
    "global": [
      {{"region": "<region name>", "reason": "<1-line reason>"}}
    ],
    "india": [
      {{"region": "India", "sub_regions": ["<city/cluster>", "<city/cluster>"], "reason": "<1-line reason>"}}
    ]
  }},
  "mid_scale": {{
    "global": [
      {{"region": "<region name>", "reason": "<1-line reason>"}}
    ],
    "india": [
      {{"region": "India", "sub_regions": ["<city/cluster>", "<city/cluster>"], "reason": "<1-line reason>"}}
    ]
  }},
  "small_scale": {{
    "global": [
      {{"region": "<region name>", "reason": "<1-line reason>"}}
    ],
    "india": [
      {{"region": "India", "sub_regions": ["<city/cluster>", "<city/cluster>"], "reason": "<1-line reason>"}}
    ]
  }}
}}
"""


# ── generate_market_strategy — Bedrock only (detailed strategy, not in main MI flow) ──

def generate_market_strategy(ci_data: dict, target_segments: list = None) -> dict:
    """
    Detailed multi-scale market expansion strategy.
    Routes to Bedrock or direct Anthropic API via _call_llm dispatcher.
    Uses retry + strict schema validation.
    """
    industry = ci_data.get("industry", "Unknown")
    icp      = ", ".join(ci_data.get("icp", []))
    keywords = ", ".join(ci_data.get("keywords", []))
    segments = ", ".join(s.get("segment", "") for s in (target_segments or []))

    last_error = None

    for attempt in range(2):
        prompt = _build_strategy_prompt(industry, icp, segments, keywords)
        if attempt == 1:
            prompt = (
                "IMPORTANT: Your previous response was missing required fields. "
                "You MUST include a non-empty 'india' list for EVERY scale "
                "(large_scale, mid_scale, small_scale). Do not omit any section.\n\n"
            ) + prompt

        logger.info(
            "Invoking LLM for Market Strategy (attempt %d, USE_BEDROCK=%s)",
            attempt + 1, USE_BEDROCK,
        )
        try:
            raw = _call_llm(prompt, max_tokens=1500, temperature=0.2)
        except Exception as e:
            last_error = e
            logger.warning("Market strategy LLM call failed on attempt %d: %s", attempt + 1, e)
            continue

        try:
            strategy = _validate_market_strategy(_parse_llm_json(raw))
            strategy["best_fit_scale"] = _get_best_fit_scale(ci_data)
            return strategy
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            last_error = e
            logger.warning("Market strategy attempt %d failed validation: %s", attempt + 1, e)

    raise ValueError(f"Market strategy generation failed after 2 attempts: {last_error}")


# ── refresh_content_topics ─────────────────────────────────────────────────────

def refresh_content_topics(ci_data: dict, keyword_clusters: list[dict]) -> list[dict]:
    """
    Regenerate content topics when keyword clusters change.
    Uses the LLM dispatcher (Bedrock or direct API depending on USE_BEDROCK).
    """
    cluster_summary = "\n".join(
        f"- {c['cluster_name']}: {', '.join(c.get('keywords', []))}"
        for c in keyword_clusters
    )

    prompt = f"""You are a B2B content strategist.

The following keyword clusters have been updated for a company:

=== COMPANY CONTEXT ===
Company: {ci_data.get('company_name', 'Unknown')}
Industry: {ci_data.get('industry', 'Unknown')}
ICP: {', '.join(ci_data.get('icp', []))}
Services: {', '.join(ci_data.get('services', []))}

=== UPDATED KEYWORD CLUSTERS ===
{cluster_summary}
=== END ===

Generate 5–8 fresh content topic ideas that are directly derived from the updated keyword clusters above.
Each topic must:
  - Map to at least one cluster theme
  - Be a specific, actionable blog/article title (not generic)
  - Include a 1-sentence angle describing the hook or narrative

Return a JSON array only:
[
  {{"title": "<specific blog title>", "angle": "<1-sentence hook/angle>", "cluster": "<which cluster this maps to>"}}
]

CRITICAL: Return ONLY valid JSON. No markdown, no explanation."""

    logger.info("Refreshing content topics (USE_BEDROCK=%s)", USE_BEDROCK)
    try:
        raw    = _call_llm(prompt, max_tokens=800, temperature=0.2)
        topics = _parse_llm_json(raw)
        if isinstance(topics, list):
            return topics
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("Failed to parse refreshed content topics: %s", e)

    return []


# ── run_market_intelligence ────────────────────────────────────────────────────

def run_market_intelligence(ci_data: dict) -> dict:
    """
    Fast single-call market intelligence generation.
    Routes to Bedrock (USE_BEDROCK=true) or direct Anthropic API (default).
    No retry — returns partial output on parse failure.
    """
    company_summary = (
        f"Company: {ci_data.get('company_name', 'Unknown')}\n"
        f"Industry: {ci_data.get('industry', 'Unknown')}\n"
        f"Summary: {ci_data.get('company_summary', '')}\n"
        f"Services: {', '.join(ci_data.get('services', []))}\n"
        f"ICP: {', '.join(ci_data.get('icp', []))}\n"
        f"Keywords: {', '.join(ci_data.get('keywords', []))}"
    )

    prompt = f"""Generate concise market intelligence.
Return JSON:
- keyword_clusters (3 items, each: {{"cluster_name": "...", "keywords": [...]}})
- content_topics (3 items, each: {{"title": "...", "angle": "..."}})
- target_segments (3 items, each: {{"segment": "...", "pain_point": "...", "message": "..."}})
- pain_points (5 short strings)
- top_competitors (3 items, each: {{"name": "...", "differentiator": "...", "scale": "Startup|Mid-size|Enterprise"}})
- market_expansion_strategy (3 bullet points as strings)

Keep output SHORT.

Company:
{company_summary}

Return only valid JSON, no markdown."""

    logger.info(
        "MI generation — USE_BEDROCK=%s model=%s",
        USE_BEDROCK,
        BEDROCK_MODEL_ID if USE_BEDROCK else ANTHROPIC_MODEL,
    )

    _empty = {
        "keyword_clusters": [], "content_topics": [], "target_segments": [],
        "pain_points": [], "top_competitors": [], "market_expansion_strategy": [],
    }

    try:
        raw = _call_llm(prompt, max_tokens=2000, temperature=0.2)
    except Exception as e:
        logger.error("MI LLM call failed: %s", e)
        raise

    try:
        result = _parse_llm_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("MI JSON parse failed: %s\nRaw response: %.500s", e, raw)
        raise ValueError(f"Market intelligence JSON parse failed: {e}")

    # Guard: if the LLM returned all-empty arrays the response was truncated — fail loudly
    if (
        not result.get("keyword_clusters")
        and not result.get("content_topics")
        and not result.get("target_segments")
        and not result.get("top_competitors")
    ):
        logger.error("MI LLM returned all-empty arrays (likely truncated). Raw: %.500s", raw)
        raise ValueError("Market intelligence generation returned empty data — please try again.")

    # Scale-classify competitors (pure Python, no LLM calls)
    raw_competitors = result.get("top_competitors", [])
    if raw_competitors and isinstance(raw_competitors[0], dict):
        company_scale_result = classify_company_scale_from_ci(ci_data)
        company_scale        = company_scale_result["scale"]
        enriched  = enrich_competitors_with_scale(raw_competitors)
        filtered  = filter_competitors_by_scale(enriched, company_scale)
        ranked    = rank_competitors(
            filtered, company_scale,
            ci_data.get("icp", []), ci_data.get("services", []),
        )
        result["top_competitors"]            = ranked
        result["company_scale"]              = company_scale
        result["company_scale_confidence"]   = company_scale_result["confidence"]

    # Generate detailed market expansion strategy (nested scale/region structure)
    try:
        market_strategy = generate_market_strategy(ci_data, result.get("target_segments"))
        result["market_strategy"] = market_strategy
    except Exception as e:
        logger.warning("Market strategy generation failed (non-fatal): %s", e)
        result["market_strategy"] = None

    return result
