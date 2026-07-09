import io
import csv
import json
import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from app.services.db_service import supabase
from app.ai.financial_budget_analyzer import extract_budget_items
from app.ocr.document_processor import process_document

router = APIRouter()

# ── Column alias mappings (case-insensitive) ──────────────────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "code": [
        "code", "cost code", "cost_code", "item code", "item_code",
        "#", "no", "no.", "item no", "item no.", "item number", "line", "line no",
    ],
    "description": [
        "description", "desc", "item description", "item_description", "name",
        "item name", "line item", "line description", "work description",
    ],
    "div_code": [
        "div_code", "division code", "division_code", "div", "csi division",
        "csi_division", "csi", "division #", "div #",
    ],
    "div_name": [
        "div_name", "division name", "division_name", "division",
        "category", "category name",
    ],
    "original_budget": [
        "original_budget", "original budget", "original budget amount",
        "budget", "original amount", "original_amount", "orig budget",
        "orig_budget", "base budget", "base_budget", "contract amount",
        "budgeted amount", "budgeted_amount",
    ],
    "budget_mods": [
        "budget_mods", "budget modifications", "budget_modifications",
        "modifications", "mods", "budget mod", "budget adjustment",
    ],
    "approved_cos": [
        "approved_cos", "approved cos", "approved cos amount",
        "change orders", "change_orders", "cos", "co",
        "approved change orders", "approved changes",
    ],
    "revised_budget": [
        "revised_budget", "revised budget", "revised budget amount",
        "adjusted budget", "current budget",
    ],
    "pending_changes": [
        "pending_changes", "pending changes", "pending budget changes",
        "pending", "pending co", "unapproved changes", "open changes",
    ],
    "projected_budget": [
        "projected_budget", "projected budget", "projected budget amount",
        "projected", "forecast budget", "projected final cost",
    ],
    "committed_costs": [
        "committed_costs", "committed costs", "committed costs amount",
        "committed", "total committed", "subcontract committed",
    ],
    "direct_costs": [
        "direct_costs", "direct costs", "direct costs amount",
        "direct", "actual direct", "direct expenses", "actual amount", "actual_amount",
    ],
}

REQUIRED_COLUMNS = {"description", "original_budget"}

COLUMN_MAX_LENGTHS: dict[str, int] = {
    "code":        50,
    "description": 500,
    "div_code":    20,
    "div_name":    200,
}

MAX_ROWS    = 10_000
MAX_NUMERIC = 1_000_000_000


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
    """Parse and validate a CSV or XLSX file. Returns (rows, col_map, errors, warnings)."""
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
                warnings.append(f"Duplicate mapping for '{canonical}' — ignoring '{h}'")
        else:
            unrecognized.append(h)

    if unrecognized:
        warnings.append(f"Unrecognized columns (ignored): {', '.join(unrecognized)}")

    missing = REQUIRED_COLUMNS - set(canonical_to_file.keys())
    if missing:
        errors.append(f"Missing required columns: {', '.join(sorted(missing))}. "
                      f"Column names are matched case-insensitively. "
                      f"Accepted names for 'description': description, desc, name, item name. "
                      f"Accepted names for 'original_budget': original_budget, budget, budgeted amount.")

    if errors:
        return [], column_map, errors, warnings

    if len(rows_raw) > MAX_ROWS:
        errors.append(f"File has {len(rows_raw):,} rows. Maximum allowed is {MAX_ROWS:,}.")
        return [], column_map, errors, warnings

    parsed_rows: list[dict] = []
    row_errors: list[str] = []

    for row_idx, raw in enumerate(rows_raw, start=2):
        row: dict = {}
        cell_ok = True

        for file_header, canonical in column_map.items():
            val = raw.get(file_header, "")
            if canonical in COLUMN_MAX_LENGTHS:
                max_len = COLUMN_MAX_LENGTHS[canonical]
                if len(str(val)) > max_len:
                    row_errors.append(f"Row {row_idx}, '{canonical}': value too long (max {max_len} chars)")
                    cell_ok = False
                    continue
            if canonical in (
                "original_budget", "budget_mods", "approved_cos", "revised_budget",
                "pending_changes", "projected_budget", "committed_costs", "direct_costs",
            ):
                num = _parse_numeric(val)
                if num is None:
                    row_errors.append(f"Row {row_idx}, '{canonical}': not a number — got '{val}'")
                    cell_ok = False
                elif abs(num) > MAX_NUMERIC:
                    row_errors.append(f"Row {row_idx}, '{canonical}': exceeds $1B limit")
                    cell_ok = False
                else:
                    row[canonical] = num
            else:
                row[canonical] = str(val).strip()

        if not cell_ok:
            continue

        row.setdefault("code", str(row_idx - 1).zfill(4))
        row.setdefault("div_code", "00")
        row.setdefault("div_name", "Uncategorized")
        for col in ("budget_mods", "approved_cos", "pending_changes", "committed_costs", "direct_costs"):
            row.setdefault(col, 0.0)

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


def _save_budget_items(
    parsed_rows: list[dict],
    project_id: str,
    company_name: str,
    file_name: str,
    notes: str,
    user_name: str,
) -> dict:
    """Shared save logic used by both file-based and JSON-based import."""
    import_rec = supabase.table("financial_imports").insert({
        "project_id":   project_id if project_id != "all" else None,
        "company_name": company_name,
        "file_name":    file_name,
        "row_count":    len(parsed_rows),
        "notes":        notes,
        "status":       "completed",
    }).execute()
    import_id = import_rec.data[0]["id"] if import_rec.data else None

    if project_id and project_id != "all":
        supabase.table("financial_budget_items").delete().eq("project_id", project_id).execute()

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

    total_orig = sum(r.get("original_budget", 0) for r in parsed_rows)
    supabase.table("financial_change_history").insert({
        "project_id": project_id if project_id != "all" else None,
        "date":       datetime.date.today().isoformat(),
        "user_name":  user_name or company_name,
        "field":      "Budget Import",
        "division":   "All Divisions",
        "delta":      total_orig,
        "reason": (
            f"Imported {len(parsed_rows)} line items from {file_name}"
            + (f" — {notes}" if notes else "")
        ),
    }).execute()

    # A file import replaces the project's entire itemized breakdown in one deliberate,
    # user-confirmed action (unlike a single line-item edit), so syncing the canonical
    # budget here is the explicit outcome the user asked for by importing — not a
    # silent side effect. Single item add/edit/delete do NOT auto-sync; see
    # /budget-sync-preview and /sync-project-budget for that gated flow.
    synced_budget = None
    real_pid = project_id if project_id != "all" else None
    if real_pid:
        synced_budget = _itemized_total(real_pid)
        supabase.table("projects").update({"budget": synced_budget}).eq("id", real_pid).execute()

    return {"imported_rows": len(parsed_rows), "import_id": import_id, "project_budget": synced_budget}


# ── Live cost allocation ───────────────────────────────────────────────────────
# There is no column linking a specific invoice or cost entry to a specific CSI
# line item, so exact per-item attribution isn't possible. Instead, each project's
# live direct/committed totals (the same figures the KPI cards and /live-actuals
# use) are distributed across that project's line items in proportion to their
# share of original_budget. This keeps the Grand Total row equal to the live KPI
# totals instead of drifting from whatever was typed in at import/creation time.

def _compute_live_totals(project_ids: list[str]) -> dict[str, dict]:
    totals = {pid: {"direct_costs": 0.0, "committed_costs": 0.0} for pid in project_ids}
    if not project_ids:
        return totals
    try:
        cost_rows = supabase.table("cost_entries").select("project_id,amount").in_("project_id", project_ids).execute().data or []
        for r in cost_rows:
            pid = r.get("project_id")
            if pid in totals:
                totals[pid]["direct_costs"] += float(r.get("amount") or 0)
    except Exception:
        pass
    try:
        inv_rows = supabase.table("invoices").select("project_id,amount,status").in_("project_id", project_ids).execute().data or []
        for r in inv_rows:
            pid = r.get("project_id")
            if pid in totals and r.get("status") in ("pending", "overdue"):
                totals[pid]["committed_costs"] += float(r.get("amount") or 0)
    except Exception:
        pass
    return totals


def _apply_live_costs(items: list[dict]) -> None:
    """Overwrite each item's committed_costs/direct_costs in place with a live,
    proportionally-allocated value. Items without a project_id (rare — only
    possible for imports done with no project selected) are left untouched."""
    by_project: dict[str, list[dict]] = {}
    for it in items:
        pid = it.get("project_id")
        if pid:
            by_project.setdefault(pid, []).append(it)
    if not by_project:
        return

    live = _compute_live_totals(list(by_project.keys()))
    for pid, group in by_project.items():
        proj_totals = live.get(pid, {"direct_costs": 0.0, "committed_costs": 0.0})
        weight_total = sum(float(it.get("original_budget") or 0) for it in group)
        for field in ("direct_costs", "committed_costs"):
            target = proj_totals[field]
            allocated = 0.0
            # Round every item except the last, then give the last item whatever's
            # left — rounding each share independently can make the parts sum to a
            # cent or two off the live total, which would make the Grand Total row
            # disagree with the KPI card by a penny.
            for it in group[:-1]:
                weight = float(it.get("original_budget") or 0)
                share = (weight / weight_total) if weight_total > 0 else (1 / len(group))
                it[field] = round(target * share, 2)
                allocated += it[field]
            if group:
                group[-1][field] = round(target - allocated, 2)


# ── GET endpoints ──────────────────────────────────────────────────────────────

@router.get("/live-actuals")
def get_live_actuals(project_id: Optional[str] = None):
    """Return live budget figures from projects, cost_entries, invoices, and cost_codes.
    These are the single source of truth for KPI cards — independent of imported budget items."""
    pid = project_id if project_id and project_id != "all" else None

    # Project budget (canonical)
    try:
        pq = supabase.table("projects").select("id,budget,name")
        if pid:
            pq = pq.eq("id", pid)
        proj_rows = pq.execute().data or []
        project_budget = sum(float(r.get("budget") or 0) for r in proj_rows)
    except Exception:
        project_budget = 0.0

    # Direct costs from cost_entries
    try:
        cq = supabase.table("cost_entries").select("amount,category")
        if pid:
            cq = cq.eq("project_id", pid)
        cost_rows = cq.execute().data or []
        direct_costs   = sum(float(r.get("amount") or 0) for r in cost_rows)
        by_category: dict[str, float] = {}
        for r in cost_rows:
            cat = r.get("category") or "Other"
            by_category[cat] = by_category.get(cat, 0) + float(r.get("amount") or 0)
    except Exception:
        direct_costs = 0.0
        by_category  = {}

    # Committed + received from invoices
    try:
        iq = supabase.table("invoices").select("amount,status")
        if pid:
            iq = iq.eq("project_id", pid)
        inv_rows = iq.execute().data or []
        # Committed = obligated, unpaid (pending/overdue). invoices.status only ever
        # takes received/pending/overdue, so this — not "approved", which never
        # occurs — must match db_service.get_projects() and accounting.py exactly,
        # or "Committed Costs" disagrees across pages for the same project.
        committed = sum(float(r.get("amount") or 0) for r in inv_rows if r.get("status") in ("pending", "overdue"))
        received  = sum(float(r.get("amount") or 0) for r in inv_rows if r.get("status") == "received")
    except Exception:
        committed = 0.0
        received  = 0.0

    # Financial budget items total (for discrepancy check)
    try:
        fq = supabase.table("financial_budget_items").select("original_budget")
        if pid:
            fq = fq.eq("project_id", pid)
        fi_rows = fq.execute().data or []
        financial_items_total = sum(float(r.get("original_budget") or 0) for r in fi_rows)
        has_financial_items   = len(fi_rows) > 0
    except Exception:
        financial_items_total = 0.0
        has_financial_items   = False

    # Cost codes (construction module)
    try:
        ccq = supabase.table("cost_codes").select("budgeted_amount,actual_amount")
        if pid:
            ccq = ccq.eq("project_id", pid)
        cc_rows = ccq.execute().data or []
        cost_codes_budget = sum(float(r.get("budgeted_amount") or 0) for r in cc_rows)
        cost_codes_actual = sum(float(r.get("actual_amount")   or 0) for r in cc_rows)
        cost_codes_count  = len(cc_rows)
    except Exception:
        cost_codes_budget = 0.0
        cost_codes_actual = 0.0
        cost_codes_count  = 0

    discrepancy_pct = (
        abs(financial_items_total - project_budget) / project_budget * 100
        if has_financial_items and project_budget > 0 else 0.0
    )

    return {
        "project_budget":        project_budget,
        "direct_costs":          direct_costs,
        "committed_costs":       committed,
        "received_from_invoices": received,
        "financial_items_total": financial_items_total,
        "has_financial_items":   has_financial_items,
        "cost_codes_count":      cost_codes_count,
        "cost_codes_budget":     cost_codes_budget,
        "cost_codes_actual":     cost_codes_actual,
        "spend_by_category":     by_category,
        "discrepancy_pct":       round(discrepancy_pct, 2),
        "in_sync": discrepancy_pct < 1.0,
        "utilization_pct": round(direct_costs / project_budget * 100, 1) if project_budget > 0 else 0.0,
    }


@router.get("/budget-items")
def get_budget_items(project_id: Optional[str] = None):
    try:
        query = supabase.table("financial_budget_items").select("*")
        if project_id and project_id != "all":
            query = query.eq("project_id", project_id)
        res = query.order("div_code").order("code").execute()
        items = res.data or []
        _apply_live_costs(items)
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _itemized_total(project_id: str) -> float:
    items = (
        supabase.table("financial_budget_items")
        .select("original_budget")
        .eq("project_id", project_id)
        .execute()
        .data or []
    )
    return sum(float(i.get("original_budget") or 0) for i in items)


@router.post("/items")
def create_budget_item(body: dict):
    """Create a single budget line item."""
    try:
        row = {
            "project_id":       body.get("project_id") or None,
            "code":             str(body.get("code") or "").strip()[:50],
            "description":      str(body.get("description") or "").strip()[:500],
            "div_code":         str(body.get("div_code") or "00").strip()[:20],
            "div_name":         str(body.get("div_name") or "Uncategorized").strip()[:200],
            "original_budget":  float(body.get("original_budget") or 0),
            "budget_mods":      float(body.get("budget_mods") or 0),
            "approved_cos":     float(body.get("approved_cos") or 0),
            "revised_budget":   float(body.get("revised_budget") or 0),
            "pending_changes":  float(body.get("pending_changes") or 0),
            "projected_budget": float(body.get("projected_budget") or 0),
            "committed_costs":  float(body.get("committed_costs") or 0),
            "direct_costs":     float(body.get("direct_costs") or 0),
        }
        if not row["description"]:
            raise HTTPException(status_code=422, detail="description is required")
        res = supabase.table("financial_budget_items").insert(row).execute()
        return {"item": res.data[0] if res.data else row}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/items/{item_id}")
def update_budget_item(item_id: str, body: dict):
    """Update a single budget line item by id."""
    try:
        allowed = {
            "code", "description", "div_code", "div_name",
            "original_budget", "budget_mods", "approved_cos", "revised_budget",
            "pending_changes", "projected_budget", "committed_costs", "direct_costs",
        }
        update: dict = {}
        for k in allowed:
            if k in body:
                if k in ("code", "description", "div_code", "div_name"):
                    update[k] = str(body[k]).strip()
                else:
                    update[k] = float(body[k] or 0)
        if not update:
            raise HTTPException(status_code=422, detail="No valid fields to update")
        res = supabase.table("financial_budget_items").update(update).eq("id", item_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"item": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/items/{item_id}")
def delete_budget_item(item_id: str):
    """Delete a single budget line item by id."""
    try:
        supabase.table("financial_budget_items").delete().eq("id", item_id).execute()
        return {"deleted": item_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/items")
def delete_all_budget_items(project_id: str):
    """
    Delete every budget line item for one project. Destructive and irreversible —
    scoped to a single project (never "all") to bound the blast radius. The UI
    must gate this behind an explicit, typed-out-loud confirmation; this endpoint
    performs no confirmation of its own.
    """
    if not project_id or project_id == "all":
        raise HTTPException(status_code=422, detail="A specific project_id is required")
    try:
        rows = (
            supabase.table("financial_budget_items")
            .select("id,original_budget")
            .eq("project_id", project_id)
            .execute()
            .data or []
        )
        if not rows:
            return {"deleted_count": 0, "deleted_total": 0.0}

        supabase.table("financial_budget_items").delete().eq("project_id", project_id).execute()

        deleted_total = sum(float(r.get("original_budget") or 0) for r in rows)
        supabase.table("financial_change_history").insert({
            "project_id": project_id,
            "date":       datetime.date.today().isoformat(),
            "user_name":  "User",
            "field":      "Delete All",
            "division":   "All Divisions",
            "delta":      -deleted_total,
            "reason":     f"Deleted all {len(rows)} budget line items",
        }).execute()

        return {"deleted_count": len(rows), "deleted_total": deleted_total}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget-sync-preview")
def budget_sync_preview(project_id: str):
    """
    Compare the project's canonical budget (projects.budget) against the sum of its
    financial_budget_items.original_budget, without changing anything. Itemized
    breakdowns are frequently partial (not every division entered yet), so this is
    a preview step — the actual write only happens via POST /sync-project-budget,
    which the UI gates behind an explicit confirmation showing this same comparison.
    """
    try:
        proj_rows = supabase.table("projects").select("budget,name").eq("id", project_id).execute().data or []
        if not proj_rows:
            raise HTTPException(status_code=404, detail="Project not found")
        current_budget = float(proj_rows[0].get("budget") or 0)
        itemized_total = _itemized_total(project_id)
        return {
            "project_id":      project_id,
            "project_name":    proj_rows[0].get("name"),
            "current_budget":  current_budget,
            "itemized_total":  itemized_total,
            "difference":      round(itemized_total - current_budget, 2),
            "in_sync":         abs(itemized_total - current_budget) < 1.0,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-project-budget")
def sync_project_budget(body: dict):
    """
    Explicitly overwrite the project's canonical budget (projects.budget) with the
    sum of its financial_budget_items.original_budget. Requires the caller to have
    already reviewed /budget-sync-preview — this endpoint performs no confirmation
    of its own, so the UI must gate it behind a user-facing before/after prompt.
    """
    project_id = body.get("project_id")
    if not project_id:
        raise HTTPException(status_code=422, detail="project_id is required")
    try:
        proj_rows = supabase.table("projects").select("budget").eq("id", project_id).execute().data or []
        if not proj_rows:
            raise HTTPException(status_code=404, detail="Project not found")
        old_budget = float(proj_rows[0].get("budget") or 0)
        new_budget = _itemized_total(project_id)
        supabase.table("projects").update({"budget": new_budget}).eq("id", project_id).execute()
        return {"project_id": project_id, "old_budget": old_budget, "new_budget": new_budget}
    except HTTPException:
        raise
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


@router.delete("/change-history")
def delete_all_change_history(project_id: str):
    """
    Delete every change-history entry for one project. Destructive and irreversible
    (clears the audit trail itself) — scoped to a single project, never "all". The
    UI must gate this behind an explicit confirmation; this endpoint doesn't.
    """
    if not project_id or project_id == "all":
        raise HTTPException(status_code=422, detail="A specific project_id is required")
    try:
        rows = (
            supabase.table("financial_change_history")
            .select("id")
            .eq("project_id", project_id)
            .execute()
            .data or []
        )
        if not rows:
            return {"deleted_count": 0}
        supabase.table("financial_change_history").delete().eq("project_id", project_id).execute()
        return {"deleted_count": len(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
def export_budget(project_id: Optional[str] = None):
    """Download current budget items as CSV."""
    try:
        query = supabase.table("financial_budget_items").select("*")
        if project_id and project_id != "all":
            query = query.eq("project_id", project_id)
        res = query.order("div_code").order("code").execute()
        items = res.data or []
        _apply_live_costs(items)
    except Exception:
        items = []

    fieldnames = [
        "code", "description", "div_code", "div_name",
        "original_budget", "budget_mods", "approved_cos", "revised_budget",
        "pending_changes", "projected_budget", "committed_costs", "direct_costs",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for item in items:
        writer.writerow({k: item.get(k, "") for k in fieldnames})
    output.seek(0)

    pid_label = project_id or "all"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=financial_budget_{pid_label}.csv"},
    )


@router.get("/sync-from-modules")
def sync_from_modules(project_id: str):
    """Preview budget items derived from construction cost codes + invoice data.
    Does NOT save — caller confirms via /import/from-items."""
    try:
        cost_res = supabase.table("cost_codes").select("*").eq("project_id", project_id).execute()
        cost_codes = cost_res.data or []
    except Exception:
        cost_codes = []

    try:
        inv_res = supabase.table("invoices").select("amount,status").eq("project_id", project_id).execute()
        invoices = inv_res.data or []
    except Exception:
        invoices = []

    total_direct    = sum(i.get("amount", 0) for i in invoices if i.get("status") == "received")
    total_committed = sum(i.get("amount", 0) for i in invoices if i.get("status") in ("pending", "overdue"))

    items = []
    for cc in cost_codes:
        orig  = float(cc.get("budgeted_amount") or 0)
        actual = float(cc.get("actual_amount") or 0)
        items.append({
            "code":             cc.get("code", ""),
            "description":      cc.get("description", ""),
            "div_code":         "00",
            "div_name":         cc.get("category") or "Uncategorized",
            "original_budget":  orig,
            "budget_mods":      0.0,
            "approved_cos":     0.0,
            "revised_budget":   orig,
            "pending_changes":  0.0,
            "projected_budget": orig,
            "committed_costs":  0.0,
            "direct_costs":     actual,
        })

    return {
        "items": items,
        "summary": {
            "cost_codes_count":          len(cost_codes),
            "total_direct_from_invoices":    total_direct,
            "total_committed_from_invoices": total_committed,
        },
    }


# ── Import endpoints ───────────────────────────────────────────────────────────

@router.post("/import/validate")
async def validate_import(file: UploadFile = File(...)):
    """Step 1 — validate CSV/XLSX columns (no DB writes)."""
    file_bytes = await file.read()
    parsed_rows, column_map, errors, warnings = _validate_file(
        file_bytes, file.filename or "upload"
    )
    mapping_display = [{"file_header": h, "canonical": c} for h, c in column_map.items()]
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
    """Step 2 — re-validate and save CSV/XLSX to DB."""
    file_bytes = await file.read()
    parsed_rows, _col_map, errors, _warnings = _validate_file(
        file_bytes, file.filename or "upload"
    )
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    if not parsed_rows:
        raise HTTPException(status_code=422, detail={"errors": ["No valid rows to import"]})

    try:
        result = _save_budget_items(
            parsed_rows, project_id, company_name,
            file.filename or "upload", notes, user_name,
        )
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/from-items")
async def import_from_items(
    project_id:   str = Form(...),
    company_name: str = Form(...),
    notes:        str = Form(""),
    user_name:    str = Form("User"),
    source:       str = Form("ai_extraction"),
    items:        str = Form(...),
):
    """Save pre-extracted budget items as JSON (from AI extraction or module sync)."""
    try:
        parsed_rows = json.loads(items)
    except Exception:
        raise HTTPException(status_code=422, detail={"errors": ["Invalid JSON in items field"]})

    if not parsed_rows:
        raise HTTPException(status_code=422, detail={"errors": ["No items to import"]})

    try:
        result = _save_budget_items(
            parsed_rows, project_id, company_name,
            source, notes, user_name,
        )
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract")
async def ai_extract_budget(file: UploadFile = File(...)):
    """AI-powered extraction from any document (PDF, Word, Excel, CSV)."""
    file_bytes = await file.read()
    filename = file.filename or "upload"
    fname = filename.lower()

    # For structured files, try column-mapping first; fall back to AI if too few columns matched
    if fname.endswith((".csv", ".xlsx", ".xls")):
        parsed_rows, col_map, errors, warnings = _validate_file(file_bytes, filename)
        if not errors and len(parsed_rows) > 0:
            return {
                "items":         parsed_rows,
                "row_count":     len(parsed_rows),
                "source":        "structured_parse",
                "column_mapping": [{"file_header": h, "canonical": c} for h, c in col_map.items()],
                "warnings":      warnings,
            }

    # AI extraction path for PDF/Word or when structured parse fails
    doc = process_document(file_bytes, filename)
    text = (doc.get("extracted_text") or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from file. Ensure it is a readable PDF, Word, Excel, or CSV document."
        )

    items = extract_budget_items(text)
    if not items:
        raise HTTPException(
            status_code=422,
            detail="No budget items could be identified. Ensure the document contains cost codes, descriptions, and amounts."
        )

    return {
        "items":     items,
        "row_count": len(items),
        "source":    "ai_extraction",
        "warnings":  [],
    }
