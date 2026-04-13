import requests
import pandas as pd
import os
import numpy as np

os.makedirs("data/raw", exist_ok=True)

print("Downloading BLS Material Price Data...")
bls_url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

series_ids = {
    "steel": "PCU331110331110",
    "lumber": "PCU321113321113",
    "copper": "PCU331420331420",
}

for material, sid in series_ids.items():
    try:
        response = requests.post(bls_url, json={
            "seriesid": [sid],
            "startyear": "2020",
            "endyear": "2024"
        }, headers={"Content-type": "application/json"})
        data = response.json()
        rows = []
        if data.get("Results"):
            for item in data["Results"]["series"][0]["data"]:
                rows.append({
                    "material": material,
                    "year": int(item["year"]),
                    "month": item["period"].replace("M", ""),
                    "price": float(item["value"])
                })
        if rows:
            df = pd.DataFrame(rows)
            df.to_csv(f"data/raw/{material}_prices.csv", index=False)
            print(f"✅ {material}: {len(df)} records saved")
        else:
            raise Exception("No data")
    except Exception as e:
        print(f"⚠️ {material} API failed — using hardcoded data")

# Cement hardcoded
cement_data = {
    "material": "cement",
    "year": [2020]*12 + [2021]*12 + [2022]*12 + [2023]*12 + [2024]*12,
    "month": list(range(1,13))*5,
    "price": [
        285,286,287,289,290,291,292,293,294,295,296,297,
        298,300,302,305,308,310,312,315,318,320,322,325,
        328,330,335,338,340,342,345,348,350,352,355,358,
        360,362,363,364,365,366,367,368,369,370,371,372,
        373,374,375,376,377,378,379,380,381,382,383,384,
    ]
}
cement_df = pd.DataFrame(cement_data)
cement_df.to_csv("data/raw/cement_prices.csv", index=False)
print(f"✅ cement: {len(cement_df)} records saved")

print("\nGenerating safety incident data...")
np.random.seed(42)
n = 500
safety_df = pd.DataFrame({
    "incident_type": np.random.choice(["Fall", "Strike", "Caught-in", "Electrical", "Chemical"], n),
    "severity": np.random.choice(["Minor", "Moderate", "Severe"], n, p=[0.6, 0.3, 0.1]),
    "zone": np.random.choice(["Zone A", "Zone B", "Zone C", "Zone D"], n),
    "month": np.random.randint(1, 13, n),
    "year": np.random.randint(2020, 2025, n),
    "workers_involved": np.random.randint(1, 5, n),
    "ppe_worn": np.random.choice([0, 1], n, p=[0.3, 0.7]),
    "training_completed": np.random.choice([0, 1], n, p=[0.2, 0.8]),
    "near_miss": np.random.choice([0, 1], n, p=[0.4, 0.6]),
    "risk_score": np.random.uniform(20, 100, n),
})
safety_df.to_csv("data/raw/safety_incidents.csv", index=False)
print(f"✅ Safety incidents: {len(safety_df)} records saved")

print("\nGenerating construction delay data...")
n = 300
delay_df = pd.DataFrame({
    "project_type": np.random.choice(["Residential", "Commercial", "Industrial", "Infrastructure"], n),
    "planned_duration_days": np.random.randint(30, 365, n),
    "actual_duration_days": np.random.randint(30, 400, n),
    "budget_planned": np.random.uniform(100000, 5000000, n),
    "budget_actual": np.random.uniform(100000, 6000000, n),
    "weather_delays": np.random.randint(0, 20, n),
    "labor_shortage": np.random.choice([0, 1], n, p=[0.6, 0.4]),
    "material_delays": np.random.choice([0, 1], n, p=[0.5, 0.5]),
    "design_changes": np.random.randint(0, 10, n),
    "subcontractor_issues": np.random.choice([0, 1], n, p=[0.7, 0.3]),
    "delayed": np.random.choice([0, 1], n, p=[0.4, 0.6]),
})
delay_df["cost_overrun_pct"] = ((delay_df["budget_actual"] - delay_df["budget_planned"]) / delay_df["budget_planned"] * 100).round(2)
delay_df.to_csv("data/raw/construction_delays.csv", index=False)
print(f"✅ Construction delays: {len(delay_df)} records saved")

print("\nGenerating workforce data...")
n = 200
workforce_df = pd.DataFrame({
    "role": np.random.choice(["Engineer", "Foreman", "Laborer", "Electrician", "Plumber"], n),
    "experience_years": np.random.randint(0, 20, n),
    "salary": np.random.uniform(30000, 120000, n),
    "performance_score": np.random.uniform(50, 100, n),
    "safety_violations": np.random.randint(0, 5, n),
    "training_hours": np.random.randint(0, 100, n),
    "overtime_hours": np.random.randint(0, 50, n),
    "tenure_months": np.random.randint(1, 60, n),
    "left_company": np.random.choice([0, 1], n, p=[0.7, 0.3]),
})
workforce_df.to_csv("data/raw/workforce.csv", index=False)
print(f"✅ Workforce: {len(workforce_df)} records saved")

print("\nGenerating equipment data...")
n = 100
equipment_df = pd.DataFrame({
    "equipment_type": np.random.choice(["Crane", "Excavator", "Bulldozer", "Mixer", "Generator"], n),
    "age_years": np.random.randint(0, 15, n),
    "operating_hours": np.random.randint(100, 10000, n),
    "maintenance_count": np.random.randint(0, 20, n),
    "last_service_days_ago": np.random.randint(0, 365, n),
    "breakdowns": np.random.randint(0, 5, n),
    "health_score": np.random.uniform(40, 100, n),
    "failed": np.random.choice([0, 1], n, p=[0.8, 0.2]),
})
equipment_df.to_csv("data/raw/equipment.csv", index=False)
print(f"✅ Equipment: {len(equipment_df)} records saved")

print("\nGenerating cost overrun data...")
n = 250
cost_df = pd.DataFrame({
    "project_type": np.random.choice(["Residential", "Commercial", "Industrial"], n),
    "initial_budget": np.random.uniform(500000, 10000000, n),
    "final_cost": np.random.uniform(500000, 12000000, n),
    "duration_months": np.random.randint(6, 36, n),
    "team_size": np.random.randint(10, 200, n),
    "change_orders": np.random.randint(0, 20, n),
    "material_price_increase": np.random.uniform(0, 30, n),
    "weather_impact_days": np.random.randint(0, 30, n),
    "subcontractor_count": np.random.randint(1, 15, n),
    "overrun": np.random.choice([0, 1], n, p=[0.45, 0.55]),
})
cost_df["overrun_pct"] = ((cost_df["final_cost"] - cost_df["initial_budget"]) / cost_df["initial_budget"] * 100).round(2)
cost_df.to_csv("data/raw/cost_overrun.csv", index=False)
print(f"✅ Cost overrun: {len(cost_df)} records saved")

print("\n🎉 All datasets ready in data/raw/")