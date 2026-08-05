"""
Core Google Gemini client shared across app/ai/ — the counterpart to
groq_client.py. Provides image/PDF understanding (analyze_image,
analyze_image_structured) used for blueprint/document vision calls, plus
plain and Pydantic-structured text completion (text_completion,
structured_completion) that groq_client.py calls into as its last-resort
fallback once every Groq key is rate-limited/exhausted. Also tracks token/
image usage via app.services.usage_tracker for each call.
"""
import time
from app.config import settings
from app.services import usage_tracker
import PIL.Image
import io


def _track_usage(response, source: str, t0: float) -> None:
    usage = response.usage_metadata
    if usage and usage.total_token_count:
        usage_tracker.add_llm_tokens(
            usage.total_token_count, provider="gemini", model="gemini-2.0-flash", source=source,
            input_tokens=usage.prompt_token_count, output_tokens=usage.candidates_token_count,
            latency_ms=(time.time() - t0) * 1000,
        )

_client = None

def get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client

def analyze_image(image_data: bytes, prompt: str) -> str:
    """Raises on failure (rate limit, billing hold, etc.) rather than
    swallowing the error into a string — callers are expected to catch this
    and fall back to app.ai.groq_vision.analyze_image_text, same pattern as
    analyze_image_structured / bim.py's /analyze-blueprint."""
    t0 = time.time()
    usage_tracker.add_image_call(provider="gemini", model="gemini-2.0-flash", source="gemini_client.analyze_image")
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
    _track_usage(response, "gemini_client.analyze_image", t0)
    return response.text

def text_completion(prompt: str, system: str | None = None) -> str:
    """Plain-text Gemini completion. Used by groq_client as the final fallback
    when every Groq API key is rate-limited/exhausted, so callers still get a
    real answer instead of an error string."""
    t0 = time.time()
    client = get_client()
    contents = f"{system}\n\n{prompt}" if system else prompt
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
    )
    _track_usage(response, "gemini_client.text_completion", t0)
    return response.text


def analyze_image_structured(image_data: bytes, prompt: str, response_model):
    """Structured counterpart to analyze_image() — same image/PDF-understanding
    call, but constrained to a Pydantic schema so the caller gets typed fields
    (e.g. rooms, dimensions, detected elements) instead of having to parse prose."""
    from google.genai import types as genai_types
    t0 = time.time()
    usage_tracker.add_image_call(provider="gemini", model="gemini-2.0-flash", source="gemini_client.analyze_image_structured")
    client = get_client()
    if image_data[:4] == b'%PDF':
        content_part = genai_types.Part.from_bytes(data=image_data, mime_type="application/pdf")
    else:
        content_part = PIL.Image.open(io.BytesIO(image_data))
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[prompt, content_part],
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_model,
        ),
    )
    _track_usage(response, "gemini_client.analyze_image_structured", t0)
    if response.parsed is not None:
        return response.parsed
    return response_model.model_validate_json(response.text)


def structured_completion(prompt: str, response_model):
    """Gemini completion constrained to a Pydantic schema. Used by groq_client's
    instructor_chat() as the final fallback when every Groq key is rate-limited/
    exhausted, so structured-extraction callers get a real result instead of an
    empty/degraded one."""
    from google.genai import types as genai_types
    t0 = time.time()
    client = get_client()
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_model,
        ),
    )
    _track_usage(response, "gemini_client.structured_completion", t0)
    if response.parsed is not None:
        return response.parsed
    return response_model.model_validate_json(response.text)


def analyze_text(text: str, prompt: str) -> str:
    try:
        from app.ai.groq_client import analyze_document
        return analyze_document(text, prompt)
    except Exception as e:
        return f"Analysis unavailable: {str(e)}"