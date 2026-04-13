from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

COST_PROMPT = """
You are an expert construction cost analyst.
Analyze and provide:

1. **Cost Overrun Analysis**
   - Current overrun percentage
   - Main cost drivers
   - Risk areas

2. **Budget Assessment**
   - Budget utilization
   - Burn rate analysis
   - Cash flow forecast

3. **Material Price Analysis**
   - Price fluctuations
   - High risk materials
   - Procurement recommendations

4. **Recommendations**
   - Cost saving opportunities
   - Budget reallocation suggestions
   - Risk mitigation actions

Be specific with numbers and percentages.
"""

def analyze_cost_report(text: str) -> dict:
    analysis = analyze_document(text, COST_PROMPT)

    risk_prompt = """
    Based on this cost report, return ONLY JSON:
    {
        "overrun_percentage": 0,
        "risk_level": "Low/Medium/High",
        "budget_utilization": "0%",
        "cash_flow_status": "Positive/Negative",
        "top_cost_drivers": ["d1", "d2", "d3"],
        "savings_potential": "0%"
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

def forecast_cashflow(project_data: dict) -> str:
    prompt = f"""
    Forecast 90-day cash flow for this project:
    {project_data}
    
    Include:
    - Monthly cash flow projections
    - Payment milestone predictions
    - Risk periods
    - Recommendations
    """
    return analyze_document(str(project_data), prompt)

def analyze_material_prices(materials: list) -> str:
    prompt = f"""
    Analyze price risks for these materials:
    {materials}
    
    Include:
    - Current market trends
    - Price volatility risk
    - Best procurement timing
    - Alternative materials
    """
    return analyze_document(str(materials), prompt)