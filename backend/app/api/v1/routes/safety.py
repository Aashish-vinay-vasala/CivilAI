from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.safety_analyzer import (
    analyze_safety_report,
    generate_incident_report,
    assess_zone_risk
)
from app.ocr.document_processor import process_document

router = APIRouter()

class IncidentRequest(BaseModel):
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

@router.post("/analyze-report")
async def analyze_safety_report_route(
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
        result = analyze_safety_report(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/incident-report")
async def create_incident_report(
    request: IncidentRequest
):
    try:
        report = generate_incident_report(
            request.model_dump()
        )
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/zone-risk")
async def assess_zone_risk_route(
    request: ZoneRiskRequest
):
    try:
        assessment = assess_zone_risk(
            request.model_dump()
        )
        return {
            "status": "success",
            "assessment": assessment
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))