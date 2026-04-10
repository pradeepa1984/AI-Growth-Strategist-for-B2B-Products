"""
Standardized error helpers for AI Growth Strategist.

All API errors follow this shape:
{
  "success": false,
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "User-friendly sentence."
  }
}
"""

from fastapi import HTTPException
from fastapi.responses import JSONResponse


def _body(code: str, message: str) -> dict:
    return {"success": False, "error": {"code": code, "message": message}}


def error_response(code: str, message: str, status: int) -> JSONResponse:
    """Return a JSONResponse with the standard error shape."""
    return JSONResponse(status_code=status, content=_body(code, message))


# ── Raise helpers (use these inside endpoints) ─────────────────────────────────

def bad_request(message: str, code: str = "BAD_REQUEST"):
    raise HTTPException(status_code=400, detail={"code": code, "message": message})


def not_found(message: str, code: str = "NOT_FOUND"):
    raise HTTPException(status_code=404, detail={"code": code, "message": message})


def unprocessable(message: str, code: str = "UNPROCESSABLE"):
    raise HTTPException(status_code=422, detail={"code": code, "message": message})


def server_error(message: str = "Something went wrong. Please try again.", code: str = "INTERNAL_ERROR"):
    raise HTTPException(status_code=500, detail={"code": code, "message": message})


# ── User-facing message map for common external failures ──────────────────────

CRAWL_FAILED    = "Website could not be crawled. Please check the URL and try again."
TIMEOUT         = "Request timed out. Please retry."
EXTERNAL_API    = "A required service is temporarily unavailable. Please try again later."
APOLLO_FAILED   = "Lead provider is temporarily unavailable. Please try again later."
BEDROCK_FAILED  = "AI analysis service is temporarily unavailable. Please try again later."
SMTP_FAILED     = "Email could not be sent. Please check credentials and try again."
GENERIC         = "Something went wrong. Please try again."
