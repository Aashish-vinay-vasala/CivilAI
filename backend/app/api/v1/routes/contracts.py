from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from app.ai.contract_analyzer import (
    analyze_contract,
    generate_rfi,
    analyze_change_order
)
from app.ocr.document_processor import process_document

router = APIRouter()

class RFIRequest(BaseModel):
    issue: str
    project_context: str

class ChangeOrderRequest(BaseModel):
    text: str

@router.post("/analyze")
async def analyze_contract_file(
    file: UploadFile = File(...)
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
        return {
            "status": "success",
            "filename": file.filename,
            "analysis": result["analysis"],
            "risk_data": result["risk_data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rfi")
async def create_rfi(request: RFIRequest):
    try:
        rfi = generate_rfi(
            request.issue,
            request.project_context
        )
        return {
            "status": "success",
            "rfi": rfi
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/change-order")
async def analyze_change_order_route(
    request: ChangeOrderRequest
):
    try:
        analysis = analyze_change_order(request.text)
        return {
            "status": "success",
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))