from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from app.core.guardrails import guard_text
from app.core.security import protect_route
from app.core.hitl import check_contract, check_change_order
from app.ai.contract_analyzer import (
    analyze_contract,
    generate_rfi,
    analyze_change_order
)
from app.ocr.document_processor import process_document
from app.services.db_service import supabase
from app.services.storage_service import upload_document

router = APIRouter()
_contract_roles = ("project_director", "admin", "engineer")

class RFIRequest(BaseModel):
    issue: str
    project_context: str

class ChangeOrderRequest(BaseModel):
    text: str


class ContractCreate(BaseModel):
    title: str
    contract_type: str = ""
    contractor: str = ""
    value: float = 0
    status: str = "Draft"
    risk_level: str = "medium"
    risk_score: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    payment_terms: Optional[str] = None
    retention_percent: Optional[float] = None
    notes: Optional[str] = None
    project_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    bucket: Optional[str] = None


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    contract_type: Optional[str] = None
    contractor: Optional[str] = None
    value: Optional[float] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    payment_terms: Optional[str] = None
    retention_percent: Optional[float] = None
    notes: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    bucket: Optional[str] = None

@router.post("/analyze")
async def analyze_contract_file(
    file: UploadFile = File(...),
    _user=Depends(protect_route(*_contract_roles)),
):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from document"
            )
        result = analyze_contract(text)

        needs_review, review_id, review_reason = check_contract(
            risk_data_text=str(result.get("risk_data", "")),
            ai_output=str(result.get("analysis", "")),
            filename=file.filename or "upload",
        )
        return {
            "status":         "success",
            "filename":       file.filename,
            "analysis":       result["analysis"],
            "risk_data":      result["risk_data"],
            "requires_review": needs_review,
            "review_id":      review_id,
            "review_message": review_reason if needs_review else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rfi")
async def create_rfi(request: RFIRequest, _user=Depends(protect_route(*_contract_roles))):
    try:
        request.issue, _ = guard_text(request.issue, use_llamaguard=True)
        request.project_context, _ = guard_text(request.project_context)
        rfi = generate_rfi(request.issue, request.project_context)
        return {"status": "success", "rfi": rfi}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Contract register CRUD ──────────────────────────────────────────────────

@router.get("/")
async def list_contracts(project_id: Optional[str] = Query(default=None)):
    try:
        query = supabase.table("contracts").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        response = query.order("created_at", desc=True).execute()
        return {"contracts": response.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_contract(contract: ContractCreate):
    try:
        data = contract.model_dump(exclude_none=True)
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        response = supabase.table("contracts").insert(data).execute()
        return {"contract": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{contract_id}")
async def update_contract(contract_id: str, contract: ContractUpdate):
    try:
        data = {k: v for k, v in contract.model_dump().items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = supabase.table("contracts").update(data).eq("id", contract_id).execute()
        return {"contract": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{contract_id}")
async def delete_contract(contract_id: str):
    try:
        supabase.table("contracts").delete().eq("id", contract_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_contract_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    try:
        file_bytes = await file.read()
        result = upload_document(file_bytes, file.filename, bucket="contracts")
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Upload failed"))
        return {
            "status":    "success",
            "file_name": result["filename"],
            "file_url":  result["url"],
            "bucket":    result["bucket"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/change-order")
async def analyze_change_order_route(request: ChangeOrderRequest, _user=Depends(protect_route(*_contract_roles))):
    try:
        request.text, _ = guard_text(request.text)
        analysis = analyze_change_order(request.text)

        needs_review, review_id, review_reason = check_change_order(
            text_summary=request.text[:300],
            ai_output=str(analysis),
        )
        return {
            "status":          "success",
            "analysis":        analysis,
            "requires_review": needs_review,
            "review_id":       review_id,
            "review_message":  review_reason if needs_review else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))