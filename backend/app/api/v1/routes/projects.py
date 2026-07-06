import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger("civilai.projects")
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
    get_purchase_orders,
)
from supabase import create_client
from app.config import settings
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import uuid
from app.constants import (
    MONTH_NAMES,
    CHART_LOOKBACK_MONTHS,
    CHART_FORECAST_MONTHS,
    BUDGET_MONTHS,
    DEFAULT_AVG_DURATION_MONTHS,
    BURN_RATE_MULTIPLIER,
    SAFETY_SCORE_INCIDENT_PENALTY,
    ALERT_LIMIT,
    SECONDS_PER_HOUR,
    SECONDS_PER_DAY,
    MODULE_ALERT_TYPE,
)

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
    project_type: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    budget: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    client: Optional[str] = None

class CostEntryCreate(BaseModel):
    amount: float
    description: Optional[str] = None
    category: Optional[str] = None
    entry_date: Optional[str] = None

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

@router.post("/")
def create_project(body: ProjectCreate):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "name": body.name,
            "location": body.location,
            "status": body.status or "active",
            "budget": body.budget or 0,
            "client": body.client,
        }
        if body.start_date:
            data["start_date"] = body.start_date
        if body.end_date:
            data["end_date"] = body.end_date
        result = supabase.table("projects").insert(data).execute()
        if result.data:
            return {"status": "success", "project": result.data[0]}
        raise HTTPException(status_code=500, detail="Insert failed")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/kpis")
def get_dashboard_kpis():
    try:
        projects_res = supabase.table("projects").select("budget").execute()
        total_budget = sum(float(p.get("budget", 0)) for p in (projects_res.data or []))

        tasks_res = supabase.table("schedule_tasks").select("actual_progress").execute()
        tasks = tasks_res.data or []
        avg_progress = round(sum(t.get("actual_progress", 0) for t in tasks) / len(tasks)) if tasks else 0

        workforce_res = supabase.table("workforce").select("id,status").execute()
        workforce = workforce_res.data or []
        active_workers = sum(1 for w in workforce if w.get("status") == "active") or len(workforce)

        incidents_res = supabase.table("safety_incidents").select("id,severity").execute()
        incidents = incidents_res.data or []
        incident_count = len(incidents)
        high = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "high")
        med  = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "medium")
        low_c = incident_count - high - med
        safety_score = round(max(0, 100 - high * 10 - med * 5 - low_c * 2))

        return {
            "status": "success",
            "kpis": {
                "total_budget": total_budget,
                "avg_progress": avg_progress,
                "active_workers": active_workers,
                "safety_score": safety_score,
                "incident_count": incident_count,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/charts/progress")
def get_progress_chart(start_date: Optional[str] = None, end_date: Optional[str] = None, months: Optional[int] = None):
    try:
        tasks_res = supabase.table("schedule_tasks").select(
            "planned_progress,actual_progress,planned_start"
        ).execute()
        tasks = tasks_res.data or []

        # Key by (year, month) to avoid cross-year collisions
        month_data: dict = defaultdict(lambda: {"planned": [], "actual": []})
        for task in tasks:
            start = task.get("planned_start")
            if start:
                try:
                    dt = datetime.strptime(str(start)[:10], "%Y-%m-%d")
                    key = (dt.year, dt.month)
                    month_data[key]["planned"].append(int(task.get("planned_progress") or 0))
                    month_data[key]["actual"].append(int(task.get("actual_progress") or 0))
                except Exception:
                    pass

        # Build the list of (year, month) buckets to return: either an explicit
        # start_date..end_date range, an N-month lookback preset, or the default.
        if start_date and end_date:
            try:
                sd = datetime.strptime(str(start_date)[:10], "%Y-%m-%d")
                ed = datetime.strptime(str(end_date)[:10], "%Y-%m-%d")
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid start_date/end_date")
            if sd > ed:
                sd, ed = ed, sd
            months_list = []
            y, m = sd.year, sd.month
            while (y, m) <= (ed.year, ed.month):
                months_list.append((y, m))
                m += 1
                if m > 12:
                    m, y = 1, y + 1
        else:
            lookback = months if months and months > 0 else CHART_LOOKBACK_MONTHS
            now = datetime.now()
            months_list = []
            for i in range(lookback, 0, -1):
                total_months = now.year * 12 + (now.month - 1) - i
                months_list.append((total_months // 12, (total_months % 12) + 1))

        multi_year = len({y for y, _ in months_list}) > 1
        result = []
        for (y, m) in months_list:
            d = month_data.get((y, m), {"planned": [], "actual": []})
            label = f"{MONTH_NAMES[m - 1]} '{str(y)[2:]}" if multi_year else MONTH_NAMES[m - 1]
            result.append({
                "month": label,
                "planned": round(sum(d["planned"]) / len(d["planned"])) if d["planned"] else 0,
                "actual":  round(sum(d["actual"])  / len(d["actual"]))  if d["actual"]  else 0,
            })

        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/kpi-trends")
def get_kpi_trends():
    """Short (6-month) trend series for the Active Workers and Safety Score KPIs,
    used to render dashboard sparklines. Budget/Schedule sparklines are derived
    client-side from the existing costs/progress chart series."""
    try:
        SPARK_MONTHS = 6
        now = datetime.now()
        months_list = []
        for i in range(SPARK_MONTHS - 1, -1, -1):
            total_months = now.year * 12 + (now.month - 1) - i
            months_list.append((total_months // 12, (total_months % 12) + 1))

        workforce_res = supabase.table("workforce").select("created_at").execute()
        worker_dates = []
        for w in (workforce_res.data or []):
            c = w.get("created_at")
            if c:
                try:
                    worker_dates.append(datetime.fromisoformat(str(c).replace("Z", "+00:00")).replace(tzinfo=None))
                except Exception:
                    pass

        incidents_res = supabase.table("safety_incidents").select("created_at,severity").execute()
        month_incidents: dict = defaultdict(list)
        for inc in (incidents_res.data or []):
            c = inc.get("created_at")
            if c:
                try:
                    dt = datetime.fromisoformat(str(c).replace("Z", "+00:00"))
                    month_incidents[(dt.year, dt.month)].append(str(inc.get("severity") or "").lower())
                except Exception:
                    pass

        workers_trend, safety_trend = [], []
        for (y, m) in months_list:
            month_end = (datetime(y, m, 28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            cumulative = sum(1 for d in worker_dates if d <= month_end)
            workers_trend.append({"month": MONTH_NAMES[m - 1], "value": cumulative})

            sevs = month_incidents.get((y, m), [])
            high = sum(1 for s in sevs if s == "high")
            med = sum(1 for s in sevs if s == "medium")
            low_c = len(sevs) - high - med
            score = round(max(0, 100 - high * 10 - med * 5 - low_c * 2))
            safety_trend.append({"month": MONTH_NAMES[m - 1], "value": score})

        return {"status": "success", "workers": workers_trend, "safety": safety_trend}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/costs")
def get_cost_chart():
    try:
        projects_res = supabase.table("projects").select("budget,start_date,end_date").execute()
        projects_data = projects_res.data or []
        total_budget = sum(float(p.get("budget", 0)) for p in projects_data)

        # Compute monthly budget from real project durations (same logic as cashflow chart)
        durations = []
        for p in projects_data:
            s, e = p.get("start_date"), p.get("end_date")
            if s and e:
                try:
                    sd = datetime.strptime(str(s)[:10], "%Y-%m-%d")
                    ed = datetime.strptime(str(e)[:10], "%Y-%m-%d")
                    durations.append(max(1, (ed.year - sd.year) * 12 + ed.month - sd.month))
                except Exception:
                    pass
        avg_duration = sum(durations) / len(durations) if durations else DEFAULT_AVG_DURATION_MONTHS
        monthly_budget_k = round(total_budget / avg_duration / 1000, 1) if total_budget else 0

        # Key by (year, month) to avoid cross-year collisions
        cost_res = supabase.table("cost_entries").select("amount,created_at").execute()
        month_actuals: dict = defaultdict(float)
        for c in (cost_res.data or []):
            created = c.get("created_at")
            if created:
                try:
                    dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                    month_actuals[(dt.year, dt.month)] += float(c.get("amount", 0)) / 1000
                except Exception:
                    pass

        now_dt = datetime.now()
        result = []
        for i in range(CHART_LOOKBACK_MONTHS, 0, -1):
            total_months = now_dt.year * 12 + (now_dt.month - 1) - i
            y = total_months // 12
            m = (total_months % 12) + 1
            result.append({
                "month": MONTH_NAMES[m - 1],
                "budget": monthly_budget_k,
                "actual": round(month_actuals.get((y, m), 0), 1),
            })

        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/cashflow")
def get_cashflow_chart():
    try:
        projects_res = supabase.table("projects").select("budget,start_date,end_date").execute()
        projects_data = projects_res.data or []

        total_budget = sum(float(p.get("budget", 0)) for p in projects_data)

        # Compute average project duration in months to spread inflow
        total_months = 0
        count = 0
        for p in projects_data:
            start = p.get("start_date")
            end = p.get("end_date")
            if start and end:
                try:
                    s = datetime.strptime(str(start)[:10], "%Y-%m-%d")
                    e = datetime.strptime(str(end)[:10], "%Y-%m-%d")
                    months = max(1, (e.year - s.year) * 12 + e.month - s.month)
                    total_months += months
                    count += 1
                except Exception:
                    pass
        avg_duration = total_months / count if count else DEFAULT_AVG_DURATION_MONTHS
        monthly_inflow_k = round(total_budget / avg_duration / 1000, 1) if avg_duration else 0

        # Actual outflows per (year, month) from cost_entries
        cost_res = supabase.table("cost_entries").select("amount,created_at").execute()
        costs = cost_res.data or []
        month_outflow: dict = defaultdict(float)
        for c in costs:
            created = c.get("created_at")
            if created:
                try:
                    dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                    month_outflow[(dt.year, dt.month)] += float(c.get("amount", 0)) / 1000
                except Exception:
                    pass

        # Average recent burn rate for future-month projection
        now = datetime.now()
        recent = [(y, m) for (y, m) in month_outflow
                  if (y * 12 + m) >= (now.year * 12 + now.month - 6)]
        avg_outflow_k = (sum(month_outflow[k] for k in recent) / len(recent)
                         if recent else monthly_inflow_k * BURN_RATE_MULTIPLIER)

        result = []
        past = CHART_LOOKBACK_MONTHS - 1
        for offset in range(-past, CHART_FORECAST_MONTHS + 1):
            total = now.year * 12 + (now.month - 1) + offset
            y = total // 12
            m = (total % 12) + 1
            is_future = (y, m) > (now.year, now.month)
            outflow = round(avg_outflow_k, 1) if is_future else round(month_outflow.get((y, m), 0), 1)
            result.append({
                "month": MONTH_NAMES[m - 1],
                "inflow": monthly_inflow_k,
                "outflow": outflow,
            })

        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
def get_project_alerts():
    try:
        try:
            logs_res = supabase.table("activity_log").select(
                "id,action,module,detail,created_at"
            ).order("created_at", desc=True).limit(ALERT_LIMIT).execute()
            logs = logs_res.data or []
        except Exception:
            logs = []

        alerts = []
        for log in logs:
            created = log.get("created_at", "")
            try:
                dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                now = datetime.now(dt.tzinfo)
                diff = now - dt
                if diff.total_seconds() < SECONDS_PER_HOUR:
                    time_str = f"{int(diff.total_seconds() / 60)}m ago"
                elif diff.total_seconds() < SECONDS_PER_DAY:
                    time_str = f"{int(diff.total_seconds() / SECONDS_PER_HOUR)}h ago"
                else:
                    time_str = f"{diff.days}d ago"
            except Exception:
                time_str = ""

            module = (log.get("module") or "").lower()
            alert_type = next(
                (v for k, v in MODULE_ALERT_TYPE.items() if k in module),
                "info",
            )

            alerts.append({
                "id": log.get("id"),
                "text": log.get("detail") or log.get("action", ""),
                "module": log.get("module", ""),
                "time": time_str,
                "type": alert_type,
            })

        return {"status": "success", "alerts": alerts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{project_id}")
def update_project(project_id: str, project: ProjectUpdate):
    try:
        update_data = {k: v for k, v in project.model_dump().items() if v is not None}
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success", "project": project}

@router.get("/{project_id}/cost")
def get_project_cost(project_id: str):
    try:
        data = get_cost_entries(project_id)
        return {"status": "success", "cost_entries": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/cost")
def add_cost_entry(project_id: str, entry: CostEntryCreate):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "amount": entry.amount,
            "description": entry.description,
            "category": entry.category,
            "entry_date": entry.entry_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        response = supabase.table("cost_entries").insert(data).execute()
        return {"status": "success", "cost_entry": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}/cost/{entry_id}")
def delete_cost_entry(project_id: str, entry_id: str):
    try:
        supabase.table("cost_entries").delete().eq("id", entry_id).eq("project_id", project_id).execute()
        return {"status": "success", "message": "Cost entry deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/schedule")
def get_project_schedule(project_id: str):
    try:
        data = get_schedule_tasks(project_id)
        return {"status": "success", "tasks": data}
    except Exception as e:
        logger.error("get_project_schedule failed project=%s: %s", project_id, e)
        return {"status": "error", "tasks": [], "error": str(e)}

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
        update_data = {k: v for k, v in task.model_dump().items() if v is not None}
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
        logger.error("get_project_safety failed project=%s: %s", project_id, e)
        return {"status": "error", "incidents": [], "error": str(e)}

@router.get("/{project_id}/workforce")
def get_project_workforce(project_id: str):
    try:
        data = get_workforce(project_id)
        return {"status": "success", "workforce": data}
    except Exception as e:
        logger.error("get_project_workforce failed project=%s: %s", project_id, e)
        return {"status": "error", "workforce": [], "error": str(e)}

@router.get("/{project_id}/equipment")
def get_project_equipment(project_id: str):
    try:
        data = get_equipment(project_id)
        return {"status": "success", "equipment": data}
    except Exception as e:
        logger.error("get_project_equipment failed project=%s: %s", project_id, e)
        return {"status": "error", "equipment": [], "error": str(e)}

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

@router.get("/{project_id}/purchase-orders")
def get_project_purchase_orders(project_id: str):
    try:
        data = get_purchase_orders(project_id)
        return {"status": "success", "purchase_orders": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/overview")
def get_project_overview(project_id: str):
    try:
        today = datetime.now(timezone.utc).date()
        in_7 = today + timedelta(days=7)

        def classify(items, date_field, open_statuses=None):
            overdue = next_7 = later = closed = 0
            for item in items:
                status = item.get("status", "")
                is_open = (open_statuses is None) or (status in open_statuses)
                if not is_open:
                    closed += 1
                    continue
                raw = item.get(date_field) or ""
                if not raw:
                    later += 1
                    continue
                try:
                    dt = datetime.strptime(str(raw)[:10], "%Y-%m-%d").date()
                    if dt < today:
                        overdue += 1
                    elif dt <= in_7:
                        next_7 += 1
                    else:
                        later += 1
                except Exception:
                    later += 1
            return {"overdue": overdue, "next_7": next_7, "later": later, "closed": closed, "total": len(items)}

        rfis = supabase.table("rfis").select("due_date,status").eq("project_id", project_id).execute().data or []
        submittals_raw = supabase.table("submittals").select("review_date,submitted_date,status").eq("project_id", project_id).execute().data or []
        for s in submittals_raw:
            if not s.get("review_date"):
                s["review_date"] = s.get("submitted_date")
        tasks = supabase.table("schedule_tasks").select("planned_end,status").eq("project_id", project_id).execute().data or []
        permits = supabase.table("permits").select("expiry_date,status").eq("project_id", project_id).execute().data or []
        incidents = supabase.table("safety_incidents").select("created_at,status").eq("project_id", project_id).execute().data or []
        for inc in incidents:
            raw_ts = inc.get("created_at") or ""
            inc["incident_date"] = str(raw_ts)[:10] if raw_ts else ""
        punch = supabase.table("punch_list").select("due_date,status").eq("project_id", project_id).execute().data or []
        meetings_raw = supabase.table("meeting_minutes").select("meeting_date,next_meeting").eq("project_id", project_id).execute().data or []
        for m in meetings_raw:
            m["target_date"] = m.get("next_meeting") or ""
            m["status"] = "open"

        return {
            "status": "success",
            "overview": {
                "rfi":          classify(rfis, "due_date", {"open"}),
                "submittals":   classify(submittals_raw, "review_date", {"pending", "under_review"}),
                "schedule":     classify(tasks, "planned_end", {"pending", "inprogress", "delayed", "atrisk"}),
                "inspections":  classify(permits, "expiry_date", {"Pending", "Approved"}),
                "observations": classify(incidents, "incident_date", {"open", "investigating"}),
                "punch_list":   classify(punch, "due_date", {"open"}),
                "meetings":     classify(meetings_raw, "target_date", {"open"}),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))