"""
Dialogue manager — lightweight intent classification and entity extraction.

Runs before the LLM copilot / agent to:
  1. Identify which construction domain the user is asking about
  2. Extract key entities (project name, dates, dollar amounts)
  3. Signal whether the user needs to paste data for analysis
  4. Suggest the best tool to call

Used by the /agent/chat endpoint and can be used by /chatbot/chat for richer routing.
"""
import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from langsmith import traceable
from app.ai.groq_client import instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.dialogue")

_INTENT = Literal[
    "schedule_analysis",    # delays, critical path, milestones
    "safety_analysis",      # hazards, OSHA, incidents
    "cost_analysis",        # budget overrun, EVM, burn rate
    "contract_analysis",    # clauses, risks, change orders, RFI
    "workforce_analysis",   # crew, skills, turnover, onboarding
    "procurement_analysis", # materials, suppliers, POs
    "compliance_analysis",  # permits, regulations, violations
    "equipment_analysis",   # maintenance, failures, downtime
    "vendor_scoring",       # vendor evaluation and comparison
    "payment_tracking",     # invoices, cash flow, overdue
    "evm_calculation",      # pure EVM math when PV/EV/AC given
    "document_generation",  # generate RFI, report, letter, plan
    "general_advice",       # general construction Q&A / best practices
    "greeting",             # hello, thanks, out-of-scope small talk
]

_URGENCY = Literal["low", "medium", "high", "critical"]


class ExtractedEntities(BaseModel):
    project_name: Optional[str] = None
    date_reference: Optional[str] = None
    dollar_amount: Optional[str] = None
    percentage: Optional[str] = None
    location: Optional[str] = None
    equipment_id: Optional[str] = None
    contractor_name: Optional[str] = None


class DialogueState(BaseModel):
    intent: _INTENT  # type: ignore[valid-type]
    confidence: float = Field(ge=0, le=1, description="Classifier confidence 0–1")
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    requires_data: bool = Field(
        default=False,
        description="True when the intent needs the user to paste in text/CSV/numbers to analyse",
    )
    suggested_tool: str = Field(description="Name of the LangGraph tool best suited for this request")
    urgency: _URGENCY = "medium"  # type: ignore[valid-type]
    follow_up: Optional[str] = Field(
        default=None,
        description="One clarifying question to ask the user if data is missing",
    )


_SYSTEM = """\
You are a construction-domain intent classifier for CivilAI.
Given a user message (and optional recent conversation history), classify the intent and extract entities.

Intent definitions:
  schedule_analysis   — delays, critical path, Gantt, milestones, completion date
  safety_analysis     — safety incidents, OSHA, PPE, hazard zones, near misses
  cost_analysis       — budget overrun, spending, EVM, burn rate, cost forecast
  contract_analysis   — contract clauses, RFI, change orders, liquidated damages
  workforce_analysis  — crew planning, skills gaps, turnover, onboarding
  procurement_analysis— materials, suppliers, purchase orders, lead times
  compliance_analysis — permits, building codes, regulatory violations
  equipment_analysis  — maintenance schedules, breakdowns, failure risk
  vendor_scoring      — vendor evaluation, comparison, risk rating
  payment_tracking    — invoice status, overdue payments, cash flow
  evm_calculation     — CPI/SPI/EAC when PV/EV/AC numbers are provided
  document_generation — generate RFI, incident report, weekly report, letter
  general_advice      — general best practices, how-to, regulations overview
  greeting            — hello, thanks, chitchat

requires_data = true when the user ASKS to analyse something but has NOT provided the actual data yet.
urgency = critical if life safety, active incident, or imminent regulatory deadline is mentioned.

suggested_tool mapping:
  schedule_analysis   → analyze_schedule_data
  safety_analysis     → analyze_safety_data
  cost_analysis       → analyze_cost_data
  contract_analysis   → analyze_contract_data
  workforce_analysis  → analyze_workforce_data
  procurement_analysis→ analyze_procurement_data
  compliance_analysis → assess_compliance_data
  equipment_analysis  → analyze_equipment_data
  vendor_scoring      → analyze_vendor_data
  payment_tracking    → analyze_cost_data
  evm_calculation     → calculate_evm_metrics
  document_generation → generate_document
  general_advice      → (no tool, direct answer)
  greeting            → (no tool, direct answer)
"""


@traceable(name="dialogue-classify", run_type="chain")
def classify_dialogue(
    message: str,
    recent_history: list[dict] | None = None,
) -> DialogueState:
    """
    Classify the user's intent and extract construction domain entities.
    Falls back to general_advice on any failure.
    """
    context = ""
    if recent_history:
        last = recent_history[-3:]
        context = "\n".join(
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content'][:200]}"
            for m in last
        )

    user_content = f"Recent context:\n{context}\n\nNew message: {message}" if context else f"Message: {message}"

    try:
        result: DialogueState = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=DialogueState,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user",   "content": user_content},
            ],
            max_tokens=300,
            max_retries=2,
        )
        logger.debug("Intent: %s (%.2f) | tool: %s", result.intent, result.confidence, result.suggested_tool)
        return result
    except Exception as exc:
        logger.warning("Dialogue classification failed: %s", exc)
        return DialogueState(
            intent="general_advice",
            confidence=0.5,
            requires_data=False,
            suggested_tool="",
            urgency="medium",
        )
