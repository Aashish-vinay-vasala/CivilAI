import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from app.services.ml_service import (
    predict_cost_overrun,
    predict_delay,
    predict_safety_risk,
    predict_turnover,
    predict_equipment_failure,
    get_safety_stats,
    get_delay_stats,
    get_workforce_stats,
    get_equipment_stats,
    get_performance_trend,
    get_auto_cost_overrun,
)
from app.services.cost_overrun_trainer import train as train_cost_overrun_model

router = APIRouter()

class CostInput(BaseModel):
    project_type: str
    duration_months: int
    team_size: int
    change_orders: int
    material_price_increase: float
    weather_impact_days: int
    subcontractor_count: int

class DelayInput(BaseModel):
    project_type: str
    planned_duration_days: int
    weather_delays: int
    labor_shortage: int
    material_delays: int
    design_changes: int
    subcontractor_issues: int

class SafetyInput(BaseModel):
    incident_type: str
    zone: str
    workers_involved: int
    ppe_worn: int
    training_completed: int
    near_miss: int
    month: int

class TurnoverInput(BaseModel):
    role: str
    experience_years: int
    salary: float
    performance_score: float
    safety_violations: int
    training_hours: int
    overtime_hours: int
    tenure_months: int

class EquipmentInput(BaseModel):
    equipment_type: str
    age_years: int
    operating_hours: int
    maintenance_count: int
    last_service_days_ago: int
    breakdowns: int

class TrainRequest(BaseModel):
    dataset_ids: list[str] = []

_ML_DATASETS_BUCKET = "ml-datasets"
_COST_OVERRUN_REQUIRED_COLUMNS = [
    "duration_months", "team_size", "change_orders",
    "material_price_increase", "weather_impact_days", "subcontractor_count",
]


def _ensure_ml_datasets_bucket(sb) -> None:
    try:
        sb.storage.create_bucket(_ML_DATASETS_BUCKET, options={"public": False})
    except Exception:
        pass  # already exists

@router.post("/cost-overrun")
async def cost_overrun(data: CostInput):
    try:
        return await predict_cost_overrun(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/delay")
async def delay_prediction(data: DelayInput):
    try:
        return await predict_delay(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/safety-risk")
async def safety_risk(data: SafetyInput):
    try:
        return await predict_safety_risk(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/turnover")
async def turnover(data: TurnoverInput):
    try:
        return await predict_turnover(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/equipment-failure")
async def equipment_failure(data: EquipmentInput):
    try:
        return await predict_equipment_failure(data.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/safety-stats")
async def safety_stats(project_id: str | None = Query(default=None)):
    try:
        return await get_safety_stats(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/delay-stats")
async def delay_stats(project_id: str | None = Query(default=None)):
    try:
        return await get_delay_stats(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workforce-stats")
async def workforce_stats(project_id: str | None = Query(default=None)):
    try:
        return await get_workforce_stats(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/equipment-stats")
async def equipment_stats(project_id: str | None = Query(default=None)):
    try:
        return await get_equipment_stats(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance-trend")
async def performance_trend(months: int = Query(default=6, ge=1, le=24)):
    try:
        return await get_performance_trend(months)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cost-overrun-auto")
async def cost_overrun_auto(project_id: str | None = Query(default=None)):
    try:
        return await get_auto_cost_overrun(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cost-overrun/train")
async def cost_overrun_train(body: TrainRequest = TrainRequest()):
    """Retrain the cost-overrun classifier + regressor on the synthetic baseline plus any
    completed projects in Supabase, plus any validated uploaded datasets (dataset_ids),
    and hot-swap the served model to a new, permanently retained version. dataset_ids
    defaults to empty — the plain "Train Model" button keeps its existing behavior."""
    try:
        result = await run_in_threadpool(train_cost_overrun_model, body.dataset_ids)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cost-overrun/dataset/validate")
async def cost_overrun_dataset_validate(file: UploadFile = File(...)):
    """Parse + validate an uploaded CSV/XLSX of training rows against the required column
    schema. On success, persists the raw file to Storage and the normalized rows to
    ml_dataset_uploads (status='validated') and returns a dataset_id — this does NOT train
    anything; training only happens when /cost-overrun/train is called with that id."""
    from app.services.cost_overrun_dataset_validator import validate_cost_overrun_file
    from app.services.db_service import supabase

    file_bytes = await file.read()
    filename = file.filename or "upload"
    parsed_rows, column_map, errors, warnings = validate_cost_overrun_file(file_bytes, filename)

    matched_columns = sorted(set(column_map.values()))
    missing_columns = [c for c in _COST_OVERRUN_REQUIRED_COLUMNS if c not in matched_columns]
    preview = parsed_rows[:20]

    if errors or not parsed_rows:
        return {
            "dataset_id": None, "filename": filename, "row_count": 0,
            "column_mapping": column_map, "matched_columns": matched_columns,
            "missing_columns": missing_columns, "errors": errors, "warnings": warnings,
            "preview": preview,
        }

    try:
        _ensure_ml_datasets_bucket(supabase)
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"
        storage_path = f"{uuid.uuid4()}.{ext}"
        supabase.storage.from_(_ML_DATASETS_BUCKET).upload(
            path=storage_path, file=file_bytes,
            file_options={"content-type": "application/octet-stream"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store uploaded dataset: {e}")

    try:
        inserted = supabase.table("ml_dataset_uploads").insert({
            "model_name": "cost_overrun",
            "filename": filename,
            "storage_path": storage_path,
            "row_count": len(parsed_rows),
            "column_mapping": column_map,
            "validation": {"errors": errors, "warnings": warnings},
            "parsed_rows": parsed_rows,
            "status": "validated",
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save validated dataset: {e}")

    return {
        "dataset_id": inserted.data[0]["id"], "filename": filename, "row_count": len(parsed_rows),
        "column_mapping": column_map, "matched_columns": matched_columns,
        "missing_columns": missing_columns, "errors": errors, "warnings": warnings,
        "preview": preview,
    }


@router.get("/cost-overrun/history")
async def cost_overrun_history():
    try:
        from app.services.db_service import supabase
        res = (
            supabase.table("ml_training_runs")
            .select("*")
            .eq("model_name", "cost_overrun")
            .order("version", desc=True)
            .execute()
        )
        return {"runs": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cost-overrun/versions/{version}/activate")
async def cost_overrun_activate_version(version: int):
    """Roll the served model forward or back to any permanently retained past version —
    this is what makes 'preserve the original training' actionable, not just a promise."""
    from app.services import cost_overrun_model
    from app.services.db_service import supabase

    res = (
        supabase.table("ml_training_runs")
        .select("id")
        .eq("model_name", "cost_overrun")
        .eq("version", version)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=f"No cost-overrun model version {version} found")
    run_id = res.data[0]["id"]

    try:
        cost_overrun_model.activate_version(version)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    supabase.table("ml_training_runs").update({"is_active": True}).eq("id", run_id).execute()
    supabase.table("ml_training_runs").update({"is_active": False}).eq(
        "model_name", "cost_overrun"
    ).neq("id", run_id).execute()

    return {"status": "success", "active_version": version}