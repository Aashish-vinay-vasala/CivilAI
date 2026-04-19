from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.db_service import (
    get_projects,
    get_project_by_id,
    get_cost_entries,
    get_schedule_tasks,
    get_safety_incidents,
    get_workforce,
    get_equipment,
    get_contracts,
    get_permits,
)
from supabase import create_client
from app.config import settings
import uuid

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)

class ProjectCreate(BaseModel):
    name: str
    location: Optional[str] = None
    status: Optional[str] = "active"
    budget: Optional[float] = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    client: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    budget: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    client: Optional[str] = None

class TaskCreate(BaseModel):
    task_name: str
    phase: Optional[str] = None
    assignee: Optional[str] = None
    planned_progress: Optional[int] = 100
    actual_progress: Optional[int] = 0
    status: Optional[str] = "pending"
    priority: Optional[str] = "medium"
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    delay_days: Optional[int] = 0
    project_id: Optional[str] = None

class TaskUpdate(BaseModel):
    actual_progress: Optional[int] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    delay_days: Optional[int] = None
    phase: Optional[str] = None
    priority: Optional[str] = None

@router.get("/")
def list_projects():
    try:
        projects = get_projects()
        return {"status": "success", "projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
def create_project(project: ProjectCreate):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "name": project.name,
            "location": project.location,
            "status": project.status,
            "budget": project.budget,
            "start_date": project.start_date,
            "end_date": project.end_date,
            "client": project.client,
        }
        response = supabase.table("projects").insert(data).execute()
        return {"status": "success", "project": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{project_id}")
def update_project(project_id: str, project: ProjectUpdate):
    try:
        update_data = {k: v for k, v in project.dict().items() if v is not None}
        response = supabase.table("projects").update(update_data).eq("id", project_id).execute()
        return {"status": "success", "project": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}")
def delete_project(project_id: str):
    try:
        supabase.table("cost_entries").delete().eq("project_id", project_id).execute()
        supabase.table("schedule_tasks").delete().eq("project_id", project_id).execute()
        supabase.table("safety_incidents").delete().eq("project_id", project_id).execute()
        supabase.table("equipment").delete().eq("project_id", project_id).execute()
        supabase.table("workforce").delete().eq("project_id", project_id).execute()
        supabase.table("permits").delete().eq("project_id", project_id).execute()
        supabase.table("contracts").delete().eq("project_id", project_id).execute()
        supabase.table("documents").delete().eq("project_id", project_id).execute()
        supabase.table("purchase_orders").delete().eq("project_id", project_id).execute()
        supabase.table("projects").delete().eq("id", project_id).execute()
        return {"status": "success", "message": "Project deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}")
def get_project(project_id: str):
    try:
        project = get_project_by_id(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"status": "success", "project": project}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/cost")
def get_project_cost(project_id: str):
    try:
        data = get_cost_entries(project_id)
        return {"status": "success", "cost_entries": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/schedule")
def get_project_schedule(project_id: str):
    try:
        data = get_schedule_tasks(project_id)
        return {"status": "success", "tasks": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/schedule")
def add_task(project_id: str, task: TaskCreate):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "task_name": task.task_name,
            "phase": task.phase,
            "assignee": task.assignee,
            "planned_progress": task.planned_progress,
            "actual_progress": task.actual_progress,
            "status": task.status,
            "priority": task.priority,
            "planned_start": task.planned_start,
            "planned_end": task.planned_end,
            "delay_days": task.delay_days,
        }
        response = supabase.table("schedule_tasks").insert(data).execute()
        return {"status": "success", "task": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{project_id}/schedule/{task_id}")
def update_task(project_id: str, task_id: str, task: TaskUpdate):
    try:
        update_data = {k: v for k, v in task.dict().items() if v is not None}
        response = supabase.table("schedule_tasks").update(update_data).eq("id", task_id).execute()
        return {"status": "success", "task": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}/schedule/{task_id}")
def delete_task(project_id: str, task_id: str):
    try:
        supabase.table("schedule_tasks").delete().eq("id", task_id).execute()
        return {"status": "success", "message": "Task deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/safety")
def get_project_safety(project_id: str):
    try:
        data = get_safety_incidents(project_id)
        return {"status": "success", "incidents": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/workforce")
def get_project_workforce(project_id: str):
    try:
        data = get_workforce(project_id)
        return {"status": "success", "workforce": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/equipment")
def get_project_equipment(project_id: str):
    try:
        data = get_equipment(project_id)
        return {"status": "success", "equipment": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/contracts")
def get_project_contracts(project_id: str):
    try:
        data = get_contracts(project_id)
        return {"status": "success", "contracts": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/permits")
def get_project_permits(project_id: str):
    try:
        data = get_permits(project_id)
        return {"status": "success", "permits": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))