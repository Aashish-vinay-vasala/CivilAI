from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.writing_assistant import (
    generate_letter,
    generate_email,
    generate_notice,
    generate_variation_order,
    analyze_blueprint,
    analyze_contract_document,
    analyze_boq,
    generate_dispute_letter,
)
from app.ocr.document_processor import process_document

router = APIRouter()

class LetterRequest(BaseModel):
    letter_type: str
    from_name: str
    from_company: str
    to_name: str
    to_company: str
    project_name: str
    subject: str
    key_points: str
    tone: str = "Professional"

class EmailRequest(BaseModel):
    email_type: str
    from_name: str
    to_name: str
    project_name: str
    subject: str
    key_points: str
    tone: str = "Professional"

class NoticeRequest(BaseModel):
    notice_type: str
    project_name: str
    issued_by: str
    issued_to: str
    details: str

class VariationOrderRequest(BaseModel):
    project_name: str
    vo_number: str
    requested_by: str
    description: str
    cost_impact: str
    time_impact: str

class DisputeRequest(BaseModel):
    project_name: str
    dispute_type: str
    our_position: str
    evidence: str
    amount: str

class BlueprintQuery(BaseModel):
    query: str = "Analyze this drawing"

@router.post("/letter")
async def create_letter(request: LetterRequest):
    try:
        result = generate_letter(request.model_dump())
        return {"status": "success", "letter": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/email")
async def create_email(request: EmailRequest):
    try:
        result = generate_email(request.model_dump())
        return {"status": "success", "email": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/notice")
async def create_notice(request: NoticeRequest):
    try:
        result = generate_notice(request.model_dump())
        return {"status": "success", "notice": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/variation-order")
async def create_variation_order(request: VariationOrderRequest):
    try:
        result = generate_variation_order(request.model_dump())
        return {"status": "success", "variation_order": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-blueprint")
async def analyze_blueprint_route(
    file: UploadFile = File(...),
    query: str = "Analyze this drawing"
):
    try:
        file_bytes = await file.read()
        result = analyze_blueprint(file_bytes, query)
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-contract")
async def analyze_contract_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text")
        result = analyze_contract_document(text)
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-boq")
async def analyze_boq_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text")
        result = analyze_boq(text)
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dispute-letter")
async def create_dispute_letter(request: DisputeRequest):
    try:
        result = generate_dispute_letter(request.model_dump())
        return {"status": "success", "letter": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    