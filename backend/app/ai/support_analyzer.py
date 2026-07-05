"""
AI-powered customer support: ticket classification and automated response.

Flow:
  1. classify_ticket()  — instructor-validated structured output
  2. generate_response() — full Groq call, returns a helpful reply
  3. analyze_ticket()   — combines both, entry-point for the route
"""
import logging
from typing import Literal
from pydantic import BaseModel, Field
from app.ai.groq_client import client as groq_client, instructor_client, _FAST_MODEL

logger = logging.getLogger("civilai.support")

_CATEGORIES = Literal[
    "technical", "billing", "feature_request", "training",
    "account", "project_data", "general",
]

_PRIORITIES = Literal["low", "medium", "high", "urgent"]

_CLASSIFY_SYSTEM = """\
You are a support ticket classifier for CivilAI — an AI-powered construction management platform.
Given a ticket subject and description, classify the ticket accurately.

Priority guide:
  urgent  — data loss, security breach, platform completely down
  high    — feature blocking active work, cannot access the account
  medium  — feature works but with issues, general questions blocking a task
  low     — feature requests, general how-to questions, feedback

can_resolve: true if an AI can fully resolve with information/guidance, false if it requires a human agent.
"""

_RESPOND_SYSTEM = """\
You are CivilAI Support — a helpful, professional support assistant for CivilAI, an AI-powered construction management platform.
Respond to the customer's support ticket in a friendly, concise, and actionable way.
- If you can solve the issue, provide clear step-by-step guidance.
- If the issue requires human intervention (billing changes, account access restoration, data corruption), acknowledge the issue warmly and tell them a human agent will follow up within 1 business day.
- Never make up features that don't exist.
- Keep the response under 250 words.
CivilAI features: AI Copilot, project management, cost & budget, scheduling, safety, documents, BIM/CAD, workforce, vendors, contracts, compliance, equipment, reports, analytics, predictive ML, green monitor.
"""


class TicketClassification(BaseModel):
    category: _CATEGORIES  # type: ignore[valid-type]
    priority: _PRIORITIES  # type: ignore[valid-type]
    can_resolve: bool
    summary: str = Field(description="One sentence summarising the issue")


def classify_ticket(subject: str, description: str) -> dict:
    """Return category, priority, can_resolve, summary using instructor-validated output."""
    try:
        result: TicketClassification = instructor_client.chat.completions.create(
            model=_FAST_MODEL,
            response_model=TicketClassification,
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM},
                {"role": "user",   "content": f"Subject: {subject}\n\nDescription: {description}"},
            ],
            max_tokens=200,
            max_retries=2,
        )
        return {
            "category":    result.category,
            "priority":    result.priority,
            "can_resolve": result.can_resolve,
            "summary":     result.summary,
        }
    except Exception as exc:
        logger.error("classify_ticket error: %s", exc)
        return {"category": "general", "priority": "medium", "can_resolve": False, "summary": subject}


def generate_response(subject: str, description: str, category: str, priority: str) -> str:
    """Generate the AI's initial response to the ticket."""
    try:
        resp = groq_client.chat.completions.create(
            model=_FAST_MODEL,
            messages=[
                {"role": "system", "content": _RESPOND_SYSTEM},
                {"role": "user",   "content": (
                    f"Category: {category} | Priority: {priority}\n"
                    f"Subject: {subject}\n\n"
                    f"Customer message:\n{description}"
                )},
            ],
            max_tokens=400,
            temperature=0.4,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error("generate_response error: %s", exc)
        return (
            "Thank you for contacting CivilAI Support. We've received your ticket and "
            "a member of our team will be in touch within 1 business day."
        )


def analyze_ticket(subject: str, description: str) -> dict:
    """Full pipeline: classify then generate response. Returns everything the route needs."""
    meta = classify_ticket(subject, description)
    response = generate_response(subject, description, meta["category"], meta["priority"])
    return {
        "category":    meta["category"],
        "priority":    meta["priority"],
        "can_resolve": meta["can_resolve"],
        "summary":     meta["summary"],
        "ai_response": response,
        "ai_status":   "resolved" if meta["can_resolve"] else "open",
    }


def generate_followup_response(
    ticket_subject: str,
    ticket_description: str,
    new_message: str,
    conversation_history: list,
) -> str:
    """Generate a reply to a follow-up message in an existing ticket thread."""
    try:
        messages = [{"role": "system", "content": _RESPOND_SYSTEM}]
        for turn in conversation_history[-6:]:
            role = "assistant" if turn.get("sender") in ("ai", "agent") else "user"
            messages.append({"role": role, "content": turn.get("message", "")})
        messages.append({"role": "user", "content": new_message})
        resp = groq_client.chat.completions.create(
            model=_FAST_MODEL,
            messages=messages,
            max_tokens=350,
            temperature=0.4,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.error("generate_followup_response error: %s", exc)
        return "Thank you for the update. Our team is reviewing your message and will respond shortly."
