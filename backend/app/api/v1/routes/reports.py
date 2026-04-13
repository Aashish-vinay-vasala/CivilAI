from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.ai.report_generator import (
    generate_weekly_report,
    generate_stakeholder_report,
    generate_risk_report,
    generate_meeting_summary,
    generate_kpi_summary
)

router = APIRouter()

class WeeklyReportRequest(BaseModel):
    project_name: str
    week_number: int
    progress_percentage: float
    budget_spent: float
    total_budget: float
    completed_tasks: list = []
    pending_tasks: list = []
    issues: list = []
    safety_incidents: int = 0

class StakeholderReportRequest(BaseModel):
    project_name: str
    client_name: str
    report_date: str
    overall_progress: float
    budget_status: str
    key_achievements: list = []
    upcoming_milestones: list = []
    concerns: list = []

class RiskReportRequest(BaseModel):
    project_name: str
    risks: list = []
    mitigation_status: dict = {}
    new_risks: list = []

class MeetingRequest(BaseModel):
    meeting_title: str
    date: str
    attendees: list = []
    transcript: str

class KPIRequest(BaseModel):
    project_name: str
    kpis: dict = {}
    targets: dict = {}
    period: str = "Monthly"

@router.post("/weekly")
async def weekly_report(
    request: WeeklyReportRequest
):
    try:
        report = generate_weekly_report(
            request.model_dump()
        )
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stakeholder")
async def stakeholder_report(
    request: StakeholderReportRequest
):
    try:
        report = generate_stakeholder_report(
            request.model_dump()
        )
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/risk")
async def risk_report(
    request: RiskReportRequest
):
    try:
        report = generate_risk_report(
            request.model_dump()
        )
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/meeting-summary")
async def meeting_summary(
    request: MeetingRequest
):
    try:
        summary = generate_meeting_summary(
            request.transcript
        )
        return {
            "status": "success",
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/kpi")
async def kpi_report(
    request: KPIRequest
):
    try:
        report = generate_kpi_summary(
            request.model_dump()
        )
        return {
            "status": "success",
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))