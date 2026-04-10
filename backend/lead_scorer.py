"""
lead_scorer.py — Use-case + Role driven lead scoring.

Weight breakdown (max 100 pts per lead):
  Role Match      → up to 40 pts  ← PRIMARY GATE: what function does this person own?
  Use-case Match  → up to 40 pts  ← PRIMARY GATE: do CI keywords appear in their context?
  Industry Match  → up to 20 pts  ← WEAK tiebreaker only
  Geography       → up to  5 pts  ← optional signal

Design rules:
  - Industry NEVER dominates. Even a perfect industry match cannot compensate for
    a weak role or use-case signal.
  - "Distribution Head" at an insurance company scores LOW even if industry = perfect match.
  - "VP Customer Experience" at a wrong-industry company can still be High Fit if
    use-case keywords align (they are the buyer persona for engagement platforms).

Filter rule (applied after percentile bucketing):
  If role_score < ROLE_MIN or usecase_score < USECASE_MIN →
    demote "High Fit" → "Medium Fit" only (not all the way to Low).
  This keeps the percentile distribution healthy while ensuring High Fit
  is reserved for leads with both strong role AND strong use-case alignment.
  Medium Fit and Low Fit assignments from percentile bucketing are kept as-is.

Fit tags (percentile buckets across all leads):
  Top 20 %   → High Fit   (further gated: must pass role + use-case thresholds)
  Next 50 %  → Medium Fit
  Bottom 30% → Low Fit
"""

import re
from typing import Optional


# ── Filter thresholds ─────────────────────────────────────────────────────────
# These gate "High Fit" only — leads below threshold are demoted to Medium Fit,
# not to Low Fit. Low Fit is determined purely by the percentile bucket (bottom 30%).
# Keep these low enough that the majority of leads can still reach Medium Fit.

ROLE_MIN    = 10   # role_score < 10 → cannot be High Fit (demoted to Medium)
USECASE_MIN = 10   # usecase_score < 10 → cannot be High Fit (demoted to Medium)

# ── Role tier signals ─────────────────────────────────────────────────────────
# HIGH = people who OWN customer-facing technology decisions (buyers/champions)
# Match these first; exit on first hit.

_ROLE_HIGH_PHRASES = [
    # Customer experience / success
    "customer experience", "cx director", "cx head", "cx vp", "cx manager",
    "customer success", "client success", "client experience",
    "customer engagement", "customer relations", "customer journey",
    "customer retention", "customer lifecycle", "client relations",
    # Marketing / growth
    "marketing director", "marketing head", "marketing vp", "chief marketing",
    "growth director", "growth head", "growth vp", "growth marketing",
    "demand generation", "demand gen", "digital marketing",
    "brand head", "brand director", "brand vp",
    # Product
    "product director", "product head", "product vp", "chief product",
    "product management", "product strategy",
    # Digital / innovation / transformation
    "digital transformation", "digital innovation", "digitalization",
    "chief digital", "digital officer",
    "innovation head", "head of innovation", "innovation director",
    "transformation head", "transformation director",
    # CX-adjacent technology
    "omnichannel", "user experience", "ux director", "ux head",
    "e-commerce head", "ecommerce head",
    "loyalty head", "loyalty program",
    # Specific abbreviations (word-boundary safe via phrase matching)
    "cmo", "cpo", "chief experience", "chief customer",
]

_ROLE_HIGH_KEYWORDS = [
    # Catch any remaining CX/marketing/product/digital role not covered by phrases
    "marketing",     # marketing manager, vp of marketing, etc.
    "growth",        # growth hacker, growth lead, etc.
    "product manager",
    "digital",       # digital head, head of digital
    "customer success",
    "cx",            # short form — matched as token
    "innovation",
    "transformation",
    "ecommerce",
    "e-commerce",
    "loyalty",
    "retention",
    "engagement",    # "customer engagement manager"
    "personalization",
    "omnichannel",
]

_ROLE_MEDIUM_PHRASES = [
    "sales director", "sales head", "sales vp", "chief sales",
    "business development", "bd director", "bd head",
    "commercial director", "commercial head",
    "revenue director", "revenue head",
    "pre-sales", "presales", "solutioning",
    "key account", "account management", "account director",
    "partnership director", "alliance head",
    "channel head", "channel director",
]

_ROLE_MEDIUM_KEYWORDS = [
    "sales",
    "business development",
    "commercial",
    "revenue",
    "account",
    "partnership",
    "alliances",
    "presales",
]

_ROLE_LOW_KEYWORDS = [
    "distribution",          # distribution head — rarely buys engagement tech
    "agency distribution",
    "actuarial",
    "underwriting",
    "claims adjuster",
    "compliance",
    "risk management",
    "audit",
    "legal",
    "secretarial",
    "procurement",
    "supply chain",
    "logistics",
    "treasury",
    "taxation",
    "payroll",
    "recruitment",
    "talent acquisition",
]

# Seniority — used as modifier (+bonus pts) on top of role tier base
_SENIOR_TOP  = {"chief", "ceo", "cto", "coo", "cfo", "cmo", "cpo", "ciso",
                "president", "founder", "co-founder", "cofounder",
                "managing director", "executive director",
                "vice president", "svp", "evp"}

_SENIOR_HIGH = {"director", "head", "vp", "avp", "principal", "fellow",
                "group head", "global head", "chief manager"}

_SENIOR_MID  = {"manager", "lead", "senior manager", "associate director",
                "senior lead", "team lead", "deputy manager", "senior", "specialist"}


# ── Universal use-case keywords ───────────────────────────────────────────────
# These represent buyer contexts for customer engagement / communication
# platforms broadly. They supplement (not replace) CI-specific keywords.

_USECASE_UNIVERSAL = frozenset([
    "customer engagement", "omnichannel", "omni channel",
    "crm", "marketing automation", "customer support",
    "conversational ai", "digital communication", "customer experience",
    "customer success platform", "contact center", "help desk",
    "chatbot", "whatsapp business", "messaging platform",
    "campaign management", "email marketing", "push notification",
    "customer data platform", "cdp", "personalization engine",
    "customer lifecycle", "engagement platform",
    "digital customer", "customer journey",
])


# ── Industry adjacency (for the weak industry component) ─────────────────────

_ADJACENT_INDUSTRIES: dict[str, set] = {
    "insurance": {
        "insurtech", "reinsurance", "bancassurance", "takaful",
        "life insurance", "general insurance", "health insurance",
        "actuarial", "underwriting",
    },
    "banking": {"bank", "retail banking", "commercial banking", "neobank"},
    "fintech": {
        "financial technology", "payments", "lending", "nbfc",
        "wealth management", "wealthtech", "paytech", "insurtech",
    },
    "healthcare": {"health", "hospital", "pharma", "medtech", "clinical"},
    "saas": {"software", "cloud", "platform", "tech", "technology"},
    "ecommerce": {"e-commerce", "retail", "marketplace", "d2c"},
}

_FINANCIAL_UMBRELLA = {"financial services", "financial technology", "fintech", "nbfc"}


# ── Text helpers ──────────────────────────────────────────────────────────────

def _tokens(text: str) -> set:
    return set(re.findall(r'\b[a-z]{3,}\b', text.lower()))


def _fuzzy_match(phrase: str, haystack: str) -> bool:
    phrase_lower   = phrase.lower().strip()
    haystack_lower = haystack.lower()
    if phrase_lower in haystack_lower:
        return True
    words = [w for w in phrase_lower.split() if len(w) >= 4]
    if words and all(w in haystack_lower for w in words):
        return True
    for w in words:
        if w[:5] in haystack_lower:
            return True
    return False


def _kw_fuzzy(kw: str, haystack: str) -> bool:
    kw_lower = kw.lower().strip()
    if not kw_lower or len(kw_lower) < 3:
        return False
    if kw_lower in haystack:
        return True
    if len(kw_lower) >= 5 and kw_lower[:5] in haystack:
        return True
    return False


def _detect_seniority(title: str) -> tuple[str, int]:
    """
    Detect seniority tier from title.
    Returns (tier_name, bonus_pts): TOP=+10, HIGH=+5, MID=+0, ENTRY=-3.
    """
    t = title.lower()
    for s in _SENIOR_TOP:
        if s in t:
            return "top", 10
    for s in _SENIOR_HIGH:
        if s in t:
            return "high", 5
    for s in _SENIOR_MID:
        if s in t:
            return "mid", 0
    return "entry", -3


# ── Component 1: Role Match (40 pts) ─────────────────────────────────────────

def _score_role_match(lead: dict) -> tuple[int, str]:
    """
    Role Match — max 40 pts.

    Algorithm:
      1. Detect functional area tier (HIGH=30, MEDIUM=15, LOW=3, UNKNOWN=10)
      2. Add seniority bonus (TOP=+10, HIGH=+5, MID=+0, ENTRY=-3)
      3. Clamp to [0, 40]

    HIGH tier: CX, Customer Success, Marketing, Growth, Product, Digital/Innovation
    MEDIUM:    Sales leadership, BizDev, Pre-sales
    LOW:       Distribution, Compliance, Finance, HR, Legal, Procurement

    Returns (score, reason_string).
    """
    title = (lead.get("title") or "").strip()
    if not title:
        return 10, "no title — neutral"

    title_lower = title.lower()

    # ── Determine functional area ──────────────────────────────────────────────

    # HIGH — check phrases first (more specific), then keywords
    for phrase in _ROLE_HIGH_PHRASES:
        if phrase in title_lower:
            tier_base, tier_name = 30, "HIGH"
            _, seniority_bonus = _detect_seniority(title)
            score = max(0, min(40, tier_base + seniority_bonus))
            print(f"ROLE SCORE: {score} | tier=HIGH phrase='{phrase}' | title='{title}'")
            return score, f"HIGH function ({phrase})"

    for kw in _ROLE_HIGH_KEYWORDS:
        if _kw_fuzzy(kw, title_lower):
            tier_base, tier_name = 30, "HIGH"
            _, seniority_bonus = _detect_seniority(title)
            score = max(0, min(40, tier_base + seniority_bonus))
            print(f"ROLE SCORE: {score} | tier=HIGH kw='{kw}' | title='{title}'")
            return score, f"HIGH function (kw: {kw})"

    # LOW — check before MEDIUM so "Distribution" doesn't get boosted
    for kw in _ROLE_LOW_KEYWORDS:
        if _kw_fuzzy(kw, title_lower):
            _, seniority_bonus = _detect_seniority(title)
            # Seniority bonus still applies (a C-suite Distribution head might still matter)
            score = max(0, min(15, 3 + max(0, seniority_bonus)))
            print(f"ROLE SCORE: {score} | tier=LOW kw='{kw}' | title='{title}'")
            return score, f"LOW function (kw: {kw})"

    # MEDIUM
    for phrase in _ROLE_MEDIUM_PHRASES:
        if phrase in title_lower:
            _, seniority_bonus = _detect_seniority(title)
            score = max(0, min(40, 15 + seniority_bonus))
            print(f"ROLE SCORE: {score} | tier=MEDIUM phrase='{phrase}' | title='{title}'")
            return score, f"MEDIUM function ({phrase})"

    for kw in _ROLE_MEDIUM_KEYWORDS:
        if _kw_fuzzy(kw, title_lower):
            _, seniority_bonus = _detect_seniority(title)
            score = max(0, min(40, 15 + seniority_bonus))
            print(f"ROLE SCORE: {score} | tier=MEDIUM kw='{kw}' | title='{title}'")
            return score, f"MEDIUM function (kw: {kw})"

    # UNKNOWN — seniority-only signal
    _, seniority_bonus = _detect_seniority(title)
    score = max(0, min(25, 10 + seniority_bonus))
    print(f"ROLE SCORE: {score} | tier=UNKNOWN | title='{title}'")
    return score, "unknown function — seniority only"


# ── Component 2: Use-case Match (40 pts) ─────────────────────────────────────

def _score_usecase_match(
    lead: dict,
    ci_keywords: list,
    usecase_extra: list,
) -> tuple[int, list]:
    """
    Use-case Match — max 40 pts.

    Keyword pool:
      - CI keywords (company's own marketing/SEO terms — most relevant)
      - Additional use-case terms from MI clusters or caller
      - _USECASE_UNIVERSAL (universal engagement platform terms — fallback)

    Match text:
      - Title (strongest signal — appears twice in combined text)
      - Company name (medium signal)
      - Industry (weak signal)

    Scoring:
      title_hits  × 10 pts each (capped after 3 hits)
      context_hits × 5 pts each (capped after 2 hits)
      → total capped at 40

    Returns (score, matched_keywords_list).
    """
    title    = (lead.get("title",    "") or "").lower()
    company  = (lead.get("company",  "") or "").lower()
    industry = (lead.get("industry", "") or "").lower()

    # Build deduped keyword pool
    all_kws_raw = (
        [str(k) for k in ci_keywords] +
        [str(k) for k in usecase_extra] +
        list(_USECASE_UNIVERSAL)
    )
    seen_kw, kw_pool = set(), []
    for kw in all_kws_raw:
        k = kw.lower().strip()
        if k and len(k) >= 3 and k not in seen_kw:
            seen_kw.add(k)
            kw_pool.append(k)

    if not kw_pool:
        return 15, []   # neutral when no context at all

    title_matched   = [kw for kw in kw_pool if _kw_fuzzy(kw, title)]
    context_matched = [kw for kw in kw_pool
                       if _kw_fuzzy(kw, company) or _kw_fuzzy(kw, industry)]
    # Remove overlaps from context_matched (already in title)
    context_matched = [kw for kw in context_matched if kw not in title_matched]

    title_pts   = min(30, len(title_matched)   * 10)
    context_pts = min(10, len(context_matched) * 5)
    total = min(40, title_pts + context_pts)

    all_matched = title_matched[:5] + context_matched[:3]
    print(f"USECASE SCORE: {total} | title_hits={len(title_matched)} context_hits={len(context_matched)} | matched={all_matched[:4]}")
    return total, all_matched[:5]


# ── Component 3: Industry Match (20 pts MAX) ──────────────────────────────────

def _score_industry(
    lead: dict,
    ci_industry: str,
    mi_segments: list,
) -> tuple[int, str]:
    """
    Industry Match — max 20 pts (WEAK tiebreaker only).

    Deliberately capped at 20 so that even a perfect industry match cannot
    compensate for missing role or use-case alignment.

    20 pts → primary industry keyword in lead's industry field
     8 pts → adjacent industry found
     0 pts → no match or empty
    """
    lead_industry = (lead.get("industry") or "").lower().strip()
    if not lead_industry:
        return 0, "no industry on lead"

    target_kws: set[str] = set()
    primary_domain = ci_industry.lower().strip() if ci_industry else ""
    if primary_domain:
        target_kws.add(primary_domain)
        for w in primary_domain.split():
            if len(w) >= 4:
                target_kws.add(w)

    for seg in mi_segments:
        seg_name = (seg.get("segment", "") if isinstance(seg, dict) else str(seg)).lower()
        for w in seg_name.split():
            if len(w) >= 4:
                target_kws.add(w)

    if not target_kws:
        return 0, "no industry context"

    if any(kw in lead_industry for kw in target_kws):
        return 20, f"primary match · '{lead_industry}'"

    adjacent = _ADJACENT_INDUSTRIES.get(primary_domain, set())
    for kw in target_kws:
        adjacent = adjacent | _ADJACENT_INDUSTRIES.get(kw, set())
    if primary_domain in ("insurance", "banking", "fintech"):
        adjacent = adjacent | _FINANCIAL_UMBRELLA

    if any(adj in lead_industry for adj in adjacent):
        return 8, f"adjacent match · '{lead_industry}'"

    return 0, f"mismatch · '{lead_industry}'"


# ── Component 4: Geography (5 pts) ───────────────────────────────────────────

def _score_geography(
    lead: dict,
    ci_data: Optional[dict],
    mi_data: Optional[dict],
) -> tuple[int, str]:
    """Geography Match — max 5 pts. Unchanged from previous version."""
    lead_country = (lead.get("country") or "").lower().strip()
    lead_city    = (lead.get("city")    or "").lower().strip()
    lead_geo     = f"{lead_city} {lead_country}".strip()
    if not lead_geo:
        return 2, "no location on lead"

    target_geos: list[str] = []
    for src in (ci_data, mi_data):
        if not src:
            continue
        for field in ("target_geographies", "geographies", "target_markets", "geography"):
            val = src.get(field)
            if isinstance(val, list):
                target_geos += [str(v).lower() for v in val]
            elif isinstance(val, str) and val:
                target_geos.append(val.lower())

    ms = (mi_data or {}).get("market_strategy") or {}
    for scale_key in ("large_scale", "mid_scale", "small_scale"):
        scale = ms.get(scale_key) or {}
        if scale.get("india"):
            target_geos.append("india")
        if scale.get("global"):
            target_geos.append("global")

    if not target_geos:
        return 3, "neutral (no geo target)"

    for geo in target_geos:
        if not geo:
            continue
        if geo == "global":
            return 4, "global target — location accepted"
        if geo in lead_geo or any(w in lead_geo for w in geo.split() if len(w) >= 3):
            return 5, f"geo match · '{lead_geo}'"

    return 0, f"geo mismatch · '{lead_geo}'"


# ── Per-lead raw scorer ───────────────────────────────────────────────────────

def _raw_score(
    lead: dict,
    ci_keywords: list,
    usecase_extra: list,
    ci_industry: str,
    mi_segments: list,
    ci_data: Optional[dict] = None,
    mi_data: Optional[dict] = None,
) -> tuple[int, int, int, dict, list]:
    """
    Compute raw score for one lead.
    Returns (total, role_score, usecase_score, breakdown, matched_keywords).
    """
    role_score,    role_why    = _score_role_match(lead)
    usecase_score, uc_matched  = _score_usecase_match(lead, ci_keywords, usecase_extra)
    ind_score,     ind_why     = _score_industry(lead, ci_industry, mi_segments)
    geo_score,     geo_why     = _score_geography(lead, ci_data, mi_data)

    total = min(100, role_score + usecase_score + ind_score + geo_score)

    breakdown = {
        "role":     {"score": role_score,    "reason": role_why,             "max": 40},
        "usecase":  {"score": usecase_score, "reason": f"{len(uc_matched)} hit(s)", "max": 40},
        "industry": {"score": ind_score,     "reason": ind_why,              "max": 20},
        "geography":{"score": geo_score,     "reason": geo_why,              "max": 5},
    }

    return total, role_score, usecase_score, breakdown, uc_matched


# ── Fit-tag assignment via percentile buckets ─────────────────────────────────

def _assign_fit_tags(scored: list) -> list:
    """
    Assign fit_tag using percentile buckets, then apply a soft filter:

    Step 1 — Percentile bucketing (always preserves the full distribution):
      Top 20 %   → High Fit
      Next 50 %  → Medium Fit
      Bottom 30% → Low Fit

    Step 2 — Soft filter (demotes High → Medium only, never Low):
      If role_score < ROLE_MIN OR usecase_score < USECASE_MIN:
        "High Fit" is demoted to "Medium Fit".
        "Medium Fit" and "Low Fit" are kept as-is.
      This ensures High Fit is reserved for leads with both strong role AND
      use-case alignment, while the overall distribution stays healthy.

    Why NOT force Low Fit? When most leads are in the same industry (e.g. 2700
    insurance leads), the bottom 30% is already Low Fit. Hard-capping weak
    role/use-case to Low would collapse 90%+ of leads into Low Fit, making
    the Medium Fit tier disappear entirely from the UI.
    """
    n = len(scored)
    if n == 0:
        return scored

    values = sorted(l["score"] for l in scored)
    high_thresh   = values[max(0, int(n * 0.80))]
    medium_thresh = values[max(0, int(n * 0.30))]
    if high_thresh == medium_thresh:
        high_thresh, medium_thresh = 70, 40

    for lead in scored:
        s = lead["score"]

        # Step 1: percentile bucket assignment
        if s >= high_thresh:
            lead["fit_tag"] = "High Fit"
        elif s >= medium_thresh:
            lead["fit_tag"] = "Medium Fit"
        else:
            lead["fit_tag"] = "Low Fit"

        # Step 2: soft filter — only demotes High → Medium, never forces Low
        role_ok    = lead.get("role_score",    0) >= ROLE_MIN
        usecase_ok = lead.get("usecase_score", 0) >= USECASE_MIN

        if (not role_ok or not usecase_ok) and lead["fit_tag"] == "High Fit":
            lead["fit_tag"] = "Medium Fit"
            lead["filter_reason"] = (
                "weak role — demoted High→Medium" if not role_ok
                else "weak use-case — demoted High→Medium"
            )

    return scored


# ── Public API ────────────────────────────────────────────────────────────────

def score_single_lead(
    lead: dict,
    ci_keywords: list,
    ci_icp: list,
    ci_services: list,
    ci_industry: str,
    mi_segments: list,
    ci_data: Optional[dict] = None,
    mi_data: Optional[dict] = None,
) -> dict:
    """Score one lead in isolation (absolute thresholds for fit_tag)."""
    usecase_extra = list(ci_icp) + list(ci_services)
    raw, role_s, usecase_s, breakdown, matched = _raw_score(
        lead, ci_keywords, usecase_extra, ci_industry, mi_segments, ci_data, mi_data,
    )
    # Absolute thresholds for single-lead scoring
    if raw >= 70:
        tag = "High Fit"
    elif raw >= 40:
        tag = "Medium Fit"
    else:
        tag = "Low Fit"
    # Soft filter: weak role/use-case demotes High → Medium only
    role_ok    = role_s    >= ROLE_MIN
    usecase_ok = usecase_s >= USECASE_MIN
    if (not role_ok or not usecase_ok) and tag == "High Fit":
        tag = "Medium Fit"
    return {
        **lead,
        "score": raw, "fit_tag": tag,
        "role_score": role_s, "usecase_score": usecase_s,
        "matched_keywords": matched, "score_breakdown": breakdown,
    }


def score_and_rank(
    leads: list,
    ci_data: Optional[dict],
    mi_data: Optional[dict],
) -> list:
    """
    Score, rank, and apply percentile-based fit tags to all leads.

    Scoring model:
      Role Match (40) + Use-case Match (40) + Industry (20) + Geo (5) → capped 100

    Filter: role < 15 OR usecase < 15 → forced to Low Fit.
    """
    if not ci_data and not mi_data:
        return [
            {**lead, "score": 0, "fit_tag": "Low Fit",
             "role_score": 0, "usecase_score": 0,
             "matched_keywords": [], "score_breakdown": {}}
            for lead in leads
        ]

    # ── Extract CI signals ─────────────────────────────────────────────────────
    ci_keywords = list((ci_data or {}).get("keywords", []))
    ci_icp      = list((ci_data or {}).get("icp",      []))
    ci_services = list((ci_data or {}).get("services", []))
    ci_industry = (ci_data or {}).get("industry", "")

    # Merge MI keyword clusters into keyword pool
    for cluster in (mi_data or {}).get("keyword_clusters", []):
        ci_keywords += cluster.get("keywords", [])

    # Deduplicate
    seen_kw, kw_dedup = set(), []
    for kw in ci_keywords:
        k = kw.lower().strip()
        if k and k not in seen_kw:
            seen_kw.add(k)
            kw_dedup.append(kw)
    ci_keywords = kw_dedup

    mi_segments   = (mi_data or {}).get("target_segments", [])
    # usecase_extra = ICP labels + service names (catch-all for the use-case scorer)
    usecase_extra = list(ci_icp) + list(ci_services)

    # ── Score every lead ───────────────────────────────────────────────────────
    scored = []
    for lead in leads:
        raw, role_s, usecase_s, breakdown, matched = _raw_score(
            lead, ci_keywords, usecase_extra, ci_industry, mi_segments, ci_data, mi_data,
        )
        scored.append({
            **lead,
            "score":           raw,
            "role_score":      role_s,
            "usecase_score":   usecase_s,
            "fit_tag":         "",        # filled by _assign_fit_tags
            "matched_keywords": matched,
            "score_breakdown": breakdown,
        })

    # Sort: descending score, company as tiebreaker
    scored.sort(key=lambda x: (-x["score"], x.get("company", "")))

    # Assign fit tags (with filter rule)
    scored = _assign_fit_tags(scored)

    return scored
