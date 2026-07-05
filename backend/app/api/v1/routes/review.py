import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.db_service import supabase
from app.core.security import protect_route

router = APIRouter()
logger = logging.getLogger("civilai.review")
_reviewer_roles = ("project_director", "admin")


class ReviewDecision(BaseModel):
    reviewer_name: str
    notes: Optional[str] = ""


@router.get("/queue")
def get_review_queue(
    status: str = "pending",
    route: Optional[str] = None,
    _user=Depends(protect_route(*_reviewer_roles)),
):
    """List AI review queue items. status=all returns every item."""
    try:
        query = (
            supabase.table("ai_review_queue")
            .select(
                "id, route, trigger_reason, payload_summary, "
                "risk_score, status, reviewer_name, reviewed_at, created_at, project_id"
            )
            .order("created_at", desc=True)
        )
        if status != "all":
            query = query.eq("status", status)
        if route:
            query = query.eq("route", route)
        res = query.limit(200).execute()
        items = res.data or []
        return {
            "items":   items,
            "count":   len(items),
            "pending": sum(1 for i in items if i.get("status") == "pending"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
def review_stats(_user=Depends(protect_route(*_reviewer_roles))):
    """Aggregate counts by status — useful for a badge/counter in the UI."""
    try:
        res = supabase.table("ai_review_queue").select("status").execute()
        counts: dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0}
        for row in res.data or []:
            s = row.get("status", "pending")
            counts[s] = counts.get(s, 0) + 1
        return {"stats": counts, "total": sum(counts.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue/{review_id}")
def get_review_item(
    review_id: str,
    _user=Depends(protect_route(*_reviewer_roles)),
):
    """Return a single queue item including the full AI output."""
    try:
        res = supabase.table("ai_review_queue").select("*").eq("id", review_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Review item not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/queue/{review_id}/approve")
def approve_review(
    review_id: str,
    body: ReviewDecision,
    _user=Depends(protect_route(*_reviewer_roles)),
):
    """Approve an AI output — confirms it is acceptable to act on."""
    try:
        res = (
            supabase.table("ai_review_queue")
            .update({
                "status":        "approved",
                "reviewer_name": body.reviewer_name,
                "notes":         body.notes or "",
                "reviewed_at":   datetime.datetime.utcnow().isoformat(),
            })
            .eq("id", review_id)
            .eq("status", "pending")
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=404,
                detail="Review item not found or already actioned",
            )
        logger.info("HITL approved | id=%s | reviewer=%s", review_id, body.reviewer_name)
        return {"status": "approved", "review_id": review_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/queue/{review_id}/reject")
def reject_review(
    review_id: str,
    body: ReviewDecision,
    _user=Depends(protect_route(*_reviewer_roles)),
):
    """Reject an AI output — rejection reason is required."""
    if not (body.notes or "").strip():
        raise HTTPException(status_code=400, detail="A rejection reason is required in 'notes'")
    try:
        res = (
            supabase.table("ai_review_queue")
            .update({
                "status":        "rejected",
                "reviewer_name": body.reviewer_name,
                "notes":         body.notes,
                "reviewed_at":   datetime.datetime.utcnow().isoformat(),
            })
            .eq("id", review_id)
            .eq("status", "pending")
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=404,
                detail="Review item not found or already actioned",
            )
        logger.info(
            "HITL rejected | id=%s | reviewer=%s | reason=%.80s",
            review_id, body.reviewer_name, body.notes,
        )
        return {"status": "rejected", "review_id": review_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
