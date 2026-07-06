import json
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from app.ai.gemini_client import analyze_image, analyze_text

try:
    from app.services.bim_service import (
        parse_ifc_file, parse_ifc_geometry, detect_clashes, extract_quantities,
        parse_ifc_for_3d, generate_boq, diff_ifc_models,
    )
    HAS_IFC = True
except ImportError:
    HAS_IFC = False
    def parse_ifc_file(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def parse_ifc_geometry(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def detect_clashes(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def extract_quantities(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def parse_ifc_for_3d(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def generate_boq(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}
    def diff_ifc_models(*a, **k): return {"success": False, "error": "ifcopenshell not installed"}

router = APIRouter()


@router.post("/parse-ifc")
async def parse_ifc(file: UploadFile = File(...)):
    try:
        result = parse_ifc_file(await file.read(), file.filename)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clash-detection")
async def clash_detection(
    file: UploadFile = File(...),
    file2: Optional[UploadFile] = File(default=None),
):
    try:
        bytes1 = await file.read()
        bytes2 = await file2.read() if file2 else None
        result = detect_clashes(bytes1, bytes2)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-quantities")
async def extract_qty(file: UploadFile = File(...)):
    try:
        result = extract_quantities(await file.read())
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-drawing")
async def analyze_drawing(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        filename = file.filename or ""
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in ("png", "jpg", "jpeg", "pdf"):
            analysis = analyze_image(file_bytes, """
                You are an expert construction engineer analyzing a CAD drawing or blueprint.
                Analyze this drawing and provide:
                1. Drawing type (floor plan, elevation, section, detail, or other)
                2. Key dimensions visible
                3. Materials specified
                4. Structural elements identified
                5. Construction notes or specifications
                6. Potential issues or code compliance concerns
                7. Overall assessment and recommendations

                Format your response with clear numbered sections.
            """)
        else:
            analysis = "Please upload an image (PNG/JPG) or PDF file for drawing analysis."
        return {"status": "success", "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-ifc-ai")
async def analyze_ifc_ai(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        bim_data = parse_ifc_geometry(file_bytes, file.filename)
        if not bim_data.get("success"):
            raise HTTPException(status_code=400, detail=bim_data.get("error", "Parse failed"))

        ai_analysis = ""
        try:
            prompt = f"""
            Analyze this BIM/IFC model data for a construction project:
            Project: {bim_data['project_name']}
            Total Elements: {bim_data['total_elements']}
            Element Summary: {bim_data['summary']}
            Storeys: {bim_data['storeys']}
            Materials: {bim_data['materials']}

            Provide:
            1. Project overview
            2. Building complexity assessment
            3. Key structural elements analysis
            4. Material recommendations
            5. Construction sequence suggestions
            6. Risk areas identified
            7. Estimated construction duration
            """
            ai_analysis = analyze_text(str(bim_data), prompt)
        except Exception:
            ai_analysis = (
                f"IFC parsed successfully. {bim_data['total_elements']} elements found "
                f"across {len(bim_data['storeys'])} storeys."
            )

        return {"status": "success", "bim_data": bim_data, "ai_analysis": ai_analysis}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse-3d")
async def parse_3d(file: UploadFile = File(...)):
    try:
        result = parse_ifc_for_3d(await file.read(), file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quantities-report")
async def quantities_report(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        parsed = parse_ifc_geometry(file_bytes, file.filename)
        if not parsed.get("success"):
            raise HTTPException(status_code=400, detail=parsed.get("error", "Parse failed"))

        boq = generate_boq(parsed)

        ai_analysis = ""
        try:
            prompt = f"""
            You are a quantity surveyor. Generate professional commentary for this Bill of Quantities:
            Project: {boq['project_name']}
            Storeys: {boq['storeys']}
            Materials: {boq['materials']}
            Items: {json.dumps(boq['items'], indent=2)}

            Provide:
            1. Summary of scope
            2. Notable quantities or areas
            3. Material cost drivers
            4. Procurement recommendations
            5. Any gaps or missing items to verify on site
            """
            ai_analysis = analyze_text(json.dumps(boq), prompt)
        except Exception:
            ai_analysis = f"BOQ generated: {len(boq['items'])} line items across {boq['storeys']} storeys."

        return {"status": "success", "boq": boq, "ai_analysis": ai_analysis}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diff-ifc")
async def diff_ifc(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
):
    try:
        bytes1 = await file1.read()
        bytes2 = await file2.read()
        result = diff_ifc_models(bytes1, file1.filename or "Model A", bytes2, file2.filename or "Model B")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/debug-ifc")
async def debug_ifc(file: UploadFile = File(...)):
    try:
        result = parse_ifc_geometry(await file.read(), file.filename)
        if result.get("geometry"):
            return {
                "storeys": result["storeys"],
                "sample_walls": result["geometry"]["walls"][:3],
                "sample_columns": result["geometry"]["columns"][:3],
                "sample_floors": result["geometry"]["floors"][:2],
                "total": result["summary"],
            }
        return result
    except Exception as e:
        return {"error": str(e)}
