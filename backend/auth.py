"""
AWS Cognito JWT verification for FastAPI.

Flow:
  1. Frontend logs in via Cognito SDK → gets an ID token (JWT)
  2. Frontend sends: Authorization: Bearer <id_token>
  3. This module fetches Cognito's public keys (JWKS) and verifies the token
  4. Verified token's claims (email, sub) are returned as the "user"
"""

import os
import requests
from jose import jwt, JWTError, ExpiredSignatureError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from functools import lru_cache

REGION = os.getenv("COGNITO_REGION")
USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")

JWKS_URL = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}"

bearer_scheme = HTTPBearer()


@lru_cache(maxsize=1)
def _get_jwks():
    """Fetch Cognito's public keys once and cache them."""
    res = requests.get(JWKS_URL, timeout=5)
    res.raise_for_status()
    return res.json()


def verify_token(token: str) -> dict:
    """
    Decode and verify a Cognito ID token.
    Returns the token claims (email, sub, etc.) on success.
    Raises HTTPException on failure.
    """
    try:
        jwks = _get_jwks()
        # jose automatically picks the right key via the token's 'kid' header
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=ISSUER,
        )
        return claims

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    """
    FastAPI dependency — use with Depends(require_auth).
    Returns the decoded token claims so the route can access user info.

    Usage:
        @app.post("/api/secure-endpoint")
        def my_route(user=Depends(require_auth)):
            email = user["email"]
    """
    return verify_token(credentials.credentials)
