import logging
from supabase import create_client
from app.config import settings
from app.services.db_service import create_document
import uuid
import os

logger = logging.getLogger(__name__)

TEXT_TRUNCATION_LIMIT = 5000

supabase = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY
)

def upload_document(file_bytes: bytes, filename: str, bucket: str = "documents") -> dict:
    try:
        file_ext = filename.split(".")[-1].lower()
        unique_name = f"{uuid.uuid4()}.{file_ext}"
        content_type = get_content_type(file_ext)

        response = supabase.storage.from_(bucket).upload(
            path=unique_name,
            file=file_bytes,
            file_options={"content-type": content_type}
        )

        url = supabase.storage.from_(bucket).get_public_url(unique_name)
        if not url:
            raise ValueError(f"get_public_url returned empty for {unique_name}")

        return {
            "success": True,
            "filename": unique_name,
            "original_name": filename,
            "bucket": bucket,
            "url": url,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_document(filename: str, bucket: str = "documents") -> bytes:
    try:
        response = supabase.storage.from_(bucket).download(filename)
        return response
    except Exception as e:
        logger.exception("get_document failed for %s/%s: %s", bucket, filename, e)
        return None

def list_documents(bucket: str = "documents") -> list:
    try:
        response = supabase.storage.from_(bucket).list()
        return response
    except Exception as e:
        logger.exception("list_documents failed for bucket %s: %s", bucket, e)
        return []

def delete_document(filename: str, bucket: str = "documents") -> bool:
    try:
        supabase.storage.from_(bucket).remove([filename])
        return True
    except Exception as e:
        logger.exception("delete_document failed for %s/%s: %s", bucket, filename, e)
        return False

def get_content_type(ext: str) -> str:
    types = {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls": "application/vnd.ms-excel",
        "csv": "text/csv",
        "txt": "text/plain",
        "dwg": "application/acad",
        "dxf": "application/dxf",
        "ifc": "application/octet-stream",
    }
    return types.get(ext, "application/pdf")

def save_document_to_db(
    filename: str,
    original_name: str,
    bucket: str,
    extracted_text: str,
    analysis: str,
    project_id: str = None,
    doc_type: str = "general"
) -> dict:
    try:
        if extracted_text and len(extracted_text) > TEXT_TRUNCATION_LIMIT:
            logger.warning(
                "save_document_to_db: extracted_text truncated from %d to %d chars for %s",
                len(extracted_text), TEXT_TRUNCATION_LIMIT, original_name,
            )
        if analysis and len(analysis) > TEXT_TRUNCATION_LIMIT:
            logger.warning(
                "save_document_to_db: analysis truncated from %d to %d chars for %s",
                len(analysis), TEXT_TRUNCATION_LIMIT, original_name,
            )
        data = {
            "filename": filename,
            "original_name": original_name,
            "bucket": bucket,
            "doc_type": doc_type,
            "extracted_text": (extracted_text or "")[:TEXT_TRUNCATION_LIMIT],
            "analysis": (analysis or "")[:TEXT_TRUNCATION_LIMIT],
            "status": "processed",
        }
        if project_id:
            data["project_id"] = project_id

        inserted = create_document(data)
        return {"success": True, "data": inserted}
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_documents_from_db(project_id: str = None) -> list:
    try:
        query = supabase.table("documents").select("*").order("created_at", desc=True)
        if project_id:
            query = query.eq("project_id", project_id)
        response = query.execute()
        return response.data
    except Exception as e:
        return []