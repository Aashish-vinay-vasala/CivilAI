from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import tempfile, os, json
from app.ai.groq_client import client as groq_client

try:
    import pdfplumber
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

try:
    import fitz  # PyMuPDF
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

router = APIRouter()


def extract_text_from_pdf(path: str) -> str:
    """Extract text from PDF, try PyMuPDF first then pdfplumber."""
    if HAS_FITZ:
        doc = fitz.open(path)
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                pages.append(f"[Page {i+1}]\n{text.strip()}")
        doc.close()
        return "\n\n".join(pages)
    elif HAS_PDF:
        with pdfplumber.open(path) as pdf:
            pages = []
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(f"[Page {i+1}]\n{text.strip()}")
        return "\n\n".join(pages)
    return ""


SUMMARY_PROMPT = """You are a senior construction estimator reading a tender package.

Analyse the following tender document text and return a structured project summary in this exact JSON format:
{{
  "project_name": "...",
  "client": "...",
  "location": "...",
  "project_type": "...",
  "contract_type": "...",
  "estimated_value": "...",
  "key_dates": {{
    "tender_due": "...",
    "construction_start": "...",
    "practical_completion": "..."
  }},
  "scope_summary": "2-3 sentence plain English summary of what is being built",
  "scope_by_trade": {{
    "civil": "...",
    "structural": "...",
    "architectural": "...",
    "mechanical": "...",
    "electrical": "...",
    "controls_bms": "...",
    "hydraulic": "...",
    "fire": "...",
    "other": "..."
  }},
  "site_constraints": ["...", "..."],
  "exclusions": ["...", "..."],
  "owner_supplied": ["...", "..."],
  "documents": ["...", "..."],
  "key_risks": ["...", "..."]
}}

Only include fields where you found actual information. Use "Not specified" for fields with no data.
Do not include markdown — return raw JSON only.

TENDER DOCUMENT:
{text}
"""

REQUIREMENTS_PROMPT = """You are a senior construction estimator.
Extract every item that MUST be included in a construction estimate from this tender document.

Return a JSON array of requirements grouped by trade:
{{
  "civil": [
    {{"item": "...", "detail": "...", "source": "page X / section Y", "critical": true/false}}
  ],
  "structural": [...],
  "architectural": [...],
  "mechanical": [...],
  "electrical": [...],
  "controls_bms": [...],
  "hydraulic": [...],
  "fire": [...],
  "preliminaries": [...],
  "compliance": [...],
  "other": [...]
}}

Be exhaustive — this list is used to check that nothing is missed in the estimate.
Include quantities and specifications where mentioned.
Only include trades where you found actual requirements.
Return raw JSON only.

TENDER DOCUMENT:
{text}
"""


@router.post("/analyse")
async def analyse_tender(file: UploadFile = File(...)):
    """Upload a tender PDF and stream back a structured project summary."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF files only")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        text = extract_text_from_pdf(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from PDF — may be a scanned image")

    # Truncate to 40k chars to stay within context limits
    truncated = text[:40000]

    async def stream():
        try:
            stream = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": SUMMARY_PROMPT.format(text=truncated)}],
                stream=True,
                max_tokens=4096,
                temperature=0.1,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'token': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/requirements")
async def extract_requirements(file: UploadFile = File(...)):
    """Upload a tender PDF and stream back a requirements register."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF files only")

    contents = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        text = extract_text_from_pdf(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from PDF")

    truncated = text[:40000]

    async def stream():
        try:
            stream = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": REQUIREMENTS_PROMPT.format(text=truncated)}],
                stream=True,
                max_tokens=4096,
                temperature=0.1,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'token': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


class GapCheckPayload(BaseModel):
    requirements: dict
    estimate_items: list[str]


@router.post("/gap-check")
async def gap_check(payload: GapCheckPayload):
    """Compare estimate items against requirements register, return gaps."""
    req_text = json.dumps(payload.requirements, indent=2)
    est_text = "\n".join(f"- {i}" for i in payload.estimate_items)

    prompt = f"""You are a senior construction estimator doing a final check before bid submission.

REQUIREMENTS REGISTER (everything that must be priced):
{req_text}

ESTIMATE LINE ITEMS (what has been priced):
{est_text}

Compare them carefully. Return JSON:
{{
  "covered": [{{"item": "...", "trade": "..."}}],
  "missing": [{{"item": "...", "trade": "...", "risk": "high/medium/low", "reason": "why this matters"}}],
  "ambiguous": [{{"item": "...", "trade": "...", "note": "..."}}],
  "risk_score": 0-100,
  "risk_summary": "one sentence overall assessment"
}}

Return raw JSON only."""

    async def stream():
        try:
            stream = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                max_tokens=4096,
                temperature=0.1,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'token': delta})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
