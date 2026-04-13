from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

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

def analyze_compliance(text: str) -> dict:
    analysis = analyze_document(text, COMPLIANCE_PROMPT)

    risk_prompt = """
    Based on this compliance data, return ONLY JSON:
    {
        "compliance_score": "0%",
        "risk_level": "Low/Medium/High",
        "violations_count": 0,
        "permits_missing": ["p1", "p2"],
        "urgent_actions": ["a1", "a2"],
        "deadline_risks": ["d1", "d2"]
    }
    """
    risk_data = analyze_text(text[:3000], risk_prompt)

    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

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