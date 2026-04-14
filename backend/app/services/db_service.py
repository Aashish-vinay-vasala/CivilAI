from supabase import create_client, Client
from app.config import settings

supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY
)

def get_projects():
    response = supabase.table("projects").select("*").execute()
    return response.data

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