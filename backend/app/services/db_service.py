from supabase import create_client, Client
from app.config import settings

supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY
)

def get_projects():
    try:
        response = supabase.table("projects").select("*").execute()
        projects = response.data or []
        
        # Normalize fields for frontend
        normalized = []
        for p in projects:
            # Calculate progress from tasks
            tasks_res = supabase.table("schedule_tasks").select("actual_progress").eq("project_id", p["id"]).execute()
            tasks = tasks_res.data or []
            avg_progress = round(sum(t.get("actual_progress", 0) for t in tasks) / len(tasks)) if tasks else 0

            # Calculate spent from cost entries
            cost_res = supabase.table("cost_entries").select("amount").eq("project_id", p["id"]).execute()
            costs = cost_res.data or []
            total_spent = sum(float(c.get("amount", 0)) for c in costs)

            normalized.append({
                "id": p["id"],
                "name": p.get("name", "Unknown"),
                "location": p.get("location", ""),
                "status": p.get("status", "active"),
                "client": p.get("client", ""),
                "total_budget": float(p.get("budget", 0)),
                "spent_to_date": total_spent,
                "progress_percentage": avg_progress,
                "start_date": p.get("start_date", ""),
                "end_date": p.get("end_date", ""),
            })
        return normalized
    except Exception as e:
        print(f"get_projects error: {e}")
        return []

def get_project_by_id(project_id: str):
    response = supabase.table("projects").select("*").eq("id", project_id).execute()
    return response.data[0] if response.data else None

def get_cost_entries(project_id: str):
    response = supabase.table("cost_entries").select("*").eq("project_id", project_id).execute()
    return response.data

def get_schedule_tasks(project_id: str):
    response = supabase.table("schedule_tasks").select("*").eq("project_id", project_id).execute()
    return response.data

def get_safety_incidents(project_id: str):
    response = supabase.table("safety_incidents").select("*").eq("project_id", project_id).execute()
    return response.data

def get_workforce(project_id: str):
    response = supabase.table("workforce").select("*").eq("project_id", project_id).execute()
    return response.data

def get_equipment(project_id: str):
    response = supabase.table("equipment").select("*").eq("project_id", project_id).execute()
    return response.data

def get_contracts(project_id: str):
    response = supabase.table("contracts").select("*").eq("project_id", project_id).execute()
    return response.data

def get_permits(project_id: str):
    response = supabase.table("permits").select("*").eq("project_id", project_id).execute()
    return response.data

def get_purchase_orders(project_id: str):
    response = supabase.table("purchase_orders").select("*").eq("project_id", project_id).execute()
    return response.data

def create_safety_incident(data: dict):
    response = supabase.table("safety_incidents").insert(data).execute()
    return response.data

def create_document(data: dict):
    response = supabase.table("documents").insert(data).execute()
    return response.data