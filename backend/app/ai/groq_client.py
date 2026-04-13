from groq import Groq
from app.config import settings

client = Groq(api_key=settings.GROQ_API_KEY)

def chat(messages: list, model: str = "llama-3.3-70b-versatile"):
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=2048,
    )
    return response.choices[0].message.content

def analyze_document(text: str, prompt: str):
    messages = [
        {"role": "system", "content": "You are CivilAI, an expert AI assistant for construction management."},
        {"role": "user", "content": f"{prompt}\n\nDocument:\n{text}"}
    ]
    return chat(messages)