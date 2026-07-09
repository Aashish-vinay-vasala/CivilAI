from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.procurement_analyzer import (
    analyze_procurement,
    generate_purchase_order,
    compare_suppliers,
    forecast_material_demand
)
from app.ocr.document_processor import process_document
from app.services.db_service import supabase

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

class PurchaseOrderRecord(BaseModel):
    project_id: str
    supplier_name: str
    material: str = ""
    quantity: float = 0
    unit_price: float = 0
    total_amount: float = 0
    order_date: Optional[str] = None
    delivery_date: Optional[str] = None
    status: str = "pending"

class PurchaseOrderUpdate(BaseModel):
    status: Optional[str] = None
    total_amount: Optional[float] = None
    supplier_name: Optional[str] = None
    material: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    delivery_date: Optional[str] = None

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


# ── Purchase order records (persisted, tracked against the purchase_orders table) ──

@router.get("/purchase-orders")
async def list_purchase_order_records(project_id: Optional[str] = None):
    try:
        query = supabase.table("purchase_orders").select("*").order("created_at", desc=True)
        if project_id:
            query = query.eq("project_id", project_id)
        res = query.execute()
        return {"status": "success", "purchase_orders": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/purchase-orders")
async def create_purchase_order_record(body: PurchaseOrderRecord):
    try:
        data = body.model_dump(exclude_none=True)
        data.setdefault("order_date", date.today().isoformat())
        res = supabase.table("purchase_orders").insert(data).execute()
        return {"status": "success", "purchase_order": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/purchase-orders/{po_id}")
async def update_purchase_order_record(po_id: str, body: PurchaseOrderUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        res = supabase.table("purchase_orders").update(updates).eq("id", po_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return {"status": "success", "purchase_order": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order_record(po_id: str):
    try:
        supabase.table("purchase_orders").delete().eq("id", po_id).execute()
        return {"status": "success", "deleted": po_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))