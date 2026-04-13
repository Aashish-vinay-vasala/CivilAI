from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.compliance_analyzer import (
    analyze_compliance,
    check_code_compliance,
    generate_permit_application,
    track_regulatory_changes
)
from app.ocr.document_processor import process_document

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

@router.post("/analyze")
async def analyze_compliance_route(
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
        result = analyze_compliance(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/code-check")
async def code_compliance_check(
    request: CodeComplianceRequest
):
    try:
        result = check_code_compliance(
            request.model_dump()
        )
        return {
            "status": "success",
            "compliance_report": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/permit-application")
async def create_permit_application(
    request: PermitRequest
):
    try:
        application = generate_permit_application(
            request.model_dump()
        )
        return {
            "status": "success",
            "application": application
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/regulatory-check")
async def regulatory_check(
    request: RegulatoryRequest
):
    try:
        result = track_regulatory_changes(
            request.region,
            request.project_type
        )
        return {
            "status": "success",
            "regulatory_info": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))