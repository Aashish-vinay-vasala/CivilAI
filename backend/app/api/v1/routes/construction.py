from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from supabase import create_client
from app.config import settings
from app.ai.groq_client import analyze_document
import uuid

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SECRET_KEY)

# ─── PUNCH LIST ───────────────────────────────────────────
class PunchListCreate(BaseModel):
    project_id: str
    item: str
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = "open"
    priority: Optional[str] = "medium"
    due_date: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None

class PunchListUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    closed_date: Optional[str] = None

@router.get("/punch-list/{project_id}")
def get_punch_list(project_id: str):
    try:
        res = supabase.table("punch_list").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
        return {"status": "success", "items": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/punch-list")
def create_punch_item(item: PunchListCreate):
    try:
        data = {**item.dict(), "id": str(uuid.uuid4())}
        res = supabase.table("punch_list").insert(data).execute()
        return {"status": "success", "item": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/punch-list/{item_id}")
def update_punch_item(item_id: str, item: PunchListUpdate):
    try:
        update_data = {k: v for k, v in item.dict().items() if v is not None}
        res = supabase.table("punch_list").update(update_data).eq("id", item_id).execute()
        return {"status": "success", "item": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/punch-list/{item_id}")
def delete_punch_item(item_id: str):
    try:
        supabase.table("punch_list").delete().eq("id", item_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── RFI ──────────────────────────────────────────────────
class RFICreate(BaseModel):
    project_id: str
    subject: str
    question: Optional[str] = None
    submitted_by: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = "open"
    priority: Optional[str] = "medium"
    due_date: Optional[str] = None

class RFIUpdate(BaseModel):
    response: Optional[str] = None
    status: Optional[str] = None
    responded_date: Optional[str] = None

@router.get("/rfis/{project_id}")
def get_rfis(project_id: str):
    try:
        res = supabase.table("rfis").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
        return {"status": "success", "rfis": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rfis")
def create_rfi(rfi: RFICreate):
    try:
        # Auto-generate RFI number
        existing = supabase.table("rfis").select("id").eq("project_id", rfi.project_id).execute()
        rfi_num = f"RFI-{str(len(existing.data or []) + 1).zfill(3)}"
        data = {**rfi.dict(), "id": str(uuid.uuid4()), "rfi_number": rfi_num}
        res = supabase.table("rfis").insert(data).execute()
        return {"status": "success", "rfi": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/rfis/{rfi_id}")
def update_rfi(rfi_id: str, rfi: RFIUpdate):
    try:
        update_data = {k: v for k, v in rfi.dict().items() if v is not None}
        res = supabase.table("rfis").update(update_data).eq("id", rfi_id).execute()
        return {"status": "success", "rfi": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/rfis/{rfi_id}")
def delete_rfi(rfi_id: str):
    try:
        supabase.table("rfis").delete().eq("id", rfi_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SUBMITTALS ───────────────────────────────────────────
class SubmittalCreate(BaseModel):
    project_id: str
    title: str
    type: Optional[str] = None
    submitted_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    status: Optional[str] = "pending"
    submitted_date: Optional[str] = None
    description: Optional[str] = None

class SubmittalUpdate(BaseModel):
    status: Optional[str] = None
    review_date: Optional[str] = None
    revision: Optional[int] = None

@router.get("/submittals/{project_id}")
def get_submittals(project_id: str):
    try:
        res = supabase.table("submittals").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
        return {"status": "success", "submittals": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submittals")
def create_submittal(submittal: SubmittalCreate):
    try:
        existing = supabase.table("submittals").select("id").eq("project_id", submittal.project_id).execute()
        sub_num = f"SUB-{str(len(existing.data or []) + 1).zfill(3)}"
        data = {**submittal.dict(), "id": str(uuid.uuid4()), "submittal_number": sub_num}
        res = supabase.table("submittals").insert(data).execute()
        return {"status": "success", "submittal": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/submittals/{submittal_id}")
def update_submittal(submittal_id: str, submittal: SubmittalUpdate):
    try:
        update_data = {k: v for k, v in submittal.dict().items() if v is not None}
        res = supabase.table("submittals").update(update_data).eq("id", submittal_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── DAILY REPORTS ────────────────────────────────────────
class DailyReportCreate(BaseModel):
    project_id: str
    report_date: str
    weather: Optional[str] = None
    temperature: Optional[float] = None
    workers_on_site: Optional[int] = 0
    work_completed: Optional[str] = None
    issues: Optional[str] = None
    materials_used: Optional[str] = None
    equipment_used: Optional[str] = None
    safety_incidents: Optional[str] = None
    created_by: Optional[str] = None

@router.get("/daily-reports/{project_id}")
def get_daily_reports(project_id: str):
    try:
        res = supabase.table("daily_reports").select("*").eq("project_id", project_id).order("report_date", desc=True).execute()
        return {"status": "success", "reports": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/daily-reports")
def create_daily_report(report: DailyReportCreate):
    try:
        # Generate AI summary
        summary_prompt = f"""
        Generate a professional construction daily report summary:
        Date: {report.report_date}
        Weather: {report.weather}, {report.temperature}°C
        Workers: {report.workers_on_site}
        Work Completed: {report.work_completed}
        Issues: {report.issues}
        Materials: {report.materials_used}
        Equipment: {report.equipment_used}
        Safety: {report.safety_incidents}
        
        Write a concise 3-4 sentence professional summary.
        """
        try:
            ai_summary = analyze_document("", summary_prompt)
        except:
            ai_summary = f"Daily report for {report.report_date}. {report.workers_on_site} workers on site. Work completed: {report.work_completed or 'As planned'}."

        data = {**report.dict(), "id": str(uuid.uuid4()), "ai_summary": ai_summary}
        res = supabase.table("daily_reports").insert(data).execute()
        return {"status": "success", "report": res.data[0] if res.data else data, "ai_summary": ai_summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── MEETING MINUTES ──────────────────────────────────────
class MeetingCreate(BaseModel):
    project_id: str
    meeting_date: str
    meeting_type: Optional[str] = None
    attendees: Optional[str] = None
    location: Optional[str] = None
    agenda: Optional[str] = None
    discussion: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting: Optional[str] = None
    created_by: Optional[str] = None

@router.get("/meetings/{project_id}")
def get_meetings(project_id: str):
    try:
        res = supabase.table("meeting_minutes").select("*").eq("project_id", project_id).order("meeting_date", desc=True).execute()
        return {"status": "success", "meetings": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/meetings")
def create_meeting(meeting: MeetingCreate):
    try:
        summary_prompt = f"""
        Generate professional meeting minutes summary:
        Type: {meeting.meeting_type}
        Date: {meeting.meeting_date}
        Attendees: {meeting.attendees}
        Agenda: {meeting.agenda}
        Discussion: {meeting.discussion}
        Action Items: {meeting.action_items}
        
        Write concise professional minutes in 3-4 sentences.
        """
        try:
            ai_summary = analyze_document("", summary_prompt)
        except:
            ai_summary = f"Meeting held on {meeting.meeting_date}. Attendees: {meeting.attendees or 'Site team'}. Action items recorded."

        data = {**meeting.dict(), "id": str(uuid.uuid4()), "ai_summary": ai_summary}
        res = supabase.table("meeting_minutes").insert(data).execute()
        return {"status": "success", "meeting": res.data[0] if res.data else data, "ai_summary": ai_summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── COST CODES ───────────────────────────────────────────
class CostCodeCreate(BaseModel):
    project_id: str
    code: str
    description: str
    category: Optional[str] = None
    budgeted_amount: Optional[float] = 0
    actual_amount: Optional[float] = 0
    unit: Optional[str] = None

@router.get("/cost-codes/{project_id}")
def get_cost_codes(project_id: str):
    try:
        res = supabase.table("cost_codes").select("*").eq("project_id", project_id).order("code").execute()
        return {"status": "success", "cost_codes": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cost-codes")
def create_cost_code(code: CostCodeCreate):
    try:
        data = {**code.dict(), "id": str(uuid.uuid4())}
        res = supabase.table("cost_codes").insert(data).execute()
        return {"status": "success", "cost_code": res.data[0] if res.data else data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/cost-codes/{code_id}")
def update_cost_code(code_id: str, actual_amount: float):
    try:
        res = supabase.table("cost_codes").update({"actual_amount": actual_amount}).eq("id", code_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))