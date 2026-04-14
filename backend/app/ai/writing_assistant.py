from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

WRITING_SYSTEM = """
You are CivilAI Writing Assistant — an expert construction document writer.
You write professional, formal, legally appropriate construction documents.
Always include proper formatting, reference numbers, dates, and signatures sections.
"""

def generate_letter(data: dict) -> str:
    prompt = f"""
    Write a professional construction letter:
    
    Type: {data.get('letter_type')}
    From: {data.get('from_name')} — {data.get('from_company')}
    To: {data.get('to_name')} — {data.get('to_company')}
    Project: {data.get('project_name')}
    Subject: {data.get('subject')}
    Key Points: {data.get('key_points')}
    Tone: {data.get('tone', 'Professional')}
    
    Write a complete, formal letter with:
    - Letterhead section
    - Reference number
    - Date
    - Proper salutation
    - Clear body paragraphs
    - Professional closing
    - Signature block
    """
    return analyze_document(str(data), prompt)

def generate_email(data: dict) -> str:
    prompt = f"""
    Write a professional construction email:
    
    Type: {data.get('email_type')}
    From: {data.get('from_name')}
    To: {data.get('to_name')}
    Project: {data.get('project_name')}
    Subject: {data.get('subject')}
    Key Points: {data.get('key_points')}
    Tone: {data.get('tone', 'Professional')}
    
    Write a complete email with:
    - Clear subject line
    - Professional greeting
    - Concise body
    - Action items if needed
    - Professional sign-off
    """
    return analyze_document(str(data), prompt)

def generate_notice(data: dict) -> str:
    prompt = f"""
    Write a formal construction notice:
    
    Notice Type: {data.get('notice_type')}
    Project: {data.get('project_name')}
    Issued By: {data.get('issued_by')}
    Issued To: {data.get('issued_to')}
    Details: {data.get('details')}
    
    Include:
    - Formal notice header
    - Reference number
    - Clear notification statement
    - Required actions
    - Deadline if applicable
    - Legal implications
    - Signatures section
    """
    return analyze_document(str(data), prompt)

def generate_variation_order(data: dict) -> str:
    prompt = f"""
    Generate a Variation Order (VO) for construction:
    
    Project: {data.get('project_name')}
    VO Number: {data.get('vo_number')}
    Requested By: {data.get('requested_by')}
    Description: {data.get('description')}
    Cost Impact: {data.get('cost_impact')}
    Time Impact: {data.get('time_impact')}
    
    Include:
    - VO header with number and date
    - Description of change
    - Reason for variation
    - Cost breakdown
    - Time impact analysis
    - Approval signatures section
    - Terms and conditions
    """
    return analyze_document(str(data), prompt)

def analyze_blueprint(image_data: bytes, query: str) -> str:
    from app.ai.gemini_client import analyze_image
    prompt = f"""
    You are an expert construction engineer analyzing a blueprint/drawing.
    
    Analyze this construction drawing and provide:
    1. Drawing type identification
    2. Key dimensions and measurements
    3. Materials specified
    4. Construction notes
    5. Potential issues or clashes
    6. Compliance observations
    
    Specific query: {query}
    """
    return analyze_image(image_data, prompt)

def analyze_contract_document(text: str) -> str:
    prompt = f"""
    Analyze this construction contract document:
    {text}
    
    Provide:
    1. Document type identification
    2. Key parties involved
    3. Critical clauses summary
    4. Risk assessment
    5. Important dates & deadlines
    6. Financial terms
    7. Legal obligations
    8. Recommended actions
    9. Missing clauses (if any)
    10. Overall risk score (1-10)
    """
    return analyze_text(text[:4000], prompt)

def analyze_boq(text: str) -> str:
    prompt = f"""
    Analyze this Bill of Quantities (BOQ):
    {text}
    
    Provide:
    1. Total estimated cost
    2. Major cost items
    3. Cost breakdown by category
    4. Market price comparison
    5. Potential savings opportunities
    6. Risk items
    7. Recommendations
    """
    return analyze_text(text[:4000], prompt)

def generate_dispute_letter(data: dict) -> str:
    prompt = f"""
    Write a formal construction dispute letter:
    
    Project: {data.get('project_name')}
    Dispute Type: {data.get('dispute_type')}
    Our Position: {data.get('our_position')}
    Evidence: {data.get('evidence')}
    Amount in Dispute: {data.get('amount')}
    
    Include:
    - Formal dispute notification
    - Clear statement of facts
    - Legal basis for claim
    - Evidence references
    - Amount claimed
    - Resolution requested
    - Timeline for response
    - Escalation notice
    """
    return analyze_document(str(data), prompt)