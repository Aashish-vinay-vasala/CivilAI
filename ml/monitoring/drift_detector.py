import pandas as pd
import numpy as np
import mlflow
import json
import os
from datetime import datetime

mlflow.set_tracking_uri("sqlite:///mlflow.db")

os.makedirs("monitoring/reports", exist_ok=True)

def calculate_psi(expected, actual, buckets=10):
    """Population Stability Index — detects data drift"""
    expected_perc = np.histogram(expected, bins=buckets)[0] / len(expected)
    actual_perc = np.histogram(actual, bins=buckets)[0] / len(actual)
    expected_perc = np.where(expected_perc == 0, 0.0001, expected_perc)
    actual_perc = np.where(actual_perc == 0, 0.0001, actual_perc)
    psi = np.sum((actual_perc - expected_perc) * np.log(actual_perc / expected_perc))
    return psi

def interpret_psi(psi):
    if psi < 0.1: return "✅ No drift", "stable"
    if psi < 0.2: return "⚠️ Minor drift", "warning"
    return "🚨 Major drift", "critical"

def check_model_drift(model_name: str, csv_path: str, features: list) -> dict:
    """Compute real PSI for a model's features and derive an honest status from it."""
    df = pd.read_csv(csv_path)
    train = df.sample(frac=0.7, random_state=42)
    test = df.drop(train.index)

    psis = []
    for feature in features:
        psi = calculate_psi(train[feature], test[feature])
        label, status = interpret_psi(psi)
        print(f"  {feature}: PSI={psi:.4f} — {label}")
        psis.append(psi)

    psi_avg = sum(psis) / len(psis)
    _, overall_status = interpret_psi(psi_avg)
    return {
        "status": overall_status,
        "psi_avg": round(psi_avg, 4),
        "psi_by_feature": {f: round(p, 4) for f, p in zip(features, psis)},
        "features_checked": len(features),
    }


def detect_drift():
    print("=" * 60)
    print("CivilAI Data Drift Detection")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    report = {
        "timestamp": datetime.now().isoformat(),
        "models": {}
    }

    print("\n[1] Cost Overrun Model:")
    report["models"]["cost_overrun"] = check_model_drift(
        "cost_overrun", "data/raw/cost_overrun.csv",
        ["change_orders", "material_price_increase", "weather_impact_days"]
    )

    print("\n[2] Delay Prediction Model:")
    report["models"]["delay_prediction"] = check_model_drift(
        "delay_prediction", "data/raw/construction_delays.csv",
        ["weather_delays", "design_changes", "planned_duration_days"]
    )

    print("\n[3] Safety Risk Model:")
    report["models"]["safety_risk"] = check_model_drift(
        "safety_risk", "data/raw/safety_incidents.csv",
        ["workers_involved", "risk_score"]
    )

    print("\n[4] Workforce Turnover Model:")
    report["models"]["workforce_turnover"] = check_model_drift(
        "workforce_turnover", "data/raw/workforce.csv",
        ["salary", "performance_score", "overtime_hours"]
    )

    print("\n[5] Equipment Failure Model:")
    report["models"]["equipment_failure"] = check_model_drift(
        "equipment_failure", "data/raw/equipment.csv",
        ["age_years", "operating_hours", "last_service_days_ago"]
    )

    # Save report
    report_path = f"monitoring/reports/drift_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 60)
    print(f"✅ Drift detection complete!")
    print(f"📄 Report saved: {report_path}")
    print("=" * 60)
    return report

if __name__ == "__main__":
    detect_drift()