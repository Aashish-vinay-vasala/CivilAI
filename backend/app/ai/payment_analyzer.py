import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import analyze_document, instructor_client, _FAST_MODEL
from app.ai.gemini_client import analyze_text

logger = logging.getLogger("civilai.payments")


class ExtractedInvoice(BaseModel):
    invoice_number: str = Field(description="Invoice number or reference e.g. 'INV-2024-001'")
    contractor: str = Field(description="Contractor or vendor name")
    amount: float = Field(default=0.0, description="Invoice amount in dollars")
    due_date: Optional[str] = Field(default=None, description="Due date in YYYY-MM-DD if mentioned")
    status: Literal["pending", "received", "overdue"] = "pending"
    description: Optional[str] = Field(default="", description="Brief description of work/services")


class InvoicesList(BaseModel):
    invoices: list[ExtractedInvoice] = Field(default_factory=list)


def extract_invoices(text: str) -> list[dict]:
    try:
        result: InvoicesList = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=InvoicesList,
            messages=[{
                "role": "user",
                "content": (
                    "Extract every invoice, payment, or billing record from this document. "
                    "For each extract: invoice number, contractor/vendor name, amount, due date, status (pending/received/overdue), description. "
                    "Only include specific invoices, not summaries.\n\n"
                    f"{text[:5000]}"
                ),
            }],
            max_retries=2,
        )
        return [i.model_dump() for i in result.invoices]
    except Exception as exc:
        logger.warning("Invoice extraction failed: %s", exc)
        return []

def analyze_payments(data: dict) -> str:
    prompt = f"""
    You are a construction finance expert.
    Analyze these payment records:
    
    {data}
    
    Provide:
    1. Payment Status Summary
       - Total received
       - Total pending
       - Total overdue
    2. Cash Flow Analysis
       - Current position
       - 30/60/90 day forecast
    3. Risk Assessment
       - High risk payments
       - Dispute potential
    4. Recommendations
       - Immediate actions
       - Recovery strategies
    """
    return analyze_document(str(data), prompt)

def generate_payment_reminder(data: dict) -> str:
    prompt = f"""
    Write a professional payment reminder letter:
    {data}
    
    Include:
    - Formal reminder header
    - Invoice details
    - Amount due
    - Due date
    - Payment instructions
    - Consequences of non-payment
    - Contact details
    """
    return analyze_document(str(data), prompt)

def forecast_cashflow(data: dict) -> str:
    prompt = f"""
    Forecast cash flow for next 90 days:
    {data}
    
    Include:
    - Monthly projections
    - Risk periods
    - Payment milestones
    - Recommendations
    """
    return analyze_document(str(data), prompt)