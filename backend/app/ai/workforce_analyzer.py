from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

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

def analyze_workforce(text: str) -> dict:
    analysis = analyze_document(text, WORKFORCE_PROMPT)

    risk_prompt = """
    Based on this workforce data, return ONLY JSON:
    {
        "turnover_risk": "Low/Medium/High",
        "skill_gap_score": 0,
        "productivity_rate": "0%",
        "hiring_urgency": "Low/Medium/High",
        "top_skill_gaps": ["s1", "s2", "s3"],
        "retention_risk_count": 0
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

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
    return analyze_document(
        str(job_requirements),
        prompt
    )

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