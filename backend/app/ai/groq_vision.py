"""
Groq vision fallback for image-understanding calls that normally go through
Gemini. Unlike the older llama-3.2 vision models (decommissioned) or the
llama-4 scout/maverick models (not available on this account), qwen/qwen3.6-27b
is a real, currently-working multimodal model on this Groq account — confirmed
by direct testing, not documentation. It's a reasoning model (emits a <think>
block before its answer), so calls need a generous max_tokens budget.

This is the standard fallback whenever Gemini is used as primary anywhere in
the codebase: Gemini fails → retry across the whole Groq key pool here
(GROQ_API_KEY → GROQ_API_KEY_2 → GROQ_API_KEY_3) → only then does the caller
fall further (e.g. bim.py's /analyze-blueprint drops to local OCR after this
tier is also exhausted).
"""
import base64
import logging
import re
import time

import instructor
from groq import Groq

from app.ai import groq_client
from app.services import usage_tracker

logger = logging.getLogger("civilai.groq_vision")

_MODEL = "qwen/qwen3.6-27b"
_MAX_TOKENS = 4096  # generous — this model "thinks" at length before answering
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _image_content_blocks(file_bytes: bytes, is_pdf: bool) -> list[dict]:
    if is_pdf:
        import fitz  # PyMuPDF — already a project dependency
        blocks = []
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            for page in doc:
                pix = page.get_pixmap(dpi=150)
                b64 = base64.b64encode(pix.tobytes("png")).decode()
                blocks.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
        finally:
            doc.close()
        return blocks

    b64 = base64.b64encode(file_bytes).decode()
    return [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}]


def _is_retryable(exc: Exception) -> bool:
    err = str(exc)
    return "429" in err or "rate_limit" in err.lower() or "401" in err or "invalid_api_key" in err.lower()


def analyze_image_structured(file_bytes: bytes, prompt: str, response_model, is_pdf: bool = False):
    """Vision + structured extraction in one call, via Groq's qwen3.6-27b.
    Retries across the whole Groq key pool before raising — same contract as
    gemini_client.analyze_image_structured (raises on total failure), so
    callers can try one then fall back to the other."""
    content = [{"type": "text", "text": prompt}, *_image_content_blocks(file_bytes, is_pdf)]
    max_attempts = groq_client.get_key_pool_size()
    for attempt in range(max_attempts):
        t0 = time.time()
        try:
            client = instructor.from_groq(Groq(api_key=groq_client.get_active_key()), mode=instructor.Mode.JSON)
            result, completion = client.chat.completions.create_with_completion(
                model=_MODEL,
                response_model=response_model,
                max_tokens=_MAX_TOKENS,
                messages=[{"role": "user", "content": content}],
            )
            if completion.usage:
                usage_tracker.add_llm_tokens(
                    completion.usage.total_tokens, provider="groq", model=_MODEL, source="groq_vision.analyze_image_structured",
                    input_tokens=completion.usage.prompt_tokens, output_tokens=completion.usage.completion_tokens,
                    latency_ms=(time.time() - t0) * 1000,
                )
            return result
        except Exception as exc:
            if attempt < max_attempts - 1 and _is_retryable(exc) and groq_client.rotate_key():
                logger.warning("Groq vision (structured) failed on key #%d, rotating: %s", attempt + 1, exc)
                continue
            raise


def analyze_image_text(file_bytes: bytes, prompt: str, is_pdf: bool = False) -> str:
    """Plain-text vision counterpart to analyze_image_structured — same
    model/retry behavior, for callers that just want raw text back (e.g.
    OCR-style extraction) instead of a structured schema. Mirrors
    gemini_client.analyze_image's signature so it's a drop-in fallback."""
    content = [{"type": "text", "text": prompt}, *_image_content_blocks(file_bytes, is_pdf)]
    max_attempts = groq_client.get_key_pool_size()
    for attempt in range(max_attempts):
        t0 = time.time()
        try:
            client = Groq(api_key=groq_client.get_active_key())
            response = client.chat.completions.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                messages=[{"role": "user", "content": content}],
            )
            text = _THINK_RE.sub("", response.choices[0].message.content or "").strip()
            if response.usage:
                usage_tracker.add_llm_tokens(
                    response.usage.total_tokens, provider="groq", model=_MODEL, source="groq_vision.analyze_image_text",
                    input_tokens=response.usage.prompt_tokens, output_tokens=response.usage.completion_tokens,
                    latency_ms=(time.time() - t0) * 1000,
                )
            return text
        except Exception as exc:
            if attempt < max_attempts - 1 and _is_retryable(exc) and groq_client.rotate_key():
                logger.warning("Groq vision (text) failed on key #%d, rotating: %s", attempt + 1, exc)
                continue
            raise
