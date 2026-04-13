from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from app.ocr.document_processor import process_document

router = APIRouter()

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    prompt: str = Form(default=None)
):
    try:
        file_bytes = await file.read()
        result = process_document(
            file_bytes,
            file.filename,
            prompt
        )
        return {
            "status": "success",
            "filename": result["filename"],
            "extracted_text": result["extracted_text"][:500],
            "analysis": result["analysis"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    prompt: str = Form(...)
):
    try:
        file_bytes = await file.read()
        result = process_document(
            file_bytes,
            file.filename,
            prompt
        )
        return {
            "status": "success",
            "analysis": result["analysis"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))