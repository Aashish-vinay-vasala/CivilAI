import logging

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import Response
from pydantic import BaseModel
from app.ocr.document_processor import process_document
from app.core.guardrails import guard_text
from app.services.storage_service import (
    upload_document,
    save_document_to_db,
    get_documents_from_db,
    list_documents,
    get_document,
    delete_document,
    get_content_type,
)
from app.ai.groq_client import client as groq_client
from app.ai.llama_rag import rag_answer
from typing import Optional

logger = logging.getLogger("civilai.documents")
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
        if prompt:
            try:
                prompt, _ = guard_text(prompt)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

        file_bytes = await file.read()
        filename   = file.filename or "document"
        ext        = filename.split(".")[-1].lower()

        logger.info("upload | file=%s | size=%d bytes", filename, len(file_bytes))

        doc            = process_document(file_bytes, filename, prompt)
        extracted_text = doc.get("extracted_text", "")
        analysis       = doc.get("analysis", "")

        logger.info("upload | extracted=%d chars", len(extracted_text))

        doc_type = _detect_doc_type(filename, ext, extracted_text[:2000])
        if doc_type == "general" and extracted_text.strip():
            doc_type = _ai_classify(filename, extracted_text)
        bucket = "blueprints" if doc_type == "blueprint" else "documents"

        logger.info("upload | doc_type=%s | bucket=%s", doc_type, bucket)

        storage_result = upload_document(file_bytes, filename, bucket)

        db_result = save_document_to_db(
            filename=storage_result.get("filename", filename),
            original_name=filename,
            bucket=bucket,
            extracted_text=extracted_text,
            analysis=analysis,
            project_id=project_id,
            doc_type=doc_type,
        )

        return {
            "status":       "success",
            "filename":     filename,
            "extracted_text": extracted_text,
            "analysis":     analysis,
            "storage":      storage_result,
            "saved_to_db":  db_result.get("success", False),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("upload failed for %s: %s", file.filename, e)
        raise HTTPException(status_code=500, detail="Document upload failed")

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


@router.get("/storage/{bucket}/{filename}/download")
def download_storage_file(bucket: str, filename: str):
    """Backend-proxied download — streams the raw file bytes through the API."""
    file_bytes = get_document(filename, bucket)
    if file_bytes is None:
        raise HTTPException(status_code=404, detail="File not found")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return Response(
        content=file_bytes,
        media_type=get_content_type(ext),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/storage/{bucket}/{filename}")
def delete_storage_file(bucket: str, filename: str):
    ok = delete_document(filename, bucket)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to delete file")
    return {"status": "success", "deleted": filename}


class AskPayload(BaseModel):
    question: str
    project_id: Optional[str] = None
    doc_ids: Optional[list[str]] = None


@router.post("/ask")
async def ask_documents(payload: AskPayload):
    """RAG: answer a question using LlamaIndex over extracted document text."""
    try:
        try:
            question, _ = guard_text(payload.question, use_llamaguard=True)
        except ValueError as e:
            return {"answer": str(e), "sources": []}

        docs = get_documents_from_db(payload.project_id)
        if not docs:
            return {"answer": "No documents found. Please upload documents first.", "sources": []}

        if payload.doc_ids:
            docs = [d for d in docs if d.get("id") in payload.doc_ids]

        texts   = []
        sources = []
        for doc in docs:
            text = doc.get("extracted_text", "").strip()
            if not text:
                continue
            # Prefix each chunk with the document name so LlamaIndex can cite it
            texts.append(f"Document: {doc.get('original_name', 'unknown')}\n{text}")
            sources.append({"id": doc.get("id"), "name": doc.get("original_name"), "type": doc.get("doc_type")})

        if not texts:
            return {"answer": "No text content found in documents.", "sources": []}

        # ── LlamaIndex RAG (Groq LLM + HuggingFace embeddings) ──────────────────
        result = await rag_answer(texts, question)

        if "not available" not in result["answer"].lower():
            return {"answer": result["answer"], "sources": sources[:5], "engine": result["engine"]}

        # ── Fallback: direct Groq if LlamaIndex is unavailable ──────────────────
        context = "\n\n".join(
            f"--- {sources[i]['name']} ---\n{t[:2000]}"
            for i, t in enumerate(texts)
        )[:12000]
        system_prompt = (
            "You are a construction document analyst. Answer the user's question using ONLY the provided "
            "document context. Be specific, cite document names when relevant, and say so clearly if the "
            "answer isn't in the context."
        )
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": f"Documents:\n{context}\n\nQuestion: {question}"},
            ],
            max_tokens=1024,
            temperature=0.3,
        )
        answer = resp.choices[0].message.content or "No answer generated."
        return {"answer": answer, "sources": sources[:5], "engine": "groq-direct"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))