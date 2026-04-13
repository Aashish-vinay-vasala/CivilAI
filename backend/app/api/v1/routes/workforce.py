from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.workforce_analyzer import (
    analyze_workforce,
    match_skills,
    predict_turnover,
    generate_onboarding_plan
)
from app.ocr.document_processor import process_document

router = APIRouter()

class SkillMatchRequest(BaseModel):
    job_requirements: dict
    available_workers: list

class TurnoverRequest(BaseModel):
    workers: list

class OnboardingRequest(BaseModel):
    name: str
    role: str
    experience_years: int
    skills: list = []
    certifications: list = []
    start_date: str

@router.post("/analyze")
async def analyze_workforce_route(
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
        result = analyze_workforce(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/match-skills")
async def match_skills_route(
    request: SkillMatchRequest
):
    try:
        matches = match_skills(
            request.job_requirements,
            request.available_workers
        )
        return {
            "status": "success",
            "matches": matches
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predict-turnover")
async def predict_turnover_route(
    request: TurnoverRequest
):
    try:
        prediction = predict_turnover(
            request.workers
        )
        return {
            "status": "success",
            "prediction": prediction
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/onboarding-plan")
async def onboarding_plan_route(
    request: OnboardingRequest
):
    try:
        plan = generate_onboarding_plan(
            request.model_dump()
        )
        return {
            "status": "success",
            "plan": plan
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))