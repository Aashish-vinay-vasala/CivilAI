from app.config import settings
import PIL.Image
import io

_client = None

def get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client

def analyze_image(image_data: bytes, prompt: str) -> str:
    try:
        client = get_client()
        image = PIL.Image.open(io.BytesIO(image_data))
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[prompt, image]
        )
        return response.text
    except Exception as e:
        return f"Image analysis unavailable: {str(e)}"

def analyze_text(text: str, prompt: str) -> str:
    try:
        from app.ai.groq_client import analyze_document
        return analyze_document(text, prompt)
    except Exception as e:
        return f"Analysis unavailable: {str(e)}"