from app.ai.groq_client import analyze_document
from app.ai.gemini_client import analyze_text

REPORT_PROMPT = """
You are an expert construction report writer.
Generate professional reports that are:
- Clear and concise
- Data-driven
- Actionable
- Executive-friendly

Always include:
- Executive summary
- Key metrics
- Risk highlights
- Recommendations
- Next steps
"""

def generate_weekly_report(project_data: dict) -> str:
    prompt = f"""
    Generate a professional weekly construction report:
    {project_data}
    
    Include:
    - Executive summary
    - Progress this week
    - Schedule status
    - Budget status
    - Safety summary
    - Issues & risks
    - Next week plan
    - Key decisions needed
    """
    return analyze_document(str(project_data), prompt)

def generate_stakeholder_report(project_data: dict) -> str:
    prompt = f"""
    Generate a client-friendly stakeholder report:
    {project_data}
    
    Include:
    - Project overview
    - Milestone status
    - Budget summary
    - Key achievements
    - Upcoming milestones
    - Issues requiring attention
    - Photos summary
    Write in plain English for non-technical audience.
    """
    return analyze_document(str(project_data), prompt)

def generate_risk_report(risk_data: dict) -> str:
    prompt = f"""
    Generate a comprehensive risk report:
    {risk_data}
    
    Include:
    - Risk register summary
    - Top 10 risks ranked
    - Mitigation status
    - New risks identified
    - Risk trends
    - Recommended actions
    """
    return analyze_document(str(risk_data), prompt)

def generate_meeting_summary(transcript: str) -> str:
    prompt = f"""
    Summarize this construction meeting:
    {transcript}
    
    Include:
    - Meeting summary
    - Key decisions made
    - Action items with owners
    - Deadlines
    - Follow up required
    - Next meeting agenda
    """
    return analyze_document(transcript, prompt)

def generate_kpi_summary(kpi_data: dict) -> str:
    prompt = f"""
    Generate KPI summary report:
    {kpi_data}
    
    Include:
    - KPI dashboard summary
    - Performance vs targets
    - Trend analysis
    - Underperforming areas
    - Recommendations
    """
    return analyze_document(str(kpi_data), prompt)