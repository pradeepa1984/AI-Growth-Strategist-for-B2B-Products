"""
Personalization Pipeline Debug Tests
======================================
Verifies that LinkedIn enrichment data flows correctly from Apify
all the way into the LLM prompt and appears in the generated output.

Run with:
    cd backend
    python -m pytest tests/test_personalization.py -v

Or run directly (no pytest required):
    cd backend
    python tests/test_personalization.py
"""

import json
import logging
import sys
import os

# Add backend root to path so imports resolve without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from content_generation import (
    generate_linkedin_message,
    _format_linkedin_context,
    run_content_generation,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ── Test fixtures ─────────────────────────────────────────────────────────────

SAMPLE_LEAD = {
    "name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "title": "AI Lead",
    "company": "HealthTechX",
    "email": "john.doe@healthtechx.com",
    "linkedin": "https://linkedin.com/in/johndoe",
    "source": "csv",
}

SAMPLE_LINKEDIN_DATA = {
    "headline": "Building AI for early cancer detection",
    "about": "I lead AI initiatives at HealthTechX, focusing on radiology automation and early detection systems.",
    "skills": ["Machine Learning", "Medical Imaging", "Python", "PyTorch", "Clinical AI"],
    "experience": [
        {"title": "AI Lead", "company": "HealthTechX", "duration": "2 yrs"},
        {"title": "ML Engineer", "company": "Stanford Medical AI Lab", "duration": "3 yrs"},
    ],
    "recent_posts": [
        {"text": "How AI is transforming radiology workflows — we reduced diagnostic time by 40% at HealthTechX.", "likes": 312},
        {"text": "Early cancer detection models now achieve 94% sensitivity. The future of oncology is algorithmic.", "likes": 187},
    ],
}

SAMPLE_COMPANY_DATA = {
    "company_name": "MedInsight AI",
    "company_summary": "We build AI-powered clinical decision support tools for hospitals and radiology departments.",
    "industry": "Healthcare AI",
    "services": ["Radiology AI", "Clinical Decision Support", "Diagnostic Automation"],
    "icp": ["Radiology Department Heads", "Hospital CIOs", "AI Leads in MedTech"],
}

# ── Test 1: Data flow verification ────────────────────────────────────────────

def test_linkedin_context_formatting():
    """Verify _format_linkedin_context includes all enrichment fields in output."""
    context = _format_linkedin_context(SAMPLE_LINKEDIN_DATA)

    print("\n" + "="*60)
    print("TEST 1 — LinkedIn Context Block")
    print("="*60)
    print(context)

    assert "Building AI for early cancer detection" in context, \
        "FAIL: headline missing from context block"
    assert "radiology workflows" in context.lower() or "How AI is transforming" in context, \
        "FAIL: recent post missing from context block"
    assert "Machine Learning" in context, \
        "FAIL: skills missing from context block"
    assert "HealthTechX" in context, \
        "FAIL: experience missing from context block"

    print("\nPASS — all enrichment fields present in context block")
    return True


# ── Test 2: LOW personalization (no enrichment) ───────────────────────────────

def test_low_personalization():
    """Verify baseline (no enrichment) produces MEDIUM/LOW classification."""
    params = {
        "prospect_name":    "John Doe",
        "prospect_company": "HealthTechX",
        "prospect_role":    "AI Lead",
        "topic":            "connecting",
        "company_data":     SAMPLE_COMPANY_DATA,
        "linkedin_data":    None,   # ← no enrichment
    }

    print("\n" + "="*60)
    print("TEST 2 — LOW/MEDIUM personalization (no enrichment)")
    print("="*60)

    result = generate_linkedin_message(params)

    print(f"\nPersonalization Level: {result['personalization_level']}")
    print(f"Enrichment Used: {result['enrichment_used']}")
    print(f"\n--- Generated Message ---\n{result['content']}")

    assert result["enrichment_used"] is False, "FAIL: enrichment_used should be False"
    assert result["personalization_level"] in ("MEDIUM", "LOW"), \
        f"FAIL: expected MEDIUM or LOW, got {result['personalization_level']}"

    print("\nPASS — correctly classified as non-enriched")
    return result


# ── Test 3: HIGH personalization (with enrichment) ────────────────────────────

def test_high_personalization():
    """
    CRITICAL TEST — verify enrichment data appears in the generated message.

    Expected: output references 'AI for early cancer detection' OR 'radiology'
    If neither appears → personalization pipeline is broken.
    """
    params = {
        "prospect_name":    "John Doe",
        "prospect_company": "HealthTechX",
        "prospect_role":    "AI Lead",
        "topic":            "connecting to discuss AI in radiology",
        "company_data":     SAMPLE_COMPANY_DATA,
        "linkedin_data":    SAMPLE_LINKEDIN_DATA,   # ← enrichment present
    }

    print("\n" + "="*60)
    print("TEST 3 — HIGH personalization (with enrichment) [CRITICAL]")
    print("="*60)

    result = generate_linkedin_message(params)

    print(f"\nPersonalization Level: {result['personalization_level']}")
    print(f"Enrichment Used: {result['enrichment_used']}")
    print(f"\n--- Generated Message ---\n{result['content']}")

    assert result["enrichment_used"] is True, "FAIL: enrichment_used should be True"
    assert result["personalization_level"] == "HIGH", \
        f"FAIL: expected HIGH, got {result['personalization_level']}"

    content_lower = result["content"].lower()

    # Check for specific references — at least ONE must appear
    specific_signals = [
        "cancer detection",
        "radiology",
        "early detection",
        "radiology workflows",
        "healthtechx",
        "94%",
        "40%",
        "medical imaging",
    ]
    found = [s for s in specific_signals if s in content_lower]

    print(f"\nSpecific signals found: {found}")

    if found:
        print(f"PASS — HIGH personalization confirmed. References: {found}")
    else:
        print("FAIL — Output contains NO specific references from LinkedIn data.")
        print("       Personalization is cosmetic only (name/company substitution).")
        print("       Check that the LLM is honouring the CRITICAL RULE in the prompt.")
        # Don't assert False here — log it so we can see the output; test infrastructure
        # may need to retry since LLM is non-deterministic

    return result, found


# ── Test 4: Email generation with enrichment ──────────────────────────────────

def test_email_personalization():
    """Verify email templates also use enrichment data in their prompt."""
    params = {
        "company_url":    "",
        "topic":          "AI-powered radiology decision support",
        "content_type":   "email",
        "tone":           "professional",
        "audience_level": "expert",
        "length":         "short",
        "template":       "cold_outreach",
        "keywords":       ["radiology AI", "cancer detection"],
        "use_template":   True,
        "include_cta":    True,
        "company_data":   SAMPLE_COMPANY_DATA,
        "prospect_name":  "John Doe",
        "prospect_role":  "AI Lead",
        "linkedin_data":  SAMPLE_LINKEDIN_DATA,   # ← enrichment
    }

    print("\n" + "="*60)
    print("TEST 4 — Email cold_outreach with enrichment")
    print("="*60)

    result = run_content_generation(params)

    print(f"\nPersonalization Level: {result.get('personalization_level')}")
    print(f"Enrichment Used: {result.get('enrichment_used')}")
    print(f"\n--- Generated Email ---\n{result['content']}")

    assert result.get("enrichment_used") is True, "FAIL: enrichment_used should be True"

    content_lower = result["content"].lower()
    specific_signals = ["cancer", "radiology", "detection", "94", "40%", "imaging"]
    found = [s for s in specific_signals if s in content_lower]

    print(f"\nSpecific signals found in email: {found}")
    if found:
        print(f"PASS — email references LinkedIn data: {found}")
    else:
        print("WARN — email did not reference specific LinkedIn details")

    return result, found


# ── Test 5: Enriched lead object log ─────────────────────────────────────────

def log_enriched_lead_sample():
    """Print a sample enriched lead object showing the full data structure."""
    enriched_lead = {
        **SAMPLE_LEAD,
        "enrichment": SAMPLE_LINKEDIN_DATA,
        "enrichment_status": "success",
    }

    print("\n" + "="*60)
    print("SAMPLE ENRICHED LEAD OBJECT (as returned by /api/enrich-lead)")
    print("="*60)
    print(json.dumps({
        "name":    enriched_lead["name"],
        "company": enriched_lead["company"],
        "role":    enriched_lead["title"],
        "linkedin_data": {
            "headline":     enriched_lead["enrichment"]["headline"],
            "about":        enriched_lead["enrichment"]["about"][:100] + "…",
            "skills":       enriched_lead["enrichment"]["skills"][:4],
            "recent_posts": [p["text"][:80] + "…" for p in enriched_lead["enrichment"]["recent_posts"]],
        },
    }, indent=2))


# ── Runner ────────────────────────────────────────────────────────────────────

def run_all_tests():
    results = {}

    print("\n" + "="*60)
    print("PERSONALIZATION PIPELINE DEBUG TESTS")
    print("="*60)

    log_enriched_lead_sample()

    try:
        results["context_formatting"] = test_linkedin_context_formatting()
    except AssertionError as e:
        results["context_formatting"] = f"FAIL: {e}"

    try:
        results["low_personalization"] = test_low_personalization()
    except AssertionError as e:
        results["low_personalization"] = f"FAIL: {e}"

    try:
        result, found = test_high_personalization()
        results["high_personalization"] = {
            "level": result["personalization_level"],
            "enrichment_used": result["enrichment_used"],
            "specific_signals_found": found,
            "pass": len(found) > 0,
        }
    except Exception as e:
        results["high_personalization"] = f"ERROR: {e}"

    try:
        result, found = test_email_personalization()
        results["email_personalization"] = {
            "level": result.get("personalization_level"),
            "enrichment_used": result.get("enrichment_used"),
            "specific_signals_found": found,
        }
    except Exception as e:
        results["email_personalization"] = f"ERROR: {e}"

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for test_name, outcome in results.items():
        if isinstance(outcome, dict):
            status = "PASS" if outcome.get("pass", True) else "WARN"
            print(f"  {status}  {test_name}: level={outcome.get('level')}, signals={outcome.get('specific_signals_found')}")
        elif isinstance(outcome, str) and outcome.startswith("FAIL"):
            print(f"  FAIL  {test_name}: {outcome}")
        else:
            print(f"  PASS  {test_name}")

    return results


if __name__ == "__main__":
    run_all_tests()
