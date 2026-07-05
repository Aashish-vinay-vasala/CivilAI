"""
LangGraph ReAct agent — CivilAI's agentic copilot.

Uses create_react_agent (langgraph.prebuilt) with 8 domain tools backed by the
existing analyzer modules, plus EVM calculation and document generation.

The agent decides which tool(s) to call based on the user's message, executes them,
and synthesises a final response — all in one round-trip from the caller's perspective.

Streaming is supported: call agent_stream() for an async event generator.
"""
import json
import logging
from typing import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langsmith import traceable

from app.config import settings

logger = logging.getLogger("civilai.agent")

_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """\
You are CivilAI Agent, an expert AI assistant for construction management with LIVE access to \
project data stored in the database. You work for project directors, site engineers, and contractors.

CRITICAL RULES — follow these exactly:
1. Messages may start with [project_id: <uuid>]. ALWAYS extract and use that UUID when calling \
tools that accept a project_id argument. Never ignore the project_id prefix.
2. You have tools that fetch REAL-TIME data. ALWAYS call a tool before answering questions about \
schedule, cost, safety, workforce, equipment, payments, contracts, compliance, or procurement. \
NEVER say "I don't have access to real-time information" — you have full database access via tools.
3. For broad "how is my project doing?" questions, call get_project_dashboard(project_id).
4. For domain-specific questions, call the matching tool: analyze_schedule_data for schedule, \
analyze_cost_data for budget/cost, analyze_safety_data for safety incidents, etc.
5. If no project_id is in the message, call list_projects() to show the user what is available, \
then ask them to specify which project they mean.
6. After tools return results, synthesise the LIVE data into clear, specific, actionable insights. \
Do NOT repeat raw JSON — explain what it means and what to do about it.
7. Cite OSHA, IBC, ACI, FIDIC, or NEC standards where relevant.

RESPONSE FORMAT — always structure your final answer with bold section headings and bullet points. \
Never write a wall of prose. Use this exact pattern:

**[Section Heading]**
- [Technical bullet point with specific data, values, percentages, or clause references]
- [Another bullet point]

**[Next Section Heading]**
- [Bullet point]

Example headings to select from based on context:
**Project Health Overview**, **Schedule Status & Critical Path**, **Cost Performance (EVM)**, \
**Safety & Compliance**, **Workforce Analysis**, **Equipment Health**, **Payment & Cash Flow**, \
**Risk Exposure**, **Root Cause Analysis**, **Regulatory Context**, **Recommended Actions**, \
**Immediate Action Items**, **Next Steps**

TERMINOLOGY — use domain-specific language throughout:
- Scheduling: CPM, float, critical path, baseline, NTP, look-ahead, earned schedule
- Cost/EVM: CPI, SPI, EAC, BAC, BCWP, BCWS, ACWP, VAC, ETC, contingency drawdown
- Contracts: PCO, SOV, GMP, retention, LD, DAB, FIDIC 2017 Red Book Clause references, NEC4 compensation events
- Quality: ITP, NCR, hold point, witness point, defects liability period, substantial completion
- Safety: hierarchy of controls, TRIR, LTIR, OSHA 29 CFR 1926 subpart references
- BIM/Digital: LOD, IFC, BCF, clash detection, ISO 19650
- Always state CPI and SPI numerically when EVM data is available; flag if below 0.9 as critical
- Always flag safety-critical items first under a **Safety Alert** heading if severity warrants it
- The audience is senior engineers, project directors, and quantity surveyors — be thorough and precise
"""


# ── Tool definitions ───────────────────────────────────────────────────────────

@tool
def list_projects() -> str:
    """
    List all construction projects in the database.
    Call this FIRST when the user hasn't specified which project they want to discuss.
    Returns project names, IDs, status, budget, and dates so the user can select one.
    """
    try:
        from app.ai.live_data import fetch_projects
        projects = fetch_projects(30)
        if not projects:
            return "No projects found in the database."
        lines = ["Available Projects:\n"]
        for p in projects:
            lines.append(
                f"• {p.get('name', 'Unnamed')} (ID: {p.get('id', '?')[:8]}…) | "
                f"Status: {p.get('status', 'Unknown')} | "
                f"Budget: ${p.get('budget', 0):,.0f} | "
                f"Client: {p.get('client', 'Unknown')} | "
                f"{p.get('start_date', '?')} → {p.get('end_date', '?')}"
            )
        return "\n".join(lines)
    except Exception as exc:
        return f"Could not fetch projects: {exc}"


@tool
def get_project_dashboard(project_id: str) -> str:
    """
    Get a full real-time dashboard snapshot of a project — schedule, cost, safety, workforce,
    equipment, payments, compliance, anomalies, and recent daily reports all in one call.
    Use this for general questions like 'how is my project doing?' or 'give me a project overview'.
    If the user hasn't specified a project_id, use the most recent one by passing an empty string.

    Args:
        project_id: The project UUID from list_projects(). Pass "" to use the most recent project.
    """
    try:
        from app.ai.live_data import build_full_context, resolve_project
        from app.ai.groq_client import analyze_document

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() to see available projects."

        ctx = build_full_context(proj["id"])
        return analyze_document(
            ctx,
            "You are a senior construction project manager. Based on this live project data, provide:\n"
            "1. Overall project health (RAG: Red/Amber/Green) with justification\n"
            "2. Schedule status — on track, delayed, or ahead? Key milestones and critical tasks\n"
            "3. Cost status — budget vs actual, overrun risk\n"
            "4. Safety status — incidents, compliance, immediate risks\n"
            "5. Workforce — adequate staffing, skills gaps, productivity\n"
            "6. Equipment — health scores, maintenance due, downtime risks\n"
            "7. Payments — overdue invoices, cash flow status\n"
            "8. Top 3 immediate action items the project team must address this week\n"
            "Be specific with numbers from the data. Do not generalise.",
        )
    except Exception as exc:
        return f"Dashboard failed: {exc}"


@tool
def analyze_schedule_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE schedule data from the database and analyse for delays, critical path risks,
    and recovery options. Automatically pulls schedule_tasks table for the specified project.
    If project_id is unknown, call list_projects() first.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context to include (e.g. upcoming milestones, constraints).
    """
    try:
        from app.ai.live_data import fetch_schedule, resolve_project, _section
        from app.ai.schedule_analyzer import analyze_schedule

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        tasks = fetch_schedule(pid)
        if not tasks:
            return f"No schedule tasks found for project '{proj.get('name', pid)}'."

        import json
        ctx = (
            f"Project: {proj.get('name')} | Status: {proj.get('status')} | "
            f"Start: {proj.get('start_date')} | End: {proj.get('end_date')}\n\n"
            f"Schedule Tasks ({len(tasks)} total):\n{json.dumps(tasks, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_schedule(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | Tasks: {len(tasks)}\n"
            f"Risk Level: {risk.get('risk_level', 'Unknown')} | "
            f"Delay: {risk.get('delay_days', 0)} days | "
            f"Completion Probability: {risk.get('completion_probability', 'Unknown')}\n\n"
            f"Critical Tasks: {', '.join(risk.get('critical_tasks', [])) or 'None'}\n"
            f"Delay Causes: {', '.join(risk.get('delay_causes', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Schedule analysis failed: {exc}"


@tool
def analyze_safety_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE safety incidents from the database and analyse for OSHA compliance gaps,
    injury risk, and corrective actions. Pulls safety_incidents table for the project.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. upcoming inspections, site conditions).
    """
    try:
        from app.ai.live_data import fetch_safety, resolve_project
        from app.ai.safety_analyzer import analyze_safety_report
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        incidents = fetch_safety(pid)
        ctx = (
            f"Project: {proj.get('name')} | Status: {proj.get('status')}\n\n"
            f"Safety Incidents ({len(incidents)} records):\n{json.dumps(incidents, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_safety_report(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | Incidents: {len(incidents)}\n"
            f"Risk Score: {risk.get('risk_score', 'N/A')}/10 | "
            f"Level: {risk.get('risk_level', 'Unknown')} | "
            f"OSHA Compliance: {risk.get('osha_compliance', 'Unknown')}\n\n"
            f"Violations: {', '.join(risk.get('violations', [])) or 'None'}\n"
            f"Immediate Actions: {', '.join(risk.get('immediate_actions', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Safety analysis failed: {exc}"


@tool
def analyze_cost_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE cost entries and budget items from the database and analyse for overruns,
    cash flow risks, and savings opportunities. Pulls cost_entries and financial_budget_items tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. pending change orders, upcoming expenses).
    """
    try:
        from app.ai.live_data import fetch_cost, resolve_project
        from app.ai.cost_analyzer import analyze_cost_report
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        data = fetch_cost(pid)
        ctx = (
            f"Project: {proj.get('name')} | Budget: ${proj.get('budget', 0):,.0f} | "
            f"Status: {proj.get('status')}\n\n"
            f"Cost Entries ({len(data['cost_entries'])}):\n{json.dumps(data['cost_entries'], indent=2, default=str)}\n\n"
            f"Budget Line Items ({len(data['budget_items'])}):\n{json.dumps(data['budget_items'], indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_cost_report(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        overrun = risk.get("overrun_percentage")
        return (
            f"Project: {proj.get('name')} | Budget: ${proj.get('budget', 0):,.0f}\n"
            f"Overrun: {f'{overrun:.1f}%' if overrun is not None else 'N/A'} | "
            f"Risk: {risk.get('risk_level', 'Unknown')} | "
            f"Budget Utilization: {risk.get('budget_utilization', 'Unknown')}\n\n"
            f"Top Cost Drivers: {', '.join(risk.get('top_cost_drivers', [])) or 'None'}\n"
            f"Cash Flow: {risk.get('cash_flow_status', 'Unknown')}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Cost analysis failed: {exc}"


@tool
def analyze_contract_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE RFIs, submittals, and permits from the database and analyse for contract risks,
    disputes, and compliance issues. Pulls rfis, submittals, and permits tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any specific contract clauses or concerns to highlight.
    """
    try:
        from app.ai.live_data import fetch_rfis, fetch_submittals, fetch_permits, resolve_project
        from app.ai.contract_analyzer import analyze_contract
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        rfis       = fetch_rfis(pid)
        submittals = fetch_submittals(pid)
        permits    = fetch_permits(pid)

        ctx = (
            f"Project: {proj.get('name')} | Client: {proj.get('client')}\n\n"
            f"RFIs ({len(rfis)}):\n{json.dumps(rfis, indent=2, default=str)}\n\n"
            f"Submittals ({len(submittals)}):\n{json.dumps(submittals, indent=2, default=str)}\n\n"
            f"Permits ({len(permits)}):\n{json.dumps(permits, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_contract(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | RFIs: {len(rfis)} | Submittals: {len(submittals)} | Permits: {len(permits)}\n"
            f"Risk Score: {risk.get('risk_score', 'N/A')}/10 | "
            f"Level: {risk.get('risk_level', 'Unknown')} | "
            f"Dispute Probability: {risk.get('dispute_probability', 'Unknown')}\n\n"
            f"Top Risks: {', '.join(risk.get('top_risks', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Contract analysis failed: {exc}"


@tool
def calculate_evm_metrics(planned_value: float, earned_value: float, actual_cost: float) -> str:
    """
    Calculate Earned Value Management (EVM) metrics from explicitly provided PV, EV, and AC values.
    Use this when the user gives specific dollar amounts. For live project EVM data use get_project_dashboard.

    Args:
        planned_value: Planned Value (PV) — budgeted cost of work scheduled
        earned_value: Earned Value (EV) — budgeted cost of work performed
        actual_cost: Actual Cost (AC) — actual cost of work performed
    """
    try:
        cpi = earned_value / actual_cost if actual_cost else 0.0
        spi = earned_value / planned_value if planned_value else 0.0
        cv  = earned_value - actual_cost
        sv  = earned_value - planned_value
        eac = actual_cost + (planned_value - earned_value) / cpi if cpi else 0.0
        etc = eac - actual_cost
        vac = planned_value - eac
        return (
            f"EVM Summary\n"
            f"──────────────────────────────\n"
            f"CPI  = {cpi:.3f}  → {'On Budget ✓' if cpi >= 1 else f'Over Budget ✗ (${abs(cv):,.0f} more than planned)'}\n"
            f"SPI  = {spi:.3f}  → {'On Schedule ✓' if spi >= 1 else f'Behind Schedule ✗ ({abs(sv/planned_value*100):.1f}% behind)'}\n"
            f"CV   = ${cv:,.0f}  | SV  = ${sv:,.0f}\n"
            f"EAC  = ${eac:,.0f}  | ETC = ${etc:,.0f}  | VAC = ${vac:,.0f}\n"
            f"──────────────────────────────\n"
            f"{'Project under control.' if cpi >= 1 and spi >= 1 else 'Project needs corrective action — review cost drivers and schedule.'}"
        )
    except Exception as exc:
        return f"EVM calculation failed: {exc}"


@tool
def assess_compliance_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE permits and safety data from the database and assess regulatory compliance,
    permit status, expiry risks, and building code gaps. Pulls permits and safety_incidents tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any specific regulatory requirements or inspection schedule.
    """
    try:
        from app.ai.live_data import fetch_permits, fetch_safety, resolve_project
        from app.ai.compliance_analyzer import analyze_compliance
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        permits   = fetch_permits(pid)
        incidents = fetch_safety(pid)

        ctx = (
            f"Project: {proj.get('name')} | Location: {proj.get('location')}\n\n"
            f"Permits ({len(permits)}):\n{json.dumps(permits, indent=2, default=str)}\n\n"
            f"Safety Incidents ({len(incidents)}):\n{json.dumps(incidents[:20], indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_compliance(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | Permits: {len(permits)}\n"
            f"Compliance Score: {risk.get('compliance_score', 'Unknown')} | "
            f"Risk: {risk.get('risk_level', 'Unknown')} | "
            f"Violations: {risk.get('violations_count', 0)}\n\n"
            f"Missing/Expired Permits: {', '.join(risk.get('permits_missing', [])) or 'None'}\n"
            f"Urgent Actions: {', '.join(risk.get('urgent_actions', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Compliance assessment failed: {exc}"


@tool
def analyze_equipment_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE equipment records and maintenance logs from the database and analyse health,
    failure risk, and maintenance needs. Pulls equipment and equipment_maintenance_logs tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. upcoming heavy lift, known faults).
    """
    try:
        from app.ai.live_data import fetch_equipment, resolve_project
        from app.ai.equipment_analyzer import analyze_equipment
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        data = fetch_equipment(pid)
        equip = data["equipment"]
        logs  = data["maintenance_logs"]

        ctx = (
            f"Project: {proj.get('name')}\n\n"
            f"Equipment ({len(equip)} assets):\n{json.dumps(equip, indent=2, default=str)}\n\n"
            f"Maintenance Logs ({len(logs)} entries):\n{json.dumps(logs, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_equipment(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | Equipment: {len(equip)} assets\n"
            f"Failure Risk: {risk.get('failure_risk', 'Unknown')} | "
            f"Health Score: {risk.get('health_score', 'Unknown')} | "
            f"Overdue Maintenance: {risk.get('maintenance_overdue', 0)} items\n\n"
            f"Critical Equipment: {', '.join(risk.get('critical_equipment', [])) or 'None'}\n"
            f"Downtime Probability: {risk.get('downtime_probability', 'Unknown')}\n"
            f"Est. Repair Cost: ${risk.get('estimated_repair_cost', 0):,.0f}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Equipment analysis failed: {exc}"


@tool
def analyze_vendor_data(vendor_text: str) -> str:
    """
    Score and analyse a construction vendor for performance, reliability, and financial risk.
    Provide vendor profiles, bid data, performance history, or supplier details as text.
    Returns vendor score, risk rating, red flags, and recommendation.
    """
    try:
        from app.ai.vendor_analyzer import score_vendor
        result = score_vendor({"raw_text": vendor_text})
        risk = result.get("risk_data", result)
        analysis = result.get("analysis", "")
        return (
            f"Vendor Score: {risk.get('vendor_score', risk.get('score', 'N/A'))}/10 | "
            f"Risk: {risk.get('risk_level', risk.get('risk', 'Unknown'))} | "
            f"Reliability: {risk.get('reliability_rating', risk.get('reliability', 'Unknown'))}\n\n"
            f"Key Risks: {', '.join(risk.get('key_risks', risk.get('risks', []))) or 'None'}\n"
            f"Recommendations: {', '.join(risk.get('recommendations', [])) or 'None'}\n\n"
            f"{('Analysis:\n' + analysis) if analysis else ''}"
        )
    except Exception as exc:
        try:
            from app.ai.groq_client import analyze_document
            return analyze_document(
                vendor_text,
                "Score this vendor (0-10) on: financial stability, delivery reliability, quality track record, "
                "pricing competitiveness, and compliance. Identify red flags. Recommend: accept/reject/negotiate.",
            )
        except Exception:
            return f"Vendor analysis failed: {exc}"


@tool
def analyze_payment_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE invoices and payment data from the database and analyse cash flow risks,
    overdue invoices, and retention issues. Pulls invoices and financial_budget_items tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. disputed invoices, retention terms).
    """
    try:
        from app.ai.live_data import fetch_payments, resolve_project
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        data     = fetch_payments(pid)
        invoices = data["invoices"]
        budget   = data["budget_summary"]

        ctx = (
            f"Project: {proj.get('name')} | Budget: ${proj.get('budget', 0):,.0f}\n\n"
            f"Invoices ({len(invoices)}):\n{json.dumps(invoices, indent=2, default=str)}\n\n"
            f"Budget Summary:\n{json.dumps(budget, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        return analyze_document(
            ctx,
            "You are a construction finance expert. Analyse this live payment data for: "
            "total invoiced vs paid vs overdue (amounts and days overdue), cash flow risk level "
            "(low/medium/high/critical), retention held, upcoming payment obligations, "
            "late payment penalties accruing, and prioritised collection actions. "
            "Reference FIDIC Clause 14 or NEC Option Y(UK)2 where applicable.",
        )
    except Exception as exc:
        return f"Payment analysis failed: {exc}"


@tool
def analyze_workforce_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE workforce records from the database and analyse skills gaps, turnover risk,
    and productivity. Pulls workforce and skill_targets tables.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. upcoming peak demand, subcontractor disputes).
    """
    try:
        from app.ai.live_data import fetch_workforce, resolve_project
        from app.ai.workforce_analyzer import analyze_workforce
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        data    = fetch_workforce(pid)
        workers = data["workers"]
        targets = data["skill_targets"]

        ctx = (
            f"Project: {proj.get('name')}\n\n"
            f"Workforce ({len(workers)} workers):\n{json.dumps(workers, indent=2, default=str)}\n\n"
            f"Skill Targets:\n{json.dumps(targets, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_workforce(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')} | Workforce: {len(workers)} workers\n"
            f"Risk: {risk.get('risk_level', 'Unknown')} | "
            f"Turnover Risk: {risk.get('turnover_risk', 'Unknown')} | "
            f"Headcount Gap: {risk.get('headcount_gap', 0)}\n\n"
            f"Skills Gaps: {', '.join(risk.get('skills_gaps', [])) or 'None'}\n"
            f"Recommendations: {', '.join(risk.get('recommendations', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Workforce analysis failed: {exc}"


@tool
def analyze_procurement_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE cost codes, daily reports, and budget data to analyse procurement health,
    material delivery status, and supply chain risks for the project.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any specific supplier or material concerns to include.
    """
    try:
        from app.ai.live_data import fetch_cost_codes, fetch_daily_reports, resolve_project
        from app.ai.procurement_analyzer import analyze_procurement
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        codes   = fetch_cost_codes(pid)
        reports = fetch_daily_reports(pid, limit=5)

        ctx = (
            f"Project: {proj.get('name')}\n\n"
            f"Cost Codes / Materials ({len(codes)}):\n{json.dumps(codes, indent=2, default=str)}\n\n"
            f"Recent Daily Reports (materials & issues):\n{json.dumps(reports, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        result = analyze_procurement(ctx)
        risk = result.get("risk_data", {})
        analysis = result.get("analysis", "")
        return (
            f"Project: {proj.get('name')}\n"
            f"Procurement Risk: {risk.get('risk_level', 'Unknown')} | "
            f"Lead Time Risk: {risk.get('lead_time_risk', 'Unknown')} | "
            f"Cost Variance: {risk.get('cost_variance', 'Unknown')}\n\n"
            f"Supply Chain Issues: {', '.join(risk.get('supply_chain_issues', [])) or 'None'}\n"
            f"Priority Actions: {', '.join(risk.get('priority_actions', [])) or 'None'}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Procurement analysis failed: {exc}"


@tool
def assess_green_metrics(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE anomaly history and daily reports from the database to assess sustainability,
    carbon footprint, waste management, and ESG compliance for the project.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any ESG targets, certifications sought, or specific sustainability concerns.
    """
    try:
        from app.ai.live_data import fetch_anomalies, fetch_daily_reports, resolve_project
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        anomalies = fetch_anomalies(pid)
        reports   = fetch_daily_reports(pid, limit=7)

        ctx = (
            f"Project: {proj.get('name')} | Location: {proj.get('location')}\n\n"
            f"Anomaly History ({len(anomalies)}):\n{json.dumps(anomalies, indent=2, default=str)}\n\n"
            f"Daily Reports — last 7 days:\n{json.dumps(reports, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        return analyze_document(
            ctx,
            "You are a construction sustainability expert. Based on this live project data, provide:\n"
            "1. Carbon footprint estimate (scope 1/2/3 in tCO2e) based on equipment and materials used\n"
            "2. Waste generation and diversion rate from daily reports\n"
            "3. ESG compliance score (0-10) with breakdown\n"
            "4. Gaps to LEED, BREEAM, or Green Star certification\n"
            "5. Top 5 actionable sustainability improvements\n"
            "Reference ISO 14064 and GHG Protocol. Be specific with numbers.",
        )
    except Exception as exc:
        return f"Green metrics failed: {exc}"


@tool
def analyze_bim_data(bim_text: str) -> str:
    """
    Analyse BIM coordination data, clash reports, and quantity takeoffs provided as text.
    Provide clash report text, IFC element descriptions, or BIM coordination notes as input.
    Returns clash severity breakdown, affected systems, rework cost, and resolution priorities.
    """
    try:
        from app.ai.groq_client import analyze_document
        return analyze_document(
            bim_text,
            "You are a BIM coordination expert. Analyse this BIM/IFC data for:\n"
            "1. Clash count by severity (Critical / Major / Minor)\n"
            "2. Affected MEP, structural, and architectural systems\n"
            "3. Estimated rework cost and schedule impact\n"
            "4. Quantity takeoff summary if element data is present\n"
            "5. Resolution priority list (who acts first, by when)\n"
            "Reference ISO 19650 BIM standards.",
        )
    except Exception as exc:
        return f"BIM analysis failed: {exc}"


@tool
def run_what_if_scenario(scenario_description: str, project_id: str = "") -> str:
    """
    Fetch LIVE project data then model a what-if scenario to predict its impact on cost,
    schedule, risk, and resources. Pulls project, schedule, and cost data as the baseline.
    Example scenarios: 'add 10 workers to the concrete crew', 'delay steel delivery by 2 weeks',
    'crash the schedule by 3 weeks using overtime', 'cut the materials budget by 15%'.

    Args:
        scenario_description: The what-if scenario to model.
        project_id: The project UUID for baseline data. Pass "" to use most recent project.
    """
    try:
        from app.ai.live_data import fetch_schedule, fetch_cost, fetch_workforce, resolve_project
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        baseline = ""
        if proj:
            pid      = proj["id"]
            schedule = fetch_schedule(pid)
            cost     = fetch_cost(pid)
            workers  = fetch_workforce(pid)
            baseline = (
                f"\nLIVE PROJECT BASELINE — {proj.get('name')}:\n"
                f"Budget: ${proj.get('budget', 0):,.0f} | Status: {proj.get('status')}\n"
                f"Schedule Tasks: {len(schedule)} | Workers: {len(workers.get('workers', []))}\n"
                f"Cost Entries: {len(cost.get('cost_entries', []))}\n"
                f"Recent costs: {json.dumps(cost.get('cost_entries', [])[:10], default=str)}\n"
                f"Active tasks: {json.dumps([t for t in schedule if t.get('status') != 'complete'][:10], default=str)}\n"
            )

        ctx = f"SCENARIO: {scenario_description}\n{baseline}"
        return analyze_document(
            ctx,
            "You are a construction project controls expert. Using the live project baseline and the scenario, predict:\n"
            "1. Schedule impact (days gained/lost, new completion date estimate)\n"
            "2. Cost impact ($ change, new EAC)\n"
            "3. Risk level change (increase/decrease and why)\n"
            "4. Resource implications (labour, equipment, materials)\n"
            "5. Downstream effects on other activities and dependencies\n"
            "6. Recommendation: proceed / do not proceed / modify approach\n"
            "Use CPM scheduling logic and EVM principles. Be specific with numbers.",
        )
    except Exception as exc:
        return f"What-if scenario failed: {exc}"


@tool
def generate_advanced_report(report_type: str, project_id: str = "", extra_context: str = "") -> str:
    """
    Fetch ALL live project data and generate a detailed professional construction report.
    Automatically pulls schedule, cost, safety, workforce, equipment, payments, and compliance.
    Supported types: stakeholder_report, kpi_summary, risk_register, meeting_minutes,
    tender_evaluation, lessons_learned, monthly_progress, board_pack.

    Args:
        report_type: stakeholder_report / kpi_summary / risk_register / meeting_minutes /
                     tender_evaluation / lessons_learned / monthly_progress / board_pack
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Additional data or specific requirements for the report.
    """
    prompts = {
        "stakeholder_report": "Generate a professional stakeholder report with: Executive Summary, "
                              "Project Status (RAG), Key Milestones (planned vs actual), Budget Summary, "
                              "Top Risks, Key Decisions Required, and Next Period Outlook.",
        "kpi_summary": "Generate a KPI dashboard with: SPI, CPI, Safety Score, Incident Rate, "
                       "Equipment Health, Workforce Productivity, Invoice Payment Rate, and trend commentary.",
        "risk_register": "Generate a risk register: Risk ID | Description | Category | Probability (H/M/L) | "
                         "Impact (H/M/L) | Risk Score | Owner | Mitigation | Status.",
        "meeting_minutes": "Generate structured meeting minutes: Date/Attendees, Agenda Items, "
                           "Decisions Made, Action Items (Owner + Due Date), Next Meeting.",
        "tender_evaluation": "Generate a tender evaluation comparing bidders on: price, programme, "
                             "methodology, experience, resources, compliance. Include recommended award.",
        "lessons_learned": "Generate a lessons learned report: What Went Well, What Went Wrong, "
                           "Root Causes, Recommendations for Future Projects.",
        "monthly_progress": "Generate a monthly progress report: Work Completed, Planned vs Actual, "
                            "Issues and Delays, Cost this Period, Forecast to Complete.",
        "board_pack": "Generate an executive board pack: Project Health (RAG), Financial Performance, "
                      "Schedule Status, Key Risks, Decisions Required, and Outlook.",
    }
    rtype = report_type.lower().replace(" ", "_").replace("-", "_")
    prompt = prompts.get(rtype,
        f"Generate a professional construction {report_type} report. "
        "Include executive summary, key metrics, analysis, risks, and recommended actions."
    )

    try:
        from app.ai.live_data import build_full_context, resolve_project
        from app.ai.groq_client import analyze_document

        proj = resolve_project(project_id)
        if proj:
            ctx = build_full_context(proj["id"])
            if extra_context:
                ctx += f"\n\n=== ADDITIONAL REQUIREMENTS ===\n{extra_context}"
        else:
            ctx = extra_context or "No project data available."

        return analyze_document(ctx, prompt)
    except Exception as exc:
        return f"Report generation failed: {exc}"


@tool
def generate_document(document_type: str, project_id: str = "", context: str = "") -> str:
    """
    Generate a professional construction document, optionally pulling live project data as context.
    Supported types: rfi, incident_report, change_order, weekly_report, payment_reminder, permit_application.

    Args:
        document_type: rfi / incident_report / change_order / weekly_report / payment_reminder / permit_application
        project_id: The project UUID to pull live data for context. Pass "" to skip.
        context: Additional details — parties, dates, issue description, amounts, etc.
    """
    doc_type = document_type.lower().replace(" ", "_").replace("-", "_")

    live_ctx = ""
    if project_id:
        try:
            from app.ai.live_data import resolve_project, fetch_rfis, fetch_safety, fetch_payments
            proj = resolve_project(project_id)
            if proj:
                live_ctx = f"Project: {proj.get('name')} | Client: {proj.get('client')} | Location: {proj.get('location')}\n"
        except Exception:
            pass

    full_context = f"{live_ctx}{context}".strip()

    try:
        if doc_type == "rfi":
            from app.ai.contract_analyzer import generate_rfi
            return generate_rfi(full_context, "")
        elif doc_type == "incident_report":
            from app.ai.safety_analyzer import generate_incident_report
            return generate_incident_report({"description": full_context})
        elif doc_type in ("change_order", "change order"):
            from app.ai.contract_analyzer import analyze_change_order
            return analyze_change_order(full_context)
        elif doc_type == "weekly_report":
            from app.ai.report_generator import generate_weekly_report
            return generate_weekly_report({"context": full_context})
        elif doc_type == "payment_reminder":
            from app.ai.payment_analyzer import generate_payment_reminder
            return generate_payment_reminder({"context": full_context})
        elif doc_type == "permit_application":
            from app.ai.compliance_analyzer import generate_permit_application
            return generate_permit_application({"context": full_context})
        else:
            from app.ai.groq_client import analyze_document
            return analyze_document(
                full_context,
                f"Generate a professional {document_type} for a construction project.",
            )
    except Exception as exc:
        return f"Document generation failed: {exc}"


# ── Agent assembly ─────────────────────────────────────────────────────────────

_TOOLS = [
    # Discovery
    list_projects,
    get_project_dashboard,
    # Domain analysis — live DB
    analyze_schedule_data,
    analyze_safety_data,
    analyze_cost_data,
    analyze_contract_data,
    assess_compliance_data,
    analyze_equipment_data,
    analyze_payment_data,
    analyze_workforce_data,
    analyze_procurement_data,
    assess_green_metrics,
    run_what_if_scenario,
    generate_advanced_report,
    # EVM + documents
    calculate_evm_metrics,
    generate_document,
    # Text-only (no DB table)
    analyze_vendor_data,
    analyze_bim_data,
]

_llm = ChatGroq(
    model=_MODEL,
    api_key=settings.GROQ_API_KEY,
    temperature=0.1,
    max_tokens=4096,
)

_agent = create_react_agent(_llm, tools=_TOOLS)


# ── Public helpers ─────────────────────────────────────────────────────────────

def _build_messages(user_message: str, history: list[dict]) -> list:
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    for h in history:
        role = h.get("role", "user")
        content = h.get("content", "")
        if not content:
            continue
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))
    msgs.append(HumanMessage(content=user_message))
    return msgs


def _extract_result(result: dict) -> tuple[str, list[dict]]:
    """Parse LangGraph output into (final_response, tool_steps)."""
    messages = result.get("messages", [])
    tool_steps: list[dict] = []
    final_response = ""

    for msg in messages:
        if isinstance(msg, AIMessage):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_steps.append({
                        "tool":   tc.get("name", "unknown"),
                        "input":  tc.get("args", {}),
                        "output": None,
                    })
            elif msg.content:
                final_response = msg.content if isinstance(msg.content, str) else str(msg.content)
        elif isinstance(msg, ToolMessage) and msg.content:
            for step in reversed(tool_steps):
                if step["output"] is None:
                    step["output"] = str(msg.content)[:800]
                    break

    return final_response, tool_steps


@traceable(name="agent-chat", run_type="chain")
def run_agent(user_message: str, history: list[dict] | None = None) -> dict:
    """
    Synchronous agent run. Returns {reply, tool_steps}.
    Prefer run_agent_stream for long-running requests.
    """
    msgs = _build_messages(user_message, history or [])
    try:
        result = _agent.invoke({"messages": msgs})
        reply, steps = _extract_result(result)
        return {"reply": reply or "I was unable to generate a response. Please try again.", "tool_steps": steps}
    except Exception as exc:
        logger.error("Agent run failed: %s", exc)
        raise RuntimeError(f"Agent error: {exc}") from exc


async def run_agent_stream(
    user_message: str,
    history: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """
    Async generator that yields SSE-ready event dicts as the agent runs.

    Event types:
      {"type": "token",      "content": "..."}           — partial response token
      {"type": "tool_start", "tool": "...", "input": {}} — tool about to be called
      {"type": "tool_end",   "tool": "...", "output": ""}— tool finished
      {"type": "done"}                                    — stream complete
    """
    msgs = _build_messages(user_message, history or [])
    try:
        async for event in _agent.astream_events({"messages": msgs}, version="v2"):
            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    content = chunk.content if isinstance(chunk.content, str) else ""
                    if content:
                        yield {"type": "token", "content": content}

            elif kind == "on_tool_start":
                yield {
                    "type":  "tool_start",
                    "tool":  event.get("name", ""),
                    "input": event["data"].get("input", {}),
                }

            elif kind == "on_tool_end":
                output = event["data"].get("output", "")
                yield {
                    "type":   "tool_end",
                    "tool":   event.get("name", ""),
                    "output": str(output)[:800] if output else "",
                }

        yield {"type": "done"}

    except Exception as exc:
        logger.error("Agent stream error: %s", exc)
        yield {"type": "error", "content": str(exc)}
        yield {"type": "done"}
