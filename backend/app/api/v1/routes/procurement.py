from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.procurement_analyzer import (
    analyze_procurement,
    generate_purchase_order,
    compare_suppliers,
    forecast_material_demand
)
from app.ocr.document_processor import process_document

router = APIRouter()

class PurchaseOrderRequest(BaseModel):
    supplier_name: str
    supplier_address: str
    project_name: str
    items: list
    delivery_date: str
    payment_terms: str = "30 days"
    special_instructions: str = ""

class SupplierCompareRequest(BaseModel):
    suppliers: list
    requirements: dict

class DemandForecastRequest(BaseModel):
    project_name: str
    project_type: str
    total_area: float
    start_date: str
    end_date: str
    key_materials: list = []

@router.post("/analyze")
async def analyze_procurement_route(
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
        result = analyze_procurement(text)
        return {
            "status": "success",
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/purchase-order")
async def create_purchase_order(
    request: PurchaseOrderRequest
):
    try:
        po = generate_purchase_order(
            request.model_dump()
        )
        return {
            "status": "success",
            "purchase_order": po
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare-suppliers")
async def compare_suppliers_route(
    request: SupplierCompareRequest
):
    try:
        comparison = compare_suppliers(
            request.suppliers,
            request.requirements
        )
        return {
            "status": "success",
            "comparison": comparison
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/demand-forecast")
async def demand_forecast_route(
    request: DemandForecastRequest
):
    try:
        forecast = forecast_material_demand(
            request.model_dump()
        )
        return {
            "status": "success",
            "forecast": forecast
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))