from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.schedule_analyzer import (
    analyze_schedule,
    predict_delays,
    what_if_analysis,
    generate_recovery_plan
)
from app.ocr.document_processor import process_document

router = APIRouter()

class DelayPredictionRequest(BaseModel):
    project_name: str
    start_date: str
    end_date: str
    completion_percentage: float
    weather_conditions: str = "Normal"
    labor_availability: str = "Full"
    material_status: str = "Available"
    pending_tasks: list = []

class WhatIfRequest(BaseModel):
    scenario: str
    affected_tasks: list = []
    delay_days: int = 0
    resource_change: str = ""
    budget_impact: float = 0.0

class RecoveryPlanRequest(BaseModel):
    project_name: str
    delay_days: int
    delay_causes: list = []
    available_resources: list = []
    budget_remaining: float = 0.0

@router.post("/analyze")
async def analyze_schedule_route(
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
        result = analyze_schedule(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict-delays")
async def predict_delays_route(
    request: DelayPredictionRequest
):
    try:
        prediction = predict_delays(
            request.model_dump()
        )
        return {
            "status": "success",
            "prediction": prediction
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/what-if")
async def what_if_route(
    request: WhatIfRequest
):
    try:
        analysis = what_if_analysis(
            request.model_dump()
        )
        return {
            "status": "success",
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recovery-plan")
async def recovery_plan_route(
    request: RecoveryPlanRequest
):
    try:
        plan = generate_recovery_plan(
            request.model_dump()
        )
        return {
            "status": "success",
            "plan": plan
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))