import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.compliance")

COMPLIANCE_PROMPT = """
You are an expert construction compliance analyst.
Analyze and provide:

1. **Permit Status**
   - Required permits
   - Missing permits
   - Expiry dates

2. **Regulatory Compliance**
   - Current violations
   - Risk areas
   - Compliance score

3. **Code Compliance**
   - Building code issues
   - Safety code violations
   - Environmental compliance

4. **Action Plan**
   - Immediate actions
   - Deadlines
   - Responsible parties

Be specific with regulations and deadlines.
"""


class ComplianceRisk(BaseModel):
    compliance_score: str = Field(description="Compliance percentage string, e.g. '78%'")
    risk_level: Literal["Low", "Medium", "High"]
    violations_count: int = Field(ge=0, default=0)
    permits_missing: list[str] = Field(default_factory=list)
    urgent_actions: list[str] = Field(default_factory=list)
    deadline_risks: list[str] = Field(default_factory=list)


class ExtractedPermit(BaseModel):
    name: str = Field(description="Permit name or reference number, e.g. 'Building Permit BP-2024-0892'")
    type: str = Field(description="Permit type, e.g. 'Building Permit', 'Environmental Clearance', 'Fire Safety Certificate'")
    status: Literal["Approved", "Pending", "Rejected"] = "Pending"
    expiry_date: Optional[str] = Field(default=None, description="Expiry date in YYYY-MM-DD format if mentioned, else null")
    risk_level: Literal["low", "medium", "high"] = "medium"
    issued_by: Optional[str] = Field(default=None, description="Issuing authority if mentioned")


class PermitsList(BaseModel):
    permits: list[ExtractedPermit] = Field(default_factory=list)


def analyze_compliance(text: str) -> dict:
    analysis = analyze_document(text, COMPLIANCE_PROMPT)
    try:
        risk: ComplianceRisk = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=ComplianceRisk,
            messages=[{"role": "user", "content": f"Extract compliance risk metrics from this data:\n{text[:3000]}"}],
            max_retries=2,
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Compliance risk extraction failed: %s", exc)
        risk_data = {"compliance_score": "Unknown", "risk_level": "Medium", "violations_count": 0,
                     "permits_missing": [], "urgent_actions": [], "deadline_risks": []}

    try:
        permits_list: PermitsList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=PermitsList,
            messages=[{"role": "user", "content": f"Extract every permit mentioned in this compliance document as structured data. If no expiry date is given, leave it null:\n{text[:4000]}"}],
            max_retries=2,
        )
        extracted_permits = [p.model_dump() for p in permits_list.permits]
    except Exception as exc:
        logger.warning("Permit extraction failed: %s", exc)
        extracted_permits = []

    return {"analysis": analysis, "risk_data": risk_data, "extracted_permits": extracted_permits}


def check_code_compliance(project_data: dict) -> str:
    prompt = f"""
    Check building code compliance for:
    {project_data}

    Include:
    - Code violations found
    - Required corrections
    - Inspection requirements
    - Timeline for compliance
    """
    return analyze_document(str(project_data), prompt)


def generate_permit_application(permit_data: dict) -> str:
    prompt = f"""
    Generate a permit application for:
    {permit_data}

    Include:
    - Application details
    - Required documents list
    - Submission checklist
    - Expected timeline
    - Supporting statements
    """
    return analyze_document(str(permit_data), prompt)


def track_regulatory_changes(region: str, project_type: str) -> str:
    prompt = f"""
    Identify key regulatory requirements for:
    Region: {region}
    Project Type: {project_type}

    Include:
    - Applicable regulations
    - Recent changes
    - Compliance requirements
    - Risk areas
    """
    return analyze_document(region, prompt)
