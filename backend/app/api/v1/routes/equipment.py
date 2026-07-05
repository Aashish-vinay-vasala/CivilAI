from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.ai.equipment_analyzer import (
    analyze_equipment,
    extract_equipment_items,
    predict_failure,
    generate_maintenance_schedule,
    analyze_downtime
)
from app.ocr.document_processor import process_document
from supabase import create_client
from app.config import settings
from app.constants import MONTH_NAMES
from datetime import datetime
from collections import defaultdict
import uuid

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


# ── Pydantic models ────────────────────────────────────────────────────────────

class EquipmentCreate(BaseModel):
    name: str
    equipment_code: Optional[str] = ""
    project_id: Optional[str] = None
    health_score: Optional[int] = 80
    status: Optional[str] = "Operational"
    next_service: Optional[str] = None
    equipment_type: Optional[str] = ""
    age_years: Optional[float] = 0
    operating_hours: Optional[float] = 0
    notes: Optional[str] = ""

class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    equipment_code: Optional[str] = None
    health_score: Optional[int] = None
    status: Optional[str] = None
    next_service: Optional[str] = None
    equipment_type: Optional[str] = None
    age_years: Optional[float] = None
    operating_hours: Optional[float] = None
    notes: Optional[str] = None

class FailurePredictionRequest(BaseModel):
    equipment_id: str
    equipment_type: str
    age_years: float
    last_maintenance: str
    operating_hours: float
    condition: str = "Good"
    known_issues: list = []

class MaintenanceScheduleRequest(BaseModel):
    equipment_list: list

class DowntimeRequest(BaseModel):
    equipment_id: str
    equipment_type: str
    downtime_hours: float
    affected_tasks: list = []
    repair_cost: float = 0.0
    project_name: str = ""


# ── Equipment register CRUD ────────────────────────────────────────────────────

@router.get("/all")
def list_all_equipment():
    try:
        response = supabase.table("equipment").select("*").execute()
        return {"status": "success", "equipment": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_equipment(eq: EquipmentCreate):
    try:
        _DB_COLUMNS = {"id", "name", "equipment_code", "equipment_type",
                       "health_score", "status", "next_service", "notes", "project_id"}
        raw = {"id": str(uuid.uuid4()), **eq.model_dump(exclude_none=True)}
        data = {k: v for k, v in raw.items()
                if k in _DB_COLUMNS and v != ""}  # skip unknown cols + empty date strings
        response = supabase.table("equipment").insert(data).execute()
        return {"status": "success", "equipment": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{equipment_id}")
def update_equipment(equipment_id: str, eq: EquipmentUpdate):
    try:
        update_data = {k: v for k, v in eq.model_dump().items() if v is not None}
        response = supabase.table("equipment").update(update_data).eq("id", equipment_id).execute()
        return {"status": "success", "equipment": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{equipment_id}")
def delete_equipment_item(equipment_id: str):
    try:
        supabase.table("equipment").delete().eq("id", equipment_id).execute()
        return {"status": "success", "message": "Equipment deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Maintenance summary chart data ─────────────────────────────────────────────

@router.get("/maintenance-summary")
def get_maintenance_summary():
    try:
        response = supabase.table("equipment_maintenance_logs").select("*").execute()
        logs = response.data or []

        month_agg: dict = defaultdict(lambda: {"planned": 0.0, "unplanned": 0.0, "cost": 0.0})
        for log in logs:
            m = log.get("month", 1)
            if 1 <= m <= 12:
                key = MONTH_NAMES[m - 1]
                month_agg[key]["planned"]   += float(log.get("planned_hours", 0))
                month_agg[key]["unplanned"] += float(log.get("unplanned_hours", 0))
                month_agg[key]["cost"]      += float(log.get("maintenance_cost", 0))

        now = datetime.now()
        result = []
        for i in range(6, 0, -1):
            total_months = now.year * 12 + (now.month - 1) - i
            m = (total_months % 12) + 1
            name = MONTH_NAMES[m - 1]
            d = month_agg.get(name, {"planned": 0.0, "unplanned": 0.0, "cost": 0.0})
            result.append({
                "month": name,
                "planned": round(d["planned"], 1),
                "unplanned": round(d["unplanned"], 1),
                "cost": round(d["cost"], 2),
            })

        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI analysis routes (unchanged) ────────────────────────────────────────────

@router.post("/analyze")
async def analyze_equipment_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text")
        result = analyze_equipment(text)
        return {"status": "success", "analysis": result["analysis"], "risk_data": result["risk_data"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract-items")
async def extract_equipment_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        items = extract_equipment_items(text)
        return {"status": "success", "extracted_items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-failure")
async def predict_failure_route(request: FailurePredictionRequest):
    try:
        prediction = predict_failure(request.model_dump())
        return {"status": "success", "prediction": prediction}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/maintenance-schedule")
async def maintenance_schedule_route(request: MaintenanceScheduleRequest):
    try:
        schedule = generate_maintenance_schedule(request.equipment_list)
        return {"status": "success", "schedule": schedule}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/downtime-analysis")
async def downtime_analysis_route(request: DowntimeRequest):
    try:
        analysis = analyze_downtime(request.model_dump())
        return {"status": "success", "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
