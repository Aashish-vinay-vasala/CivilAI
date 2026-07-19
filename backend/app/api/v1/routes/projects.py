import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger("civilai.projects")
from app.services.cache_service import cached_response
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
from app.core.security import get_optional_user
from app.services.scoping import visible_project_ids, owner_id_for_new_row, assert_project_access
import httpx
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions
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
# max_keepalive_connections=0 avoids a Windows socket race under concurrent
# requests sharing a pooled keep-alive connection — see db_service.py.
supabase = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SECRET_KEY,
    SyncClientOptions(httpx_client=httpx.Client(limits=httpx.Limits(max_keepalive_connections=0))),
)


def _project_dependency(project_id: str, user: dict | None = Depends(get_optional_user)) -> dict | None:
    """Shared dependency for every /{project_id}/... route: 404s if the
    caller can't see this project (wrong owner), no-ops when unauthenticated
    (demo mode / AUTH_REQUIRED off)."""
    assert_project_access(project_id, user)
    return user

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
    budget: Optional[float] = 0

class TaskUpdate(BaseModel):
    actual_progress: Optional[int] = None
    status: Optional[str] = None
    assignee: Optional[str] = None
    delay_days: Optional[int] = None
    phase: Optional[str] = None
    priority: Optional[str] = None
    budget: Optional[float] = None

@router.get("/")
def list_projects(user: dict | None = Depends(get_optional_user)):
    try:
        projects = get_projects(user)
        return {"status": "success", "projects": projects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_project(body: ProjectCreate, user: dict | None = Depends(get_optional_user)):
    try:
        data = {
            "id": str(uuid.uuid4()),
            "name": body.name,
            "location": body.location,
            "status": body.status or "active",
            "budget": body.budget or 0,
            "client": body.client,
            "owner_id": owner_id_for_new_row(user),
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
@cached_response
def get_dashboard_kpis(user: dict | None = Depends(get_optional_user)):
    try:
        ids = visible_project_ids(user)  # None = no filtering
        is_demo = ids is None or (user is not None and user.get("account_type") == "demo")

        def _scoped(table: str, select: str):
            q = supabase.table(table).select(select)
            return q.in_("project_id", ids) if ids is not None else q

        projects_q = supabase.table("projects").select("budget")
        if ids is not None:
            projects_q = projects_q.in_("id", ids)
        projects_res = projects_q.execute()
        total_budget = sum(float(p.get("budget", 0)) for p in (projects_res.data or []))

        tasks_res = _scoped("schedule_tasks", "actual_progress").execute()
        tasks = tasks_res.data or []
        avg_progress = round(sum(t.get("actual_progress", 0) for t in tasks) / len(tasks)) if tasks else 0

        workforce_res = _scoped("workforce", "id,status").execute()
        workforce = workforce_res.data or []
        active_workers = sum(1 for w in workforce if w.get("status") == "active") or len(workforce)

        incidents_res = _scoped("safety_incidents", "id,severity").execute()
        incidents = incidents_res.data or []
        incident_count = len(incidents)
        high = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "high")
        med  = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "medium")
        low_c = incident_count - high - med
        safety_score = round(max(0, 100 - high * 10 - med * 5 - low_c * 2))

        costs_res = _scoped("cost_entries", "amount").execute()
        spent_to_date = sum(float(c.get("amount", 0)) for c in (costs_res.data or []))

        # Committed = obligated but not yet paid (pending/overdue). Must match the same
        # filter used by db_service.get_projects(), /financials/live-actuals, and
        # /accounting/dashboard, or "committed spend" disagrees across pages.
        try:
            invoices_res = _scoped("invoices", "amount,status").execute()
            committed_amount = sum(
                float(inv.get("amount", 0)) for inv in (invoices_res.data or [])
                if inv.get("status") in ("pending", "overdue")
            )
        except Exception:
            committed_amount = 0.0

        # Record today's values so /charts/kpi-trends can plot a real history
        # instead of reconstructing one from unrelated row timestamps. Upserted
        # on snapshot_date (one shared row per day, no owner column), so this
        # only runs for the demo pool — a real user's private KPIs must never
        # overwrite that shared row. Never let this break the KPI response itself.
        if is_demo:
            try:
                today = datetime.now().date().isoformat()
                supabase.table("kpi_daily_snapshots").upsert({
                    "snapshot_date": today,
                    "total_budget": total_budget,
                    "spent_to_date": spent_to_date,
                    "committed_amount": committed_amount,
                    "avg_progress": avg_progress,
                    "active_workers": active_workers,
                    "safety_score": safety_score,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }, on_conflict="snapshot_date").execute()
            except Exception:
                logger.warning("Failed to record KPI snapshot", exc_info=True)

        return {
            "status": "success",
            "kpis": {
                "total_budget": total_budget,
                "spent_to_date": spent_to_date,
                "committed_amount": committed_amount,
                "avg_progress": avg_progress,
                "active_workers": active_workers,
                "safety_score": safety_score,
                "incident_count": incident_count,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/charts/progress")
@cached_response
def get_progress_chart(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    months: Optional[int] = None,
    project_id: Optional[str] = None,
    user: dict | None = Depends(get_optional_user),
):
    try:
        query = supabase.table("schedule_tasks").select(
            "planned_progress,actual_progress,planned_start,budget"
        )
        if project_id and project_id != "all":
            assert_project_access(project_id, user)
            query = query.eq("project_id", project_id)
        else:
            ids = visible_project_ids(user)
            if ids is not None:
                query = query.in_("project_id", ids) if ids else query.eq("project_id", "__none__")
        tasks_res = query.execute()
        tasks = tasks_res.data or []

        # Key by (year, month) to avoid cross-year collisions. Each task's contribution
        # is weighted by its budget (same methodology as the EVM page's calculateEVM),
        # so a $2M task moves the line more than a $20k one; tasks without a budget set
        # fall back to an unweighted average within that month.
        month_data: dict = defaultdict(lambda: {
            "w_budget": 0.0, "w_planned": 0.0, "w_actual": 0.0,
            "planned": [], "actual": [],
        })
        for task in tasks:
            start = task.get("planned_start")
            if start:
                try:
                    dt = datetime.strptime(str(start)[:10], "%Y-%m-%d")
                    key = (dt.year, dt.month)
                    planned = int(task.get("planned_progress") or 0)
                    actual = int(task.get("actual_progress") or 0)
                    budget = float(task.get("budget") or 0)
                    month_data[key]["w_budget"] += budget
                    month_data[key]["w_planned"] += budget * planned
                    month_data[key]["w_actual"] += budget * actual
                    month_data[key]["planned"].append(planned)
                    month_data[key]["actual"].append(actual)
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
            d = month_data.get((y, m), {"w_budget": 0.0, "w_planned": 0.0, "w_actual": 0.0, "planned": [], "actual": []})
            label = f"{MONTH_NAMES[m - 1]} '{str(y)[2:]}" if multi_year else MONTH_NAMES[m - 1]
            if d["w_budget"] > 0:
                planned_val = round(d["w_planned"] / d["w_budget"])
                actual_val = round(d["w_actual"] / d["w_budget"])
            else:
                planned_val = round(sum(d["planned"]) / len(d["planned"])) if d["planned"] else 0
                actual_val = round(sum(d["actual"]) / len(d["actual"])) if d["actual"] else 0
            result.append({
                "month": label,
                "planned": planned_val,
                "actual": actual_val,
            })

        return {"status": "success", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/kpi-trends")
@cached_response
def get_kpi_trends(user: dict | None = Depends(get_optional_user)):
    """Short (6-month) trend series for the Active Workers, Safety Score and
    Committed Spend KPIs, used to render dashboard sparklines. Budget/Schedule
    sparklines are derived client-side from the existing costs/progress chart series.

    Sourced from kpi_daily_snapshots — one row per calendar day, upserted by
    GET /kpis every time it's read — rather than reconstructed from unrelated
    row timestamps (workforce.created_at, invoice dates, etc). A month with no
    snapshot simply isn't emitted rather than being guessed at; once at least
    one snapshot exists, its value is carried forward (last-observation-
    carried-forward) into any later month that has no newer snapshot, since
    these are point-in-time levels, not per-month flows.

    kpi_daily_snapshots is a single shared table (no owner column) that only
    the demo pool writes to (see get_dashboard_kpis) — a real self-registered
    user has no snapshot history yet, so they get empty trend series rather
    than the demo pool's numbers."""
    if user is not None and user.get("account_type") != "demo":
        return {"status": "success", "workers": [], "safety": [], "committed": []}
    try:
        SPARK_MONTHS = 6
        now = datetime.now()
        months_list = []
        for i in range(SPARK_MONTHS - 1, -1, -1):
            total_months = now.year * 12 + (now.month - 1) - i
            months_list.append((total_months // 12, (total_months % 12) + 1))

        earliest = datetime(months_list[0][0], months_list[0][1], 1).date().isoformat()
        try:
            snap_res = supabase.table("kpi_daily_snapshots").select(
                "snapshot_date,active_workers,safety_score,committed_amount"
            ).gte("snapshot_date", earliest).order("snapshot_date").execute()
            snapshots = snap_res.data or []
        except Exception:
            snapshots = []

        # Keep the *last* snapshot seen in each (year, month) — rows arrive
        # ordered ascending by date, so a later row simply overwrites an
        # earlier one for the same month.
        by_month: dict = {}
        for s in snapshots:
            d = s.get("snapshot_date")
            if not d:
                continue
            try:
                dt = datetime.strptime(str(d)[:10], "%Y-%m-%d")
            except Exception:
                continue
            by_month[(dt.year, dt.month)] = s

        workers_trend, safety_trend, committed_trend = [], [], []
        have_data = False
        last_workers = last_safety = last_committed = 0.0
        for (y, m) in months_list:
            snap = by_month.get((y, m))
            if snap:
                have_data = True
                last_workers = snap.get("active_workers") or 0
                last_safety = snap.get("safety_score") or 0
                last_committed = float(snap.get("committed_amount") or 0)
            if not have_data:
                continue  # no snapshot yet for this or any earlier month — omit, don't guess
            workers_trend.append({"month": MONTH_NAMES[m - 1], "value": last_workers})
            safety_trend.append({"month": MONTH_NAMES[m - 1], "value": last_safety})
            committed_trend.append({"month": MONTH_NAMES[m - 1], "value": round(last_committed, 2)})

        return {
            "status": "success",
            "workers": workers_trend,
            "safety": safety_trend,
            "committed": committed_trend,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_MAX_RANGE_MONTHS = 240  # 20y sanity cap


def _months_back(n: int, now_dt: datetime, include_current: bool) -> list[tuple[int, int]]:
    base = now_dt.year * 12 + (now_dt.month - 1)
    start = base - n + 1 if include_current else base - n
    end = base if include_current else base - 1
    return [(total // 12, (total % 12) + 1) for total in range(start, end + 1)]


def _months_forward(n: int, now_dt: datetime) -> list[tuple[int, int]]:
    base = now_dt.year * 12 + (now_dt.month - 1)
    return [(total // 12, (total % 12) + 1) for total in range(base + 1, base + n + 1)]


def _month_span(start_date: str, end_date: str) -> list[tuple[int, int]] | None:
    """Inclusive list of (year, month) between two YYYY-MM-DD dates, or None if unparseable."""
    try:
        sd = datetime.strptime(str(start_date)[:10], "%Y-%m-%d")
        ed = datetime.strptime(str(end_date)[:10], "%Y-%m-%d")
    except Exception:
        return None
    if sd > ed:
        return None
    keys = []
    y, m = sd.year, sd.month
    while (y, m) <= (ed.year, ed.month):
        keys.append((y, m))
        m += 1
        if m > 12:
            m, y = 1, y + 1
        if len(keys) > _MAX_RANGE_MONTHS:
            break
    return keys


def _month_label(y: int, m: int, multi_year: bool) -> str:
    return f"{MONTH_NAMES[m - 1]} {str(y)[2:]}" if multi_year else MONTH_NAMES[m - 1]


@router.get("/charts/costs")
@cached_response
def get_cost_chart(
    months: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    user: dict | None = Depends(get_optional_user),
):
    try:
        pid = project_id if project_id and project_id != "all" else None
        if pid:
            assert_project_access(pid, user)
        ids = visible_project_ids(user) if not pid else None

        projects_query = supabase.table("projects").select("id,budget,start_date,end_date")
        if pid:
            projects_query = projects_query.eq("id", pid)
        elif ids is not None:
            projects_query = projects_query.in_("id", ids) if ids else projects_query.eq("id", "__none__")
        projects_res = projects_query.execute()
        projects_data = projects_res.data or []

        task_query = supabase.table("schedule_tasks").select("project_id,budget,planned_start,planned_end")
        if pid:
            task_query = task_query.eq("project_id", pid)
        elif ids is not None:
            task_query = task_query.in_("project_id", ids) if ids else task_query.eq("project_id", "__none__")
        tasks_data = task_query.execute().data or []
        tasks_by_project: dict = defaultdict(list)
        for t in tasks_data:
            tasks_by_project[t.get("project_id")].append(t)

        def _parse_date(s):
            if not s:
                return None
            try:
                return datetime.strptime(str(s)[:10], "%Y-%m-%d")
            except Exception:
                return None

        def _months_in_span(sd: datetime, ed: datetime) -> list:
            if ed < sd:
                sd, ed = ed, sd
            out = []
            y, m = sd.year, sd.month
            while (y, m) <= (ed.year, ed.month):
                out.append((y, m))
                m += 1
                if m > 12:
                    m, y = 1, y + 1
            return out

        def _default_span(now_dt: datetime) -> tuple:
            sd = datetime(now_dt.year, now_dt.month, 1)
            tm = now_dt.year * 12 + (now_dt.month - 1) + DEFAULT_AVG_DURATION_MONTHS - 1
            return sd, datetime(tm // 12, (tm % 12) + 1, 1)

        # Time-phase each project's real budget as a straight-line curve across real
        # dates — the standard way to build a Planned Value curve without a fully
        # cost-loaded schedule. Tasks with an explicit budget (set in the Scheduling
        # module) spread that amount evenly across their own planned_start..planned_end
        # span. Whatever's left of the project's total budget (tasks rarely account for
        # 100% of it — there's always contingency/overhead) spreads evenly across the
        # widest known real timeframe for that project, so it's always attributed to
        # real dates rather than silently dropped or dumped into a single month.
        task_budget_by_month: dict = defaultdict(float)
        for p in projects_data:
            proj_id = p.get("id")
            total_budget_p = float(p.get("budget") or 0)
            if total_budget_p <= 0:
                continue
            proj_tasks = tasks_by_project.get(proj_id, [])

            explicit_tasks = [t for t in proj_tasks if float(t.get("budget") or 0) > 0 and _parse_date(t.get("planned_start"))]
            explicit_sum = sum(float(t.get("budget") or 0) for t in explicit_tasks)
            unallocated = max(total_budget_p - explicit_sum, 0.0)

            for t in explicit_tasks:
                sd = _parse_date(t.get("planned_start"))
                ed = _parse_date(t.get("planned_end"))
                span = _months_in_span(sd, ed) if ed else [(sd.year, sd.month)]
                per_month = float(t.get("budget")) / len(span)
                for key in span:
                    task_budget_by_month[key] += per_month

            if unallocated > 0:
                # Use the widest real timeframe known for this project — its own
                # start_date/end_date plus every task's dates — so a project record
                # whose own dates are narrower than its actual task schedule (e.g. a
                # placeholder date range) doesn't cram the whole remainder into one
                # month either.
                task_dates = [d for t in proj_tasks for d in (_parse_date(t.get("planned_start")), _parse_date(t.get("planned_end"))) if d]
                candidates = [d for d in (_parse_date(p.get("start_date")), _parse_date(p.get("end_date"))) if d] + task_dates
                sd, ed = (min(candidates), max(candidates)) if candidates else _default_span(datetime.now())
                span = _months_in_span(sd, ed)
                per_month = unallocated / len(span)
                for key in span:
                    task_budget_by_month[key] += per_month

        # Key by (year, month) to avoid cross-year collisions. Bucket by the entry's
        # real transaction date (date, falling back to entry_date), never created_at —
        # created_at is just when the row was inserted (e.g. a bulk seed/import), which
        # can silently misplace real spend into the wrong month (see kpi_daily_snapshots
        # migration for the same class of bug already fixed on the KPI trend charts).
        cost_query = supabase.table("cost_entries").select("amount,date,entry_date")
        if pid:
            cost_query = cost_query.eq("project_id", pid)
        elif ids is not None:
            cost_query = cost_query.in_("project_id", ids) if ids else cost_query.eq("project_id", "__none__")
        cost_res = cost_query.execute()
        month_actuals: dict = defaultdict(float)
        for c in (cost_res.data or []):
            spent_on = c.get("date") or c.get("entry_date")
            if spent_on:
                try:
                    dt = datetime.strptime(str(spent_on)[:10], "%Y-%m-%d")
                    month_actuals[(dt.year, dt.month)] += float(c.get("amount", 0)) / 1000
                except Exception:
                    pass

        now_dt = datetime.now()
        month_keys = _month_span(start_date, end_date) if (start_date and end_date) else None
        if month_keys is None:
            n = max(1, min(months or CHART_LOOKBACK_MONTHS, _MAX_RANGE_MONTHS))
            month_keys = _months_back(n, now_dt, include_current=True)

        multi_year = len(month_keys) > 12
        result = [
            {
                "month": _month_label(y, m, multi_year),
                "budget": round(task_budget_by_month.get((y, m), 0) / 1000, 1),
                "actual": round(month_actuals.get((y, m), 0), 1),
            }
            for (y, m) in month_keys
        ]

        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/cashflow")
def get_cashflow_chart(
    months: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict | None = Depends(get_optional_user),
):
    try:
        ids = visible_project_ids(user)
        projects_query = supabase.table("projects").select("budget,start_date,end_date")
        if ids is not None:
            projects_query = projects_query.in_("id", ids) if ids else projects_query.eq("id", "__none__")
        projects_res = projects_query.execute()
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
                    proj_duration_months = max(1, (e.year - s.year) * 12 + e.month - s.month)
                    total_months += proj_duration_months
                    count += 1
                except Exception:
                    pass
        avg_duration = total_months / count if count else DEFAULT_AVG_DURATION_MONTHS
        monthly_inflow_k = round(total_budget / avg_duration / 1000, 1) if avg_duration else 0

        # Actual outflows per (year, month) from cost_entries
        cost_query = supabase.table("cost_entries").select("amount,created_at")
        if ids is not None:
            cost_query = cost_query.in_("project_id", ids) if ids else cost_query.eq("project_id", "__none__")
        cost_res = cost_query.execute()
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

        custom_keys = _month_span(start_date, end_date) if (start_date and end_date) else None
        if custom_keys is not None:
            month_keys = custom_keys
        else:
            n = max(1, min(months or CHART_LOOKBACK_MONTHS, _MAX_RANGE_MONTHS))
            month_keys = _months_back(n, now, include_current=True) + _months_forward(CHART_FORECAST_MONTHS, now)

        multi_year = len(month_keys) > 12
        result = []
        for (y, m) in month_keys:
            is_future = (y, m) > (now.year, now.month)
            outflow = round(avg_outflow_k, 1) if is_future else round(month_outflow.get((y, m), 0), 1)
            result.append({
                "month": _month_label(y, m, multi_year),
                "inflow": monthly_inflow_k,
                "outflow": outflow,
            })

        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
def get_project_alerts(user: dict | None = Depends(get_optional_user)):
    try:
        try:
            # activity_log has no project_id column (it's scoped by user_id,
            # see migration 001) — filtering it like the core-4 project-scoped
            # tables threw an "undefined column" error that was silently
            # swallowed below, so alerts always came back empty for logged-in users.
            logs_query = supabase.table("activity_log").select(
                "id,action,module,detail,created_at"
            )
            if user is not None:
                logs_query = logs_query.eq("user_id", user["id"])
            logs_res = logs_query.order("created_at", desc=True).limit(ALERT_LIMIT).execute()
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
def update_project(project_id: str, project: ProjectUpdate, _user: dict | None = Depends(_project_dependency)):
    try:
        update_data = {k: v for k, v in project.model_dump().items() if v is not None}
        response = supabase.table("projects").update(update_data).eq("id", project_id).execute()
        return {"status": "success", "project": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}")
def delete_project(project_id: str, _user: dict | None = Depends(_project_dependency)):
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
def get_project(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        project = get_project_by_id(project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success", "project": project}

@router.get("/{project_id}/cost")
def get_project_cost(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_cost_entries(project_id)
        return {"status": "success", "cost_entries": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{project_id}/cost")
def add_cost_entry(project_id: str, entry: CostEntryCreate, _user: dict | None = Depends(_project_dependency)):
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
def delete_cost_entry(project_id: str, entry_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        supabase.table("cost_entries").delete().eq("id", entry_id).eq("project_id", project_id).execute()
        return {"status": "success", "message": "Cost entry deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/schedule")
def get_project_schedule(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_schedule_tasks(project_id)
        return {"status": "success", "tasks": data}
    except Exception as e:
        logger.error("get_project_schedule failed project=%s: %s", project_id, e)
        return {"status": "error", "tasks": [], "error": str(e)}

@router.post("/{project_id}/schedule")
def add_task(project_id: str, task: TaskCreate, _user: dict | None = Depends(_project_dependency)):
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
            "budget": task.budget or 0,
        }
        response = supabase.table("schedule_tasks").insert(data).execute()
        return {"status": "success", "task": response.data[0] if response.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{project_id}/schedule/{task_id}")
def update_task(project_id: str, task_id: str, task: TaskUpdate, _user: dict | None = Depends(_project_dependency)):
    try:
        update_data = {k: v for k, v in task.model_dump().items() if v is not None}
        response = supabase.table("schedule_tasks").update(update_data).eq("id", task_id).execute()
        return {"status": "success", "task": response.data[0] if response.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{project_id}/schedule/{task_id}")
def delete_task(project_id: str, task_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        supabase.table("schedule_tasks").delete().eq("id", task_id).execute()
        return {"status": "success", "message": "Task deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/safety")
def get_project_safety(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_safety_incidents(project_id)
        return {"status": "success", "incidents": data}
    except Exception as e:
        logger.error("get_project_safety failed project=%s: %s", project_id, e)
        return {"status": "error", "incidents": [], "error": str(e)}

@router.get("/{project_id}/workforce")
def get_project_workforce(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_workforce(project_id)
        return {"status": "success", "workforce": data}
    except Exception as e:
        logger.error("get_project_workforce failed project=%s: %s", project_id, e)
        return {"status": "error", "workforce": [], "error": str(e)}

@router.get("/{project_id}/equipment")
def get_project_equipment(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_equipment(project_id)
        return {"status": "success", "equipment": data}
    except Exception as e:
        logger.error("get_project_equipment failed project=%s: %s", project_id, e)
        return {"status": "error", "equipment": [], "error": str(e)}

@router.get("/{project_id}/contracts")
def get_project_contracts(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_contracts(project_id)
        return {"status": "success", "contracts": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/permits")
def get_project_permits(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_permits(project_id)
        return {"status": "success", "permits": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/purchase-orders")
def get_project_purchase_orders(project_id: str, _user: dict | None = Depends(_project_dependency)):
    try:
        data = get_purchase_orders(project_id)
        return {"status": "success", "purchase_orders": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/overview")
def get_project_overview(project_id: str, _user: dict | None = Depends(_project_dependency)):
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