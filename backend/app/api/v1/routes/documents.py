from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from app.ocr.document_processor import process_document
from app.services.storage_service import (
    upload_document,
    save_document_to_db,
    get_documents_from_db,
    list_documents,
)
from app.ai.groq_client import client as groq_client
from typing import Optional

router = APIRouter()

# Keyword maps checked against filename + first 2000 chars of extracted text.
# Order matters — first match wins, so put more specific terms first.
_CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("boq",      ["bill of quantities", "schedule of quantities", "boq", "cost schedule", "rate schedule", "unit rates", "tender quantities"]),
    ("invoice",  ["invoice", "tax invoice", "pro forma", "receipt", "billing statement", "payment certificate", "progress payment"]),
    ("permit",   ["permit", "licence", "license", "approval", "certificate of occupancy", "building approval", "planning approval", "environmental clearance"]),
    ("safety",   ["safety", "incident report", "hazard", "risk assessment", "ppe", "hse", "near miss", "toolbox talk", "method statement", "safety plan"]),
    ("drawing",  ["drawing", "floor plan", "elevation", "section", "site plan", "layout", "architectural", "structural drawing", "dwg", "cad", "as-built"]),
    ("contract", ["contract", "agreement", "subcontract", "memorandum of understanding", "mou", "scope of work", "terms and conditions", "general conditions"]),
]

def _detect_doc_type(filename: str, ext: str, text_snippet: str) -> str:
    """Return a category string using filename keywords then text keywords."""
    if ext in ("png", "jpg", "jpeg"):
        return "blueprint"

    haystack = (filename.lower() + " " + text_snippet.lower())
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(kw in haystack for kw in keywords):
            return category
    return "general"

def _ai_classify(filename: str, text_snippet: str) -> str:
    """Ask the LLM to classify only when keyword detection returned 'general'."""
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a construction document classifier. Reply with exactly one word from this list: contract, safety, drawing, permit, invoice, boq, general"},
                {"role": "user", "content": f"Classify this construction document.\nFilename: {filename}\nContent excerpt:\n{text_snippet[:1500]}"},
            ],
            max_tokens=5,
            temperature=0,
        )
        label = (response.choices[0].message.content or "").strip().lower().split()[0]
        valid = {"contract", "safety", "drawing", "permit", "invoice", "boq", "general", "blueprint"}
        return label if label in valid else "general"
    except Exception:
        return "general"

@router.post("/upload")
async def upload_document_route(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
):
    try:
        print(f"📁 Received file: {file.filename}")
        file_bytes = await file.read()
        print(f"📦 File size: {len(file_bytes)} bytes")
        filename = file.filename or "document"

        ext = filename.split(".")[-1].lower()

        # Process document first so we can use the text for classification
        print("🔄 Processing document...")
        doc = process_document(file_bytes, filename, prompt)
        extracted_text = doc.get("extracted_text", "")
        analysis = doc.get("analysis", "")
        print(f"✅ Extracted {len(extracted_text)} chars")

        # Classify document type using filename + extracted text keywords
        doc_type = _detect_doc_type(filename, ext, extracted_text[:2000])
        if doc_type == "general" and extracted_text.strip():
            # Keyword detection was inconclusive — ask the LLM
            doc_type = _ai_classify(filename, extracted_text)
        bucket = "blueprints" if doc_type == "blueprint" else "documents"
        print(f"📂 Doc type: {doc_type}, bucket: {bucket}")

        # Upload to storage
        print("☁️ Uploading to Supabase Storage...")
        storage_result = upload_document(file_bytes, filename, bucket)
        print(f"Storage result: {storage_result}")

        # Save to DB
        print("💾 Saving to database...")
        db_result = save_document_to_db(
            filename=storage_result.get("filename", filename),
            original_name=filename,
            bucket=bucket,
            extracted_text=extracted_text,
            analysis=analysis,
            project_id=project_id,
            doc_type=doc_type,
        )
        print(f"DB result: {db_result}")

        return {
            "status": "success",
            "filename": filename,
            "extracted_text": extracted_text,
            "analysis": analysis,
            "storage": storage_result,
            "saved_to_db": db_result.get("success", False),
        }
    except Exception as e:
        import traceback
        print(f"❌ ERROR: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
def list_documents_route(project_id: Optional[str] = None):
    try:
        docs = get_documents_from_db(project_id)
        return {"status": "success", "documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage/{bucket}")
def list_storage(bucket: str = "documents"):
    try:
        files = list_documents(bucket)
        return {"status": "success", "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AskPayload(BaseModel):
    question: str
    project_id: Optional[str] = None
    doc_ids: Optional[list[str]] = None


@router.post("/ask")
async def ask_documents(payload: AskPayload):
    """RAG: answer a question using extracted text from uploaded documents."""
    try:
        docs = get_documents_from_db(payload.project_id)
        if not docs:
            return {"answer": "No documents found. Please upload documents first.", "sources": []}

        # Filter by doc_ids if provided
        if payload.doc_ids:
            docs = [d for d in docs if d.get("id") in payload.doc_ids]

        # Build context — concatenate extracted_text up to ~12k chars
        context_parts = []
        sources = []
        total_chars = 0
        for doc in docs:
            text = doc.get("extracted_text", "").strip()
            if not text:
                continue
            chunk = f"--- Document: {doc.get('original_name', 'unknown')} ---\n{text[:2000]}"
            total_chars += len(chunk)
            context_parts.append(chunk)
            sources.append({"id": doc.get("id"), "name": doc.get("original_name"), "type": doc.get("doc_type")})
            if total_chars > 12000:
                break

        if not context_parts:
            return {"answer": "No text content found in documents.", "sources": []}

        context = "\n\n".join(context_parts)
        system_prompt = (
            "You are a construction document analyst. Answer the user's question using ONLY the provided document context. "
            "Be specific, cite document names when relevant, and if the answer isn't in the context say so clearly."
        )
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Documents:\n{context}\n\nQuestion: {payload.question}"},
            ],
            max_tokens=1024,
            temperature=0.3,
        )
        answer = response.choices[0].message.content or "No answer generated."
        return {"answer": answer, "sources": sources[:5]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))