"""
Live data fetchers — pull real project data from Supabase for agent tools.
All functions return data ready to be serialised into LLM analysis context.
"""
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("civilai.live_data")


def _get_sb():
    from app.config import settings
    from supabase import create_client
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)


def _safe(fn) -> Any:
    try:
        return fn() or []
    except Exception as e:
        logger.debug("Live data fetch skipped: %s", e)
        return []


# ── Project helpers ────────────────────────────────────────────────────────────

def fetch_projects(limit: int = 20) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("projects")
        .select("id,name,location,status,budget,start_date,end_date,client")
        .order("created_at", desc=True).limit(limit).execute().data)


def resolve_project(project_id: str = "") -> Optional[dict]:
    """Return project row — use provided ID or fall back to most recent project."""
    sb = _get_sb()
    if project_id:
        rows = _safe(lambda: sb.table("projects").select("*").eq("id", project_id).execute().data)
    else:
        rows = _safe(lambda: sb.table("projects").select("*").order("created_at", desc=True).limit(1).execute().data)
    return rows[0] if rows else None


def resolve_project_id(project_id: str = "") -> Optional[str]:
    p = resolve_project(project_id)
    return p["id"] if p else None


# ── Domain fetchers ────────────────────────────────────────────────────────────

def fetch_schedule(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("schedule_tasks")
        .select("task_name,phase,assignee,planned_progress,actual_progress,status,priority,planned_start,planned_end,delay_days")
        .eq("project_id", project_id).order("planned_start").execute().data)


def fetch_safety(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("safety_incidents")
        .select("type,description,severity,status,zone,location,injured,date")
        .eq("project_id", project_id).order("date", desc=True).limit(50).execute().data)


def fetch_cost(project_id: str) -> dict:
    sb = _get_sb()
    entries = _safe(lambda: sb.table("cost_entries")
        .select("amount,description,category,entry_date")
        .eq("project_id", project_id).order("entry_date", desc=True).limit(100).execute().data)
    budget = _safe(lambda: sb.table("financial_budget_items")
        .select("code,description,div_name,original_budget,revised_budget,committed_costs,direct_costs")
        .eq("project_id", project_id).execute().data)
    return {"cost_entries": entries, "budget_items": budget}


def fetch_rfis(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("rfis")
        .select("rfi_number,subject,question,submitted_by,assigned_to,status,priority,due_date,response")
        .eq("project_id", project_id).order("created_at", desc=True).limit(50).execute().data)


def fetch_submittals(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("submittals")
        .select("submittal_number,title,type,submitted_by,reviewed_by,status,submitted_date,review_date,revision")
        .eq("project_id", project_id).order("submitted_date", desc=True).limit(50).execute().data)


def fetch_permits(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("permits")
        .select("name,type,status,expiry_date,risk_level,issued_by")
        .eq("project_id", project_id).execute().data)


def fetch_equipment(project_id: str) -> dict:
    sb = _get_sb()
    equip = _safe(lambda: sb.table("equipment")
        .select("id,name,equipment_code,health_score,status,next_service,equipment_type,age_years,operating_hours,notes")
        .eq("project_id", project_id).execute().data)
    logs: list = []
    for e in equip[:15]:
        eid = e.get("id")
        if eid:
            logs.extend(_safe(lambda: sb.table("equipment_maintenance_logs")
                .select("month,planned_hours,unplanned_hours,maintenance_cost")
                .eq("equipment_id", eid).order("month", desc=True).limit(3).execute().data))
    return {"equipment": equip, "maintenance_logs": logs}


def fetch_workforce(project_id: str) -> dict:
    sb = _get_sb()
    workers = _safe(lambda: sb.table("workforce")
        .select("name,role,trade,status,hours_worked")
        .eq("project_id", project_id).execute().data)
    targets = _safe(lambda: sb.table("skill_targets").select("skill_name,required_pct").execute().data)
    return {"workers": workers, "skill_targets": targets}


def fetch_payments(project_id: str) -> dict:
    sb = _get_sb()
    invoices = _safe(lambda: sb.table("invoices")
        .select("invoice_number,contractor,amount,due_date,status,description,paid_date")
        .eq("project_id", project_id).order("due_date", desc=True).limit(50).execute().data)
    budget = _safe(lambda: sb.table("financial_budget_items")
        .select("code,description,budgeted_amount,actual_amount,committed_costs,direct_costs")
        .eq("project_id", project_id).execute().data)
    return {"invoices": invoices, "budget_summary": budget}


def fetch_anomalies(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("anomaly_history")
        .select("anomaly_type,severity,title,description,deviation,category,detected_at")
        .eq("project_id", project_id).order("detected_at", desc=True).limit(30).execute().data)


def fetch_daily_reports(project_id: str, limit: int = 7) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("daily_reports")
        .select("report_date,weather,workers_on_site,work_completed,issues,materials_used,safety_incidents,ai_summary")
        .eq("project_id", project_id).order("report_date", desc=True).limit(limit).execute().data)


def fetch_punch_list(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("punch_list")
        .select("item,location,assigned_to,status,priority,due_date,category")
        .eq("project_id", project_id).execute().data)


def fetch_meeting_minutes(project_id: str, limit: int = 5) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("meeting_minutes")
        .select("meeting_date,meeting_type,attendees,agenda,discussion,action_items,ai_summary")
        .eq("project_id", project_id).order("meeting_date", desc=True).limit(limit).execute().data)


def fetch_evm_snapshots(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("evm_snapshots")
        .select("*").eq("project_id", project_id).order("snapshot_date", desc=True).limit(6).execute().data)


def fetch_cost_codes(project_id: str) -> list:
    sb = _get_sb()
    return _safe(lambda: sb.table("cost_codes")
        .select("code,description,category,budgeted_amount,actual_amount,unit")
        .eq("project_id", project_id).execute().data)


# ── Context builder ────────────────────────────────────────────────────────────

def _section(label: str, data: Any) -> str:
    if not data:
        return ""
    try:
        body = json.dumps(data, indent=2, default=str)
    except Exception:
        body = str(data)
    return f"\n=== {label.upper()} ===\n{body}\n"


def build_full_context(project_id: str, extra_context: str = "") -> str:
    """Fetch ALL tables for a project and assemble into one context string."""
    p = resolve_project(project_id)
    if not p:
        return extra_context or "No project data found."

    pid = p["id"]
    sections = [
        _section("Project Info", p),
        _section("Schedule Tasks",   fetch_schedule(pid)),
        _section("Safety Incidents", fetch_safety(pid)),
        _section("Cost & Budget",    fetch_cost(pid)),
        _section("RFIs",             fetch_rfis(pid)),
        _section("Submittals",       fetch_submittals(pid)),
        _section("Permits",          fetch_permits(pid)),
        _section("Equipment",        fetch_equipment(pid)),
        _section("Workforce",        fetch_workforce(pid)),
        _section("Invoices & Payments", fetch_payments(pid)),
        _section("Anomalies",        fetch_anomalies(pid)),
        _section("Daily Reports",    fetch_daily_reports(pid)),
        _section("Punch List",       fetch_punch_list(pid)),
        _section("Meeting Minutes",  fetch_meeting_minutes(pid)),
        _section("EVM Snapshots",    fetch_evm_snapshots(pid)),
    ]
    ctx = "".join(s for s in sections if s)
    if extra_context:
        ctx += f"\n=== ADDITIONAL CONTEXT ===\n{extra_context}\n"
    return ctx
