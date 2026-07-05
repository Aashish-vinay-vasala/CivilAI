import logging
from typing import Literal
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.vendor")


class VendorScore(BaseModel):
    overall_score: float = Field(ge=0, le=100, description="Overall vendor score 0–100")
    quality_score: float = Field(ge=0, le=100)
    delivery_reliability: float = Field(ge=0, le=100)
    safety_compliance: float = Field(ge=0, le=100)
    financial_stability: float = Field(ge=0, le=100)
    communication: float = Field(ge=0, le=100)
    risk_level: Literal["Low", "Medium", "High"]
    recommendation: Literal["Preferred", "Approved", "Review", "Blacklist"]
    key_risk_factors: list[str] = Field(default_factory=list)
    improvement_areas: list[str] = Field(default_factory=list)


def score_vendor(data: dict) -> dict:
    narrative_prompt = f"""
    You are a construction vendor evaluation expert.
    Score and analyze this vendor/subcontractor:

    {data}

    Provide:
    1. Overall Score (0-100)
    2. Performance Breakdown
       - Quality score
       - Delivery reliability
       - Safety compliance
       - Financial stability
       - Communication
    3. Risk Assessment
       - Risk level (Low/Medium/High)
       - Key risk factors
    4. Recommendation
       - Preferred/Approved/Review/Blacklist
       - Reasoning
    5. Improvement Areas
    """
    narrative = analyze_document(str(data), narrative_prompt)

    try:
        score: VendorScore = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=VendorScore,
            messages=[{"role": "user", "content": f"Score this construction vendor/subcontractor:\n{data}"}],
            max_retries=2,
        )
        return {"narrative": narrative, "scores": score.model_dump()}
    except Exception as exc:
        logger.warning("Vendor scoring failed: %s", exc)
        return {"narrative": narrative, "scores": None}


def compare_vendors(vendors: list) -> str:
    prompt = f"""
    Compare these construction vendors/subcontractors:
    {vendors}

    Provide:
    1. Ranked comparison table
    2. Best vendor recommendation
    3. Key differentiators
    4. Risk summary per vendor
    5. Final recommendation
    """
    return analyze_document(str(vendors), prompt)


def generate_vendor_report(vendor: dict) -> str:
    prompt = f"""
    Generate a detailed vendor performance report:
    {vendor}

    Include:
    - Executive summary
    - Performance metrics
    - Historical track record
    - Financial assessment
    - Compliance status
    - Recommendations
    """
    return analyze_document(str(vendor), prompt)
