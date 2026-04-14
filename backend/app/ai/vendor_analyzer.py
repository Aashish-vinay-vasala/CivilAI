from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

def score_vendor(data: dict) -> str:
    prompt = f"""
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
    return analyze_document(str(data), prompt)

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
