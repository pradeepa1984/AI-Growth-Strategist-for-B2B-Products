import os
import json
import logging
import re

import boto3
from utils.scale_classifier import (
    enrich_competitors_with_scale,
    filter_competitors_by_scale,
    rank_competitors,
    classify_company_scale_from_ci,
)

logger = logging.getLogger(__name__)

AWS_PROFILE    = "Website-intel-dev"
AWS_REGION     = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-haiku-20241022-v1:0")


def _get_bedrock_client():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.client("bedrock-runtime")


def _parse_llm_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text.strip(), flags=re.MULTILINE)
    return json.loads(text.strip())


def _validate_market_strategy(strategy: dict) -> dict:
    """
    Enforce schema for market_strategy. Raises ValueError with a clear message
    if any required key or item shape is missing.
    """
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
    """
    Deterministically infer the best-fit scale from ICP keywords.
    Returns one of: 'large_scale', 'mid_scale', 'small_scale'.
    """
    icp_text = " ".join(ci_data.get("icp", [])).lower()
    summary_text = (ci_data.get("company_summary") or "").lower()
    combined = icp_text + " " + summary_text

    enterprise_signals = ["enterprise", "large company", "corporation", "fortune", "global", "multinational"]
    startup_signals = ["startup", "sme", "small business", "small and medium", "niche", "early stage", "bootstrapped"]

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


def generate_market_strategy(ci_data: dict, target_segments: list = None) -> dict:
    """
    Use Claude (via AWS Bedrock) to generate a multi-scale, two-level
    market expansion strategy (global regions + India-specific cities/clusters).
    Retries once if the first response fails schema validation.
    Appends a deterministic 'best_fit_scale' field based on ICP signals.
    """
    industry = ci_data.get("industry", "Unknown")
    icp      = ", ".join(ci_data.get("icp", []))
    keywords = ", ".join(ci_data.get("keywords", []))
    segments = ", ".join(s.get("segment", "") for s in (target_segments or []))

    client = _get_bedrock_client()
    last_error = None

    for attempt in range(2):
        prompt = _build_strategy_prompt(industry, icp, segments, keywords)
        # On the retry, prepend a stricter reminder so the model self-corrects
        if attempt == 1:
            prompt = (
                "IMPORTANT: Your previous response was missing required fields. "
                "You MUST include a non-empty 'india' list for EVERY scale "
                "(large_scale, mid_scale, small_scale). Do not omit any section.\n\n"
            ) + prompt

        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1500,
            "messages": [{"role": "user", "content": prompt}],
        })

        logger.info(f"Invoking Bedrock for Market Strategy (attempt {attempt + 1})")
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())
        raw = response_body["content"][0]["text"]

        try:
            strategy = _validate_market_strategy(_parse_llm_json(raw))
            strategy["best_fit_scale"] = _get_best_fit_scale(ci_data)
            return strategy
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            last_error = e
            logger.warning(f"Market strategy attempt {attempt + 1} failed validation: {e}")

    raise ValueError(f"Market strategy generation failed after 2 attempts: {last_error}")


def refresh_content_topics(ci_data: dict, keyword_clusters: list[dict]) -> list[dict]:
    """
    Regenerate content topics when keyword clusters change.

    Called by the /api/refresh-content-topics endpoint when a user edits
    keyword clusters in the Market Intelligence UI. Ensures content topics
    remain aligned with the updated cluster themes.

    Args:
        ci_data:          Company Intelligence dict (for context)
        keyword_clusters: Updated list of {cluster_name, keywords[]} dicts

    Returns:
        New content_topics list: [{title, angle}]
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

    client = _get_bedrock_client()
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    })

    logger.info("Refreshing content topics based on updated keyword clusters")
    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    response_body = json.loads(response["body"].read())
    raw = response_body["content"][0]["text"]

    try:
        topics = _parse_llm_json(raw)
        if isinstance(topics, list):
            return topics
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse refreshed content topics: {e}")

    return []


def run_market_intelligence(ci_data: dict) -> dict:
    """
    Given approved Company Intelligence data, use Claude (via AWS Bedrock) to
    generate market intelligence: keyword clusters, content topics,
    target segments, and top competitors.
    """
    prompt = f"""You are a B2B market intelligence analyst.

Based on the following approved company intelligence, generate actionable market intelligence.

=== COMPANY INTELLIGENCE ===
Company Name: {ci_data.get('company_name', 'Unknown')}
Industry: {ci_data.get('industry', 'Unknown')}
Summary: {ci_data.get('company_summary', '')}
Services: {', '.join(ci_data.get('services', []))}
ICP (Target Customers): {', '.join(ci_data.get('icp', []))}
Keywords: {', '.join(ci_data.get('keywords', []))}
=== END ===

Return a single JSON object with exactly these fields:

{{
  "keyword_clusters": [
    {{"cluster_name": "<theme name>", "keywords": ["<kw1>", "<kw2>", "<kw3>"]}}
  ],
  "content_topics": [
    {{"title": "<content/blog title>", "angle": "<brief description of the hook or angle>"}}
  ],
  "target_segments": [
    {{"segment": "<segment name>", "pain_point": "<key problem this company solves for them>", "message": "<positioning message>"}}
  ],
  "top_competitors": [
    {{"name": "<competitor name>", "differentiator": "<how this company differs from them>", "scale": "<Startup|Mid-size|Enterprise>"}}
  ]
}}

Requirements:
- keyword_clusters: 3–5 clusters, each with 3–6 keywords. Group by theme (e.g. "Automation", "Integration").
- content_topics: 5–8 realistic blog/content ideas tailored to this company's ICP and services.
- target_segments: 3–5 segments drawn from the ICP, each with a pain point and a positioning message.
- top_competitors: 3–5 REALISTIC direct competitors. Each competitor MUST have:
  {{
    "name": "<competitor name>",
    "differentiator": "<how this company differs from them>",
    "scale": "<Startup|Mid-size|Enterprise>"
  }}
  Scale definitions: Startup = <50 employees, Mid-size = 50–500, Enterprise = 500+.
  Constraints:
  (a) EXACT same industry vertical — not generic IT, cloud, or consulting firms.
  (b) Directly overlapping product/service.
  (c) Similar ICP — same buyer type and company size.
  (d) "scale" MUST be one of: "Startup", "Mid-size", "Enterprise".
  (e) Be real and verifiable — prefer niche, domain-specific vendors.
  If fewer than 3 realistic competitors can be identified, list only those that qualify.
- Base all output on the provided data. Do not hallucinate facts not present.
- Return only valid JSON with no markdown fences or extra commentary.
"""

    client = _get_bedrock_client()

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}],
    })

    logger.info(f"Invoking Bedrock for Market Intelligence: {BEDROCK_MODEL_ID}")
    response = client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )

    response_body = json.loads(response["body"].read())
    raw = response_body["content"][0]["text"]
    result = _parse_llm_json(raw)
    result["market_strategy"] = generate_market_strategy(
        ci_data, target_segments=result.get("target_segments")
    )

    # ── Scale-classify and re-rank competitors ────────────────────────────────
    # 1. Detect this company's own scale from CI
    company_scale_result = classify_company_scale_from_ci(ci_data)
    company_scale        = company_scale_result["scale"]

    # 2. Enrich each competitor with a scale classification
    raw_competitors = result.get("top_competitors", [])
    enriched_competitors = enrich_competitors_with_scale(raw_competitors)

    # 3. Filter to same/adjacent scale (keeps ≥2 competitors as safety floor)
    filtered_competitors = filter_competitors_by_scale(enriched_competitors, company_scale)

    # 4. Re-rank by ICP + service + scale relevance
    ranked_competitors = rank_competitors(
        filtered_competitors,
        company_scale=company_scale,
        ci_icp=ci_data.get("icp", []),
        ci_services=ci_data.get("services", []),
    )

    result["top_competitors"]  = ranked_competitors
    result["company_scale"]    = company_scale
    result["company_scale_confidence"] = company_scale_result["confidence"]

    return result
