"""
Export completed projects from Supabase into a CSV matching the schema of
ml/data/raw/cost_overrun.csv, so the cost-overrun model can eventually be
retrained on this deployment's own project history instead of the synthetic
1,000-row benchmark it currently ships with.

DO NOT wire this into an automatic retrain yet. A handful of completed
projects is not enough signal to beat a model already trained on 1,000 rows —
retraining too early would make predictions *worse*, not more "real." Only
run `python models/train_all.py` (inside ml/) against this export once there
are a meaningful number of completed projects — a few dozen at minimum, more
is better. Until then, treat this script's output as a growing dataset to
revisit periodically, not an action to automate.

Usage (from backend/):
    python scripts/export_training_data.py [output_csv_path]
"""
import sys
import csv
import logging
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.db_service import supabase, get_projects  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("export_training_data")

CSV_COLUMNS = [
    "project_type", "duration_months", "team_size", "change_orders",
    "material_price_increase", "weather_impact_days", "subcontractor_count",
    "overrun", "overrun_pct", "initial_budget", "final_cost",
]


def _duration_months(start: str, end: str) -> int:
    try:
        s = datetime.strptime(str(start)[:10], "%Y-%m-%d")
        e = datetime.strptime(str(end)[:10], "%Y-%m-%d")
        return max(1, (e.year - s.year) * 12 + e.month - s.month)
    except Exception:
        return 12


def build_rows() -> list[dict]:
    projects = [p for p in get_projects() if str(p.get("status", "")).lower() == "completed"]
    if not projects:
        logger.warning("No completed projects found — nothing to export yet.")
        return []

    # Global signals shared across all rows, same proxies get_auto_cost_overrun() in
    # ml_service.py already uses live, so this export stays consistent with the app.
    prices_res = supabase.table("material_prices").select("change_pct").execute()
    price_changes = [abs(float(p["change_pct"])) for p in (prices_res.data or []) if p.get("change_pct")]
    material_price_increase = round(sum(price_changes) / len(price_changes), 1) if price_changes else 5.0

    rows = []
    for p in projects:
        pid = p["id"]
        total_budget = float(p.get("total_budget") or 0)
        spent = float(p.get("spent_to_date") or 0)
        if total_budget <= 0:
            continue  # can't compute a meaningful overrun label without a budget

        workforce_res = supabase.table("workforce").select("status").eq("project_id", pid).execute()
        workforce = workforce_res.data or []
        team_size = sum(1 for w in workforce if w.get("status") == "active") or max(len(workforce), 1)

        contracts_res = supabase.table("contracts").select("id").eq("project_id", pid).execute()
        subcontractor_count = len(contracts_res.data or []) or 1

        rfis_res = supabase.table("rfis").select("id").eq("project_id", pid).execute()
        change_orders = len(rfis_res.data or [])

        incidents_res = supabase.table("safety_incidents").select("description,type").eq("project_id", pid).execute()
        weather_impact_days = sum(
            1 for i in (incidents_res.data or [])
            if "weather" in str(i.get("description") or "").lower()
            or "weather" in str(i.get("type") or "").lower()
        )

        overrun_pct = round((spent / total_budget - 1) * 100, 2)

        rows.append({
            "project_type":            p.get("project_type") or "Commercial",
            "duration_months":         _duration_months(p.get("start_date"), p.get("end_date")),
            "team_size":               team_size,
            "change_orders":           change_orders,
            "material_price_increase": material_price_increase,
            "weather_impact_days":     weather_impact_days,
            "subcontractor_count":     subcontractor_count,
            "overrun":                 int(spent > total_budget),
            "overrun_pct":             overrun_pct,
            "initial_budget":          total_budget,
            "final_cost":              spent,
        })

    return rows


def main():
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "cost_overrun_export.csv"
    rows = build_rows()

    if len(rows) < 30:
        logger.warning(
            "Only %d completed project(s) with a usable budget found. That's likely too few to "
            "retrain on without making predictions worse than the current 1,000-row benchmark model. "
            "Exporting anyway so the dataset can grow — do not retrain yet.",
            len(rows),
        )

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    logger.info("Exported %d row(s) to %s", len(rows), out_path)


if __name__ == "__main__":
    main()
