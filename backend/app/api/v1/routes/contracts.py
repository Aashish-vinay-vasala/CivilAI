from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel
from app.core.guardrails import guard_text
from app.core.security import protect_route
from app.core.hitl import check_contract, check_change_order
from app.ai.contract_analyzer import (
    analyze_contract,
    generate_rfi,
    analyze_change_order
)
from app.ocr.document_processor import process_document

router = APIRouter()
_contract_roles = ("project_director", "admin", "engineer")

class RFIRequest(BaseModel):
    issue: str
    project_context: str

class ChangeOrderRequest(BaseModel):
    text: str

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