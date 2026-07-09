from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.cost_analyzer import (
    analyze_cost_report,
    forecast_cashflow,
    analyze_material_prices,
    analyze_scenarios,
    extract_cost_items,
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


class ScenarioItem(BaseModel):
    name: str = ""
    budget: float = 0
    duration: int = 0
    laborCostPct: float = 0
    materialCostPct: float = 0
    contingencyPct: float = 0
    totalCost: float = 0


class ScenarioAnalysisRequest(BaseModel):
    project_name: str = "the project"
    scenarios: list[ScenarioItem]
    evm_cpi: float | None = None
    evm_spi: float | None = None
    evm_ac: float | None = None
    evm_ev: float | None = None

@router.post("/analyze-report")
async def analyze_cost_report_route(
    file: UploadFile = File(...)
):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = (doc["extracted_text"] or "").strip()
        if not text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from the uploaded file. Ensure it is a readable PDF, Excel, or Word document."
            )

        extraction = extract_cost_items(text)
        analysis, risk_data = None, None
        if extraction.get("is_cost_document"):
            result = analyze_cost_report(text)
            analysis, risk_data = result["analysis"], result["risk_data"]

        return {
            "status": "success",
            "analysis": analysis,
            "risk_data": risk_data,
            "is_cost_document": extraction.get("is_cost_document", False),
            "validation_message": extraction.get("validation_message", ""),
            "document_type": extraction.get("document_type"),
            "items": extraction.get("items", []),
        }
    except HTTPException:
        raise
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


@router.post("/scenarios/analyze")
async def scenario_analysis(request: ScenarioAnalysisRequest):
    try:
        evm = None
        if any(v is not None for v in [request.evm_cpi, request.evm_spi, request.evm_ac, request.evm_ev]):
            evm = {
                "cpi": request.evm_cpi,
                "spi": request.evm_spi,
                "ac": request.evm_ac or 0,
                "ev": request.evm_ev or 0,
            }
        scenarios = [s.model_dump() for s in request.scenarios]
        analysis = analyze_scenarios(scenarios, request.project_name, evm)
        return {"status": "success", "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))