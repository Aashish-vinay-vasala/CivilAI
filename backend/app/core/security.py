import logging
import time
import requests
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from app.services.db_service import supabase
from app.core.guardrails import has_permission

logger = logging.getLogger("civilai.security")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)

# Supabase signs new tokens with an asymmetric key (ES256) rather than a
# shared secret. We verify against the project's public JWKS instead of a
# static secret — this also means key rotation (Supabase's "standby key"
# flow) doesn't require any backend config change.
_JWKS_URL = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)


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


def verify_token(token: str) -> dict | None:
    """Verify a Supabase Auth-issued JWT (ES256, verified via JWKS) and return its claims."""
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        keys = _get_jwks(kid)
        if not keys:
            return None
        return jwt.decode(
            token,
            {"keys": keys},
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except JWTError:
        return None


def _resolve_user(token: str) -> dict | None:
    """Verify a token and enrich it with the caller's app role/profile from `profiles`."""
    payload = verify_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    email = payload.get("email", "")
    role = "viewer"  # least-privilege fallback
    full_name = ""
    account_type = "real"
    otp_verified = True

    # One retry on transient network failures (e.g. httpx socket errors) — without
    # this, a single dropped connection to Supabase silently downgrades a real
    # admin/project_manager to the "viewer" default and gets them RBAC-denied,
    # which looks identical to an actual permissions problem from the caller's side.
    response = None
    for attempt in range(2):
        try:
            response = (
                supabase.table("profiles")
                .select("role,full_name,account_type,otp_verified")
                .eq("id", user_id)
                .execute()
            )
            break
        except Exception:
            if attempt == 0:
                logger.warning("Profile lookup failed for user %s, retrying once", user_id)
            else:
                logger.exception("Profile lookup failed for user %s after retry", user_id)

    if response is not None:
        if response.data:
            row = response.data[0]
            role = row.get("role", role)
            full_name = row.get("full_name", "")
            account_type = row.get("account_type", account_type)
            otp_verified = row.get("otp_verified", otp_verified)
        else:
            logger.warning("No profile row for authenticated user %s — defaulting role to '%s'", user_id, role)

    return {
        "id": user_id,
        "email": email,
        "role": role,
        "full_name": full_name,
        "account_type": account_type,
        "otp_verified": otp_verified,
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """FastAPI dependency — requires a valid Bearer JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _resolve_user(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict | None:
    """FastAPI dependency — returns the resolved user if a valid token is present, else None."""
    if not credentials:
        return None
    return _resolve_user(credentials.credentials)


def require_role(*roles: str):
    """
    Dependency factory for strict role-based access control.
    Always enforces — use protect_route() for AUTH_REQUIRED-conditional enforcement.
    """
    def _dependency(user: dict = Depends(get_current_user)) -> dict:
        user_role = user.get("role", "")
        if user_role not in roles:
            logger.warning("RBAC denied | role=%s | required=%s", user_role, roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized for this action",
            )
        return user
    return _dependency


def protect_route(*roles: str):
    """
    Dependency factory that enforces RBAC only when AUTH_REQUIRED=True in config.

    In demo mode (AUTH_REQUIRED=False) it logs the access but does not block,
    so the frontend works without sending JWT tokens.
    """
    def _dependency(
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    ) -> dict | None:
        if not settings.AUTH_REQUIRED:
            # Demo mode: log who is accessing but don't block
            user = _resolve_user(credentials.credentials) if credentials else None
            role = user.get("role", "unauthenticated") if user else "unauthenticated"
            logger.debug("protect_route (demo mode) | role=%s | required=%s", role, roles)
            return user

        # Production mode: enforce fully
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = _resolve_user(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        _assert_otp_verified(user)
        user_role = user.get("role", "")
        if user_role not in roles:
            logger.warning("RBAC denied | role=%s | required=%s", user_role, roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized for this action",
            )
        return user
    return _dependency


def _assert_otp_verified(user: dict) -> None:
    """Google-OAuth signups start with profiles.otp_verified=false until the
    emailed OTP is confirmed — block everything else until then. Password
    signups and demo accounts are always otp_verified=true."""
    if not user.get("otp_verified", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required — please confirm the OTP sent to your email",
        )


def _action_for(request: Request) -> str:
    if request.method == "DELETE":
        return "delete"
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return "read"
    return "write"


def require_module_access(module: str):
    """
    Dependency factory for module + action level RBAC
    (backend/app/core/guardrails.ROLE_PERMISSIONS).

    Attach at router-include time (see main.py) rather than per-endpoint — this
    gates the whole module (e.g. every /api/v1/financials/* route) by role and
    HTTP-method-derived action (GET/HEAD/OPTIONS->read, DELETE->delete, else
    write), on top of any finer-grained protect_route()/require_role() checks
    individual endpoints already apply. A POST endpoint that's actually a read
    (search/filter-by-body) needs an explicit override — this heuristic covers
    the common REST case, not every endpoint.

    Follows the same AUTH_REQUIRED-conditional pattern as protect_route(): a
    no-op (logs only) in demo mode so the frontend keeps working without JWTs.
    """
    def _dependency(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    ) -> dict | None:
        if not settings.AUTH_REQUIRED:
            user = _resolve_user(credentials.credentials) if credentials else None
            role = user.get("role", "unauthenticated") if user else "unauthenticated"
            logger.debug("require_module_access (demo mode) | role=%s | module=%s", role, module)
            return user

        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user = _resolve_user(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        _assert_otp_verified(user)
        action = _action_for(request)
        if not has_permission(user.get("role", ""), module, action):
            logger.warning("Module access denied | role=%s | module=%s | action=%s", user.get("role"), module, action)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.get('role')}' does not have '{action}' access to the '{module}' module",
            )
        return user
    return _dependency
