import logging

from app.services.trained_classifiers import TrainedClassifier

logger = logging.getLogger(__name__)


def _risk_level(probability: float) -> str:
    if probability > 70:
        return "High"
    if probability > 40:
        return "Medium"
    return "Low"


def _heuristic_cost_overrun_fallback(data: dict) -> dict:
    """Rule-based fallback — used only when the trained model can't be loaded.
    Never returned as if it were a real prediction: callers get model_version
    set to 'heuristic-fallback' so the distinction is visible end-to-end."""
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
        "model_version": "heuristic-fallback",
        "trained_on": None,
        "feature_importances": None,
    }


def _heuristic_delay_fallback(data: dict) -> dict:
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
        "model_version": "heuristic-fallback",
        "trained_on": None,
        "feature_importances": None,
    }


def _heuristic_safety_risk_fallback(data: dict) -> dict:
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
        "model_version": "heuristic-fallback",
        "trained_on": None,
        "feature_importances": None,
    }


def _heuristic_turnover_fallback(data: dict) -> dict:
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
        "model_version": "heuristic-fallback",
        "trained_on": None,
        "feature_importances": None,
    }


def _heuristic_equipment_failure_fallback(data: dict) -> dict:
    score = 15.0
    score += min(data.get("age_years", 0) * 3, 20)
    score += min(data.get("operating_hours", 0) / 200, 15)
    score += min(data.get("last_service_days_ago", 0) * 0.3, 20)
    score += data.get("breakdowns", 0) * 8
    score -= min(data.get("maintenance_count", 0) * 2, 10)
    probability = round(min(max(score, 5), 95), 1)
    return {
        "probability": probability,
        "model_version": "heuristic-fallback",
        "trained_on": None,
        "feature_importances": None,
    }


_delay_classifier = TrainedClassifier(
    model_file="delay_prediction_model.pkl",
    encoder_files=["delay_prediction_encoder.pkl"],
    report_key="delay_prediction",
    model_version="xgboost-delay-v1",
)
_DELAY_FEATURES = [
    "project_type_enc", "planned_duration_days", "weather_delays",
    "labor_shortage", "material_delays", "design_changes", "subcontractor_issues",
]

_safety_classifier = TrainedClassifier(
    model_file="safety_risk_model.pkl",
    encoder_files=["safety_incident_encoder.pkl", "safety_zone_encoder.pkl"],
    report_key="safety_risk",
    model_version="random-forest-safety-risk-v1",
)
_SAFETY_FEATURES = [
    "incident_type_enc", "zone_enc", "workers_involved",
    "ppe_worn", "training_completed", "near_miss", "month",
]

_turnover_classifier = TrainedClassifier(
    model_file="turnover_model.pkl",
    encoder_files=["turnover_role_encoder.pkl"],
    report_key="turnover",
    model_version="xgboost-turnover-v1",
)
_TURNOVER_FEATURES = [
    "role_enc", "experience_years", "salary", "performance_score",
    "safety_violations", "training_hours", "overtime_hours", "tenure_months",
]

_equipment_classifier = TrainedClassifier(
    model_file="equipment_failure_model.pkl",
    encoder_files=["equipment_type_encoder.pkl"],
    report_key="equipment_failure",
    model_version="random-forest-equipment-failure-v1",
)
_EQUIPMENT_FEATURES = [
    "equipment_type_enc", "age_years", "operating_hours",
    "maintenance_count", "last_service_days_ago", "breakdowns",
]


async def predict_cost_overrun(data: dict) -> dict:
    from app.services import cost_overrun_model
    if cost_overrun_model.is_available():
        try:
            return cost_overrun_model.predict(data)
        except Exception:
            logger.exception("Trained cost-overrun model failed at inference time — using heuristic fallback")
    return _heuristic_cost_overrun_fallback(data)


async def predict_delay(data: dict) -> dict:
    if _delay_classifier.is_available():
        try:
            result = _delay_classifier.predict(
                categorical_values=[data.get("project_type", "Commercial")],
                numeric_values=[
                    data.get("planned_duration_days", 180),
                    data.get("weather_delays", 0),
                    data.get("labor_shortage", 0),
                    data.get("material_delays", 0),
                    data.get("design_changes", 0),
                    data.get("subcontractor_issues", 0),
                ],
                feature_names=_DELAY_FEATURES,
            )
            result["will_be_delayed"] = result["probability"] > 45
            result["risk_level"] = _risk_level(result["probability"])
            return result
        except Exception:
            logger.exception("Trained delay model failed at inference time — using heuristic fallback")
    result = _heuristic_delay_fallback(data)
    result["will_be_delayed"] = result["probability"] > 45
    result["risk_level"] = _risk_level(result["probability"])
    return result


async def predict_safety_risk(data: dict) -> dict:
    if _safety_classifier.is_available():
        try:
            result = _safety_classifier.predict(
                categorical_values=[data.get("incident_type", ""), data.get("zone", "")],
                numeric_values=[
                    data.get("workers_involved", 0),
                    data.get("ppe_worn", 0),
                    data.get("training_completed", 0),
                    data.get("near_miss", 0),
                    data.get("month", 1),
                ],
                feature_names=_SAFETY_FEATURES,
            )
            result["severe_risk"] = result["probability"] > 60
            result["risk_level"] = _risk_level(result["probability"])
            return result
        except Exception:
            logger.exception("Trained safety-risk model failed at inference time — using heuristic fallback")
    result = _heuristic_safety_risk_fallback(data)
    result["severe_risk"] = result["probability"] > 60
    result["risk_level"] = _risk_level(result["probability"])
    return result


async def predict_turnover(data: dict) -> dict:
    if _turnover_classifier.is_available():
        try:
            result = _turnover_classifier.predict(
                categorical_values=[data.get("role", "")],
                numeric_values=[
                    data.get("experience_years", 0),
                    data.get("salary", 80000),
                    data.get("performance_score", 3.0),
                    data.get("safety_violations", 0),
                    data.get("training_hours", 0),
                    data.get("overtime_hours", 0),
                    data.get("tenure_months", 0),
                ],
                feature_names=_TURNOVER_FEATURES,
            )
            result["will_leave"] = result["probability"] > 45
            result["risk_level"] = _risk_level(result["probability"])
            return result
        except Exception:
            logger.exception("Trained turnover model failed at inference time — using heuristic fallback")
    result = _heuristic_turnover_fallback(data)
    result["will_leave"] = result["probability"] > 45
    result["risk_level"] = _risk_level(result["probability"])
    return result


async def predict_equipment_failure(data: dict) -> dict:
    if _equipment_classifier.is_available():
        try:
            result = _equipment_classifier.predict(
                categorical_values=[data.get("equipment_type", "")],
                numeric_values=[
                    data.get("age_years", 0),
                    data.get("operating_hours", 0),
                    data.get("maintenance_count", 0),
                    data.get("last_service_days_ago", 0),
                    data.get("breakdowns", 0),
                ],
                feature_names=_EQUIPMENT_FEATURES,
            )
            result["will_fail"] = result["probability"] > 50
            result["risk_level"] = _risk_level(result["probability"])
            return result
        except Exception:
            logger.exception("Trained equipment-failure model failed at inference time — using heuristic fallback")
    result = _heuristic_equipment_failure_fallback(data)
    result["will_fail"] = result["probability"] > 50
    result["risk_level"] = _risk_level(result["probability"])
    return result


_supabase_client = None


def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        import httpx
        from supabase import create_client
        from supabase.lib.client_options import SyncClientOptions
        from app.config import settings
        # max_keepalive_connections=0 avoids a Windows socket race under concurrent
        # requests sharing a pooled keep-alive connection — see db_service.py.
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SECRET_KEY,
            SyncClientOptions(httpx_client=httpx.Client(limits=httpx.Limits(max_keepalive_connections=0))),
        )
    return _supabase_client


async def get_safety_stats(project_id: str | None = None) -> dict:
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
        incidents_query = sb.table("safety_incidents").select("*")
        if project_id:
            incidents_query = incidents_query.eq("project_id", project_id)
        incidents_res = incidents_query.execute()
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
        # Prefer the incident's own `date` (when it actually happened) over
        # `created_at` (when the row was inserted) — for seeded/imported data
        # those can differ by months, which throws off every date-based stat.
        date_strs = [
            str(i.get("date") or i.get("created_at") or "")[:10]
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
        # Also tracks per-month severity/PPE/open counts so the frontend can
        # chart real month-over-month trends for safety score, PPE compliance,
        # and open violations — not just the incident/near-miss counts.
        monthly: dict = defaultdict(lambda: {
            "incidents": 0, "near_miss": 0, "high": 0, "medium": 0, "low": 0,
            "ppe": 0, "open": 0,
        })
        for i in incidents:
            raw = str(i.get("date") or i.get("created_at") or "")[:7]
            if len(raw) == 7:
                m = monthly[raw]
                m["incidents"] += 1
                if _is_near_miss(i):
                    m["near_miss"] += 1
                sev = str(i.get("severity") or "").lower()
                if sev == "high":
                    m["high"] += 1
                elif sev == "medium":
                    m["medium"] += 1
                else:
                    m["low"] += 1
                if _matches(i, _CAT_KEYWORDS["PPE"]):
                    m["ppe"] += 1
                if str(i.get("status") or "").lower() in ("open", "investigating"):
                    m["open"] += 1

        monthly_incidents = [
            {
                "month_key": k,
                "year": int(k[:4]),
                "month": int(k[5:7]),
                "incidents": v["incidents"],
                "near_miss": v["near_miss"],
                "safety_score": max(0.0, round(100 - v["high"] * 10 - v["medium"] * 5 - v["low"] * 2, 1)),
                "ppe_compliance": round(max(0.0, 100 - v["ppe"] / max(v["incidents"], 1) * 100), 1),
                "open_violations": v["open"],
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
            equip_query = sb.table("equipment").select("status,health_score")
            if project_id:
                equip_query = equip_query.eq("project_id", project_id)
            equip_res = equip_query.execute()
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
            permits_query = sb.table("permits").select("status,expiry_date")
            if project_id:
                permits_query = permits_query.eq("project_id", project_id)
            permits_res = permits_query.execute()
            permit_violations = sum(
                1 for p in (permits_res.data or [])
                if str(p.get("status") or "").lower() == "rejected"
                or (p.get("expiry_date") and str(p.get("expiry_date"))[:10] < today_str)
            )
        except Exception:
            permit_violations = 0

        # --- inter-module: active workers ---
        try:
            workers_query = sb.table("workforce").select("status")
            if project_id:
                workers_query = workers_query.eq("project_id", project_id)
            workers_res = workers_query.execute()
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


async def get_delay_stats(project_id: str | None = None) -> dict:
    try:
        sb = _get_supabase()
        tasks_query = sb.table("schedule_tasks").select("delay_days,status,actual_progress,planned_progress")
        if project_id:
            tasks_query = tasks_query.eq("project_id", project_id)
        tasks_res = tasks_query.execute()
        tasks = tasks_res.data or []
        total = len(tasks)

        delayed = sum(1 for t in tasks if (t.get("delay_days") or 0) > 0 or t.get("status") == "delayed")
        on_time = total - delayed
        avg_delay = (
            sum(float(t.get("delay_days") or 0) for t in tasks if (t.get("delay_days") or 0) > 0)
            / max(delayed, 1)
        )

        if project_id:
            project_count = 1
        else:
            projects_res = sb.table("projects").select("id").execute()
            project_count = len(projects_res.data or [])

        return {
            "delay_rate_pct": round(delayed / max(total, 1) * 100, 1),
            "avg_delay_days": round(avg_delay, 1),
            "avg_cost_overrun_pct": 0,
            "on_time_completion_pct": round(on_time / max(total, 1) * 100, 1),
            "total_projects": project_count,
            "total_tasks": total,
        }
    except Exception:
        logger.exception("get_delay_stats: Supabase query failed")
        return {
            "delay_rate_pct": 0, "avg_delay_days": 0,
            "avg_cost_overrun_pct": 0, "on_time_completion_pct": 0, "total_projects": 0,
            "total_tasks": 0,
        }


async def get_workforce_stats(project_id: str | None = None) -> dict:
    try:
        sb = _get_supabase()
        query = sb.table("workforce").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        res = query.execute()
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


async def get_equipment_stats(project_id: str | None = None) -> dict:
    try:
        sb = _get_supabase()
        query = sb.table("equipment").select("health_score,status")
        if project_id:
            query = query.eq("project_id", project_id)
        res = query.execute()
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


async def get_auto_cost_overrun(project_id: str | None = None) -> dict:
    """Predict cost overrun probability from real Supabase project data."""
    try:
        sb = _get_supabase()

        # Average project duration in months
        # Note: the projects table has no project_type column in this deployment's schema —
        # selecting it 500s the whole prediction, so it isn't requested. Every prediction
        # uses the "Commercial" default until a real project_type column/UI field exists.
        projects_query = sb.table("projects").select("start_date,end_date")
        if project_id:
            projects_query = projects_query.eq("id", project_id)
        projects_res = projects_query.execute()
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
        project_type = "Commercial"

        # Active workforce (team size)
        workforce_query = sb.table("workforce").select("status,role")
        if project_id:
            workforce_query = workforce_query.eq("project_id", project_id)
        workforce_res = workforce_query.execute()
        workforce = workforce_res.data or []
        team_size = sum(1 for w in workforce if w.get("status") == "active") or max(len(workforce), 1)
        subcontractors = sum(
            1 for w in workforce
            if any(k in str(w.get("role") or "").lower() for k in ("sub", "contract", "vendor"))
        ) or 3

        # Change orders from open RFIs
        rfis_query = sb.table("rfis").select("id")
        if project_id:
            rfis_query = rfis_query.eq("project_id", project_id)
        rfis_res = rfis_query.execute()
        change_orders = len(rfis_res.data or [])

        # Material price increase from material_prices table (global commodity data, not project-scoped)
        prices_res = sb.table("material_prices").select("change_pct").execute()
        price_changes = [abs(float(p.get("change_pct", 0))) for p in (prices_res.data or []) if p.get("change_pct")]
        material_price_increase = round(sum(price_changes) / max(len(price_changes), 1), 1) if price_changes else 5.0

        # Weather-related incidents as proxy for weather impact days
        incidents_query = sb.table("safety_incidents").select("description,type")
        if project_id:
            incidents_query = incidents_query.eq("project_id", project_id)
        incidents_res = incidents_query.execute()
        weather_days = sum(
            1 for i in (incidents_res.data or [])
            if "weather" in str(i.get("description") or "").lower()
            or "weather" in str(i.get("type") or "").lower()
        )

        inputs = {
            "project_type": project_type,
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
