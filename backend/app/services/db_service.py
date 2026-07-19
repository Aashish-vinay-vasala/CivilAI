import logging
import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from app.config import settings

logger = logging.getLogger(__name__)

# max_keepalive_connections=0 forces a fresh connection per request instead of
# reusing a pooled one. On Windows, concurrent requests (e.g. the Projects page's
# Promise.all across workforce/contracts/permits/purchase-orders) checking a
# shared keep-alive connection in/out of httpx's pool race on the underlying
# socket and intermittently raise "[WinError 10035] A non-blocking socket
# operation could not be completed immediately" — reproduced directly against
# this client under concurrent load. Disabling reuse trades a little latency
# for correctness under concurrency.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
    SyncClientOptions(httpx_client=httpx.Client(limits=httpx.Limits(max_keepalive_connections=0))),
)

def get_projects(user: dict | None = None):
    try:
        from app.services.scoping import visible_project_ids

        ids = visible_project_ids(user)  # None = no filtering (demo mode / AUTH_REQUIRED off)
        query = supabase.table("projects").select("*")
        if ids is not None:
            if not ids:
                return []
            query = query.in_("id", ids)
        response = query.execute()
        projects = response.data or []

        # Fetch all tasks, cost entries, and invoices in three bulk queries
        # to avoid N+1 queries per project
        task_q = supabase.table("schedule_tasks").select("project_id,actual_progress")
        cost_q = supabase.table("cost_entries").select("project_id,amount")
        inv_q = supabase.table("invoices").select("project_id,amount,status")
        if ids is not None:
            task_q, cost_q, inv_q = task_q.in_("project_id", ids), cost_q.in_("project_id", ids), inv_q.in_("project_id", ids)
        all_tasks  = task_q.execute().data or []
        all_costs  = cost_q.execute().data or []
        try:
            all_invs = inv_q.execute().data or []
        except Exception:
            all_invs = []

        # Group by project_id
        tasks_by_proj:    dict = {}
        costs_by_proj:    dict = {}
        committed_by_proj: dict = {}

        for t in all_tasks:
            pid = t.get("project_id")
            tasks_by_proj.setdefault(pid, []).append(t)

        for c in all_costs:
            pid = c.get("project_id")
            costs_by_proj.setdefault(pid, 0)
            costs_by_proj[pid] += float(c.get("amount", 0))

        for inv in all_invs:
            pid = inv.get("project_id")
            # Committed = obligated but not yet paid (pending/overdue). "received" invoices
            # are already paid, so they don't belong here — and "approved" never occurs
            # (invoices.status only allows received/pending/overdue). Must match the same
            # filter used by /financials/live-actuals and /accounting/dashboard, or the
            # "Committed Costs" figure disagrees across pages for the same project.
            if inv.get("status") in ("pending", "overdue"):
                committed_by_proj.setdefault(pid, 0)
                committed_by_proj[pid] += float(inv.get("amount", 0))

        normalized = []
        for p in projects:
            pid = p["id"]
            tasks        = tasks_by_proj.get(pid, [])
            avg_progress = round(sum(t.get("actual_progress", 0) for t in tasks) / len(tasks)) if tasks else 0
            total_spent  = costs_by_proj.get(pid, 0.0)
            committed    = committed_by_proj.get(pid, 0.0)

            normalized.append({
                "id":                  pid,
                "name":                p.get("name", "Unknown"),
                "location":            p.get("location", ""),
                "status":              p.get("status", "active"),
                "client":              p.get("client", ""),
                "total_budget":        float(p.get("budget", 0)),
                "spent_to_date":       total_spent,
                "committed_amount":    committed,
                "progress_percentage": avg_progress,
                "start_date":          p.get("start_date", ""),
                "end_date":            p.get("end_date", ""),
            })
        return normalized
    except Exception as e:
        logger.exception("get_projects failed: %s", e)
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

def get_current_bim_model(project_id: str):
    response = (
        supabase.table("bim_models")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_current", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None

def deactivate_bim_models(project_id: str):
    supabase.table("bim_models").update({"is_current": False}).eq("project_id", project_id).eq("is_current", True).execute()

def create_bim_model(data: dict):
    response = supabase.table("bim_models").insert(data).execute()
    return response.data[0] if response.data else None

def get_bim_model_history(project_id: str):
    response = (
        supabase.table("bim_models")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []

def get_all_current_bim_models():
    response = (
        supabase.table("bim_models")
        .select("*")
        .eq("is_current", True)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []

def get_bim_model_by_id(model_id: str):
    response = supabase.table("bim_models").select("*").eq("id", model_id).limit(1).execute()
    return response.data[0] if response.data else None

def delete_bim_model(model_id: str):
    supabase.table("bim_models").delete().eq("id", model_id).execute()

def delete_bim_models_for_project(project_id: str):
    supabase.table("bim_models").delete().eq("project_id", project_id).execute()

def promote_latest_bim_model(project_id: str):
    response = (
        supabase.table("bim_models")
        .select("id")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if response.data:
        supabase.table("bim_models").update({"is_current": True}).eq("id", response.data[0]["id"]).execute()

def get_current_sensor_reading(project_id: str):
    response = (
        supabase.table("sensor_readings")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_current", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None

def deactivate_sensor_readings(project_id: str):
    supabase.table("sensor_readings").update({"is_current": False}).eq("project_id", project_id).eq("is_current", True).execute()

def create_sensor_reading(data: dict):
    response = supabase.table("sensor_readings").insert(data).execute()
    return response.data[0] if response.data else None