"""
Industry Classifier — Dynamic, ICP-driven lead industry grouping.

Design principle: ZERO hardcoded industry names.
Canonical buckets are derived entirely from the Company Intelligence (CI) input:
  - ci_data["industry"]      → primary domain  (e.g. "Insurance")
  - ci_data["icp"]           → target customer labels (e.g. ["Life Insurers", "Health Insurers"])
  - mi_data["target_segments"] → segment names (e.g. ["Corporate HR Buyers"])

Grouping logic (ICP-first):
  - PRIMARY buckets = MI target segments + CI ICP entries (fine-grained, e.g. "Life Insurance")
  - FALLBACK bucket = CI industry (broad, e.g. "Insurance") — used ONLY when no primary matches
  - Match text = company name + job title + raw industry (rich signal, not just industry alone)

This means:
  - "Future Generali Life Insurance <VP> Insurance" → matches "Life Insurance" (primary) ✓
  - "Niva Bupa Health Insurance <CTO> Insurance"   → matches "Health Insurance" (primary) ✓
  - "ICICI Lombard <Manager> General Insurance"     → matches "General Insurance" (primary) ✓
  - Unknown company with empty industry             → "Other"

Usage:
    from utils.industry_classifier import classify_leads_industry, group_leads_by_industry
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Bucket builder ────────────────────────────────────────────────────────────

def build_canonical_buckets(
    ci_data: dict,
    mi_data: Optional[dict] = None,
) -> dict:
    """
    Derive canonical industry buckets from CI/MI input.

    Returns a dict:
      {
        "primary":  [...ICP/segment buckets...]   # fine-grained, preferred
        "fallback": [...broad industry buckets...]  # used only when primary fails
      }

    Priority within primary:
      1. MI target segment names  (most specific)
      2. CI ICP entries           (what the company targets)

    Fallback:
      3. CI industry              (broad domain)

    Example (ALL driven by input, never hardcoded):
      CI industry="Insurance", ICP=["Life Insurance Companies","Health Insurance Providers"]
      → primary=["Life Insurance Companies","Health Insurance Providers"], fallback=["Insurance"]
    """
    seen: set[str] = set()
    primary: list[str] = []
    fallback: list[str] = []

    def _add(lst: list, text: str):
        t = text.strip().title()
        if t and t.lower() not in seen:
            seen.add(t.lower())
            lst.append(t)

    # 1. MI target segments (highest specificity)
    for seg in (mi_data or {}).get("target_segments", []):
        name = seg.get("segment", "") if isinstance(seg, dict) else str(seg)
        if name:
            _add(primary, name)

    # 2. CI ICP entries
    for icp_entry in (ci_data or {}).get("icp", []):
        if icp_entry:
            _add(primary, icp_entry)

    # 3. CI industry (broad fallback — only if not already in primary)
    industry = (ci_data or {}).get("industry", "")
    if industry:
        _add(fallback, industry)

    return {"primary": primary, "fallback": fallback}


# ── Fuzzy matcher ─────────────────────────────────────────────────────────────

def _significant_tokens(text: str) -> list[str]:
    """Extract meaningful word tokens (length >= 4) from text."""
    return [w for w in re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())]


def _match_score(rich_text: str, bucket: str) -> int:
    """
    Compute a match score between rich lead text and a bucket label.

    rich_text is: "<company name> <job title> <raw industry>"

    Returns:
      100 → bucket label is a substring of rich_text (or vice versa)
       80 → all significant bucket words found in rich_text tokens
       40 → any significant bucket word found in rich_text tokens
        0 → no overlap
    """
    rt = rich_text.lower()
    bk = bucket.lower()

    if bk in rt or rt in bk:
        return 100

    bucket_tokens = _significant_tokens(bk)
    if not bucket_tokens:
        return 0

    rich_tokens = _significant_tokens(rt)
    if all(t in rich_tokens for t in bucket_tokens):
        return 80

    if any(t in rich_tokens for t in bucket_tokens):
        return 40

    return 0


# ── Per-lead classifier ───────────────────────────────────────────────────────

def classify_lead_industry(
    lead: dict,
    canonical_buckets: "dict | list",
) -> str:
    """
    Classify a single lead into an ICP segment bucket.

    Match text = company name + job title + raw industry (richer signal than
    industry field alone — captures "Life Insurance" from company name even
    when the industry CSV field just says "Insurance").

    Priority:
      1. Best-scoring PRIMARY bucket (ICP/segment) at score >= 40
      2. Best-scoring FALLBACK bucket (broad industry) at score >= 40
      3. Raw industry field (title-cased) as last resort
      4. "Other" if nothing available

    Accepts both the new dict format {"primary":[], "fallback":[]}
    and the legacy flat-list format (treated as primary-only).
    """
    # Legacy flat-list support
    if isinstance(canonical_buckets, list):
        canonical_buckets = {"primary": canonical_buckets, "fallback": []}

    primary  = canonical_buckets.get("primary", [])
    fallback = canonical_buckets.get("fallback", [])

    # Build rich match text from multiple lead fields
    company = (lead.get("company")  or "").strip()
    title   = (lead.get("title")    or "").strip()
    raw_ind = (lead.get("industry") or "").strip()
    rich_text = f"{company} {title} {raw_ind}".strip()

    if not rich_text:
        return "Other"

    if not primary and not fallback:
        return raw_ind.title() if raw_ind else "Other"

    # ── Try primary (ICP/segment) buckets ─────────────────────────────────────
    best_primary = None
    best_primary_score = 0
    for bucket in primary:
        score = _match_score(rich_text, bucket)
        if score > best_primary_score:
            best_primary_score = score
            best_primary       = bucket

    if best_primary_score >= 40:
        return best_primary  # type: ignore[return-value]

    # ── Try fallback (broad industry) buckets ──────────────────────────────────
    best_fallback = None
    best_fallback_score = 0
    for bucket in fallback:
        score = _match_score(rich_text, bucket)
        if score > best_fallback_score:
            best_fallback_score = score
            best_fallback       = bucket

    if best_fallback_score >= 40:
        return best_fallback  # type: ignore[return-value]

    # ── No bucket matched — use raw industry value ─────────────────────────────
    return raw_ind.title() if raw_ind else "Other"


# ── Batch classification ──────────────────────────────────────────────────────

def classify_leads_industry(
    leads: list[dict],
    ci_data: Optional[dict] = None,
    mi_data: Optional[dict] = None,
) -> list[dict]:
    """
    Add a 'canonical_industry' field to every lead in the list.

    This is a pure enrichment step — all original fields are preserved.
    The canonical_industry is always a non-empty string.

    Validation: logs a warning if all leads land in a single bucket
    (indicates poor ICP signal or no company-name differentiation).
    """
    buckets = build_canonical_buckets(ci_data or {}, mi_data)

    # ── Debug / validation logs ───────────────────────────────────────────────
    print(f"ICP SEGMENTS (primary): {buckets['primary']}")
    print(f"FALLBACK BUCKETS:       {buckets['fallback']}")
    logger.info(f"Industry classification — primary: {buckets['primary']}, fallback: {buckets['fallback']}")

    classified = []
    for lead in leads:
        canonical = classify_lead_industry(lead, buckets)
        classified.append({**lead, "canonical_industry": canonical})

    # ── Validation: warn if everything collapsed into one bucket ──────────────
    group_counts: dict[str, int] = {}
    for lead in classified:
        k = lead["canonical_industry"]
        group_counts[k] = group_counts.get(k, 0) + 1

    print(f"GROUP DISTRIBUTION: {dict(sorted(group_counts.items(), key=lambda x: -x[1]))}")

    if len(group_counts) <= 1 and buckets["primary"]:
        logger.warning(
            "FAIL: All leads collapsed into a single bucket despite ICP segments being available. "
            f"Bucket: {list(group_counts.keys())}. "
            "Check if company names carry sub-industry signals."
        )

    return classified


# ── Grouping ──────────────────────────────────────────────────────────────────

def group_leads_by_industry(leads: list[dict]) -> dict[str, list[dict]]:
    """
    Group a list of leads (already classified) by their canonical_industry.

    Sort order:
      1. Descending lead count (largest segment first)
      2. Alphabetical as tiebreaker
      3. "Other" always last

    Returns: {industry_name: [lead, ...], ...}
    """
    groups: dict[str, list[dict]] = {}

    for lead in leads:
        key = (lead.get("canonical_industry") or lead.get("industry") or "Other").strip()
        groups.setdefault(key, []).append(lead)

    def _sort_key(item: tuple) -> tuple:
        name, group_leads = item
        is_other  = name == "Other"
        avg_score = (
            sum(l.get("score", 0) for l in group_leads) / len(group_leads)
            if group_leads else 0
        )
        return (is_other, -len(group_leads), -avg_score, name.lower())

    return dict(sorted(groups.items(), key=_sort_key))


# ── Industry list for filter dropdown ─────────────────────────────────────────

def get_industry_list(leads: list[dict]) -> list[str]:
    """
    Return a sorted list of unique canonical industries present in the lead list.
    Used to populate the ICP segment filter dropdown on the frontend.
    "Other" is always last if present.
    """
    seen: set[str] = set()
    industries: list[str] = []
    other_present = False

    for lead in leads:
        ind = (lead.get("canonical_industry") or lead.get("industry") or "Other").strip()
        if ind == "Other":
            other_present = True
        elif ind not in seen:
            seen.add(ind)
            industries.append(ind)

    industries.sort()
    if other_present:
        industries.append("Other")
    return industries
