from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import pandas as pd
import os
import time
import sys
from datetime import datetime
sys.path.append(".")
from monitoring.prediction_logger import log_prediction

app = FastAPI(title="CivilAI ML API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load all models
models = {}
encoders = {}

try:
    models["cost_overrun"] = joblib.load("models/saved/cost_overrun_model.pkl")
    models["cost_regression"] = joblib.load("models/saved/cost_overrun_regression_model.pkl")
    encoders["cost"] = joblib.load("models/saved/cost_overrun_encoder.pkl")
    print("✅ Cost models loaded")
except Exception as e:
    print(f"❌ Cost models: {e}")

try:
    models["delay"] = joblib.load("models/saved/delay_prediction_model.pkl")
    encoders["delay"] = joblib.load("models/saved/delay_prediction_encoder.pkl")
    print("✅ Delay model loaded")
except Exception as e:
    print(f"❌ Delay model: {e}")

try:
    models["safety"] = joblib.load("models/saved/safety_risk_model.pkl")
    encoders["safety_incident"] = joblib.load("models/saved/safety_incident_encoder.pkl")
    encoders["safety_zone"] = joblib.load("models/saved/safety_zone_encoder.pkl")
    print("✅ Safety model loaded")
except Exception as e:
    print(f"❌ Safety model: {e}")

try:
    models["turnover"] = joblib.load("models/saved/turnover_model.pkl")
    encoders["turnover_role"] = joblib.load("models/saved/turnover_role_encoder.pkl")
    print("✅ Turnover model loaded")
except Exception as e:
    print(f"❌ Turnover model: {e}")

try:
    models["equipment"] = joblib.load("models/saved/equipment_failure_model.pkl")
    encoders["equipment_type"] = joblib.load("models/saved/equipment_type_encoder.pkl")
    print("✅ Equipment model loaded")
except Exception as e:
    print(f"❌ Equipment model: {e}")


@app.get("/")
def root():
    return {"message": "CivilAI ML API Running!", "models": list(models.keys())}


# ── Cost Overrun ──
class CostInput(BaseModel):
    project_type: str
    duration_months: int
    team_size: int
    change_orders: int
    material_price_increase: float
    weather_impact_days: int
    subcontractor_count: int

@app.post("/predict/cost-overrun")
def predict_cost_overrun(data: CostInput):
    try:
        start = time.time()
        pt_enc = encoders["cost"].transform([data.project_type])[0]
        features = [[pt_enc, data.duration_months, data.team_size,
                     data.change_orders, data.material_price_increase,
                     data.weather_impact_days, data.subcontractor_count]]
        prediction = models["cost_overrun"].predict(features)[0]
        probability = models["cost_overrun"].predict_proba(features)[0][1]
        overrun_pct = models["cost_regression"].predict(features)[0]
        latency = round((time.time() - start) * 1000, 2)

        result = {
            "will_overrun": bool(prediction),
            "probability": round(float(probability) * 100, 1),
            "estimated_overrun_pct": round(float(overrun_pct), 2),
            "risk_level": "High" if probability > 0.7 else "Medium" if probability > 0.4 else "Low"
        }
        log_prediction("cost_overrun", data.model_dump(), result, latency)
        return result
    except Exception as e:
        return {"error": str(e)}


# ── Delay Prediction ──
class DelayInput(BaseModel):
    project_type: str
    planned_duration_days: int
    weather_delays: int
    labor_shortage: int
    material_delays: int
    design_changes: int
    subcontractor_issues: int

@app.post("/predict/delay")
def predict_delay(data: DelayInput):
    try:
        pt_enc = encoders["delay"].transform([data.project_type])[0]
        features = [[pt_enc, data.planned_duration_days,
                     data.weather_delays, data.labor_shortage,
                     data.material_delays, data.design_changes,
                     data.subcontractor_issues]]
        prediction = models["delay"].predict(features)[0]
        probability = models["delay"].predict_proba(features)[0][1]
        return {
            "will_be_delayed": bool(prediction),
            "probability": round(float(probability) * 100, 1),
            "risk_level": "High" if probability > 0.7 else "Medium" if probability > 0.4 else "Low"
        }
    except Exception as e:
        return {"error": str(e)}


# ── Safety Risk ──
class SafetyInput(BaseModel):
    incident_type: str
    zone: str
    workers_involved: int
    ppe_worn: int
    training_completed: int
    near_miss: int
    month: int

@app.post("/predict/safety-risk")
def predict_safety_risk(data: SafetyInput):
    try:
        inc_enc = encoders["safety_incident"].transform([data.incident_type])[0]
        zone_enc = encoders["safety_zone"].transform([data.zone])[0]
        features = [[inc_enc, zone_enc, data.workers_involved,
                     data.ppe_worn, data.training_completed,
                     data.near_miss, data.month]]
        prediction = models["safety"].predict(features)[0]
        probability = models["safety"].predict_proba(features)[0][1]
        return {
            "severe_risk": bool(prediction),
            "probability": round(float(probability) * 100, 1),
            "risk_level": "High" if probability > 0.7 else "Medium" if probability > 0.4 else "Low"
        }
    except Exception as e:
        return {"error": str(e)}


# ── Turnover Prediction ──
class TurnoverInput(BaseModel):
    role: str
    experience_years: int
    salary: float
    performance_score: float
    safety_violations: int
    training_hours: int
    overtime_hours: int
    tenure_months: int

@app.post("/predict/turnover")
def predict_turnover(data: TurnoverInput):
    try:
        role_enc = encoders["turnover_role"].transform([data.role])[0]
        features = [[role_enc, data.experience_years, data.salary,
                     data.performance_score, data.safety_violations,
                     data.training_hours, data.overtime_hours,
                     data.tenure_months]]
        prediction = models["turnover"].predict(features)[0]
        probability = models["turnover"].predict_proba(features)[0][1]
        return {
            "will_leave": bool(prediction),
            "probability": round(float(probability) * 100, 1),
            "risk_level": "High" if probability > 0.7 else "Medium" if probability > 0.4 else "Low"
        }
    except Exception as e:
        return {"error": str(e)}


# ── Equipment Failure ──
class EquipmentInput(BaseModel):
    equipment_type: str
    age_years: int
    operating_hours: int
    maintenance_count: int
    last_service_days_ago: int
    breakdowns: int

@app.post("/predict/equipment-failure")
def predict_equipment_failure(data: EquipmentInput):
    try:
        eq_enc = encoders["equipment_type"].transform([data.equipment_type])[0]
        features = [[eq_enc, data.age_years, data.operating_hours,
                     data.maintenance_count, data.last_service_days_ago,
                     data.breakdowns]]
        prediction = models["equipment"].predict(features)[0]
        probability = models["equipment"].predict_proba(features)[0][1]
        return {
            "will_fail": bool(prediction),
            "probability": round(float(probability) * 100, 1),
            "risk_level": "High" if probability > 0.7 else "Medium" if probability > 0.4 else "Low"
        }
    except Exception as e:
        return {"error": str(e)}


# ── Material Prices ──
@app.get("/data/material-prices")
def get_material_prices():
    try:
        dfs = []
        for material in ["cement", "steel", "lumber", "copper"]:
            df = pd.read_csv(f"data/raw/{material}_prices.csv")
            dfs.append(df)
        combined = pd.concat(dfs)
        return combined.to_dict(orient="records")
    except Exception as e:
        return {"error": str(e)}


# ── Safety Stats ──
@app.get("/data/safety-stats")
def get_safety_stats():
    try:
        df = pd.read_csv("data/raw/safety_incidents.csv")
        monthly = df.groupby(["year", "month"]).size().reset_index(name="incidents")
        by_type = df["incident_type"].value_counts().to_dict()
        by_severity = df["severity"].value_counts().to_dict()
        by_zone = df.groupby("zone")["risk_score"].mean().round(1).to_dict()
        return {
            "monthly_incidents": monthly.to_dict(orient="records"),
            "by_type": by_type,
            "by_severity": by_severity,
            "zone_risk_scores": by_zone,
            "total_incidents": len(df),
            "avg_risk_score": round(df["risk_score"].mean(), 1),
        }
    except Exception as e:
        return {"error": str(e)}


# ── Delay Stats ──
@app.get("/data/delay-stats")
def get_delay_stats():
    try:
        df = pd.read_csv("data/raw/construction_delays.csv")
        delay_rate = round(df["delayed"].mean() * 100, 1)
        avg_overrun = round(df["cost_overrun_pct"].mean(), 1)
        by_type = df.groupby("project_type")["delayed"].mean().round(2).to_dict()
        causes = {
            "weather": round(df["weather_delays"].mean(), 1),
            "labor_shortage": round(df["labor_shortage"].mean() * 100, 1),
            "material_delays": round(df["material_delays"].mean() * 100, 1),
            "design_changes": round(df["design_changes"].mean(), 1),
        }
        return {
            "delay_rate_pct": delay_rate,
            "avg_cost_overrun_pct": avg_overrun,
            "delay_by_project_type": by_type,
            "delay_causes": causes,
        }
    except Exception as e:
        return {"error": str(e)}


# ── Workforce Stats ──
@app.get("/data/workforce-stats")
def get_workforce_stats():
    try:
        df = pd.read_csv("data/raw/workforce.csv")
        turnover_rate = round(df["left_company"].mean() * 100, 1)
        by_role = df.groupby("role")["left_company"].mean().round(2).to_dict()
        avg_performance = round(df["performance_score"].mean(), 1)
        return {
            "turnover_rate_pct": turnover_rate,
            "turnover_by_role": by_role,
            "avg_performance_score": avg_performance,
            "total_workers": len(df),
        }
    except Exception as e:
        return {"error": str(e)}


# ── Equipment Stats ──
@app.get("/data/equipment-stats")
def get_equipment_stats():
    try:
        df = pd.read_csv("data/raw/equipment.csv")
        failure_rate = round(df["failed"].mean() * 100, 1)
        by_type = df.groupby("equipment_type")["health_score"].mean().round(1).to_dict()
        return {
            "failure_rate_pct": failure_rate,
            "avg_health_score": round(df["health_score"].mean(), 1),
            "health_by_type": by_type,
            "total_equipment": len(df),
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/mlops/prediction-stats")
def get_prediction_stats():
    try:
        from monitoring.prediction_logger import get_prediction_stats
        return get_prediction_stats()
    except Exception as e:
        return {"error": str(e)}

@app.get("/mlops/model-comparison")
def get_model_comparison():
    try:
        from monitoring.model_comparison import compare_model_versions
        return compare_model_versions()
    except Exception as e:
        return {"error": str(e)}

@app.get("/mlops/experiment-runs")
def get_experiment_runs():
    try:
        import mlflow
        mlflow.set_tracking_uri("sqlite:///mlflow.db")
        client = mlflow.tracking.MlflowClient()
        experiments = client.search_experiments()
        for exp in experiments:
            if exp.name == "CivilAI_Construction_ML":
                runs = client.search_runs(
                    experiment_ids=[exp.experiment_id],
                    order_by=["start_time DESC"],
                    max_results=20
                )
                return {
                    "experiment": exp.name,
                    "total_runs": len(runs),
                    "runs": [{
                        "name": r.data.tags.get("mlflow.runName", "unknown"),
                        "accuracy": round(r.data.metrics.get("accuracy", 0) * 100, 1) if "accuracy" in r.data.metrics else None,
                        "f1": round(r.data.metrics.get("f1_score", 0), 3),
                        "auc": round(r.data.metrics.get("roc_auc", 0), 3),
                        "status": r.info.status,
                        "timestamp": datetime.fromtimestamp(r.info.start_time / 1000).strftime("%Y-%m-%d %H:%M"),
                    } for r in runs if r.data.metrics]
                }
        return {"error": "Experiment not found"}
    except Exception as e:
        return {"error": str(e)}
    
class GNNInput(BaseModel):
    tasks: list = []
    equipment: list = []
    incidents: list = []
    budget: float = 1000000
    spent: float = 0
    project_name: str = "Project"

@app.post("/gnn/risk-analysis")
def gnn_risk_analysis(data: GNNInput):
    try:
        import sys
        sys.path.append(".")
        from models.gnn_risk import run_gnn_risk_analysis
        result = run_gnn_risk_analysis(data.dict())
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/gnn/test")
def gnn_test():
    try:
        from models.gnn_risk import run_gnn_risk_analysis
        test_data = {
            "tasks": [
                {"id": "1", "task_name": "Foundation", "actual_progress": 100, "status": "done", "delay_days": 0, "priority": "high"},
                {"id": "2", "task_name": "Structure", "actual_progress": 60, "status": "delayed", "delay_days": 15, "priority": "high"},
                {"id": "3", "task_name": "MEP Works", "actual_progress": 30, "status": "atrisk", "delay_days": 5, "priority": "medium"},
            ],
            "equipment": [
                {"id": "1", "name": "Tower Crane", "health_score": 92, "status": "operational", "operating_hours": 2400},
                {"id": "2", "name": "Generator", "health_score": 45, "status": "critical", "operating_hours": 8900},
            ],
            "incidents": [
                {"id": "1", "incident_type": "Fall", "severity": "Severe", "status": "open", "location": "Zone A"},
            ],
            "budget": 5000000,
            "spent": 2500000,
        }
        return run_gnn_risk_analysis(test_data)
    except Exception as e:
        return {"error": str(e)}
    