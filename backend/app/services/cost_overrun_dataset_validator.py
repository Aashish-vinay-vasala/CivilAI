"""
CSV/XLSX column validation for cost-overrun training datasets — same shape of pattern as
material_prices.py's _validate_material_file(): resolve headers via alias lookup, check
required columns are present, coerce/validate each row, collect warnings for skipped rows
and blocking errors for a missing schema.

A valid uploaded row needs the six feature columns plus a label, where the label can be
given either directly (overrun + overrun_pct) or as raw budget/actual figures the same way
_real_rows_from_projects() derives labels from completed projects.
"""
import csv
import io
from typing import Optional

COLUMN_ALIASES: dict[str, list[str]] = {
    "project_type":            ["project_type", "type", "project type", "category"],
    "duration_months":         ["duration_months", "duration", "duration (months)", "months"],
    "team_size":                ["team_size", "team size", "workers", "headcount"],
    "change_orders":            ["change_orders", "change orders", "rfis", "co_count"],
    "material_price_increase":  ["material_price_increase", "material price increase", "price_increase_pct", "material %"],
    "weather_impact_days":      ["weather_impact_days", "weather days", "weather_delay_days"],
    "subcontractor_count":      ["subcontractor_count", "subcontractors", "subcontractor count"],
    "cpi":                       ["cpi", "cost performance index"],
    "spi":                       ["spi", "schedule performance index"],
    "overrun":                   ["overrun", "is_overrun", "overrun_flag"],
    "overrun_pct":               ["overrun_pct", "overrun %", "overrun_percentage"],
    "budget":                    ["budget", "initial_budget", "planned_budget"],
    "actual_cost":               ["actual_cost", "final_cost", "actual", "spent"],
}
_REQUIRED_NUMERIC = {
    "duration_months", "team_size", "change_orders",
    "material_price_increase", "weather_impact_days", "subcontractor_count",
}
_LABEL_FORM_A = {"overrun", "overrun_pct"}
_LABEL_FORM_B = {"budget", "actual_cost"}


def _resolve_column(header: str) -> Optional[str]:
    h = header.strip().lower()
    for canonical, aliases in COLUMN_ALIASES.items():
        if h in aliases:
            return canonical
    return None


def _parse_numeric(val) -> Optional[float]:
    if val is None or str(val).strip() in ("", "-", "N/A", "n/a"):
        return None
    try:
        return float(str(val).replace(",", "").replace("$", "").replace("%", "").strip())
    except Exception:
        return None


def validate_cost_overrun_file(file_bytes: bytes, filename: str):
    """Returns (parsed_rows, column_map, errors, warnings). parsed_rows are normalized,
    ready to feed straight into the trainer (project_type, the 6 numeric features,
    overrun, overrun_pct — budget/actual_cost already reduced to that pair)."""
    errors: list[str] = []
    warnings: list[str] = []
    rows_raw: list[dict] = []
    headers: list[str] = []
    fname = (filename or "").lower()

    if fname.endswith(".csv"):
        text = file_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = list(reader.fieldnames or [])
        rows_raw = list(reader)
    elif fname.endswith((".xlsx", ".xls")):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            ws = wb.active
            rows_iter = iter(ws.rows)
            header_row = next(rows_iter, None)
            if not header_row:
                return [], {}, ["File appears empty"], []
            headers = [str(cell.value or "").strip() for cell in header_row]
            for row in rows_iter:
                rows_raw.append({
                    headers[i]: (cell.value if cell.value is not None else "")
                    for i, cell in enumerate(row)
                    if i < len(headers)
                })
        except ImportError:
            return [], {}, ["openpyxl not installed — cannot parse XLSX"], []
    else:
        return [], {}, [f"Unsupported file type '{filename}'. Upload a .csv or .xlsx file."], []

    headers = [h for h in headers if h.strip()]
    if not headers:
        return [], {}, ["No column headers found in file"], []

    column_map: dict[str, str] = {}
    canonical_to_file: dict[str, str] = {}
    unrecognized: list[str] = []
    for h in headers:
        canonical = _resolve_column(h)
        if canonical:
            if canonical not in canonical_to_file:
                column_map[h] = canonical
                canonical_to_file[canonical] = h
        else:
            unrecognized.append(h)
    if unrecognized:
        warnings.append(f"Unrecognized columns (ignored): {', '.join(unrecognized)}")

    present = set(canonical_to_file.keys())
    missing_numeric = _REQUIRED_NUMERIC - present
    has_label_a = _LABEL_FORM_A.issubset(present)
    has_label_b = _LABEL_FORM_B.issubset(present)

    if missing_numeric or not (has_label_a or has_label_b):
        if missing_numeric:
            errors.append(f"Missing required columns: {', '.join(sorted(missing_numeric))}.")
        if not (has_label_a or has_label_b):
            errors.append(
                "Missing an outcome label — provide either 'overrun' + 'overrun_pct', "
                "or 'budget' + 'actual_cost' so overrun can be derived."
            )
        return [], column_map, errors, warnings

    label_mode = "direct" if has_label_a else "derived"

    parsed_rows: list[dict] = []
    for row_idx, raw in enumerate(rows_raw, start=2):
        row: dict = {}
        skip_reason = None
        for file_header, canonical in column_map.items():
            val = raw.get(file_header, "")
            if canonical == "project_type":
                row["project_type"] = str(val).strip() or "Commercial"
                continue
            num = _parse_numeric(val)
            if canonical in _REQUIRED_NUMERIC and num is None:
                skip_reason = f"could not parse '{canonical}' value '{val}'"
                break
            row[canonical] = num

        if skip_reason:
            warnings.append(f"Row {row_idx}: {skip_reason} — row skipped")
            continue

        row.setdefault("project_type", "Commercial")

        if label_mode == "direct":
            if row.get("overrun") is None or row.get("overrun_pct") is None:
                warnings.append(f"Row {row_idx}: missing overrun/overrun_pct — row skipped")
                continue
            row["overrun"] = int(bool(row["overrun"]))
        else:
            budget, actual = row.get("budget"), row.get("actual_cost")
            if not budget or budget <= 0 or actual is None:
                warnings.append(f"Row {row_idx}: missing/invalid budget or actual_cost — row skipped")
                continue
            row["overrun"] = int(actual > budget)
            row["overrun_pct"] = round((actual / budget - 1) * 100, 2)
        row.pop("budget", None)
        row.pop("actual_cost", None)

        parsed_rows.append(row)

    if not parsed_rows:
        errors.append("No valid rows could be parsed from this file — check the warnings for details.")

    return parsed_rows, column_map, errors, warnings
