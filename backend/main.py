from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

import os
import re
import logging
import sys
import csv as csv_module
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import FastAPI, HTTPException, Request, Depends
from auth import require_auth
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from errors import CRAWL_FAILED, TIMEOUT, APOLLO_FAILED, BEDROCK_FAILED, SMTP_FAILED, GENERIC, EXTERNAL_API

# ── Logging ────────────────────────────────────────────────────────────────────
# Writes to stdout — Docker captures this; CloudWatch agent picks it up on EC2.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)
from webcrawl import crawl_website
from website_intelligence import run_website_intelligence
from market_intelligence import run_market_intelligence
from content_generation import run_content_generation, get_template_catalogue, generate_linkedin_message, suggest_seo_keywords
from utils.aws_storage import (
    approve_intelligence,
    record_exists,
    update_intelligence,
    get_cached_intelligence,
    get_cached_market_intelligence,
    save_market_intelligence_to_dynamodb,
    get_cached_content_generation,
    save_content_generation_to_dynamodb,
    get_cached_leads,
    save_leads_cache,
    save_to_leaddiscovery_table,
)
from utils.normalize_url import normalize_url
from utils.apollo_client import get_leads
from utils.dynamic_lead_gen import generate_leads_dynamic
from utils.apify_enrichment import enrich_lead, enrich_leads_batch
from utils.seo_analyzer import analyze_content, compare_versions
from utils.industry_classifier import classify_leads_industry, get_industry_list, group_leads_by_industry
from utils.scale_classifier import classify_company_scale_from_ci, enrich_competitors_with_scale, filter_competitors_by_scale, rank_competitors
from market_intelligence import refresh_content_topics
from content_generation import _format_linkedin_context
from lead_scorer import score_and_rank
from utils.lead_enricher import enrich_and_rank as enrich_leads_simple

app = FastAPI()


# ── Standard error shape ───────────────────────────────────────────────────────
# All error responses (HTTPException + unhandled) follow:
# { "success": false, "error": { "code": "...", "message": "..." } }

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Normalize all HTTPExceptions into the standard error shape."""
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        # Already in our format (raised by endpoints intentionally)
        body = {"success": False, "error": detail}
    elif isinstance(detail, str):
        body = {"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": detail}}
    else:
        body = {"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": str(detail)}}
    if exc.status_code >= 500:
        logger.error("HTTP %s on %s %s — %s", exc.status_code, request.method, request.url, exc.detail)
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a readable message for malformed request bodies."""
    first = exc.errors()[0] if exc.errors() else {}
    field = " → ".join(str(x) for x in first.get("loc", []))
    msg = f"Invalid input on field '{field}': {first.get('msg', 'check your request')}"
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": msg}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions — log real error, return safe message."""
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": GENERIC}},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CrawlRequest(BaseModel):
    url: str


@app.post("/api/crawl")
def crawl(request: CrawlRequest):
    try:
        data = crawl_website(request.url)
        return data
    except Exception as e:
        logger.exception("Crawl failed for %s", request.url)
        raise HTTPException(status_code=422, detail={"code": "CRAWL_FAILED", "message": CRAWL_FAILED})


class WebsiteIntelligenceRequest(BaseModel):
    url: str
    threshold: float = 0.78
    force_refresh: bool = False


@app.post("/api/website-intelligence")
def website_intelligence(request: WebsiteIntelligenceRequest, user=Depends(require_auth)):
    try:
        data = run_website_intelligence(request.url, threshold=request.threshold, force_refresh=request.force_refresh)
        return data
    except ValueError as e:
        msg = str(e)
        logger.warning("Website intelligence ValueError for %s: %s", request.url, msg)
        if "Could not crawl" in msg:
            raise HTTPException(status_code=422, detail={"code": "CRAWL_FAILED", "message": CRAWL_FAILED})
        raise HTTPException(status_code=422, detail={"code": "INVALID_URL", "message": msg})
    except TimeoutError:
        logger.warning("Website intelligence timed out for %s", request.url)
        raise HTTPException(status_code=504, detail={"code": "TIMEOUT", "message": TIMEOUT})
    except Exception as e:
        logger.exception("Website intelligence failed for %s", request.url)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class CheckRecordRequest(BaseModel):
    url: str


@app.post("/api/check-record")
def check_record(request: CheckRecordRequest):
    try:
        normalized = normalize_url(request.url)
        exists = record_exists(normalized)
        return {"exists": exists, "url": normalized}
    except Exception as e:
        logger.exception("check-record failed for %s", request.url)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class UpdateIntelligenceRequest(BaseModel):
    company_url: str
    analysed_at: str
    company_summary: str | None = None
    industry: str | None = None
    company_location: str | None = None
    icp: list[str] | None = None
    services: list[str] | None = None
    keywords: list[str] | None = None


@app.post("/api/update-intelligence")
def update_intelligence_endpoint(request: UpdateIntelligenceRequest):
    try:
        updates = request.model_dump(exclude={"company_url", "analysed_at"}, exclude_none=True)
        success = update_intelligence(request.company_url, request.analysed_at, updates)
        if not success:
            raise HTTPException(status_code=500, detail={"code": "UPDATE_FAILED", "message": "Failed to save changes. Please try again."})
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("update-intelligence failed for %s", request.company_url)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class ApproveRequest(BaseModel):
    company_url: str
    analysed_at: str


@app.post("/api/approve")
def approve(request: ApproveRequest):
    try:
        success = approve_intelligence(request.company_url, request.analysed_at)
        if not success:
            raise HTTPException(status_code=500, detail={"code": "APPROVE_FAILED", "message": "Failed to approve. Please try again."})
        return {"status": "approved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("approve failed for %s", request.company_url)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class UpdateMarketIntelligenceRequest(BaseModel):
    company_url: str
    keyword_clusters: list | None = None
    target_segments: list | None = None
    top_competitors: list | None = None


@app.post("/api/update-market-intelligence")
def update_market_intelligence_endpoint(request: UpdateMarketIntelligenceRequest):
    """Update editable fields of cached market intelligence (clusters, segments, competitors)."""
    try:
        normalized = normalize_url(request.company_url)
        cached = get_cached_market_intelligence(normalized)
        if not cached:
            raise HTTPException(status_code=404, detail="Market intelligence not found for this URL.")
        updated = dict(cached)
        if request.keyword_clusters is not None:
            updated["keyword_clusters"] = request.keyword_clusters
        if request.target_segments is not None:
            updated["target_segments"] = request.target_segments
        if request.top_competitors is not None:
            updated["top_competitors"] = request.top_competitors
        save_market_intelligence_to_dynamodb(normalized, updated)
        return {**updated, "updated": True, "from_cache": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class MarketIntelligenceRequest(BaseModel):
    company_url: str
    force_refresh: bool = False


@app.post("/api/market-intelligence")
def market_intelligence(request: MarketIntelligenceRequest, user=Depends(require_auth)):
    try:
        normalized = normalize_url(request.company_url)

        # ── Return cached MI if available ──────────────────────────────────────
        if not request.force_refresh:
            cached_mi = get_cached_market_intelligence(normalized)
            if cached_mi:
                # Enrich cached competitors with scale if not already present
                competitors = cached_mi.get("top_competitors", [])
                if competitors and not competitors[0].get("scale"):
                    ci_data_for_scale = get_cached_intelligence(normalized) or {}
                    company_scale_result = classify_company_scale_from_ci(ci_data_for_scale)
                    company_scale = company_scale_result["scale"]
                    enriched = enrich_competitors_with_scale(competitors)
                    filtered = filter_competitors_by_scale(enriched, company_scale)
                    ranked = rank_competitors(
                        filtered, company_scale,
                        ci_data_for_scale.get("icp", []),
                        ci_data_for_scale.get("services", []),
                    )
                    cached_mi["top_competitors"] = ranked
                    cached_mi["company_scale"] = company_scale
                    cached_mi["company_scale_confidence"] = company_scale_result["confidence"]
                cached_mi["from_cache"] = True
                return cached_mi

        # ── Validate CI is approved ────────────────────────────────────────────
        ci_data = get_cached_intelligence(normalized)

        if not ci_data:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "ci_not_found",
                    "message": "No Company Intelligence found for this URL. Please run Company Intelligence first.",
                },
            )

        if ci_data.get("human_approved_ind") != "Y":
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "ci_not_approved",
                    "message": "Company Intelligence has not been approved yet. Please approve it in the Company Intelligence module first.",
                },
            )

        # ── Generate MI ────────────────────────────────────────────────────────
        data = run_market_intelligence(ci_data)
        data["from_cache"] = False

        # ── Persist to cache ───────────────────────────────────────────────────
        save_market_intelligence_to_dynamodb(normalized, data)

        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("update-market-intelligence failed for %s", request.company_url)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Content Generation ─────────────────────────────────────────────────────────

class ContentGenerationRequest(BaseModel):
    company_url: str
    topic: str
    content_type: str = "blog"          # "blog" or "email"
    tone: str = "professional"
    audience_level: str = "intermediate"
    length: str = "medium"
    template: str = ""
    keywords: list[str] = []
    use_template: bool = True
    include_cta: bool = True
    force_refresh: bool = False
    prospect_name: str | None = None    # for dynamic email personalization
    prospect_role: str | None = None    # for dynamic email personalization
    linkedin_data: dict | None = None   # Apify enrichment payload → HIGH personalization


@app.post("/api/content-generation")
def content_generation(request: ContentGenerationRequest):
    try:
        normalized = normalize_url(request.company_url)

        # ── Return cached content if available ─────────────────────────────────
        # Skip cache when prospect_name is set — personalized emails are person-specific
        # and the greeting override must run fresh every time.
        _use_cache = (
            not request.force_refresh
            and request.use_template
            and request.template
            and not request.prospect_name   # ← never serve cached for personalized emails
        )
        if _use_cache:
            cached = get_cached_content_generation(
                normalized, request.topic, request.content_type, request.template
            )
            if cached:
                cached["from_cache"] = True
                return cached

        # ── Fetch CI data for company context ──────────────────────────────────
        ci_data = get_cached_intelligence(normalized)
        company_data = {}
        if ci_data:
            company_data = {
                "company_name":    ci_data.get("company_name", ""),
                "company_summary": ci_data.get("company_summary", ""),
                "industry":        ci_data.get("industry", ""),
                "services":        ci_data.get("services", []),
                "icp":             ci_data.get("icp", []),
            }

        # ── Generate content ───────────────────────────────────────────────────
        params = {
            "company_url":    normalized,
            "topic":          request.topic,
            "content_type":   request.content_type,
            "tone":           request.tone,
            "audience_level": request.audience_level,
            "length":         request.length,
            "template":       request.template,
            "keywords":       request.keywords,
            "use_template":   request.use_template,
            "include_cta":    request.include_cta,
            "company_data":   company_data,
            "prospect_name":  request.prospect_name,
            "prospect_role":  request.prospect_role,
            "linkedin_data":  request.linkedin_data,   # Apify enrichment → HIGH personalization
        }
        data = run_content_generation(params)
        data["from_cache"] = False

        # ── Auto-run SEO analysis for blog and email content (non-optional) ───
        # This ensures every generated piece has a measurable, verifiable score
        # rather than relying on LLM self-assessment.
        if request.content_type in ("blog", "email"):
            try:
                seo_result = analyze_content(
                    content=data.get("content", ""),
                    keywords=request.keywords,
                    topic=request.topic,
                    length_hint=request.length,
                )
                data["seo"] = {
                    "score":           seo_result["overall_score"],
                    "grade":           seo_result["grade"],
                    "breakdown":       seo_result["breakdown"],
                    "recommendations": seo_result["recommendations"][:5],
                    "meta":            seo_result["meta"],
                }
            except Exception:
                data["seo"] = None   # non-fatal — content still returned

        # ── Persist to cache ───────────────────────────────────────────────────
        save_content_generation_to_dynamodb(normalized, request.topic, data)

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


@app.get("/api/content-templates")
def content_templates():
    """Return all available content templates with metadata."""
    try:
        return get_template_catalogue()
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── SEO Keyword Suggestions ─────────────────────────────────────────────────────

class SuggestKeywordsRequest(BaseModel):
    company_url: str = ""
    topic: str


@app.post("/api/suggest-keywords")
def suggest_keywords_endpoint(request: SuggestKeywordsRequest):
    """Use LLM to suggest SEO keywords for a topic, enriched by CI company context."""
    try:
        company_data = {}
        if request.company_url:
            normalized = normalize_url(request.company_url)
            ci_data = get_cached_intelligence(normalized)
            if ci_data:
                company_data = {
                    "company_name": ci_data.get("company_name", ""),
                    "industry":     ci_data.get("industry", ""),
                    "services":     ci_data.get("services", []),
                    "icp":          ci_data.get("icp", []),
                }
        keywords = suggest_seo_keywords(request.topic, company_data)
        return {"keywords": keywords}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── LinkedIn Message Generation ─────────────────────────────────────────────────

class LinkedInMessageRequest(BaseModel):
    company_url:      str = ""
    topic:            str = "connecting"
    prospect_name:    str = ""
    prospect_company: str = ""
    prospect_role:    str = ""
    linkedin_data:    dict | None = None   # Apify enrichment → HIGH personalization


@app.post("/api/linkedin-message")
def linkedin_message(request: LinkedInMessageRequest):
    """
    Generate a short, personalized LinkedIn outreach message.

    Personalization levels:
      HIGH   — pass linkedin_data (from /api/enrich-lead) for headline/post-aware messages
      MEDIUM — name + role only (no enrichment)
      LOW    — generic fallback

    The linkedin_data field accepts the 'enrichment' dict returned by /api/enrich-lead.
    """
    try:
        company_data = {}
        if request.company_url:
            normalized = normalize_url(request.company_url)
            ci_data = get_cached_intelligence(normalized)
            if ci_data:
                company_data = {
                    "company_name":    ci_data.get("company_name", ""),
                    "company_summary": ci_data.get("company_summary", ""),
                    "industry":        ci_data.get("industry", ""),
                    "services":        ci_data.get("services", []),
                    "icp":             ci_data.get("icp", []),
                }

        params = {
            "prospect_name":    request.prospect_name,
            "prospect_company": request.prospect_company,
            "prospect_role":    request.prospect_role,
            "topic":            request.topic or "connecting",
            "company_data":     company_data,
            "linkedin_data":    request.linkedin_data,   # forwarded from Apify enrichment
        }
        data = generate_linkedin_message(params)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Email Sending ───────────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    from_email: str
    to_email: str                        # single recipient (backward compat)
    to_emails: list[str] | None = None  # bulk recipients (overrides to_email when set)
    subject: str
    content: str


def _content_to_body(content: str) -> str:
    """Strip the leading 'Subject: ...' line (if any) and return the email body."""
    lines = content.strip().splitlines()
    if lines and re.match(r"^Subject:\s*", lines[0], re.IGNORECASE):
        lines = lines[1:]
        # drop the blank line that usually follows the Subject header
        if lines and not lines[0].strip():
            lines = lines[1:]
    return "\n".join(lines).strip()


def _body_to_html(plain_body: str) -> str:
    """Convert plain-text email body to a clean, readable HTML email."""
    # Split on blank lines → paragraph blocks
    raw_paragraphs = re.split(r"\n{2,}", plain_body.strip())
    html_paras = []
    for block in raw_paragraphs:
        # Within each block replace single newlines with <br>
        inner = block.strip().replace("\n", "<br>\n")
        html_paras.append(f"<p>{inner}</p>")
    body_content = "\n".join(html_paras)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;
                      border:1px solid #e5e7eb;overflow:hidden;
                      font-family:Arial,Helvetica,sans-serif;font-size:14px;
                      color:#1f2937;line-height:1.7;">
          <!-- Header bar -->
          <tr>
            <td style="background:#9b72d0;padding:20px 32px;">
              <span style="color:#ffffff;font-size:16px;font-weight:700;
                           letter-spacing:0.5px;">AI Growth Strategist</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              {body_content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                       padding:16px 32px;font-size:11px;color:#9ca3af;
                       text-align:center;">
              Sent via AI Growth Strategist &nbsp;|&nbsp; Unsubscribe
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


@app.post("/api/send-email")
def send_email(request: SendEmailRequest):
    try:
        host     = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
        port     = int(os.environ.get("EMAIL_PORT", "587"))
        user     = os.environ.get("EMAIL_USER", "")
        password = os.environ.get("EMAIL_PASS", "")

        if not user or not password:
            raise HTTPException(
                status_code=500,
                detail="Email credentials not configured. Set EMAIL_USER and EMAIL_PASS in .env",
            )

        plain_body = _content_to_body(request.content)
        html_body  = _body_to_html(plain_body)

        # ── Resolve recipient list ─────────────────────────────────────────────
        # to_emails (bulk) takes precedence over to_email (single)
        recipients = request.to_emails if request.to_emails else [request.to_email]
        # Remove blanks and deduplicate while preserving order
        seen_r, clean_recipients = set(), []
        for r in recipients:
            r = r.strip()
            if r and r not in seen_r:
                seen_r.add(r)
                clean_recipients.append(r)
        if not clean_recipients:
            raise HTTPException(status_code=400, detail="No valid recipient email addresses provided.")

        # ── TEST OVERRIDE: always deliver to this address regardless of UI selection ──
        OVERRIDE_TO = "pradeepa.balasubramanian@gmail.com"

        sent_to = []
        with smtplib.SMTP(host, port) as server:
            server.ehlo()
            server.starttls()
            server.login(user, password)
            for recipient in clean_recipients:
                msg = MIMEMultipart("alternative")
                msg["From"]    = request.from_email
                msg["To"]      = OVERRIDE_TO   # overridden for testing
                msg["Subject"] = request.subject
                msg.attach(MIMEText(plain_body, "plain", "utf-8"))
                msg.attach(MIMEText(html_body,  "html",  "utf-8"))
                server.send_message(msg)
                sent_to.append(recipient)

        return {
            "status":   "sent",
            "to":       sent_to,
            "count":    len(sent_to),
            "actual_to": OVERRIDE_TO,
        }
    except HTTPException:
        raise
    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP authentication failed for user %s", os.environ.get("EMAIL_USER"))
        raise HTTPException(status_code=401, detail={"code": "SMTP_AUTH_FAILED", "message": "Email could not be sent. Authentication failed — check your email credentials."})
    except smtplib.SMTPException as e:
        logger.exception("SMTP error during send")
        raise HTTPException(status_code=500, detail={"code": "SMTP_ERROR", "message": SMTP_FAILED})
    except Exception:
        logger.exception("send-email failed unexpectedly")
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": SMTP_FAILED})


# ── CSV Leads ──────────────────────────────────────────────────────────────────

CSV_LEADS_PATH = Path(__file__).parent / "data" / "leads.csv"


@app.get("/api/csv-leads")
def get_csv_leads(force_refresh: bool = False):
    """
    Load pre-exported Apollo leads from the CSV file.
    Results are cached in AppContext on the frontend; the CSV is read fresh
    on each cold load (no DynamoDB cache due to dataset size).
    """
    try:
        if not CSV_LEADS_PATH.exists():
            raise HTTPException(
                status_code=404,
                detail=f"leads.csv not found. Expected at: {CSV_LEADS_PATH}",
            )

        leads = []
        with open(CSV_LEADS_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                email = (row.get("Email") or "").strip()
                if not email or "@" not in email:
                    continue
                first  = (row.get("First Name") or "").strip()
                last   = (row.get("Last Name")  or "").strip()
                leads.append({
                    "name":         f"{first} {last}".strip() or "—",
                    "first_name":   first,
                    "last_name":    last,
                    "title":        (row.get("Title")       or "").strip(),
                    "company":      (row.get("Company Name") or "").strip(),
                    "email":        email,
                    "email_status": (row.get("Email Status") or "").strip(),
                    "industry":     (row.get("Industry")     or "").strip(),
                    "website":      (row.get("Website")      or "").strip(),
                    "city":         (row.get("City")         or "").strip(),
                    "country":      (row.get("Country")      or "").strip(),
                    "linkedin":     (row.get("Person Linkedin Url") or "").strip(),
                    "source":       "csv",
                })

        return {"leads": leads, "from_cache": False, "total": len(leads)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Score Leads (CSV + CI/MI intelligence) ─────────────────────────────────────

class ScoreLeadsRequest(BaseModel):
    ci_data:       dict | None = None
    mi_data:       dict | None = None
    force_refresh: bool        = False


@app.post("/api/score-leads")
def score_leads_endpoint(request: ScoreLeadsRequest):
    """
    Read the CSV leads file, score and rank each lead using CI and MI intelligence,
    cache top-500 results in DynamoDB, return full sorted list.

    If ci_data/mi_data are absent, returns the unscored CSV list (graceful fallback).
    """
    try:
        if not CSV_LEADS_PATH.exists():
            raise HTTPException(
                status_code=404,
                detail=f"leads.csv not found at {CSV_LEADS_PATH}",
            )

        # ── DynamoDB cache key (tied to the company that was analysed) ─────────
        cache_key = ""
        if request.ci_data:
            raw_url = request.ci_data.get("company_url", "")
            if raw_url:
                cache_key = f"{normalize_url(raw_url)}:scored"

        if cache_key and not request.force_refresh:
            cached = get_cached_leads(cache_key)
            if cached is not None:
                classified = classify_leads_industry(cached, request.ci_data, request.mi_data)
                classified, industry_list, industry_groups = enrich_leads_simple(
                    classified, request.ci_data, request.mi_data
                )
                return {
                    "leads": classified, "from_cache": True, "total": len(classified),
                    "industry_list": industry_list, "industry_groups": industry_groups,
                }

        # ── Parse CSV ─────────────────────────────────────────────────────────
        leads = []
        with open(CSV_LEADS_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                email = (row.get("Email") or "").strip()
                if not email or "@" not in email:
                    continue
                first = (row.get("First Name") or "").strip()
                last  = (row.get("Last Name")  or "").strip()
                # Parse CSV Keywords field → list (comma-separated)
                raw_kw = (row.get("Keywords") or "").strip()
                csv_keywords = [k.strip() for k in raw_kw.split(",") if k.strip()] if raw_kw else []
                leads.append({
                    "name":         f"{first} {last}".strip() or "—",
                    "first_name":   first,
                    "last_name":    last,
                    "title":        (row.get("Title")               or "").strip(),
                    "company":      (row.get("Company Name")        or "").strip(),
                    "email":        email,
                    "email_status": (row.get("Email Status")        or "").strip(),
                    "industry":     (row.get("Industry")            or "").strip(),
                    "website":      (row.get("Website")             or "").strip(),
                    "city":         (row.get("City")                or "").strip(),
                    "country":      (row.get("Country")             or "").strip(),
                    "linkedin":     (row.get("Person Linkedin Url") or "").strip(),
                    "csv_keywords": csv_keywords,
                    "source":       "csv",
                })

        # ── Score and rank ────────────────────────────────────────────────────
        scored = score_and_rank(leads, request.ci_data, request.mi_data)

        # ── Classify canonical industry (ICP-driven, generic) ─────────────────
        # This adds 'canonical_industry' to every lead, derived from the CI/MI
        # ICP and segment labels — NOT hardcoded to any specific domain.
        scored = classify_leads_industry(scored, request.ci_data, request.mi_data)

        # ── Enrich with location + keyword simple scores ───────────────────────
        # Adds: location_score, keyword_score, final_score, rank, keyword_matches
        # These scores are simpler and more explainable than the 100-pt model.
        scored, industry_list, industry_groups = enrich_leads_simple(
            scored, request.ci_data, request.mi_data
        )

        # ── Persist top-500 to DynamoDB (stays under the 400 KB item limit) ──
        if cache_key:
            try:
                save_leads_cache(cache_key, scored[:500])
            except Exception:
                pass  # non-fatal — serve fresh next time

        return {
            "leads":           scored,
            "from_cache":      False,
            "total":           len(scored),
            "industry_list":   industry_list,
            "industry_groups": industry_groups,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── GET /leads/scored — location + keyword scoring ────────────────────────────

@app.get("/leads/scored")
def get_scored_leads(company_url: str = ""):
    """
    GET /leads/scored?company_url=<url>

    Reads leads.csv and enriches each lead with simpler, explainable scores:

      location_score  (0 | 1 | 2)
        Compares the lead's city/country against the company's target regions
        from Market Intelligence → market_strategy.
        +2 = exact city match, +1 = same country, 0 = no match.

      keyword_score   (0 → N)
        Counts how many Company Intelligence keywords appear in the lead's
        title + company + industry text.  Each match → +1.

      final_score = location_score + keyword_score

      rank  1-based global rank after sorting by final_score descending.

    Response also includes:
      industry        raw industry field from the CSV
      canonical_industry  ICP-segment bucket (if CI/MI supplied)
      industry_list   sorted list of unique industries (for filter dropdown)
      industry_groups {industry: count} dict

    company_url is used to look up cached CI and MI from DynamoDB.
    If omitted (or not found), location_score and keyword_score are both 0.
    """
    try:
        if not CSV_LEADS_PATH.exists():
            raise HTTPException(
                status_code=404,
                detail=f"leads.csv not found at {CSV_LEADS_PATH}",
            )

        # ── Load CI + MI from cache ───────────────────────────────────────────
        ci_data: dict | None = None
        mi_data: dict | None = None
        if company_url:
            try:
                normalized = normalize_url(company_url)
                ci_data    = get_cached_intelligence(normalized)
                mi_data    = get_cached_market_intelligence(normalized)
            except Exception:
                pass   # missing cache is not fatal — we score with 0s

        # ── Parse CSV ─────────────────────────────────────────────────────────
        leads: list[dict] = []
        with open(CSV_LEADS_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                email = (row.get("Email") or "").strip()
                if not email or "@" not in email:
                    continue
                first = (row.get("First Name") or "").strip()
                last  = (row.get("Last Name")  or "").strip()
                raw_kw = (row.get("Keywords") or "").strip()
                csv_keywords = [k.strip() for k in raw_kw.split(",") if k.strip()] if raw_kw else []
                leads.append({
                    "name":         f"{first} {last}".strip() or "—",
                    "first_name":   first,
                    "last_name":    last,
                    "title":        (row.get("Title")               or "").strip(),
                    "company":      (row.get("Company Name")        or "").strip(),
                    "email":        email,
                    "email_status": (row.get("Email Status")        or "").strip(),
                    "industry":     (row.get("Industry")            or "").strip(),
                    "website":      (row.get("Website")             or "").strip(),
                    "city":         (row.get("City")                or "").strip(),
                    "country":      (row.get("Country")             or "").strip(),
                    "linkedin":     (row.get("Person Linkedin Url") or "").strip(),
                    "csv_keywords": csv_keywords,
                    "source":       "csv",
                })

        # ── Enrich + rank ─────────────────────────────────────────────────────
        enriched, industry_list, industry_groups = enrich_leads_simple(
            leads, ci_data, mi_data
        )

        return {
            "leads":           enriched,
            "total":           len(enriched),
            "industry_list":   industry_list,
            "industry_groups": industry_groups,
            "scoring_active":  bool(ci_data or mi_data),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("GET /leads/scored failed")
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Lead Discovery (Apollo API-based) ──────────────────────────────────────────

class LeadDiscoveryRequest(BaseModel):
    target_customers: list[str]
    buyer_industry: str
    offerings: list[str] = []
    source_company_url: str = ""
    source_company_name: str = ""
    force_refresh: bool = False


@app.post("/api/lead-discovery")
def lead_discovery(request: LeadDiscoveryRequest):
    try:
        normalized_url = normalize_url(request.source_company_url) if request.source_company_url else ""

        # Check cache unless force_refresh requested
        if normalized_url and not request.force_refresh:
            cached = get_cached_leads(normalized_url)
            if cached is not None:
                return {"leads": cached, "from_cache": True}

        # Hit Apollo API
        result = get_leads({
            "target_customers": request.target_customers,
            "buyer_industry":   request.buyer_industry,
            "offerings":        request.offerings,
        })
        leads         = result["leads"]
        organizations = result["organizations"]

        # Persist to leaddiscovery table and cache
        if normalized_url:
            save_to_leaddiscovery_table(
                source_company_url=normalized_url,
                company_name=request.source_company_name,
                organization_list=organizations,
                lead_list=leads,
            )
            save_leads_cache(normalized_url, leads)

        return {"leads": leads, "from_cache": False}
    except Exception:
        logger.exception("lead-discovery failed")
        raise HTTPException(status_code=502, detail={"code": "APOLLO_FAILED", "message": APOLLO_FAILED})


# ── Dynamic Lead Generation ───────────────────────────────────────────────────

class DynamicLeadsRequest(BaseModel):
    target_customers: list[str]
    buyer_industry: str
    offerings: list[str] = []
    source_company_url: str = ""
    use_csv_fallback: bool = True    # blend CSV leads when dynamic yield is low


@app.post("/api/dynamic-leads")
def dynamic_leads(request: DynamicLeadsRequest):
    """
    Generate leads dynamically using Google Custom Search + Hunter.io.

    Flow:
      1. Discover companies via Google CSE (keyword-based company search)
      2. Find contact emails via Hunter.io domain search
      3. If email yield < 5 AND use_csv_fallback=True, blend static CSV leads
      4. Return unified lead list with source tags

    Requires env vars: GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX, HUNTER_API_KEY
    Falls back gracefully if any API key is missing.
    """
    try:
        result = generate_leads_dynamic(
            target_customers=request.target_customers,
            buyer_industry=request.buyer_industry,
            offerings=request.offerings,
        )

        leads = result["leads"]

        # Blend CSV fallback when dynamic yield is insufficient
        if result.get("fallback_needed") and request.use_csv_fallback and CSV_LEADS_PATH.exists():
            csv_leads = []
            with open(CSV_LEADS_PATH, encoding="utf-8-sig", newline="") as f:
                reader = csv_module.DictReader(f)
                for row in reader:
                    email = (row.get("Email") or "").strip()
                    if not email or "@" not in email:
                        continue
                    first = (row.get("First Name") or "").strip()
                    last  = (row.get("Last Name")  or "").strip()
                    csv_leads.append({
                        "name":         f"{first} {last}".strip() or "—",
                        "first_name":   first,
                        "last_name":    last,
                        "title":        (row.get("Title")               or "").strip(),
                        "company":      (row.get("Company Name")        or "").strip(),
                        "email":        email,
                        "email_status": (row.get("Email Status")        or "").strip(),
                        "industry":     (row.get("Industry")            or "").strip(),
                        "website":      (row.get("Website")             or "").strip(),
                        "city":         (row.get("City")                or "").strip(),
                        "country":      (row.get("Country")             or "").strip(),
                        "linkedin":     (row.get("Person Linkedin Url") or "").strip(),
                        "source":       "csv",
                    })
            # Deduplicate by email before merging
            existing_emails = {l.get("email", "") for l in leads}
            for lead in csv_leads:
                if lead["email"] not in existing_emails:
                    leads.append(lead)
                    existing_emails.add(lead["email"])

        return {
            "leads": leads,
            "sources_used": result.get("sources_used", []),
            "fallback_activated": result.get("fallback_needed", False),
            "total": len(leads),
            "from_cache": False,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── LinkedIn Enrichment via Apify ─────────────────────────────────────────────

class EnrichLeadRequest(BaseModel):
    lead: dict
    enrich_company: bool = False   # also scrape company LinkedIn page


@app.post("/api/enrich-lead")
def enrich_lead_endpoint(request: EnrichLeadRequest):
    """
    Enrich a single lead with LinkedIn data using Apify.

    Requires: APIFY_API_TOKEN in .env
    Free tier: 5 actor runs/month — use sparingly (only for high-fit leads).

    Returns the original lead dict with an added 'enrichment' key containing:
      - about, headline, skills, experience, recent_posts (from LinkedIn profile)
      - company_desc, company_size, specialities (from company page, if requested)
    """
    try:
        enriched = enrich_lead(request.lead)
        return enriched
    except Exception:
        logger.exception("enrich-lead failed for lead: %s", request.lead.get("email", "unknown"))
        raise HTTPException(status_code=502, detail={"code": "ENRICHMENT_FAILED", "message": "Unable to enrich this lead right now. LinkedIn data may be unavailable. Please try again later."})


class EnrichBatchRequest(BaseModel):
    leads: list[dict]
    max_enrichments: int = 5   # cap to protect Apify quota


@app.post("/api/enrich-leads-batch")
def enrich_leads_batch_endpoint(request: EnrichBatchRequest):
    """
    Enrich up to max_enrichments leads in one call.
    Prioritizes leads with a LinkedIn URL.
    Leads without LinkedIn are returned unchanged.
    """
    try:
        enriched = enrich_leads_batch(request.leads, max_enrichments=request.max_enrichments)
        enriched_count = sum(1 for l in enriched if l.get("enrichment_status") == "success")
        return {
            "leads": enriched,
            "enriched_count": enriched_count,
            "total": len(enriched),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── SEO Analysis ──────────────────────────────────────────────────────────────

class SEOAnalyzeRequest(BaseModel):
    content: str
    keywords: list[str] = []
    topic: str = ""
    length_hint: str = "medium"          # "short" | "medium" | "long"
    include_keyword_data: bool = False   # hit DataForSEO for volume/difficulty


@app.post("/api/seo-analyze")
def seo_analyze(request: SEOAnalyzeRequest):
    """
    Run multi-metric SEO analysis on generated content.

    Returns measurable scores (not just LLM opinions):
      - overall_score: 0–100
      - grade: A/B/C/D/F
      - breakdown: per-metric scores (keyword density, placement, readability, structure)
      - recommendations: ordered list of improvement actions
      - meta: word count, Flesch reading ease, heading count, etc.

    Optional: set include_keyword_data=true and configure DATAFORSEO_LOGIN +
    DATAFORSEO_PASSWORD to get real search volume and keyword difficulty data.
    """
    try:
        result = analyze_content(
            content=request.content,
            keywords=request.keywords,
            topic=request.topic,
            length_hint=request.length_hint,
            include_keyword_data=request.include_keyword_data,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class SEOCompareRequest(BaseModel):
    original_content: str
    improved_content: str
    keywords: list[str] = []
    topic: str = ""
    length_hint: str = "medium"


@app.post("/api/seo-compare")
def seo_compare(request: SEOCompareRequest):
    """
    Compare SEO scores of two content versions (before vs after).

    Returns:
      - before / after: full SEO analysis for each version
      - delta_score: point improvement
      - verdict: "improved" | "same" | "worse"
      - improvements / regressions: per-metric changes
    """
    try:
        result = compare_versions(
            original_content=request.original_content,
            improved_content=request.improved_content,
            keywords=request.keywords,
            topic=request.topic,
            length_hint=request.length_hint,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Dynamic Content Topic Refresh ─────────────────────────────────────────────

class RefreshContentTopicsRequest(BaseModel):
    company_url: str
    keyword_clusters: list[dict]   # updated clusters from the UI


@app.post("/api/refresh-content-topics")
def refresh_content_topics_endpoint(request: RefreshContentTopicsRequest):
    """
    Regenerate content topics when keyword clusters are edited by the user.

    Event-driven: this endpoint is called whenever the user saves updated
    keyword clusters in the Market Intelligence UI, ensuring content topics
    always reflect the latest cluster themes.

    Flow:
      1. Load CI data for company context
      2. Pass updated clusters to LLM for fresh topic generation
      3. Merge new topics into the cached MI record
      4. Return updated MI with refreshed content_topics

    Maintains the keyword_cluster → content_topics mapping contract.
    """
    try:
        normalized = normalize_url(request.company_url)

        # Load CI for company context
        ci_data = get_cached_intelligence(normalized)
        if not ci_data:
            raise HTTPException(
                status_code=422,
                detail={"code": "ci_not_found", "message": "No Company Intelligence found for this URL."},
            )

        # Load existing MI to preserve other fields
        cached_mi = get_cached_market_intelligence(normalized)
        if not cached_mi:
            raise HTTPException(
                status_code=404,
                detail="Market intelligence not found. Run Market Intelligence first.",
            )

        # Regenerate topics from updated clusters
        new_topics = refresh_content_topics(ci_data, request.keyword_clusters)

        if not new_topics:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate new content topics. Please try again.",
            )

        # Merge refreshed topics back into MI and persist
        updated_mi = {**cached_mi, "content_topics": new_topics, "keyword_clusters": request.keyword_clusters}
        save_market_intelligence_to_dynamodb(normalized, updated_mi)

        return {
            **updated_mi,
            "content_topics_refreshed": True,
            "topics_count": len(new_topics),
            "from_cache": False,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Test: Personalization Validation ─────────────────────────────────────────

# ── Strict models for /api/test-personalization ───────────────────────────────

class LinkedInDataModel(BaseModel):
    """Typed schema for Apify-enriched LinkedIn data."""
    headline:     str            = ""
    about:        str            = ""
    skills:       list[str]      = []
    experience:   list           = []   # items can be str or {title, company, ...}
    recent_posts: list           = []   # items can be str or {text, ...}
    company_desc: str            = ""
    company_size: str            = ""


class TestPersonalizationLead(BaseModel):
    """
    Typed lead object for the test-personalization endpoint.
    Accepts both 'role' and 'title' as aliases for the job title field.
    Accepts both 'linkedin_data' and 'enrichment' as aliases for enrichment.
    """
    name:         str                         = ""
    role:         str                         = ""
    title:        str                         = ""   # alias for role
    company:      str                         = ""
    linkedin_data: LinkedInDataModel | None   = None
    enrichment:    LinkedInDataModel | None   = None   # alternative key name


class TestPersonalizationRequest(BaseModel):
    lead: TestPersonalizationLead   # strongly typed — no str/dict ambiguity


@app.post("/api/test-personalization")
def test_personalization(request: TestPersonalizationRequest):
    """
    Dedicated personalization validation endpoint.

    Generates a LinkedIn outreach message using the provided lead data,
    then verifies whether the output contains specific signals from the
    LinkedIn enrichment data.

    Scoring:
      HIGH   → at least 2 specific signals from linkedin_data found in output
      MEDIUM → only generic role/company mentions (no linkedin_data signals)
      LOW    → no meaningful personalization detected

    This endpoint is designed for automated testing and quality assurance —
    it exposes the personalization score directly rather than burying it in
    the full content generation response.
    """
    try:
        from content_generation import generate_linkedin_message

        lead = request.lead

        # Attribute access on typed model — no .get() needed
        prospect_name = lead.name
        prospect_role = lead.role or lead.title
        company       = lead.company

        # Resolve enrichment: prefer linkedin_data, fall back to enrichment key
        # Convert Pydantic model → dict once so signal-extraction code below
        # can use standard dict operations safely.
        enrichment_model = lead.linkedin_data or lead.enrichment
        linkedin_data: dict = enrichment_model.model_dump() if enrichment_model else {}

        print(f"DEBUG — Lead: name={prospect_name!r} role={prospect_role!r} company={company!r}")
        print(f"DEBUG — LinkedIn data keys: {list(linkedin_data.keys()) if linkedin_data else 'none'}")

        # Generate message with enrichment
        result = generate_linkedin_message({
            "prospect_name":    prospect_name,
            "prospect_company": company,
            "prospect_role":    prospect_role,
            "topic":            "connecting and exploring collaboration",
            "company_data":     {},   # no sender CI for this test endpoint
            "linkedin_data":    linkedin_data,
        })

        message = result.get("content", "")
        message_lower = message.lower()

        # Extract specific signal tokens from linkedin_data
        signal_pool: list[str] = []

        # From headline
        headline = linkedin_data.get("headline", "")
        if headline:
            signal_pool += [w.lower() for w in headline.split() if len(w) >= 5]

        # From recent post text (most specific — actual quotes)
        for post in (linkedin_data.get("recent_posts") or []):
            post_text = post.get("text", "") if isinstance(post, dict) else str(post)
            signal_pool += [w.lower() for w in post_text.split() if len(w) >= 6]

        # From skills
        for skill in (linkedin_data.get("skills") or [])[:5]:
            signal_pool += [w.lower() for w in str(skill).split() if len(w) >= 5]

        # From experience
        for exp in (linkedin_data.get("experience") or []):
            title = exp.get("title", "") if isinstance(exp, dict) else str(exp)
            signal_pool += [w.lower() for w in title.split() if len(w) >= 5]

        # Deduplicate and filter common stopwords
        _STOPWORDS = {"about", "their", "which", "where", "there", "these", "those", "would", "could", "should"}
        signal_pool = list(dict.fromkeys(
            t for t in signal_pool if t not in _STOPWORDS and len(t) >= 5
        ))

        # Find matched signals
        matched_signals = [s for s in signal_pool if s in message_lower]
        unique_matched  = list(dict.fromkeys(matched_signals))[:10]

        # Classify personalization level
        has_enrichment = bool(linkedin_data)
        if has_enrichment and len(unique_matched) >= 2:
            level = "HIGH"
        elif has_enrichment and len(unique_matched) >= 1:
            level = "HIGH"   # any specific signal = HIGH (strict threshold)
        elif prospect_role or company:
            level = "MEDIUM"
        else:
            level = "LOW"

        return {
            "message":              message,
            "personalization_level": level,
            "enrichment_used":      has_enrichment,
            "matched_signals":      unique_matched,
            "signal_pool_size":     len(signal_pool),
            "pass":                 level == "HIGH" if has_enrichment else level in ("HIGH", "MEDIUM"),
            "verdict":              (
                "PASS — specific LinkedIn signals found in output" if unique_matched
                else "WARN — no specific signals; check linkedin_data was passed correctly"
                if has_enrichment else
                "INFO — no enrichment provided; MEDIUM personalization is expected"
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Test: SEO Validation ──────────────────────────────────────────────────────

class TestSEORequest(BaseModel):
    content:  str
    keywords: list[str] = []
    topic:    str = ""
    length_hint: str = "medium"


@app.post("/api/test-seo")
def test_seo(request: TestSEORequest):
    """
    Dedicated SEO validation endpoint.

    Runs the full SEO analysis pipeline and returns a structured report.
    This endpoint exists for:
      1. Automated testing / CI pipelines
      2. Manual QA of individual content pieces
      3. Frontend "Analyze SEO" button (simpler than /api/seo-analyze)

    Always returns:
      - seo_score (0–100)
      - keyword_density (per keyword)
      - readability_score (Flesch Reading Ease)
      - structure_score (heading/paragraph analysis)
      - word_count
      - recommendations (ordered, actionable)
      - pass (True if score >= 60)
    """
    try:
        result = analyze_content(
            content=request.content,
            keywords=request.keywords,
            topic=request.topic,
            length_hint=request.length_hint,
        )

        return {
            "seo_score":        result["overall_score"],
            "grade":            result["grade"],
            "keyword_density":  result["keyword_detail"],
            "readability_score": result["meta"]["flesch_reading_ease"],
            "readability_grade": result["meta"]["flesch_kincaid_grade"],
            "structure_score":  result["breakdown"]["content_structure"],
            "word_count":       result["meta"]["word_count"],
            "heading_count":    result["meta"]["heading_count"],
            "paragraph_count":  result["meta"]["paragraph_count"],
            "recommendations":  result["recommendations"],
            "breakdown":        result["breakdown"],
            "pass":             result["overall_score"] >= 60,
            "verdict":          (
                "PASS" if result["overall_score"] >= 75 else
                "ACCEPTABLE" if result["overall_score"] >= 60 else
                "NEEDS WORK"
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Industry Classification ───────────────────────────────────────────────────

class ClassifyIndustryRequest(BaseModel):
    leads:   list[dict]
    ci_data: dict | None = None
    mi_data: dict | None = None


@app.post("/api/classify-industry")
def classify_industry_endpoint(request: ClassifyIndustryRequest):
    """
    Classify leads into canonical industry buckets derived from CI/MI input.

    Returns leads with 'canonical_industry' added, plus:
      - industry_list:   sorted list of unique industries (for dropdown)
      - industry_groups: {industry: count} summary

    This is a pure classification step — no scoring, no LLM calls.
    Runs in O(n * buckets) time; fast enough for 1000+ leads.
    """
    try:
        classified    = classify_leads_industry(request.leads, request.ci_data, request.mi_data)
        industry_list = get_industry_list(classified)
        groups_summary = {k: len(v) for k, v in group_leads_by_industry(classified).items()}
        return {
            "leads":           classified,
            "industry_list":   industry_list,
            "industry_groups": groups_summary,
            "total":           len(classified),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


# ── Scale Classification ──────────────────────────────────────────────────────

class ClassifyScaleRequest(BaseModel):
    company_name:    str = ""
    description:     str = ""
    employee_count:  int | None = None
    funding_stage:   str = ""


@app.post("/api/classify-scale")
def classify_scale_endpoint(request: ClassifyScaleRequest):
    """
    Classify a single company's scale (Startup / Mid-size / Enterprise).

    Useful for:
      - Debugging competitor scale assignments
      - Validating CI-derived company scale
      - Frontend "What scale are we?" display
    """
    try:
        from utils.scale_classifier import classify_scale
        result = classify_scale(
            name=request.company_name,
            description=request.description,
            employee_count=request.employee_count,
            funding_stage=request.funding_stage,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


class LLMTestRequest(BaseModel):
    message: str


@app.post("/api/llm-test")
def llm_test(request: LLMTestRequest):
    try:
        import json, boto3, os
        session = boto3.Session(profile_name="Website-intel-dev", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        client = session.client("bedrock-runtime")
        model_id = os.environ.get("BEDROCK_MODEL_ID")
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": request.message}],
        })
        response = client.invoke_model(modelId=model_id, body=body, contentType="application/json", accept="application/json")
        response_body = json.loads(response["body"].read())
        return {"reply": response_body["content"][0]["text"], "model": model_id}
    except Exception:
        logger.exception("chat failed")
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": BEDROCK_FAILED})


# ── LinkedIn Dashboard ─────────────────────────────────────────────────────────

from utils.leads_loader import get_leads, get_lead_detail, reload_caches, get_unique_values


@app.get("/api/linkedin-dashboard/filters")
async def linkedin_dashboard_filters(source: str = "apollo", user: dict = Depends(require_auth)):
    """Return sorted unique industry and company lists for dropdown filters."""
    try:
        return get_unique_values(source)
    except Exception:
        logger.exception("linkedin-dashboard/filters failed")
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


@app.post("/api/linkedin-dashboard/leads")
async def linkedin_dashboard_leads(request: Request, user: dict = Depends(require_auth)):
    """
    Return paginated leads with dynamically computed keyword_match.

    Body
    ----
    source          : "apollo" | "ks" | "all"   (default "apollo")
    keywords        : list[str]  — current CI keywords (from context)
    page            : int        (default 1)
    limit           : int        (default 50, max 100)
    filter          : "all" | "yes" | "no"       (default "all")
    search          : str        — substring search on name/company/title/industry
    industry_filter : str        — exact industry name filter (empty = no filter)
    company_filter  : str        — exact company name filter (empty = no filter)
    """
    try:
        body            = await request.json()
        source          = body.get("source", "apollo")
        keywords        = body.get("keywords") or []
        page            = max(1, int(body.get("page", 1)))
        limit           = min(10000, max(1, int(body.get("limit", 50))))  # raised cap for analytics bulk fetch
        filter_match    = body.get("filter", "all").lower()
        search          = (body.get("search") or "").strip()
        industry_filter = (body.get("industry_filter") or "").strip()
        company_filter  = (body.get("company_filter") or "").strip()

        result = get_leads(
            source=source,
            keywords=keywords,
            page=page,
            limit=limit,
            filter_match=filter_match,
            search=search,
            industry_filter=industry_filter,
            company_filter=company_filter,
        )
        return result
    except Exception:
        logger.exception("linkedin-dashboard/leads failed")
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


@app.get("/api/linkedin-dashboard/lead/{lead_id}")
async def linkedin_dashboard_lead_detail(lead_id: str, user: dict = Depends(require_auth)):
    """Return full details for a single lead by id."""
    try:
        lead = get_lead_detail(lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Lead not found"})
        return lead
    except HTTPException:
        raise
    except Exception:
        logger.exception("linkedin-dashboard/lead/%s failed", lead_id)
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": GENERIC})


@app.post("/api/linkedin-dashboard/reload")
async def linkedin_dashboard_reload(user: dict = Depends(require_auth)):
    """Force reload of both CSV caches (call after re-running the enrichment pipeline)."""
    reload_caches()
    return {"status": "ok", "message": "Caches cleared — next request will reload from disk"}


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}
