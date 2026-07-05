"""
Human-in-the-Loop (HITL) guardrails.

High-stakes AI outputs are automatically queued for human review when they
cross defined risk thresholds. The AI response is still returned immediately
(non-blocking), but tagged with requires_review=True and a review_id so the
frontend can surface a review badge and reviewers can approve or reject via
GET/POST /api/v1/review/queue.

Supabase table required:
    CREATE TABLE ai_review_queue (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        route           TEXT NOT NULL,
        trigger_reason  TEXT NOT NULL,
        payload_summary TEXT,
        ai_output       TEXT,
        risk_score      FLOAT DEFAULT 0,
        status          TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewer_name   TEXT,
        reviewed_at     TIMESTAMPTZ,
        notes           TEXT,
        project_id      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );
"""
import json
import re
import logging
import datetime
from typing import Optional

from app.services.db_service import supabase

logger = logging.getLogger("civilai.hitl")

# ── Thresholds ─────────────────────────────────────────────────────────────────

CONTRACT_RISK_THRESHOLD   = 6.5   # risk_score (0-10) >= this → review
VENDOR_QUALITY_THRESHOLD  = 5.0   # quality_score (0-10) <= this → review
VENDOR_DELIVERY_THRESHOLD = 60.0  # on_time_delivery_pct <= this → review
VENDOR_INCIDENTS_THRESHOLD = 2    # safety_incidents count >= this → review

_HIGH_SEVERITY_INCIDENT_KEYWORDS = {
    "fatal", "fire", "collapse", "fall", "electrocution", "explosion",
    "drowning", "struck", "crush",
}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _extract_risk_score(risk_data_text: str) -> float:
    """Parse risk_score out of a Gemini-returned JSON string."""
    try:
        m = re.search(r'\{.*\}', risk_data_text, re.DOTALL)
        if m:
            obj = json.loads(m.group())
            if "risk_score" in obj:
                return float(obj["risk_score"])
    except Exception:
        pass
    m = re.search(r'"risk_score"\s*:\s*([\d.]+)', risk_data_text)
    if m:
        return float(m.group(1))
    return 0.0


def _queue(
    route: str,
    trigger_reason: str,
    payload_summary: str,
    ai_output: str,
    risk_score: float = 0.0,
    project_id: Optional[str] = None,
) -> Optional[str]:
    """Write a row to ai_review_queue. Returns the review_id or None on failure."""
    try:
        rec = supabase.table("ai_review_queue").insert({
            "route":           route,
            "trigger_reason":  trigger_reason,
            "payload_summary": payload_summary[:1000],
            "ai_output":       ai_output[:8000],
            "risk_score":      round(risk_score, 2),
            "status":          "pending",
            "project_id":      project_id,
            "created_at":      datetime.datetime.utcnow().isoformat(),
        }).execute()
        review_id = rec.data[0]["id"] if rec.data else None
        logger.info(
            "HITL queued | route=%s | score=%.1f | id=%s | reason=%.80s",
            route, risk_score, review_id, trigger_reason,
        )
        return review_id
    except Exception as exc:
        logger.error("HITL queue write failed | route=%s | error=%s", route, exc)
        return None


# ── Public check functions — return (needs_review, review_id, reason) ──────────

def check_contract(
    risk_data_text: str,
    ai_output: str,
    filename: str,
    project_id: Optional[str] = None,
) -> tuple[bool, Optional[str], str]:
    """Flag high-risk contracts for human review."""
    score = _extract_risk_score(risk_data_text)
    if score >= CONTRACT_RISK_THRESHOLD:
        reason = (
            f"Contract risk score {score:.1f}/10 meets or exceeds the "
            f"review threshold of {CONTRACT_RISK_THRESHOLD}"
        )
        review_id = _queue(
            "contracts/analyze", reason,
            f"File: {filename}", ai_output, score, project_id,
        )
        return True, review_id, reason
    return False, None, ""


def check_change_order(
    text_summary: str,
    ai_output: str,
    project_id: Optional[str] = None,
) -> tuple[bool, Optional[str], str]:
    """Change orders always require project director sign-off."""
    reason = "Change orders require project director review before proceeding"
    review_id = _queue(
        "contracts/change-order", reason,
        text_summary[:300], ai_output, 5.0, project_id,
    )
    return True, review_id, reason


def check_vendor(
    vendor_data: dict,
    ai_output: str,
    project_id: Optional[str] = None,
) -> tuple[bool, Optional[str], str]:
    """Flag low-performing or high-incident vendors for review."""
    triggers: list[str] = []
    risk_score = 0.0

    quality   = float(vendor_data.get("quality_score",        10))
    delivery  = float(vendor_data.get("on_time_delivery_pct", 100))
    incidents = int(vendor_data.get("safety_incidents",        0))

    if quality <= VENDOR_QUALITY_THRESHOLD:
        triggers.append(f"quality score {quality:.1f}/10")
        risk_score = max(risk_score, 10 - quality)
    if delivery <= VENDOR_DELIVERY_THRESHOLD:
        triggers.append(f"on-time delivery {delivery:.0f}%")
        risk_score = max(risk_score, (100 - delivery) / 10)
    if incidents >= VENDOR_INCIDENTS_THRESHOLD:
        triggers.append(f"{incidents} safety incidents")
        risk_score = max(risk_score, min(incidents * 2.0, 10))

    if triggers:
        name = vendor_data.get("vendor_name", "Unknown vendor")
        reason = f"Vendor '{name}' flagged — " + ", ".join(triggers)
        review_id = _queue(
            "vendors/score", reason,
            f"Vendor: {name}", ai_output, risk_score, project_id,
        )
        return True, review_id, reason
    return False, None, ""


def check_safety_incident(
    incident_data: dict,
    ai_output: str,
    project_id: Optional[str] = None,
) -> tuple[bool, Optional[str], str]:
    """Flag incidents with injuries or high-severity types for immediate review."""
    triggers: list[str] = []
    risk_score = 7.0

    injured  = str(incident_data.get("injured",  "None")).strip().lower()
    inc_type = str(incident_data.get("type",      "")).lower()
    desc     = str(incident_data.get("description", ""))

    if injured not in ("none", "0", "", "no"):
        triggers.append(f"injured: {incident_data.get('injured')}")
        risk_score = 9.0

    if any(kw in inc_type for kw in _HIGH_SEVERITY_INCIDENT_KEYWORDS):
        triggers.append(f"high-severity type: {inc_type}")
        risk_score = max(risk_score, 8.5)

    if triggers:
        reason = "Safety incident requires immediate review — " + "; ".join(triggers)
        review_id = _queue(
            "safety/incident-report", reason,
            desc[:300], ai_output, risk_score, project_id,
        )
        return True, review_id, reason
    return False, None, ""
