"""
Tenders — routes the `tenders` table (pre-construction bid tracking) through
the backend instead of the frontend querying Supabase directly.
"""
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.db_service import supabase

router = APIRouter()

_VALID_STATUS = {"active", "submitted", "won", "lost", "no-bid"}


class TenderCreate(BaseModel):
    user_id: str
    project_name: str
    status: str = "active"
    summary: Optional[dict[str, Any]] = None
    requirements: Optional[dict[str, Any]] = None
    gap_result: Optional[dict[str, Any]] = None
    file_name: Optional[str] = None


class TenderUpdate(BaseModel):
    project_name: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[dict[str, Any]] = None
    requirements: Optional[dict[str, Any]] = None
    gap_result: Optional[dict[str, Any]] = None
    file_name: Optional[str] = None


@router.get("")
def list_tenders(user_id: str):
    try:
        res = (
            supabase.table("tenders")
            .select("*")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return {"status": "success", "tenders": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
def create_tender(body: TenderCreate):
    status = body.status if body.status in _VALID_STATUS else "active"
    try:
        res = supabase.table("tenders").insert({
            "user_id": body.user_id,
            "project_name": body.project_name,
            "status": status,
            "summary": body.summary,
            "requirements": body.requirements,
            "gap_result": body.gap_result,
            "file_name": body.file_name,
        }).execute()
        return {"status": "success", "tender": res.data[0] if res.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{tender_id}")
def update_tender(tender_id: str, body: TenderUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in _VALID_STATUS:
        raise HTTPException(status_code=400, detail=f"status must be one of {_VALID_STATUS}")
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        res = supabase.table("tenders").update(updates).eq("id", tender_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Tender not found")
        return {"status": "success", "tender": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{tender_id}")
def delete_tender(tender_id: str):
    try:
        supabase.table("tenders").delete().eq("id", tender_id).execute()
        return {"status": "success", "deleted": tender_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
