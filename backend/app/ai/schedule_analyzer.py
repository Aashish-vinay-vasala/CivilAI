from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

SCHEDULE_PROMPT = """
You are an expert construction schedule analyst.
Analyze and provide:

1. **Delay Analysis**
   - Current delays
   - Root causes
   - Critical path impact

2. **Schedule Assessment**
   - Tasks at risk
   - Resource conflicts
   - Weather impacts

3. **Recovery Plan**
   - Recommended actions
   - Resource reallocation
   - Timeline adjustments

4. **Risk Forecast**
   - Upcoming delay risks
   - Mitigation strategies
   - Contingency recommendations

Be specific with dates and durations.
"""

def analyze_schedule(text: str) -> dict:
    analysis = analyze_document(text, SCHEDULE_PROMPT)

    risk_prompt = """
    Based on this schedule, return ONLY JSON:
    {
        "delay_days": 0,
        "risk_level": "Low/Medium/High",
        "completion_probability": "0%",
        "critical_tasks": ["t1", "t2"],
        "delay_causes": ["c1", "c2"],
        "recovery_time_days": 0
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

def predict_delays(project_data: dict) -> str:
    prompt = f"""
    Predict delays for this construction project:
    {project_data}
    
    Include:
    - Predicted delay duration
    - High risk tasks
    - Weather impact analysis
    - Resource bottlenecks
    - Recovery recommendations
    """
    return analyze_document(str(project_data), prompt)

def what_if_analysis(scenario: dict) -> str:
    prompt = f"""
    Perform what-if analysis for this scenario:
    {scenario}
    
    Include:
    - Impact on timeline
    - Cost implications
    - Resource requirements
    - Risk assessment
    - Recommended response
    """
    return analyze_document(str(scenario), prompt)

def generate_recovery_plan(delay_data: dict) -> str:
    prompt = f"""
    Generate a recovery plan for this delay:
    {delay_data}
    
    Include:
    - Immediate actions
    - Resource reallocation
    - Revised milestones
    - Cost to recover
    - Success probability
    """
    return analyze_document(str(delay_data), prompt)