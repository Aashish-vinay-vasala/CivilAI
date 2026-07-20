"""Minimal auth gate for the ML service's mutating endpoints (/train/*, /data/upload/*).

Everything else (predict/gnn/data-stats/mlops) stays public since the frontend calls
this service directly with no token for read-only inference. Training/upload can
overwrite model weights or seed data for every visitor, so those specifically require
a valid Supabase-issued JWT — the same token the main backend already verifies, and
the same one the frontend's global axios interceptor already attaches to every request
(see frontend/src/lib/axiosAuthInterceptor.ts), so no frontend change is needed.

Deliberately does NOT do the backend's full RBAC/profile-role lookup — "logged in at
all" is enough of a bar here; this isn't a module with per-role permissions.
"""
import os
import time
import logging

import requests
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger("civilai_ml.auth")

_bearer = HTTPBearer(auto_error=False)
_SUPABASE_URL = os.getenv("SUPABASE_URL", "")
_JWKS_URL = f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


def _fetch_jwks() -> list[dict]:
    try:
        resp = requests.get(_JWKS_URL, timeout=5)
        resp.raise_for_status()
        return resp.json().get("keys", [])
    except Exception:
        logger.exception("Failed to fetch Supabase JWKS from %s", _JWKS_URL)
        return _jwks_cache["keys"]


def _get_jwks(kid: str | None) -> list[dict]:
    now = time.time()
    stale = now - _jwks_cache["fetched_at"] > _JWKS_TTL_SECONDS
    known_kid = kid is None or any(k.get("kid") == kid for k in _jwks_cache["keys"])
    if stale or not known_kid:
        _jwks_cache["keys"] = _fetch_jwks()
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def _verify_token(token: str) -> dict | None:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        keys = _get_jwks(kid)
        if not keys:
            return None
        return jwt.decode(
            token, {"keys": keys}, algorithms=["ES256", "RS256"], audience="authenticated",
        )
    except JWTError:
        return None


def require_login(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload
