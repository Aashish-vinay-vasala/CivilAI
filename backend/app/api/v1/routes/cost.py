from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.cost_analyzer import (
    analyze_cost_report,
    forecast_cashflow,
    analyze_material_prices
)
from app.ocr.document_processor import process_document

router = APIRouter()

class CashFlowRequest(BaseModel):
    project_name: str
    total_budget: float
    spent_to_date: float
    completion_percentage: float
    monthly_burn_rate: float
    pending_payments: list = []

class MaterialPriceRequest(BaseModel):
    materials: list

@router.post("/analyze-report")
async def analyze_cost_report_route(
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
        result = analyze_cost_report(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cashflow-forecast")
async def cashflow_forecast(
    request: CashFlowRequest
):
    try:
        forecast = forecast_cashflow(
            request.model_dump()
        )
        return {
            "status": "success",
            "forecast": forecast
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/material-prices")
async def material_price_analysis(
    request: MaterialPriceRequest
):
    try:
        analysis = analyze_material_prices(
            request.materials
        )
        return {
            "status": "success",
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))