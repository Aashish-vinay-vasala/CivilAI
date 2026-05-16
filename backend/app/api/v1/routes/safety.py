from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.ai.safety_analyzer import (
    analyze_safety_report,
    generate_incident_report,
    assess_zone_risk,
)
from app.ocr.document_processor import process_document
from app.services.ml_service import get_safety_stats
from supabase import create_client
from app.config import settings
import uuid

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)

VALID_SEVERITIES = {"low", "medium", "high"}
VALID_STATUSES   = {"open", "investigating", "closed"}


# ── Pydantic models ────────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    type: str
    description: Optional[str] = ""
    severity: Optional[str] = "low"
    status: Optional[str] = "open"
    zone: Optional[str] = ""
    location: Optional[str] = ""
    injured: Optional[str] = "None"
    date: Optional[str] = None
    project_id: Optional[str] = None


class IncidentUpdate(BaseModel):
    type: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    zone: Optional[str] = None
    location: Optional[str] = None
    injured: Optional[str] = None
    date: Optional[str] = None
    project_id: Optional[str] = None


class IncidentReportRequest(BaseModel):
    type: str
    location: str
    date: str
    description: str
    injured: str = "None"


class ZoneRiskRequest(BaseModel):
    name: str
    tasks: list = []
    workers: int = 0
    equipment: list = []
    weather: str = "Clear"


# ── Incidents CRUD ─────────────────────────────────────────────────────────────

@router.get("/incidents")
def list_incidents():
    try:
        res = supabase.table("safety_incidents").select("*").order("created_at", desc=True).execute()
        return {"status": "success", "incidents": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/incidents")
def create_incident(body: IncidentCreate):
    from datetime import date as _date
    try:
        data = {
            "id":          str(uuid.uuid4()),
            "type":        body.type.strip(),
            "description": body.description or "",
            "severity":    body.severity if body.severity in VALID_SEVERITIES else "low",
            "status":      body.status   if body.status   in VALID_STATUSES   else "open",
            "zone":        body.zone     or "",
            "location":    body.location or "",
            "injured":     body.injured  or "None",
            "date":        body.date     or _date.today().isoformat(),
        }
        if body.project_id:
            data["project_id"] = body.project_id
        res = supabase.table("safety_incidents").insert(data).execute()
        return {"status": "success", "incident": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/incidents/{incident_id}")
def update_incident(incident_id: str, body: IncidentUpdate):
    try:
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        if "severity" in updates and updates["severity"] not in VALID_SEVERITIES:
            raise HTTPException(status_code=400, detail=f"severity must be one of {VALID_SEVERITIES}")
        if "status" in updates and updates["status"] not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {VALID_STATUSES}")
        res = supabase.table("safety_incidents").update(updates).eq("id", incident_id).execute()
        return {"status": "success", "incident": res.data[0] if res.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/incidents/{incident_id}")
def delete_incident(incident_id: str):
    try:
        supabase.table("safety_incidents").delete().eq("id", incident_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def safety_stats_route():
    try:
        return await get_safety_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI features ────────────────────────────────────────────────────────────────

@router.post("/analyze-report")
async def analyze_safety_report_route(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed = {"pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg"}
    ext = (file.filename.split(".")[-1] or "").lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(allowed))}",
        )

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        doc = process_document(file_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {e}")

    text = doc.get("extracted_text", "")
    if not text or not text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this file. Try a text-based PDF or DOCX.",
        )

    try:
        result = analyze_safety_report(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")

    return {
        "status": "success",
        "analysis": result["analysis"],
        "risk_data": result["risk_data"],
    }


@router.post("/incident-report")
async def create_incident_report(request: IncidentReportRequest):
    try:
        report = generate_incident_report(request.model_dump())
        return {"status": "success", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/zone-risk")
async def assess_zone_risk_route(request: ZoneRiskRequest):
    try:
        assessment = assess_zone_risk(request.model_dump())
        return {"status": "success", "assessment": assessment}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
