from prefect import flow, task
from prefect.logging import get_run_logger
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier, XGBRegressor
import mlflow
import mlflow.xgboost
import mlflow.sklearn
import joblib
import os

mlflow.set_tracking_uri("sqlite:///mlflow.db")
mlflow.set_experiment("CivilAI_Construction_ML")

# ─────────────────────────────────────────
# TASKS
# ─────────────────────────────────────────

@task(name="validate_data", retries=2)
def validate_data(filepath: str, required_cols: list) -> bool:
    logger = get_run_logger()
    try:
        df = pd.read_csv(filepath)
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            logger.error(f"Missing columns: {missing}")
            return False
        null_pct = df.isnull().sum().sum() / (len(df) * len(df.columns))
        if null_pct > 0.1:
            logger.warning(f"High null rate: {null_pct:.1%}")
        logger.info(f"✅ {filepath} validated — {len(df)} rows, {len(df.columns)} cols")
        return True
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        return False

@task(name="load_data")
def load_data(filepath: str) -> pd.DataFrame:
    logger = get_run_logger()
    df = pd.read_csv(filepath)
    logger.info(f"Loaded {len(df)} rows from {filepath}")
    return df

@task(name="train_cost_overrun_model")
def train_cost_overrun(df: pd.DataFrame) -> dict:
    logger = get_run_logger()
    with mlflow.start_run(run_name="cost_overrun_pipeline_run"):
        mlflow.set_tag("pipeline", "prefect_automated")
        le = LabelEncoder()
        df["project_type_enc"] = le.fit_transform(df["project_type"])
        features = ["project_type_enc", "duration_months", "team_size",
                    "change_orders", "material_price_increase",
                    "weather_impact_days", "subcontractor_count"]
        X, y = df[features], df["overrun"]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        params = {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1, "random_state": 42}
        mlflow.log_params(params)
        model = XGBClassifier(**params, eval_metric="logloss")
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "accuracy": accuracy_score(y_test, preds),
            "f1_score": f1_score(y_test, preds),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        mlflow.log_metrics(metrics)
        mlflow.xgboost.log_model(model, "cost_overrun_model")
        joblib.dump(model, "models/saved/cost_overrun_model.pkl")
        joblib.dump(le, "models/saved/cost_overrun_encoder.pkl")
        logger.info(f"✅ Cost Overrun — Accuracy: {metrics['accuracy']:.2%}")
        return metrics

@task(name="train_delay_model")
def train_delay(df: pd.DataFrame) -> dict:
    logger = get_run_logger()
    with mlflow.start_run(run_name="delay_pipeline_run"):
        mlflow.set_tag("pipeline", "prefect_automated")
        le = LabelEncoder()
        df["project_type_enc"] = le.fit_transform(df["project_type"])
        features = ["project_type_enc", "planned_duration_days",
                    "weather_delays", "labor_shortage",
                    "material_delays", "design_changes", "subcontractor_issues"]
        X, y = df[features], df["delayed"]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        params = {"n_estimators": 100, "max_depth": 5, "learning_rate": 0.1, "random_state": 42}
        mlflow.log_params(params)
        model = XGBClassifier(**params, eval_metric="logloss")
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "accuracy": accuracy_score(y_test, preds),
            "f1_score": f1_score(y_test, preds),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        mlflow.log_metrics(metrics)
        mlflow.xgboost.log_model(model, "delay_model")
        joblib.dump(model, "models/saved/delay_prediction_model.pkl")
        joblib.dump(le, "models/saved/delay_prediction_encoder.pkl")
        logger.info(f"✅ Delay — Accuracy: {metrics['accuracy']:.2%}")
        return metrics

@task(name="train_safety_model")
def train_safety(df: pd.DataFrame) -> dict:
    logger = get_run_logger()
    with mlflow.start_run(run_name="safety_pipeline_run"):
        mlflow.set_tag("pipeline", "prefect_automated")
        le1 = LabelEncoder()
        le2 = LabelEncoder()
        df["incident_type_enc"] = le1.fit_transform(df["incident_type"])
        df["zone_enc"] = le2.fit_transform(df["zone"])
        features = ["incident_type_enc", "zone_enc", "workers_involved",
                    "ppe_worn", "training_completed", "near_miss", "month"]
        X = df[features]
        y = (df["severity"] == "Severe").astype(int)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        params = {"n_estimators": 100, "max_depth": 8, "random_state": 42}
        mlflow.log_params(params)
        model = RandomForestClassifier(**params)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "accuracy": accuracy_score(y_test, preds),
            "f1_score": f1_score(y_test, preds),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        mlflow.log_metrics(metrics)
        mlflow.sklearn.log_model(model, "safety_model")
        joblib.dump(model, "models/saved/safety_risk_model.pkl")
        joblib.dump(le1, "models/saved/safety_incident_encoder.pkl")
        joblib.dump(le2, "models/saved/safety_zone_encoder.pkl")
        logger.info(f"✅ Safety — Accuracy: {metrics['accuracy']:.2%}")
        return metrics

@task(name="train_turnover_model")
def train_turnover(df: pd.DataFrame) -> dict:
    logger = get_run_logger()
    with mlflow.start_run(run_name="turnover_pipeline_run"):
        mlflow.set_tag("pipeline", "prefect_automated")
        le = LabelEncoder()
        df["role_enc"] = le.fit_transform(df["role"])
        features = ["role_enc", "experience_years", "salary",
                    "performance_score", "safety_violations",
                    "training_hours", "overtime_hours", "tenure_months"]
        X, y = df[features], df["left_company"]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        params = {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1, "random_state": 42}
        mlflow.log_params(params)
        model = XGBClassifier(**params, eval_metric="logloss")
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "accuracy": accuracy_score(y_test, preds),
            "f1_score": f1_score(y_test, preds),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        mlflow.log_metrics(metrics)
        mlflow.xgboost.log_model(model, "turnover_model")
        joblib.dump(model, "models/saved/turnover_model.pkl")
        joblib.dump(le, "models/saved/turnover_role_encoder.pkl")
        logger.info(f"✅ Turnover — Accuracy: {metrics['accuracy']:.2%}")
        return metrics

@task(name="train_equipment_model")
def train_equipment(df: pd.DataFrame) -> dict:
    logger = get_run_logger()
    with mlflow.start_run(run_name="equipment_pipeline_run"):
        mlflow.set_tag("pipeline", "prefect_automated")
        le = LabelEncoder()
        df["equipment_type_enc"] = le.fit_transform(df["equipment_type"])
        features = ["equipment_type_enc", "age_years", "operating_hours",
                    "maintenance_count", "last_service_days_ago", "breakdowns"]
        X, y = df[features], df["failed"]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        params = {"n_estimators": 100, "max_depth": 8, "random_state": 42}
        mlflow.log_params(params)
        model = RandomForestClassifier(**params)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        proba = model.predict_proba(X_test)[:, 1]
        metrics = {
            "accuracy": accuracy_score(y_test, preds),
            "f1_score": f1_score(y_test, preds),
            "roc_auc": roc_auc_score(y_test, proba),
        }
        mlflow.log_metrics(metrics)
        mlflow.sklearn.log_model(model, "equipment_model")
        joblib.dump(model, "models/saved/equipment_failure_model.pkl")
        joblib.dump(le, "models/saved/equipment_type_encoder.pkl")
        logger.info(f"✅ Equipment — Accuracy: {metrics['accuracy']:.2%}")
        return metrics

@task(name="generate_report")
def generate_report(results: dict) -> None:
    logger = get_run_logger()
    logger.info("\n" + "="*50)
    logger.info("PIPELINE TRAINING REPORT")
    logger.info("="*50)
    for model, metrics in results.items():
        if "accuracy" in metrics:
            logger.info(f"{model}: Accuracy={metrics['accuracy']:.2%} F1={metrics['f1_score']:.3f} AUC={metrics['roc_auc']:.3f}")
        else:
            logger.info(f"{model}: R²={metrics.get('r2_score', 0):.3f}")
    avg_acc = np.mean([m["accuracy"] for m in results.values() if "accuracy" in m])
    logger.info(f"\nAverage Accuracy: {avg_acc:.2%}")
    logger.info("All models saved to models/saved/")

# ─────────────────────────────────────────
# MAIN FLOW
# ─────────────────────────────────────────

@flow(name="CivilAI_Training_Pipeline", log_prints=True)
def civilai_training_pipeline():
    logger = get_run_logger()
    logger.info("🚀 Starting CivilAI ML Training Pipeline")

    # Validate all datasets
    cost_valid = validate_data("data/raw/cost_overrun.csv",
        ["project_type", "duration_months", "overrun"])
    delay_valid = validate_data("data/raw/construction_delays.csv",
        ["project_type", "planned_duration_days", "delayed"])
    safety_valid = validate_data("data/raw/safety_incidents.csv",
        ["incident_type", "severity", "zone"])
    workforce_valid = validate_data("data/raw/workforce.csv",
        ["role", "experience_years", "left_company"])
    equipment_valid = validate_data("data/raw/equipment.csv",
        ["equipment_type", "age_years", "failed"])

    # Load data
    cost_df = load_data("data/raw/cost_overrun.csv")
    delay_df = load_data("data/raw/construction_delays.csv")
    safety_df = load_data("data/raw/safety_incidents.csv")
    workforce_df = load_data("data/raw/workforce.csv")
    equipment_df = load_data("data/raw/equipment.csv")

    # Train all models
    cost_metrics = train_cost_overrun(cost_df)
    delay_metrics = train_delay(delay_df)
    safety_metrics = train_safety(safety_df)
    turnover_metrics = train_turnover(workforce_df)
    equipment_metrics = train_equipment(equipment_df)

    # Generate report
    results = {
        "Cost Overrun": cost_metrics,
        "Delay Prediction": delay_metrics,
        "Safety Risk": safety_metrics,
        "Workforce Turnover": turnover_metrics,
        "Equipment Failure": equipment_metrics,
    }
    generate_report(results)
    logger.info("✅ Pipeline complete!")
    return results

if __name__ == "__main__":
    civilai_training_pipeline()