"""
Accounting extraction API — interconnected with all CivilAI modules.

Endpoints:
  POST   /extract                          Upload file → full extraction + optional DB save
  POST   /extract-text                     Raw text extraction (no file)
  GET    /records                          List saved extraction records
  GET    /records/{id}                     Full detail for one record
  DELETE /records/{id}                     Remove a saved record
  GET    /summary/{project_id}             Aggregated financial picture across all modules
  GET    /reconcile/{project_id}           Cross-reference invoices vs budget vs cost entries
  GET    /glossary                         Full accounting & construction finance glossary
  POST   /analyze-budget                   Compare extracted totals against project budget
  GET    /dashboard                        Financial health KPIs
  GET    /cost-analysis/{project_id}       AI cost report via cost_analyzer module
  GET    /payment-summary/{project_id}     AI payment narrative via payment_analyzer module
  GET    /contract-terms/{project_id}      Financial terms from the contracts table
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Query
from pydantic import BaseModel

from app.ocr.document_processor import process_document
from app.core.security import protect_route
from app.services.storage_service import get_content_type
from app.ai.accounting_extractor import (
    GLOSSARY,
    _SCHEMA_MAP,
    build_project_accounting_summary,
    delete_accounting_record,
    extract_accounting_data,
    get_accounting_record_detail,
    get_accounting_records,
    reconcile_project_invoices,
    save_accounting_record,
)

logger = logging.getLogger("civilai.accounting_route")

router = APIRouter()

_FINANCE_ROLES = ("project_director", "admin", "engineer")
_ALLOWED_EXTS  = {"pdf", "xlsx", "xls", "docx", "doc", "png", "jpg", "jpeg", "csv", "txt"}
_DOCS_BUCKET   = "accounting-documents"


def _ensure_bucket(sb, name: str = _DOCS_BUCKET) -> None:
    try:
        sb.storage.create_bucket(name, options={"public": True})
    except Exception:
        pass  # already exists


def _upload_original_file(file_bytes: bytes, filename: str) -> tuple[Optional[str], Optional[str]]:
    """Upload the original document to Supabase Storage. Returns (file_url, file_path), or (None, None) on failure."""
    try:
        from app.services.db_service import supabase

        _ensure_bucket(supabase)
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        path = f"{uuid.uuid4()}.{ext}"
        supabase.storage.from_(_DOCS_BUCKET).upload(
            path=path,
            file=file_bytes,
            file_options={"content-type": get_content_type(ext)},
        )
        url = supabase.storage.from_(_DOCS_BUCKET).get_public_url(path)
        return url, path
    except Exception as exc:
        logger.warning("accounting document upload failed for %s: %s", filename, exc)
        return None, None


# ── Internal helpers ───────────────────────────────────────────────────────────

def _text_from_csv(file_bytes: bytes) -> str:
    import io
    import csv as _csv
    text   = file_bytes.decode("utf-8-sig", errors="replace")
    reader = _csv.reader(io.StringIO(text))
    return "\n".join(" | ".join(row) for row in reader)


def _text_from_file(file_bytes: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        return _text_from_csv(file_bytes)
    if ext == "txt":
        return file_bytes.decode("utf-8", errors="replace")
    doc  = process_document(file_bytes, filename)
    text = doc.get("extracted_text", "")
    if not text or not text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this file. Try a text-based PDF or DOCX.",
        )
    return text


# ── POST /extract ──────────────────────────────────────────────────────────────

@router.post("/extract")
async def extract_from_file(
    file:       UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    save:       bool = Form(True),
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Upload any financial document (invoice, BOQ, P&L, contract, PO, etc.).

    Runs the full 8-step pipeline:
    1. invoice2data template match (fast pre-pass)
    2. LLM document classification
    3. Regex + price-parser monetary extraction
    4. LLM structured field extraction (Pydantic via instructor)
    5. AI narrative summary
    6. Key figures banner
    7. Anomaly detection (math errors, overruns, duplicate amounts)
    8. Cross-module DB enrichment (budget, invoices, contracts, EVM)
    """
    filename = file.filename or "document"
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext not in _ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTS))}",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        extracted_text = _text_from_file(file_bytes, filename)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("text extraction failed for %s: %s", filename, exc)
        raise HTTPException(status_code=500, detail="Document text extraction failed")

    try:
        result = extract_accounting_data(
            text=extracted_text,
            filename=filename,
            file_bytes=file_bytes,
            project_id=project_id,
        )
    except Exception as exc:
        logger.error("accounting extraction failed for %s: %s", filename, exc)
        raise HTTPException(status_code=500, detail="Accounting extraction failed")

    record_id = None
    file_url  = None
    if save:
        file_url, file_path = _upload_original_file(file_bytes, filename)
        record_id = save_accounting_record(
            result, project_id, filename, file_url=file_url, file_path=file_path,
        )

    return {"status": "success", "filename": filename, "record_id": record_id, "file_url": file_url, **result}


# ── POST /extract-text ─────────────────────────────────────────────────────────

class ExtractTextPayload(BaseModel):
    text:       str
    filename:   str = "document"
    project_id: Optional[str] = None
    save:       bool = False


@router.post("/extract-text")
async def extract_from_text(
    payload: ExtractTextPayload,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Extract accounting data from raw text (no file upload).
    Useful for piping text already extracted by the documents module.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        result = extract_accounting_data(
            text=payload.text,
            filename=payload.filename,
            project_id=payload.project_id,
        )
    except Exception as exc:
        logger.error("text extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail="Accounting extraction failed")

    record_id = None
    if payload.save:
        record_id = save_accounting_record(result, payload.project_id, payload.filename)

    return {"status": "success", "filename": payload.filename, "record_id": record_id, **result}


# ── GET /records ───────────────────────────────────────────────────────────────

@router.get("/records")
def list_records(
    project_id: Optional[str] = Query(None),
    doc_class:  Optional[str] = Query(None, description=f"One of: {', '.join(_SCHEMA_MAP)}"),
    limit:      int = Query(50, ge=1, le=200),
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """List saved accounting extraction records, optionally filtered by project or document class."""
    records = get_accounting_records(project_id=project_id, doc_class=doc_class, limit=limit)
    return {"status": "success", "count": len(records), "records": records}


# ── GET /records/{id} ──────────────────────────────────────────────────────────

@router.get("/records/{record_id}")
def get_record(
    record_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """Get full detail for a single saved accounting extraction record."""
    record = get_accounting_record_detail(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "success", "record": record}


# ── DELETE /records/{id} ───────────────────────────────────────────────────────

@router.delete("/records/{record_id}")
def remove_record(
    record_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """Delete a saved accounting extraction record."""
    ok = delete_accounting_record(record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Record not found or could not be deleted")
    return {"status": "success", "deleted_id": record_id}


# ── GET /summary/{project_id} ─────────────────────────────────────────────────

@router.get("/summary/{project_id}")
def project_summary(
    project_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Aggregated financial picture across all modules for a project:
    invoices, budget items, contracts, cost entries, purchase orders,
    EVM snapshot, and extracted accounting records.
    """
    try:
        summary = build_project_accounting_summary(project_id)
    except Exception as exc:
        logger.error("project summary failed for %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail="Could not build project financial summary")
    return {"status": "success", **summary}


# ── GET /reconcile/{project_id} ───────────────────────────────────────────────

@router.get("/reconcile/{project_id}")
def reconcile(
    project_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Cross-reference payment invoices against financial budget items and cost entries.
    Identifies: unmatched invoices, duplicate amounts, and budget line overruns.
    """
    try:
        result = reconcile_project_invoices(project_id)
    except Exception as exc:
        logger.error("reconciliation failed for %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail="Reconciliation failed")
    return {"status": "success", **result}


# ── GET /glossary ──────────────────────────────────────────────────────────────

@router.get("/glossary")
def get_glossary(
    search: Optional[str] = Query(None, description="Filter by keyword in term, alias, or definition"),
):
    """
    Full accounting and construction finance glossary.
    No authentication required — safe to call from public help pages.
    Supports optional keyword search across terms, aliases, and definitions.
    """
    terms = GLOSSARY
    if search:
        q = search.strip().lower()
        terms = [
            t for t in terms
            if q in t["term"].lower()
            or q in t["definition"].lower()
            or any(q in a.lower() for a in t.get("aliases", []))
        ]
    return {"status": "success", "count": len(terms), "terms": terms}


# ── POST /analyze-budget ───────────────────────────────────────────────────────

class BudgetAnalysisPayload(BaseModel):
    project_id:      str
    extracted_total: float
    doc_class:       str = "general"
    currency:        str = ""
    doc_subtype:     Optional[str] = None


@router.post("/analyze-budget")
def analyze_against_budget(
    payload: BudgetAnalysisPayload,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Compare a manually-supplied extracted amount against the project budget.
    Returns variance, utilization %, and a risk flag (low / medium / high).
    """
    try:
        from app.services.db_service import supabase

        res   = supabase.table("financial_budget_items").select(
            "original_budget,revised_budget,committed_costs,direct_costs,projected_budget"
        ).eq("project_id", payload.project_id).execute()
        items = res.data or []

        if not items:
            return {
                "status":  "success",
                "message": "No budget items found for this project",
                "variance": None,
            }

        total_original  = sum(float(i.get("original_budget")  or 0) for i in items)
        total_revised   = sum(float(i.get("revised_budget")   or 0) for i in items)
        total_committed = sum(float(i.get("committed_costs")  or 0) for i in items)
        total_direct    = sum(float(i.get("direct_costs")     or 0) for i in items)

        extracted = payload.extracted_total
        risk      = "low"
        if total_original > 0:
            pct = extracted / total_original * 100
            if pct > 100:
                risk = "high"
            elif pct > 85:
                risk = "medium"

        return {
            "status":               "success",
            "project_id":           payload.project_id,
            "doc_class":            payload.doc_class,
            "extracted_total":      extracted,
            "currency":             payload.currency,
            "budget": {
                "total_original":   total_original,
                "total_revised":    total_revised,
                "total_committed":  total_committed,
                "total_direct":     total_direct,
            },
            "variance_vs_original": round(total_original - extracted, 2),
            "variance_vs_revised":  round(total_revised  - extracted, 2),
            "utilization_pct":      round(extracted / total_original * 100, 1) if total_original else None,
            "risk_level":           risk,
            "items_count":          len(items),
        }
    except Exception as exc:
        logger.error("analyze-budget failed: %s", exc)
        raise HTTPException(status_code=500, detail="Budget analysis failed")


# ── GET /dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard")
def accounting_dashboard(
    project_id: Optional[str] = Query(None),
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Financial health KPIs for the accounting dashboard.
    Aggregates: invoice totals, budget utilization, cost spend,
    recent extractions with anomaly counts, and latest EVM snapshot.
    """
    try:
        from app.services.db_service import supabase

        def _q(table: str, cols: str):
            q = supabase.table(table).select(cols)
            return q.eq("project_id", project_id) if project_id else q

        # Invoices
        invs          = (_q("invoices", "amount,status").execute().data or [])
        total_invoiced = sum(float(i.get("amount") or 0) for i in invs)
        total_received = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "received")
        total_pending  = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "pending")
        total_overdue  = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "overdue")

        # Total budget: canonical projects.budget — same source used by the main
        # Dashboard, Cost & Budget, and Financial Budget KPI cards (via /live-actuals),
        # so this figure always matches across modules. financial_budget_items is an
        # itemized breakdown that can drift from this canonical figure; it's not used
        # for the headline "Total Budget" number, only for committed/direct spend below.
        proj_q = supabase.table("projects").select("budget")
        if project_id:
            proj_q = proj_q.eq("id", project_id)
        proj_rows    = proj_q.execute().data or []
        total_budget = sum(float(p.get("budget") or 0) for p in proj_rows)

        # Committed + Direct Costs: canonical sources, matching /financials/live-actuals
        # exactly — committed = pending/approved invoices, direct = cost_entries. Both
        # previously read financial_budget_items (an itemized, independently-edited
        # breakdown), which is why these numbers could drift from every other module.
        total_committed = sum(float(i.get("amount") or 0) for i in invs if i.get("status") in ("pending", "approved"))

        costs       = (_q("cost_entries", "amount").execute().data or [])
        total_spent = sum(float(c.get("amount") or 0) for c in costs)
        total_direct = total_spent

        # Recent accounting records + anomaly tally
        rec_q = supabase.table("accounting_records").select(
            "id,filename,doc_class,confidence,anomalies,created_at"
        ).order("created_at", desc=True).limit(10)
        if project_id:
            rec_q = rec_q.eq("project_id", project_id)
        records         = rec_q.execute().data or []
        total_anomalies = 0
        high_flags      = 0
        for r in records:
            raw = r.pop("anomalies", "[]") or "[]"
            try:
                flags = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                flags = []
            r["anomaly_count"] = len(flags)
            total_anomalies   += len(flags)
            high_flags        += sum(1 for f in flags if f.get("severity") == "high")

        # Latest EVM snapshot
        evm_data = None
        try:
            evm_q = supabase.table("evm_snapshots").select(
                "cpi,spi,eac,bac,snapshot_date"
            ).order("snapshot_date", desc=True).limit(1)
            if project_id:
                evm_q = evm_q.eq("project_id", project_id)
            evm_rows = evm_q.execute().data or []
            evm_data = evm_rows[0] if evm_rows else None
        except Exception:
            pass

        return {
            "status": "success",
            "kpis": {
                "total_invoiced":      total_invoiced,
                "total_received":      total_received,
                "total_pending":       total_pending,
                "total_overdue":       total_overdue,
                "total_budget":        total_budget,
                "total_committed":     total_committed,
                "total_direct_costs":  total_direct,
                "budget_utilization":  round(total_spent / total_budget * 100, 1) if total_budget else None,
                "budget_remaining":    round(total_budget - total_spent, 2) if total_budget else None,
                "total_anomalies":     total_anomalies,
                "high_severity_flags": high_flags,
            },
            "evm":                evm_data,
            "recent_extractions": records,
        }

    except Exception as exc:
        logger.error("accounting dashboard failed: %s", exc)
        raise HTTPException(status_code=500, detail="Dashboard data could not be loaded")


# ── GET /cost-analysis/{project_id} ───────────────────────────────────────────

@router.get("/cost-analysis/{project_id}")
def cost_analysis(
    project_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Delegates to the cost_analyzer module with a live report built from
    financial_budget_items + cost_entries + invoices for the project.
    """
    try:
        from app.services.db_service import supabase
        from app.ai.cost_analyzer import analyze_cost_report

        buds  = supabase.table("financial_budget_items").select("*").eq("project_id", project_id).execute().data or []
        costs = supabase.table("cost_entries").select("amount").eq("project_id", project_id).execute().data or []
        invs  = supabase.table("invoices").select("amount,status,contractor").eq("project_id", project_id).execute().data or []

        total_budget   = sum(float(b.get("original_budget") or 0) for b in buds)
        total_spent    = sum(float(c.get("amount") or 0) for c in costs)
        total_invoiced = sum(float(i.get("amount") or 0) for i in invs)

        lines = [
            f"Project ID: {project_id}",
            f"Total Budget: {total_budget:,.2f}",
            f"Total Spent (cost entries): {total_spent:,.2f}",
            f"Total Invoiced: {total_invoiced:,.2f}",
            f"Budget Remaining: {total_budget - total_spent:,.2f}",
            f"Budget Utilization: {total_spent / total_budget * 100:.1f}%" if total_budget else "Budget Utilization: N/A",
            "",
            f"Budget Line Items ({len(buds)}):",
        ]
        for b in buds[:30]:
            lines.append(
                f"  [{b.get('code','?')}] {b.get('description','')}: "
                f"Budget {float(b.get('original_budget',0)):,.2f} | "
                f"Committed {float(b.get('committed_costs',0)):,.2f} | "
                f"Direct {float(b.get('direct_costs',0)):,.2f}"
            )

        analysis = analyze_cost_report("\n".join(lines))

        return {
            "status":     "success",
            "project_id": project_id,
            "snapshot": {
                "total_budget":    total_budget,
                "total_spent":     total_spent,
                "total_invoiced":  total_invoiced,
                "budget_remaining": total_budget - total_spent,
            },
            "analysis":  analysis.get("analysis", ""),
            "risk_data": analysis.get("risk_data", {}),
        }
    except Exception as exc:
        logger.error("cost-analysis failed for %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail="Cost analysis failed")


# ── GET /payment-summary/{project_id} ─────────────────────────────────────────

@router.get("/payment-summary/{project_id}")
def payment_summary(
    project_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Delegates to payment_analyzer with live invoice data to produce a
    narrative cash-flow analysis for the project.
    """
    try:
        from app.services.db_service import supabase
        from app.ai.payment_analyzer import analyze_payments

        invs = supabase.table("invoices").select("amount,status,contractor,due_date").eq("project_id", project_id).execute().data or []

        if not invs:
            return {"status": "success", "message": "No invoices found for this project", "analysis": ""}

        total_invoiced = sum(float(i.get("amount") or 0) for i in invs)
        total_received = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "received")
        total_pending  = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "pending")
        total_overdue  = sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "overdue")

        payment_data = {
            "project_name":         project_id,
            "total_contract_value": total_invoiced,
            "total_invoiced":       total_invoiced,
            "total_received":       total_received,
            "total_pending":        total_pending,
            "total_overdue":        total_overdue,
            "invoice_count":        len(invs),
        }

        return {
            "status":     "success",
            "project_id": project_id,
            "kpis":       payment_data,
            "analysis":   analyze_payments(payment_data),
        }
    except Exception as exc:
        logger.error("payment-summary failed for %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail="Payment summary failed")


# ── GET /contract-terms/{project_id} ──────────────────────────────────────────

@router.get("/contract-terms/{project_id}")
def contract_financial_terms(
    project_id: str,
    _user=Depends(protect_route(*_FINANCE_ROLES)),
):
    """
    Surfaces key financial terms for all contracts in a project:
    contract sums, retention, liquidated damages, and payment schedules.
    """
    try:
        from app.services.db_service import supabase

        contracts = supabase.table("contracts").select("*").eq("project_id", project_id).execute().data or []

        if not contracts:
            return {"status": "success", "message": "No contracts found for this project", "contracts": []}

        total_value  = sum(float(c.get("value") or 0) for c in contracts)
        active_count = sum(1 for c in contracts if c.get("status") == "active")

        return {
            "status":       "success",
            "project_id":   project_id,
            "total_value":  total_value,
            "active_count": active_count,
            "contracts": [
                {
                    "id":         c.get("id"),
                    "title":      c.get("title"),
                    "contractor": c.get("contractor"),
                    "value":      float(c.get("value") or 0),
                    "status":     c.get("status"),
                    "start_date": c.get("start_date"),
                    "end_date":   c.get("end_date"),
                }
                for c in contracts
            ],
        }
    except Exception as exc:
        logger.error("contract-terms failed for %s: %s", project_id, exc)
        raise HTTPException(status_code=500, detail="Contract data could not be loaded")
