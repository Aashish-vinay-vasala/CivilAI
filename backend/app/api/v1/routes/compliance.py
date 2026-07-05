from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timezone
from collections import defaultdict
from app.ai.compliance_analyzer import (
    analyze_compliance,
    check_code_compliance,
    generate_permit_application,
    track_regulatory_changes
)
from app.ocr.document_processor import process_document
from app.services.db_service import supabase

router = APIRouter()


class CodeComplianceRequest(BaseModel):
    project_name: str
    project_type: str
    location: str
    building_height: float = 0.0
    occupancy_type: str = ""
    construction_type: str = ""
    special_features: list = []


class PermitRequest(BaseModel):
    project_name: str
    project_type: str
    location: str
    owner_name: str
    contractor_name: str
    estimated_cost: float
    start_date: str
    end_date: str
    permit_type: str


class RegulatoryRequest(BaseModel):
    region: str
    project_type: str


class PermitCreate(BaseModel):
    name: str
    type: str
    status: str = "Pending"
    expiry_date: Optional[str] = None
    risk_level: str = "medium"
    project_id: Optional[str] = None
    issued_by: Optional[str] = None


class PermitUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    expiry_date: Optional[str] = None
    risk_level: Optional[str] = None
    issued_by: Optional[str] = None


# ── AI routes ──────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_compliance_route(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    allowed = {"pdf", "xlsx", "xls", "docx", "doc"}
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '.{ext}'. Allowed: pdf, xlsx, docx")
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text or not text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from this file. Try a text-based PDF or DOCX.")
        result = analyze_compliance(text)
        return {"status": "success", "analysis": result["analysis"], "risk_data": result["risk_data"], "extracted_permits": result["extracted_permits"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/code-check")
async def code_compliance_check(request: CodeComplianceRequest):
    try:
        result = check_code_compliance(request.model_dump())
        return {"status": "success", "compliance_report": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/permit-application")
async def create_permit_application(request: PermitRequest):
    try:
        application = generate_permit_application(request.model_dump())
        return {"status": "success", "application": application}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regulatory-check")
async def regulatory_check(request: RegulatoryRequest):
    try:
        result = track_regulatory_changes(request.region, request.project_type)
        return {"status": "success", "regulatory_info": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Permit CRUD ────────────────────────────────────────────────────────────

@router.get("/permits")
async def list_permits(project_id: Optional[str] = Query(default=None)):
    try:
        query = supabase.table("permits").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        response = query.order("created_at", desc=True).execute()
        return {"permits": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/permits")
async def create_permit(permit: PermitCreate):
    try:
        data = permit.model_dump(exclude_none=True)
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        response = supabase.table("permits").insert(data).execute()
        return {"permit": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/permits/{permit_id}")
async def update_permit(permit_id: str, permit: PermitUpdate):
    try:
        data = {k: v for k, v in permit.model_dump().items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = supabase.table("permits").update(data).eq("id", permit_id).execute()
        return {"permit": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/permits/{permit_id}")
async def delete_permit(permit_id: str):
    try:
        supabase.table("permits").delete().eq("id", permit_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stats (KPIs + radar + trend) ──────────────────────────────────────────

@router.get("/stats")
async def get_compliance_stats(project_id: Optional[str] = Query(default=None)):
    try:
        query = supabase.table("permits").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        response = query.execute()
        permits = response.data or []

        today = date.today().isoformat()
        total = len(permits)
        approved = sum(1 for p in permits if p.get("status") == "Approved")
        pending = sum(1 for p in permits if p.get("status") == "Pending")
        violations = sum(
            1 for p in permits
            if p.get("status") == "Rejected"
            or (
                p.get("expiry_date")
                and str(p["expiry_date"])[:10] < today
                and p.get("status") == "Approved"
            )
        )
        score = round((approved / total) * 100) if total > 0 else 0

        # Radar: score per category based on matching permit type keywords
        type_keywords = {
            "Building Code": ["building", "structural", "construction"],
            "Safety": ["safety", "ppe", "osha"],
            "Environmental": ["environmental", "environment", "waste", "green"],
            "Labor": ["labor", "labour", "work permit", "worker"],
            "Fire Safety": ["fire", "sprinkler", "evacuation"],
            "Electrical": ["electrical", "electric", "power", "wiring"],
        }
        radar = []
        for category, keywords in type_keywords.items():
            cat = [
                p for p in permits
                if any(k in (p.get("type", "") + " " + p.get("name", "")).lower() for k in keywords)
            ]
            if cat:
                cat_score = round(sum(1 for p in cat if p.get("status") == "Approved") / len(cat) * 100)
            else:
                cat_score = score
            radar.append({"category": category, "score": cat_score})

        # Trend: monthly compliance % over last 6 months of permit data
        monthly: dict = defaultdict(lambda: {"total": 0, "approved": 0})
        for p in permits:
            raw = p.get("created_at", "")
            if raw:
                try:
                    month = datetime.fromisoformat(str(raw)[:19]).strftime("%b")
                    monthly[month]["total"] += 1
                    if p.get("status") == "Approved":
                        monthly[month]["approved"] += 1
                except Exception:
                    pass

        trend = [
            {
                "month": m,
                "score": round(v["approved"] / v["total"] * 100) if v["total"] > 0 else score,
            }
            for m, v in monthly.items()
        ]

        return {
            "compliance_score": score,
            "active_permits": approved,
            "pending_permits": pending,
            "open_violations": violations,
            "total_permits": total,
            "radar": radar,
            "trend": trend,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
