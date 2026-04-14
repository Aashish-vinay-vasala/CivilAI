from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

def analyze_payments(data: dict) -> str:
    prompt = f"""
    You are a construction finance expert.
    Analyze these payment records:
    
    {data}
    
    Provide:
    1. Payment Status Summary
       - Total received
       - Total pending
       - Total overdue
    2. Cash Flow Analysis
       - Current position
       - 30/60/90 day forecast
    3. Risk Assessment
       - High risk payments
       - Dispute potential
    4. Recommendations
       - Immediate actions
       - Recovery strategies
    """
    return analyze_document(str(data), prompt)

def generate_payment_reminder(data: dict) -> str:
    prompt = f"""
    Write a professional payment reminder letter:
    {data}
    
    Include:
    - Formal reminder header
    - Invoice details
    - Amount due
    - Due date
    - Payment instructions
    - Consequences of non-payment
    - Contact details
    """
    return analyze_document(str(data), prompt)

def forecast_cashflow(data: dict) -> str:
    prompt = f"""
    Forecast cash flow for next 90 days:
    {data}
    
    Include:
    - Monthly projections
    - Risk periods
    - Payment milestones
    - Recommendations
    """
    return analyze_document(str(data), prompt)