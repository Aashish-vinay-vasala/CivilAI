from app.config import settings
from app.services import usage_tracker
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
        usage_tracker.add_image_call()
        client = get_client()
        # PDF detected by magic bytes — pass as native PDF part (no PIL conversion)
        if image_data[:4] == b'%PDF':
            from google.genai import types as genai_types
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt, genai_types.Part.from_bytes(data=image_data, mime_type="application/pdf")]
            )
        else:
            image = PIL.Image.open(io.BytesIO(image_data))
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt, image]
            )
        return response.text
    except Exception as e:
        return f"Image analysis unavailable: {str(e)}"

def text_completion(prompt: str, system: str | None = None) -> str:
    """Plain-text Gemini completion. Used by groq_client as the final fallback
    when every Groq API key is rate-limited/exhausted, so callers still get a
    real answer instead of an error string."""
    client = get_client()
    contents = f"{system}\n\n{prompt}" if system else prompt
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
    )
    if response.usage_metadata:
        usage_tracker.add_llm_tokens(response.usage_metadata.total_token_count or 0)
    return response.text


def analyze_text(text: str, prompt: str) -> str:
    try:
        from app.ai.groq_client import analyze_document
        return analyze_document(text, prompt)
    except Exception as e:
        return f"Analysis unavailable: {str(e)}"