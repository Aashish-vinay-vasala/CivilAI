import io
import csv
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from app.services.db_service import supabase
from app.ai.material_price_analyzer import extract_material_prices
from app.ocr.document_processor import process_document

router = APIRouter()
logger = logging.getLogger("civilai.material_prices")

# ── Column alias mapping for structured CSV/XLSX parsing ──────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "material": ["material", "item", "name", "material name", "product"],
    "price":    ["price", "unit price", "unit_price", "cost", "rate", "amount"],
    "unit":     ["unit", "uom", "unit of measure", "unit_of_measure", "measure"],
    "notes":    ["notes", "note", "supplier", "source", "region", "comment", "comments"],
}
REQUIRED_COLUMNS = {"material", "price"}


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
        return float(str(val).replace(",", "").replace("$", "").replace(" ", ""))
    except Exception:
        return None


def _validate_material_file(file_bytes: bytes, filename: str):
    """Structured parse of a CSV/XLSX of material prices. Returns (rows, col_map, errors, warnings)."""
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
        return [], {}, [f"Unsupported file type '{filename}' for structured parse."], []

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

    missing = REQUIRED_COLUMNS - set(canonical_to_file.keys())
    if missing:
        errors.append(f"Missing required columns: {', '.join(sorted(missing))}. "
                      f"Accepted names for 'material': material, item, name. "
                      f"Accepted names for 'price': price, unit price, cost, rate.")
        return [], column_map, errors, warnings

    parsed_rows: list[dict] = []
    for row_idx, raw in enumerate(rows_raw, start=2):
        row: dict = {}
        for file_header, canonical in column_map.items():
            val = raw.get(file_header, "")
            if canonical == "price":
                num = _parse_numeric(val)
                if num is None:
                    warnings.append(f"Row {row_idx}: could not parse price '{val}' — row skipped")
                    row = None
                    break
                row["price"] = num
            else:
                row[canonical] = str(val).strip()
        if row is None or not row.get("material") or "price" not in row:
            continue
        row.setdefault("unit", "unit")
        row.setdefault("notes", None)
        parsed_rows.append(row)

    return parsed_rows, column_map, errors, warnings


# ── Pydantic bodies ────────────────────────────────────────────────────────────

class ManualPriceEntry(BaseModel):
    material: str
    price: float
    unit: str = "unit"
    notes: Optional[str] = None


class PriceEntryUpdate(BaseModel):
    price: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None


def _latest_price_for(material: str) -> Optional[float]:
    res = (
        supabase.table("material_prices")
        .select("price")
        .eq("material", material)
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    return float(res.data[0]["price"]) if res.data else None


# change_pct column is numeric(12,2) — cap well inside that so no computed swing can
# ever overflow the column.
_MAX_CHANGE_PCT = 999_999.99


def _change_pct(new_price: float, prior_price: Optional[float]) -> float:
    if not prior_price:
        return 0.0
    pct = ((new_price - prior_price) / prior_price) * 100
    return round(max(-_MAX_CHANGE_PCT, min(_MAX_CHANGE_PCT, pct)), 2)


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("/")
def list_material_prices(material: Optional[str] = Query(None), history: bool = Query(False)):
    try:
        if material and history:
            res = (
                supabase.table("material_prices")
                .select("*")
                .eq("material", material)
                .order("fetched_at", desc=True)
                .execute()
            )
            return {"status": "success", "history": res.data or []}

        res = supabase.table("material_prices").select("*").order("fetched_at", desc=True).execute()
        rows = res.data or []
        # Latest row per material.
        latest: dict[str, dict] = {}
        for r in rows:
            if r["material"] not in latest:
                latest[r["material"]] = r
        return {"status": "success", "prices": list(latest.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
def create_manual_price(body: ManualPriceEntry):
    try:
        prior = _latest_price_for(body.material)
        payload = {
            "material": body.material,
            "price": body.price,
            "unit": body.unit,
            "change_pct": _change_pct(body.price, prior),
            "year": datetime.now(timezone.utc).year,
            "source": "manual",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "notes": body.notes,
        }
        res = supabase.table("material_prices").insert(payload).execute()
        return {"status": "success", "entry": res.data[0] if res.data else payload}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{entry_id}")
def update_price_entry(entry_id: str, body: PriceEntryUpdate):
    try:
        existing_res = supabase.table("material_prices").select("*").eq("id", entry_id).execute()
        if not existing_res.data:
            raise HTTPException(status_code=404, detail="Price entry not found")
        existing = existing_res.data[0]

        updates: dict = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        # An edit overwrites this row in place rather than adding a new one, so the
        # only meaningful "before" value left to measure a swing against is whatever
        # this row's own price was right before the edit — not some other row for
        # the same material (which reflects a separate observation entirely).
        if "price" in updates:
            updates["change_pct"] = _change_pct(updates["price"], existing["price"])

        res = supabase.table("material_prices").update(updates).eq("id", entry_id).execute()
        return {"status": "success", "entry": res.data[0] if res.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{entry_id}")
def delete_price_entry(entry_id: str):
    try:
        supabase.table("material_prices").delete().eq("id", entry_id).execute()
        return {"status": "success", "deleted": entry_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Document upload → extract → review (no DB writes) ─────────────────────────

@router.post("/extract")
async def extract_prices_from_document(file: UploadFile = File(...)):
    file_bytes = await file.read()
    filename = file.filename or "upload"
    fname = filename.lower()

    if fname.endswith((".csv", ".xlsx", ".xls")):
        try:
            parsed_rows, col_map, errors, warnings = _validate_material_file(file_bytes, filename)
        except Exception:
            parsed_rows, col_map, errors, warnings = [], {}, ["Could not read spreadsheet"], []
        if not errors and len(parsed_rows) > 0:
            return {
                "items": parsed_rows,
                "row_count": len(parsed_rows),
                "source": "structured_parse",
                "column_mapping": [{"file_header": h, "canonical": c} for h, c in col_map.items()],
                "warnings": warnings,
            }

    # docx/openpyxl only understand the modern zip-based .docx/.xlsx formats — a
    # legacy binary .doc/.xls (or any other unparseable file) raises here rather
    # than returning empty text, so this must be caught explicitly or it surfaces
    # to the client as a bare unhandled 500 instead of a clear 400.
    try:
        doc = process_document(file_bytes, filename)
        text = (doc.get("extracted_text") or "").strip()
    except Exception:
        logger.exception("Failed to process uploaded document %s", filename)
        text = ""
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from file. Legacy .doc/.xls formats aren't supported — please save as .docx/.xlsx/PDF/CSV, or a readable PDF, Word, Excel, or CSV document.")

    items = extract_material_prices(text)
    if not items:
        raise HTTPException(status_code=422, detail="No material prices could be identified in this document.")

    return {"items": items, "row_count": len(items), "source": "ai_extraction", "warnings": []}


# ── Import reviewed/approved items ─────────────────────────────────────────────

@router.post("/import")
async def import_reviewed_prices(items: str = Form(...), source: str = Form("ai_extracted")):
    try:
        parsed_items = json.loads(items)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid items payload")

    if not parsed_items:
        raise HTTPException(status_code=422, detail="No items to import")

    inserted = []
    for item in parsed_items:
        material = str(item.get("material") or "").strip()
        price = item.get("price")
        if not material or price is None:
            continue
        prior = _latest_price_for(material)
        row = {
            "material": material,
            "price": float(price),
            "unit": item.get("unit") or "unit",
            "change_pct": _change_pct(float(price), prior),
            "year": datetime.now(timezone.utc).year,
            "source": source,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "notes": item.get("notes"),
        }
        inserted.append(row)

    if not inserted:
        raise HTTPException(status_code=422, detail="No valid items to import")

    res = supabase.table("material_prices").insert(inserted).execute()
    return {"status": "success", "imported_rows": len(res.data or inserted)}
