"""
Scale Classifier — Generic company scale detection.

Scale categories:
  "Startup"    → 0–100 employees  (seed / series A, pre-revenue, agile teams)
  "Mid-size"   → 100–1000         (growing companies, regional players, Series B/C)
  "Enterprise" → 1000+            (large corporations, multinationals, public companies)

Detection priority (first signal wins):
  1. Known-company override dict  → highest accuracy, zero heuristic noise
  2. LLM-provided scale field     → already classified by Claude from company context
  3. Explicit employee count      → most reliable numeric signal
  4. Funding stage                → VC stage correlates strongly with size
  5. Name / description keywords  → weakest fallback (narrow signal set, no false positives)

Critical design rules:
  - NEVER default to "Startup" — use "Unknown" when confidence is low.
  - `enrich_competitors_with_scale()` MUST respect the LLM-provided `scale` field
    set by the market_intelligence.py prompt. Do NOT overwrite valid LLM output.
  - `_STARTUP_SIGNALS` must NOT include broad terms like "ai", "tech", "platform",
    "app", ".io" — these match almost every modern SaaS company.

Adjacent scale rule:
  - Enterprise company → filter competitors to Enterprise + Mid-size
  - Mid-size company   → filter competitors to all scales
  - Startup company    → filter competitors to Startup + Mid-size
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SCALE_STARTUP    = "Startup"
SCALE_MID        = "Mid-size"
SCALE_ENTERPRISE = "Enterprise"
SCALE_UNKNOWN    = "Unknown"

# Employee count thresholds
STARTUP_MAX    = 100    # < 100 = Startup
ENTERPRISE_MIN = 1000   # > 1000 = Enterprise

# ── Known-company override dict ───────────────────────────────────────────────
# Maps lowercase name fragment → definitive scale.
# Match by checking if any key is a substring of the company name (lowercase).
# Add entries here when heuristics misclassify a well-known company.

_KNOWN_SCALES: dict[str, str] = {
    # Global Enterprise CRM / CX
    "salesforce":    SCALE_ENTERPRISE,
    "zendesk":       SCALE_ENTERPRISE,
    "servicenow":    SCALE_ENTERPRISE,
    "oracle":        SCALE_ENTERPRISE,
    "sap":           SCALE_ENTERPRISE,
    "microsoft":     SCALE_ENTERPRISE,
    "adobe":         SCALE_ENTERPRISE,
    "genesys":       SCALE_ENTERPRISE,
    "avaya":         SCALE_ENTERPRISE,
    "nice incontact": SCALE_ENTERPRISE,
    "nice systems":  SCALE_ENTERPRISE,
    "verint":        SCALE_ENTERPRISE,
    "pegasystems":   SCALE_ENTERPRISE,
    # Global Mid-size SaaS (well-funded, known, but not Fortune 500)
    "hubspot":       SCALE_MID,
    "intercom":      SCALE_MID,
    "freshdesk":     SCALE_MID,
    "freshworks":    SCALE_MID,
    "zoho":          SCALE_MID,
    "pipedrive":     SCALE_MID,
    "sprinklr":      SCALE_MID,
    "calabrio":      SCALE_MID,
    "talkdesk":      SCALE_MID,
    "five9":         SCALE_MID,
    "ringcentral":   SCALE_MID,
    "twilio":        SCALE_MID,
    "sendgrid":      SCALE_MID,
    "braze":         SCALE_MID,
    "iterable":      SCALE_MID,
    "klaviyo":       SCALE_MID,
    "amplitude":     SCALE_MID,
    "mixpanel":      SCALE_MID,
    "segment":       SCALE_MID,
    # InsurTech / BFSI platforms
    "guidewire":     SCALE_MID,
    "duck creek":    SCALE_MID,
    "majesco":       SCALE_MID,
    "sapiens":       SCALE_MID,
    "fineos":        SCALE_MID,
    "majesco":       SCALE_MID,
    "zywave":        SCALE_MID,
    # India-based IT services (Enterprise)
    "tata consultancy": SCALE_ENTERPRISE,
    "infosys":       SCALE_ENTERPRISE,
    "wipro":         SCALE_ENTERPRISE,
    "hcl technologies": SCALE_ENTERPRISE,
    "tech mahindra": SCALE_ENTERPRISE,
    "mphasis":       SCALE_ENTERPRISE,
    # India-based Mid-size SaaS / martech
    "hexaware":      SCALE_MID,
    "netcore":       SCALE_MID,
    "capillary":     SCALE_MID,
    "gupshup":       SCALE_MID,
    "exotel":        SCALE_MID,
    "kaleyra":       SCALE_MID,
    "knowlarity":    SCALE_MID,
    # Confirmed Startups (well-known but small)
    "moengage":      SCALE_STARTUP,
    "clevertap":     SCALE_STARTUP,
    "webengage":     SCALE_STARTUP,
    "lemnisk":       SCALE_STARTUP,
    "contlo":        SCALE_STARTUP,
    "insider":       SCALE_STARTUP,
    "wigzo":         SCALE_STARTUP,
    "plotline":      SCALE_STARTUP,
}


def _lookup_known(name: str) -> Optional[str]:
    """
    Check if company name matches any known-company override.
    Returns scale string or None.
    """
    name_lower = name.lower()
    for fragment, scale in _KNOWN_SCALES.items():
        if fragment in name_lower:
            return scale
    return None


# ── Signal word banks ─────────────────────────────────────────────────────────
# STRICT: only terms that strongly correlate with scale, NOT broad tech vocab.

_ENTERPRISE_SIGNALS = frozenset([
    "bank", "bancorp", "corporation", "corp", "incorporated", "inc",
    "international", "global", "worldwide", "group", "holdings",
    "limited", "ltd", "plc", "llc", "sa", "ag", "gmbh",
    "national", "federal", "mutual", "assurance", "alliance",
    "capital", "industries",
    # Size-specific descriptors only
    "multinational", "conglomerate",
])

# NARROW: only terms that are genuinely startup-specific
# Removed: "ai", "tech", "platform", "app", ".io", ".ai", ".co", "solutions"
# (these are too broad and cause Enterprise SaaS to be classified as Startup)
_STARTUP_SIGNALS = frozenset([
    "startup",
    "early stage",
    "pre-seed",
    "bootstrapped",
    "labs",
    "studio",
    "hq",
    "ventures",
    "seed funded",
])

_FUNDING_STARTUP = frozenset([
    "seed", "pre-seed", "angel", "series a", "bootstrap",
    "early stage", "pre-revenue", "mvp",
])

_FUNDING_MIDSIZE = frozenset([
    "series b", "series c",
])

_FUNDING_ENTERPRISE = frozenset([
    "series d", "series e", "series f", "ipo", "public",
    "nyse", "nasdaq", "bse", "nse", "listed",
])


# ── Employee count extraction ─────────────────────────────────────────────────

def _extract_employee_count(text: str) -> Optional[int]:
    if not text:
        return None
    patterns = [
        r'(\d[\d,]*)\s*(?:to|-)\s*(\d[\d,]*)\s*(?:employees?|staff|people|headcount)',
        r'(\d[\d,]*)\s*\+?\s*(?:employees?|staff|people|headcount)',
        r'(?:employees?|staff|headcount)[:\s]+(\d[\d,]*)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(",", "")
            try:
                return int(raw)
            except ValueError:
                continue
    return None


# ── Core classifier ───────────────────────────────────────────────────────────

def classify_scale(
    name: str = "",
    description: str = "",
    employee_count: Optional[int] = None,
    funding_stage: str = "",
) -> dict:
    """
    Classify a company into Startup / Mid-size / Enterprise / Unknown.

    Priority order:
      1. Known-company override (highest accuracy)
      2. Explicit employee count
      3. Funding stage signals
      4. Name / description heuristics (narrow signal set only)
      5. Unknown (never default to Startup)
    """
    combined = f"{name} {description} {funding_stage}".lower()

    # ── 1. Known-company override ──────────────────────────────────────────────
    known = _lookup_known(name)
    if known:
        return {"scale": known, "confidence": "high",
                "reason": f"known company override for '{name}'"}

    # ── 2. Explicit employee count ─────────────────────────────────────────────
    if employee_count is None:
        employee_count = _extract_employee_count(combined)

    if employee_count is not None:
        if employee_count < STARTUP_MAX:
            return {"scale": SCALE_STARTUP, "confidence": "high",
                    "reason": f"{employee_count} employees < {STARTUP_MAX}"}
        if employee_count >= ENTERPRISE_MIN:
            return {"scale": SCALE_ENTERPRISE, "confidence": "high",
                    "reason": f"{employee_count} employees ≥ {ENTERPRISE_MIN}"}
        return {"scale": SCALE_MID, "confidence": "high",
                "reason": f"{employee_count} employees in mid-size range (100–1000)"}

    # ── 3. Funding stage signals ───────────────────────────────────────────────
    if funding_stage:
        fs_lower = funding_stage.lower()
        if any(sig in fs_lower for sig in _FUNDING_ENTERPRISE):
            return {"scale": SCALE_ENTERPRISE, "confidence": "medium",
                    "reason": f"funding stage '{funding_stage}' → public/late-stage"}
        if any(sig in fs_lower for sig in _FUNDING_MIDSIZE):
            return {"scale": SCALE_MID, "confidence": "medium",
                    "reason": f"funding stage '{funding_stage}' → Series B/C growth stage"}
        if any(sig in fs_lower for sig in _FUNDING_STARTUP):
            return {"scale": SCALE_STARTUP, "confidence": "medium",
                    "reason": f"funding stage '{funding_stage}' → early-stage"}

    # ── 4. Name / description heuristics (narrow signals only) ────────────────
    name_lower = name.lower()

    has_formal_suffix = any(
        name_lower.endswith(f" {s}") or f" {s} " in name_lower
        for s in ["limited", "ltd", "plc", "corp", "inc", "llc", "sa", "ag", "gmbh"]
    )
    if has_formal_suffix:
        return {"scale": SCALE_ENTERPRISE, "confidence": "medium",
                "reason": "formal legal suffix in company name"}

    enterprise_hits = sum(1 for s in _ENTERPRISE_SIGNALS if s in combined)
    if enterprise_hits >= 2:
        return {"scale": SCALE_ENTERPRISE, "confidence": "medium",
                "reason": f"enterprise name signals: {enterprise_hits} hits"}

    startup_hits = sum(1 for s in _STARTUP_SIGNALS if s in combined)
    if startup_hits >= 1:
        return {"scale": SCALE_STARTUP, "confidence": "low",
                "reason": f"startup signals: {startup_hits} hits"}

    if enterprise_hits == 1:
        return {"scale": SCALE_MID, "confidence": "low",
                "reason": "single enterprise signal — likely mid-size"}

    # ── 5. No clear signal ─────────────────────────────────────────────────────
    return {"scale": SCALE_UNKNOWN, "confidence": "low",
            "reason": "no reliable scale signal detected"}


# ── Adjacent scale lookup ─────────────────────────────────────────────────────

_ADJACENT_SCALES: dict[str, list[str]] = {
    SCALE_STARTUP:    [SCALE_STARTUP, SCALE_MID],
    SCALE_MID:        [SCALE_STARTUP, SCALE_MID, SCALE_ENTERPRISE],
    SCALE_ENTERPRISE: [SCALE_MID, SCALE_ENTERPRISE],
    SCALE_UNKNOWN:    [SCALE_STARTUP, SCALE_MID, SCALE_ENTERPRISE],
}


def get_relevant_scales(company_scale: str) -> list[str]:
    return _ADJACENT_SCALES.get(company_scale, list(_ADJACENT_SCALES[SCALE_UNKNOWN]))


# ── Competitor enrichment ─────────────────────────────────────────────────────

# Valid scale strings that the LLM is prompted to produce
_VALID_LLM_SCALES = {SCALE_STARTUP, SCALE_MID, SCALE_ENTERPRISE}


def enrich_competitors_with_scale(competitors: list[dict]) -> list[dict]:
    """
    Add scale classification to each competitor dict.

    IMPORTANT: If the competitor already has a valid `scale` field (set by
    the LLM in market_intelligence.py), KEEP IT. Only run heuristic
    classification when:
      - `scale` is absent
      - `scale` is not a valid value (not Startup/Mid-size/Enterprise)
      - `scale` is "Unknown" (heuristics might improve on it)

    This ensures the LLM's contextual classification is not overwritten
    by weaker name-only heuristics.
    """
    enriched = []
    for comp in competitors:
        name  = comp.get("name", "")
        desc  = comp.get("differentiator", "")

        existing_scale = comp.get("scale", "")

        if existing_scale in _VALID_LLM_SCALES and existing_scale != SCALE_UNKNOWN:
            # LLM already classified this competitor — trust it, but run known-override
            # to catch obvious misclassifications (e.g. LLM called Salesforce "Startup")
            known = _lookup_known(name)
            if known and known != existing_scale:
                result = {"scale": known, "confidence": "high",
                          "reason": f"known override corrects LLM '{existing_scale}' → '{known}'"}
                logger.info(f"Scale override: {name} — LLM={existing_scale} → override={known}")
            else:
                result = {
                    "scale":            existing_scale,
                    "confidence":       comp.get("scale_confidence", "medium"),
                    "reason":           comp.get("scale_reason", "LLM-provided scale"),
                }
        else:
            # No valid LLM scale — run heuristic
            result = classify_scale(name=name, description=desc)

        print(f"COMPETITOR SCALE: {name} → {result['scale']} (confidence={result['confidence']}, reason={result['reason']})")

        enriched.append({
            **comp,
            "scale":            result["scale"],
            "scale_confidence": result["confidence"],
            "scale_reason":     result["reason"],
        })

    return enriched


# ── Competitor filtering ──────────────────────────────────────────────────────

def filter_competitors_by_scale(
    competitors: list[dict],
    company_scale: str,
) -> list[dict]:
    """
    Filter competitors to only those at relevant scales.

    Enterprise → Enterprise + Mid-size
    Mid-size   → all
    Startup    → Startup + Mid-size

    Safety floor: always return at least 2 competitors.
    Unknown scale always passes through.
    """
    relevant = get_relevant_scales(company_scale)

    filtered = [
        c for c in competitors
        if c.get("scale", SCALE_UNKNOWN) in relevant
        or c.get("scale", SCALE_UNKNOWN) == SCALE_UNKNOWN
    ]

    if len(filtered) < 2:
        return competitors

    return filtered


# ── Competitor ranking ────────────────────────────────────────────────────────

def rank_competitors(
    competitors: list[dict],
    company_scale: str,
    ci_icp: list[str],
    ci_services: list[str],
) -> list[dict]:
    """
    Re-rank competitors by composite relevance score (100 pts):
      - Product similarity (40 pts): differentiator mentions CI service/product terms
      - Use-case overlap   (30 pts): differentiator mentions CI ICP / buyer terms
      - Scale similarity   (30 pts): same scale > adjacent > unknown

    Returns sorted list (highest relevance first) with 'relevance_score' field.
    """
    relevant_scales = get_relevant_scales(company_scale)

    # Build token pools from CI data
    svc_tokens: set[str] = set()
    for svc in ci_services:
        svc_tokens.update(w.lower() for w in svc.split() if len(w) >= 4)

    icp_tokens: set[str] = set()
    for icp in ci_icp:
        icp_tokens.update(w.lower() for w in icp.split() if len(w) >= 4)

    def _score_competitor(comp: dict) -> int:
        score = 0
        comp_scale = comp.get("scale", SCALE_UNKNOWN)
        diff  = comp.get("differentiator", "").lower()
        name  = comp.get("name", "").lower()
        desc  = f"{diff} {name}"

        # ── Scale similarity (30 pts) ──────────────────────────────────────────
        if comp_scale == company_scale:
            score += 30
        elif comp_scale in relevant_scales:
            score += 15
        elif comp_scale == SCALE_UNKNOWN:
            score += 10   # neutral — cannot penalise unknown

        # ── Product similarity (40 pts): service/product term overlap ──────────
        svc_hits = sum(1 for t in svc_tokens if t in desc)
        score += min(40, svc_hits * 10)

        # ── Use-case overlap (30 pts): ICP term overlap ────────────────────────
        icp_hits = sum(1 for t in icp_tokens if t in desc)
        score += min(30, icp_hits * 10)

        return score

    ranked = sorted(competitors, key=_score_competitor, reverse=True)
    for comp in ranked:
        rel_score = _score_competitor(comp)
        comp["relevance_score"] = rel_score
        print(f"RELEVANCE SCORE: {comp.get('name', '?')} → {rel_score}/100 (scale={comp.get('scale', '?')})")

    return ranked


# ── CI-scale extractor ────────────────────────────────────────────────────────

def classify_company_scale_from_ci(ci_data: dict) -> dict:
    """
    Classify the SOURCE company's own scale from CI data.
    Used to determine which competitor scales are relevant.
    """
    name    = ci_data.get("company_name", "")
    summary = ci_data.get("company_summary", "")
    return classify_scale(name=name, description=summary)
