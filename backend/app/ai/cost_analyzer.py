from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

# Max characters sent to the model — keeps token count well within Groq's context window
_MAX_CHARS = 12000

COST_PROMPT = """You are an expert construction cost analyst. A cost/budget report has been uploaded below.

IMPORTANT RULES:
- Base every figure, percentage, and conclusion SOLELY on what is written in the document.
- Do NOT invent, estimate, or assume any number that is not explicitly stated in the document.
- If a required piece of data is missing from the document, write "Not found in document" for that item.
- Quote specific line items, totals, and dates exactly as they appear.

Provide a structured analysis with these four sections:

1. **Cost Overrun Analysis**
   - Total budget vs actual spend (with exact figures from the document)
   - Overrun percentage (calculate only if both budget and actual are present)
   - Identified cost drivers listed in the document

2. **Budget Assessment**
   - Budget utilization percentage
   - Burn rate or monthly spend (if stated)
   - Cash flow position or forecast (if stated)

3. **Material & Labour Cost Breakdown**
   - Any material or labour line items mentioned, with their costs
   - Items flagged as over-budget or at risk

4. **Recommendations**
   - Specific actions suggested by or implied by the document data
   - Risk areas with supporting numbers from the document
"""

def analyze_cost_report(text: str) -> dict:
    truncated = text[:_MAX_CHARS]

    analysis = analyze_document(truncated, COST_PROMPT)

    risk_prompt = """You are a construction cost data extractor.
Read the cost report excerpt below and return ONLY valid JSON (no markdown, no explanation).
Extract only values that are explicitly stated. Use null for anything not found.

{
    "overrun_percentage": <number or null>,
    "risk_level": "<Low|Medium|High based on overrun severity, or null>",
    "budget_utilization": "<percentage string or null>",
    "cash_flow_status": "<Positive|Negative|null>",
    "top_cost_drivers": ["<item1>", "<item2>", "<item3>"],
    "savings_potential": "<percentage or dollar amount from document, or null>"
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