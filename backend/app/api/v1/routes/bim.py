from fastapi import APIRouter, HTTPException, UploadFile, File
from app.services.bim_service import parse_ifc_geometry, detect_clashes, extract_quantities, parse_ifc_for_3d
from app.ai.gemini_client import analyze_image, analyze_text

router = APIRouter()

@router.post("/parse-ifc")
async def parse_ifc(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        result = parse_ifc_geometry(file_bytes, file.filename)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/clash-detection")
async def clash_detection(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        result = detect_clashes(file_bytes)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract-quantities")
async def extract_qty(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        result = extract_quantities(file_bytes)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-drawing")
async def analyze_drawing(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        filename = file.filename or ""
        ext = filename.split(".")[-1].lower()
        if ext in ["png", "jpg", "jpeg"]:
            analysis = analyze_image(file_bytes, """
                You are an expert construction engineer analyzing a CAD drawing or blueprint.
                Analyze this drawing and provide:
                1. Drawing type (floor plan, elevation, section, detail)
                2. Key dimensions visible
                3. Materials specified
                4. Structural elements identified
                5. Construction notes
                6. Potential issues or concerns
                7. Overall assessment
            """)
        else:
            analysis = "Please upload an image file (PNG/JPG) for drawing analysis."
        return {"status": "success", "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze-ifc-ai")
async def analyze_ifc_ai(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        bim_data = parse_ifc_geometry(file_bytes, file.filename)

        if not bim_data["success"]:
            raise HTTPException(status_code=400, detail=bim_data["error"])

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
            ai_analysis = f"IFC parsed successfully. {bim_data['total_elements']} elements found across {len(bim_data['storeys'])} storeys."

        return {
            "status": "success",
            "bim_data": bim_data,
            "ai_analysis": ai_analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse-3d")
async def parse_3d(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        result = parse_ifc_for_3d(file_bytes, file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debug-ifc")
async def debug_ifc(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        result = parse_ifc_geometry(file_bytes, file.filename)
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