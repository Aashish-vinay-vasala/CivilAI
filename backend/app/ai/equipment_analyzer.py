from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

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

def analyze_equipment(text: str) -> dict:
    analysis = analyze_document(text, EQUIPMENT_PROMPT)

    risk_prompt = """
    Based on this equipment data, return ONLY JSON:
    {
        "failure_risk": "Low/Medium/High",
        "health_score": "0%",
        "maintenance_overdue": 0,
        "critical_equipment": ["e1", "e2"],
        "downtime_probability": "0%",
        "estimated_repair_cost": 0
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

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