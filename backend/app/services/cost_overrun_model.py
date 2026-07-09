import json
import logging
from pathlib import Path
from collections import Counter

logger = logging.getLogger("civilai.cost_overrun_model")

_MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models"

# Order matters — must match models/train_all.py's `features` list exactly.
_FEATURES = [
    "project_type_enc", "duration_months", "team_size",
    "change_orders", "material_price_increase",
    "weather_impact_days", "subcontractor_count",
]

_classifier = None
_regressor = None
_encoder = None
_default_project_type = None
_metadata: dict = {}
_load_error: str | None = None


def _load():
    global _classifier, _regressor, _encoder, _default_project_type, _metadata, _load_error
    if _classifier is not None or _load_error is not None:
        return
    try:
        import joblib
        _classifier = joblib.load(_MODEL_DIR / "cost_overrun_model.pkl")
        _regressor = joblib.load(_MODEL_DIR / "cost_overrun_regression_model.pkl")
        _encoder = joblib.load(_MODEL_DIR / "cost_overrun_encoder.pkl")
        # Most-frequent training category — used as a safe stand-in whenever an
        # unseen project_type is passed in (LabelEncoder.transform raises on that).
        _default_project_type = Counter(_encoder.classes_).most_common(1)[0][0] if len(_encoder.classes_) else "Commercial"
        report_path = _MODEL_DIR / "training_report.json"
        if report_path.exists():
            report = json.loads(report_path.read_text())
            _metadata = {
                "classifier": report.get("models", {}).get("cost_overrun", {}),
                "regressor": report.get("models", {}).get("cost_overrun_regression", {}),
            }
    except Exception as exc:
        _load_error = str(exc)
        logger.exception("Failed to load cost-overrun model artifacts — falling back to heuristic")


def is_available() -> bool:
    _load()
    return _load_error is None


def reload() -> None:
    """Force the next predict() call to re-read the .pkl artifacts from disk —
    used after cost_overrun_trainer.train() writes fresh ones, so a newly
    trained model is served immediately without a process restart."""
    global _classifier, _regressor, _encoder, _default_project_type, _metadata, _load_error
    _classifier = None
    _regressor = None
    _encoder = None
    _default_project_type = None
    _metadata = {}
    _load_error = None
    _load()


def _risk_level(probability: float) -> str:
    if probability > 70:
        return "High"
    if probability > 40:
        return "Medium"
    return "Low"


def predict(data: dict) -> dict:
    """Real XGBoost inference. Raises if the model isn't loaded — callers should
    check is_available() first (ml_service falls back to the heuristic when not)."""
    _load()
    if _load_error is not None:
        raise RuntimeError(f"cost-overrun model unavailable: {_load_error}")

    project_type = data.get("project_type") or _default_project_type
    try:
        type_enc = int(_encoder.transform([project_type])[0])
    except ValueError:
        logger.warning("Unseen project_type %r — using most-frequent training category %r", project_type, _default_project_type)
        type_enc = int(_encoder.transform([_default_project_type])[0])

    row = [[
        type_enc,
        data.get("duration_months", 12),
        data.get("team_size", 20),
        data.get("change_orders", 0),
        data.get("material_price_increase", 0),
        data.get("weather_impact_days", 0),
        data.get("subcontractor_count", 0),
    ]]

    proba = float(_classifier.predict_proba(row)[0][1])
    probability = round(proba * 100, 1)
    overrun_pct = round(float(_regressor.predict(row)[0]), 1)

    importances = dict(zip(_FEATURES, [round(float(x), 4) for x in _classifier.feature_importances_]))

    real_rows = _metadata.get("classifier", {}).get("real_project_rows", 0) or 0
    real_rows_note = (
        f"including {real_rows} of your own completed project{'s' if real_rows != 1 else ''}"
        if real_rows > 0
        else "not yet retrained on this deployment's own project history"
    )
    return {
        "probability": probability,
        "will_overrun": probability > 50,
        "estimated_overrun_pct": max(overrun_pct, 0.0),
        "risk_level": _risk_level(probability),
        "model_version": "xgboost-cost-overrun-v1",
        "trained_on": f"{_metadata.get('classifier', {}).get('rows', '1,000')}-row dataset "
                       f"(accuracy {_metadata.get('classifier', {}).get('accuracy', '—')}, "
                       f"R² {_metadata.get('regressor', {}).get('r2_score', '—')}) — "
                       f"{real_rows_note}",
        "feature_importances": importances,
    }
