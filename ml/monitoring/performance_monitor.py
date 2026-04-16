import mlflow
import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

mlflow.set_tracking_uri("sqlite:///mlflow.db")

def get_model_performance():
    """Fetch all model runs from MLflow"""
    client = mlflow.tracking.MlflowClient()
    
    experiments = client.search_experiments()
    civilai_exp = None
    for exp in experiments:
        if exp.name == "CivilAI_Construction_ML":
            civilai_exp = exp
            break
    
    if not civilai_exp:
        print("No CivilAI experiment found!")
        return {}
    
    runs = client.search_runs(
        experiment_ids=[civilai_exp.experiment_id],
        order_by=["start_time DESC"]
    )
    
    print("=" * 60)
    print("CivilAI Model Performance Monitor")
    print(f"Total runs tracked: {len(runs)}")
    print("=" * 60)
    
    model_performance = {}
    
    for run in runs:
        name = run.data.tags.get("mlflow.runName", "unknown")
        metrics = run.data.metrics
        params = run.data.params
        
        if not metrics:
            continue
            
        print(f"\n📊 Run: {name}")
        print(f"   Run ID: {run.info.run_id[:8]}...")
        print(f"   Status: {run.info.status}")
        
        if "accuracy" in metrics:
            print(f"   Accuracy: {metrics['accuracy']:.2%}")
            print(f"   F1 Score: {metrics.get('f1_score', 0):.3f}")
            print(f"   ROC AUC:  {metrics.get('roc_auc', 0):.3f}")
        elif "r2_score" in metrics:
            print(f"   R² Score: {metrics['r2_score']:.3f}")
            print(f"   MAE:      {metrics.get('mae', 0):.2f}%")
        
        model_performance[name] = metrics
    
    # Best models summary
    print("\n" + "=" * 60)
    print("BEST MODEL SUMMARY")
    print("=" * 60)
    
    classifiers = {k: v for k, v in model_performance.items() if "accuracy" in v}
    if classifiers:
        best = max(classifiers.items(), key=lambda x: x[1].get("roc_auc", 0))
        print(f"\n🏆 Best Classifier: {best[0]}")
        print(f"   AUC: {best[1].get('roc_auc', 0):.3f}")
        print(f"   Accuracy: {best[1].get('accuracy', 0):.2%}")
    
    avg_accuracy = np.mean([v["accuracy"] for v in classifiers.values() if "accuracy" in v])
    avg_auc = np.mean([v.get("roc_auc", 0) for v in classifiers.values()])
    
    print(f"\n📈 Average Accuracy: {avg_accuracy:.2%}")
    print(f"📈 Average AUC: {avg_auc:.3f}")
    
    # Save summary
    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_runs": len(runs),
        "avg_accuracy": avg_accuracy,
        "avg_auc": avg_auc,
        "models": model_performance
    }
    
    os.makedirs("monitoring/reports", exist_ok=True)
    with open("monitoring/reports/performance_latest.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n✅ Performance report saved!")
    return summary

if __name__ == "__main__":
    get_model_performance()