from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

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

def analyze_procurement(text: str) -> dict:
    analysis = analyze_document(text, PROCUREMENT_PROMPT)

    risk_prompt = """
    Based on this procurement data, return ONLY JSON:
    {
        "supply_risk": "Low/Medium/High",
        "cost_saving_potential": "0%",
        "delivery_risk": "Low/Medium/High",
        "top_risks": ["r1", "r2", "r3"],
        "priority_materials": ["m1", "m2"],
        "recommended_suppliers": ["s1", "s2"]
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

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