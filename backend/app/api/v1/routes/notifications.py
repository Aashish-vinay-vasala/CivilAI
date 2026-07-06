"""
Notifications — routes the `notifications` table through the backend instead
of the frontend querying Supabase directly, so the usual guardrails
(module-level RBAC, request logging, future rate limiting) apply here too.

Real-time push (new notification appearing instantly) still uses a direct
Supabase Realtime channel from the frontend (see hooks/useSupabaseSync.ts) —
FastAPI has no equivalent to Postgres logical-replication websockets, so that
piece intentionally stays client-side. Only the CRUD operations move here.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.db_service import supabase

router = APIRouter()

_VALID_TYPES = {"info", "warning", "success", "error"}


class NotificationCreate(BaseModel):
    user_id: str
    type: str = "info"
    title: str
    message: str
    module: Optional[str] = None


@router.get("")
def list_notifications(user_id: str, limit: int = 50):
    try:
        res = (
            supabase.table("notifications")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(min(limit, 200))
            .execute()
        )
        return {"status": "success", "notifications": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
def create_notification(body: NotificationCreate):
    notif_type = body.type if body.type in _VALID_TYPES else "info"
    try:
        res = supabase.table("notifications").insert({
            "user_id": body.user_id,
            "type": notif_type,
            "title": body.title,
            "message": body.message,
            "module": body.module,
            "read": False,
        }).execute()
        return {"status": "success", "notification": res.data[0] if res.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{notification_id}/read")
def mark_read(notification_id: str):
    try:
        res = supabase.table("notifications").update({"read": True}).eq("id", notification_id).execute()
        return {"status": "success", "notification": res.data[0] if res.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/read-all")
def mark_all_read(user_id: str):
    try:
        supabase.table("notifications").update({"read": True}).eq("user_id", user_id).eq("read", False).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{notification_id}")
def delete_notification(notification_id: str):
    try:
        supabase.table("notifications").delete().eq("id", notification_id).execute()
        return {"status": "success", "deleted": notification_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("")
def clear_notifications(user_id: str):
    try:
        supabase.table("notifications").delete().eq("user_id", user_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
