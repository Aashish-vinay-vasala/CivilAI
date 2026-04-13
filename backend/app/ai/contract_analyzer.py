from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

CONTRACT_PROMPT = """
You are an expert construction contract analyst.
Analyze this contract and provide:

1. **Risk Assessment**
   - High risk clauses
   - Medium risk clauses
   - Missing standard clauses

2. **Key Obligations**
   - Deadlines & milestones
   - Payment terms
   - Penalties & liquidated damages

3. **Legal Suggestions**
   - Clauses to negotiate
   - Safer alternative wording
   - Red flags

4. **Dispute Risk**
   - Probability of disputes
   - Dispute-prone clauses
   - Prevention recommendations

5. **Summary**
   - Overall risk score (1-10)
   - Key recommendations

Be specific and actionable.
"""

def analyze_contract(text: str) -> dict:
    analysis = analyze_document(text, CONTRACT_PROMPT)
    
    risk_prompt = """
    Based on this contract, give a risk score 1-10.
    Return ONLY a JSON like:
    {
        "risk_score": 7,
        "risk_level": "High",
        "top_risks": ["risk1", "risk2", "risk3"],
        "dispute_probability": "65%"
    }
    """
    
    risk_data = analyze_text(text[:3000], risk_prompt)
    
    return {
        "analysis": analysis,
        "risk_data": risk_data
    }

def generate_rfi(issue: str, project_context: str) -> str:
    prompt = f"""
    Generate a professional RFI (Request for Information) 
    for this construction issue:
    
    Issue: {issue}
    Project Context: {project_context}
    
    Format it professionally with:
    - RFI Number (auto)
    - Date
    - Subject
    - Description
    - Information Required
    - Impact if not resolved
    """
    return analyze_document(issue, prompt)

def analyze_change_order(text: str) -> str:
    prompt = """
    Analyze this change order and provide:
    - Scope of change
    - Cost impact
    - Time impact
    - Risk assessment
    - Recommendation (approve/negotiate/reject)
    """
    return analyze_document(text, prompt)