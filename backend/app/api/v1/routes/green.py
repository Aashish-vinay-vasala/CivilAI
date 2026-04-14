from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.green_analyzer import (
    analyze_waste,
    generate_esg_report,
    calculate_carbon_footprint,
)

router = APIRouter()

class WasteData(BaseModel):
    project_name: str
    concrete_waste_tons: float = 0
    steel_waste_tons: float = 0
    wood_waste_tons: float = 0
    plastic_waste_tons: float = 0
    general_waste_tons: float = 0
    recycled_percentage: float = 0

class ESGData(BaseModel):
    project_name: str
    total_workers: int = 0
    safety_incidents: int = 0
    local_hiring_percentage: float = 0
    renewable_energy_percentage: float = 0
    waste_recycled_percentage: float = 0
    community_investments: float = 0

class CarbonData(BaseModel):
    project_name: str
    electricity_kwh: float = 0
    diesel_liters: float = 0
    cement_tons: float = 0
    steel_tons: float = 0
    transport_km: float = 0

@router.post("/analyze-waste")
async def analyze_waste_route(data: WasteData):
    try:
        result = analyze_waste(data.model_dump())
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/esg-report")
async def esg_report(data: ESGData):
    try:
        result = generate_esg_report(data.model_dump())
        return {"status": "success", "report": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/carbon-footprint")
async def carbon_footprint(data: CarbonData):
    try:
        result = calculate_carbon_footprint(data.model_dump())
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))