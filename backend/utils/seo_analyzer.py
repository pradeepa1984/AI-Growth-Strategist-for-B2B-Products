"""
SEO Analysis Module
=====================
Provides measurable, API-backed SEO scoring for generated content.
Goes beyond LLM-only analysis by computing verifiable metrics.

Metrics computed (no external API required for core analysis):
  - Keyword density per keyword and overall
  - Keyword placement (title, headings, body)
  - Readability score (Flesch Reading Ease via textstat)
  - Content structure (heading count, paragraph count, word count)
  - Meta-readiness (title length, description length)

Optional external APIs:
  DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD → keyword difficulty + search volume
  (DataForSEO has a pay-as-you-go model; keyword data costs ~$0.001 per request)

Output includes:
  - overall_score (0–100)
  - grade (A/B/C/D/F)
  - breakdown: individual metric scores
  - recommendations: actionable improvement list
  - before/after comparison when comparing two content versions

Usage:
  from utils.seo_analyzer import analyze_content, compare_versions
"""

import logging
import math
import os
import re
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── Weights (must sum to 100) ─────────────────────────────────────────────────

SCORE_WEIGHTS = {
    "keyword_density":    20,   # are target keywords present at right density?
    "keyword_placement":  20,   # keywords in title and headings?
    "readability":        20,   # Flesch Reading Ease
    "content_structure":  15,   # heading count, paragraph length
    "word_count":         15,   # appropriate length for content type
    "meta_readiness":     10,   # title length ≤ 60 chars, presence of a slug line
}

# Optimal keyword density range
KW_DENSITY_MIN = 0.5    # percent
KW_DENSITY_MAX = 2.5    # percent (above this is keyword stuffing)

# Target word counts by content length
WORD_COUNT_TARGETS = {
    "short":  (150, 350),
    "medium": (350, 700),
    "long":   (700, 1200),
}


# ── Readability (no dependency — pure math) ───────────────────────────────────

def _count_syllables(word: str) -> int:
    """Approximate syllable count for an English word."""
    word = word.lower().strip(".,!?;:\"'()[]")
    if len(word) <= 3:
        return 1
    # Remove silent trailing e
    word = re.sub(r"e$", "", word)
    # Count vowel groups
    count = len(re.findall(r"[aeiouy]+", word))
    return max(count, 1)


def flesch_reading_ease(text: str) -> float:
    """
    Compute Flesch Reading Ease score (0–100).
      90–100: Very Easy   (5th grade)
      60–70:  Standard    (8th–9th grade) ← target for B2B content
      30–50:  Difficult   (college level)
      0–30:   Very Hard   (professional/academic)
    """
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    words = re.findall(r"\b\w+\b", text)

    if not sentences or not words:
        return 0.0

    asl = len(words) / len(sentences)   # average sentence length
    syllables = sum(_count_syllables(w) for w in words)
    asw = syllables / len(words)         # average syllables per word

    score = 206.835 - (1.015 * asl) - (84.6 * asw)
    return max(0.0, min(100.0, round(score, 1)))


def flesch_kincaid_grade(text: str) -> float:
    """Returns the US school grade level of the text (lower = easier)."""
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    words = re.findall(r"\b\w+\b", text)

    if not sentences or not words:
        return 0.0

    asl = len(words) / len(sentences)
    syllables = sum(_count_syllables(w) for w in words)
    asw = syllables / len(words)

    grade = (0.39 * asl) + (11.8 * asw) - 15.59
    return round(max(0.0, grade), 1)


# ── Keyword Analysis ──────────────────────────────────────────────────────────

def _extract_text_blocks(content: str) -> dict:
    """
    Parse markdown content into structural blocks.
    Returns {title, headings, body_text, full_text}.
    """
    lines = content.splitlines()
    title = ""
    headings: list[str] = []
    body_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if re.match(r"^#{1,2}\s+", stripped):
            heading_text = re.sub(r"^#+\s+", "", stripped)
            if not title:
                title = heading_text
            else:
                headings.append(heading_text)
        elif re.match(r"^#{3,6}\s+", stripped):
            headings.append(re.sub(r"^#+\s+", "", stripped))
        elif stripped:
            body_lines.append(stripped)

    body_text = " ".join(body_lines)
    full_text = f"{title} {' '.join(headings)} {body_text}"

    return {
        "title": title,
        "headings": headings,
        "body_text": body_text,
        "full_text": full_text,
    }


def analyze_keyword_density(content: str, keywords: list[str]) -> dict:
    """
    Compute per-keyword density and placement signals.

    Returns:
      per_keyword: {kw: {count, density_pct, in_title, in_heading}}
      overall_density: average density across all keywords
      density_score: 0–100 (penalties for under/over use)
      placement_score: 0–100 (keywords in title/headings)
    """
    blocks = _extract_text_blocks(content)
    full_lower = blocks["full_text"].lower()
    title_lower = blocks["title"].lower()
    headings_lower = " ".join(blocks["headings"]).lower()
    word_count = len(re.findall(r"\b\w+\b", blocks["full_text"]))

    per_keyword: dict = {}
    density_hits = 0
    placement_hits = 0

    for kw in keywords:
        kw_lower = kw.lower()
        count = len(re.findall(re.escape(kw_lower), full_lower))
        density_pct = (count / word_count * 100) if word_count else 0

        in_title = kw_lower in title_lower
        in_heading = kw_lower in headings_lower

        per_keyword[kw] = {
            "count": count,
            "density_pct": round(density_pct, 2),
            "in_title": in_title,
            "in_heading": in_heading,
        }

        # Density scoring: full points within optimal range, penalty outside
        if KW_DENSITY_MIN <= density_pct <= KW_DENSITY_MAX:
            density_hits += 1
        elif density_pct > 0:
            density_hits += 0.4   # partial credit for presence

        if in_title:
            placement_hits += 2   # title placement is worth more
        if in_heading:
            placement_hits += 1

    total_kws = max(len(keywords), 1)
    max_placement = total_kws * 3   # max 3 points per keyword

    density_score = min(100, int((density_hits / total_kws) * 100))
    placement_score = min(100, int((placement_hits / max_placement) * 100))

    # Overall density: average across all keywords
    all_densities = [v["density_pct"] for v in per_keyword.values()]
    overall_density = round(sum(all_densities) / len(all_densities), 2) if all_densities else 0.0

    return {
        "per_keyword": per_keyword,
        "overall_density_pct": overall_density,
        "density_score": density_score,
        "placement_score": placement_score,
        "word_count": word_count,
    }


# ── Structure Analysis ────────────────────────────────────────────────────────

def analyze_structure(content: str, length_hint: str = "medium") -> dict:
    """
    Analyze content structure for SEO best practices.

    Checks:
      - Heading hierarchy (H2/H3 present)
      - Paragraph count and average length
      - Word count vs target range
      - Title length (≤ 60 chars ideal for search snippets)
    """
    blocks = _extract_text_blocks(content)
    word_count = len(re.findall(r"\b\w+\b", blocks["full_text"]))
    paragraphs = [p.strip() for p in blocks["body_text"].split("\n\n") if p.strip()]
    heading_count = len(blocks["headings"])
    title_length = len(blocks["title"])

    # Word count scoring
    target_min, target_max = WORD_COUNT_TARGETS.get(length_hint, (350, 700))
    if target_min <= word_count <= target_max:
        word_count_score = 100
    elif word_count < target_min:
        word_count_score = max(0, int((word_count / target_min) * 100))
    else:
        # Over-length: diminishing penalty
        excess_ratio = (word_count - target_max) / target_max
        word_count_score = max(60, int(100 - excess_ratio * 30))

    # Structure scoring
    structure_score = 0
    structure_issues: list[str] = []

    if heading_count >= 3:
        structure_score += 40
    elif heading_count >= 1:
        structure_score += 20
        structure_issues.append("Add more subheadings to improve scannability (target: 3+)")

    if paragraphs:
        avg_para_words = sum(len(re.findall(r"\b\w+\b", p)) for p in paragraphs) / len(paragraphs)
        if avg_para_words <= 80:
            structure_score += 40
        else:
            structure_score += 20
            structure_issues.append(f"Paragraphs are too long (avg {avg_para_words:.0f} words). Break into 50-80 word chunks.")
    else:
        structure_issues.append("No clear paragraph breaks detected")

    if 30 <= title_length <= 60:
        structure_score += 20
    elif title_length <= 70:
        structure_score += 10
        structure_issues.append(f"Title is {title_length} chars — keep it under 60 for optimal search display")
    else:
        structure_issues.append(f"Title is {title_length} chars — trim to under 60 characters")

    return {
        "heading_count": heading_count,
        "paragraph_count": len(paragraphs),
        "word_count": word_count,
        "title_length": title_length,
        "structure_score": min(100, structure_score),
        "word_count_score": word_count_score,
        "issues": structure_issues,
    }


# ── DataForSEO Integration (Optional) ────────────────────────────────────────

def get_keyword_data_dataforseo(keywords: list[str], location_code: int = 2840) -> dict:
    """
    Fetch keyword search volume and difficulty via DataForSEO API.
    location_code: 2840 = United States (default)

    Returns {keyword: {volume, difficulty, cpc}} or {} if API not configured.

    DataForSEO pricing: ~$0.001 per keyword → 1000 keywords = $1
    Free credits available on sign-up: dataforseo.com
    """
    login = os.environ.get("DATAFORSEO_LOGIN", "")
    password = os.environ.get("DATAFORSEO_PASSWORD", "")

    if not login or not password:
        logger.debug("DataForSEO credentials not set — skipping keyword volume lookup")
        return {}

    url = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live"
    payload = [{
        "keywords": keywords[:50],      # DataForSEO max per request
        "location_code": location_code,
        "language_code": "en",
    }]

    try:
        resp = requests.post(url, json=payload, auth=(login, password), timeout=15)
        if resp.status_code != 200:
            logger.warning(f"DataForSEO {resp.status_code}: {resp.text[:200]}")
            return {}

        data = resp.json()
        tasks = data.get("tasks") or []
        if not tasks or tasks[0].get("status_code") != 20000:
            return {}

        result_items = tasks[0].get("result") or []
        output: dict = {}
        for item in result_items:
            kw = item.get("keyword", "")
            output[kw] = {
                "volume": item.get("search_volume", 0),
                "competition": item.get("competition", 0),
                "cpc": item.get("cpc", 0),
            }
        return output
    except requests.RequestException as e:
        logger.error(f"DataForSEO request failed: {e}")
        return {}


# ── Score → Grade Mapping ─────────────────────────────────────────────────────

def _score_to_grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 45:
        return "D"
    return "F"


# ── Main Analysis Function ────────────────────────────────────────────────────

def analyze_content(
    content: str,
    keywords: list[str],
    topic: str = "",
    length_hint: str = "medium",
    include_keyword_data: bool = False,
) -> dict:
    """
    Run full SEO analysis on content.

    Args:
        content:              markdown-formatted content string
        keywords:             list of target SEO keywords
        topic:                content topic (used for label only)
        length_hint:          "short" | "medium" | "long" — to calibrate word count scoring
        include_keyword_data: if True, hits DataForSEO for volume/difficulty (requires API key)

    Returns:
        overall_score:    0–100
        grade:            A/B/C/D/F
        breakdown:        per-metric scores
        recommendations:  ordered list of improvement actions
        keyword_data:     volume/difficulty from DataForSEO (if enabled)
        meta:             raw analysis values (word count, readability, etc.)
    """
    if not content:
        return {"overall_score": 0, "grade": "F", "error": "Empty content"}

    # ── Run each analysis pass ────────────────────────────────────────────────
    kw_analysis = analyze_keyword_density(content, keywords) if keywords else {
        "density_score": 50, "placement_score": 50, "per_keyword": {}, "word_count": 0, "overall_density_pct": 0,
    }
    structure = analyze_structure(content, length_hint)
    readability_score_raw = flesch_reading_ease(content)
    grade_level = flesch_kincaid_grade(content)

    # Map Flesch score (0–100) to our 0–100 SEO readability score
    # B2B sweet spot: Flesch 40–65 (standard to fairly difficult) = 100 pts
    if 40 <= readability_score_raw <= 65:
        readability_score = 100
    elif readability_score_raw > 65:
        # Too easy for B2B (penalize slightly)
        readability_score = max(70, 100 - int((readability_score_raw - 65) * 1.5))
    else:
        # Too complex (penalize more)
        readability_score = max(30, int(readability_score_raw * 1.5))

    # Meta-readiness: title length under 60, title present
    title_present = bool(_extract_text_blocks(content)["title"])
    title_length = structure["title_length"]
    meta_score = 100 if (title_present and title_length <= 60) else (70 if title_present else 30)

    # ── Compute weighted overall score ────────────────────────────────────────
    breakdown = {
        "keyword_density":    kw_analysis["density_score"],
        "keyword_placement":  kw_analysis["placement_score"],
        "readability":        readability_score,
        "content_structure":  structure["structure_score"],
        "word_count":         structure["word_count_score"],
        "meta_readiness":     meta_score,
    }

    overall_score = sum(
        int(breakdown[metric] * (SCORE_WEIGHTS[metric] / 100))
        for metric in SCORE_WEIGHTS
    )
    overall_score = min(100, overall_score)

    # ── Build recommendations ─────────────────────────────────────────────────
    recommendations: list[str] = []

    if kw_analysis["density_score"] < 60:
        missing_kws = [
            kw for kw, data in kw_analysis["per_keyword"].items()
            if data["count"] == 0
        ]
        if missing_kws:
            recommendations.append(f"Keywords not found in content: {', '.join(missing_kws[:3])}. Add them naturally.")
        else:
            recommendations.append("Increase keyword usage. Aim for 0.5–2.5% density per target keyword.")

    if kw_analysis["placement_score"] < 60:
        no_title = [kw for kw, d in kw_analysis["per_keyword"].items() if not d["in_title"]]
        if no_title:
            recommendations.append(f"Add a primary keyword to the title. Missing: {no_title[0]}")
        no_heading = [kw for kw, d in kw_analysis["per_keyword"].items() if not d["in_heading"]]
        if no_heading:
            recommendations.append(f"Use keywords in section headings. Try adding: {no_heading[0]}")

    if readability_score < 70:
        if readability_score_raw < 40:
            recommendations.append(
                f"Content is too complex (Flesch {readability_score_raw}, Grade {grade_level}). "
                "Shorten sentences and use simpler words."
            )
        else:
            recommendations.append(
                f"Readability is adequate (Flesch {readability_score_raw}) but could be improved for broader audiences."
            )

    recommendations.extend(structure["issues"])

    if meta_score < 70:
        if not title_present:
            recommendations.append("Add an H1 title at the top of the content.")
        elif title_length > 60:
            recommendations.append(f"Shorten the title from {title_length} to under 60 characters.")

    # ── Optional: keyword volume data ─────────────────────────────────────────
    keyword_data: dict = {}
    if include_keyword_data and keywords:
        keyword_data = get_keyword_data_dataforseo(keywords)

    return {
        "topic": topic,
        "overall_score": overall_score,
        "grade": _score_to_grade(overall_score),
        "breakdown": breakdown,
        "recommendations": recommendations,
        "meta": {
            "word_count": structure["word_count"],
            "heading_count": structure["heading_count"],
            "paragraph_count": structure["paragraph_count"],
            "title_length": title_length,
            "flesch_reading_ease": readability_score_raw,
            "flesch_kincaid_grade": grade_level,
            "overall_keyword_density_pct": kw_analysis["overall_density_pct"],
        },
        "keyword_detail": kw_analysis["per_keyword"],
        "keyword_data": keyword_data,
    }


# ── Before/After Comparison ───────────────────────────────────────────────────

def compare_versions(
    original_content: str,
    improved_content: str,
    keywords: list[str],
    topic: str = "",
    length_hint: str = "medium",
) -> dict:
    """
    Run SEO analysis on two versions of content and produce a comparison report.

    Returns:
      before:       analysis of original content
      after:        analysis of improved content
      delta_score:  score improvement (positive = better)
      improvements: list of metrics that improved
      regressions:  list of metrics that got worse
    """
    before = analyze_content(original_content, keywords, topic, length_hint)
    after = analyze_content(improved_content, keywords, topic, length_hint)

    delta_score = after["overall_score"] - before["overall_score"]

    improvements: list[str] = []
    regressions: list[str] = []

    for metric in SCORE_WEIGHTS:
        b_score = before["breakdown"].get(metric, 0)
        a_score = after["breakdown"].get(metric, 0)
        if a_score > b_score + 5:
            improvements.append(f"{metric}: {b_score} → {a_score} (+{a_score - b_score})")
        elif a_score < b_score - 5:
            regressions.append(f"{metric}: {b_score} → {a_score} ({a_score - b_score})")

    return {
        "before": before,
        "after": after,
        "delta_score": delta_score,
        "verdict": "improved" if delta_score > 0 else ("same" if delta_score == 0 else "worse"),
        "improvements": improvements,
        "regressions": regressions,
    }
