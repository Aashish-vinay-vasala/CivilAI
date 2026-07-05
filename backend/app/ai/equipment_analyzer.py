import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.equipment")

EQUIPMENT_PROMPT = """
You are an expert construction equipment analyst.
Analyze and provide:

1. **Equipment Health**
   - Current condition
   - Failure risk score
   - Remaining useful life

2. **Maintenance Analysis**
   - Overdue maintenance
   - Upcoming service needs
   - Critical repairs

3. **Downtime Risk**
   - High risk equipment
   - Downtime probability
   - Cost of downtime

4. **Recommendations**
   - Immediate actions
   - Maintenance schedule
   - Replacement recommendations

Be specific with equipment IDs and dates.
"""


class EquipmentRisk(BaseModel):
    failure_risk: Literal["Low", "Medium", "High"]
    health_score: str = Field(description="Health as percentage string, e.g. '72%'")
    maintenance_overdue: int = Field(ge=0, default=0)
    critical_equipment: list[str] = Field(default_factory=list)
    downtime_probability: str = Field(description="Downtime probability as percentage string, e.g. '30%'")
    estimated_repair_cost: float = Field(ge=0, default=0.0)


def analyze_equipment(text: str) -> dict:
    analysis = analyze_document(text, EQUIPMENT_PROMPT)
    try:
        risk: EquipmentRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=EquipmentRisk,
            messages=[{"role": "user", "content": f"Extract equipment risk metrics from this data:\n{text[:3000]}"}],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Equipment risk extraction failed: %s", exc)
        risk_data = {"failure_risk": "Medium", "health_score": "Unknown", "maintenance_overdue": 0,
                     "critical_equipment": [], "downtime_probability": "Unknown", "estimated_repair_cost": 0.0}
    return {"analysis": analysis, "risk_data": risk_data}


class ExtractedEquipment(BaseModel):
    name: str = Field(description="Equipment name or description")
    equipment_type: Optional[str] = Field(default="", description="Type/category e.g. 'Crane', 'Excavator', 'Generator'")
    equipment_code: Optional[str] = Field(default="", description="Equipment ID or code if mentioned")
    status: Optional[str] = Field(default="Operational", description="Operational, Under Maintenance, or Inactive")
    health_score: Optional[int] = Field(default=80, description="Health score 0-100 if inferable, else 80")
    next_service: Optional[str] = Field(default=None, description="Next service date in YYYY-MM-DD if mentioned")
    age_years: Optional[float] = Field(default=0, description="Age in years if mentioned")
    operating_hours: Optional[float] = Field(default=0, description="Operating hours if mentioned")
    notes: Optional[str] = Field(default="", description="Any other relevant notes")


class EquipmentList(BaseModel):
    items: list[ExtractedEquipment] = Field(default_factory=list)


def extract_equipment_items(text: str) -> list[dict]:
    try:
        result: EquipmentList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=EquipmentList,
            messages=[{
                "role": "user",
                "content": (
                    "Extract every piece of equipment mentioned in this construction document. "
                    "For each item extract: name, type, code/ID, status, health score, next service date, age, hours. "
                    "Only include real equipment items, not generic categories.\n\n"
                    f"{text[:5000]}"
                ),
            }],
            max_retries=2,
        )
        return [e.model_dump() for e in result.items]
    except Exception as exc:
        logger.warning("Equipment extraction failed: %s", exc)
        return []


def predict_failure(equipment_data: dict) -> str:
    prompt = f"""
    Predict failure risk for this equipment:
    {equipment_data}

    Include:
    - Failure probability
    - Expected failure date
    - Warning signs
    - Preventive actions
    - Cost impact
    """
    return analyze_document(str(equipment_data), prompt)


def generate_maintenance_schedule(equipment_list: list) -> str:
    prompt = f"""
    Generate maintenance schedule for:
    {equipment_list}

    Include:
    - Daily checks
    - Weekly maintenance
    - Monthly service
    - Annual overhaul
    - Priority ranking
    - Cost estimates
    """
    return analyze_document(str(equipment_list), prompt)


def analyze_downtime(downtime_data: dict) -> str:
    prompt = f"""
    Analyze equipment downtime impact:
    {downtime_data}

    Include:
    - Schedule impact
    - Cost impact
    - Recovery options
    - Alternative equipment
    - Prevention recommendations
    """
    return analyze_document(str(downtime_data), prompt)
