from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.core.guardrails import guard_text
from app.core.hitl import check_safety_incident
from app.ai.safety_analyzer import (
    analyze_safety_report,
    extract_safety_incidents,
    generate_incident_report,
    assess_zone_risk,
)
from app.ocr.document_processor import process_document
from app.services.ml_service import get_safety_stats
from app.services.db_service import create_safety_incident
from app.core.security import get_optional_user
from app.services.scoping import visible_project_ids, assert_project_access
import httpx
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions
from app.config import settings
import uuid

router = APIRouter()
# max_keepalive_connections=0 avoids a Windows socket race under concurrent
# requests sharing a pooled keep-alive connection — see db_service.py.
supabase = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
    SyncClientOptions(httpx_client=httpx.Client(limits=httpx.Limits(max_keepalive_connections=0))),
)

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

def _assert_incident_access(incident_id: str, user: dict | None) -> None:
    """An incident's own row doesn't carry an owner — access is inherited
    from the project it belongs to. Incidents with no project_id at all
    (legacy/global) are treated as part of the shared demo pool."""
    if not user:
        return
    row = supabase.table("safety_incidents").select("project_id").eq("id", incident_id).execute().data
    project_id = row[0].get("project_id") if row else None
    if project_id:
        assert_project_access(project_id, user)
    elif user.get("account_type") != "demo":
        raise HTTPException(status_code=404, detail="Incident not found")


@router.get("/incidents")
def list_incidents(user: dict | None = Depends(get_optional_user)):
    try:
        ids = visible_project_ids(user)
        query = supabase.table("safety_incidents").select("*")
        if ids is not None:
            query = query.in_("project_id", ids) if ids else query.eq("project_id", "__none__")
        res = query.order("created_at", desc=True).execute()
        return {"status": "success", "incidents": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/incidents")
def create_incident(body: IncidentCreate, user: dict | None = Depends(get_optional_user)):
    from datetime import date as _date
    try:
        if body.description:
            try:
                body.description, _ = guard_text(body.description)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        if body.project_id:
            assert_project_access(body.project_id, user)

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
        inserted = create_safety_incident(data)
        return {"status": "success", "incident": inserted[0] if inserted else data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/incidents/{incident_id}")
def update_incident(incident_id: str, body: IncidentUpdate, user: dict | None = Depends(get_optional_user)):
    try:
        _assert_incident_access(incident_id, user)
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
def delete_incident(incident_id: str, user: dict | None = Depends(get_optional_user)):
    try:
        _assert_incident_access(incident_id, user)
        supabase.table("safety_incidents").delete().eq("id", incident_id).execute()
        return {"status": "success"}
    except HTTPException:
        raise
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


@router.post("/extract-incidents")
async def extract_incidents_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        incidents = extract_safety_incidents(text)
        return {"status": "success", "extracted_incidents": incidents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/incident-report")
async def create_incident_report(request: IncidentReportRequest):
    try:
        request.description, _ = guard_text(request.description)
        report = generate_incident_report(request.model_dump())

        needs_review, review_id, review_reason = check_safety_incident(
            incident_data=request.model_dump(),
            ai_output=str(report),
        )
        return {
            "status":          "success",
            "report":          report,
            "requires_review": needs_review,
            "review_id":       review_id,
            "review_message":  review_reason if needs_review else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/zone-risk")
async def assess_zone_risk_route(request: ZoneRiskRequest):
    try:
        assessment = assess_zone_risk(request.model_dump())
        return {"status": "success", "assessment": assessment}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
