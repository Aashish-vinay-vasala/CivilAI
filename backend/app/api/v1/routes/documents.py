from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from app.ocr.document_processor import process_document
from app.services.storage_service import (
    upload_document,
    save_document_to_db,
    get_documents_from_db,
    list_documents,
)
from typing import Optional

router = APIRouter()

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
        doc_type = "blueprint" if ext in ["png", "jpg", "jpeg"] else "contract" if "contract" in filename.lower() else "general"
        bucket = "blueprints" if doc_type == "blueprint" else "documents"
        print(f"📂 Doc type: {doc_type}, bucket: {bucket}")

        # Process document
        print("🔄 Processing document...")
        doc = process_document(file_bytes, filename, prompt)
        extracted_text = doc.get("extracted_text", "")
        analysis = doc.get("analysis", "")
        print(f"✅ Extracted {len(extracted_text)} chars")

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