"""
13-section B2B AI Growth Strategy Report generator.

Execution model:
  Wave 1 — 5 independent sections in parallel  (market sizing, company overview,
            market insights, competitive intel, investment triggers)
  Wave 2 — 5 sections using Wave 1 context     (customer geography, ICP,
            market intelligence, executive strategy, competition strategy)
  Wave 3 — 2 sections using Wave 2 context     (expansion strategy, sales strategy)

All sections read from cached CI + MI data only — no re-scraping.

Public API
----------
start_report_job(ci_data, mi_data, email) -> job_id
get_job(job_id)                           -> job dict | None
register_email(job_id, email)             -> bool
"""

import json
import logging
import os
import re
import smtplib
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import anthropic

logger = logging.getLogger(__name__)

_ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL_ID", "claude-sonnet-4-6")

_SYSTEM = (
    "You are a senior B2B growth strategist. "
    "Produce concise, structured JSON report sections. "
    "Work ONLY from the company and market data provided. "
    "Return ONLY valid JSON — no markdown fences, no prose outside the JSON."
)

# ── In-memory job registry ─────────────────────────────────────────────────────
_jobs: dict[str, dict] = {}


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def register_email(job_id: str, email: str) -> bool:
    """Register an email for an existing job. Returns False if job not found."""
    job = _jobs.get(job_id)
    if not job:
        return False
    job["email"] = email
    # If already done, send immediately
    if job.get("status") == "done" and job.get("result"):
        ci = job.get("ci_data", {})
        threading.Thread(
            target=_send_report_email,
            args=(email, job["result"], ci),
            daemon=True,
        ).start()
    return True


# ── LLM helper ────────────────────────────────────────────────────────────────

def _call_llm(prompt: str, max_tokens: int = 1500) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set.")
    client = anthropic.Anthropic(api_key=api_key)
    t0 = time.time()
    msg = client.messages.create(
        model=_ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        temperature=0.2,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text
    logger.info("[REPORT] LLM call %.1fs %d chars", time.time() - t0, len(raw))
    return raw


def _parse(text: str) -> dict | list:
    """Extract and parse the first valid JSON object or array from LLM output."""
    m = re.search(r'```(?:json)?\s*([\[\{].*?[\]\}])\s*```', text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    # Balanced-brace walk for object
    stack, start = [], None
    for i, ch in enumerate(text):
        if ch == "{":
            if start is None:
                start = i
            stack.append("{")
        elif ch == "}" and stack:
            stack.pop()
            if not stack:
                return json.loads(text[start: i + 1])
    # Balanced-bracket walk for array
    stack, start = [], None
    for i, ch in enumerate(text):
        if ch == "[":
            if start is None:
                start = i
            stack.append("[")
        elif ch == "]" and stack:
            stack.pop()
            if not stack:
                return json.loads(text[start: i + 1])
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


def _safe(section_key: str, fn, *args) -> dict:
    try:
        result = fn(*args)
        logger.info("[REPORT] Section '%s' OK", section_key)
        return result
    except Exception as e:
        logger.warning("[REPORT] Section '%s' failed: %s", section_key, e)
        return {"_error": str(e), "_section": section_key}


def _wave(tasks: dict, *args) -> dict:
    """Run {key: fn} in parallel threads, return {key: result}."""
    results = {}
    n = min(len(tasks), 5)
    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = {pool.submit(_safe, key, fn, *args): key for key, fn in tasks.items()}
        for future in as_completed(futures):
            key = futures[future]
            results[key] = future.result()
    return results


# ── Section 1: Market Sizing ──────────────────────────────────────────────────

def _s1_market_sizing(ci: dict, mi: dict, _ctx: dict) -> dict:
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Services: {', '.join(ci.get('services') or [])}
ICP: {', '.join(ci.get('icp') or [])}

Generate a detailed market sizing section.

Return JSON:
{{
  "disclaimer": "<1-sentence market estimation disclaimer>",
  "india": {{
    "tam": {{"value": "<$X B>", "volume": "<N companies>", "basis": "<top-down|bottom-up>"}},
    "sam": {{"value": "<$X M>", "volume": "<N companies>", "basis": "<method>"}},
    "som": {{"value": "<$X M>", "volume": "<N companies>", "basis": "<method>"}}
  }},
  "us": {{
    "tam": {{"value": "<$X B>", "volume": "<N companies>", "basis": "<method>"}},
    "sam": {{"value": "<$X M>", "volume": "<N companies>", "basis": "<method>"}},
    "som": {{"value": "<$X M>", "volume": "<N companies>", "basis": "<method>"}}
  }},
  "industry_breakdown": [
    {{"industry": "<name>", "market_value": "<$X B>", "growth_rate": "<X% CAGR>", "key_driver": "<1 line>"}}
  ],
  "key_insight": "<2-3 sentence market opportunity summary>"
}}

industry_breakdown: 4 items — Retail, Insurance, Banking, Hospitality (or closest industry equivalents).
All monetary values: short format ($2.4B). All estimates must be realistic.
"""
    return _parse(_call_llm(prompt, 1200))


# ── Section 2: Company Overview + Brand Positioning ──────────────────────────

def _s2_company_overview(ci: dict, mi: dict, _ctx: dict) -> dict:
    competitors = (mi or {}).get("top_competitors", [])[:3]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Summary: {ci.get('company_summary', '')}
Services: {', '.join(ci.get('services') or [])}
ICP: {', '.join(ci.get('icp') or [])}
Location: {ci.get('company_location', '')}
Top competitors: {json.dumps(competitors, ensure_ascii=False)}

Generate the company overview and brand positioning section.

Return JSON:
{{
  "overview": "<2-3 sentence factual company description>",
  "value_proposition": "<1-2 sentence core value proposition>",
  "differentiation": ["<diff 1>", "<diff 2>", "<diff 3>"],
  "usp": {{
    "india": "<India-specific USP in 1 sentence>",
    "us": "<US-specific USP in 1 sentence>"
  }},
  "brand_positioning": {{
    "statement": "<1 sentence positioning statement>",
    "tone": "<e.g. authoritative, approachable, technical>",
    "competitive_moat": "<key defensible advantage in 1 line>"
  }},
  "service_portfolio": [
    {{"name": "<service name>", "description": "<1 line>", "target_buyer": "<role>"}}
  ]
}}

service_portfolio: list all services (max 6). Keep each description to 1 line.
"""
    return _parse(_call_llm(prompt, 1200))


# ── Section 3: Customer Geography ────────────────────────────────────────────

def _s3_customer_geography(ci: dict, mi: dict, ctx: dict) -> dict:
    ms = ctx.get("market_sizing", {})
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
ICP: {', '.join(ci.get('icp') or [])}
India TAM: {ms.get('india', {}).get('tam', {}).get('value', 'N/A')}
India SAM: {ms.get('india', {}).get('sam', {}).get('value', 'N/A')}
US TAM: {ms.get('us', {}).get('tam', {}).get('value', 'N/A')}
US SAM: {ms.get('us', {}).get('sam', {}).get('value', 'N/A')}

Generate the customer geography section.

Return JSON:
{{
  "primary_markets": [
    {{
      "country": "India",
      "tam": "<$X>", "sam": "<$X>", "som": "<$X>",
      "focus_cities": ["<city1>", "<city2>", "<city3>"],
      "key_industries": ["<ind1>", "<ind2>"],
      "entry_rationale": "<1-2 sentence>"
    }},
    {{
      "country": "United States",
      "tam": "<$X>", "sam": "<$X>", "som": "<$X>",
      "focus_states": ["<state1>", "<state2>", "<state3>"],
      "key_industries": ["<ind1>", "<ind2>"],
      "entry_rationale": "<1-2 sentence>"
    }}
  ],
  "geo_focus_summary": "<2-3 sentence geographic strategy aligned to brand positioning>",
  "expansion_sequence": [
    {{"phase": 1, "market": "<market>", "timeline": "Now–6mo", "rationale": "<1 line>"}},
    {{"phase": 2, "market": "<market>", "timeline": "6–12mo",  "rationale": "<1 line>"}},
    {{"phase": 3, "market": "<market>", "timeline": "12–24mo", "rationale": "<1 line>"}}
  ]
}}
"""
    return _parse(_call_llm(prompt, 1000))


# ── Section 4: Market Insights ────────────────────────────────────────────────

def _s4_market_insights(ci: dict, mi: dict, _ctx: dict) -> dict:
    topics = (mi or {}).get("content_topics", [])[:3]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
ICP: {', '.join(ci.get('icp') or [])}
Known content topics: {json.dumps(topics, ensure_ascii=False)}

Generate 4 key market insights for a B2B AI Growth Strategy Report.

Return JSON:
{{
  "insights": [
    {{
      "title": "<short insight title>",
      "body": "<2-3 sentence industry-specific insight>",
      "geo": "<India|US|Global>",
      "implication": "<1-sentence strategic implication for the company>"
    }}
  ]
}}

All 4 insights must be industry-specific and geo-aware. Mix India and US perspectives.
"""
    return _parse(_call_llm(prompt, 900))


# ── Section 5: ICP ────────────────────────────────────────────────────────────

def _s5_icp(ci: dict, mi: dict, ctx: dict) -> dict:
    co = ctx.get("company_overview", {})
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Services: {', '.join(ci.get('services') or [])}
Value proposition: {co.get('value_proposition', '')}
ICP signals: {', '.join(ci.get('icp') or [])}

Generate the Ideal Customer Profile section.

Return JSON:
{{
  "profiles": [
    {{
      "id": 1,
      "segment": "<segment name>",
      "company_size": "<e.g. 200–1000 employees>",
      "revenue_band": "<e.g. $10M–$100M ARR>",
      "industry": "<primary industry>",
      "geographies": ["India", "US"],
      "decision_makers": [
        {{"title": "<CXO/VP title>", "pain": "<specific pain point in 1 line>"}}
      ],
      "pain_points": ["<pain 1>", "<pain 2>", "<pain 3>", "<pain 4>", "<pain 5>"]
    }}
  ],
  "company_size_table": [
    {{"size": "SMB",        "employees": "<range>", "revenue": "<range>", "fit": "<High|Medium|Low>", "rationale": "<1 line>"}},
    {{"size": "Mid-Market", "employees": "<range>", "revenue": "<range>", "fit": "<High|Medium|Low>", "rationale": "<1 line>"}},
    {{"size": "Enterprise", "employees": "<range>", "revenue": "<range>", "fit": "<High|Medium|Low>", "rationale": "<1 line>"}}
  ],
  "buying_committee": [
    {{"role": "<title>", "influence": "<Champion|Economic Buyer|Technical Buyer|Blocker>", "key_message": "<1 line>"}}
  ]
}}

profiles: 3 numbered ideal customer profiles. Each must have exactly 5 pain points — business problems only, no buying signals.
decision_makers: 2 per profile. buying_committee: 4 roles.
"""
    return _parse(_call_llm(prompt, 1600))


# ── Section 6: Market Intelligence (SEO / AEO / GEO) ─────────────────────────

def _s6_market_intelligence(ci: dict, mi: dict, ctx: dict) -> dict:
    insights = ctx.get("market_insights", {}).get("insights", [])
    clusters = (mi or {}).get("keyword_clusters", [])[:3]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Keywords: {', '.join(ci.get('keywords') or [])}
Existing clusters: {json.dumps(clusters, ensure_ascii=False)}
Market insights: {json.dumps(insights[:2], ensure_ascii=False)}

Generate the Market Intelligence section covering SEO, AEO, and GEO clusters.

Return JSON:
{{
  "seo_clusters": [
    {{
      "cluster_name": "<name>",
      "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>"],
      "industry": "<industry>",
      "country": "<India|US|Both>",
      "search_intent": "<informational|commercial|transactional>"
    }}
  ],
  "aeo_questions": [
    {{"question": "<featured-snippet style question>", "answer_angle": "<1-line angle>", "geo": "<India|US>"}}
  ],
  "geo_terms": [
    {{"term": "<location-based search term>", "volume_signal": "<high|medium|low>", "country": "<India|US>"}}
  ],
  "content_topics": [
    {{"title": "<specific blog/article title>", "cluster": "<cluster name>", "angle": "<1-sentence hook>", "format": "<blog|case study|whitepaper|video>"}}
  ]
}}

seo_clusters: 3 (mix India and US, industry-specific).
aeo_questions: 4. geo_terms: 4. content_topics: 5 aligned to clusters.
"""
    return _parse(_call_llm(prompt, 1200))


# ── Section 7: Competitive Intelligence ──────────────────────────────────────

def _s7_competitive_intelligence(ci: dict, mi: dict, _ctx: dict) -> dict:
    existing = (mi or {}).get("top_competitors", [])[:5]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Services: {', '.join(ci.get('services') or [])}
Known competitors: {json.dumps(existing, ensure_ascii=False)}

Generate detailed competitive intelligence.

Return JSON:
{{
  "competitors": [
    {{
      "name": "<competitor name>",
      "industry_focus": "<their primary industry>",
      "tech_maturity": "<1–5 score> — <1-line rationale>",
      "ai_capability": "<basic|intermediate|advanced>",
      "pricing_model": "<subscription|usage-based|enterprise license>",
      "pros": ["<pro 1>", "<pro 2>"],
      "cons": ["<con 1>", "<con 2>"],
      "recent_signal": "<news-style: funding/product/expansion event in past 6 months>",
      "threat_level": "<high|medium|low>"
    }}
  ],
  "competitive_summary": "<2-3 sentence competitive landscape overview>",
  "our_advantage": "<2-3 sentence summary of the company's competitive edge>"
}}

competitors: exactly 5 real, verifiable companies in the same industry.
Each must have a realistic recent_signal (not generic).
"""
    return _parse(_call_llm(prompt, 1600))


# ── Section 8: Executive Strategy ────────────────────────────────────────────

def _s8_executive_strategy(ci: dict, mi: dict, ctx: dict) -> dict:
    ms  = ctx.get("market_sizing", {})
    co  = ctx.get("company_overview", {})
    ci_ = ctx.get("competitive_intelligence", {})
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Services: {', '.join(ci.get('services') or [])}
Value proposition: {co.get('value_proposition', '')}
Competitive moat: {co.get('brand_positioning', {}).get('competitive_moat', '')}
India TAM: {ms.get('india', {}).get('tam', {}).get('value', 'N/A')}
US TAM: {ms.get('us', {}).get('tam', {}).get('value', 'N/A')}
Competitive landscape: {ci_.get('competitive_summary', '')}
Our advantage: {ci_.get('our_advantage', '')}

Generate the Executive Strategy section (C-suite level summary).

Return JSON:
{{
  "executive_summary": "<3-4 sentence C-suite level summary of market opportunity and strategy>",
  "top_recommendations": [
    {{"rank": 1, "recommendation": "<specific action>", "rationale": "<1-2 lines>", "timeline": "<immediate|6-12mo|12-24mo>", "impact": "<High|Medium>"}},
    {{"rank": 2, "recommendation": "<specific action>", "rationale": "<1-2 lines>", "timeline": "<immediate|6-12mo|12-24mo>", "impact": "<High|Medium>"}},
    {{"rank": 3, "recommendation": "<specific action>", "rationale": "<1-2 lines>", "timeline": "<immediate|6-12mo|12-24mo>", "impact": "<High|Medium>"}}
  ],
  "competitive_imperatives": [
    {{"imperative": "<must-win battleground>", "why_critical": "<1-2 lines>", "kpi": "<measurable KPI>"}},
    {{"imperative": "<must-win battleground>", "why_critical": "<1-2 lines>", "kpi": "<measurable KPI>"}},
    {{"imperative": "<must-win battleground>", "why_critical": "<1-2 lines>", "kpi": "<measurable KPI>"}}
  ]
}}
"""
    return _parse(_call_llm(prompt, 1000))


# ── Section 9: Market Expansion Strategy ─────────────────────────────────────

def _s9_expansion_strategy(ci: dict, mi: dict, ctx: dict) -> dict:
    geo = ctx.get("customer_geography", {})
    icp = ctx.get("icp", {})
    profiles = (icp.get("profiles") or [])[:2]
    markets  = (geo.get("primary_markets") or [])
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
ICP profiles: {json.dumps(profiles, ensure_ascii=False)[:600]}
Primary markets: {json.dumps(markets, ensure_ascii=False)[:600]}

Generate the Market Expansion Strategy section based on Product-Market Fit analysis.

Return JSON:
{{
  "pmf_analysis": [
    {{"market": "India",  "pmf_stage": "<validation|early-traction|scaling|mature>", "evidence": "<1-2 sentence PMF evidence>", "readiness_score": "<1-10>"}},
    {{"market": "US",     "pmf_stage": "<validation|early-traction|scaling|mature>", "evidence": "<1-2 sentence PMF evidence>", "readiness_score": "<1-10>"}},
    {{"market": "Canada", "pmf_stage": "<validation|early-traction|scaling|mature>", "evidence": "<1-2 sentence PMF evidence>", "readiness_score": "<1-10>"}}
  ],
  "expansion_plan": [
    {{
      "market": "<market>", "phase": "<Phase 1|2|3>", "timeline": "<e.g. Now–6mo>",
      "entry_strategy": "<1-2 sentence>", "target_segment": "<segment>",
      "success_metric": "<measurable metric>"
    }}
  ],
  "gtm_priorities": ["<priority 1>", "<priority 2>", "<priority 3>"],
  "risks": [
    {{"market": "<market>", "risk": "<risk>", "mitigation": "<1 line>"}}
  ]
}}

expansion_plan: 3 phases. risks: one per market (3 total).
"""
    return _parse(_call_llm(prompt, 1100))


# ── Section 10: Sales Strategy ────────────────────────────────────────────────

def _s10_sales_strategy(ci: dict, mi: dict, ctx: dict) -> dict:
    icp  = ctx.get("icp", {})
    ci_  = ctx.get("competitive_intelligence", {})
    profiles = (icp.get("profiles") or [])[:3]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
ICP profiles: {json.dumps(profiles, ensure_ascii=False)[:600]}
Competitive summary: {ci_.get('competitive_summary', '')}

Generate the Sales Strategy section.

Return JSON:
{{
  "sales_cycle_matrix": [
    {{
      "industry": "<industry>", "country": "<India|US>",
      "avg_cycle_days": "<N days>", "avg_deal_size": "<$X>",
      "key_stakeholders": ["<role1>", "<role2>"], "priority": "<P1|P2|P3>"
    }}
  ],
  "deal_size_analysis": {{
    "smb":        {{"range": "<$X–$Y>", "avg_cycle": "<N days>", "volume_potential": "<high|medium|low>"}},
    "mid_market": {{"range": "<$X–$Y>", "avg_cycle": "<N days>", "volume_potential": "<high|medium|low>"}},
    "enterprise": {{"range": "<$X–$Y>", "avg_cycle": "<N days>", "volume_potential": "<high|medium|low>"}}
  }},
  "priority_criteria": [
    {{"criterion": "<criterion>", "weight": "<High|Medium|Low>", "rationale": "<1 line>"}}
  ],
  "sales_plays": [
    {{"play": "<play name>", "target": "<segment>", "approach": "<1-2 lines>"}}
  ]
}}

sales_cycle_matrix: 4 rows (mix India/US, mix industries).
priority_criteria: 5 items — lead with deal size and cycle length.
sales_plays: 3 plays.
"""
    return _parse(_call_llm(prompt, 1200))


# ── Section 11: Competition Strategy ─────────────────────────────────────────

def _s11_competition_strategy(ci: dict, mi: dict, ctx: dict) -> dict:
    ci_ = ctx.get("competitive_intelligence", {})
    competitors = (ci_.get("competitors") or [])[:5]
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
Our advantage: {ci_.get('our_advantage', '')}
Competitors: {json.dumps(competitors, ensure_ascii=False)[:800]}

Generate the Competition Strategy section.

Return JSON:
{{
  "investment_areas": {{
    "brand_awareness":   {{"priority": "<High|Medium|Low>", "tactics": ["<t1>", "<t2>"], "budget_split": "<X%>"}},
    "thought_leadership":{{"priority": "<High|Medium|Low>", "tactics": ["<t1>", "<t2>"], "budget_split": "<X%>"}},
    "head_to_head":      {{"priority": "<High|Medium|Low>", "tactics": ["<t1>", "<t2>"], "budget_split": "<X%>"}},
    "expansion":         {{"priority": "<High|Medium|Low>", "tactics": ["<t1>", "<t2>"], "budget_split": "<X%>"}}
  }},
  "takeout_strategy": [
    {{
      "competitor": "<name>",
      "displacement_tactic": "<1-2 sentence actionable play>",
      "win_condition": "<1 line>",
      "timeline": "<quick-win|6-12mo|12-18mo>"
    }}
  ],
  "moat_builders": ["<capability 1>", "<capability 2>", "<capability 3>"]
}}

takeout_strategy: one entry per competitor (all 5).
budget_split across 4 areas must sum to 100%.
"""
    return _parse(_call_llm(prompt, 1200))


# ── Section 12: Investment Triggers ──────────────────────────────────────────

def _s12_investment_triggers(ci: dict, mi: dict, _ctx: dict) -> dict:
    prompt = f"""
Company: {ci.get('company_name', 'Unknown')}
Industry: {ci.get('industry', 'Unknown')}
ICP: {', '.join(ci.get('icp') or [])}
Services: {', '.join(ci.get('services') or [])}

Generate 10 investment triggers for a B2B AI Growth Strategy Report.

Return JSON:
{{
  "triggers": [
    {{
      "id": 1,
      "category": "<Funding|Technology Upgrade|Data Infrastructure|Market Shift|Regulation>",
      "trigger": "<specific observable event or signal>",
      "what_it_means": "<1-2 line interpretation for a sales team>",
      "recommended_action": "<1-2 line response>",
      "urgency": "<immediate|watch|monitor>"
    }}
  ]
}}

Exactly 10 triggers. Mix: 2–3 Funding, 2–3 Technology Upgrade, 2 Data Infrastructure,
1–2 Regulation, 1 Market Shift. Make them specific and actionable, not generic.
"""
    return _parse(_call_llm(prompt, 1300))


# ── Report orchestrator ───────────────────────────────────────────────────────

def _run_full_report(job_id: str, ci: dict, mi: dict | None):
    m = mi or {}
    _jobs[job_id]["status"] = "generating"

    try:
        # Wave 1 — 5 independent sections ─────────────────────────────────────
        logger.info("[REPORT %s] Wave 1 start", job_id)
        w1 = _wave(
            {
                "market_sizing":            _s1_market_sizing,
                "company_overview":         _s2_company_overview,
                "market_insights":          _s4_market_insights,
                "competitive_intelligence": _s7_competitive_intelligence,
                "investment_triggers":      _s12_investment_triggers,
            },
            ci, m, {},
        )
        _jobs[job_id]["progress"] = 35
        logger.info("[REPORT %s] Wave 1 done", job_id)

        # Wave 2 — 5 sections using Wave 1 context ────────────────────────────
        logger.info("[REPORT %s] Wave 2 start", job_id)
        w2 = _wave(
            {
                "customer_geography":   _s3_customer_geography,
                "icp":                  _s5_icp,
                "market_intelligence":  _s6_market_intelligence,
                "executive_strategy":   _s8_executive_strategy,
                "competition_strategy": _s11_competition_strategy,
            },
            ci, m, w1,
        )
        _jobs[job_id]["progress"] = 70
        logger.info("[REPORT %s] Wave 2 done", job_id)

        # Wave 3 — 2 sections using Wave 2 context ────────────────────────────
        logger.info("[REPORT %s] Wave 3 start", job_id)
        w3 = _wave(
            {
                "expansion_strategy": _s9_expansion_strategy,
                "sales_strategy":     _s10_sales_strategy,
            },
            ci, m, {**w1, **w2},
        )
        _jobs[job_id]["progress"] = 100
        logger.info("[REPORT %s] Wave 3 done", job_id)

        # Combine in presentation order ────────────────────────────────────────
        report = {
            "market_sizing":            w1["market_sizing"],
            "company_overview":         w1["company_overview"],
            "customer_geography":       w2["customer_geography"],
            "market_insights":          w1["market_insights"],
            "icp":                      w2["icp"],
            "market_intelligence":      w2["market_intelligence"],
            "competitive_intelligence": w1["competitive_intelligence"],
            "executive_strategy":       w2["executive_strategy"],
            "expansion_strategy":       w3["expansion_strategy"],
            "sales_strategy":           w3["sales_strategy"],
            "competition_strategy":     w2["competition_strategy"],
            "investment_triggers":      w1["investment_triggers"],
            "_meta": {
                "company":      ci.get("company_name", "Unknown"),
                "industry":     ci.get("industry", "Unknown"),
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "model":        _ANTHROPIC_MODEL,
            },
        }

        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = report

        # Send email if registered
        email = _jobs[job_id].get("email")
        if email:
            _send_report_email(email, report, ci)

    except Exception:
        logger.exception("[REPORT %s] Fatal error", job_id)
        _jobs[job_id]["status"] = "error"
        import traceback
        _jobs[job_id]["error"] = traceback.format_exc()


def start_report_job(ci: dict, mi: dict | None, email: str | None = None) -> str:
    """Create a job, start background thread, return job_id."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status":     "queued",
        "progress":   0,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "email":      email,
        "result":     None,
        "error":      None,
        "ci_data":    ci,
    }
    t = threading.Thread(
        target=_run_full_report,
        args=(job_id, ci, mi),
        daemon=True,
    )
    t.start()
    return job_id


# ── Email ──────────────────────────────────────────────────────────────────────

def _send_report_email(to_email: str, report: dict, ci: dict):
    host     = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
    port     = int(os.environ.get("EMAIL_PORT", "587"))
    user     = os.environ.get("EMAIL_USER", "")
    password = os.environ.get("EMAIL_PASS", "")

    if not user or not password:
        logger.warning("[REPORT] Email not configured — skipping")
        return

    meta    = report.get("_meta", {})
    company = meta.get("company", "Your Company")
    n_done  = sum(1 for k, v in report.items() if not k.startswith("_") and not isinstance(v, dict) is False and not v.get("_error"))

    body = f"""
<h2>AI Growth Strategy Report — {company}</h2>
<p>Your report has been generated successfully.</p>
<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Company</td><td>{company}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Industry</td><td>{meta.get('industry','N/A')}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Generated</td><td>{meta.get('generated_at','N/A')}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Sections</td><td>{n_done} of 12 completed</td></tr>
</table>
<br>
<p>Log in to <strong>AI Growth Strategist</strong> to view the full interactive report and download the PDF.</p>
"""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = user
        msg["To"]      = to_email
        msg["Subject"] = f"Your AI Growth Strategy Report is ready — {company}"
        msg.attach(MIMEText(body, "html", "utf-8"))
        with smtplib.SMTP(host, port) as srv:
            srv.ehlo(); srv.starttls(); srv.login(user, password)
            srv.send_message(msg)
        logger.info("[REPORT] Email sent to %s", to_email)
    except Exception as e:
        logger.error("[REPORT] Email send failed: %s", e)
