import mlflow
import mlflow.sklearn
import mlflow.xgboost
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, r2_score, mean_absolute_error
)
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier, XGBRegressor
from sklearn.preprocessing import LabelEncoder
import joblib
import os

# Setup MLflow
mlflow.set_tracking_uri("sqlite:///mlflow.db")
mlflow.set_experiment("CivilAI_Construction_ML")

os.makedirs("models/saved", exist_ok=True)

print("=" * 60)
print("CivilAI MLflow Experiment Tracking")
print("=" * 60)

# ─────────────────────────────────────────
# 1. COST OVERRUN MODEL
# ─────────────────────────────────────────
print("\n[1/6] Training Cost Overrun Model...")
with mlflow.start_run(run_name="cost_overrun_xgboost_v1"):
    mlflow.set_tag("model_type", "classification")
    mlflow.set_tag("use_case", "cost_overrun_prediction")
    mlflow.set_tag("version", "1.0.0")
    mlflow.set_tag("stage", "production")

    df = pd.read_csv("data/raw/cost_overrun.csv")
    le = LabelEncoder()
    df["project_type_enc"] = le.fit_transform(df["project_type"])
    features = ["project_type_enc", "duration_months", "team_size",
                "change_orders", "material_price_increase",
                "weather_impact_days", "subcontractor_count"]
    X, y = df[features], df["overrun"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {
        "n_estimators": 100,
        "max_depth": 6,
        "learning_rate": 0.1,
        "subsample": 0.8,
        "random_state": 42
    }
    mlflow.log_params(params)
    mlflow.log_param("features", features)
    mlflow.log_param("train_size", len(X_train))
    mlflow.log_param("test_size", len(X_test))

    model = XGBClassifier(**params, eval_metric="logloss")
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, preds),
        "precision": precision_score(y_test, preds),
        "recall": recall_score(y_test, preds),
        "f1_score": f1_score(y_test, preds),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    mlflow.log_metrics(metrics)
    mlflow.xgboost.log_model(model, "cost_overrun_model")
    joblib.dump(model, "models/saved/cost_overrun_model.pkl")
    joblib.dump(le, "models/saved/cost_overrun_encoder.pkl")
    print(f"  ✅ Accuracy: {metrics['accuracy']:.2%} | F1: {metrics['f1_score']:.3f} | AUC: {metrics['roc_auc']:.3f}")

# ─────────────────────────────────────────
# 2. COST OVERRUN REGRESSION
# ─────────────────────────────────────────
print("\n[2/6] Training Cost Overrun Regression...")
with mlflow.start_run(run_name="cost_overrun_regression_v1"):
    mlflow.set_tag("model_type", "regression")
    mlflow.set_tag("use_case", "cost_overrun_percentage")
    mlflow.set_tag("version", "1.0.0")

    df = pd.read_csv("data/raw/cost_overrun.csv")
    le2 = LabelEncoder()
    df["project_type_enc"] = le2.fit_transform(df["project_type"])
    features = ["project_type_enc", "duration_months", "team_size",
                "change_orders", "material_price_increase",
                "weather_impact_days", "subcontractor_count"]
    X = df[features]
    y = df["overrun_pct"].clip(-50, 100)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1, "random_state": 42}
    mlflow.log_params(params)

    model = XGBRegressor(**params)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    metrics = {
        "r2_score": r2_score(y_test, preds),
        "mae": mean_absolute_error(y_test, preds),
    }
    mlflow.log_metrics(metrics)
    mlflow.xgboost.log_model(model, "cost_regression_model")
    joblib.dump(model, "models/saved/cost_overrun_regression_model.pkl")
    joblib.dump(le2, "models/saved/cost_overrun_regression_encoder.pkl")
    print(f"  ✅ R²: {metrics['r2_score']:.3f} | MAE: {metrics['mae']:.2f}%")

# ─────────────────────────────────────────
# 3. DELAY PREDICTION
# ─────────────────────────────────────────
print("\n[3/6] Training Delay Prediction Model...")
with mlflow.start_run(run_name="delay_prediction_xgboost_v1"):
    mlflow.set_tag("model_type", "classification")
    mlflow.set_tag("use_case", "schedule_delay_prediction")
    mlflow.set_tag("version", "1.0.0")

    df = pd.read_csv("data/raw/construction_delays.csv")
    le3 = LabelEncoder()
    df["project_type_enc"] = le3.fit_transform(df["project_type"])
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
        "precision": precision_score(y_test, preds),
        "recall": recall_score(y_test, preds),
        "f1_score": f1_score(y_test, preds),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    mlflow.log_metrics(metrics)
    mlflow.xgboost.log_model(model, "delay_prediction_model")
    joblib.dump(model, "models/saved/delay_prediction_model.pkl")
    joblib.dump(le3, "models/saved/delay_prediction_encoder.pkl")
    print(f"  ✅ Accuracy: {metrics['accuracy']:.2%} | F1: {metrics['f1_score']:.3f} | AUC: {metrics['roc_auc']:.3f}")

# ─────────────────────────────────────────
# 4. SAFETY RISK MODEL
# ─────────────────────────────────────────
print("\n[4/6] Training Safety Risk Model...")
with mlflow.start_run(run_name="safety_risk_rf_v1"):
    mlflow.set_tag("model_type", "classification")
    mlflow.set_tag("use_case", "safety_risk_prediction")
    mlflow.set_tag("version", "1.0.0")

    df = pd.read_csv("data/raw/safety_incidents.csv")
    le4 = LabelEncoder()
    le5 = LabelEncoder()
    df["incident_type_enc"] = le4.fit_transform(df["incident_type"])
    df["zone_enc"] = le5.fit_transform(df["zone"])
    features = ["incident_type_enc", "zone_enc", "workers_involved",
                "ppe_worn", "training_completed", "near_miss", "month"]
    X = df[features]
    y = (df["severity"] == "Severe").astype(int)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {"n_estimators": 100, "max_depth": 8, "random_state": 42, "n_jobs": -1}
    mlflow.log_params(params)

    model = RandomForestClassifier(**params)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, preds),
        "precision": precision_score(y_test, preds, zero_division=0),
        "recall": recall_score(y_test, preds, zero_division=0),
        "f1_score": f1_score(y_test, preds, zero_division=0),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    mlflow.log_metrics(metrics)
    mlflow.sklearn.log_model(model, "safety_risk_model")
    joblib.dump(model, "models/saved/safety_risk_model.pkl")
    joblib.dump(le4, "models/saved/safety_incident_encoder.pkl")
    joblib.dump(le5, "models/saved/safety_zone_encoder.pkl")
    print(f"  ✅ Accuracy: {metrics['accuracy']:.2%} | F1: {metrics['f1_score']:.3f} | AUC: {metrics['roc_auc']:.3f}")

# ─────────────────────────────────────────
# 5. TURNOVER PREDICTION
# ─────────────────────────────────────────
print("\n[5/6] Training Workforce Turnover Model...")
with mlflow.start_run(run_name="turnover_xgboost_v1"):
    mlflow.set_tag("model_type", "classification")
    mlflow.set_tag("use_case", "workforce_turnover_prediction")
    mlflow.set_tag("version", "1.0.0")

    df = pd.read_csv("data/raw/workforce.csv")
    le6 = LabelEncoder()
    df["role_enc"] = le6.fit_transform(df["role"])
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
        "precision": precision_score(y_test, preds),
        "recall": recall_score(y_test, preds),
        "f1_score": f1_score(y_test, preds),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    mlflow.log_metrics(metrics)
    mlflow.xgboost.log_model(model, "turnover_model")
    joblib.dump(model, "models/saved/turnover_model.pkl")
    joblib.dump(le6, "models/saved/turnover_role_encoder.pkl")
    print(f"  ✅ Accuracy: {metrics['accuracy']:.2%} | F1: {metrics['f1_score']:.3f} | AUC: {metrics['roc_auc']:.3f}")

# ─────────────────────────────────────────
# 6. EQUIPMENT FAILURE
# ─────────────────────────────────────────
print("\n[6/6] Training Equipment Failure Model...")
with mlflow.start_run(run_name="equipment_failure_rf_v1"):
    mlflow.set_tag("model_type", "classification")
    mlflow.set_tag("use_case", "equipment_failure_prediction")
    mlflow.set_tag("version", "1.0.0")

    df = pd.read_csv("data/raw/equipment.csv")
    le7 = LabelEncoder()
    df["equipment_type_enc"] = le7.fit_transform(df["equipment_type"])
    features = ["equipment_type_enc", "age_years", "operating_hours",
                "maintenance_count", "last_service_days_ago", "breakdowns"]
    X, y = df[features], df["failed"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    params = {"n_estimators": 100, "max_depth": 8, "random_state": 42, "n_jobs": -1}
    mlflow.log_params(params)

    model = RandomForestClassifier(**params)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, preds),
        "precision": precision_score(y_test, preds, zero_division=0),
        "recall": recall_score(y_test, preds, zero_division=0),
        "f1_score": f1_score(y_test, preds, zero_division=0),
        "roc_auc": roc_auc_score(y_test, proba),
    }
    mlflow.log_metrics(metrics)
    mlflow.sklearn.log_model(model, "equipment_failure_model")
    joblib.dump(model, "models/saved/equipment_failure_model.pkl")
    joblib.dump(le7, "models/saved/equipment_type_encoder.pkl")
    print(f"  ✅ Accuracy: {metrics['accuracy']:.2%} | F1: {metrics['f1_score']:.3f} | AUC: {metrics['roc_auc']:.3f}")

print("\n" + "=" * 60)
print("✅ All 6 models trained & logged to MLflow!")
print("=" * 60)
print("\nRun: mlflow ui --port 5000")
print("Open: http://localhost:5000")