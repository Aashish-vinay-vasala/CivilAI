from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import httpx, os, html
from app.config import settings

router = APIRouter()

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL     = os.getenv("EMAIL_FROM", "CivilAI <notifications@civilai.app>")

class EmailPayload(BaseModel):
    to: List[str]
    subject: str
    body_html: str
    body_text: Optional[str] = None

class ReportEmailPayload(BaseModel):
    to: List[str]
    project_name: str
    report_type: str          # "weekly" | "daily" | "alert"
    summary: str
    metrics: Optional[dict] = None

def build_report_html(payload: ReportEmailPayload) -> str:
    metrics_rows = ""
    if payload.metrics:
        for key, val in payload.metrics.items():
            safe_key = html.escape(str(key))
            safe_val = html.escape(str(val))
            metrics_rows += f"<tr><td style='padding:6px 12px;color:#94a3b8;font-size:13px'>{safe_key}</td><td style='padding:6px 12px;color:#f8fafc;font-size:13px;font-weight:600'>{safe_val}</td></tr>"

    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);padding:12px 24px;border-radius:12px">
        <span style="color:white;font-size:20px;font-weight:700">CivilAI</span>
      </div>
    </div>
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#3b82f620,#1e40af10);padding:24px;border-bottom:1px solid #334155">
        <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">{payload.report_type.replace("_"," ").title()}</p>
        <h1 style="color:#f8fafc;font-size:22px;font-weight:700;margin:0">{payload.project_name}</h1>
      </div>
      <div style="padding:24px">
        <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-wrap">{payload.summary}</p>
        {"<table style='width:100%;border-collapse:collapse;background:#0f172a;border-radius:12px;overflow:hidden'>" + metrics_rows + "</table>" if metrics_rows else ""}
      </div>
    </div>
    <p style="color:#475569;font-size:12px;text-align:center;margin-top:24px">
      Sent by <a href="https://civilai.app" style="color:#3b82f6">CivilAI</a> ·
      <a href="https://civilai.app/unsubscribe" style="color:#3b82f6">Unsubscribe</a>
    </p>
  </div>
</body>
</html>"""

async def send_email(to: List[str], subject: str, html: str, text: str = "") -> bool:
    if not RESEND_API_KEY:
        print(f"[email] RESEND_API_KEY not set — would send to {to}: {subject}")
        return True
    async with httpx.AsyncClient() as http:
        res = await http.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": FROM_EMAIL, "to": to, "subject": subject, "html": html, "text": text or subject},
        )
        if res.status_code not in (200, 201):
            raise Exception(f"Resend error {res.status_code}: {res.text}")
    return True

@router.post("/send")
async def send_custom_email(payload: EmailPayload):
    try:
        await send_email(payload.to, payload.subject, payload.body_html, payload.body_text or "")
        return {"status": "success", "message": f"Email sent to {len(payload.to)} recipient(s)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/report")
async def send_report_email(payload: ReportEmailPayload):
    try:
        html = build_report_html(payload)
        subject = f"[CivilAI] {payload.report_type.replace('_',' ').title()} — {payload.project_name}"
        await send_email(payload.to, subject, html, payload.summary)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/alert")
async def send_alert_email(
    to: List[str],
    title: str,
    message: str,
    project: str = "CivilAI",
):
    try:
        html = build_report_html(ReportEmailPayload(
            to=to, project_name=project, report_type="alert",
            summary=message,
        ))
        await send_email(to, f"[CivilAI Alert] {title}", html, message)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
