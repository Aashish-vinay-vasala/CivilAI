from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from collections import defaultdict
from supabase import create_client
from app.config import settings
from app.core.security import protect_route
from app.ai.payment_analyzer import (
    analyze_payments,
    generate_payment_reminder,
    forecast_cashflow,
    extract_invoices,
)
from app.ocr.document_processor import process_document
from app.constants import (
    MONTH_NAMES,
    INVOICE_STATUSES,
    CHART_LOOKBACK_MONTHS,
    INVOICE_LIST_LIMIT,
)

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)
_finance_roles = ("project_director", "admin")

class PaymentData(BaseModel):
    project_name: str
    total_contract_value: float
    total_invoiced: float
    total_received: float
    total_pending: float
    total_overdue: float
    overdue_days: int = 0

class ReminderData(BaseModel):
    project_name: str
    invoice_number: str
    amount: float
    due_date: str
    days_overdue: int
    contractor_name: str
    client_name: str

class CashflowData(BaseModel):
    project_name: str
    current_balance: float
    expected_payments: list = []
    planned_expenses: list = []

@router.post("/extract-invoices")
async def extract_invoices_route(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        doc = process_document(file_bytes, file.filename)
        text = doc["extracted_text"]
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file")
        invoices = extract_invoices(text)
        return {"status": "success", "extracted_invoices": invoices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
async def analyze_payments_route(data: PaymentData, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = analyze_payments(data.model_dump())
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reminder")
async def payment_reminder(data: ReminderData, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = generate_payment_reminder(data.model_dump())
        return {"status": "success", "reminder": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/forecast")
async def cashflow_forecast(data: CashflowData, _user=Depends(protect_route(*_finance_roles))):
    try:
        result = forecast_cashflow(data.model_dump())
        return {"status": "success", "forecast": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class NewInvoice(BaseModel):
    invoice_number: str
    contractor: str
    amount: float
    due_date: Optional[str] = None
    status: str = "pending"
    description: Optional[str] = None
    project_id: Optional[str] = None

@router.post("/invoices")
def create_invoice(data: NewInvoice, _user=Depends(protect_route(*_finance_roles))):
    try:
        payload = {
            "invoice_number": data.invoice_number,
            "contractor":     data.contractor,
            "amount":         data.amount,
            "due_date":       data.due_date,
            "status":         data.status,
            "description":    data.description,
        }
        if data.project_id:
            payload["project_id"] = data.project_id
        res = supabase.table("invoices").insert(payload).execute()
        return {"status": "success", "invoice": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoices")
def get_invoices(project_id: Optional[str] = Query(None), _user=Depends(protect_route(*_finance_roles))):
    try:
        q = supabase.table("invoices").select("*").order("due_date", desc=True)
        if project_id:
            # Include unassigned invoices (project_id IS NULL) alongside this
            # project's own rows — otherwise they'd never surface in a
            # project-scoped view, and the user could never assign/reassign them.
            q = q.or_(f"project_id.eq.{project_id},project_id.is.null")
        res = q.execute()
        rows = res.data or []

        # KPI totals must stay scoped to this project only — unassigned rows are
        # shown in the list below (so they can be assigned) but don't belong to
        # this project's numbers yet.
        kpi_rows = [r for r in rows if r.get("project_id") == project_id] if project_id else rows

        total_contract = sum(float(r.get("amount", 0)) for r in kpi_rows)
        total_received = sum(float(r.get("amount", 0)) for r in kpi_rows if r.get("status") == "received")
        total_pending  = sum(float(r.get("amount", 0)) for r in kpi_rows if r.get("status") == "pending")
        total_overdue  = sum(float(r.get("amount", 0)) for r in kpi_rows if r.get("status") == "overdue")

        now = datetime.now()
        month_data: dict = defaultdict(lambda: {"received": 0.0, "pending": 0.0, "overdue": 0.0})
        for row in kpi_rows:
            due = row.get("due_date")
            if due:
                try:
                    dt = datetime.strptime(str(due)[:10], "%Y-%m-%d")
                    key = MONTH_NAMES[dt.month - 1]
                    status = row.get("status", "pending")
                    if status in INVOICE_STATUSES:
                        month_data[key][status] += float(row.get("amount", 0)) / 1000
                except Exception:
                    pass

        monthly = []
        for i in range(CHART_LOOKBACK_MONTHS, 0, -1):
            total_months = now.year * 12 + (now.month - 1) - i
            m = (total_months % 12) + 1
            name = MONTH_NAMES[m - 1]
            d = month_data.get(name, {"received": 0.0, "pending": 0.0, "overdue": 0.0})
            monthly.append({
                "month":    name,
                "received": round(d["received"], 1),
                "pending":  round(d["pending"],  1),
                "overdue":  round(d["overdue"],  1),
            })

        today = date.today()
        enriched = []
        for row in rows[:INVOICE_LIST_LIMIT]:
            days_overdue = 0
            if row.get("status") == "overdue" and row.get("due_date"):
                try:
                    due_dt = datetime.strptime(str(row["due_date"])[:10], "%Y-%m-%d").date()
                    days_overdue = max(0, (today - due_dt).days)
                except Exception:
                    pass
            enriched.append({
                "id":             row.get("id"),
                "invoice_number": row.get("invoice_number"),
                "contractor":     row.get("contractor"),
                "amount":         float(row.get("amount", 0)),
                "due_date":       str(row.get("due_date", "")),
                "status":         row.get("status", "pending"),
                "days_overdue":   days_overdue,
                "description":    row.get("description"),
                # Invoices with no project_id are invisible to every project-scoped
                # view (Cost & Budget, Financial Budget, Accounting) — surfaced so the
                # UI can flag them and let the user assign one.
                "project_id":     row.get("project_id"),
            })

        return {
            "status": "success",
            "kpis": {
                "total_contract": total_contract,
                "total_received": total_received,
                "total_pending":  total_pending,
                "total_overdue":  total_overdue,
            },
            "monthly":  monthly,
            "invoices": enriched,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UpdateInvoice(BaseModel):
    status: Optional[str] = None
    paid_date: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[str] = None

@router.patch("/invoices/{invoice_id}")
def update_invoice(invoice_id: str, data: UpdateInvoice, _user=Depends(protect_route(*_finance_roles))):
    try:
        payload = {k: v for k, v in data.model_dump().items() if v is not None}
        if not payload:
            raise HTTPException(status_code=400, detail="No fields to update")
        res = supabase.table("invoices").update(payload).eq("id", invoice_id).execute()
        return {"status": "success", "invoice": res.data[0] if res.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: str, _user=Depends(protect_route(*_finance_roles))):
    try:
        supabase.table("invoices").delete().eq("id", invoice_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))