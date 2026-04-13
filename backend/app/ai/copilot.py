from app.ai.groq_client import chat as groq_chat
from app.ai.gemini_client import analyze_text

SYSTEM_PROMPT = """
You are CivilAI Copilot, an expert AI assistant for construction management.
You help with:
- Project scheduling and delay analysis
- Cost management and budget tracking
- Safety risk assessment
- Contract analysis and legal risks
- Workforce management
- Procurement and supplier management
- Compliance and permits
- Equipment maintenance

Always provide concise, actionable insights.
Be professional and data-driven.
"""

def get_copilot_response(
    user_message: str,
    chat_history: list = []
):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    
    for item in chat_history:
        messages.append({
            "role": item["role"],
            "content": item["content"]
        })
    
    messages.append({
        "role": "user",
        "content": user_message
    })
    
    return groq_chat(messages)

def analyze_project_data(data: dict, question: str):
    context = f"""
    Project Data:
    {data}
    
    Question: {question}
    """
    return analyze_text(context, SYSTEM_PROMPT)