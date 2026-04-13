import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from xgboost import XGBClassifier, XGBRegressor
from sklearn.metrics import accuracy_score, r2_score, classification_report
import joblib
import os

os.makedirs("models/saved", exist_ok=True)

print("=" * 50)
print("Training CivilAI ML Models")
print("=" * 50)

# ─────────────────────────────────────────
# 1. COST OVERRUN PREDICTION
# ─────────────────────────────────────────
print("\n1. Training Cost Overrun Model...")
df = pd.read_csv("data/raw/cost_overrun.csv")
le = LabelEncoder()
df["project_type_enc"] = le.fit_transform(df["project_type"])
features = ["project_type_enc", "duration_months", "team_size",
            "change_orders", "material_price_increase",
            "weather_impact_days", "subcontractor_count"]
X = df[features]
y = df["overrun"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss")
model.fit(X_train, y_train)
acc = accuracy_score(y_test, model.predict(X_test))
print(f"✅ Cost Overrun Model — Accuracy: {acc:.2%}")
joblib.dump(model, "models/saved/cost_overrun_model.pkl")
joblib.dump(le, "models/saved/cost_overrun_encoder.pkl")

# ─────────────────────────────────────────
# 2. DELAY PREDICTION
# ─────────────────────────────────────────
print("\n2. Training Delay Prediction Model...")
df = pd.read_csv("data/raw/construction_delays.csv")
le2 = LabelEncoder()
df["project_type_enc"] = le2.fit_transform(df["project_type"])
features = ["project_type_enc", "planned_duration_days",
            "weather_delays", "labor_shortage",
            "material_delays", "design_changes", "subcontractor_issues"]
X = df[features]
y = df["delayed"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model2 = XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss")
model2.fit(X_train, y_train)
acc2 = accuracy_score(y_test, model2.predict(X_test))
print(f"✅ Delay Prediction Model — Accuracy: {acc2:.2%}")
joblib.dump(model2, "models/saved/delay_prediction_model.pkl")
joblib.dump(le2, "models/saved/delay_prediction_encoder.pkl")

# ─────────────────────────────────────────
# 3. SAFETY RISK PREDICTION
# ─────────────────────────────────────────
print("\n3. Training Safety Risk Model...")
df = pd.read_csv("data/raw/safety_incidents.csv")
le3 = LabelEncoder()
le4 = LabelEncoder()
df["incident_type_enc"] = le3.fit_transform(df["incident_type"])
df["zone_enc"] = le4.fit_transform(df["zone"])
features = ["incident_type_enc", "zone_enc", "workers_involved",
            "ppe_worn", "training_completed", "near_miss", "month"]
X = df[features]
y = (df["severity"] == "Severe").astype(int)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model3 = RandomForestClassifier(n_estimators=100, random_state=42)
model3.fit(X_train, y_train)
acc3 = accuracy_score(y_test, model3.predict(X_test))
print(f"✅ Safety Risk Model — Accuracy: {acc3:.2%}")
joblib.dump(model3, "models/saved/safety_risk_model.pkl")
joblib.dump(le3, "models/saved/safety_incident_encoder.pkl")
joblib.dump(le4, "models/saved/safety_zone_encoder.pkl")

# ─────────────────────────────────────────
# 4. WORKFORCE TURNOVER PREDICTION
# ─────────────────────────────────────────
print("\n4. Training Workforce Turnover Model...")
df = pd.read_csv("data/raw/workforce.csv")
le5 = LabelEncoder()
df["role_enc"] = le5.fit_transform(df["role"])
features = ["role_enc", "experience_years", "salary",
            "performance_score", "safety_violations",
            "training_hours", "overtime_hours", "tenure_months"]
X = df[features]
y = df["left_company"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model4 = XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss")
model4.fit(X_train, y_train)
acc4 = accuracy_score(y_test, model4.predict(X_test))
print(f"✅ Turnover Prediction Model — Accuracy: {acc4:.2%}")
joblib.dump(model4, "models/saved/turnover_model.pkl")
joblib.dump(le5, "models/saved/turnover_role_encoder.pkl")

# ─────────────────────────────────────────
# 5. EQUIPMENT FAILURE PREDICTION
# ─────────────────────────────────────────
print("\n5. Training Equipment Failure Model...")
df = pd.read_csv("data/raw/equipment.csv")
le6 = LabelEncoder()
df["equipment_type_enc"] = le6.fit_transform(df["equipment_type"])
features = ["equipment_type_enc", "age_years", "operating_hours",
            "maintenance_count", "last_service_days_ago", "breakdowns"]
X = df[features]
y = df["failed"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model5 = RandomForestClassifier(n_estimators=100, random_state=42)
model5.fit(X_train, y_train)
acc5 = accuracy_score(y_test, model5.predict(X_test))
print(f"✅ Equipment Failure Model — Accuracy: {acc5:.2%}")
joblib.dump(model5, "models/saved/equipment_failure_model.pkl")
joblib.dump(le6, "models/saved/equipment_type_encoder.pkl")

# ─────────────────────────────────────────
# 6. COST OVERRUN % REGRESSION
# ─────────────────────────────────────────
print("\n6. Training Cost Overrun Regression Model...")
df = pd.read_csv("data/raw/cost_overrun.csv")
le7 = LabelEncoder()
df["project_type_enc"] = le7.fit_transform(df["project_type"])
features = ["project_type_enc", "duration_months", "team_size",
            "change_orders", "material_price_increase",
            "weather_impact_days", "subcontractor_count"]
X = df[features]
y = df["overrun_pct"].clip(-50, 100)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model6 = XGBRegressor(n_estimators=100, random_state=42)
model6.fit(X_train, y_train)
r2 = r2_score(y_test, model6.predict(X_test))
print(f"✅ Cost Overrun Regression — R² Score: {r2:.2f}")
joblib.dump(model6, "models/saved/cost_overrun_regression_model.pkl")

print("\n" + "=" * 50)
print("✅ All 6 ML models trained & saved!")
print("=" * 50)
print("\nModels saved in models/saved/:")
for f in os.listdir("models/saved"):
    print(f"  - {f}")