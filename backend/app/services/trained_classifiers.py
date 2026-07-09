import json
import logging
from collections import Counter
from pathlib import Path

logger = logging.getLogger("civilai.trained_classifiers")

_MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models"


class TrainedClassifier:
    """Generic wrapper for a scikit-learn/XGBoost classifier trained on 1+ categorical
    LabelEncoder columns followed by numeric columns, in the exact order models/train_all.py
    used. Mirrors cost_overrun_model.py's load/fallback contract so every ML endpoint behaves
    the same way: real inference when the artifacts are present, a clearly-labeled failure
    otherwise (callers fall back to a heuristic and never claim it's a model prediction)."""

    def __init__(self, model_file: str, encoder_files: list[str], report_key: str, model_version: str):
        self._model_file = model_file
        self._encoder_files = encoder_files
        self._report_key = report_key
        self._model_version = model_version
        self._model = None
        self._encoders: list = []
        self._metadata: dict = {}
        self._load_error: str | None = None

    def _load(self) -> None:
        if self._model is not None or self._load_error is not None:
            return
        try:
            import joblib
            self._model = joblib.load(_MODEL_DIR / self._model_file)
            self._encoders = [joblib.load(_MODEL_DIR / f) for f in self._encoder_files]
            report_path = _MODEL_DIR / "training_report.json"
            if report_path.exists():
                report = json.loads(report_path.read_text())
                self._metadata = report.get("models", {}).get(self._report_key, {})
        except Exception as exc:
            self._load_error = str(exc)
            logger.exception("Failed to load %s model artifacts — falling back to heuristic", self._report_key)

    def is_available(self) -> bool:
        self._load()
        return self._load_error is None

    def _encode(self, encoder, value: str) -> int:
        try:
            return int(encoder.transform([value])[0])
        except ValueError:
            fallback = Counter(encoder.classes_).most_common(1)[0][0] if len(encoder.classes_) else value
            logger.warning(
                "Unseen category %r for %s — using most-frequent training category %r",
                value, self._report_key, fallback,
            )
            return int(encoder.transform([fallback])[0])

    def predict(self, categorical_values: list[str], numeric_values: list[float], feature_names: list[str]) -> dict:
        """Raises if the model isn't loaded — callers should check is_available() first."""
        self._load()
        if self._load_error is not None:
            raise RuntimeError(f"{self._report_key} model unavailable: {self._load_error}")

        encoded = [self._encode(enc, val) for enc, val in zip(self._encoders, categorical_values)]
        row = [encoded + list(numeric_values)]

        proba = float(self._model.predict_proba(row)[0][1])
        probability = round(proba * 100, 1)
        importances = dict(zip(feature_names, [round(float(x), 4) for x in self._model.feature_importances_]))

        return {
            "probability": probability,
            "model_version": self._model_version,
            "trained_on": f"{self._metadata.get('rows', '—')}-row dataset "
                           f"(accuracy {self._metadata.get('accuracy', '—')}, "
                           f"{self._metadata.get('model_type', 'model')})",
            "feature_importances": importances,
        }
