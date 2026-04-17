import mlflow
import json
import os
from datetime import datetime

mlflow.set_tracking_uri("sqlite:///mlflow.db")

os.makedirs("monitoring/logs", exist_ok=True)

def log_prediction(
    model_name: str,
    input_data: dict,
    prediction: dict,
    latency_ms: float = 0
):
    """Log every prediction to MLflow and local file"""
    try:
        with mlflow.start_run(run_name=f"prediction_{model_name}_{datetime.now().strftime('%H%M%S')}"):
            mlflow.set_tag("type", "prediction")
            mlflow.set_tag("model", model_name)
            mlflow.set_tag("timestamp", datetime.now().isoformat())

            # Log input features
            for k, v in input_data.items():
                if isinstance(v, (int, float)):
                    mlflow.log_metric(f"input_{k}", v)

            # Log prediction results
            if "probability" in prediction:
                mlflow.log_metric("probability", prediction["probability"])
            if "will_overrun" in prediction:
                mlflow.log_metric("will_overrun", int(prediction["will_overrun"]))
            if "will_be_delayed" in prediction:
                mlflow.log_metric("will_be_delayed", int(prediction["will_be_delayed"]))
            if "severe_risk" in prediction:
                mlflow.log_metric("severe_risk", int(prediction["severe_risk"]))
            if "will_leave" in prediction:
                mlflow.log_metric("will_leave", int(prediction["will_leave"]))
            if "will_fail" in prediction:
                mlflow.log_metric("will_fail", int(prediction["will_fail"]))

            mlflow.log_metric("latency_ms", latency_ms)
            mlflow.log_param("risk_level", prediction.get("risk_level", "unknown"))

        # Also save to local log file
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "model": model_name,
            "input": input_data,
            "prediction": prediction,
            "latency_ms": latency_ms,
        }
        log_path = f"monitoring/logs/predictions_{datetime.now().strftime('%Y%m%d')}.jsonl"
        with open(log_path, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    except Exception as e:
        print(f"Logging error: {e}")

def get_prediction_stats(model_name: str = None, days: int = 7) -> dict:
    """Get prediction statistics from logs"""
    try:
        stats = {
            "total_predictions": 0,
            "high_risk_count": 0,
            "medium_risk_count": 0,
            "low_risk_count": 0,
            "avg_latency_ms": 0,
            "by_model": {}
        }

        log_dir = "monitoring/logs"
        if not os.path.exists(log_dir):
            return stats

        latencies = []
        for fname in os.listdir(log_dir):
            if not fname.endswith(".jsonl"):
                continue
            with open(os.path.join(log_dir, fname)) as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                        if model_name and entry.get("model") != model_name:
                            continue
                        stats["total_predictions"] += 1
                        risk = entry.get("prediction", {}).get("risk_level", "")
                        if risk == "High":
                            stats["high_risk_count"] += 1
                        elif risk == "Medium":
                            stats["medium_risk_count"] += 1
                        else:
                            stats["low_risk_count"] += 1
                        latencies.append(entry.get("latency_ms", 0))

                        model = entry.get("model", "unknown")
                        if model not in stats["by_model"]:
                            stats["by_model"][model] = 0
                        stats["by_model"][model] += 1
                    except:
                        continue

        if latencies:
            stats["avg_latency_ms"] = round(sum(latencies) / len(latencies), 2)

        return stats
    except Exception as e:
        return {"error": str(e)}