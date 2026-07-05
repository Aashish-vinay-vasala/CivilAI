"""
Customer support ticket system with AI auto-response.

Supabase tables required:

  CREATE TABLE support_tickets (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email    TEXT NOT NULL,
    user_name     TEXT DEFAULT 'Anonymous',
    subject       TEXT NOT NULL,
    description   TEXT NOT NULL,
    category      TEXT DEFAULT 'general',
    priority      TEXT DEFAULT 'medium',
    status        TEXT DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved','closed')),
    ai_response   TEXT,
    ai_resolved   BOOLEAN DEFAULT FALSE,
    assigned_to   TEXT,
    project_id    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
  );

  CREATE TABLE support_messages (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id   UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender      TEXT CHECK (sender IN ('user','ai','agent')),
    sender_name TEXT DEFAULT '',
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
"""
import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from app.services.db_service import supabase
from app.core.security import protect_route, get_optional_user
from app.core.guardrails import sanitize_prompt
from app.ai.support_analyzer import analyze_ticket, generate_followup_response

router = APIRouter()
logger = logging.getLogger("civilai.support")

_ADMIN_ROLES  = ("project_director", "admin")
_VALID_STATUS = {"open", "in_progress", "resolved", "closed"}
_VALID_PRIORITY = {"low", "medium", "high", "urgent"}


# ── Request / response models ──────────────────────────────────────────────────

class NewTicket(BaseModel):
    user_email:  str
    user_name:   str = "Anonymous"
    subject:     str
    description: str
    project_id:  Optional[str] = None

    @field_validator("subject", "description")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("user_email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email address")
        return v.strip().lower()


class TicketUpdate(BaseModel):
    status:      Optional[str] = None
    priority:    Optional[str] = None
    assigned_to: Optional[str] = None


class NewMessage(BaseModel):
    sender:      str   # 'user' | 'agent'
    sender_name: str = ""
    message:     str

    @field_validator("sender")
    @classmethod
    def valid_sender(cls, v: str) -> str:
        if v not in ("user", "agent"):
            raise ValueError("sender must be 'user' or 'agent'")
        return v

    @field_validator("message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v.strip()


# ── Ticket endpoints ───────────────────────────────────────────────────────────

@router.post("/tickets")
async def create_ticket(body: NewTicket, _user=Depends(get_optional_user)):
    """
    Submit a support ticket. AI immediately classifies and auto-responds.
    If the AI can fully resolve the issue, the ticket is auto-closed.
    """
    # sanitize free-text fields
    subject, _     = sanitize_prompt(body.subject,     max_length=200)
    description, _ = sanitize_prompt(body.description, max_length=3000)

    try:
        ai = analyze_ticket(subject, description)
    except Exception as exc:
        logger.error("support analyze_ticket failed: %s", exc)
        ai = {
            "category":    "general",
            "priority":    "medium",
            "can_resolve": False,
            "ai_response": (
                "Thank you for contacting support. A team member will respond within 1 business day."
            ),
            "ai_status":   "open",
        }

    now = datetime.datetime.utcnow().isoformat()
    ticket_data = {
        "user_email":  body.user_email,
        "user_name":   body.user_name,
        "subject":     subject,
        "description": description,
        "category":    ai["category"],
        "priority":    ai["priority"],
        "status":      ai["ai_status"],
        "ai_response": ai["ai_response"],
        "ai_resolved": ai["can_resolve"],
        "project_id":  body.project_id,
        "created_at":  now,
        "updated_at":  now,
        "resolved_at": now if ai["can_resolve"] else None,
    }

    try:
        res = supabase.table("support_tickets").insert(ticket_data).execute()
        ticket = res.data[0] if res.data else ticket_data
        ticket_id = ticket.get("id")

        # Save the original user message and AI response as the first two messages
        if ticket_id:
            supabase.table("support_messages").insert([
                {
                    "ticket_id":   ticket_id,
                    "sender":      "user",
                    "sender_name": body.user_name,
                    "message":     description,
                    "created_at":  now,
                },
                {
                    "ticket_id":   ticket_id,
                    "sender":      "ai",
                    "sender_name": "CivilAI Support",
                    "message":     ai["ai_response"],
                    "created_at":  now,
                },
            ]).execute()

        logger.info(
            "Support ticket created | id=%s | category=%s | priority=%s | ai_resolved=%s",
            ticket_id, ai["category"], ai["priority"], ai["can_resolve"],
        )
        return {
            "status":      "success",
            "ticket":      ticket,
            "ai_response": ai["ai_response"],
            "ai_resolved": ai["can_resolve"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets")
def list_tickets(
    status:     Optional[str] = None,
    category:   Optional[str] = None,
    priority:   Optional[str] = None,
    user_email: Optional[str] = None,
    limit:      int = 50,
    _user=Depends(get_optional_user),
):
    """
    List tickets. Admins see all; users filter by their own email.
    """
    try:
        query = (
            supabase.table("support_tickets")
            .select("id, user_email, user_name, subject, category, priority, status, ai_resolved, assigned_to, created_at, updated_at, resolved_at")
            .order("created_at", desc=True)
        )
        if status:
            query = query.eq("status", status)
        if category:
            query = query.eq("category", category)
        if priority:
            query = query.eq("priority", priority)
        if user_email:
            query = query.eq("user_email", user_email)
        res = query.limit(min(limit, 200)).execute()
        return {"tickets": res.data or [], "count": len(res.data or [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, _user=Depends(get_optional_user)):
    try:
        res = supabase.table("support_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/tickets/{ticket_id}")
def update_ticket(
    ticket_id: str,
    body: TicketUpdate,
    _user=Depends(protect_route(*_ADMIN_ROLES)),
):
    """Agents/admins update status, priority, or assignment."""
    updates: dict = {}
    if body.status:
        if body.status not in _VALID_STATUS:
            raise HTTPException(status_code=400, detail=f"status must be one of {_VALID_STATUS}")
        updates["status"] = body.status
        if body.status in ("resolved", "closed"):
            updates["resolved_at"] = datetime.datetime.utcnow().isoformat()
    if body.priority:
        if body.priority not in _VALID_PRIORITY:
            raise HTTPException(status_code=400, detail=f"priority must be one of {_VALID_PRIORITY}")
        updates["priority"] = body.priority
    if body.assigned_to is not None:
        updates["assigned_to"] = body.assigned_to
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.datetime.utcnow().isoformat()
    try:
        res = supabase.table("support_tickets").update(updates).eq("id", ticket_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return {"status": "success", "ticket": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Message / conversation endpoints ──────────────────────────────────────────

@router.get("/tickets/{ticket_id}/messages")
def get_messages(ticket_id: str, _user=Depends(get_optional_user)):
    try:
        res = (
            supabase.table("support_messages")
            .select("*")
            .eq("ticket_id", ticket_id)
            .order("created_at")
            .execute()
        )
        return {"messages": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tickets/{ticket_id}/messages")
async def add_message(ticket_id: str, body: NewMessage, _user=Depends(get_optional_user)):
    """
    Add a message to a ticket thread.
    If sender=user, AI automatically generates a follow-up reply.
    """
    # Fetch the ticket for context
    try:
        ticket_res = supabase.table("support_tickets").select("*").eq("id", ticket_id).execute()
        if not ticket_res.data:
            raise HTTPException(status_code=404, detail="Ticket not found")
        ticket = ticket_res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    clean_message, _ = sanitize_prompt(body.message, max_length=2000)
    now = datetime.datetime.utcnow().isoformat()

    try:
        # Save the user / agent message
        supabase.table("support_messages").insert({
            "ticket_id":   ticket_id,
            "sender":      body.sender,
            "sender_name": body.sender_name,
            "message":     clean_message,
            "created_at":  now,
        }).execute()

        ai_reply = None

        if body.sender == "user" and ticket.get("status") != "closed":
            # Get conversation history for context
            history_res = (
                supabase.table("support_messages")
                .select("sender, message")
                .eq("ticket_id", ticket_id)
                .order("created_at")
                .limit(10)
                .execute()
            )
            history = history_res.data or []

            ai_reply = generate_followup_response(
                ticket_subject=ticket.get("subject", ""),
                ticket_description=ticket.get("description", ""),
                new_message=clean_message,
                conversation_history=history,
            )
            ai_now = datetime.datetime.utcnow().isoformat()
            supabase.table("support_messages").insert({
                "ticket_id":   ticket_id,
                "sender":      "ai",
                "sender_name": "CivilAI Support",
                "message":     ai_reply,
                "created_at":  ai_now,
            }).execute()

            # Re-open closed/resolved tickets when user replies
            if ticket.get("status") in ("resolved", "closed"):
                supabase.table("support_tickets").update({
                    "status":     "open",
                    "updated_at": ai_now,
                }).eq("id", ticket_id).execute()

        return {
            "status":   "success",
            "ai_reply": ai_reply,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stats endpoint (admin) ─────────────────────────────────────────────────────

@router.get("/stats")
def support_stats(_user=Depends(protect_route(*_ADMIN_ROLES))):
    """Ticket counts by status and category — for a support dashboard."""
    try:
        res = supabase.table("support_tickets").select("status, category, priority, ai_resolved").execute()
        rows = res.data or []

        status_counts: dict[str, int] = {}
        category_counts: dict[str, int] = {}
        priority_counts: dict[str, int] = {}
        ai_resolved = sum(1 for r in rows if r.get("ai_resolved"))

        for r in rows:
            s = r.get("status", "open")
            c = r.get("category", "general")
            p = r.get("priority", "medium")
            status_counts[s]   = status_counts.get(s, 0) + 1
            category_counts[c] = category_counts.get(c, 0) + 1
            priority_counts[p] = priority_counts.get(p, 0) + 1

        return {
            "total":          len(rows),
            "ai_resolved":    ai_resolved,
            "by_status":      status_counts,
            "by_category":    category_counts,
            "by_priority":    priority_counts,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
