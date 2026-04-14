from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

def analyze_waste(data: dict) -> str:
    prompt = f"""
    You are a construction sustainability expert.
    Analyze this waste data and provide:
    
    1. Waste Generation Analysis
       - Total waste by category
       - Waste reduction opportunities
       - Recycling recommendations
    
    2. Environmental Impact
       - Carbon footprint estimate
       - Environmental risk areas
    
    3. ESG Score Assessment
       - Current ESG score
       - Improvement recommendations
    
    4. Action Plan
       - Immediate actions
       - Long-term sustainability goals
    
    Data: {data}
    """
    return analyze_document(str(data), prompt)

def generate_esg_report(data: dict) -> str:
    prompt = f"""
    Generate a professional ESG (Environmental, Social, Governance) report
    for this construction project:
    
    {data}
    
    Include:
    - Executive Summary
    - Environmental Performance
    - Social Impact
    - Governance Practices
    - Key Metrics
    - Targets & Goals
    - Recommendations
    """
    return analyze_document(str(data), prompt)

def calculate_carbon_footprint(data: dict) -> str:
    prompt = f"""
    Calculate and analyze carbon footprint for:
    {data}
    
    Include:
    - Total CO2 emissions estimate
    - Breakdown by source
    - Comparison to industry average
    - Reduction strategies
    - Carbon offset recommendations
    """
    return analyze_document(str(data), prompt)