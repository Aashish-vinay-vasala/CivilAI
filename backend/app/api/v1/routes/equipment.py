from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.equipment_analyzer import (
    analyze_equipment,
    predict_failure,
    generate_maintenance_schedule,
    analyze_downtime
)
from app.ocr.document_processor import process_document

router = APIRouter()

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

@router.post("/analyze")
async def analyze_equipment_route(
    file: UploadFile = File(...)
):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text"
            )
        result = analyze_equipment(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict-failure")
async def predict_failure_route(
    request: FailurePredictionRequest
):
    try:
        prediction = predict_failure(
            request.model_dump()
        )
        return {
            "status": "success",
            "prediction": prediction
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/maintenance-schedule")
async def maintenance_schedule_route(
    request: MaintenanceScheduleRequest
):
    try:
        schedule = generate_maintenance_schedule(
            request.equipment_list
        )
        return {
            "status": "success",
            "schedule": schedule
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/downtime-analysis")
async def downtime_analysis_route(
    request: DowntimeRequest
):
    try:
        analysis = analyze_downtime(
            request.model_dump()
        )
        return {
            "status": "success",
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))