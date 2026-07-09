"""
Retrains the cost-overrun classifier + regressor and hot-swaps the artifacts
that cost_overrun_model.py serves, without a server restart.

Training data is the bundled synthetic baseline (cost_overrun_baseline.csv,
same 1,000-row benchmark the models originally shipped with) plus whatever
completed projects with a real budget exist in Supabase. The baseline keeps
the model stable even when only a handful of real projects are available;
real rows are additive signal, not a replacement for it.
"""
import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("civilai.cost_overrun_trainer")

_MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models"
_BASELINE_CSV = _MODEL_DIR / "cost_overrun_baseline.csv"

_NUMERIC_FEATURES = [
    "duration_months", "team_size", "change_orders",
    "material_price_increase", "weather_impact_days", "subcontractor_count",
]
_FEATURE_COLUMNS = ["project_type_enc"] + _NUMERIC_FEATURES


def _load_baseline_rows() -> list[dict]:
    if not _BASELINE_CSV.exists():
        logger.warning("Baseline training CSV missing at %s", _BASELINE_CSV)
        return []
    with open(_BASELINE_CSV, newline="") as f:
        return list(csv.DictReader(f))


def _duration_months(start, end) -> int:
    if not start or not end:
        return 12
    try:
        sd = datetime.strptime(str(start)[:10], "%Y-%m-%d")
        ed = datetime.strptime(str(end)[:10], "%Y-%m-%d")
        return max(1, (ed.year - sd.year) * 12 + ed.month - sd.month)
    except Exception:
        return 12


def _real_rows_from_projects() -> list[dict]:
    """Derive training rows from completed projects with a real budget —
    same feature proxies get_auto_cost_overrun() uses live, kept consistent."""
    from app.services.db_service import supabase

    # Note: the projects table has no project_type column in this deployment's schema
    # (see get_auto_cost_overrun in ml_service.py) — every real row uses the "Commercial"
    # default below until a real project_type column/UI field exists.
    projects_res = supabase.table("projects").select(
        "id,budget,start_date,end_date,status"
    ).execute()
    projects = [p for p in (projects_res.data or []) if str(p.get("status") or "").lower() == "completed"]
    if not projects:
        return []
    project_ids = [p["id"] for p in projects]

    costs = supabase.table("cost_entries").select("project_id,amount").in_("project_id", project_ids).execute().data or []
    spent_by_project: dict = {}
    for c in costs:
        pid = c.get("project_id")
        spent_by_project[pid] = spent_by_project.get(pid, 0.0) + float(c.get("amount") or 0)

    workforce = supabase.table("workforce").select("project_id,status").in_("project_id", project_ids).execute().data or []
    team_by_project: dict = {}
    for w in workforce:
        pid = w.get("project_id")
        team_by_project.setdefault(pid, [0, 0])
        team_by_project[pid][1] += 1
        if w.get("status") == "active":
            team_by_project[pid][0] += 1

    contracts = supabase.table("contracts").select("project_id").in_("project_id", project_ids).execute().data or []
    contracts_by_project: dict = {}
    for c in contracts:
        pid = c.get("project_id")
        contracts_by_project[pid] = contracts_by_project.get(pid, 0) + 1

    rfis = supabase.table("rfis").select("project_id").in_("project_id", project_ids).execute().data or []
    rfis_by_project: dict = {}
    for r in rfis:
        pid = r.get("project_id")
        rfis_by_project[pid] = rfis_by_project.get(pid, 0) + 1

    incidents = supabase.table("safety_incidents").select("project_id,description,type").in_("project_id", project_ids).execute().data or []
    weather_by_project: dict = {}
    for i in incidents:
        pid = i.get("project_id")
        is_weather = (
            "weather" in str(i.get("description") or "").lower()
            or "weather" in str(i.get("type") or "").lower()
        )
        if is_weather:
            weather_by_project[pid] = weather_by_project.get(pid, 0) + 1

    prices_res = supabase.table("material_prices").select("change_pct").execute()
    price_changes = [abs(float(p["change_pct"])) for p in (prices_res.data or []) if p.get("change_pct")]
    material_price_increase = round(sum(price_changes) / len(price_changes), 1) if price_changes else 5.0

    rows = []
    for p in projects:
        pid = p["id"]
        total_budget = float(p.get("budget") or 0)
        spent = spent_by_project.get(pid, 0.0)
        if total_budget <= 0:
            continue

        active, total = team_by_project.get(pid, [0, 0])
        team_size = active or total or 1
        subcontractor_count = contracts_by_project.get(pid, 0) or 1
        change_orders = rfis_by_project.get(pid, 0)
        weather_impact_days = weather_by_project.get(pid, 0)

        rows.append({
            "project_type":            "Commercial",
            "duration_months":         _duration_months(p.get("start_date"), p.get("end_date")),
            "team_size":               team_size,
            "change_orders":           change_orders,
            "material_price_increase": material_price_increase,
            "weather_impact_days":     weather_impact_days,
            "subcontractor_count":     subcontractor_count,
            "overrun":                 int(spent > total_budget),
            "overrun_pct":             round((spent / total_budget - 1) * 100, 2),
        })
    return rows


def train() -> dict:
    """Synchronous — run via run_in_threadpool from the route so the event loop isn't blocked."""
    import pandas as pd
    import joblib
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder
    from sklearn.metrics import accuracy_score, f1_score, r2_score
    from xgboost import XGBClassifier, XGBRegressor

    baseline_rows = _load_baseline_rows()
    real_rows = _real_rows_from_projects()
    all_rows = baseline_rows + real_rows
    if len(all_rows) < 50:
        raise RuntimeError(
            f"Only {len(all_rows)} usable training rows available (baseline dataset missing?) — need at least 50."
        )

    df = pd.DataFrame(all_rows)
    for col in _NUMERIC_FEATURES + ["overrun", "overrun_pct"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["project_type", "overrun", "overrun_pct"] + _NUMERIC_FEATURES)

    encoder = LabelEncoder()
    df["project_type_enc"] = encoder.fit_transform(df["project_type"])

    X = df[_FEATURE_COLUMNS]
    y_cls = df["overrun"].astype(int)
    y_reg = df["overrun_pct"].clip(-50, 100)

    X_train, X_test, y_train, y_test = train_test_split(X, y_cls, test_size=0.2, random_state=42)
    classifier = XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss")
    classifier.fit(X_train, y_train)
    accuracy = accuracy_score(y_test, classifier.predict(X_test))
    f1 = f1_score(y_test, classifier.predict(X_test))

    Xr_train, Xr_test, yr_train, yr_test = train_test_split(X, y_reg, test_size=0.2, random_state=42)
    regressor = XGBRegressor(n_estimators=100, random_state=42)
    regressor.fit(Xr_train, yr_train)
    r2 = r2_score(yr_test, regressor.predict(Xr_test))

    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(classifier, _MODEL_DIR / "cost_overrun_model.pkl")
    joblib.dump(regressor, _MODEL_DIR / "cost_overrun_regression_model.pkl")
    joblib.dump(encoder, _MODEL_DIR / "cost_overrun_encoder.pkl")

    report_path = _MODEL_DIR / "training_report.json"
    try:
        report = json.loads(report_path.read_text()) if report_path.exists() else {"models": {}}
    except Exception:
        report = {"models": {}}
    timestamp = datetime.now(timezone.utc).isoformat()
    report["timestamp"] = timestamp
    report["models"]["cost_overrun"] = {
        "accuracy": round(float(accuracy), 4), "f1_score": round(float(f1), 4),
        "rows": len(df), "model_type": "XGBoost", "real_project_rows": len(real_rows),
    }
    report["models"]["cost_overrun_regression"] = {
        "r2_score": round(float(r2), 4), "rows": len(df),
        "model_type": "XGBoost Regressor", "real_project_rows": len(real_rows),
    }
    report_path.write_text(json.dumps(report, indent=2))

    from app.services import cost_overrun_model
    cost_overrun_model.reload()

    return {
        "total_rows": len(df),
        "baseline_rows": len(baseline_rows),
        "real_project_rows": len(real_rows),
        "accuracy": round(float(accuracy), 4),
        "f1_score": round(float(f1), 4),
        "r2_score": round(float(r2), 4),
        "trained_at": timestamp,
    }
