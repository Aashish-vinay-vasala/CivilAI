import logging
import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.core.demo_accounts import DEMO_ACCOUNTS_BY_ROLE
from app.core.guardrails import ROLE_PERMISSIONS
from app.core.security import get_current_user
from app.services.db_service import supabase

logger = logging.getLogger("civilai.auth")
router = APIRouter()


class DemoLoginRequest(BaseModel):
    role: str


class CompleteSignupRequest(BaseModel):
    role: str


@router.post("/demo-login")
def demo_login(body: DemoLoginRequest):
    """Sign into one of the 5 seeded demo accounts without ever sending a
    password to the frontend — the credentials live only in
    demo_accounts.py, server-side."""
    account = DEMO_ACCOUNTS_BY_ROLE.get(body.role)
    if not account:
        raise HTTPException(status_code=400, detail=f"Unknown demo role '{body.role}'")

    resp = requests.post(
        f"{settings.SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "password"},
        json={"email": account["email"], "password": account["password"]},
        headers={"apikey": settings.SUPABASE_SECRET_KEY, "Content-Type": "application/json"},
        timeout=10,
    )
    if resp.status_code != 200:
        logger.error("Demo login failed for role=%s: %s", body.role, resp.text)
        raise HTTPException(status_code=502, detail="Demo login is temporarily unavailable")

    data = resp.json()
    return {
        "status": "success",
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
    }


@router.post("/complete-signup")
def complete_signup(body: CompleteSignupRequest, user: dict = Depends(get_current_user)):
    """Set the caller's role right after signup. Only the service-role
    client can change profiles.role post-creation (see
    protect_profile_role trigger in migration 023) — db_service.supabase
    carries the service-role key, so this passes that check."""
    if body.role not in ROLE_PERMISSIONS:
        raise HTTPException(status_code=400, detail=f"Unknown role '{body.role}'")
    supabase.table("profiles").update({"role": body.role}).eq("id", user["id"]).execute()
    return {"status": "success", "role": body.role}


@router.post("/otp/confirm")
def confirm_otp(user: dict = Depends(get_current_user)):
    """Called after the frontend's supabase.auth.verifyOtp(...) succeeds, to
    flip the app-level otp_verified gate (backend/app/core/security.py's
    _assert_otp_verified) that unblocks the rest of the API for a
    Google-OAuth signup."""
    supabase.table("profiles").update({"otp_verified": True}).eq("id", user["id"]).execute()
    return {"status": "success"}


@router.get("/permissions")
def get_permissions(user: dict = Depends(get_current_user)):
    """Module -> allowed-actions map for the caller's role, sourced from the
    same guardrails.ROLE_PERMISSIONS the backend enforces with — the
    frontend's roleStore.can() reads from this instead of duplicating it."""
    matrix = ROLE_PERMISSIONS.get(user.get("role", ""), {})
    return {
        "status": "success",
        "role": user.get("role"),
        "modules": {module: sorted(actions) for module, actions in matrix.items()},
    }
