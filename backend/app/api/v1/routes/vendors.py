from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from pydantic import BaseModel
from app.ai.vendor_analyzer import score_vendor, compare_vendors, generate_vendor_report, extract_vendors
from app.core.security import protect_route
from app.core.hitl import check_vendor
from app.ocr.document_processor import process_document
from app.services.db_service import supabase
import uuid

router = APIRouter()
_finance_roles = ("project_director", "admin")


class VendorData(BaseModel):
    vendor_name: str
    vendor_type: str
    years_experience: int = 0
    completed_projects: int = 0
    on_time_delivery_pct: float = 0
    quality_score: float = 0
    safety_incidents: int = 0
    financial_rating: str = "Good"
    certifications: list = []
    past_issues: str = ""


class VendorCompare(BaseModel):
    vendors: list


class VendorCreate(BaseModel):
    name: str
    vendor_type: Optional[str] = ""
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    status: Optional[str] = "Approved"
    score: Optional[float] = 0
    delivery_score: Optional[float] = 0
    quality_score: Optional[float] = 0
    safety_score: Optional[float] = 0
    financial_rating: Optional[str] = "Good"
    years_experience: Optional[int] = 0
    completed_projects: Optional[int] = 0
    safety_incidents: Optional[int] = 0
    certifications: Optional[list[str]] = []
    notes: Optional[str] = ""
    project_id: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    vendor_type: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    score: Optional[float] = None
    delivery_score: Optional[float] = None
    quality_score: Optional[float] = None
    safety_score: Optional[float] = None
    financial_rating: Optional[str] = None
    years_experience: Optional[int] = None
    completed_projects: Optional[int] = None
    safety_incidents: Optional[int] = None
    certifications: Optional[list[str]] = None
    notes: Optional[str] = None
    project_id: Optional[str] = None


# ── Vendor register CRUD ───────────────────────────────────────────────────────

@router.get("/")
def list_vendors(project_id: Optional[str] = Query(None)):
    try:
        query = supabase.table("vendors").select("*").order("created_at", desc=True)
        if project_id:
            query = query.eq("project_id", project_id)
        res = query.execute()
        return {"status": "success", "vendors": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
def create_vendor(vendor: VendorCreate):
    try:
        data = {"id": str(uuid.uuid4()), **vendor.model_dump(exclude_none=True)}
        res = supabase.table("vendors").insert(data).execute()
        return {"status": "success", "vendor": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{vendor_id}")
def update_vendor(vendor_id: str, vendor: VendorUpdate):
    try:
        update_data = {k: v for k, v in vendor.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        res = supabase.table("vendors").update(update_data).eq("id", vendor_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Vendor not found")
        return {"status": "success", "vendor": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: str):
    try:
        supabase.table("vendors").delete().eq("id", vendor_id).execute()
        return {"status": "success", "deleted": vendor_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Document upload → AI extraction → review (no DB writes here) ──────────────

@router.post("/extract-items")
async def extract_vendors_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        items = extract_vendors(text)
        return {"status": "success", "extracted_items": items}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI analysis routes (unchanged) ─────────────────────────────────────────────

@router.post("/score")
async def score_vendor_route(data: VendorData, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = score_vendor(data.model_dump())

        needs_review, review_id, review_reason = check_vendor(
            vendor_data=data.model_dump(),
            ai_output=str(result),
        )
        return {
            "status":          "success",
            "analysis":        result,
            "requires_review": needs_review,
            "review_id":       review_id,
            "review_message":  review_reason if needs_review else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare")
async def compare_vendors_route(data: VendorCompare, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = compare_vendors(data.vendors)
        return {"status": "success", "comparison": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/report")
async def vendor_report(data: VendorData, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = generate_vendor_report(data.model_dump())
        return {"status": "success", "report": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
