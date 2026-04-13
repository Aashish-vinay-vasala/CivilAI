from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

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

def analyze_safety_report(text: str) -> dict:
    analysis = analyze_document(text, SAFETY_PROMPT)
    
    risk_prompt = """
    Based on this safety report, return ONLY JSON:
    {
        "risk_score": 7,
        "risk_level": "High",
        "violations": ["v1", "v2"],
        "immediate_actions": ["a1", "a2"],
        "osha_compliance": "85%"
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)
    
    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

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
    prompt = f"""
    Assess safety risk for this construction zone:
    {zone_data}
    
    Return ONLY JSON:
    {{
        "zone": "{zone_data.get('name')}",
        "risk_score": 0,
        "risk_level": "Low/Medium/High",
        "hazards": [],
        "recommendations": []
    }}
    """
    result = analyze_text(str(zone_data), prompt)
    return {"assessment": result}
