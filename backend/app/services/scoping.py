"""Per-user data isolation for the core-4 scoped modules (projects, cost,
schedule, safety — the modules that carry a project_id back to `projects`).

Demo accounts (account_type=='demo') all see the shared/legacy data pool
(projects.owner_id IS NULL). Real self-registered users only ever see rows
whose project has owner_id == their own id — a brand-new signup therefore
starts with zero visible projects until they create their own.
"""

import logging
from fastapi import HTTPException
from app.services.db_service import supabase

logger = logging.getLogger("civilai.scoping")


def visible_project_ids(user: dict | None) -> list[str] | None:
    """List of project ids the caller may see. Returns None to mean 'no
    filtering' (AUTH_REQUIRED is off / caller unauthenticated) so demo mode
    keeps working without a token."""
    if not user:
        return None
    query = supabase.table("projects").select("id")
    if user.get("account_type") == "demo":
        query = query.is_("owner_id", "null")
    else:
        query = query.eq("owner_id", user["id"])
    return [p["id"] for p in (query.execute().data or [])]


def owner_id_for_new_row(user: dict | None) -> str | None:
    """owner_id to stamp on a newly created project. None (the shared/demo
    pool) for demo accounts and unauthenticated/demo-mode callers, else the
    caller's own id so their new project is private to them."""
    if not user or user.get("account_type") == "demo":
        return None
    return user["id"]


def assert_project_access(project_id: str, user: dict | None) -> None:
    """Raise 404 (not 403 — don't confirm the project id exists at all) if
    the caller can't see this project. No-op when user is None (demo mode /
    AUTH_REQUIRED off)."""
    if not user:
        return
    ids = visible_project_ids(user)
    if ids is not None and project_id not in ids:
        raise HTTPException(status_code=404, detail="Project not found")
