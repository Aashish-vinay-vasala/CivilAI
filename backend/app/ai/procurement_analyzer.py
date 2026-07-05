import logging
from typing import Literal
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.procurement")

PROCUREMENT_PROMPT = """
You are an expert construction procurement analyst.
Analyze and provide:

1. **Demand Forecast**
   - Material requirements
   - Quantity predictions
   - Timing recommendations

2. **Supplier Analysis**
   - Supplier performance
   - Risk assessment
   - Alternative suppliers

3. **Cost Optimization**
   - Bulk purchase opportunities
   - Price negotiation points
   - Cost saving potential

4. **Risk Assessment**
   - Supply chain risks
   - Delivery risks
   - Price volatility risks

Be specific with quantities and costs.
"""


class ProcurementRisk(BaseModel):
    supply_risk: Literal["Low", "Medium", "High"]
    cost_saving_potential: str = Field(description="Savings as percentage string, e.g. '12%'")
    delivery_risk: Literal["Low", "Medium", "High"]
    top_risks: list[str] = Field(default_factory=list)
    priority_materials: list[str] = Field(default_factory=list)
    recommended_suppliers: list[str] = Field(default_factory=list)


def analyze_procurement(text: str) -> dict:
    analysis = analyze_document(text, PROCUREMENT_PROMPT)
    try:
        risk: ProcurementRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=ProcurementRisk,
            messages=[{"role": "user", "content": f"Extract procurement risk metrics from this data:\n{text[:3000]}"}],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Procurement risk extraction failed: %s", exc)
        risk_data = {"supply_risk": "Medium", "cost_saving_potential": "Unknown", "delivery_risk": "Medium",
                     "top_risks": [], "priority_materials": [], "recommended_suppliers": []}
    return {"analysis": analysis, "risk_data": risk_data}


def generate_purchase_order(po_data: dict) -> str:
    prompt = f"""
    Generate a professional Purchase Order:
    {po_data}

    Include:
    - PO Number
    - Supplier details
    - Item descriptions
    - Quantities & prices
    - Delivery terms
    - Payment terms
    - Special instructions
    """
    return analyze_document(str(po_data), prompt)


def compare_suppliers(suppliers: list, requirements: dict) -> str:
    prompt = f"""
    Compare these suppliers for construction materials:

    Suppliers: {suppliers}
    Requirements: {requirements}

    Provide:
    - Ranked comparison
    - Price analysis
    - Quality assessment
    - Delivery reliability
    - Risk factors
    - Recommendation
    """
    return analyze_document(str(suppliers), prompt)


def forecast_material_demand(project_data: dict) -> str:
    prompt = f"""
    Forecast material demand for this project:
    {project_data}

    Include:
    - Monthly material requirements
    - Critical procurement dates
    - Buffer stock recommendations
    - Cost forecast
    """
    return analyze_document(str(project_data), prompt)
