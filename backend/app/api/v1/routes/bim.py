"""
BIM & CAD routes (/api/v1/bim): IFC/3D model parsing and AI analysis, plus
per-project model and sensor storage. Endpoints: POST /parse-ifc,
/clash-detection, /extract-quantities, /analyze-blueprint (with local OCR
fallback), /analyze-ifc-ai, /parse-3d, /quantities-report, /structural-check,
/diff-ifc, /debug-ifc; GET/POST/DELETE /project/{id}/model(s) and
/model/{id}/download, /fallback-models/*; GET/POST/DELETE
/project/{id}/sensors.
"""
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel
from app.ai.gemini_client import analyze_text, analyze_image_structured
from app.ai.groq_client import instructor_chat
from app.ai import groq_vision
from app.ai import ocr_fallback
from app.services.storage_service import upload_document, get_document, delete_document
from app.services.db_service import (
    get_current_bim_model, deactivate_bim_models, create_bim_model,
    get_bim_model_history, get_all_current_bim_models, get_bim_model_by_id,
    delete_bim_model, delete_bim_models_for_project, promote_latest_bim_model,
    get_current_sensor_reading, deactivate_sensor_readings, create_sensor_reading,
)
from app.services import fallback_models_service as fallback_svc

logger = logging.getLogger("civilai.bim")

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

try:
    from app.services.structural_service import run_structural_screening
    HAS_PYNITE = True
except ImportError:
    HAS_PYNITE = False
    def run_structural_screening(*a, **k): return {"success": False, "error": "PyNiteFEA not installed"}

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


class BlueprintRoom(BaseModel):
    name: str
    dimensions: Optional[str] = None
    area_sqft: Optional[float] = None
    notes: Optional[str] = None


class BlueprintElement(BaseModel):
    type: str  # e.g. door, window, staircase, column, beam
    count: Optional[int] = None
    details: Optional[str] = None


class BlueprintAnalysis(BaseModel):
    drawing_type: str  # e.g. "residential floor plan", "elevation", "site plan"
    scale: Optional[str] = None
    overall_dimensions: Optional[str] = None
    total_area_sqft: Optional[float] = None
    rooms: List[BlueprintRoom] = []
    elements: List[BlueprintElement] = []
    materials: List[str] = []
    structural_notes: Optional[str] = None
    compliance_notes: List[str] = []
    summary: str


_BLUEPRINT_PROMPT = """
You are an expert architect and construction engineer analyzing an uploaded blueprint
or floor plan image. This could be a full construction/CAD drawing, or a simpler plan
of a house, apartment, or single room. Study it carefully and extract:

1. The drawing type (e.g. residential floor plan, elevation, section, site plan, detail).
2. The scale, if marked.
3. Overall building/unit dimensions and total area, if determinable from labels or a scale.
4. Every distinct room or space visible, with its name/label, dimensions if marked, and
   approximate area in square feet if it can be computed or reasonably estimated.
5. Notable elements: doors, windows, staircases, columns, beams, fixtures — with counts
   where visible.
6. Materials called out on the drawing, if any.
7. Structural notes worth flagging (load-bearing walls, spans, etc.), if visible.
8. Any code-compliance or design concerns you notice (e.g. missing egress, undersized
   room, unclear dimensions).
9. A short overall summary of the drawing.

If a field cannot be determined from the image, omit it or leave it null rather than
guessing. Do not fabricate dimensions that aren't shown or clearly inferable.
"""

# Fallback path when Gemini vision is unavailable — there's no vision-capable
# Groq model on this account, so instead this structures whatever text a local
# Tesseract OCR pass could read off the drawing (see app/ai/ocr_fallback.py).
# Necessarily weaker than the real vision prompt above: it only ever sees
# printed labels, never the drawing's actual layout.
_BLUEPRINT_OCR_PROMPT = """
You are an expert architect analyzing OCR text extracted from a blueprint or floor
plan image (a house, apartment, room, or full CAD drawing). The text below is exactly
what a local OCR pass could read off the drawing — it has errors, missing words, and
no layout information, so treat it as a rough transcript, not a clean document.

From it, extract whatever you can reasonably infer:
1. The drawing type, if apparent.
2. The scale, if mentioned.
3. Overall dimensions/area, if legible.
4. Rooms/spaces named in the text, with dimensions if given.
5. Elements (doors, windows, etc.) if explicitly labeled with counts.
6. Materials mentioned.
7. Structural or compliance notes only if explicitly stated in the text.
8. A short summary that's honest about how limited OCR-only text is compared to
   seeing the actual drawing — mention this was extracted via OCR fallback, not
   direct image analysis.

Leave a field null/empty rather than guessing at anything the text doesn't support.
"""


def _analyze_blueprint_via_ocr_fallback(file_bytes: bytes, is_pdf: bool) -> BlueprintAnalysis:
    ocr_text = ocr_fallback.extract_text(file_bytes, is_pdf=is_pdf).strip()
    if not ocr_text:
        raise HTTPException(
            status_code=502,
            detail="Blueprint analysis is temporarily unavailable (AI vision provider "
                   "failed) and the local OCR fallback found no readable text on this "
                   "drawing. Try again later, or upload a version with clearer labels.",
        )
    return instructor_chat(BlueprintAnalysis, [
        {"role": "system", "content": _BLUEPRINT_OCR_PROMPT},
        {"role": "user", "content": ocr_text[:6000]},
    ])


@router.post("/analyze-blueprint", response_model=BlueprintAnalysis)
async def analyze_blueprint(file: UploadFile = File(...)):
    file_bytes = await file.read()
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "pdf"):
        raise HTTPException(status_code=400, detail="Please upload an image (PNG/JPG) or PDF file for blueprint analysis.")
    is_pdf = ext == "pdf"

    try:
        return analyze_image_structured(file_bytes, _BLUEPRINT_PROMPT, BlueprintAnalysis)
    except Exception as gemini_exc:
        logger.warning("Gemini blueprint analysis failed, falling back to Groq vision: %s", gemini_exc)

    try:
        return groq_vision.analyze_image_structured(file_bytes, _BLUEPRINT_PROMPT, BlueprintAnalysis, is_pdf=is_pdf)
    except Exception as groq_exc:
        logger.warning("Groq vision blueprint analysis failed, falling back to local OCR + Groq text: %s", groq_exc)

    try:
        return _analyze_blueprint_via_ocr_fallback(file_bytes, is_pdf=is_pdf)
    except HTTPException:
        raise
    except Exception as ocr_exc:
        logger.error("OCR fallback also failed: %s", ocr_exc)
        raise HTTPException(status_code=500, detail=f"Blueprint analysis failed on every provider: {ocr_exc}") from ocr_exc


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


@router.post("/structural-check")
async def structural_check(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        parsed = parse_ifc_geometry(file_bytes, file.filename)
        if not parsed.get("success"):
            raise HTTPException(status_code=400, detail=parsed.get("error", "Parse failed"))

        screening = run_structural_screening(parsed.get("geometry", {}))
        if not screening.get("success"):
            raise HTTPException(status_code=400, detail=screening.get("error", "Structural screening failed"))

        ai_analysis = ""
        try:
            prompt = f"""
            You are a structural engineer reviewing a preliminary beam screening report.
            Project: {parsed.get('project_name')}
            Total beams checked: {screening['total_checked']}
            Passed: {screening['passed']}, Warnings: {screening['warnings']}, Failed: {screening['failed']}
            Results: {json.dumps(screening['results'], indent=2)}

            Provide:
            1. Summary of overall structural adequacy
            2. Beams needing immediate attention and why
            3. Likely causes (span, section size, material) for any failing/warning beams
            4. Recommended next steps before construction
            """
            ai_analysis = analyze_text(json.dumps(screening), prompt)
        except Exception:
            ai_analysis = (
                f"Structural screening complete: {screening['passed']} passed, "
                f"{screening['warnings']} warnings, {screening['failed']} failed out of {screening['total_checked']} beams checked."
            )

        return {"status": "success", "structural": screening, "ai_analysis": ai_analysis}
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


@router.post("/project/{project_id}/model")
async def save_project_model(project_id: str, file: UploadFile = File(...)):
    """Parse an IFC file and persist it as the project's current BIM/Digital Twin model."""
    try:
        filename = file.filename or "model.ifc"
        if not filename.lower().endswith(".ifc"):
            raise HTTPException(status_code=400, detail="Only .ifc files are accepted")

        file_bytes = await file.read()

        bim_data = parse_ifc_geometry(file_bytes, filename)
        if not bim_data.get("success"):
            raise HTTPException(status_code=400, detail=bim_data.get("error", "Parse failed"))

        mesh_result = parse_ifc_for_3d(file_bytes, filename)
        meshes = mesh_result.get("meshes", []) if mesh_result.get("success") else []

        ai_analysis = ""
        try:
            prompt = f"""
            Analyze this BIM/IFC model data for a construction project:
            Project: {bim_data['project_name']}
            Total Elements: {bim_data['total_elements']}
            Element Summary: {bim_data['summary']}
            Storeys: {bim_data['storeys']}
            Materials: {bim_data['materials']}

            Provide a concise overview, complexity assessment, and key risk areas.
            """
            ai_analysis = analyze_text(str(bim_data), prompt)
        except Exception:
            ai_analysis = f"IFC parsed successfully. {bim_data['total_elements']} elements found across {len(bim_data['storeys'])} storeys."

        storage_result = upload_document(file_bytes, filename, bucket="bim_models")
        if not storage_result.get("success"):
            logger.warning("upload to bim_models bucket failed (%s), falling back to documents bucket", storage_result.get("error"))
            storage_result = upload_document(file_bytes, filename, bucket="documents")
        if not storage_result.get("success"):
            raise HTTPException(status_code=500, detail=storage_result.get("error", "File storage failed"))

        deactivate_bim_models(project_id)
        row = create_bim_model({
            "project_id": project_id,
            "file_name": storage_result["filename"],
            "original_name": filename,
            "bucket": storage_result["bucket"],
            "file_url": storage_result["url"],
            "bim_data": bim_data,
            "meshes": meshes,
            "ai_analysis": ai_analysis,
            "is_current": True,
            "file_size": len(file_bytes),
        })

        return {
            "success": True,
            "bim_data": bim_data,
            "meshes": meshes,
            "ai_analysis": ai_analysis,
            "file_url": storage_result["url"],
            "original_name": filename,
            "model": row,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("save_project_model failed for project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/project/{project_id}/model")
def get_project_model(project_id: str):
    row = get_current_bim_model(project_id)
    if not row:
        return {"success": False}
    return {
        "success": True,
        "bim_data": row.get("bim_data"),
        "meshes": row.get("meshes"),
        "ai_analysis": row.get("ai_analysis"),
        "file_url": row.get("file_url"),
        "original_name": row.get("original_name"),
        "created_at": row.get("created_at"),
        "file_size": row.get("file_size"),
    }


@router.delete("/project/{project_id}/model")
def clear_project_model(project_id: str):
    deactivate_bim_models(project_id)
    return {"success": True}


@router.get("/project/{project_id}/model/download")
def download_project_model(project_id: str):
    """Proxy the real uploaded model's raw .ifc bytes regardless of Supabase bucket
    publicity — uses the service-role storage client's .download() (get_document),
    not the stored file_url (which 400s for the private 'bim_models' bucket)."""
    row = get_current_bim_model(project_id)
    if not row:
        raise HTTPException(status_code=404, detail="No model uploaded for this project")
    file_bytes = get_document(row["file_name"], bucket=row.get("bucket") or "bim_models")
    if file_bytes is None:
        raise HTTPException(status_code=502, detail="Could not retrieve stored IFC file")
    filename = row.get("original_name") or f"{project_id}.ifc"
    return Response(
        content=file_bytes, media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/project/{project_id}/models")
def list_project_models(project_id: str):
    """Full upload history for a project — current and superseded uploads, newest first."""
    rows = get_bim_model_history(project_id)
    return {"success": True, "models": rows}


@router.delete("/project/{project_id}/models")
def delete_all_project_models(project_id: str):
    """Permanently delete every uploaded IFC file (and history) for a project."""
    rows = get_bim_model_history(project_id)
    for row in rows:
        delete_document(row["file_name"], bucket=row.get("bucket") or "bim_models")
    delete_bim_models_for_project(project_id)
    return {"success": True, "deleted": len(rows)}


@router.get("/models/latest")
def list_latest_models():
    """The current IFC model for every project that has one — newest first."""
    rows = get_all_current_bim_models()
    return {"success": True, "models": rows}


@router.get("/model/{model_id}/download")
def download_model_by_id(model_id: str):
    """Download any specific historical (or current) upload by its row id."""
    row = get_bim_model_by_id(model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    file_bytes = get_document(row["file_name"], bucket=row.get("bucket") or "bim_models")
    if file_bytes is None:
        raise HTTPException(status_code=502, detail="Could not retrieve stored IFC file")
    filename = row.get("original_name") or f"{model_id}.ifc"
    return Response(
        content=file_bytes, media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/model/{model_id}")
def delete_model(model_id: str):
    """Permanently delete one historical (or current) upload. If it was the project's
    current model, the next most recent remaining upload (if any) is promoted to current
    so the rest of the app (Overview/Elements/BOQ/Clash) keeps working off a real model."""
    row = get_bim_model_by_id(model_id)
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    delete_document(row["file_name"], bucket=row.get("bucket") or "bim_models")
    delete_bim_model(model_id)
    if row.get("is_current"):
        promote_latest_bim_model(row["project_id"])
    return {"success": True}


@router.get("/fallback-models")
def list_fallback_models():
    """Lightweight metadata for the model-picker dropdown."""
    return {"success": True, "models": fallback_svc.list_fallback_models()}


@router.get("/fallback-models/{model_id}")
def get_fallback_model(model_id: str):
    """Full bim_data + meshes — same response shape as GET /project/{id}/model, so the
    frontend can point BIMViewer3D / DigitalTwin3D at either interchangeably."""
    parsed = fallback_svc.get_fallback_model(model_id)
    if not parsed:
        raise HTTPException(status_code=404, detail="Unknown fallback model")
    return {
        "success": True,
        "bim_data": parsed["bim_data"],
        "meshes": parsed["meshes"],
        "ai_analysis": "",
        "file_url": None,
        "original_name": f"{model_id}.ifc",
        "created_at": None,
    }


@router.get("/fallback-models/{model_id}/download")
def download_fallback_model(model_id: str):
    file_bytes = fallback_svc.get_fallback_model_bytes(model_id)
    if file_bytes is None:
        raise HTTPException(status_code=404, detail="Unknown fallback model")
    return Response(
        content=file_bytes, media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{model_id}.ifc"'},
    )


class SensorReading(BaseModel):
    floor: int
    zone: str
    temperature: float
    occupancy: float
    co2: float
    humidity: float
    alert: bool = False


class SaveSensorReadings(BaseModel):
    file_name: str = ""
    readings: list[SensorReading]


@router.post("/project/{project_id}/sensors")
async def save_project_sensors(project_id: str, body: SaveSensorReadings):
    """Persist parsed sensor CSV readings as the project's current Digital Twin sensor data."""
    deactivate_sensor_readings(project_id)
    row = create_sensor_reading({
        "project_id": project_id,
        "file_name": body.file_name,
        "readings": [r.model_dump() for r in body.readings],
        "is_current": True,
    })
    return {"success": True, "file_name": body.file_name, "readings": [r.model_dump() for r in body.readings], "model": row}


@router.get("/project/{project_id}/sensors")
def get_project_sensors(project_id: str):
    row = get_current_sensor_reading(project_id)
    if not row:
        return {"success": False}
    return {
        "success": True,
        "file_name": row.get("file_name"),
        "readings": row.get("readings"),
        "created_at": row.get("created_at"),
    }


@router.delete("/project/{project_id}/sensors")
def clear_project_sensors(project_id: str):
    deactivate_sensor_readings(project_id)
    return {"success": True}
