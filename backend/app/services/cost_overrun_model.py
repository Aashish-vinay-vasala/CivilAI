import json
import logging
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from app.services.cost_overrun_trainer import (
    _FEATURE_COLUMNS as _FEATURES,
    _NUMERIC_FEATURES,
    _OPTIONAL_FEATURES,
)

logger = logging.getLogger("civilai.cost_overrun_model")

_MODEL_ROOT = Path(__file__).resolve().parent.parent / "ml_models"
_VERSIONS_DIR = _MODEL_ROOT / "cost_overrun" / "versions"
_ACTIVE_JSON = _MODEL_ROOT / "cost_overrun" / "active.json"

_classifier = None       # calibrated wrapper — serves predict_proba
_classifier_raw = None   # prefit booster underneath the calibration — what SHAP explains
_regressor = None        # single multi-quantile model, predicts [p10, p50, p90]
_encoder = None
_explainer = None
_default_project_type = None
_manifest: dict = {}
_metrics: dict = {}
_load_error: str | None = None


def _load():
    global _classifier, _classifier_raw, _regressor, _encoder, _explainer
    global _default_project_type, _manifest, _metrics, _load_error
    if _classifier is not None or _load_error is not None:
        return
    try:
        import joblib
        import shap

        if not _ACTIVE_JSON.exists():
            raise FileNotFoundError(f"No active cost-overrun model version pointer at {_ACTIVE_JSON}")
        active = json.loads(_ACTIVE_JSON.read_text())
        version_dir = _VERSIONS_DIR / f"v{active['version']}"

        _classifier = joblib.load(version_dir / "classifier.pkl")
        _classifier_raw = joblib.load(version_dir / "classifier_raw.pkl")
        _regressor = joblib.load(version_dir / "regressor.pkl")
        _encoder = joblib.load(version_dir / "encoder.pkl")
        _explainer = shap.TreeExplainer(_classifier_raw)

        # Most-frequent training category — used as a safe stand-in whenever an
        # unseen project_type is passed in (LabelEncoder.transform raises on that).
        _default_project_type = Counter(_encoder.classes_).most_common(1)[0][0] if len(_encoder.classes_) else "Commercial"

        manifest_path = version_dir / "manifest.json"
        _manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        metrics_path = version_dir / "metrics.json"
        _metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else {}
    except Exception as exc:
        _load_error = str(exc)
        logger.exception("Failed to load cost-overrun model artifacts — falling back to heuristic")


def is_available() -> bool:
    _load()
    return _load_error is None


def reload() -> None:
    """Force the next predict() call to re-read the active version's artifacts from disk —
    used after cost_overrun_trainer.train() (or an /activate rollback) writes a new
    active.json, so the newly served version is picked up immediately without a restart."""
    global _classifier, _classifier_raw, _regressor, _encoder, _explainer
    global _default_project_type, _manifest, _metrics, _load_error
    _classifier = None
    _classifier_raw = None
    _regressor = None
    _encoder = None
    _explainer = None
    _default_project_type = None
    _manifest = {}
    _metrics = {}
    _load_error = None
    _load()


def activate_version(version: int) -> None:
    """Point active.json at a specific version directory and hot-reload predict().
    Idempotent — reactivating the already-active version is a harmless no-op rewrite."""
    version_dir = _VERSIONS_DIR / f"v{version}"
    if not version_dir.exists():
        raise FileNotFoundError(f"cost-overrun model version {version} has no artifacts at {version_dir}")
    _ACTIVE_JSON.parent.mkdir(parents=True, exist_ok=True)
    _ACTIVE_JSON.write_text(json.dumps({"version": version}))
    reload()


def _risk_level(probability: float) -> str:
    if probability > 70:
        return "High"
    if probability > 40:
        return "Medium"
    return "Low"


def _drift_warning(numeric_values: dict) -> str | None:
    """Cheap out-of-distribution flag — not a drift-monitoring dashboard, just a check
    against the 1st/99th percentile range this version was actually trained on."""
    percentiles = _metrics.get("feature_percentiles") or {}
    flagged = []
    for feat, val in numeric_values.items():
        bounds = percentiles.get(feat)
        if not bounds or val is None or (isinstance(val, float) and np.isnan(val)):
            continue
        lo, hi = bounds
        if val < lo or val > hi:
            flagged.append(feat)
    if not flagged:
        return None
    return f"Input outside this model's typical training range for: {', '.join(flagged)}"


def predict(data: dict) -> dict:
    """Real XGBoost inference. Raises if the model isn't loaded — callers should
    check is_available() first (ml_service falls back to the heuristic when not)."""
    _load()
    if _load_error is not None:
        raise RuntimeError(f"cost-overrun model unavailable: {_load_error}")

    project_type = data.get("project_type") or _default_project_type
    warnings: list[str] = []
    try:
        type_enc = int(_encoder.transform([project_type])[0])
    except ValueError:
        logger.warning("Unseen project_type %r — using most-frequent training category %r", project_type, _default_project_type)
        warnings.append(
            f"{project_type!r} was not seen during training — substituted the most-frequent "
            f"training category {_default_project_type!r}; treat this prediction's confidence accordingly."
        )
        type_enc = int(_encoder.transform([_default_project_type])[0])

    numeric_values = {
        "duration_months":         data.get("duration_months", 12),
        "team_size":                data.get("team_size", 20),
        "change_orders":            data.get("change_orders", 0),
        "material_price_increase":  data.get("material_price_increase", 0),
        "weather_impact_days":      data.get("weather_impact_days", 0),
        "subcontractor_count":      data.get("subcontractor_count", 0),
        "cpi": data.get("cpi") if data.get("cpi") is not None else np.nan,
        "spi": data.get("spi") if data.get("spi") is not None else np.nan,
    }
    row = pd.DataFrame([{"project_type_enc": type_enc, **numeric_values}], columns=_FEATURES).astype(float)

    proba = float(_classifier.predict_proba(row)[0][1])
    probability = round(proba * 100, 1)

    reg_sorted = np.sort(_regressor.predict(row), axis=1)[0]
    p10, p50, p90 = (round(max(float(x), 0.0), 1) for x in reg_sorted)

    shap_values = np.array(_explainer.shap_values(row))
    if shap_values.ndim == 3:  # (n_classes, n_samples, n_features) on some SHAP versions
        shap_values = shap_values[-1]
    factor_impacts = sorted(zip(_FEATURES, shap_values[0]), key=lambda x: abs(x[1]), reverse=True)
    explanation = [
        {
            "feature": feat,
            "impact": round(float(impact), 4),
            "direction": "increases risk" if impact > 0 else "decreases risk",
            "value": numeric_values.get(feat, type_enc if feat == "project_type_enc" else None),
        }
        for feat, impact in factor_impacts[:3] if abs(impact) > 1e-6
    ]

    drift_warning = _drift_warning({k: v for k, v in numeric_values.items() if k in _NUMERIC_FEATURES + _OPTIONAL_FEATURES})

    importances = dict(zip(_FEATURES, [round(float(x), 4) for x in _classifier_raw.feature_importances_]))

    version = _manifest.get("version", "—")
    dataset_sources = _manifest.get("dataset_sources", [])
    non_baseline_rows = sum(s.get("rows", 0) for s in dataset_sources if s.get("type") in ("real_projects", "uploaded"))
    real_rows_note = (
        f"including {non_baseline_rows} row{'s' if non_baseline_rows != 1 else ''} from this deployment's own data"
        if non_baseline_rows > 0
        else "not yet retrained on this deployment's own project history"
    )
    trained_on = (
        f"{_manifest.get('total_rows', '—')}-row dataset "
        f"(CV accuracy {_metrics.get('cv_accuracy_mean', '—')}, R² {_metrics.get('regression_r2_p50', '—')}) — "
        f"{real_rows_note}"
    )

    return {
        "probability": probability,
        "will_overrun": probability > 50,
        "estimated_overrun_pct": p50,
        "estimated_overrun_range": {"p10": p10, "p50": p50, "p90": p90},
        "risk_level": _risk_level(probability),
        "model_version": f"xgboost-cost-overrun-v{version}",
        "trained_on": trained_on,
        "feature_importances": importances,
        "explanation": explanation,
        "drift_warning": drift_warning,
        "warnings": warnings,
    }
