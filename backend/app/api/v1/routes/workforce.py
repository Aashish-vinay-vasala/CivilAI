from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from app.ai.workforce_analyzer import (
    analyze_workforce,
    extract_team_members,
    match_skills,
    predict_turnover,
    generate_onboarding_plan
)
from app.ocr.document_processor import process_document
from supabase import create_client
from app.config import settings
import uuid

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


class WorkerCreate(BaseModel):
    name: str
    role: str
    trade: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    status: Optional[str] = "active"
    hours_worked: Optional[float] = 0
    project_id: Optional[str] = None


class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    trade: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    hours_worked: Optional[float] = None
    project_id: Optional[str] = None


class SkillTargetUpdate(BaseModel):
    required_pct: int


class SkillMatchRequest(BaseModel):
    job_requirements: dict
    available_workers: list


class TurnoverRequest(BaseModel):
    workers: list


class OnboardingRequest(BaseModel):
    name: str
    role: str
    experience_years: int
    skills: list = []
    certifications: list = []
    start_date: str


# --- CRUD ---

@router.get("/workers")
def list_workers():
    try:
        res = supabase.table("workforce").select("*").execute()
        return {"status": "success", "workers": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workers")
def create_worker(worker: WorkerCreate):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "name": worker.name,
            "role": worker.role,
            "trade": worker.trade or "",
            "phone": worker.phone or "",
            "email": worker.email or "",
            "status": worker.status or "active",
            "hours_worked": int(round(worker.hours_worked or 0)),
        }
        if worker.project_id:
            data["project_id"] = worker.project_id
        res = supabase.table("workforce").insert(data).execute()
        return {"status": "success", "worker": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/workers/{worker_id}")
def update_worker(worker_id: str, worker: WorkerUpdate):
    try:
        update_data = {k: v for k, v in worker.model_dump().items() if v is not None}
        res = supabase.table("workforce").update(update_data).eq("id", worker_id).execute()
        return {"status": "success", "worker": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/workers/{worker_id}")
def delete_worker(worker_id: str):
    try:
        supabase.table("workforce").delete().eq("id", worker_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
def get_workforce_stats():
    try:
        res = supabase.table("workforce").select("*").execute()
        workers = res.data or []
        total = len(workers)
        active = sum(1 for w in workers if w.get("status") == "active")
        onleave = sum(1 for w in workers if w.get("status") == "onleave")
        inactive = total - active - onleave

        trade_dist: dict = {}
        for w in workers:
            t = (w.get("trade") or "General").strip() or "General"
            trade_dist[t] = trade_dist.get(t, 0) + 1

        total_hours = sum(float(w.get("hours_worked", 0) or 0) for w in workers)

        return {
            "status": "success",
            "stats": {
                "total_workers": total,
                "active_workers": active,
                "on_leave": onleave,
                "inactive": inactive,
                "trade_distribution": trade_dist,
                "total_hours_today": round(total_hours, 1),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skill-targets")
def get_skill_targets():
    try:
        res = supabase.table("skill_targets").select("*").execute()
        targets = {row["skill_name"]: row["required_pct"] for row in (res.data or [])}
        return {"status": "success", "targets": targets}
    except Exception:
        return {"status": "success", "targets": {}}


@router.put("/skill-targets/{skill_name}")
def upsert_skill_target(skill_name: str, body: SkillTargetUpdate):
    try:
        supabase.table("skill_targets").upsert(
            {"skill_name": skill_name, "required_pct": body.required_pct},
            on_conflict="skill_name"
        ).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- AI routes ---

@router.post("/analyze")
async def analyze_workforce_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text")
        result = analyze_workforce(text)
        return {"status": "success", "analysis": result["analysis"], "risk_data": result["risk_data"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-members")
async def extract_members_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        members = extract_team_members(text)
        return {"status": "success", "extracted_members": members}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/match-skills")
async def match_skills_route(request: SkillMatchRequest):
    try:
        matches = match_skills(request.job_requirements, request.available_workers)
        return {"status": "success", "matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-turnover")
async def predict_turnover_route(request: TurnoverRequest):
    try:
        prediction = predict_turnover(request.workers)
        return {"status": "success", "prediction": prediction}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/onboarding-plan")
async def onboarding_plan_route(request: OnboardingRequest):
    try:
        plan = generate_onboarding_plan(request.model_dump())
        return {"status": "success", "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
