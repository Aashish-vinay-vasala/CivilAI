import logging

logger = logging.getLogger(__name__)


def _risk_level(probability: float) -> str:
    if probability > 70:
        return "High"
    if probability > 40:
        return "Medium"
    return "Low"


async def predict_cost_overrun(data: dict) -> dict:
    score = 30.0
    score += min(data.get("change_orders", 0) * 3.5, 25)
    score += min(data.get("material_price_increase", 0) * 1.5, 20)
    score += min(data.get("weather_impact_days", 0) * 0.7, 12)
    score += min(data.get("subcontractor_count", 0) * 1.8, 12)
    if data.get("duration_months", 12) > 24:
        score += 8
    if data.get("team_size", 20) > 50:
        score += 5
    probability = round(min(max(score, 5), 95), 1)
    will_overrun = probability > 50
    overrun_pct = round(max(0, (probability - 40) * 0.35), 1)
    return {
        "probability": probability,
        "will_overrun": will_overrun,
        "estimated_overrun_pct": overrun_pct,
        "risk_level": _risk_level(probability),
    }


async def predict_delay(data: dict) -> dict:
    score = 25.0
    score += min(data.get("weather_delays", 0) * 1.2, 20)
    score += data.get("labor_shortage", 0) * 15
    score += data.get("material_delays", 0) * 10
    score += min(data.get("design_changes", 0) * 4, 20)
    score += data.get("subcontractor_issues", 0) * 8
    if data.get("planned_duration_days", 180) > 365:
        score += 10
    probability = round(min(max(score, 5), 95), 1)
    return {
        "probability": probability,
        "will_be_delayed": probability > 45,
        "risk_level": _risk_level(probability),
    }


async def predict_safety_risk(data: dict) -> dict:
    score = 20.0
    score += min(data.get("workers_involved", 0) * 2, 20)
    score += data.get("near_miss", 0) * 12
    score -= data.get("ppe_worn", 0) * 8
    score -= data.get("training_completed", 0) * 5
    incident_type = data.get("incident_type", "")
    if incident_type in ["Fall", "Electrocution"]:
        score += 20
    elif incident_type in ["Struck-by", "Caught-in"]:
        score += 15
    probability = round(min(max(score, 10), 95), 1)
    return {
        "probability": probability,
        "severe_risk": probability > 60,
        "risk_level": _risk_level(probability),
    }


async def predict_turnover(data: dict) -> dict:
    score = 25.0
    salary = data.get("salary", 80000)
    if salary < 60000:
        score += 15
    elif salary < 80000:
        score += 8
    score += min(data.get("overtime_hours", 0) * 0.8, 15)
    score += data.get("safety_violations", 0) * 5
    score -= min(data.get("training_hours", 0) * 0.5, 15)
    score -= min(data.get("experience_years", 0) * 1.5, 15)
    perf = data.get("performance_score", 3.0)
    if perf < 2.5:
        score += 20
    elif perf > 4.0:
        score -= 10
    probability = round(min(max(score, 10), 95), 1)
    return {
        "probability": probability,
        "will_leave": probability > 45,
        "risk_level": _risk_level(probability),
    }


async def predict_equipment_failure(data: dict) -> dict:
    score = 15.0
    score += min(data.get("age_years", 0) * 3, 20)
    score += min(data.get("operating_hours", 0) / 200, 15)
    score += min(data.get("last_service_days_ago", 0) * 0.3, 20)
    score += data.get("breakdowns", 0) * 8
    score -= min(data.get("maintenance_count", 0) * 2, 10)
    probability = round(min(max(score, 5), 95), 1)
    return {
        "probability": probability,
        "will_fail": probability > 50,
        "risk_level": _risk_level(probability),
    }


_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        from app.config import settings
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
    return _supabase_client


async def get_material_prices() -> list:
    try:
        sb = _get_supabase()
        res = sb.table("material_prices").select(
            "material,price,unit,change_pct,year"
        ).order("year", desc=True).execute()
        if res.data:
            return res.data
    except Exception:
        logger.exception("get_material_prices: Supabase query failed, returning fallback")
    return [
        {"material": "Concrete", "price": 95.50,  "unit": "m³",  "change_pct": 3.2,  "year": 2025},
        {"material": "Steel",    "price": 850.00,  "unit": "ton", "change_pct": -1.5, "year": 2025},
        {"material": "Lumber",   "price": 0.65,    "unit": "bf",  "change_pct": 8.4,  "year": 2025},
        {"material": "Copper",   "price": 9.80,    "unit": "kg",  "change_pct": 5.1,  "year": 2025},
        {"material": "Asphalt",  "price": 75.00,   "unit": "ton", "change_pct": 2.8,  "year": 2025},
    ]


async def get_safety_stats() -> dict:
    from datetime import datetime, date, timezone
    from collections import defaultdict

    _NEAR_MISS_TYPES = {"near miss", "near-miss", "near_miss", "nearmiss"}
    _CAT_KEYWORDS: dict = {
        "PPE":        ["ppe", "hard hat", "harness", "personal protective", "glove", "vest"],
        "Fall":       ["fall", "height", "scaffold", "ladder", "roof", "elevated"],
        "Electrical": ["electrical", "electrocution", "shock", "wiring", "arc flash"],
        "Fire":       ["fire", "burn", "explosion", "flammable", "ignition"],
        "Equipment":  ["equipment", "machinery", "crane", "forklift", "vehicle", "machine"],
        "Chemical":   ["chemical", "hazmat", "spill", "toxic", "gas", "fume"],
    }

    def _matches(incident: dict, keywords: list[str]) -> bool:
        haystack = (
            str(incident.get("type") or "").lower()
            + " "
            + str(incident.get("description") or "").lower()
        )
        return any(kw in haystack for kw in keywords)

    def _is_near_miss(incident: dict) -> bool:
        t = str(incident.get("type") or "").lower().strip()
        d = str(incident.get("description") or "").lower()
        return t in _NEAR_MISS_TYPES or "near miss" in d or "near-miss" in d

    try:
        sb = _get_supabase()
        incidents_res = sb.table("safety_incidents").select("*").execute()
        incidents = incidents_res.data or []
        total = len(incidents)

        # --- severity counts ---
        high  = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "high")
        med   = sum(1 for i in incidents if str(i.get("severity") or "").lower() == "medium")
        low_c = total - high - med

        # --- near-miss (real count from type/description) ---
        near_miss_count = sum(1 for i in incidents if _is_near_miss(i))

        # --- open violations ---
        open_violations = sum(
            1 for i in incidents
            if str(i.get("status") or "").lower() in ("open", "investigating")
        )

        # --- PPE issues ---
        ppe_issues = sum(1 for i in incidents if _matches(i, _CAT_KEYWORDS["PPE"]))

        # --- safety score: proper deduction formula (not incident/worker ratio) ---
        score = 100.0 - high * 10 - med * 5 - low_c * 2
        safety_score = max(0.0, round(score, 1))

        # --- near-miss rate: % of incidents that are near-misses ---
        near_miss_rate = round(near_miss_count / max(total, 1) * 100, 1)

        # --- PPE compliance: inverse of PPE-related incidents ---
        ppe_compliance_rate = round(max(0.0, 100 - ppe_issues / max(total, 1) * 100), 1)

        # --- days without incident ---
        date_strs = [
            str(i.get("created_at") or i.get("date") or "")[:10]
            for i in incidents
        ]
        date_strs = [d for d in date_strs if len(d) == 10]
        if date_strs:
            last_date = max(date_strs)
            last_dt = datetime.strptime(last_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            days_without_incident = (datetime.now(timezone.utc) - last_dt).days
        else:
            days_without_incident = 0

        # --- monthly incidents (last 6 months, real near-miss per month) ---
        monthly: dict = defaultdict(lambda: {"incidents": 0, "near_miss": 0})
        for i in incidents:
            raw = str(i.get("created_at") or i.get("date") or "")[:7]
            if len(raw) == 7:
                monthly[raw]["incidents"] += 1
                if _is_near_miss(i):
                    monthly[raw]["near_miss"] += 1

        monthly_incidents = [
            {
                "month_key": k,
                "year": int(k[:4]),
                "month": int(k[5:7]),
                "incidents": v["incidents"],
                "near_miss": v["near_miss"],
            }
            for k, v in sorted(monthly.items())
        ][-6:]

        # --- zone risk scores (from zone/location column on incidents) ---
        zone_buckets: dict = defaultdict(lambda: {"total": 0, "high": 0, "med": 0})
        for i in incidents:
            z = str(i.get("zone") or i.get("location") or "").strip()
            if not z or z.lower() in ("", "none", "null"):
                z = "Unassigned"
            zone_buckets[z]["total"] += 1
            sev = str(i.get("severity") or "").lower()
            if sev == "high":
                zone_buckets[z]["high"] += 1
            elif sev == "medium":
                zone_buckets[z]["med"] += 1

        zone_risk_scores: dict = {}
        for z, b in zone_buckets.items():
            raw_risk = (b["high"] * 3 + b["med"] * 1.5 + (b["total"] - b["high"] - b["med"])) / max(total, 1) * 100
            zone_risk_scores[z] = min(100, round(raw_risk))

        # --- per-category compliance for radar chart ---
        category_compliance: dict = {}
        for cat, kws in _CAT_KEYWORDS.items():
            cat_count = sum(1 for i in incidents if _matches(i, kws))
            category_compliance[cat] = max(0.0, round(100 - cat_count / max(total, 1) * 100, 1))

        # --- inter-module: equipment at risk ---
        # Equipment table uses: Operational | Needs Service | Critical | Inactive
        try:
            equip_res = sb.table("equipment").select("status,health_score").execute()
            equipment = equip_res.data or []
            equipment_at_risk = sum(
                1 for e in equipment
                if str(e.get("status") or "").lower() in ("critical", "inactive")
                or int(e.get("health_score") or 100) < 50
            )
        except Exception:
            equipment_at_risk = 0

        # --- inter-module: permit violations (rejected or past expiry date) ---
        # Permits table uses: Pending | Approved | Rejected
        try:
            today_str = date.today().isoformat()
            permits_res = sb.table("permits").select("status,expiry_date").execute()
            permit_violations = sum(
                1 for p in (permits_res.data or [])
                if str(p.get("status") or "").lower() == "rejected"
                or (p.get("expiry_date") and str(p.get("expiry_date"))[:10] < today_str)
            )
        except Exception:
            permit_violations = 0

        # --- inter-module: active workers ---
        try:
            workers_res = sb.table("workforce").select("status").execute()
            active_workers = sum(
                1 for w in (workers_res.data or [])
                if str(w.get("status") or "").lower() == "active"
            )
        except Exception:
            active_workers = 0

        return {
            "total_incidents":       total,
            "near_miss_count":       near_miss_count,
            "near_miss_rate":        near_miss_rate,
            "open_violations":       open_violations,
            "days_without_incident": days_without_incident,
            "safety_score":          safety_score,
            "high_risk_count":       high,
            "ppe_compliance_rate":   ppe_compliance_rate,
            "incident_rate":         round(total / max(active_workers, 1) * 100, 1),
            "monthly_incidents":     monthly_incidents,
            "zone_risk_scores":      zone_risk_scores,
            "category_compliance":   category_compliance,
            "equipment_at_risk":     equipment_at_risk,
            "permit_violations":     permit_violations,
            "active_workers":        active_workers,
        }
    except Exception:
        logger.exception("get_safety_stats: Supabase query failed")
        return {
            "total_incidents": 0, "near_miss_count": 0, "near_miss_rate": 0,
            "open_violations": 0, "days_without_incident": 0, "safety_score": 0,
            "high_risk_count": 0, "ppe_compliance_rate": 0, "incident_rate": 0,
            "monthly_incidents": [], "zone_risk_scores": {}, "category_compliance": {},
            "equipment_at_risk": 0, "permit_violations": 0, "active_workers": 0,
        }


async def get_delay_stats() -> dict:
    try:
        sb = _get_supabase()
        tasks_res = sb.table("schedule_tasks").select("delay_days,status,actual_progress,planned_progress").execute()
        tasks = tasks_res.data or []
        total = len(tasks)

        delayed = sum(1 for t in tasks if (t.get("delay_days") or 0) > 0 or t.get("status") == "delayed")
        on_time = total - delayed
        avg_delay = (
            sum(float(t.get("delay_days") or 0) for t in tasks if (t.get("delay_days") or 0) > 0)
            / max(delayed, 1)
        )

        projects_res = sb.table("projects").select("id").execute()
        project_count = len(projects_res.data or [])

        return {
            "delay_rate_pct": round(delayed / max(total, 1) * 100, 1),
            "avg_delay_days": round(avg_delay, 1),
            "avg_cost_overrun_pct": 0,
            "on_time_completion_pct": round(on_time / max(total, 1) * 100, 1),
            "total_projects": project_count,
        }
    except Exception:
        logger.exception("get_delay_stats: Supabase query failed")
        return {
            "delay_rate_pct": 0, "avg_delay_days": 0,
            "avg_cost_overrun_pct": 0, "on_time_completion_pct": 0, "total_projects": 0,
        }


async def get_workforce_stats() -> dict:
    try:
        sb = _get_supabase()
        res = sb.table("workforce").select("*").execute()
        workers = res.data or []
        total = len(workers)

        active = sum(1 for w in workers if w.get("status") == "active")
        total_hours = sum(float(w.get("hours_worked") or 0) for w in workers)
        avg_hours = round(total_hours / max(total, 1), 1)
        overtime_workers = sum(1 for w in workers if float(w.get("hours_worked") or 0) > 45)

        return {
            "turnover_rate_pct": round((total - active) / max(total, 1) * 100, 1),
            "avg_performance_score": 0,
            "avg_satisfaction": 0,
            "overtime_rate_pct": round(overtime_workers / max(total, 1) * 100, 1),
            "total_workers": total,
            "active_workers": active,
            "avg_hours_worked": avg_hours,
        }
    except Exception:
        logger.exception("get_workforce_stats: Supabase query failed")
        return {
            "turnover_rate_pct": 0, "avg_performance_score": 0,
            "avg_satisfaction": 0, "overtime_rate_pct": 0, "total_workers": 0,
        }


async def get_equipment_stats() -> dict:
    try:
        sb = _get_supabase()
        res = sb.table("equipment").select("health_score,status").execute()
        equipment = res.data or []
        total = len(equipment)

        scores = [int(e.get("health_score") or 0) for e in equipment if e.get("health_score") is not None]
        avg_health = round(sum(scores) / max(len(scores), 1), 1)

        failed = sum(1 for e in equipment if (e.get("status") or "").lower() in ("breakdown", "failed", "out of service"))
        operational = sum(1 for e in equipment if (e.get("status") or "").lower() == "operational")

        return {
            "avg_health_score": avg_health,
            "failure_rate_pct": round(failed / max(total, 1) * 100, 1),
            "avg_utilization_pct": round(operational / max(total, 1) * 100, 1),
            "maintenance_compliance_pct": 0,
            "total_equipment": total,
        }
    except Exception:
        logger.exception("get_equipment_stats: Supabase query failed")
        return {
            "avg_health_score": 0, "failure_rate_pct": 0,
            "avg_utilization_pct": 0, "maintenance_compliance_pct": 0, "total_equipment": 0,
        }


_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


async def get_performance_trend(months: int = 6) -> list:
    """Return monthly cost/schedule/safety/compliance performance scores for the last N months."""
    from datetime import datetime, timezone
    from collections import defaultdict

    try:
        sb = _get_supabase()
        now = datetime.now(timezone.utc)

        # Build ordered (year, month) keys for the window
        month_keys = []
        for i in range(months - 1, -1, -1):
            total = now.year * 12 + (now.month - 1) - i
            y = total // 12
            m = (total % 12) + 1
            month_keys.append((y, m))

        # Fetch all tables in parallel-ish (sync Supabase client)
        projects_res = sb.table("projects").select("budget,start_date,end_date").execute()
        cost_res     = sb.table("cost_entries").select("amount,created_at").execute()
        tasks_res    = sb.table("schedule_tasks").select(
            "actual_progress,planned_progress,planned_start,delay_days,status"
        ).execute()
        incidents_res = sb.table("safety_incidents").select("severity,created_at").execute()
        permits_res   = sb.table("permits").select("status,created_at").execute()

        projects  = projects_res.data or []
        costs     = cost_res.data or []
        tasks     = tasks_res.data or []
        incidents = incidents_res.data or []
        permits   = permits_res.data or []

        # Monthly budget: total budget / avg project duration
        total_budget = sum(float(p.get("budget", 0)) for p in projects)
        durations = []
        for p in projects:
            s, e = p.get("start_date"), p.get("end_date")
            if s and e:
                try:
                    sd = datetime.strptime(str(s)[:10], "%Y-%m-%d")
                    ed = datetime.strptime(str(e)[:10], "%Y-%m-%d")
                    durations.append(max(1, (ed.year - sd.year) * 12 + ed.month - sd.month))
                except Exception:
                    pass
        avg_duration = sum(durations) / len(durations) if durations else 12
        monthly_budget = total_budget / max(avg_duration, 1)

        # --- Monthly cost spend ---
        monthly_spend: dict = defaultdict(float)
        for c in costs:
            raw = c.get("created_at")
            if raw:
                try:
                    dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                    monthly_spend[(dt.year, dt.month)] += float(c.get("amount", 0))
                except Exception:
                    pass

        # --- Monthly schedule performance (tasks planned to start that month) ---
        monthly_tasks: dict = defaultdict(lambda: {"actual": [], "planned": []})
        for t in tasks:
            raw = t.get("planned_start")
            if raw:
                try:
                    dt = datetime.strptime(str(raw)[:10], "%Y-%m-%d")
                    key = (dt.year, dt.month)
                    monthly_tasks[key]["actual"].append(int(t.get("actual_progress") or 0))
                    monthly_tasks[key]["planned"].append(int(t.get("planned_progress") or 100))
                except Exception:
                    pass

        # --- Monthly safety incidents ---
        monthly_incidents: dict = defaultdict(lambda: {"high": 0, "med": 0, "low": 0})
        for i in incidents:
            raw = i.get("created_at")
            if raw:
                try:
                    dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                    sev = str(i.get("severity") or "").lower()
                    key = (dt.year, dt.month)
                    if sev in ("high", "severe", "critical"):
                        monthly_incidents[key]["high"] += 1
                    elif sev in ("medium", "moderate"):
                        monthly_incidents[key]["med"] += 1
                    else:
                        monthly_incidents[key]["low"] += 1
                except Exception:
                    pass

        # --- Monthly compliance (permits) ---
        monthly_permits: dict = defaultdict(lambda: {"total": 0, "approved": 0})
        for p in permits:
            raw = p.get("created_at")
            if raw:
                try:
                    dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                    key = (dt.year, dt.month)
                    monthly_permits[key]["total"] += 1
                    if p.get("status") == "Approved":
                        monthly_permits[key]["approved"] += 1
                except Exception:
                    pass

        result = []
        for (y, m) in month_keys:
            # Cost score: 100 when on budget, lower when overspent
            spend = monthly_spend.get((y, m), 0)
            if spend == 0 or monthly_budget == 0:
                cost_score = 100
            else:
                over_pct = (spend - monthly_budget) / monthly_budget * 100
                cost_score = round(max(0, min(100, 100 - over_pct)))

            # Schedule score: avg actual vs planned for tasks in this month
            td = monthly_tasks.get((y, m))
            if td and td["actual"]:
                avg_actual  = sum(td["actual"])  / len(td["actual"])
                avg_planned = sum(td["planned"]) / len(td["planned"])
                schedule_score = round(min(100, (avg_actual / max(avg_planned, 1)) * 100))
            else:
                schedule_score = 0

            # Safety score: deduct for incidents in that month
            inc = monthly_incidents.get((y, m), {"high": 0, "med": 0, "low": 0})
            safety_score = round(max(0, 100 - inc["high"] * 15 - inc["med"] * 7 - inc["low"] * 3))

            # Compliance score: permit approval rate
            perms = monthly_permits.get((y, m), {"total": 0, "approved": 0})
            compliance_score = (
                round(perms["approved"] / perms["total"] * 100) if perms["total"] > 0 else 100
            )

            result.append({
                "month": _MONTH_NAMES[m - 1],
                "cost": cost_score,
                "schedule": schedule_score,
                "safety": safety_score,
                "compliance": compliance_score,
            })

        return result
    except Exception:
        logger.exception("get_performance_trend failed")
        return []


async def get_auto_cost_overrun() -> dict:
    """Predict cost overrun probability from real Supabase project data."""
    try:
        sb = _get_supabase()

        # Average project duration in months
        projects_res = sb.table("projects").select("start_date,end_date").execute()
        projects = projects_res.data or []
        durations = []
        for p in projects:
            s, e = p.get("start_date"), p.get("end_date")
            if s and e:
                try:
                    from datetime import datetime
                    sd = datetime.strptime(str(s)[:10], "%Y-%m-%d")
                    ed = datetime.strptime(str(e)[:10], "%Y-%m-%d")
                    durations.append(max(1, (ed.year - sd.year) * 12 + ed.month - sd.month))
                except Exception:
                    pass
        avg_duration = round(sum(durations) / max(len(durations), 1)) if durations else 12

        # Active workforce (team size)
        workforce_res = sb.table("workforce").select("status,role").execute()
        workforce = workforce_res.data or []
        team_size = sum(1 for w in workforce if w.get("status") == "active") or max(len(workforce), 1)
        subcontractors = sum(
            1 for w in workforce
            if any(k in str(w.get("role") or "").lower() for k in ("sub", "contract", "vendor"))
        ) or 3

        # Change orders from open RFIs
        rfis_res = sb.table("rfis").select("id").execute()
        change_orders = len(rfis_res.data or [])

        # Material price increase from material_prices table
        prices_res = sb.table("material_prices").select("change_pct").execute()
        price_changes = [abs(float(p.get("change_pct", 0))) for p in (prices_res.data or []) if p.get("change_pct")]
        material_price_increase = round(sum(price_changes) / max(len(price_changes), 1), 1) if price_changes else 5.0

        # Weather-related incidents as proxy for weather impact days
        incidents_res = sb.table("safety_incidents").select("description,type").execute()
        weather_days = sum(
            1 for i in (incidents_res.data or [])
            if "weather" in str(i.get("description") or "").lower()
            or "weather" in str(i.get("type") or "").lower()
        )

        inputs = {
            "project_type": "Commercial",
            "duration_months": max(avg_duration, 6),
            "team_size": team_size,
            "change_orders": change_orders,
            "material_price_increase": material_price_increase,
            "weather_impact_days": weather_days,
            "subcontractor_count": subcontractors,
        }
        result = await predict_cost_overrun(inputs)
        result["inputs"] = inputs
        return result
    except Exception:
        logger.exception("get_auto_cost_overrun failed")
        return {
            "probability": 35, "will_overrun": False,
            "estimated_overrun_pct": 0, "risk_level": "Low",
            "inputs": {},
        }
