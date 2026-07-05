import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.safety")

SAFETY_PROMPT = """
You are an expert construction safety analyst.
Analyze and provide:

1. **Risk Assessment**
   - High risk zones
   - Medium risk zones
   - Risk score (1-10)

2. **Safety Violations**
   - PPE violations
   - Unsafe practices
   - Equipment hazards

3. **OSHA Compliance**
   - Violations found
   - Required corrective actions
   - Deadlines

4. **Recommendations**
   - Immediate actions
   - Preventive measures
   - Training required

Be specific and actionable.
"""


class SafetyRisk(BaseModel):
    risk_score: float = Field(ge=0, le=10)
    risk_level: Literal["Low", "Medium", "High"]
    violations: list[str] = Field(default_factory=list)
    immediate_actions: list[str] = Field(default_factory=list)
    osha_compliance: str = Field(description="Compliance percentage string, e.g. '85%'")


def analyze_safety_report(text: str) -> dict:
    analysis = analyze_document(text, SAFETY_PROMPT)
    try:
        risk: SafetyRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=SafetyRisk,
            messages=[{"role": "user", "content": f"Extract safety risk metrics from this report:\n{text[:3000]}"}],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Safety risk extraction failed: %s", exc)
        risk_data = {"risk_score": 5.0, "risk_level": "Medium", "violations": [], "immediate_actions": [], "osha_compliance": "Unknown"}
    return {"analysis": analysis, "risk_data": risk_data}


class ExtractedIncident(BaseModel):
    type: str = Field(description="Incident type e.g. 'Fall', 'Equipment Failure', 'Near Miss', 'Fire'")
    description: Optional[str] = Field(default="", description="Brief description of the incident")
    severity: Literal["low", "medium", "high"] = "medium"
    status: Literal["open", "investigating", "closed"] = "open"
    zone: Optional[str] = Field(default="", description="Work zone or area")
    location: Optional[str] = Field(default="", description="Specific location on site")
    injured: Optional[str] = Field(default="None", description="Name(s) of injured persons or 'None'")
    date: Optional[str] = Field(default=None, description="Incident date in YYYY-MM-DD if mentioned")


class IncidentsList(BaseModel):
    incidents: list[ExtractedIncident] = Field(default_factory=list)


def extract_safety_incidents(text: str) -> list[dict]:
    try:
        result: IncidentsList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=IncidentsList,
            messages=[{
                "role": "user",
                "content": (
                    "Extract every safety incident, near-miss, observation, or violation mentioned in this construction document. "
                    "For each extract: type, description, severity (low/medium/high), status, zone, location, injured persons, date. "
                    "Only include specific incidents, not general safety policies.\n\n"
                    f"{text[:5000]}"
                ),
            }],
            max_retries=2,
        )
        return [i.model_dump() for i in result.incidents]
    except Exception as exc:
        logger.warning("Incident extraction failed: %s", exc)
        return []


def generate_incident_report(incident: dict) -> str:
    prompt = f"""
    Generate a professional OSHA incident report:

    Incident Details:
    - Type: {incident.get('type')}
    - Location: {incident.get('location')}
    - Date: {incident.get('date')}
    - Description: {incident.get('description')}
    - Injured: {incident.get('injured')}

    Include:
    - Incident summary
    - Root cause analysis
    - Corrective actions
    - Preventive measures
    - Regulatory notifications required
    """
    return analyze_document(str(incident), prompt)


def assess_zone_risk(zone_data: dict) -> dict:
    class ZoneRisk(BaseModel):
        zone: str
        risk_score: float = Field(ge=0, le=10)
        risk_level: Literal["Low", "Medium", "High"]
        hazards: list[str] = Field(default_factory=list)
        recommendations: list[str] = Field(default_factory=list)

    try:
        result: ZoneRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=ZoneRisk,
            messages=[{"role": "user", "content": f"Assess the safety risk for this construction zone:\n{zone_data}"}],
            max_retries=2,
        )
        return {"assessment": result.model_dump()}
    except Exception as exc:
        logger.warning("Zone risk assessment failed: %s", exc)
        return {"assessment": {"zone": str(zone_data.get("name", "")), "risk_score": 5.0, "risk_level": "Medium", "hazards": [], "recommendations": []}}
