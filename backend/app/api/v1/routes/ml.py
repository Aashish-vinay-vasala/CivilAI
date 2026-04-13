from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.ml_service import (
    predict_cost_overrun,
    predict_delay,
    predict_safety_risk,
    predict_turnover,
    predict_equipment_failure,
    get_material_prices,
    get_safety_stats,
    get_delay_stats,
    get_workforce_stats,
    get_equipment_stats,
)

router = APIRouter()

class CostInput(BaseModel):
    project_type: str
    duration_months: int
    team_size: int
    change_orders: int
    material_price_increase: float
    weather_impact_days: int
    subcontractor_count: int

class DelayInput(BaseModel):
    project_type: str
    planned_duration_days: int
    weather_delays: int
    labor_shortage: int
    material_delays: int
    design_changes: int
    subcontractor_issues: int

class SafetyInput(BaseModel):
    incident_type: str
    zone: str
    workers_involved: int
    ppe_worn: int
    training_completed: int
    near_miss: int
    month: int

class TurnoverInput(BaseModel):
    role: str
    experience_years: int
    salary: float
    performance_score: float
    safety_violations: int
    training_hours: int
    overtime_hours: int
    tenure_months: int

class EquipmentInput(BaseModel):
    equipment_type: str
    age_years: int
    operating_hours: int
    maintenance_count: int
    last_service_days_ago: int
    breakdowns: int

@router.post("/cost-overrun")
async def cost_overrun(data: CostInput):
    try:
        return await predict_cost_overrun(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/delay")
async def delay_prediction(data: DelayInput):
    try:
        return await predict_delay(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/safety-risk")
async def safety_risk(data: SafetyInput):
    try:
        return await predict_safety_risk(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/turnover")
async def turnover(data: TurnoverInput):
    try:
        return await predict_turnover(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/equipment-failure")
async def equipment_failure(data: EquipmentInput):
    try:
        return await predict_equipment_failure(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/material-prices")
async def material_prices():
    try:
        return await get_material_prices()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/safety-stats")
async def safety_stats():
    try:
        return await get_safety_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/delay-stats")
async def delay_stats():
    try:
        return await get_delay_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workforce-stats")
async def workforce_stats():
    try:
        return await get_workforce_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/equipment-stats")
async def equipment_stats():
    try:
        return await get_equipment_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))