from fastapi import APIRouter, HTTPException
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

router = APIRouter()

@router.get("/")
def list_projects():
    try:
        projects = get_projects()
        return {"status": "success", "projects": projects}
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