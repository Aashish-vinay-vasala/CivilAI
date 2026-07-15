"""
Accounting terms and numbers extraction from construction documents.

Cross-module integration:
  - Contracts    : links extracted contract sums to contracts table
  - Payments     : matches invoice numbers against the invoices tracker
  - Financials   : compares BOQ totals against financial_budget_items
  - Projects     : attaches all results to a project_id
  - Cost entries : surfaces project cost spend alongside extracted amounts
  - Purchase orders: matches PO numbers against purchase_orders table

Libraries used:
  instructor   — Pydantic-validated structured output from Groq
  price-parser — locale-aware monetary amount parsing
  invoice2data — template-based invoice extraction (pre-pass before AI)

Entry point:
  extract_accounting_data(text, filename, file_bytes=None, project_id=None) -> dict
  save_accounting_record(result, project_id, filename) -> str | None
  get_accounting_records(project_id, doc_class, limit) -> list[dict]
  build_project_accounting_summary(project_id) -> dict
  reconcile_project_invoices(project_id) -> dict
"""
import re
import json
import logging
import tempfile
import os
from typing import Optional, Any
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from groq import Groq
import instructor

from app.config import settings

logger = logging.getLogger("civilai.accounting_extractor")

# ── Instructor-wrapped Groq client ─────────────────────────────────────────────

_groq_raw = Groq(api_key=settings.GROQ_API_KEY)
_client   = instructor.from_groq(_groq_raw, mode=instructor.Mode.JSON)
_MODEL    = "llama-3.3-70b-versatile"


# ── Pydantic models for structured extraction ──────────────────────────────────

class DocClassification(BaseModel):
    doc_class:   str = Field(description="One of: invoice, financial_statement, boq, purchase_order, contract, general")
    doc_subtype: str = Field(description="E.g. tax_invoice, progress_claim, profit_and_loss, balance_sheet, boq, po, subcontract, head_contract, general")
    currency:    str = Field(description="Primary currency code, e.g. USD, AUD, GBP, EUR, or empty string")
    period:      str = Field(description="Reporting/document period, e.g. Q1 2024 or empty string")
    confidence:  float = Field(ge=0.0, le=1.0)


class _LineItem(BaseModel):
    code:        Optional[str]   = None
    description: Optional[str]  = None
    quantity:    Optional[float] = None
    unit:        Optional[str]   = None
    unit_rate:   Optional[float] = None
    amount:      Optional[float] = None


class _Party(BaseModel):
    name:    Optional[str] = None
    address: Optional[str] = None
    tax_id:  Optional[str] = None


class _BankDetails(BaseModel):
    bank:    Optional[str] = None
    account: Optional[str] = None
    routing: Optional[str] = None


class InvoiceData(BaseModel):
    invoice_number: Optional[str]        = None
    invoice_date:   Optional[str]        = None
    due_date:       Optional[str]        = None
    payment_terms:  Optional[str]        = None
    from_party:     Optional[_Party]     = Field(None, alias="from")
    to_party:       Optional[_Party]     = Field(None, alias="to")
    line_items:     list[_LineItem]      = []
    subtotal:       Optional[float]      = None
    discount:       Optional[float]      = None
    tax_name:       Optional[str]        = None
    tax_rate:       Optional[float]      = None
    tax_amount:     Optional[float]      = None
    total_amount:   Optional[float]      = None
    amount_paid:    Optional[float]      = None
    amount_due:     Optional[float]      = None
    bank_details:   Optional[_BankDetails] = None
    notes:          Optional[str]        = None

    model_config = {"populate_by_name": True}


class _OpexLine(BaseModel):
    name:   Optional[str]   = None
    amount: Optional[float] = None


class FinancialStatementData(BaseModel):
    statement_type:              Optional[str]        = None
    company:                     Optional[str]        = None
    period:                      Optional[str]        = None
    currency:                    Optional[str]        = None
    revenue:                     Optional[float]      = None
    cost_of_sales:               Optional[float]      = None
    gross_profit:                Optional[float]      = None
    gross_margin_pct:            Optional[float]      = None
    operating_expenses:          list[_OpexLine]      = []
    ebitda:                      Optional[float]      = None
    depreciation_amortisation:   Optional[float]      = None
    ebit:                        Optional[float]      = None
    interest_expense:            Optional[float]      = None
    profit_before_tax:           Optional[float]      = None
    income_tax:                  Optional[float]      = None
    net_income:                  Optional[float]      = None
    net_margin_pct:              Optional[float]      = None
    total_assets:                Optional[float]      = None
    total_liabilities:           Optional[float]      = None
    equity:                      Optional[float]      = None
    cash_and_equivalents:        Optional[float]      = None
    accounts_receivable:         Optional[float]      = None
    accounts_payable:            Optional[float]      = None
    work_in_progress:            Optional[float]      = None


class _BOQItem(BaseModel):
    code:        Optional[str]   = None
    description: Optional[str]  = None
    quantity:    Optional[float] = None
    unit:        Optional[str]   = None
    unit_rate:   Optional[float] = None
    amount:      Optional[float] = None


class _BOQSection(BaseModel):
    division_code: Optional[str]   = None
    division_name: Optional[str]   = None
    items:         list[_BOQItem]  = []
    section_total: Optional[float] = None


class BOQData(BaseModel):
    project:            Optional[str]        = None
    prepared_by:        Optional[str]        = None
    date:               Optional[str]        = None
    currency:           Optional[str]        = None
    sections:           list[_BOQSection]    = []
    subtotal:           Optional[float]      = None
    contingency_pct:    Optional[float]      = None
    contingency_amount: Optional[float]      = None
    grand_total:        Optional[float]      = None


class PurchaseOrderData(BaseModel):
    po_number:      Optional[str]       = None
    date:           Optional[str]       = None
    delivery_date:  Optional[str]       = None
    from_party:     Optional[_Party]    = Field(None, alias="from")
    to_party:       Optional[_Party]    = Field(None, alias="to")
    line_items:     list[_LineItem]     = []
    subtotal:       Optional[float]     = None
    tax_amount:     Optional[float]     = None
    shipping:       Optional[float]     = None
    total_amount:   Optional[float]     = None
    payment_terms:  Optional[str]       = None
    delivery_terms: Optional[str]       = None
    notes:          Optional[str]       = None

    model_config = {"populate_by_name": True}


class _ProvSum(BaseModel):
    description: Optional[str]   = None
    amount:      Optional[float] = None


class ContractData(BaseModel):
    contract_number:                Optional[str]       = None
    date:                           Optional[str]       = None
    principal:                      Optional[str]       = None
    contractor:                     Optional[str]       = None
    subcontractor:                  Optional[str]       = None
    project_name:                   Optional[str]       = None
    contract_sum:                   Optional[float]     = None
    currency:                       Optional[str]       = None
    gst_vat_inclusive:              Optional[bool]      = None
    retention_pct:                  Optional[float]     = None
    retention_release_conditions:   Optional[str]       = None
    defects_liability_period:       Optional[str]       = None
    liquidated_damages_rate:        Optional[float]     = None
    liquidated_damages_unit:        Optional[str]       = None
    advance_payment:                Optional[float]     = None
    payment_terms:                  Optional[str]       = None
    payment_frequency:              Optional[str]       = None
    provisional_sums:               list[_ProvSum]      = []
    prime_cost_items:               list[_ProvSum]      = []
    performance_bond_pct:           Optional[float]     = None
    escalation_formula:             Optional[str]       = None
    notes:                          Optional[str]       = None


class _KeyFigure(BaseModel):
    label:    str
    value:    Optional[float] = None
    currency: Optional[str]   = None
    notes:    Optional[str]   = None


class GeneralData(BaseModel):
    document_description: Optional[str]    = None
    key_figures:          list[_KeyFigure] = []
    payment_terms:        Optional[str]    = None
    parties:              list[str]        = []
    document_date:        Optional[str]    = None
    due_date:             Optional[str]    = None
    period:               Optional[str]    = None
    summary:              Optional[str]    = None


# Map doc_class → Pydantic model
_SCHEMA_MAP: dict[str, type[BaseModel]] = {
    "invoice":             InvoiceData,
    "financial_statement": FinancialStatementData,
    "boq":                 BOQData,
    "purchase_order":      PurchaseOrderData,
    "contract":            ContractData,
    "general":             GeneralData,
}

_EXTRACT_SYSTEM: dict[str, str] = {
    "invoice":
        "You are an expert invoice parser. Extract every field from this invoice. "
        "Use null for any field you cannot determine. Parse all line items, parties, "
        "totals, tax, bank details, and payment terms.",
    "financial_statement":
        "You are an expert financial analyst. Extract all figures from this financial "
        "statement including revenue, costs, margins, EBITDA, net income, and balance sheet items. "
        "Use null for any field you cannot determine.",
    "boq":
        "You are an expert quantity surveyor. Extract all sections and line items from this "
        "Bill of Quantities. Include codes, descriptions, quantities, units, rates, and amounts. "
        "Use null for any field you cannot determine.",
    "purchase_order":
        "You are an expert procurement analyst. Extract all fields from this purchase order "
        "including all line items, parties, totals, and terms. Use null for any field you cannot determine.",
    "contract":
        "You are an expert construction contract analyst. Extract all financial terms from this contract "
        "including contract sum, retention, liquidated damages, advance payment, provisional sums, "
        "and payment terms. Use null for any field you cannot determine.",
    "general":
        "You are an expert financial document analyst. Extract all financial figures, parties, "
        "dates, and terms from this document. Use null for any field you cannot determine.",
}


# ── Accounting terms glossary ──────────────────────────────────────────────────

_ACCOUNTING_TERMS: list[tuple[str, list[str], str]] = [
    ("accounts payable",          ["accounts payable", "a/p", "trade payables"],
     "Amounts owed to suppliers for goods or services received"),
    ("accounts receivable",       ["accounts receivable", "a/r", "trade receivables", "debtors"],
     "Amounts owed by clients for goods or services delivered"),
    ("accrual",                   ["accrual", "accrued", "accrued expense", "accrued revenue"],
     "Revenue or expense recognised when earned/incurred, not when cash changes hands"),
    ("amortisation",              ["amortisation", "amortization"],
     "Systematic allocation of intangible asset cost over its useful life"),
    ("balance sheet",             ["balance sheet", "statement of financial position"],
     "Snapshot of assets, liabilities, and equity at a specific date"),
    ("cash flow",                 ["cash flow", "cashflow", "cash position", "cash balance"],
     "Movement of money into and out of the business"),
    ("contingency",               ["contingency", "contingency allowance", "risk allowance"],
     "Financial allowance set aside for unforeseen costs or risks"),
    ("cost code",                 ["cost code", "cost centre", "cost center", "gl code", "wbs code"],
     "Reference code used to categorise and track expenditures"),
    ("credit note",               ["credit note", "credit memo", "cn"],
     "Document reducing the amount owed by a client or to a supplier"),
    ("depreciation",              ["depreciation", "accumulated depreciation"],
     "Systematic reduction of a tangible asset's recorded value over time"),
    ("EBITDA",                    ["ebitda"],
     "Earnings before interest, taxes, depreciation, and amortisation"),
    ("gross profit",              ["gross profit", "gross margin", "gross income"],
     "Revenue minus cost of goods sold / cost of sales"),
    ("net income",                ["net income", "net profit", "net earnings", "profit after tax", "pat"],
     "Bottom-line profit after all expenses and taxes"),
    ("overhead",                  ["overhead", "overheads", "indirect cost", "indirect costs", "oncost"],
     "Indirect operating costs not directly tied to a specific work item"),
    ("purchase order",            ["purchase order", "p.o.", "po #", "po number"],
     "Formal authorisation to a supplier to deliver goods/services at an agreed price"),
    ("reconciliation",            ["reconciliation", "bank reconciliation", "account reconciliation"],
     "Process of verifying that two sets of records agree"),
    ("retention",                 ["retention", "retainage", "retention money", "retention fund"],
     "Percentage of each progress payment withheld until defects liability period ends"),
    ("revenue",                   ["revenue", "turnover", "contract revenue"],
     "Total income generated from construction contracts or services"),
    ("tax invoice",               ["tax invoice", "gst invoice", "vat invoice", "fiscal invoice"],
     "Formal invoice compliant with tax regulations, showing applicable taxes"),
    ("work in progress",          ["wip", "work in progress", "work-in-progress", "unbilled revenue"],
     "Value of partially completed work not yet invoiced or recognised as revenue"),
    ("write-off",                 ["write-off", "write off", "bad debt", "impairment"],
     "Accounting entry removing an irrecoverable asset from the books"),
    ("bill of quantities",        ["bill of quantities", "boq", "bq", "schedule of quantities", "soq"],
     "Itemised list of materials, labour, and tasks with quantities and rates"),
    ("change order",              ["change order", "variation order", "vo", "variation", "change directive"],
     "Formal instruction modifying the contract scope, cost, or time"),
    ("contract sum",              ["contract sum", "contract value", "contract price", "lump sum"],
     "Total agreed price for performing the contract works"),
    ("daywork",                   ["daywork", "day work", "time and materials", "t&m"],
     "Work carried out at agreed rates without a fixed price"),
    ("earned value",              ["earned value", "ev", "bcwp"],
     "Budgeted value of work actually completed (EVM metric)"),
    ("extension of time",         ["extension of time", "eot", "time extension"],
     "Formal grant of additional time to complete the works"),
    ("guaranteed maximum price",  ["guaranteed maximum price", "gmp"],
     "Cap on the total price; contractor absorbs cost overruns above the GMP"),
    ("interim payment certificate", ["interim payment certificate", "ipc", "payment certificate", "progress claim", "progress certificate"],
     "Certified statement of amount due to contractor at a milestone"),
    ("liquidated damages",        ["liquidated damages", "ld", "l.d.", "delay damages"],
     "Pre-agreed daily rate charged when contractor fails to complete on time"),
    ("mobilisation advance",      ["mobilisation advance", "mobilization advance", "advance payment"],
     "Upfront payment to contractor to cover site establishment costs"),
    ("performance bond",          ["performance bond", "performance guarantee", "surety bond"],
     "Financial instrument guaranteeing contractor performance"),
    ("practical completion",      ["practical completion", "substantial completion"],
     "Stage when works are complete enough for the client to take possession"),
    ("preliminaries",             ["preliminaries", "prelims", "general conditions", "general requirements"],
     "Site establishment, temporary works, and project management costs in a BOQ"),
    ("prime cost item",           ["prime cost item", "pc item", "pc sum"],
     "Allowance for goods not yet selected, to be supplied by a nominated supplier"),
    ("provisional sum",           ["provisional sum", "ps", "provisional allowance"],
     "Estimated sum for work not fully defined at tender; adjusted on completion"),
    ("retention bond",            ["retention bond", "retention guarantee"],
     "Bank instrument replacing cash retention, freeing contractor's cash"),
    ("schedule of rates",         ["schedule of rates", "sor", "rate schedule", "unit rates"],
     "List of unit prices for measuring and valuing variations"),
    ("budget at completion",      ["budget at completion", "bac"],
     "Total authorised budget for the project"),
    ("cost performance index",    ["cost performance index", "cpi"],
     "EV ÷ AC; ratio measuring cost efficiency"),
    ("estimate at completion",    ["estimate at completion", "eac"],
     "Projected total cost of the project at completion"),
    ("estimate to complete",      ["estimate to complete", "etc"],
     "Expected cost to finish the remaining project work"),
    ("planned value",             ["planned value", "pv", "bcws"],
     "Budgeted cost of work scheduled (EVM metric)"),
    ("schedule performance index", ["schedule performance index", "spi"],
     "EV ÷ PV; ratio measuring schedule efficiency"),
]

_TERM_INDEX: dict[str, tuple[str, str]] = {}
for _canon, _aliases, _defn in _ACCOUNTING_TERMS:
    for _alias in _aliases:
        _TERM_INDEX[_alias.lower()] = (_canon, _defn)

GLOSSARY: list[dict] = [
    {"term": canon, "definition": defn, "aliases": aliases}
    for canon, aliases, defn in _ACCOUNTING_TERMS
]


# ── Monetary amount patterns (three focused patterns, no broad catch-all) ──────

# A: Currency symbol prefix  $1,234.56  £5,000  €1.5M
_MONEY_SYMBOL_RE = re.compile(
    r'(?P<sym>[$£€¥₹])\s*'
    r'(?P<n>\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?(?:\s*[KkMmBb](?:illion)?)?)',
)
# B: Comma thousand-formatted number — must have at least one ,NNN group
_MONEY_FORMATTED_RE = re.compile(
    r'(?<![,\d])(?P<n>\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?)(?![,\d])',
)
# C: Explicit currency code suffix  500.00 AUD  12,345 USD
_MONEY_CODE_RE = re.compile(
    r'(?<![,\d])(?P<n>\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?)\s*'
    r'(?P<code>USD|AUD|GBP|EUR|CAD|NZD|SGD|ZAR|INR|MYR|JPY|CNY|CHF|AED|SAR|NGN|KES|GHS)(?!\w)',
    re.IGNORECASE,
)
# D: Labeled amounts — "Total Due: $1,234"  "Net Amount: 5000.00"
_LABELED_AMOUNT_RE = re.compile(
    r'(?P<label>(?:total|sub[\s\-]?total|amount\s*(?:due|paid|owed)?|'
    r'invoice\s*(?:total|amount|value)?|tax(?:\s+amount)?|gst(?:\s+amount)?|vat(?:\s+amount)?|'
    r'net\s*(?:amount)?|gross\s*(?:amount)?|balance\s*(?:due|owing)?|outstanding\s*(?:amount)?|'
    r'contract\s*(?:sum|value|price|amount)?|retention(?:\s+amount)?|advance\s*(?:payment)?|'
    r'deposit|contingency(?:\s+amount)?|provisional\s*sum|payment\s*(?:amount)?|'
    r'received|billed|quoted|budgeted?|expenditure|disbursement)'
    r'[^:\n\d$£€¥₹]{0,25}[:\s=]+)\s*'
    r'(?P<sym>[$£€¥₹])?\s*'
    r'(?P<n>\d[\d,]*(?:\.\d{1,4})?)',
    re.IGNORECASE | re.MULTILINE,
)

_PERCENT_RE = re.compile(
    r'(?P<value>\d+(?:\.\d{1,4})?)\s*%',
)
# Map context keywords → human-readable percentage category
_PCT_LABEL_MAP: list[tuple[list[str], str]] = [
    (["retention", "retainage"],                    "retention"),
    (["tax", "gst", "vat", "withholding"],          "tax_rate"),
    (["contingency", "risk allowance"],             "contingency"),
    (["margin", "profit", "markup"],                "margin"),
    (["discount"],                                  "discount"),
    (["interest", "penalty"],                       "interest"),
    (["progress", "complet", "done"],               "progress"),
    (["overhead", "oncost"],                        "overhead"),
    (["bond", "performance"],                       "bond"),
    (["escalation", "rise", "adjustment"],          "escalation"),
    (["liquidated", "ld ", "delay damage"],         "liquidated_damages"),
    (["advance", "mobilisation", "mobilization"],   "advance"),
]

_REF_RE = re.compile(
    r'\b(?:INV|PO|WO|CO|VO|RFI|DO|CN|SO|MO|PR|GRN)[-#]?\s*[\dA-Z\-]{2,20}\b',
    re.IGNORECASE,
)

_DATE_RE = re.compile(
    r'\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|'
    r'\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|'
    r'\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|'
    r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b',
    re.IGNORECASE,
)


def _extract_amounts(text: str) -> list[dict]:
    """
    Extract monetary amounts via three focused patterns:
      A — currency symbol prefix ($1,234.56)
      B — comma thousand-formatted (1,234,567.89)
      C — explicit currency code suffix (500 AUD)
    Avoids the false-positive noise of a broad catch-all regex.
    """
    from price_parser import Price

    results: list[dict] = []
    seen_keys: set[str] = set()

    def _add(raw: str, start: int, end: int, currency_hint: str = "") -> None:
        raw = raw.strip()
        if not raw or not any(c.isdigit() for c in raw):
            return
        price = Price.fromstring(raw)
        if price.amount is None:
            return
        val = float(price.amount)
        if val < 1.0 or val > 1e13:
            return
        # Skip bare year values (1900–2100) — common false positive
        if 1900.0 <= val <= 2100.0 and val == int(val) and not currency_hint:
            return
        currency = (price.currency or currency_hint or "").upper()
        key = f"{currency}{val:.2f}"
        if key in seen_keys:
            return
        seen_keys.add(key)
        ctx_start = max(0, start - 70)
        ctx_end   = min(len(text), end + 70)
        ctx = text[ctx_start:ctx_end].replace("\n", " ").strip()
        results.append({"value": val, "currency": currency, "raw": raw, "context": ctx})

    # Pattern A: symbol prefix ($1,234.56  £500)
    for m in _MONEY_SYMBOL_RE.finditer(text):
        sym = m.group("sym")
        _add(sym + m.group("n"), m.start(), m.end(), sym)

    # Pattern B: comma-formatted thousands (1,234,567.89)
    for m in _MONEY_FORMATTED_RE.finditer(text):
        _add(m.group("n"), m.start(), m.end())

    # Pattern C: currency code suffix (1234.56 USD)
    for m in _MONEY_CODE_RE.finditer(text):
        code = m.group("code").upper()
        _add(m.group("n") + " " + code, m.start(), m.end(), code)

    results.sort(key=lambda x: x["value"], reverse=True)
    return results[:80]


def _extract_percentages(text: str) -> list[dict]:
    results: list[dict] = []
    seen: set[float] = set()
    for m in _PERCENT_RE.finditer(text):
        try:
            val = float(m.group("value"))
        except ValueError:
            continue
        if val > 1000 or val < 0 or val in seen:
            continue
        seen.add(val)
        start = max(0, m.start() - 60)
        end   = min(len(text), m.end() + 60)
        ctx   = text[start:end].replace("\n", " ").strip()
        # Categorise by surrounding context
        ctx_lower = ctx.lower()
        category = "other"
        for keywords, label in _PCT_LABEL_MAP:
            if any(kw in ctx_lower for kw in keywords):
                category = label
                break
        results.append({
            "value":    val,
            "raw":      m.group(0).strip(),
            "category": category,
            "context":  ctx,
        })
    results.sort(key=lambda x: x["value"])
    return results


def _extract_references(text: str) -> list[str]:
    return list({m.group(0).upper() for m in _REF_RE.finditer(text)})


def _extract_dates(text: str) -> list[str]:
    raw_dates = list({m.group(0) for m in _DATE_RE.finditer(text)})
    # Filter out strings that look like quantities or ratios (e.g., "3/4", "01/02")
    # Keep only dates where at least one part is a 4-digit year or month is > 12
    filtered: list[str] = []
    for d in raw_dates:
        parts = re.split(r'[\/\-]', d)
        nums = [p.strip() for p in parts if p.strip().isdigit()]
        has_year = any(len(n) == 4 for n in nums)
        has_big  = any(int(n) > 31 for n in nums if n.isdigit())
        if has_year or has_big:
            filtered.append(d)
    return filtered[:20]


# ── Payment-terms regex ────────────────────────────────────────────────────────

_PT_RE = re.compile(
    r'\bnet\s+(?P<d1>\d+)\b'
    r'|\b(?P<d2>\d+)\s+days?\s+(?:from|after|following|net)\b'
    r'|\b(?P<d3>\d+)\s+days?\s+EOM\b'
    r'|\b(?:due\s+on\s+receipt|immediate(?:ly)?|cash\s+on\s+delivery|COD)\b',
    re.IGNORECASE,
)

# ── Payment schedule regex ─────────────────────────────────────────────────────

_SCHED_RE = re.compile(
    r'(?P<milestone>[A-Za-z][^\n:]{4,50}?)\s*[:\-–]\s*'
    r'(?P<sym>[$£€¥₹])?\s*(?P<amount>\d[\d,]*(?:\.\d{1,4})?)\s*'
    r'(?:on|by|due|payable)?\s*'
    r'(?P<date>\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}'
    r'|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})',
    re.IGNORECASE,
)


def _parse_payment_terms(terms_str: Optional[str]) -> Optional[dict]:
    """Parse a payment terms string into {type, days, raw}."""
    if not terms_str:
        return None
    m = _PT_RE.search(terms_str)
    lower = terms_str.lower()
    if not m:
        return {"type": "custom", "days": None, "raw": terms_str}
    if "receipt" in lower or "immediate" in lower or "cod" in lower:
        return {"type": "immediate", "days": 0, "raw": terms_str}
    days_raw = m.group("d1") or m.group("d2") or m.group("d3")
    days = int(days_raw) if days_raw else None
    term_type = "net_eom" if "eom" in lower or "end of month" in lower else "net"
    return {"type": term_type, "days": days, "raw": terms_str}


def _extract_labeled_amounts(text: str) -> list[dict]:
    """
    Extract amounts that carry a recognisable financial label.
    E.g. 'Total Due: $12,345.00' → {label: 'total due', value: 12345.0, currency: '$'}
    Complements all_amounts with semantic context.
    """
    found: list[dict] = []
    seen_labels: set[str] = set()
    for m in _LABELED_AMOUNT_RE.finditer(text):
        label = re.sub(r'\s+', ' ', m.group("label").rstrip(": =\t").strip().lower())
        raw_n = m.group("n").replace(",", "")
        try:
            val = float(raw_n)
        except ValueError:
            continue
        if val < 0.01 or val > 1e13:
            continue
        # Skip year-like integers in labelled context
        if 1900 <= val <= 2100 and val == int(val):
            continue
        if label in seen_labels:
            continue
        seen_labels.add(label)
        sym = m.group("sym") or ""
        found.append({"label": label, "value": val, "currency": sym})
    return found


def _extract_payment_schedule(text: str) -> list[dict]:
    """Extract payment milestone entries (milestone name + amount + date)."""
    schedule: list[dict] = []
    for m in _SCHED_RE.finditer(text):
        raw_n = m.group("amount").replace(",", "")
        try:
            val = float(raw_n)
        except ValueError:
            continue
        if val < 1 or val > 1e13:
            continue
        schedule.append({
            "milestone": m.group("milestone").strip(),
            "amount":    val,
            "currency":  m.group("sym") or "",
            "date":      m.group("date").strip(),
        })
    return schedule[:20]


def _compute_quality_score(doc_class: str, structured: dict, amounts: list[dict]) -> dict:
    """
    Score extraction quality 0–100.
    Field completeness (60 pts) + amount richness (30 pts) + AI extraction success (10 pts).
    """
    expected_fields: dict[str, list[str]] = {
        "invoice":             ["invoice_number", "invoice_date", "total_amount", "from_party", "line_items"],
        "financial_statement": ["revenue", "gross_profit", "net_income", "total_assets", "period"],
        "boq":                 ["grand_total", "subtotal", "sections", "currency", "project"],
        "purchase_order":      ["po_number", "total_amount", "line_items", "from_party", "to_party"],
        "contract":            ["contract_sum", "principal", "contractor", "payment_terms", "retention_pct"],
        "general":             ["key_figures", "summary", "document_date"],
    }
    fields = expected_fields.get(doc_class, expected_fields["general"])
    filled = sum(1 for f in fields if structured.get(f) not in (None, [], {}, ""))
    field_score  = round(filled / len(fields) * 60) if fields else 0
    amount_score = min(len(amounts) * 5, 30)
    struct_score = 10 if structured else 0
    total = min(field_score + amount_score + struct_score, 100)
    return {
        "score":            total,
        "fields_found":     filled,
        "fields_expected":  len(fields),
        "grade":            "A" if total >= 80 else "B" if total >= 60 else "C" if total >= 40 else "D",
    }


def _find_accounting_terms(text: str) -> list[dict]:
    lower = text.lower()
    found: dict[str, dict] = {}
    for alias, (canonical, definition) in _TERM_INDEX.items():
        if alias in lower and canonical not in found:
            idx   = lower.index(alias)
            start = max(0, idx - 60)
            end   = min(len(text), idx + len(alias) + 60)
            ctx   = text[start:end].replace("\n", " ").strip()
            found[canonical] = {
                "term":        canonical,
                "definition":  definition,
                "context":     ctx,
                "alias_found": alias,
            }
    return list(found.values())


# ── invoice2data pre-pass ──────────────────────────────────────────────────────

def _try_invoice2data(file_bytes: bytes, filename: str) -> Optional[dict]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "pdf"
    if ext not in ("pdf", "png", "jpg", "jpeg"):
        return None
    try:
        from invoice2data import extract_data
        from invoice2data.extract.loader import read_templates

        templates = read_templates()
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            result = extract_data(tmp_path, templates=templates)
        finally:
            os.unlink(tmp_path)

        if result:
            logger.info("invoice2data matched: %s", result.get("desc", "unknown template"))
            return {
                "invoice_number": str(result.get("invoice_id", "")),
                "invoice_date":   str(result.get("date", "")),
                "due_date":       str(result.get("due_date", "")),
                "total_amount":   float(result["amount"]) if result.get("amount") else None,
                "tax_amount":     float(result["tax"]) if result.get("tax") else None,
                "currency":       str(result.get("currency", "")),
                "from_name":      str(result.get("issuer", "")),
                "_source":        "invoice2data",
            }
    except Exception as exc:
        logger.debug("invoice2data skipped: %s", exc)
    return None


# ── AI structured extraction via instructor ────────────────────────────────────

def _classify(text: str, filename: str) -> DocClassification:
    try:
        return _client.chat.completions.create(
            model=_MODEL,
            response_model=DocClassification,
            messages=[
                {"role": "system", "content":
                 "Classify this construction financial document. "
                 "doc_class must be one of: invoice, financial_statement, boq, purchase_order, contract, general."},
                {"role": "user", "content": f"Filename: {filename}\n\n{text[:3000]}"},
            ],
            max_tokens=150,
            temperature=0,
        )
    except Exception as exc:
        logger.error("classify error: %s", exc)
        return DocClassification(
            doc_class="general", doc_subtype="general",
            currency="", period="", confidence=0.5,
        )


def _ai_extract(text: str, doc_class: str) -> dict:
    model_cls = _SCHEMA_MAP.get(doc_class, GeneralData)
    system    = _EXTRACT_SYSTEM.get(doc_class, _EXTRACT_SYSTEM["general"])
    try:
        result: BaseModel = _client.chat.completions.create(
            model=_MODEL,
            response_model=model_cls,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": text[:12000]},
            ],
            max_tokens=2048,
            temperature=0.1,
        )
        return result.model_dump(exclude_none=True, by_alias=False)
    except Exception as exc:
        logger.error("ai_extract error (%s): %s", doc_class, exc)
        return {}


def _summarise(text: str, doc_class: str) -> str:
    try:
        from app.ai.groq_client import client as raw_groq
        resp = raw_groq.chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content":
                 "You are a construction financial analyst. In 2-3 sentences, summarise the key financial "
                 "facts: amounts, parties, dates, and notable terms. Be specific."},
                {"role": "user", "content": f"Document type: {doc_class}\n\n{text[:4000]}"},
            ],
            max_tokens=200,
            temperature=0.3,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error("summarise error: %s", exc)
        return ""


# ── Key figure derivation ──────────────────────────────────────────────────────

def _derive_key_figures(doc_class: str, structured: dict) -> list[dict]:
    figures: list[dict] = []

    def add(label: str, value: Any, suffix: str = "", currency: str = ""):
        if value is not None:
            try:
                figures.append({"label": label, "value": float(value),
                                 "currency": currency, "suffix": suffix})
            except (TypeError, ValueError):
                pass

    if doc_class == "invoice":
        add("Total Amount",  structured.get("total_amount"))
        add("Amount Due",    structured.get("amount_due"))
        add("Tax Amount",    structured.get("tax_amount"))
        add("Subtotal",      structured.get("subtotal"))
    elif doc_class == "financial_statement":
        add("Revenue",       structured.get("revenue"))
        add("Gross Profit",  structured.get("gross_profit"))
        add("Net Income",    structured.get("net_income"))
        add("EBITDA",        structured.get("ebitda"))
        add("Total Assets",  structured.get("total_assets"))
        if structured.get("gross_margin_pct"):
            add("Gross Margin", structured["gross_margin_pct"], suffix="%")
    elif doc_class == "boq":
        add("Grand Total",   structured.get("grand_total"))
        add("Subtotal",      structured.get("subtotal"))
        add("Contingency",   structured.get("contingency_amount"))
    elif doc_class == "purchase_order":
        add("Total Amount",  structured.get("total_amount"))
        add("Tax Amount",    structured.get("tax_amount"))
    elif doc_class == "contract":
        add("Contract Sum",  structured.get("contract_sum"),
            currency=structured.get("currency", ""))
        add("Advance Payment", structured.get("advance_payment"))
        if structured.get("retention_pct"):
            add("Retention", structured["retention_pct"], suffix="%")
        if structured.get("liquidated_damages_rate"):
            add("LD Rate", structured["liquidated_damages_rate"],
                suffix=f"/{structured.get('liquidated_damages_unit', 'day')}",
                currency=structured.get("currency", ""))

    return figures


# ── Anomaly detection ──────────────────────────────────────────────────────────

def _detect_anomalies(
    doc_class: str,
    structured: dict,
    amounts: list[dict],
) -> list[dict]:
    flags: list[dict] = []

    if doc_class == "invoice":
        total = structured.get("total_amount")
        subtotal = structured.get("subtotal")
        tax = structured.get("tax_amount")
        amount_due = structured.get("amount_due")

        # Math check: subtotal + tax should equal total
        if total and subtotal and tax:
            expected = round(subtotal + tax, 2)
            if abs(expected - total) > 0.10:
                flags.append({
                    "type": "math_error",
                    "severity": "high",
                    "message": f"Total {total} ≠ subtotal {subtotal} + tax {tax} = {expected}",
                })

        # Line items sum check
        line_items = structured.get("line_items", [])
        if line_items and subtotal:
            li_sum = round(sum(float(i.get("amount") or 0) for i in line_items), 2)
            if li_sum > 0 and abs(li_sum - subtotal) > 0.50:
                flags.append({
                    "type": "line_items_sum_mismatch",
                    "severity": "medium",
                    "message": f"Line items sum ({li_sum:,.2f}) ≠ subtotal ({subtotal:,.2f})",
                })

        # Zero-amount line items
        zero_lines = [i.get("description", "?") for i in line_items if not i.get("amount")]
        if zero_lines:
            flags.append({
                "type": "zero_amount_line_items",
                "severity": "low",
                "message": f"{len(zero_lines)} line item(s) have no amount: {zero_lines[:3]}",
            })

        if total and amount_due and amount_due > total:
            flags.append({
                "type": "amount_due_exceeds_total",
                "severity": "high",
                "message": f"Amount due ({amount_due}) exceeds invoice total ({total})",
            })

        if total and total > 5_000_000:
            flags.append({
                "type": "large_invoice",
                "severity": "info",
                "message": f"Invoice total {total:,.2f} exceeds $5M — verify before payment",
            })

        if not structured.get("due_date"):
            flags.append({
                "type": "missing_due_date",
                "severity": "medium",
                "message": "No due date found on invoice",
            })

        if not structured.get("invoice_number"):
            flags.append({
                "type": "missing_invoice_number",
                "severity": "medium",
                "message": "No invoice number detected — manual verification required",
            })

    elif doc_class == "boq":
        grand_total = structured.get("grand_total")
        subtotal = structured.get("subtotal")
        contingency = structured.get("contingency_amount")
        sections = structured.get("sections", [])

        if grand_total and subtotal and contingency:
            expected = round(subtotal + contingency, 2)
            if abs(expected - grand_total) > 1.0:
                flags.append({
                    "type": "boq_total_mismatch",
                    "severity": "medium",
                    "message": f"Grand total {grand_total} ≠ subtotal {subtotal} + contingency {contingency} = {expected}",
                })

        if sections:
            section_sum = sum(s.get("section_total") or 0 for s in sections)
            if subtotal and section_sum > 0 and abs(section_sum - subtotal) > 1.0:
                flags.append({
                    "type": "section_sum_mismatch",
                    "severity": "medium",
                    "message": f"Section totals sum ({section_sum:,.2f}) differs from subtotal ({subtotal:,.2f})",
                })

        contingency_pct = structured.get("contingency_pct")
        if contingency_pct and contingency_pct > 20:
            flags.append({
                "type": "high_contingency",
                "severity": "medium",
                "message": f"Contingency of {contingency_pct}% is unusually high (typical range: 5–15%)",
            })

    elif doc_class == "contract":
        retention = structured.get("retention_pct")
        contract_sum = structured.get("contract_sum")

        if retention and retention > 10:
            flags.append({
                "type": "high_retention",
                "severity": "medium",
                "message": f"Retention rate {retention}% is above typical 5–10% range",
            })

        ld_rate = structured.get("liquidated_damages_rate")
        if ld_rate and contract_sum and contract_sum > 0:
            annual_ld = ld_rate * 365
            pct_of_contract = annual_ld / contract_sum * 100
            if pct_of_contract > 20:
                flags.append({
                    "type": "high_liquidated_damages",
                    "severity": "high",
                    "message": f"LD rate {ld_rate}/day implies {pct_of_contract:.1f}% of contract sum annually — review clause",
                })

        # Large advance payment (> 30% of contract sum)
        advance = structured.get("advance_payment")
        if advance and contract_sum and contract_sum > 0:
            adv_pct = advance / contract_sum * 100
            if adv_pct > 30:
                flags.append({
                    "type": "large_advance_payment",
                    "severity": "high",
                    "message": f"Advance payment {advance:,.2f} is {adv_pct:.1f}% of contract sum — verify security/bond",
                })

        # Missing payment terms
        if not structured.get("payment_terms"):
            flags.append({
                "type": "missing_payment_terms",
                "severity": "medium",
                "message": "No payment terms found in contract — potential dispute risk",
            })

        # Performance bond missing for large contracts
        if contract_sum and contract_sum > 500_000 and not structured.get("performance_bond_pct"):
            flags.append({
                "type": "no_performance_bond",
                "severity": "info",
                "message": f"No performance bond clause found for contract sum {contract_sum:,.2f}",
            })

    elif doc_class == "financial_statement":
        margin = structured.get("gross_margin_pct")
        if margin is not None and margin < 0:
            flags.append({
                "type": "negative_gross_margin",
                "severity": "high",
                "message": f"Negative gross margin of {margin}% indicates cost overrun",
            })

        net_income = structured.get("net_income")
        revenue = structured.get("revenue")
        if net_income is not None and revenue and net_income < 0:
            flags.append({
                "type": "net_loss",
                "severity": "high",
                "message": f"Net loss of {abs(net_income):,.2f} on revenue of {revenue:,.2f}",
            })

    # Generic: duplicate amounts in invoice line items
    if doc_class in ("invoice", "purchase_order"):
        line_amounts = [
            round(item.get("amount") or 0, 2)
            for item in structured.get("line_items", [])
            if item.get("amount")
        ]
        seen: set[float] = set()
        dups = set()
        for a in line_amounts:
            if a in seen and a > 100:
                dups.add(a)
            seen.add(a)
        if dups:
            flags.append({
                "type": "duplicate_line_amounts",
                "severity": "medium",
                "message": f"Duplicate line item amounts detected: {sorted(dups)}",
            })

    return flags


# ── Cross-module DB enrichment ─────────────────────────────────────────────────

def _enrich_with_db(
    project_id: Optional[str],
    doc_class: str,
    structured: dict,
) -> dict:
    """
    Query live project DB tables to add context to the extracted document.
    Returns an enrichment dict; never raises — all DB errors are logged and silenced.
    """
    if not project_id:
        return {}

    enrichment: dict = {}

    try:
        from app.services.db_service import supabase

        # ── Project metadata ───────────────────────────────────────────────────
        try:
            proj_res = supabase.table("projects").select(
                "name,budget,status,client,start_date,end_date"
            ).eq("id", project_id).single().execute()
            if proj_res.data:
                p = proj_res.data
                enrichment["project"] = {
                    "name":       p.get("name"),
                    "budget":     float(p.get("budget") or 0),
                    "status":     p.get("status"),
                    "client":     p.get("client"),
                    "start_date": p.get("start_date"),
                    "end_date":   p.get("end_date"),
                }
        except Exception as exc:
            logger.debug("project metadata fetch skipped: %s", exc)

        # ── BOQ → budget items comparison ──────────────────────────────────────
        if doc_class == "boq":
            try:
                budget_res = supabase.table("financial_budget_items").select(
                    "original_budget,revised_budget,committed_costs,direct_costs"
                ).eq("project_id", project_id).execute()
                items = budget_res.data or []
                if items:
                    total_budget    = sum(float(i.get("original_budget") or 0) for i in items)
                    total_revised   = sum(float(i.get("revised_budget")  or 0) for i in items)
                    total_committed = sum(float(i.get("committed_costs") or 0) for i in items)
                    total_direct    = sum(float(i.get("direct_costs")    or 0) for i in items)
                    boq_total = structured.get("grand_total") or structured.get("subtotal") or 0
                    variance  = round(total_budget - boq_total, 2) if boq_total else None
                    enrichment["budget_comparison"] = {
                        "project_original_budget": total_budget,
                        "project_revised_budget":  total_revised,
                        "project_committed":        total_committed,
                        "project_direct_costs":     total_direct,
                        "boq_grand_total":          boq_total,
                        "variance":                 variance,
                        "variance_pct":             round(variance / total_budget * 100, 2) if total_budget and variance is not None else None,
                        "budget_items_count":       len(items),
                    }
            except Exception as exc:
                logger.debug("budget comparison skipped: %s", exc)

        # ── Invoice → payment tracker match ───────────────────────────────────
        elif doc_class == "invoice":
            try:
                inv_num = structured.get("invoice_number")
                if inv_num and len(str(inv_num)) >= 2:
                    inv_res = supabase.table("invoices").select(
                        "id,invoice_number,status,amount,due_date,contractor"
                    ).ilike("invoice_number", f"%{str(inv_num)[:40]}%").limit(3).execute()
                    matches = inv_res.data or []
                    if matches:
                        m = matches[0]
                        tracked_amount  = float(m.get("amount") or 0)
                        extracted_total = structured.get("total_amount")
                        enrichment["payment_tracker"] = {
                            "matched":           True,
                            "invoice_id":        m.get("id"),
                            "payment_status":    m.get("status"),
                            "tracked_amount":    tracked_amount,
                            "extracted_amount":  extracted_total,
                            "due_date":          m.get("due_date"),
                            "contractor":        m.get("contractor"),
                            "amount_discrepancy": (
                                round(float(extracted_total or 0) - tracked_amount, 2)
                                if extracted_total is not None else None
                            ),
                        }
                    else:
                        enrichment["payment_tracker"] = {"matched": False, "invoice_number_searched": inv_num}
            except Exception as exc:
                logger.debug("invoice tracker match skipped: %s", exc)

            # Cost entries total for the project
            try:
                cost_res = supabase.table("cost_entries").select("amount").eq("project_id", project_id).execute()
                total_spent = sum(float(c.get("amount") or 0) for c in (cost_res.data or []))
                enrichment["project_cost_to_date"] = total_spent
            except Exception as exc:
                logger.debug("cost entries fetch skipped: %s", exc)

        # ── Contract → contracts table match ──────────────────────────────────
        elif doc_class == "contract":
            try:
                contract_res = supabase.table("contracts").select(
                    "id,title,value,status,contractor,start_date,end_date"
                ).eq("project_id", project_id).limit(5).execute()
                project_contracts = contract_res.data or []
                if project_contracts:
                    enrichment["project_contracts"] = [
                        {
                            "id":         c.get("id"),
                            "title":      c.get("title"),
                            "value":      float(c.get("value") or 0),
                            "status":     c.get("status"),
                            "contractor": c.get("contractor"),
                            "start_date": c.get("start_date"),
                            "end_date":   c.get("end_date"),
                        }
                        for c in project_contracts
                    ]
                    total_contract_value = sum(float(c.get("value") or 0) for c in project_contracts)
                    extracted_sum = structured.get("contract_sum")
                    enrichment["contract_sum_context"] = {
                        "total_project_contract_value": total_contract_value,
                        "extracted_contract_sum":       extracted_sum,
                    }
            except Exception as exc:
                logger.debug("contract match skipped: %s", exc)

            # EVM snapshot for cost efficiency context
            try:
                evm_res = supabase.table("evm_snapshots").select(
                    "cpi,spi,eac,snapshot_date"
                ).eq("project_id", project_id).order("snapshot_date", desc=True).limit(1).execute()
                if evm_res.data:
                    e = evm_res.data[0]
                    enrichment["evm_context"] = {
                        "cpi":           e.get("cpi"),
                        "spi":           e.get("spi"),
                        "eac":           e.get("eac"),
                        "snapshot_date": e.get("snapshot_date"),
                    }
            except Exception as exc:
                logger.debug("EVM fetch skipped: %s", exc)

        # ── Purchase order → purchase_orders match ────────────────────────────
        elif doc_class == "purchase_order":
            try:
                po_number = structured.get("po_number")
                if po_number and len(str(po_number)) >= 2:
                    po_res = supabase.table("purchase_orders").select(
                        "id,po_number,total_amount,status,vendor"
                    ).ilike("po_number", f"%{str(po_number)[:40]}%").limit(3).execute()
                    pos = po_res.data or []
                    if pos:
                        m = pos[0]
                        enrichment["purchase_order_match"] = {
                            "matched":         True,
                            "po_id":           m.get("id"),
                            "tracked_amount":  float(m.get("total_amount") or 0),
                            "status":          m.get("status"),
                            "vendor":          m.get("vendor"),
                            "extracted_total": structured.get("total_amount"),
                        }
                    else:
                        enrichment["purchase_order_match"] = {"matched": False, "po_number_searched": po_number}
            except Exception as exc:
                logger.debug("PO match skipped: %s", exc)

        # ── Financial statement → budget + EVM ────────────────────────────────
        elif doc_class == "financial_statement":
            try:
                evm_res = supabase.table("evm_snapshots").select(
                    "cpi,spi,eac,bac,snapshot_date"
                ).eq("project_id", project_id).order("snapshot_date", desc=True).limit(1).execute()
                if evm_res.data:
                    e = evm_res.data[0]
                    enrichment["evm_context"] = {
                        "cpi":           e.get("cpi"),
                        "spi":           e.get("spi"),
                        "eac":           e.get("eac"),
                        "bac":           e.get("bac"),
                        "snapshot_date": e.get("snapshot_date"),
                    }
            except Exception as exc:
                logger.debug("EVM fetch skipped: %s", exc)

    except Exception as exc:
        logger.debug("DB enrichment outer error: %s", exc)

    return enrichment


# ── DB persistence ─────────────────────────────────────────────────────────────

def save_accounting_record(
    result: dict,
    project_id: Optional[str] = None,
    filename: str = "document",
    file_url: Optional[str] = None,
    file_path: Optional[str] = None,
) -> Optional[str]:
    """
    Save an extraction result to the accounting_records table.
    Returns the new record id, or None on failure.
    """
    try:
        from app.services.db_service import supabase
        import uuid

        payload = {
            "id":               str(uuid.uuid4()),
            "project_id":       project_id,
            "filename":         filename,
            "file_url":         file_url,
            "file_path":        file_path,
            "doc_class":        result.get("document_class"),
            "doc_subtype":      result.get("document_subtype"),
            "currency":         result.get("currency"),
            "period":           result.get("period"),
            "confidence":       result.get("confidence"),
            "summary":          result.get("summary"),
            "key_figures":      json.dumps(result.get("key_figures", [])),
            "structured_data":  json.dumps(result.get("structured_data", {})),
            "all_amounts":      json.dumps(result.get("all_amounts", [])[:20]),
            "accounting_terms": json.dumps(result.get("accounting_terms", [])),
            "anomalies":        json.dumps(result.get("anomalies", [])),
            "enrichment":       json.dumps(result.get("enrichment", {})),
            "created_at":       datetime.now(timezone.utc).isoformat(),
        }

        res = supabase.table("accounting_records").insert(payload).execute()
        if res.data:
            return res.data[0]["id"]
    except Exception as exc:
        logger.warning("save_accounting_record failed: %s", exc)
    return None


def get_accounting_records(
    project_id: Optional[str] = None,
    doc_class: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Retrieve saved accounting extraction records from DB."""
    try:
        from app.services.db_service import supabase

        q = supabase.table("accounting_records").select(
            "id,project_id,filename,file_url,doc_class,doc_subtype,currency,period,confidence,summary,key_figures,created_at"
        ).order("created_at", desc=True).limit(limit)

        if project_id:
            q = q.eq("project_id", project_id)
        if doc_class:
            q = q.eq("doc_class", doc_class)

        res = q.execute()
        records = res.data or []

        # Deserialise JSON columns
        for r in records:
            for col in ("key_figures",):
                if isinstance(r.get(col), str):
                    try:
                        r[col] = json.loads(r[col])
                    except Exception:
                        r[col] = []
        return records
    except Exception as exc:
        logger.warning("get_accounting_records failed: %s", exc)
        return []


def get_accounting_record_detail(record_id: str) -> Optional[dict]:
    """Retrieve a single accounting record with all fields."""
    try:
        from app.services.db_service import supabase

        res = supabase.table("accounting_records").select("*").eq("id", record_id).single().execute()
        if not res.data:
            return None

        r = res.data
        for col in ("key_figures", "structured_data", "all_amounts", "accounting_terms", "anomalies", "enrichment"):
            if isinstance(r.get(col), str):
                try:
                    r[col] = json.loads(r[col])
                except Exception:
                    r[col] = {} if col in ("structured_data", "enrichment") else []
        return r
    except Exception as exc:
        logger.warning("get_accounting_record_detail failed: %s", exc)
        return None


def delete_accounting_record(record_id: str) -> bool:
    """Delete a saved accounting record."""
    try:
        from app.services.db_service import supabase
        supabase.table("accounting_records").delete().eq("id", record_id).execute()
        return True
    except Exception as exc:
        logger.warning("delete_accounting_record failed: %s", exc)
        return False


# ── Project financial summary ──────────────────────────────────────────────────

def build_project_accounting_summary(project_id: str) -> dict:
    """
    Aggregate financial data across all modules for a project:
    invoices, budget items, contracts, cost entries, and accounting records.
    """
    summary: dict = {"project_id": project_id, "modules": {}}

    try:
        from app.services.db_service import supabase

        # Canonical project budget — same source as /dashboard, /live-actuals, and
        # db_service.get_projects(). financial_budget_items (below) is an itemized,
        # independently-imported breakdown that can drift from this figure, so it
        # must never be used for the headline "Total Budget" number.
        try:
            proj_res = supabase.table("projects").select("budget").eq("id", project_id).single().execute()
            canonical_budget = float((proj_res.data or {}).get("budget") or 0)
        except Exception as exc:
            logger.debug("project budget fetch skipped: %s", exc)
            canonical_budget = 0.0

        # Invoices
        try:
            inv_res = supabase.table("invoices").select(
                "amount,status"
            ).eq("project_id", project_id).execute()
            invs = inv_res.data or []
            summary["modules"]["invoices"] = {
                "count":         len(invs),
                "total_amount":  sum(float(i.get("amount") or 0) for i in invs),
                "total_received": sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "received"),
                "total_pending":  sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "pending"),
                "total_overdue":  sum(float(i.get("amount") or 0) for i in invs if i.get("status") == "overdue"),
            }
        except Exception as exc:
            logger.debug("invoices summary skipped: %s", exc)

        # Budget items
        try:
            budget_res = supabase.table("financial_budget_items").select(
                "original_budget,revised_budget,committed_costs,direct_costs,projected_budget"
            ).eq("project_id", project_id).execute()
            items = budget_res.data or []
            summary["modules"]["budget"] = {
                "items_count":      len(items),
                "original_budget":  sum(float(i.get("original_budget")  or 0) for i in items),
                "revised_budget":   sum(float(i.get("revised_budget")   or 0) for i in items),
                "committed_costs":  sum(float(i.get("committed_costs")  or 0) for i in items),
                "direct_costs":     sum(float(i.get("direct_costs")     or 0) for i in items),
                "projected_budget": sum(float(i.get("projected_budget") or 0) for i in items),
            }
        except Exception as exc:
            logger.debug("budget summary skipped: %s", exc)

        # Contracts
        try:
            contract_res = supabase.table("contracts").select(
                "value,status"
            ).eq("project_id", project_id).execute()
            contracts = contract_res.data or []
            summary["modules"]["contracts"] = {
                "count":       len(contracts),
                "total_value": sum(float(c.get("value") or 0) for c in contracts),
            }
        except Exception as exc:
            logger.debug("contracts summary skipped: %s", exc)

        # Cost entries
        try:
            cost_res = supabase.table("cost_entries").select("amount").eq("project_id", project_id).execute()
            costs = cost_res.data or []
            summary["modules"]["cost_entries"] = {
                "count":       len(costs),
                "total_spent": sum(float(c.get("amount") or 0) for c in costs),
            }
        except Exception as exc:
            logger.debug("cost entries summary skipped: %s", exc)

        # Purchase orders
        try:
            po_res = supabase.table("purchase_orders").select("total_amount,status").eq("project_id", project_id).execute()
            pos = po_res.data or []
            summary["modules"]["purchase_orders"] = {
                "count":         len(pos),
                "total_value":   sum(float(p.get("total_amount") or 0) for p in pos),
            }
        except Exception as exc:
            logger.debug("purchase orders summary skipped: %s", exc)

        # EVM latest snapshot
        try:
            evm_res = supabase.table("evm_snapshots").select(
                "cpi,spi,eac,bac,ev,ac,pv,snapshot_date"
            ).eq("project_id", project_id).order("snapshot_date", desc=True).limit(1).execute()
            if evm_res.data:
                summary["modules"]["evm"] = evm_res.data[0]
        except Exception as exc:
            logger.debug("EVM summary skipped: %s", exc)

        # Accounting records extracted
        try:
            acct_res = supabase.table("accounting_records").select(
                "doc_class,doc_subtype,created_at"
            ).eq("project_id", project_id).order("created_at", desc=True).limit(20).execute()
            records = acct_res.data or []
            summary["modules"]["accounting_records"] = {
                "count": len(records),
                "by_class": {},
                "latest_extractions": records[:5],
            }
            for r in records:
                cls = r.get("doc_class", "general")
                summary["modules"]["accounting_records"]["by_class"][cls] = (
                    summary["modules"]["accounting_records"]["by_class"].get(cls, 0) + 1
                )
        except Exception as exc:
            logger.debug("accounting records summary skipped: %s", exc)

        # Compute derived totals — original_budget uses the canonical projects.budget
        # figure (matches Dashboard's "Total Budget" tile exactly); total_spent uses
        # cost_entries, the same canonical direct-cost source /dashboard uses.
        invoice_mod = summary["modules"].get("invoices", {})
        cost_mod = summary["modules"].get("cost_entries", {})

        original_budget = canonical_budget
        total_spent = cost_mod.get("total_spent", 0)
        total_invoiced = invoice_mod.get("total_amount", 0)

        summary["financial_health"] = {
            "original_budget":    original_budget,
            "total_spent":        total_spent,
            "total_invoiced":     total_invoiced,
            "budget_remaining":   round(original_budget - total_spent, 2),
            "budget_utilization": round(total_spent / original_budget * 100, 1) if original_budget else None,
            "outstanding_invoices": invoice_mod.get("total_pending", 0),
            "overdue_invoices":   invoice_mod.get("total_overdue", 0),
        }

    except Exception as exc:
        logger.warning("build_project_accounting_summary failed: %s", exc)

    return summary


# ── Invoice reconciliation ─────────────────────────────────────────────────────

def reconcile_project_invoices(project_id: str) -> dict:
    """
    Cross-reference payment invoices against contracts, budget items, and
    cost entries. Identifies: invoices with no contract on file, duplicate
    amounts, and budget overruns.
    """
    result: dict = {
        "project_id":       project_id,
        "unmatched_invoices": [],
        "duplicate_amounts":  [],
        "overpayments":       [],
        "budget_status":      {},
        "summary":            {},
    }

    try:
        from app.services.db_service import supabase

        inv_res = supabase.table("invoices").select(
            "id,invoice_number,amount,status,due_date,contractor,description"
        ).eq("project_id", project_id).execute()
        invoices = inv_res.data or []

        budget_res = supabase.table("financial_budget_items").select(
            "code,description,original_budget,committed_costs,direct_costs"
        ).eq("project_id", project_id).execute()
        budget_items = budget_res.data or []

        contract_res = supabase.table("contracts").select("contractor").eq("project_id", project_id).execute()
        contracted_names = {
            (c.get("contractor") or "").strip().lower()
            for c in (contract_res.data or [])
            if c.get("contractor")
        }

        # Flag invoices billed by a contractor with no contract on file for this
        # project — a standard AP control (every payment should trace back to an
        # authorized contract). Matching invoice amounts against cost_entries amounts
        # (the previous approach) was unreliable: the two tables track unrelated
        # things — billed-by-contractor vs. internal cost bookings — with no shared
        # key, so numerically-equal amounts are coincidental, not a real match.
        for inv in invoices:
            contractor = (inv.get("contractor") or "").strip().lower()
            if contractor and contractor not in contracted_names:
                result["unmatched_invoices"].append({
                    "invoice_id":     inv.get("id"),
                    "invoice_number": inv.get("invoice_number"),
                    "amount":         round(float(inv.get("amount") or 0), 2),
                    "status":         inv.get("status"),
                    "contractor":     inv.get("contractor"),
                })

        # Detect duplicate invoice amounts (same amount, same contractor)
        seen: dict = {}
        for inv in invoices:
            key = (round(float(inv.get("amount") or 0), 2), inv.get("contractor", ""))
            if key in seen:
                result["duplicate_amounts"].append({
                    "invoice_number": inv.get("invoice_number"),
                    "amount":         key[0],
                    "contractor":     key[1],
                    "duplicate_of":   seen[key],
                })
            else:
                seen[key] = inv.get("invoice_number")

        # Budget overruns per division
        for item in budget_items:
            orig = float(item.get("original_budget") or 0)
            committed = float(item.get("committed_costs") or 0)
            direct = float(item.get("direct_costs") or 0)
            total_spend = committed + direct
            if orig > 0 and total_spend > orig:
                result["overpayments"].append({
                    "code":           item.get("code"),
                    "description":    item.get("description"),
                    "original_budget": orig,
                    "total_spend":    total_spend,
                    "overrun":        round(total_spend - orig, 2),
                    "overrun_pct":    round((total_spend - orig) / orig * 100, 1),
                })

        # Summary
        total_invoiced  = sum(float(i.get("amount") or 0) for i in invoices)
        total_received  = sum(float(i.get("amount") or 0) for i in invoices if i.get("status") == "received")
        total_overdue   = sum(float(i.get("amount") or 0) for i in invoices if i.get("status") == "overdue")

        # Canonical sources — same as /dashboard: projects.budget for the total,
        # obligated/unpaid invoices for committed. financial_budget_items.committed_costs
        # is a separately-imported figure that can drift from this.
        proj_res = supabase.table("projects").select("budget").eq("id", project_id).single().execute()
        total_budget    = float((proj_res.data or {}).get("budget") or 0)
        total_committed = sum(float(i.get("amount") or 0) for i in invoices if i.get("status") in ("pending", "overdue"))

        result["budget_status"] = {
            "total_budget":    total_budget,
            "total_committed": total_committed,
            "utilization_pct": round(total_committed / total_budget * 100, 1) if total_budget else None,
        }

        result["summary"] = {
            "total_invoices":        len(invoices),
            "total_invoiced":        total_invoiced,
            "total_received":        total_received,
            "total_overdue":         total_overdue,
            "unmatched_count":       len(result["unmatched_invoices"]),
            "duplicate_count":       len(result["duplicate_amounts"]),
            "budget_overrun_count":  len(result["overpayments"]),
        }

    except Exception as exc:
        logger.warning("reconcile_project_invoices failed: %s", exc)
        result["error"] = "Reconciliation could not complete"

    return result


# ── Public entry point ─────────────────────────────────────────────────────────

def extract_accounting_data(
    text: str,
    filename: str = "document",
    file_bytes: Optional[bytes] = None,
    project_id: Optional[str] = None,
) -> dict:
    """
    Full extraction pipeline.

    Returns:
      document_class, document_subtype, currency, period, confidence,
      summary, key_figures, structured_data,
      all_amounts, all_percentages, reference_numbers, dates_found,
      accounting_terms, anomalies, enrichment, warnings,
      invoice2data_result (if matched)
    """
    if not text or not text.strip():
        return {"error": "No text to extract from", "warnings": ["Empty document"]}

    warnings: list[str] = []
    if len(text) > 80_000:
        text = text[:80_000]
        warnings.append("Document truncated to 80,000 characters for processing")

    # ── Step 1: invoice2data pre-pass ──────────────────────────────────────────
    i2d_result = None
    if file_bytes:
        i2d_result = _try_invoice2data(file_bytes, filename)

    # ── Step 2: classify ───────────────────────────────────────────────────────
    cls         = _classify(text, filename)
    doc_class   = cls.doc_class if cls.doc_class in _SCHEMA_MAP else "general"
    doc_subtype = cls.doc_subtype
    currency    = cls.currency
    period      = cls.period
    confidence  = cls.confidence

    # ── Step 3: regex + price-parser extraction ────────────────────────────────
    amounts          = _extract_amounts(text)
    labeled_amounts  = _extract_labeled_amounts(text)
    percentages      = _extract_percentages(text)
    references       = _extract_references(text)
    dates            = _extract_dates(text)
    terms            = _find_accounting_terms(text)
    payment_schedule = _extract_payment_schedule(text)

    # ── Step 4: AI structured extraction ──────────────────────────────────────
    structured = _ai_extract(text, doc_class)

    # Merge invoice2data result if AI missed key invoice fields
    if i2d_result and doc_class == "invoice":
        for field in ("invoice_number", "invoice_date", "due_date", "total_amount", "tax_amount"):
            if not structured.get(field) and i2d_result.get(field):
                structured[field] = i2d_result[field]

    # ── Step 5: summary ────────────────────────────────────────────────────────
    summary = _summarise(text, doc_class)

    # ── Step 6: key figures banner ─────────────────────────────────────────────
    key_figures = _derive_key_figures(doc_class, structured)
    if not key_figures and amounts:
        for a in amounts[:4]:
            key_figures.append({
                "label":    "Amount",
                "value":    a["value"],
                "currency": a["currency"],
                "suffix":   "",
            })

    # ── Step 7: anomaly detection ──────────────────────────────────────────────
    anomalies = _detect_anomalies(doc_class, structured, amounts)

    # ── Step 8: cross-module DB enrichment ────────────────────────────────────
    enrichment = _enrich_with_db(project_id, doc_class, structured)

    # ── Step 9: payment terms parsing + quality score ──────────────────────────
    payment_terms_raw = structured.get("payment_terms")
    parsed_payment_terms = _parse_payment_terms(payment_terms_raw)
    quality = _compute_quality_score(doc_class, structured, amounts)

    # ── Step 10: multi-currency warning ───────────────────────────────────────
    currencies_found = list({a["currency"] for a in amounts if a.get("currency")})
    if len(currencies_found) > 1:
        warnings.append(f"Multiple currencies detected: {', '.join(currencies_found)}")

    logger.info(
        "accounting extract | file=%s | class=%s | amounts=%d | terms=%d | "
        "anomalies=%d | conf=%.2f | i2d=%s | project=%s",
        filename, doc_class, len(amounts), len(terms),
        len(anomalies), confidence,
        "matched" if i2d_result else "no match",
        project_id or "none",
    )

    return {
        "document_class":       doc_class,
        "document_subtype":     doc_subtype,
        "currency":             currency,
        "period":               period,
        "confidence":           confidence,
        "summary":              summary,
        "key_figures":          key_figures,
        "structured_data":      structured,
        # Amounts — monetary amounts with real financial context
        "all_amounts":          amounts,
        "labeled_amounts":      labeled_amounts,       # NEW: label + value pairs
        "payment_schedule":     payment_schedule,      # NEW: milestone payments
        # Other extractions
        "all_percentages":      percentages,           # now includes category label
        "reference_numbers":    references,
        "dates_found":          dates,
        "accounting_terms":     terms,
        # Analysis
        "anomalies":            anomalies,
        "parsed_payment_terms": parsed_payment_terms,  # NEW: {type, days, raw}
        "quality_score":        quality,               # NEW: {score, grade, fields_found}
        "currencies_detected":  currencies_found,      # NEW: list of currency codes found
        "enrichment":           enrichment,
        "invoice2data_result":  i2d_result,
        "warnings":             warnings,
    }
