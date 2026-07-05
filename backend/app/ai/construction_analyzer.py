import logging
from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.ai.groq_client import instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.construction")


# ── Punch List ─────────────────────────────────────────────────────────────────

class ExtractedPunchItem(BaseModel):
    item: str
    location: Optional[str] = Field(default="")
    assigned_to: Optional[str] = Field(default="")
    priority: Literal["high", "medium", "low"] = "medium"
    category: Optional[str] = Field(default="")
    description: Optional[str] = Field(default="")
    due_date: Optional[str] = Field(default=None)

class PunchList(BaseModel):
    items: list[ExtractedPunchItem] = Field(default_factory=list)

def extract_punch_items(text: str) -> list[dict]:
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=PunchList,
            messages=[{"role": "user", "content":
                f"Extract all punch list / defect items from this document. "
                f"For each item extract: item description, location, assigned contractor/worker, "
                f"priority (high/medium/low), category, description, and due date if mentioned.\n\n{text[:4000]}"}],
            max_retries=2,
        )
        return [i.model_dump() for i in result.items]
    except Exception as exc:
        logger.warning("Punch list extraction failed: %s", exc)
        return []


# ── RFIs ───────────────────────────────────────────────────────────────────────

class ExtractedRFI(BaseModel):
    subject: str
    question: Optional[str] = Field(default="")
    submitted_by: Optional[str] = Field(default="")
    assigned_to: Optional[str] = Field(default="")
    priority: Literal["high", "medium", "low"] = "medium"
    due_date: Optional[str] = Field(default=None)

class RFIList(BaseModel):
    rfis: list[ExtractedRFI] = Field(default_factory=list)

def extract_rfis(text: str) -> list[dict]:
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=RFIList,
            messages=[{"role": "user", "content":
                f"Extract all RFIs (Requests for Information) from this document. "
                f"For each RFI extract: subject, question/description, submitted by, "
                f"assigned to, priority (high/medium/low), and due date if mentioned.\n\n{text[:4000]}"}],
            max_retries=2,
        )
        return [r.model_dump() for r in result.rfis]
    except Exception as exc:
        logger.warning("RFI extraction failed: %s", exc)
        return []


# ── Submittals ─────────────────────────────────────────────────────────────────

class ExtractedSubmittal(BaseModel):
    title: str
    type: Optional[str] = Field(default="Shop Drawing")
    submitted_by: Optional[str] = Field(default="")
    reviewed_by: Optional[str] = Field(default="")
    submitted_date: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default="")

class SubmittalList(BaseModel):
    submittals: list[ExtractedSubmittal] = Field(default_factory=list)

def extract_submittals(text: str) -> list[dict]:
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=SubmittalList,
            messages=[{"role": "user", "content":
                f"Extract all submittal items from this document. "
                f"For each submittal extract: title, type (Shop Drawing/Material Sample/Product Data/Test Report/Method Statement), "
                f"submitted by, reviewed by, submitted date, and description.\n\n{text[:4000]}"}],
            max_retries=2,
        )
        return [s.model_dump() for s in result.submittals]
    except Exception as exc:
        logger.warning("Submittals extraction failed: %s", exc)
        return []


# ── Meeting Minutes ────────────────────────────────────────────────────────────

class ExtractedMeeting(BaseModel):
    meeting_date: str
    meeting_type: Optional[str] = Field(default="Progress Meeting")
    attendees: Optional[str] = Field(default="")
    location: Optional[str] = Field(default="")
    agenda: Optional[str] = Field(default="")
    discussion: Optional[str] = Field(default="")
    action_items: Optional[str] = Field(default="")

class MeetingList(BaseModel):
    meetings: list[ExtractedMeeting] = Field(default_factory=list)

def extract_meetings(text: str) -> list[dict]:
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=MeetingList,
            messages=[{"role": "user", "content":
                f"Extract all meeting records from this document. "
                f"For each meeting extract: date, type, attendees, location, "
                f"agenda, key discussion points, and action items.\n\n{text[:4000]}"}],
            max_retries=2,
        )
        return [m.model_dump() for m in result.meetings]
    except Exception as exc:
        logger.warning("Meetings extraction failed: %s", exc)
        return []


# ── Cost Codes ─────────────────────────────────────────────────────────────────

class ExtractedCostCode(BaseModel):
    code: str
    description: str
    category: Optional[str] = Field(default="")
    budgeted_amount: Optional[float] = Field(default=0.0)
    actual_amount: Optional[float] = Field(default=0.0)
    unit: Optional[str] = Field(default="")

class CostCodeList(BaseModel):
    cost_codes: list[ExtractedCostCode] = Field(default_factory=list)

def extract_cost_codes(text: str) -> list[dict]:
    try:
        result = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=CostCodeList,
            messages=[{"role": "user", "content":
                f"Extract all cost codes from this document. "
                f"For each cost code extract: code number, description, category, "
                f"budgeted amount, actual amount, and unit.\n\n{text[:4000]}"}],
            max_retries=2,
        )
        return [c.model_dump() for c in result.cost_codes]
    except Exception as exc:
        logger.warning("Cost codes extraction failed: %s", exc)
        return []
