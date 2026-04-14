from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.payment_analyzer import (
    analyze_payments,
    generate_payment_reminder,
    forecast_cashflow,
)

router = APIRouter()

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

@router.post("/analyze")
async def analyze_payments_route(data: PaymentData):
    try:
        result = analyze_payments(data.model_dump())
        return {"status": "success", "analysis": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reminder")
async def payment_reminder(data: ReminderData):
    try:
        result = generate_payment_reminder(data.model_dump())
        return {"status": "success", "reminder": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/forecast")
async def cashflow_forecast(data: CashflowData):
    try:
        result = forecast_cashflow(data.model_dump())
        return {"status": "success", "forecast": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))