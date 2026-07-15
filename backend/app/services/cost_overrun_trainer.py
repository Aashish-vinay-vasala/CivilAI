"""
Trains the cost-overrun classifier + regressor and writes them as a new, permanently
retained version under ml_models/cost_overrun/versions/v{n}/, then hot-swaps the served
model by flipping ml_models/cost_overrun/active.json — no server restart required and
no prior version is ever overwritten.

Training data is always the bundled synthetic baseline (cost_overrun_baseline.csv, the
1,000-row benchmark the model originally shipped with — never mutated) plus whatever
completed projects with a real budget exist in Supabase, plus (optionally) any validated
uploaded datasets passed in via dataset_ids. The baseline keeps the model stable even
when only a handful of real/uploaded rows are available; real rows are additive signal,
not a replacement for it.

Every run is recorded in the ml_training_runs table: which datasets went in, what
hyperparameters were selected, and the resulting cross-validated + held-out metrics —
so any past version can be inspected or reactivated later via
POST /cost-overrun/versions/{version}/activate.
"""
import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger("civilai.cost_overrun_trainer")

_MODEL_ROOT = Path(__file__).resolve().parent.parent / "ml_models"
_BASELINE_CSV = _MODEL_ROOT / "cost_overrun_baseline.csv"
_VERSIONS_DIR = _MODEL_ROOT / "cost_overrun" / "versions"
_ACTIVE_JSON = _MODEL_ROOT / "cost_overrun" / "active.json"

_NUMERIC_FEATURES = [
    "duration_months", "team_size", "change_orders",
    "material_price_increase", "weather_impact_days", "subcontractor_count",
]
# Optional, nullable — most rows (baseline + most real projects) won't have an EVM
# snapshot. Left as NaN rather than defaulted to 1.0 so XGBoost's native missing-value
# handling learns "no EVM data" as its own signal instead of a fake "on track" reading.
_OPTIONAL_FEATURES = ["cpi", "spi"]
_FEATURE_COLUMNS = ["project_type_enc"] + _NUMERIC_FEATURES + _OPTIONAL_FEATURES


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


def _latest_evm_by_project(project_ids: list[str]) -> dict:
    """Latest evm_snapshots row (by snapshot_date) per project_id, if any exist."""
    from app.services.db_service import supabase

    if not project_ids:
        return {}
    res = (
        supabase.table("evm_snapshots")
        .select("project_id,snapshot_date,cpi,spi")
        .in_("project_id", project_ids)
        .order("snapshot_date", desc=True)
        .execute()
    )
    latest: dict = {}
    for row in (res.data or []):
        pid = row.get("project_id")
        if pid and pid not in latest:
            latest[pid] = {"cpi": row.get("cpi"), "spi": row.get("spi")}
    return latest


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

    evm_by_project = _latest_evm_by_project(project_ids)

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
        evm = evm_by_project.get(pid) or {}

        rows.append({
            "project_type":            "Commercial",
            "duration_months":         _duration_months(p.get("start_date"), p.get("end_date")),
            "team_size":               team_size,
            "change_orders":           change_orders,
            "material_price_increase": material_price_increase,
            "weather_impact_days":     weather_impact_days,
            "subcontractor_count":     subcontractor_count,
            "cpi":                     evm.get("cpi"),
            "spi":                     evm.get("spi"),
            "overrun":                 int(spent > total_budget),
            "overrun_pct":             round((spent / total_budget - 1) * 100, 2),
        })
    return rows


def _uploaded_rows(dataset_ids: list[str]) -> tuple[list[dict], list[dict]]:
    """Parsed rows + a dataset_sources manifest entry per validated upload requested."""
    from app.services.db_service import supabase

    if not dataset_ids:
        return [], []
    res = (
        supabase.table("ml_dataset_uploads")
        .select("id,filename,row_count,parsed_rows,status")
        .in_("id", dataset_ids)
        .execute()
    )
    rows: list[dict] = []
    sources: list[dict] = []
    for rec in (res.data or []):
        if rec.get("status") == "rejected":
            continue
        parsed = rec.get("parsed_rows") or []
        rows.extend(parsed)
        sources.append({
            "type": "uploaded", "dataset_id": rec["id"],
            "filename": rec["filename"], "rows": len(parsed),
        })
    return rows, sources


def _next_version() -> int:
    from app.services.db_service import supabase

    res = (
        supabase.table("ml_training_runs")
        .select("version")
        .eq("model_name", "cost_overrun")
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return int(res.data[0]["version"]) + 1 if res.data else 1


def train(dataset_ids: list[str] | None = None) -> dict:
    """Synchronous — run via run_in_threadpool from the route so the event loop isn't blocked."""
    import joblib
    from xgboost import XGBClassifier, XGBRegressor
    from sklearn.base import clone
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.frozen import FrozenEstimator
    from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, r2_score, roc_auc_score
    from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, cross_val_score, train_test_split
    from sklearn.preprocessing import LabelEncoder

    from app.services.db_service import supabase

    dataset_ids = dataset_ids or []

    baseline_rows = _load_baseline_rows()
    real_rows = _real_rows_from_projects()
    uploaded_rows, uploaded_sources = _uploaded_rows(dataset_ids)

    all_rows = baseline_rows + real_rows + uploaded_rows
    if len(all_rows) < 50:
        raise RuntimeError(
            f"Only {len(all_rows)} usable training rows available (baseline dataset missing?) — need at least 50."
        )

    df = pd.DataFrame(all_rows)
    for col in _NUMERIC_FEATURES + _OPTIONAL_FEATURES + ["overrun", "overrun_pct"]:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "project_type" not in df.columns:
        df["project_type"] = "Commercial"
    df["project_type"] = df["project_type"].fillna("Commercial")
    df = df.dropna(subset=["overrun", "overrun_pct"] + _NUMERIC_FEATURES).reset_index(drop=True)
    if len(df) < 50:
        raise RuntimeError(f"Only {len(df)} rows have complete required fields — need at least 50.")

    y_all = df["overrun"].astype(int)
    class_counts = np.bincount(y_all)
    if len(class_counts) < 2 or class_counts.min() < 2:
        raise RuntimeError(
            "Insufficient class balance (need at least 2 examples of both overrun and "
            "non-overrun outcomes) to cross-validate this dataset."
        )

    encoder = LabelEncoder()
    df["project_type_enc"] = encoder.fit_transform(df["project_type"])

    # 65 / 20 / 15 train / calibration / test split. train is used for hyperparameter
    # search + CV metrics, calib is reserved purely for Platt-scaling the winning model
    # (never seen during search, so calibration isn't optimistic), test is fully held out.
    df_train, df_tmp = train_test_split(df, test_size=0.35, random_state=42, stratify=y_all)
    df_calib, df_test = train_test_split(
        df_tmp, test_size=0.43, random_state=42, stratify=df_tmp["overrun"].astype(int)
    )

    X_train, y_cls_train = df_train[_FEATURE_COLUMNS], df_train["overrun"].astype(int)
    X_calib, y_cls_calib = df_calib[_FEATURE_COLUMNS], df_calib["overrun"].astype(int)
    X_test, y_cls_test = df_test[_FEATURE_COLUMNS], df_test["overrun"].astype(int)
    y_reg_test = df_test["overrun_pct"].clip(-50, 100)

    train_class_counts = np.bincount(y_cls_train)
    n_splits = max(2, min(5, int(train_class_counts.min())))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    param_dist = {
        "max_depth": [3, 4, 5, 6],
        "learning_rate": [0.03, 0.05, 0.1, 0.2],
        "n_estimators": [100, 200, 300],
        "subsample": [0.7, 0.85, 1.0],
        "colsample_bytree": [0.7, 0.85, 1.0],
    }
    search = RandomizedSearchCV(
        XGBClassifier(eval_metric="logloss", random_state=42),
        param_dist, n_iter=8, cv=cv, scoring="f1", random_state=42, n_jobs=-1,
    )
    search.fit(X_train, y_cls_train)
    best = search.best_estimator_  # the one fitted booster SHAP will explain

    cv_accuracy = cross_val_score(clone(best), X_train, y_cls_train, cv=cv, scoring="accuracy")
    cv_f1 = cross_val_score(clone(best), X_train, y_cls_train, cv=cv, scoring="f1")
    cv_roc_auc = cross_val_score(clone(best), X_train, y_cls_train, cv=cv, scoring="roc_auc")

    # Calibrate the exact fitted `best` model on a held-out slice it never trained on —
    # NOT CalibratedClassifierCV(cv=5), which would refit+ensemble 5 internal models and
    # leave no single fitted tree for SHAP to explain.
    calibrated = CalibratedClassifierCV(FrozenEstimator(best), method="sigmoid")
    calibrated.fit(X_calib, y_cls_calib)

    proba_test = calibrated.predict_proba(X_test)[:, 1]
    pred_test = (proba_test > 0.5).astype(int)
    test_accuracy = float(accuracy_score(y_cls_test, pred_test))
    test_f1 = float(f1_score(y_cls_test, pred_test))
    test_roc_auc = float(roc_auc_score(y_cls_test, proba_test)) if len(set(y_cls_test)) > 1 else None
    test_brier = float(brier_score_loss(y_cls_test, proba_test))

    # Quantile regressor gets train+calib rows (it needs no reserved calibration slice).
    X_reg_train = pd.concat([X_train, X_calib])
    y_reg_train = pd.concat([df_train["overrun_pct"], df_calib["overrun_pct"]]).clip(-50, 100)
    regressor = XGBRegressor(
        objective="reg:quantileerror", quantile_alpha=[0.1, 0.5, 0.9],
        multi_strategy="one_output_per_tree",
        n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42,
    )
    regressor.fit(X_reg_train, y_reg_train)
    # XGBoost's multi-quantile objective doesn't guarantee p10 <= p50 <= p90 — sort every
    # row's 3 outputs so the served range is never inverted (verified crossing happens in
    # practice on this exact xgboost build).
    reg_pred_test = np.sort(regressor.predict(X_test), axis=1)
    r2_p50 = float(r2_score(y_reg_test, reg_pred_test[:, 1]))

    feature_percentiles = {}
    for feat in _NUMERIC_FEATURES + _OPTIONAL_FEATURES:
        col = df[feat].dropna()
        if len(col) > 0:
            feature_percentiles[feat] = [float(np.percentile(col, 1)), float(np.percentile(col, 99))]

    version = _next_version()
    version_dir = _VERSIONS_DIR / f"v{version}"
    version_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(calibrated, version_dir / "classifier.pkl")
    joblib.dump(best, version_dir / "classifier_raw.pkl")
    joblib.dump(regressor, version_dir / "regressor.pkl")
    joblib.dump(encoder, version_dir / "encoder.pkl")

    params = {
        "best_hyperparameters": search.best_params_,
        "cv_folds": n_splits,
        "calibration_method": "sigmoid (prefit)",
        "quantiles": [0.1, 0.5, 0.9],
        "search_iterations": 8,
        "split_sizes": {"train": len(X_train), "calib": len(X_calib), "test": len(X_test)},
    }
    metrics = {
        "cv_accuracy_mean": round(float(cv_accuracy.mean()), 4), "cv_accuracy_std": round(float(cv_accuracy.std()), 4),
        "cv_f1_mean": round(float(cv_f1.mean()), 4), "cv_f1_std": round(float(cv_f1.std()), 4),
        "cv_roc_auc_mean": round(float(cv_roc_auc.mean()), 4), "cv_roc_auc_std": round(float(cv_roc_auc.std()), 4),
        "test_accuracy": round(test_accuracy, 4), "test_f1": round(test_f1, 4),
        "test_roc_auc": round(test_roc_auc, 4) if test_roc_auc is not None else None,
        "test_brier_score": round(test_brier, 4),
        "regression_r2_p50": round(r2_p50, 4),
        "feature_percentiles": feature_percentiles,
    }
    (version_dir / "params.json").write_text(json.dumps(params, indent=2))
    (version_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))

    dataset_sources = [{"type": "baseline", "rows": len(baseline_rows), "file": "cost_overrun_baseline.csv"}]
    if real_rows:
        dataset_sources.append({"type": "real_projects", "rows": len(real_rows)})
    dataset_sources.extend(uploaded_sources)
    is_baseline_only = not real_rows and not uploaded_sources

    # Self-contained summary read by cost_overrun_model.py at load time — keeps prediction
    # serving free of any Supabase dependency (it fails closed to the heuristic fallback on
    # local file errors only, never on a network call).
    manifest = {
        "version": version,
        "dataset_sources": dataset_sources,
        "total_rows": len(df),
        "is_baseline_only": is_baseline_only,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    (version_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    run_row = {
        "model_name": "cost_overrun",
        "version": version,
        "is_active": True,
        "is_baseline_only": is_baseline_only,
        "dataset_sources": dataset_sources,
        "total_rows": len(df),
        "params": params,
        "metrics": metrics,
        "artifact_dir": f"cost_overrun/versions/v{version}",
    }
    # DB is the authoritative "what happened" record — written and committed first.
    # active.json (what's actually served) is written only after this succeeds, so a
    # crash in between leaves the previous version safely still being served.
    inserted = supabase.table("ml_training_runs").insert(run_row).execute()
    run_id = inserted.data[0]["id"]
    supabase.table("ml_training_runs").update({"is_active": False}).eq(
        "model_name", "cost_overrun"
    ).neq("id", run_id).execute()

    _ACTIVE_JSON.parent.mkdir(parents=True, exist_ok=True)
    _ACTIVE_JSON.write_text(json.dumps({"version": version}))

    used_ids = [s["dataset_id"] for s in uploaded_sources]
    if used_ids:
        supabase.table("ml_dataset_uploads").update(
            {"status": "used", "used_in_run": run_id}
        ).in_("id", used_ids).execute()

    from app.services import cost_overrun_model
    cost_overrun_model.reload()

    return {
        "version": version,
        "run_id": run_id,
        "total_rows": len(df),
        "baseline_rows": len(baseline_rows),
        "real_project_rows": len(real_rows),
        "uploaded_rows": len(uploaded_rows),
        "dataset_sources": dataset_sources,
        "metrics": metrics,
        "is_baseline_only": is_baseline_only,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
