import mlflow
import pandas as pd
from datetime import datetime

mlflow.set_tracking_uri("sqlite:///mlflow.db")

def compare_model_versions() -> dict:
    """Compare all model versions from MLflow"""
    client = mlflow.tracking.MlflowClient()

    experiments = client.search_experiments()
    civilai_exp = None
    for exp in experiments:
        if exp.name == "CivilAI_Construction_ML":
            civilai_exp = exp
            break

    if not civilai_exp:
        return {"error": "No experiment found"}

    runs = client.search_runs(
        experiment_ids=[civilai_exp.experiment_id],
        order_by=["start_time DESC"],
        max_results=50
    )

    comparison = {}
    for run in runs:
        name = run.data.tags.get("mlflow.runName", "unknown")
        metrics = run.data.metrics
        if not metrics or "accuracy" not in metrics:
            continue

        base_name = name.replace("_v1", "").replace("_v2", "").replace("_pipeline_run", "")

        if base_name not in comparison:
            comparison[base_name] = []

        comparison[base_name].append({
            "run_id": run.info.run_id[:8],
            "run_name": name,
            "accuracy": round(metrics.get("accuracy", 0) * 100, 1),
            "f1_score": round(metrics.get("f1_score", 0), 3),
            "roc_auc": round(metrics.get("roc_auc", 0), 3),
            "timestamp": datetime.fromtimestamp(
                run.info.start_time / 1000
            ).strftime("%Y-%m-%d %H:%M"),
        })

    print("=" * 60)
    print("Model Version Comparison")
    print("=" * 60)
    for model, versions in comparison.items():
        print(f"\n📊 {model}")
        for v in versions:
            print(f"  {v['run_name']}: Acc={v['accuracy']}% F1={v['f1_score']} AUC={v['roc_auc']}")

    return comparison

if __name__ == "__main__":
    compare_model_versions()