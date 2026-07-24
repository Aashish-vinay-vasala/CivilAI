import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_chat

logger = logging.getLogger("civilai.workforce")

WORKFORCE_PROMPT = """
You are an expert construction workforce analyst.
Analyze and provide:

1. **Skills Assessment**
   - Available skills
   - Skill gaps
   - Training needs

2. **Turnover Risk**
   - High risk workers
   - Retention recommendations
   - Cost of turnover

3. **Resource Planning**
   - Crew optimization
   - Labor forecast
   - Productivity analysis

4. **Recommendations**
   - Hiring priorities
   - Training programs
   - Retention strategies

Be specific and actionable.
"""


class WorkforceRisk(BaseModel):
    turnover_risk: Literal["Low", "Medium", "High"]
    skill_gap_score: float = Field(ge=0, le=10, default=5.0)
    productivity_rate: str = Field(description="Productivity as percentage string, e.g. '80%'")
    hiring_urgency: Literal["Low", "Medium", "High"]
    top_skill_gaps: list[str] = Field(default_factory=list)
    retention_risk_count: int = Field(ge=0, default=0)


def analyze_workforce(text: str) -> dict:
    analysis = analyze_document(text, WORKFORCE_PROMPT)
    try:
        risk: WorkforceRisk = instructor_chat(
            WorkforceRisk,
            [{"role": "user", "content": f"Extract workforce risk metrics from this data:\n{text[:3000]}"}],
        )
        risk_data = risk.model_dump()
    except Exception as exc:
        logger.warning("Workforce risk extraction failed: %s", exc)
        risk_data = {"turnover_risk": "Medium", "skill_gap_score": 5.0, "productivity_rate": "Unknown",
                     "hiring_urgency": "Medium", "top_skill_gaps": [], "retention_risk_count": 0}
    return {"analysis": analysis, "risk_data": risk_data}


class ExtractedMember(BaseModel):
    name: str = Field(description="Full name of the person")
    role: str = Field(description="Job role or title, e.g. 'Site Engineer', 'Project Manager'")
    trade: Optional[str] = Field(default="", description="Trade/discipline, e.g. 'Civil', 'MEP', 'Safety'")
    email: Optional[str] = Field(default="", description="Email address if present")
    phone: Optional[str] = Field(default="", description="Phone/mobile number if present")
    status: Literal["active", "onleave", "inactive"] = "active"


class MembersList(BaseModel):
    members: list[ExtractedMember] = Field(default_factory=list)


_MEMBER_EXTRACT_CHAR_BUDGET = 20000  # ~room for several hundred roster rows


def _truncate_at_row_boundary(text: str, limit: int) -> str:
    """Cut at the last newline before `limit` instead of mid-row, so a long
    roster loses only its tail rows cleanly rather than a garbled partial row."""
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit)
    return text[:cut if cut > 0 else limit]


def extract_team_members(text: str) -> list[dict]:
    try:
        result: MembersList = instructor_chat(
            MembersList,
            [{
                "role": "user",
                "content": (
                    "Extract every person / team member mentioned in this construction document. "
                    "For each person extract: full name, role/title, trade/discipline, email, phone, status. "
                    "If a field is not mentioned leave it blank. Only include real people, not generic labels.\n\n"
                    f"{_truncate_at_row_boundary(text, _MEMBER_EXTRACT_CHAR_BUDGET)}"
                ),
            }],
        )
        return [m.model_dump() for m in result.members]
    except Exception as exc:
        logger.warning("Member extraction failed: %s", exc)
        return []


def match_skills(job_requirements: dict, available_workers: list) -> str:
    prompt = f"""
    Match workers to job requirements:

    Requirements: {job_requirements}
    Available Workers: {available_workers}

    Provide:
    - Best matches ranked
    - Skill gaps per worker
    - Training needed
    - Recommendations
    """
    return analyze_document(str(job_requirements), prompt)


def predict_turnover(worker_data: list) -> str:
    prompt = f"""
    Predict turnover risk for these workers:
    {worker_data}

    For each worker provide:
    - Turnover probability
    - Risk factors
    - Retention recommendations
    - Cost impact if they leave
    """
    return analyze_document(str(worker_data), prompt)


def generate_onboarding_plan(worker: dict) -> str:
    prompt = f"""
    Generate onboarding plan for new worker:
    {worker}

    Include:
    - Day 1 schedule
    - Week 1 training plan
    - Month 1 milestones
    - Required certifications
    - Mentor assignment
    - Safety induction checklist
    """
    return analyze_document(str(worker), prompt)
