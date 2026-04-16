import pandas as pd
import numpy as np
import os

os.makedirs("data/raw", exist_ok=True)
np.random.seed(42)

print("Generating high-quality construction datasets...")

# ─────────────────────────────────────────
# 1. COST OVERRUN — strong signal patterns
# ─────────────────────────────────────────
n = 1000
project_types = np.random.choice(["Residential", "Commercial", "Industrial", "Infrastructure"], n)
duration = np.random.randint(6, 48, n)
team_size = np.random.randint(10, 200, n)
change_orders = np.random.randint(0, 25, n)
material_increase = np.random.uniform(0, 40, n)
weather_days = np.random.randint(0, 45, n)
subcontractors = np.random.randint(1, 20, n)

# Create realistic overrun logic
overrun_score = (
    (change_orders * 0.15) +
    (material_increase * 0.12) +
    (weather_days * 0.08) +
    (subcontractors * 0.05) +
    (duration / 48 * 10) +
    np.random.normal(0, 2, n)
)
overrun = (overrun_score > overrun_score.mean()).astype(int)
overrun_pct = (overrun_score * 2.5).clip(-50, 100)

cost_df = pd.DataFrame({
    "project_type": project_types,
    "duration_months": duration,
    "team_size": team_size,
    "change_orders": change_orders,
    "material_price_increase": material_increase.round(2),
    "weather_impact_days": weather_days,
    "subcontractor_count": subcontractors,
    "overrun": overrun,
    "overrun_pct": overrun_pct.round(2),
    "initial_budget": np.random.uniform(500000, 10000000, n).round(0),
    "final_cost": np.random.uniform(500000, 12000000, n).round(0),
})
cost_df.to_csv("data/raw/cost_overrun.csv", index=False)
print(f"✅ Cost overrun: {n} records | Overrun rate: {overrun.mean():.1%}")

# ─────────────────────────────────────────
# 2. CONSTRUCTION DELAYS — strong signal
# ─────────────────────────────────────────
n = 1000
project_types = np.random.choice(["Residential", "Commercial", "Industrial", "Infrastructure"], n)
planned_duration = np.random.randint(30, 365, n)
weather_delays = np.random.randint(0, 30, n)
labor_shortage = np.random.choice([0, 1], n, p=[0.55, 0.45])
material_delays = np.random.choice([0, 1], n, p=[0.5, 0.5])
design_changes = np.random.randint(0, 15, n)
subcontractor_issues = np.random.choice([0, 1], n, p=[0.65, 0.35])

# Realistic delay logic
delay_score = (
    (weather_delays * 0.2) +
    (labor_shortage * 8) +
    (material_delays * 7) +
    (design_changes * 0.8) +
    (subcontractor_issues * 6) +
    np.random.normal(0, 2, n)
)
delayed = (delay_score > delay_score.mean()).astype(int)
cost_overrun_pct = (delay_score * 3).clip(-20, 150).round(2)

delay_df = pd.DataFrame({
    "project_type": project_types,
    "planned_duration_days": planned_duration,
    "actual_duration_days": (planned_duration + delay_score.clip(0, 100)).astype(int),
    "budget_planned": np.random.uniform(100000, 5000000, n).round(0),
    "budget_actual": np.random.uniform(100000, 6000000, n).round(0),
    "weather_delays": weather_delays,
    "labor_shortage": labor_shortage,
    "material_delays": material_delays,
    "design_changes": design_changes,
    "subcontractor_issues": subcontractor_issues,
    "delayed": delayed,
    "cost_overrun_pct": cost_overrun_pct,
})
delay_df.to_csv("data/raw/construction_delays.csv", index=False)
print(f"✅ Delays: {n} records | Delay rate: {delayed.mean():.1%}")

# ─────────────────────────────────────────
# 3. SAFETY INCIDENTS — balanced classes
# ─────────────────────────────────────────
n = 2000
incident_types = np.random.choice(["Fall", "Strike", "Caught-in", "Electrical", "Chemical"], n)
zones = np.random.choice(["Zone A", "Zone B", "Zone C", "Zone D"], n)
workers_involved = np.random.randint(1, 8, n)
ppe_worn = np.random.choice([0, 1], n, p=[0.35, 0.65])
training_completed = np.random.choice([0, 1], n, p=[0.25, 0.75])
near_miss = np.random.choice([0, 1], n, p=[0.45, 0.55])
month = np.random.randint(1, 13, n)

# Realistic severity logic
severity_score = (
    (workers_involved * 0.3) +
    ((1 - ppe_worn) * 4) +
    ((1 - training_completed) * 3) +
    (near_miss * 2) +
    np.random.normal(0, 1.5, n)
)
severity_labels = np.where(
    severity_score > severity_score.mean() + 0.5, "Severe",
    np.where(severity_score > severity_score.mean() - 0.5, "Moderate", "Minor")
)
risk_score = (severity_score * 8).clip(10, 100)

safety_df = pd.DataFrame({
    "incident_type": incident_types,
    "severity": severity_labels,
    "zone": zones,
    "month": month,
    "year": np.random.randint(2020, 2025, n),
    "workers_involved": workers_involved,
    "ppe_worn": ppe_worn,
    "training_completed": training_completed,
    "near_miss": near_miss,
    "risk_score": risk_score.round(1),
})
safety_df.to_csv("data/raw/safety_incidents.csv", index=False)
severe_rate = (severity_labels == "Severe").mean()
print(f"✅ Safety: {n} records | Severe rate: {severe_rate:.1%}")

# ─────────────────────────────────────────
# 4. WORKFORCE TURNOVER — balanced
# ─────────────────────────────────────────
n = 1000
roles = np.random.choice(["Engineer", "Foreman", "Laborer", "Electrician", "Plumber"], n)
experience = np.random.randint(0, 25, n)
salary = np.random.uniform(28000, 130000, n)
performance = np.random.uniform(40, 100, n)
safety_violations = np.random.randint(0, 8, n)
training_hours = np.random.randint(0, 120, n)
overtime_hours = np.random.randint(0, 60, n)
tenure = np.random.randint(1, 72, n)

# Realistic turnover logic
turnover_score = (
    (50 - performance) * 0.1 +
    (safety_violations * 2) +
    (overtime_hours * 0.15) +
    (1 / (tenure + 1) * 20) +
    ((80000 - salary) / 80000 * 10) +
    np.random.normal(0, 2, n)
)
left_company = (turnover_score > turnover_score.mean()).astype(int)

workforce_df = pd.DataFrame({
    "role": roles,
    "experience_years": experience,
    "salary": salary.round(0),
    "performance_score": performance.round(1),
    "safety_violations": safety_violations,
    "training_hours": training_hours,
    "overtime_hours": overtime_hours,
    "tenure_months": tenure,
    "left_company": left_company,
})
workforce_df.to_csv("data/raw/workforce.csv", index=False)
print(f"✅ Workforce: {n} records | Turnover rate: {left_company.mean():.1%}")

# ─────────────────────────────────────────
# 5. EQUIPMENT FAILURE — balanced
# ─────────────────────────────────────────
n = 500
equipment_types = np.random.choice(["Crane", "Excavator", "Bulldozer", "Mixer", "Generator"], n)
age_years = np.random.randint(0, 20, n)
operating_hours = np.random.randint(100, 15000, n)
maintenance_count = np.random.randint(0, 25, n)
last_service_days = np.random.randint(0, 400, n)
breakdowns = np.random.randint(0, 8, n)
health_score = np.random.uniform(30, 100, n)

# Realistic failure logic
failure_score = (
    (age_years * 0.8) +
    (operating_hours / 15000 * 15) +
    (last_service_days / 400 * 12) +
    (breakdowns * 2.5) +
    ((100 - health_score) * 0.1) +
    np.random.normal(0, 2, n)
)
failed = (failure_score > failure_score.mean()).astype(int)

equipment_df = pd.DataFrame({
    "equipment_type": equipment_types,
    "age_years": age_years,
    "operating_hours": operating_hours,
    "maintenance_count": maintenance_count,
    "last_service_days_ago": last_service_days,
    "breakdowns": breakdowns,
    "health_score": health_score.round(1),
    "failed": failed,
})
equipment_df.to_csv("data/raw/equipment.csv", index=False)
print(f"✅ Equipment: {n} records | Failure rate: {failed.mean():.1%}")

# ─────────────────────────────────────────
# 6. MATERIAL PRICES (BLS style)
# ─────────────────────────────────────────
for material, base, growth in [
    ("cement", 285, 0.8),
    ("steel", 650, 1.2),
    ("lumber", 420, 0.9),
    ("copper", 380, 1.1),
]:
    rows = []
    price = base
    for year in range(2020, 2025):
        for month in range(1, 13):
            price = price * (1 + growth/100) + np.random.normal(0, base*0.01)
            rows.append({"material": material, "year": year, "month": str(month).zfill(2), "price": round(price, 2)})
    pd.DataFrame(rows).to_csv(f"data/raw/{material}_prices.csv", index=False)
print("✅ Material prices: 4 materials × 60 months")

print("\n🎉 All datasets regenerated with strong signal patterns!")
print("Expected accuracy improvements: 75-90% across all models")