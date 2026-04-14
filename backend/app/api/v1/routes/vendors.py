from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.vendor_analyzer import score_vendor, compare_vendors, generate_vendor_report

router = APIRouter()

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

@router.post("/score")
async def score_vendor_route(data: VendorData):
    try:
        result = score_vendor(data.model_dump())
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare")
async def compare_vendors_route(data: VendorCompare):
    try:
        result = compare_vendors(data.vendors)
        return {"status": "success", "comparison": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/report")
async def vendor_report(data: VendorData):
    try:
        result = generate_vendor_report(data.model_dump())
        return {"status": "success", "report": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))