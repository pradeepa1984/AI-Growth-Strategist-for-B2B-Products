"""
Content Generation Module — Template-based AI content creation.

Supports blog and email content types, each with 4 templates.
The LLM fills structured placeholders rather than generating free-form content,
ensuring consistency, reduced token usage, and predictable output structure.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3

logger = logging.getLogger(__name__)

# ── Template Definitions ───────────────────────────────────────────────────────

BLOG_TEMPLATES = {
    "listicle": {
        "name": "Listicle (Top 5 / Top 10)",
        "description": "Numbered list format — great for tips, tools, or ranked insights.",
        "structure": (
            "## {title}\n\n"
            "{intro}\n\n"
            "### 1. {item_1_heading}\n{item_1_body}\n\n"
            "### 2. {item_2_heading}\n{item_2_body}\n\n"
            "### 3. {item_3_heading}\n{item_3_body}\n\n"
            "### 4. {item_4_heading}\n{item_4_body}\n\n"
            "### 5. {item_5_heading}\n{item_5_body}\n\n"
            "## Conclusion\n{conclusion}\n\n"
            "{cta}"
        ),
        "placeholders": [
            "title", "intro",
            "item_1_heading", "item_1_body",
            "item_2_heading", "item_2_body",
            "item_3_heading", "item_3_body",
            "item_4_heading", "item_4_body",
            "item_5_heading", "item_5_body",
            "conclusion", "cta",
        ],
    },
    "how_to_guide": {
        "name": "How-to Guide",
        "description": "Step-by-step instructional format — ideal for tutorials and walkthroughs.",
        "structure": (
            "## {title}\n\n"
            "{intro}\n\n"
            "### The Problem\n{problem}\n\n"
            "### Step 1: {step_1_heading}\n{step_1_body}\n\n"
            "### Step 2: {step_2_heading}\n{step_2_body}\n\n"
            "### Step 3: {step_3_heading}\n{step_3_body}\n\n"
            "### The Solution\n{solution}\n\n"
            "{cta}"
        ),
        "placeholders": [
            "title", "intro", "problem",
            "step_1_heading", "step_1_body",
            "step_2_heading", "step_2_body",
            "step_3_heading", "step_3_body",
            "solution", "cta",
        ],
    },
    "thought_leadership": {
        "name": "Thought Leadership",
        "description": "Opinion-driven insight piece — establishes authority and industry perspective.",
        "structure": (
            "## {title}\n\n"
            "{intro}\n\n"
            "### The Core Insight\n{insight}\n\n"
            "### Evidence & Data\n{evidence}\n\n"
            "### Industry Implication\n{implication}\n\n"
            "### Our Vision\n{vision}\n\n"
            "{cta}"
        ),
        "placeholders": [
            "title", "intro", "insight", "evidence", "implication", "vision", "cta",
        ],
    },
    "case_study": {
        "name": "Case Study",
        "description": "Story-driven results showcase — builds trust through real-world outcomes.",
        "structure": (
            "## {title}\n\n"
            "{intro}\n\n"
            "### The Challenge\n{challenge}\n\n"
            "### Our Approach\n{approach}\n\n"
            "### Results & Impact\n{results}\n\n"
            "### Key Lessons\n{lessons}\n\n"
            "{cta}"
        ),
        "placeholders": [
            "title", "intro", "challenge", "approach", "results", "lessons", "cta",
        ],
    },
}

EMAIL_TEMPLATES = {
    "cold_outreach": {
        "name": "Cold Outreach",
        "description": "First-touch email — hooks the reader with a sharp opening line.",
        "structure": (
            "Subject: {subject}\n\n"
            "{greeting}\n\n"
            "{hook}\n\n"
            "{problem}\n\n"
            "{value_prop}\n\n"
            "{cta}\n\n"
            "Best regards,\n[Your Name]"
        ),
        "placeholders": ["subject", "greeting", "hook", "problem", "value_prop", "cta"],
    },
    "product_pitch": {
        "name": "Product Pitch",
        "description": "Product-focused outreach — leads with pain then delivers a compelling solution.",
        "structure": (
            "Subject: {subject}\n\n"
            "{greeting}\n\n"
            "{intro}\n\n"
            "{problem}\n\n"
            "{solution}\n\n"
            "{proof}\n\n"
            "{cta}\n\n"
            "Best regards,\n[Your Name]"
        ),
        "placeholders": ["subject", "greeting", "intro", "problem", "solution", "proof", "cta"],
    },
    "newsletter": {
        "name": "Newsletter",
        "description": "Periodic update format — nurtures leads with value-driven content.",
        "structure": (
            "Subject: {subject}\n\n"
            "{greeting}\n\n"
            "## {headline}\n\n"
            "{content_block_1}\n\n"
            "---\n\n"
            "{content_block_2}\n\n"
            "---\n\n"
            "{cta}\n\n"
            "Best regards,\n[Your Name]"
        ),
        "placeholders": ["subject", "greeting", "headline", "content_block_1", "content_block_2", "cta"],
    },
    "follow_up": {
        "name": "Follow-up",
        "description": "Re-engagement email — references prior contact and adds new value.",
        "structure": (
            "Subject: {subject}\n\n"
            "{greeting}\n\n"
            "{reference}\n\n"
            "{value_add}\n\n"
            "{urgency}\n\n"
            "{cta}\n\n"
            "Best regards,\n[Your Name]"
        ),
        "placeholders": ["subject", "greeting", "reference", "value_add", "urgency", "cta"],
    },
}

TEMPLATES = {
    "blog":  BLOG_TEMPLATES,
    "email": EMAIL_TEMPLATES,
}

# ── Generation Config ──────────────────────────────────────────────────────────

LENGTH_GUIDES = {
    "short":  "Keep each section concise (1-2 sentences). Total target: ~200-300 words.",
    "medium": "Write with moderate depth (2-4 sentences per section). Total target: ~400-600 words.",
    "long":   "Write in-depth, rich content (4-6 sentences per section). Total target: ~700-1000 words.",
}

AUDIENCE_GUIDES = {
    "beginner":     "Use plain language. Avoid jargon. Explain concepts from scratch as if the reader is new to this topic.",
    "intermediate": "Assume basic domain familiarity. Use industry terms but briefly clarify complex concepts.",
    "expert":       "Use advanced technical language freely. Skip foundational explanations; focus on nuance, depth, and specifics.",
}

TONE_GUIDES = {
    "professional": """\
TONE: PROFESSIONAL — Apply these rules to every sentence:
- Use formal, authoritative language. Write "do not" not "don't". Write "utilise" not "use".
- Maintain structured, complete sentences. No fragments or casual phrasing.
- Address the reader as "organisations", "teams", or "professionals" — not "you" or "we".
- Use industry-standard terminology confidently, without over-explaining basics.
- Zero humor, zero slang, zero rhetorical questions.
- Example sentence style: "Effective implementation of AI-driven workflows requires a structured governance framework." """,

    "conversational": """\
TONE: CONVERSATIONAL — Apply these rules to every sentence:
- Write exactly as you'd speak to a smart friend over coffee. Be natural, not corporate.
- Use contractions in EVERY paragraph: it's, you're, we're, don't, can't, that's, here's.
- Open sections with a relatable hook: "Ever noticed how...", "Here's the thing...", "Let's be honest..."
- Use "you" frequently. Make the reader feel you're speaking directly to them.
- Add at least one rhetorical question per section: "Sound familiar?" / "Pretty neat, right?"
- Replace formal words: "however" → "but", "commence" → "start", "facilitate" → "help".
- Keep sentences short. Punchy. Easy to scan.
- Absolutely ZERO corporate jargon, buzzwords, or formal passive constructions.
- Example sentence style: "Here's the thing — most teams don't realise how much time they're wasting on manual workflows. But once you've seen what AI can do? You won't go back." """,

    "persuasive": """\
TONE: PERSUASIVE — Apply these rules to every sentence:
- Every sentence must build toward a decision or action. No neutral observations.
- Lead EVERY section with the reader's pain point, then bridge immediately to the solution.
- Use power words throughout: "proven", "transform", "unlock", "instantly", "eliminate", "dominate".
- Active voice ONLY. Never passive. "AI drives results" not "Results are driven by AI."
- Use the rule of three for emphasis: "faster, smarter, more profitable."
- Create urgency: reference competition, opportunity cost, or time sensitivity.
- Back every claim with a concrete outcome, number, or specific result.
- End each section with forward momentum: "The question isn't whether to act — it's how fast."
- The CTA must be bold, specific, and unmissable.
- Example sentence style: "Every day without an AI-powered workflow is a day your competitors pull ahead. The teams winning right now aren't working harder — they're working smarter. Here's how to join them." """,

    "technical": """\
TONE: TECHNICAL — Apply these rules to every sentence:
- Use precise, domain-specific terminology. Assume the reader is an expert practitioner.
- Prioritise accuracy over readability. Never sacrifice correctness for narrative flow.
- Include specific metrics, thresholds, parameters, or version references where relevant.
- Use structured, information-dense sentences. No padding, no filler phrases.
- Passive voice is acceptable when the subject is less important than the action.
- Avoid metaphors, analogies, and marketing language entirely.
- Every claim must be falsifiable — avoid vague superlatives like "best" or "leading".
- Use imperative constructions for recommendations: "Configure X before enabling Y."
- Zero emotional language, zero motivational phrases.
- Example sentence style: "Deploying transformer-based NLP pipelines at inference latency under 50ms requires quantisation (INT8 or FP16) combined with batching strategies optimised for your hardware profile." """,

    "friendly": """\
TONE: FRIENDLY — Apply these rules to every sentence:
- Be genuinely warm, encouraging, and supportive. Write as if you care about the reader's success.
- Open every section with something positive or affirming: "Great news!", "You're already ahead of the curve!"
- Use inclusive, collaborative language throughout: "we", "together", "let's", "our journey".
- Add light encouragement after complex points: "Don't worry — this gets much easier once you try it!"
- Use positive, emotive adjectives: "exciting", "empowering", "rewarding", "wonderful opportunity".
- Keep sentences short, warm, and accessible. Simple words beat technical terms every time.
- Sprinkle in light enthusiasm: "And the best part?", "Here's something exciting:", "We love this bit:"
- The CTA should feel like a warm, friendly invitation — never a demand or pressure tactic.
- Example sentence style: "And here's the exciting part — you don't need to be a tech expert to get started! We've made this as simple as possible, and we're right here with you every step of the way." """,
}


# ── LLM Client ────────────────────────────────────────────────────────────────

def _bedrock_client():
    session = boto3.Session(
        profile_name="Website-intel-dev",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    return session.client("bedrock-runtime")


def _call_llm(prompt: str, max_tokens: int = 4096) -> str:
    client   = _bedrock_client()
    model_id = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-haiku-20241022-v1:0")
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    })
    response      = client.invoke_model(modelId=model_id, body=body, contentType="application/json", accept="application/json")
    response_body = json.loads(response["body"].read())
    return response_body["content"][0]["text"]


# ── Prompt Builder ─────────────────────────────────────────────────────────────

def _build_template_prompt(
    topic: str,
    template: dict,
    template_key: str,
    content_type: str,
    tone: str,
    audience_level: str,
    length: str,
    keywords: list[str],
    include_cta: bool,
    company_data: dict,
    prospect_name: str | None = None,
    prospect_role: str | None = None,
    linkedin_data: dict | None = None,   # ← Apify enrichment payload
) -> str:
    company_name    = company_data.get("company_name", "the company")
    company_summary = company_data.get("company_summary", "")
    industry        = company_data.get("industry", "")
    services        = ", ".join(company_data.get("services", []))
    icp             = ", ".join(company_data.get("icp", []))

    length_guide   = LENGTH_GUIDES.get(length, LENGTH_GUIDES["medium"])
    audience_guide = AUDIENCE_GUIDES.get(audience_level, AUDIENCE_GUIDES["intermediate"])
    tone_guide     = TONE_GUIDES.get(tone, TONE_GUIDES["professional"])

    # SEO keyword guidance — encourage heading use and density for blog content
    if keywords:
        if content_type == "blog":
            keyword_line = (
                f"SEO Keywords — weave these naturally into headings and body text: {', '.join(keywords)}. "
                "Use at least one keyword in the title and at least two in section headings. "
                "Maintain natural readability — never keyword-stuff."
            )
        else:
            keyword_line = f"SEO Keywords to naturally weave in: {', '.join(keywords)}."
    else:
        keyword_line = "No specific SEO keywords required."

    cta_note = (
        "Include a clear, action-oriented Call-to-Action (CTA) in the `cta` placeholder."
        if include_cta else
        "The `cta` placeholder should be a soft close — no hard sell."
    )

    # Prospect personalization for email templates
    prospect_note = ""
    if content_type == "email" and prospect_name:
        greeting_instruction = f"Dear {prospect_name},"
        if prospect_role:
            greeting_instruction += f" (their role: {prospect_role})"
        prospect_note = (
            f"\n## Prospect Personalization\n"
            f"- Recipient Name: {prospect_name}\n"
            f"- Recipient Role: {prospect_role or 'Not specified'}\n"
            f"- The `greeting` placeholder MUST start with: \"{greeting_instruction.split('(')[0].strip()}\"\n"
            f"- Reference their role ({prospect_role or 'decision-maker'}) when relevant to build rapport.\n"
        )
        # Append LinkedIn enrichment data if available — this is what elevates
        # personalization from MEDIUM (name/role only) to HIGH (specific profile details)
        li_block = _format_linkedin_context(linkedin_data or {})
        if li_block:
            prospect_note += (
                li_block + "\n"
                "- REQUIREMENT: The `hook` or `problem` placeholder MUST reference at least ONE\n"
                "  specific detail from the LinkedIn profile above (headline, post, skill, or experience).\n"
                "  A generic email that ignores these details is incorrect output.\n"
            )

    placeholders_list = json.dumps(template["placeholders"], indent=2)

    # SEO structure hint for blog content
    seo_hint = ""
    if content_type == "blog":
        seo_hint = (
            "\n## SEO & Readability Rules\n"
            "- Title must be compelling, keyword-rich, and under 60 characters.\n"
            "- Each section heading should be specific and descriptive (not generic like 'Introduction').\n"
            "- Use short paragraphs (2-4 sentences). Break up walls of text.\n"
            "- Include at least one concrete statistic, example, or data point per section.\n"
            "- Subject lines for email: keep under 50 characters, start with a power verb or number.\n"
        )

    return f"""You are an expert content writer. Your task is to fill a structured {content_type} template with high-quality content.

══════════════════════════════════════════
TONE REQUIREMENT — READ THIS FIRST
══════════════════════════════════════════
{tone_guide}

This tone must be unmistakably present in EVERY placeholder you fill.
A reader should immediately recognise the tone from the first sentence.
If you write in the wrong tone, the output is incorrect regardless of content quality.
══════════════════════════════════════════

## Company Context
- Company: {company_name}
- Industry: {industry}
- Services: {services}
- Target Audience: {icp}
- Summary: {company_summary}
{prospect_note}
## Content Brief
- Topic: "{topic}"
- Format: {content_type.upper()} — {template["name"]}
- Audience Level: {audience_level.capitalize()} — {audience_guide}
- Length: {length.capitalize()} — {length_guide}
- {keyword_line}
- {cta_note}
{seo_hint}
## Template Placeholders
{placeholders_list}

## Rules
1. Fill EVERY placeholder — do not skip any.
2. Write complete prose for each value (no placeholder names in the output).
3. ⚠️  TONE IS THE TOP PRIORITY — re-read the tone rules above before writing each placeholder.
4. Apply tone consistently: sentence structure, word choice, and style must all reflect it.
5. Stay focused on the topic: "{topic}".
6. Do not invent company details not listed above.
7. For email greeting: use the exact prospect name if provided — never use a placeholder like "[Name]".

## Output Format
Return a single valid JSON object. Each key = placeholder name, each value = filled content string.

{{
  "title": "...",
  "intro": "...",
  ...
}}

CRITICAL: Return ONLY the raw JSON object. No markdown fences, no explanation."""


# ── Main Entry Point ───────────────────────────────────────────────────────────

def run_content_generation(params: dict) -> dict:
    """
    Generate content using template-based approach.

    Required params:
        company_url, topic, content_type, tone, audience_level,
        length, template, keywords, use_template, include_cta, company_data
    """
    topic          = params["topic"]
    content_type   = params.get("content_type", "blog")
    tone           = params.get("tone", "professional")
    audience_level = params.get("audience_level", "intermediate")
    length         = params.get("length", "medium")
    template_key   = params.get("template", "")
    keywords       = params.get("keywords", [])
    use_template   = params.get("use_template", True)
    include_cta    = params.get("include_cta", True)
    company_data   = params.get("company_data", {})
    prospect_name  = params.get("prospect_name") or None
    prospect_role  = params.get("prospect_role") or None
    linkedin_data  = params.get("linkedin_data") or None   # Apify enrichment payload

    template_registry = TEMPLATES.get(content_type, {})
    template          = template_registry.get(template_key) if use_template else None

    # ── Free-form fallback (no template selected) ──────────────────────────────
    if not template:
        logger.info(f"No template selected — free-form generation for topic: {topic}")
        company_name = company_data.get("company_name", "the company")
        kw_line = f" Include keywords: {', '.join(keywords)}." if keywords else ""
        prompt = (
            f"Write a {content_type} about \"{topic}\" for {company_name} "
            f"(industry: {company_data.get('industry', 'technology')}).\n"
            f"Tone: {tone}. Audience: {audience_level}. Length: {length}.{kw_line}"
        )
        content = _call_llm(prompt)
        return {
            "topic":           topic,
            "content_type":    content_type,
            "template_used":   "free_form",
            "template_name":   "Free Form",
            "content":         content,
            "structured_content": {},
            "tone":            tone,
            "audience_level":  audience_level,
            "length":          length,
            "keywords":        keywords,
            "generated_at":    datetime.now(timezone.utc).isoformat(),
        }

    # ── Template-based generation ──────────────────────────────────────────────
    logger.info(f"Template generation: {content_type}/{template_key} for topic: {topic}")

    prompt = _build_template_prompt(
        topic=topic,
        template=template,
        template_key=template_key,
        content_type=content_type,
        tone=tone,
        audience_level=audience_level,
        length=length,
        keywords=keywords,
        include_cta=include_cta,
        company_data=company_data,
        prospect_name=prospect_name,
        prospect_role=prospect_role,
        linkedin_data=linkedin_data,
    )

    raw = _call_llm(prompt, max_tokens=4096)

    # Parse JSON response — strip markdown code fences if present
    filled: dict = {}
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
            cleaned = match.group(1).strip() if match else cleaned.split("```", 2)[1].strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        filled = json.loads(cleaned)
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON response: {e}\nRaw:\n{raw[:500]}")
        return {
            "topic":              topic,
            "content_type":       content_type,
            "template_used":      template_key,
            "template_name":      template["name"],
            "content":            raw,
            "structured_content": {},
            "tone":               tone,
            "audience_level":     audience_level,
            "length":             length,
            "keywords":           keywords,
            "generated_at":       datetime.now(timezone.utc).isoformat(),
            "parse_error":        True,
        }

    # Guarantee email greeting is "Dear {first_name}," — override LLM value
    if content_type == "email" and "greeting" in filled:
        if prospect_name and prospect_name.strip():
            first_name = prospect_name.strip().split()[0]
            filled["greeting"] = f"Dear {first_name},"
        else:
            filled["greeting"] = "Dear Sir/Madam,"

    # Render template: substitute each {placeholder} with filled value
    rendered = template["structure"]
    for key, value in filled.items():
        rendered = rendered.replace(f"{{{key}}}", str(value))

    personalization_level = (
        "HIGH" if linkedin_data else
        ("MEDIUM" if prospect_role else "LOW")
    )

    return {
        "topic":                 topic,
        "content_type":          content_type,
        "template_used":         template_key,
        "template_name":         template["name"],
        "content":               rendered.strip(),
        "structured_content":    filled,
        "tone":                  tone,
        "audience_level":        audience_level,
        "length":                length,
        "keywords":              keywords,
        "include_cta":           include_cta,
        "personalization_level": personalization_level,
        "enrichment_used":       bool(linkedin_data),
        "generated_at":          datetime.now(timezone.utc).isoformat(),
    }


# ── SEO Keyword Suggestions ───────────────────────────────────────────────────

def suggest_seo_keywords(topic: str, company_data: dict) -> list[str]:
    """
    Use the LLM to suggest high-value SEO keywords for a given topic and company context.
    Returns a flat list of keyword strings.
    """
    company_name = company_data.get("company_name", "the company")
    industry     = company_data.get("industry", "technology")
    services     = ", ".join(company_data.get("services", []))
    icp          = ", ".join(company_data.get("icp", []))

    prompt = f"""You are an SEO specialist. Suggest 12 high-value SEO keywords for the following content brief.

## Context
- Topic: "{topic}"
- Company: {company_name}
- Industry: {industry}
- Services/Products: {services or "not specified"}
- Target Audience (ICP): {icp or "B2B decision makers"}

## Rules
1. Mix short-tail (1-2 words) and long-tail (3-5 words) keywords.
2. Prioritize keywords with clear search intent (informational or commercial).
3. Include at least 3 question-style keywords (e.g. "how to...", "what is...").
4. Make them specific and relevant — no generic filler terms.
5. Order by estimated search value (highest first).

## Output Format
Return a JSON array of exactly 12 keyword strings. No explanations, no numbering.
["keyword one", "keyword two", ...]

CRITICAL: Return ONLY the raw JSON array."""

    raw = _call_llm(prompt, max_tokens=512).strip()
    try:
        cleaned = raw
        if cleaned.startswith("```"):
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
            cleaned = match.group(1).strip() if match else cleaned.split("```", 2)[1].strip()
        keywords = json.loads(cleaned)
        if isinstance(keywords, list):
            return [str(k).strip() for k in keywords if k][:12]
    except Exception:
        pass
    # Fallback: extract comma-separated values if JSON fails
    flat = re.sub(r'[\[\]"]', "", raw)
    return [k.strip() for k in flat.split(",") if k.strip()][:12]


# ── LinkedIn Message Generation ────────────────────────────────────────────────

def _format_linkedin_context(linkedin_data: dict) -> str:
    """
    Format Apify-enriched LinkedIn data into a structured prompt block.
    Returns an empty string if no enrichment data is available.
    """
    if not linkedin_data:
        return ""

    lines = ["\n## Prospect's LinkedIn Profile (USE THESE DETAILS — they are real and verified)"]

    headline = linkedin_data.get("headline", "").strip()
    if headline:
        lines.append(f"- Headline: \"{headline}\"")

    about = linkedin_data.get("about", "").strip()
    if about:
        lines.append(f"- About / Bio: {about[:300]}")

    skills = linkedin_data.get("skills") or []
    if skills:
        lines.append(f"- Top Skills: {', '.join(str(s) for s in skills[:6])}")

    experience = linkedin_data.get("experience") or []
    if experience:
        exp_strs = []
        for e in experience[:2]:
            if isinstance(e, dict):
                title    = e.get("title", "")
                company  = e.get("company", "")
                duration = e.get("duration", "")
                if title:
                    exp_strs.append(f"{title} at {company} ({duration})" if company else title)
            elif isinstance(e, str) and e.strip():
                exp_strs.append(e.strip())
        if exp_strs:
            lines.append(f"- Experience: {'; '.join(exp_strs)}")

    posts = linkedin_data.get("recent_posts") or []
    if posts:
        post_texts = []
        for p in posts[:2]:
            if isinstance(p, dict):
                text = p.get("text", "").strip()
                if text:
                    post_texts.append(text)
            elif isinstance(p, str) and p.strip():
                post_texts.append(p.strip())
        if post_texts:
            lines.append("- Recent Posts (their actual words — reference these naturally):")
            for pt in post_texts:
                lines.append(f'    • "{pt[:200]}"')

    return "\n".join(lines) if len(lines) > 1 else ""


def generate_linkedin_message(params: dict) -> dict:
    """
    Generate a short, personalized LinkedIn outreach message.

    Personalization tiers (in priority order):
      HIGH   — uses linkedin_data (headline, recent_posts, skills, experience)
      MEDIUM — uses prospect name, company, role only
      LOW    — generic fallback (no prospect info at all)

    linkedin_data is populated by Apify enrichment (apify_enrichment.py).
    It must be explicitly passed in params["linkedin_data"] — it is NOT
    auto-fetched here. The caller (API endpoint) is responsible for passing it.
    """
    prospect_name    = params.get("prospect_name", "there")
    prospect_company = params.get("prospect_company", "your company")
    prospect_role    = params.get("prospect_role", "")
    company_data     = params.get("company_data", {})
    topic            = params.get("topic", "connecting")
    linkedin_data    = params.get("linkedin_data") or {}   # ← Apify enrichment payload

    company_name    = company_data.get("company_name", "our company")
    company_summary = company_data.get("company_summary", "")
    services        = ", ".join(company_data.get("services", []))

    first_name = prospect_name.split()[0] if prospect_name and prospect_name != "there" else prospect_name

    # Build the LinkedIn context block (empty string if no enrichment)
    linkedin_context = _format_linkedin_context(linkedin_data)
    has_enrichment = bool(linkedin_context)

    # Personalization instruction changes based on whether enrichment exists
    if has_enrichment:
        personalization_rule = (
            "CRITICAL RULE: You MUST reference at least ONE specific detail from the "
            "LinkedIn profile above — their headline, a recent post topic, a specific skill, "
            "or a career milestone. Generic messages that could apply to anyone are WRONG. "
            "The recipient should immediately feel you've actually read their profile."
        )
    else:
        personalization_rule = (
            "Reference their company or role to show you've done your homework."
        )

    prompt = f"""You are writing a short, highly personalized LinkedIn outreach message.
{linkedin_context}
## Basic Prospect Info
- First Name: {first_name}
- Company: {prospect_company}
- Role: {prospect_role or "professional"}

## Sender's Company
- Name: {company_name}
- Services: {services or "AI-powered solutions"}
- Context: {company_summary}

## Outreach Topic / Purpose
{topic}

## Rules
1. Write ONLY the message body — no Subject line, no headers, no labels.
2. Maximum 3-4 short sentences. Brevity is crucial for LinkedIn.
3. Tone: warm, human, and conversational — genuine, not salesy.
4. Use the prospect's first name naturally in the opening.
5. {personalization_rule}
6. End with a light, low-pressure call-to-action ("Would love to connect!", "Open to a quick chat?").
7. Do NOT use square brackets, placeholder text, or template markers.
8. Do NOT start with "Hi [Name]" — write it properly as natural prose.

Return ONLY the message text. No explanation, no quotes, no JSON."""

    message = _call_llm(prompt, max_tokens=512).strip()

    # Classify personalization level for caller transparency
    personalization_level = "HIGH" if has_enrichment else ("MEDIUM" if prospect_role else "LOW")

    return {
        "content":               message,
        "content_type":          "linkedin",
        "template_used":         "linkedin",
        "template_name":         "LinkedIn Message",
        "topic":                 topic,
        "prospect_name":         prospect_name,
        "personalization_level": personalization_level,
        "enrichment_used":       has_enrichment,
        "generated_at":          datetime.now(timezone.utc).isoformat(),
    }


# ── Template Catalogue (for frontend discovery) ────────────────────────────────

def get_template_catalogue() -> dict:
    """Return all available templates with metadata (no structure/prompt details)."""
    result = {}
    for ct, templates in TEMPLATES.items():
        result[ct] = [
            {"key": k, "name": v["name"], "description": v["description"]}
            for k, v in templates.items()
        ]
    return result
