import io
import csv
import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from app.services.db_service import supabase

router = APIRouter()

# ── Column alias mappings (lowercase) ─────────────────────────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "code":             [
        "code", "cost code", "cost_code", "item code", "item_code",
        "#", "no", "no.", "item no", "item no.", "item number", "line", "line no",
    ],
    "description":      [
        "description", "desc", "item description", "item_description", "name",
        "item name", "line item", "line description", "work description",
    ],
    "div_code":         [
        "div_code", "division code", "division_code", "div", "csi division",
        "csi_division", "csi", "division #", "div #",
    ],
    "div_name":         [
        "div_name", "division name", "division_name", "division",
        "category", "category name",
    ],
    "original_budget":  [
        "original_budget", "original budget", "original budget amount",
        "budget", "original amount", "original_amount", "orig budget",
        "orig_budget", "base budget", "base_budget", "contract amount",
    ],
    "budget_mods":      [
        "budget_mods", "budget modifications", "budget_modifications",
        "modifications", "mods", "budget mod", "budget adjustment",
    ],
    "approved_cos":     [
        "approved_cos", "approved cos", "approved cos amount",
        "change orders", "change_orders", "cos", "co",
        "approved change orders", "approved changes",
    ],
    "revised_budget":   [
        "revised_budget", "revised budget", "revised budget amount",
        "adjusted budget", "current budget",
    ],
    "pending_changes":  [
        "pending_changes", "pending changes", "pending budget changes",
        "pending budget changes amount", "pending", "pending co",
        "unapproved changes", "open changes",
    ],
    "projected_budget": [
        "projected_budget", "projected budget", "projected budget amount",
        "projected", "forecast budget", "projected final cost",
    ],
    "committed_costs":  [
        "committed_costs", "committed costs", "committed costs amount",
        "committed", "total committed", "subcontract committed",
    ],
    "direct_costs":     [
        "direct_costs", "direct costs", "direct costs amount",
        "direct", "actual direct", "direct expenses",
    ],
}

# code is optional — will be auto-generated as row index if absent
REQUIRED_COLUMNS = {"description", "original_budget"}

COLUMN_MAX_LENGTHS: dict[str, int] = {
    "code":        50,
    "description": 500,
    "div_code":    20,
    "div_name":    200,
}

MAX_ROWS    = 10_000
MAX_NUMERIC = 1_000_000_000  # $1 B per cell


def _resolve_column(header: str) -> Optional[str]:
    h = header.strip().lower()
    for canonical, aliases in COLUMN_ALIASES.items():
        if h in aliases:
            return canonical
    return None


def _parse_numeric(val) -> Optional[float]:
    if val is None or str(val).strip() in ("", "-", "N/A", "n/a"):
        return 0.0
    try:
        return float(str(val).replace(",", "").replace("$", "").replace(" ", ""))
    except Exception:
        return None


def _validate_file(file_bytes: bytes, filename: str):
    """Parse and validate a CSV or XLSX file.

    Returns (parsed_rows, column_map, errors, warnings).
    """
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
        return [], {}, [f"Unsupported file type '{filename}'. Use .csv, .xlsx, or .xls."], []

    # Drop empty/blank headers (trailing commas in CSV, empty cells in XLSX)
    headers = [h for h in headers if h.strip()]

    if not headers:
        return [], {}, ["No column headers found in file"], []

    # Check header lengths
    for h in headers:
        if len(h) > 100:
            errors.append(f"Column header too long (>100 chars): '{h[:40]}…'")

    # Map file headers → canonical column names
    column_map: dict[str, str] = {}       # file_header -> canonical
    canonical_to_file: dict[str, str] = {}  # canonical  -> file_header
    unrecognized: list[str] = []

    for h in headers:
        canonical = _resolve_column(h)
        if canonical:
            if canonical not in canonical_to_file:
                column_map[h] = canonical
                canonical_to_file[canonical] = h
            else:
                warnings.append(f"Duplicate mapping for '{canonical}' — using first occurrence, ignoring '{h}'")
        else:
            unrecognized.append(h)

    if unrecognized:
        warnings.append(f"Unrecognized columns (will be ignored): {', '.join(unrecognized)}")

    # Check required columns
    missing = REQUIRED_COLUMNS - set(canonical_to_file.keys())
    if missing:
        errors.append(f"Missing required columns: {', '.join(sorted(missing))}")

    if errors:
        return [], column_map, errors, warnings

    # Row count guard
    if len(rows_raw) > MAX_ROWS:
        errors.append(f"File has {len(rows_raw):,} rows. Maximum allowed is {MAX_ROWS:,}.")
        return [], column_map, errors, warnings

    # Parse rows
    parsed_rows: list[dict] = []
    row_errors: list[str] = []

    for row_idx, raw in enumerate(rows_raw, start=2):  # row 1 = header
        row: dict = {}
        cell_ok = True

        for file_header, canonical in column_map.items():
            val = raw.get(file_header, "")

            # Text column length check
            if canonical in COLUMN_MAX_LENGTHS:
                max_len = COLUMN_MAX_LENGTHS[canonical]
                if len(str(val)) > max_len:
                    row_errors.append(
                        f"Row {row_idx}, '{canonical}': value too long (max {max_len} chars)"
                    )
                    cell_ok = False
                    continue

            # Numeric columns
            if canonical in (
                "original_budget", "budget_mods", "approved_cos", "revised_budget",
                "pending_changes", "projected_budget", "committed_costs", "direct_costs",
            ):
                num = _parse_numeric(val)
                if num is None:
                    row_errors.append(
                        f"Row {row_idx}, '{canonical}': not a valid number — got '{val}'"
                    )
                    cell_ok = False
                elif abs(num) > MAX_NUMERIC:
                    row_errors.append(
                        f"Row {row_idx}, '{canonical}': value exceeds $1B limit"
                    )
                    cell_ok = False
                else:
                    row[canonical] = num
            else:
                row[canonical] = str(val).strip()

        if not cell_ok:
            continue  # skip bad rows; errors already recorded

        # Auto-generate code if not present in file
        row.setdefault("code", str(row_idx - 1).zfill(4))
        # Defaults for optional columns
        row.setdefault("div_code", "00")
        row.setdefault("div_name", "Uncategorized")
        for col in ("budget_mods", "approved_cos", "pending_changes", "committed_costs", "direct_costs"):
            row.setdefault(col, 0.0)

        # Auto-compute derived columns if absent
        if "revised_budget" not in row:
            row["revised_budget"] = (
                row.get("original_budget", 0)
                + row.get("budget_mods", 0)
                + row.get("approved_cos", 0)
            )
        if "projected_budget" not in row:
            row["projected_budget"] = row["revised_budget"] + row.get("pending_changes", 0)

        parsed_rows.append(row)

    if row_errors:
        errors.extend(row_errors[:20])
        if len(row_errors) > 20:
            errors.append(f"… and {len(row_errors) - 20} more row errors")

    return parsed_rows, column_map, errors, warnings


# ── GET endpoints ──────────────────────────────────────────────────────────────

@router.get("/budget-items")
def get_budget_items(project_id: Optional[str] = None):
    try:
        query = supabase.table("financial_budget_items").select("*")
        if project_id and project_id != "all":
            query = query.eq("project_id", project_id)
        res = query.order("div_code").order("code").execute()
        return {"items": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/change-history")
def get_change_history(project_id: Optional[str] = None):
    try:
        query = (
            supabase.table("financial_change_history")
            .select("*")
            .order("date", desc=True)
            .limit(100)
        )
        if project_id and project_id != "all":
            query = query.eq("project_id", project_id)
        res = query.execute()
        return {"history": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Import endpoints ───────────────────────────────────────────────────────────

@router.post("/import/validate")
async def validate_import(file: UploadFile = File(...)):
    """Step 1 — validate file columns and data preview (no DB writes)."""
    file_bytes = await file.read()
    parsed_rows, column_map, errors, warnings = _validate_file(
        file_bytes, file.filename or "upload"
    )

    mapping_display = [
        {"file_header": h, "canonical": c}
        for h, c in column_map.items()
    ]

    return {
        "valid":          len(errors) == 0,
        "errors":         errors,
        "warnings":       warnings,
        "row_count":      len(parsed_rows),
        "column_mapping": mapping_display,
        "preview":        parsed_rows[:5],
    }


@router.post("/import/confirm")
async def confirm_import(
    file:         UploadFile = File(...),
    project_id:   str = Form(...),
    company_name: str = Form(...),
    notes:        str = Form(""),
    user_name:    str = Form("User"),
):
    """Step 2 — re-validate, save to DB, log change history."""
    file_bytes = await file.read()
    parsed_rows, _col_map, errors, _warnings = _validate_file(
        file_bytes, file.filename or "upload"
    )

    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    if not parsed_rows:
        raise HTTPException(status_code=422, detail={"errors": ["No valid rows to import"]})

    try:
        # Save import metadata
        import_rec = supabase.table("financial_imports").insert({
            "project_id":   project_id if project_id != "all" else None,
            "company_name": company_name,
            "file_name":    file.filename or "upload",
            "row_count":    len(parsed_rows),
            "notes":        notes,
            "status":       "completed",
        }).execute()
        import_id = import_rec.data[0]["id"] if import_rec.data else None

        # Replace existing items for this project
        if project_id and project_id != "all":
            supabase.table("financial_budget_items").delete().eq("project_id", project_id).execute()

        # Insert in batches of 500
        batch: list[dict] = [
            {
                "project_id":       project_id if project_id != "all" else None,
                "code":             row.get("code", ""),
                "description":      row.get("description", ""),
                "div_code":         row.get("div_code", "00"),
                "div_name":         row.get("div_name", "Uncategorized"),
                "original_budget":  row.get("original_budget", 0),
                "budget_mods":      row.get("budget_mods", 0),
                "approved_cos":     row.get("approved_cos", 0),
                "revised_budget":   row.get("revised_budget", 0),
                "pending_changes":  row.get("pending_changes", 0),
                "projected_budget": row.get("projected_budget", 0),
                "committed_costs":  row.get("committed_costs", 0),
                "direct_costs":     row.get("direct_costs", 0),
                "import_id":        import_id,
            }
            for row in parsed_rows
        ]
        for i in range(0, len(batch), 500):
            supabase.table("financial_budget_items").insert(batch[i : i + 500]).execute()

        # Log to change history
        total_orig = sum(r.get("original_budget", 0) for r in parsed_rows)
        supabase.table("financial_change_history").insert({
            "project_id": project_id if project_id != "all" else None,
            "date":       datetime.date.today().isoformat(),
            "user_name":  user_name or company_name,
            "field":      "Budget Import",
            "division":   "All Divisions",
            "delta":      total_orig,
            "reason": (
                f"Imported {len(parsed_rows)} line items from {file.filename or 'upload'}"
                + (f" — {notes}" if notes else "")
            ),
        }).execute()

        return {
            "status":        "success",
            "imported_rows": len(parsed_rows),
            "import_id":     import_id,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
