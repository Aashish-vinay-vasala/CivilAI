import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.cost")

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


class CostRisk(BaseModel):
    overrun_percentage: Optional[float] = Field(default=None, description="Cost overrun as a number, null if not found")
    risk_level: Optional[Literal["Low", "Medium", "High"]] = None
    budget_utilization: Optional[str] = Field(default=None, description="Percentage string or null")
    cash_flow_status: Optional[Literal["Positive", "Negative"]] = None
    top_cost_drivers: list[str] = Field(default_factory=list)
    savings_potential: Optional[str] = Field(default=None)


def analyze_cost_report(text: str) -> dict:
    truncated = text[:_MAX_CHARS]
    analysis = analyze_document(truncated, COST_PROMPT)
    try:
        risk: CostRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=CostRisk,
            messages=[{
                "role": "user",
                "content": (
                    "Extract cost risk metrics from this report. "
                    "Use null for any value not explicitly stated in the document.\n\n"
                    + text[:3000]
                ),
            }],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Cost risk extraction failed: %s", exc)
        risk_data = {"overrun_percentage": None, "risk_level": None, "budget_utilization": None,
                     "cash_flow_status": None, "top_cost_drivers": [], "savings_potential": None}
    return {"analysis": analysis, "risk_data": risk_data}


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


def analyze_scenarios(scenarios: list, project_name: str = "the project", evm: dict | None = None) -> str:
    evm_lines = ""
    if evm:
        cpi = evm.get("cpi") or 1
        spi = evm.get("spi") or 1
        evm_lines = (
            f"\nLive EVM — CPI: {cpi:.2f} ({'under budget' if cpi >= 1 else 'OVER budget'}), "
            f"SPI: {spi:.2f} ({'on/ahead' if spi >= 1 else 'BEHIND schedule'}), "
            f"Actual Cost (AC): ${evm.get('ac', 0):,.0f}, Earned Value (EV): ${evm.get('ev', 0):,.0f}\n"
        )

    scenario_lines = "\n".join(
        f"  [{i+1}] {s.get('name', f'Scenario {i+1}')}: "
        f"Budget ${s.get('budget', 0):,.0f} | Duration {s.get('duration', 0)} months | "
        f"Labour {s.get('laborCostPct', 0):.0f}% | Materials {s.get('materialCostPct', 0):.0f}% | "
        f"Contingency {s.get('contingencyPct', 0):.0f}% | Total Estimate ${s.get('totalCost', 0):,.0f} | "
        f"Monthly Burn ${s.get('totalCost', 0) / max(s.get('duration', 1), 1):,.0f}/mo"
        for i, s in enumerate(scenarios)
    )

    prompt = f"""You are a senior construction cost consultant with deep expertise in EVM, risk management, and infrastructure finance. Produce a rigorous, quantitative scenario analysis for **{project_name}**.
{evm_lines}
SCENARIOS:
{scenario_lines}

Write your analysis using EXACTLY this structure (keep section headings exactly as shown):

**1. Risk Ranking**
Rank every scenario from lowest to highest financial risk. For each one state: risk level (Low / Medium / High / Critical), the single biggest cost driver, and estimated probability of budget overrun (%). Reference exact dollar and percentage figures.

**2. Cash Flow Assessment**
For each scenario, evaluate monthly burn sustainability. Identify which scenario offers the best liquidity buffer and pinpoint the months where cash pressure is highest. Cite the specific burn rates.

**3. Contingency Adequacy**
Industry benchmarks: 5–10% for well-defined scope, 10–20% for moderate risk, 20–30% for early-stage or complex projects. Assess every scenario against these thresholds. Flag any that are dangerously thin or unnecessarily padded, with the dollar impact of the gap.

**4. Schedule vs Budget Trade-off**
Quantify the implied cost-per-month for duration differences across scenarios. Identify the scenario with the best time-value efficiency. Highlight any where schedule compression creates unsustainable burn rates or cost risk.

**5. Key KPIs to Monitor Weekly**
List exactly 5 KPIs the project manager must track. For each: name, target threshold, and the specific corrective action to take if the threshold is breached.

**Recommendation**
State clearly which scenario you recommend and why, in 2–3 sentences with specific financial justification.

Rules: reference actual numbers from the scenarios; use EVM terminology (CPI, SPI, EAC, VAC) where relevant; be direct and prescriptive."""

    return analyze_document(scenario_lines + evm_lines, prompt)


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
