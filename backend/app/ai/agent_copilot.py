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
def analyze_contract_terms(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE contract records from the database and analyse financial and risk terms —
    contract value, retention percentage, payment terms, risk level/score, and status.
    Pulls the contracts table for the project. Complements analyze_contract_data, which
    covers RFIs/submittals/permits rather than the contracts themselves.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any specific contractor, clause, or concern to focus on.
    """
    try:
        from app.ai.live_data import resolve_project
        from app.services.db_service import supabase
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        contracts = (
            supabase.table("contracts")
            .select("title,contract_type,contractor,value,status,risk_level,risk_score,"
                    "start_date,end_date,payment_terms,retention_percent,notes")
            .eq("project_id", pid).execute().data or []
        )
        if not contracts:
            return f"No contracts found for project '{proj.get('name', pid)}'."

        ctx = (
            f"Project: {proj.get('name')}\n\n"
            f"Contracts ({len(contracts)}):\n{json.dumps(contracts, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        analysis = analyze_document(
            ctx,
            "You are a construction contracts manager. Based on this live contract data, provide:\n"
            "1. Total contract value under management, broken down by contractor\n"
            "2. Retention held (%) and estimated $ amount per contract\n"
            "3. Payment terms summary and any unusual or risky terms\n"
            "4. High risk_level or high risk_score contracts flagged first, with why\n"
            "5. Contracts nearing end_date that need renewal or closeout attention\n"
            "Reference FIDIC or NEC4 clause types where relevant.",
        )
        total_value = sum(float(c.get("value") or 0) for c in contracts)
        high_risk = [c for c in contracts if str(c.get("risk_level", "")).lower() == "high"]
        return (
            f"Project: {proj.get('name')} | Contracts: {len(contracts)} | "
            f"Total Value: ${total_value:,.0f} | High Risk: {len(high_risk)}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Contract terms analysis failed: {exc}"


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
def extract_material_prices_from_text(price_text: str) -> str:
    """
    Extract structured material unit prices from pasted supplier quotes, price lists,
    or vendor correspondence. Returns material name, unit price, unit of measure, the
    as-of date, and any supplier/region notes for each priced item found.
    """
    try:
        from app.ai.material_price_analyzer import extract_material_prices
        items = extract_material_prices(price_text)
        if not items:
            return "No material prices could be extracted from this text."
        lines = [f"Extracted {len(items)} material price(s):\n"]
        for i in items:
            line = f"• {i.get('material')}: ${i.get('price', 0):,.2f} / {i.get('unit', 'unit')}"
            if i.get("as_of_date"):
                line += f" (as of {i['as_of_date']})"
            if i.get("notes"):
                line += f" — {i['notes']}"
            lines.append(line)
        return "\n".join(lines)
    except Exception as exc:
        return f"Material price extraction failed: {exc}"


@tool
def extract_budget_items_from_text(budget_text: str) -> str:
    """
    Extract structured budget line items from a pasted budget document, cost breakdown,
    or schedule of values. Returns CSI division, original/revised budget, committed and
    direct costs per line item, auto-computing revised/projected totals where missing.
    """
    try:
        from app.ai.financial_budget_analyzer import extract_budget_items
        items = extract_budget_items(budget_text)
        if not items:
            return "No budget line items could be extracted from this text."
        total_original = sum(i.get("original_budget", 0) for i in items)
        total_revised = sum(i.get("revised_budget", 0) for i in items)
        lines = [
            f"Extracted {len(items)} budget line item(s) | "
            f"Total Original: ${total_original:,.2f} | Total Revised: ${total_revised:,.2f}\n"
        ]
        for i in items:
            lines.append(
                f"• [{i.get('code')}] {i.get('description')} (Div {i.get('div_code')} — {i.get('div_name')}): "
                f"Original ${i.get('original_budget', 0):,.2f} → Revised ${i.get('revised_budget', 0):,.2f} | "
                f"Committed ${i.get('committed_costs', 0):,.2f} | Direct ${i.get('direct_costs', 0):,.2f}"
            )
        return "\n".join(lines)
    except Exception as exc:
        return f"Budget item extraction failed: {exc}"


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
def get_accounting_reconciliation(project_id: str) -> str:
    """
    Fetch a LIVE cross-module financial summary and reconciliation for the project —
    invoices, budget, contracts, cost entries, purchase orders, and the latest EVM
    snapshot all aggregated, plus reconciliation flags: invoices billed by a
    contractor with no contract on file, duplicate amounts, and budget overruns.
    Use this for financial audit, AP control, or "does our spending reconcile"
    questions — more thorough than analyze_cost_data or analyze_payment_data alone.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
    """
    try:
        from app.ai.live_data import resolve_project
        from app.ai.accounting_extractor import build_project_accounting_summary, reconcile_project_invoices
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        summary = build_project_accounting_summary(pid)
        reconciliation = reconcile_project_invoices(pid)

        ctx = (
            f"Project: {proj.get('name')}\n\n"
            f"Financial Summary:\n{json.dumps(summary, indent=2, default=str)}\n\n"
            f"Reconciliation Flags:\n{json.dumps(reconciliation, indent=2, default=str)}"
        )

        analysis = analyze_document(
            ctx,
            "You are a construction project controls auditor. Based on this cross-module "
            "financial summary and reconciliation, provide:\n"
            "1. Overall financial health (budget utilization, spend vs invoiced)\n"
            "2. Reconciliation issues — unmatched invoices, duplicate amounts, overpayments\n"
            "3. Budget line items at risk of overrun\n"
            "4. Prioritised follow-up actions for the finance/AP team\n"
            "Be specific with dollar amounts and contractor/vendor names.",
        )
        fh = summary.get("financial_health", {})
        return (
            f"Project: {proj.get('name')} | Budget: ${fh.get('original_budget', 0):,.0f} | "
            f"Spent: ${fh.get('total_spent', 0):,.0f} | "
            f"Utilization: {fh.get('budget_utilization', 'N/A')}%\n"
            f"Unmatched Invoices: {len(reconciliation.get('unmatched_invoices', []))} | "
            f"Duplicate Amounts: {len(reconciliation.get('duplicate_amounts', []))}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Accounting reconciliation failed: {exc}"


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
        from app.ai.green_analyzer import analyze_waste, calculate_carbon_footprint

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        anomalies = fetch_anomalies(pid)
        reports   = fetch_daily_reports(pid, limit=7)

        data = {
            "project": proj.get("name"),
            "location": proj.get("location"),
            "anomalies": anomalies,
            "daily_reports": reports,
        }
        if extra_context:
            data["additional_context"] = extra_context

        waste_analysis = analyze_waste(data)
        carbon_analysis = calculate_carbon_footprint(data)
        return (
            f"Project: {proj.get('name')} | Anomalies: {len(anomalies)} | Reports reviewed: {len(reports)}\n\n"
            f"**Waste & ESG Analysis**\n{waste_analysis}\n\n"
            f"**Carbon Footprint**\n{carbon_analysis}"
        )
    except Exception as exc:
        return f"Green metrics failed: {exc}"


@tool
def analyze_punch_list_data(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE punch list items from the database and analyse open defects, overdue items,
    responsible-party bottlenecks, and closure risk ahead of substantial completion.
    Pulls the punch_list table for the specified project.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any additional context (e.g. target closeout date, walk-through notes).
    """
    try:
        from app.ai.live_data import fetch_punch_list, resolve_project
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        items = fetch_punch_list(pid)
        if not items:
            return f"No punch list items found for project '{proj.get('name', pid)}'."

        ctx = (
            f"Project: {proj.get('name')} | Status: {proj.get('status')}\n\n"
            f"Punch List Items ({len(items)}):\n{json.dumps(items, indent=2, default=str)}"
        )
        if extra_context:
            ctx += f"\n\nAdditional Context: {extra_context}"

        open_items = [i for i in items if str(i.get("status", "")).lower() not in ("closed", "complete", "verified")]
        analysis = analyze_document(
            ctx,
            "You are a construction closeout manager. Based on this live punch list data, provide:\n"
            "1. Open vs closed item counts, broken down by category and priority\n"
            "2. Overdue items (past due_date) and who owns them\n"
            "3. Bottleneck responsible parties (assigned_to with the most open/overdue items)\n"
            "4. Closure risk — is the project on track for substantial completion? Why or why not\n"
            "5. Prioritised action list to accelerate closeout\n"
            "Be specific with item names and locations.",
        )
        return (
            f"Project: {proj.get('name')} | Total Items: {len(items)} | Open: {len(open_items)}\n\n"
            f"Analysis:\n{analysis}"
        )
    except Exception as exc:
        return f"Punch list analysis failed: {exc}"


@tool
def summarize_meetings(project_id: str, extra_context: str = "") -> str:
    """
    Fetch LIVE meeting minutes from the database and summarise recent decisions, action items,
    owners, deadlines, and follow-up items. Pulls the meeting_minutes table for the project.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
        extra_context: Any specific meeting date, type, or topic to focus on.
    """
    try:
        from app.ai.live_data import fetch_meeting_minutes, resolve_project
        from app.ai.report_generator import generate_meeting_summary
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        meetings = fetch_meeting_minutes(pid, limit=5)
        if not meetings:
            return f"No meeting minutes found for project '{proj.get('name', pid)}'."

        transcript = (
            f"Project: {proj.get('name')}\n\n"
            f"Recent Meetings ({len(meetings)}):\n{json.dumps(meetings, indent=2, default=str)}"
        )
        if extra_context:
            transcript += f"\n\nAdditional Context: {extra_context}"

        summary = generate_meeting_summary(transcript)
        return f"Project: {proj.get('name')} | Meetings reviewed: {len(meetings)}\n\n{summary}"
    except Exception as exc:
        return f"Meeting minutes summary failed: {exc}"


@tool
def get_evm_history(project_id: str) -> str:
    """
    Fetch LIVE historical EVM snapshots from the database and analyse CPI/SPI trend over time
    — is cost/schedule performance improving, stable, or deteriorating? Pulls the evm_snapshots
    table (up to the last 6 recorded snapshots). For a one-off manual calculation from specific
    PV/EV/AC values instead, use calculate_evm_metrics.

    Args:
        project_id: The project UUID. Pass "" to use the most recent project.
    """
    try:
        from app.ai.live_data import fetch_evm_snapshots, resolve_project
        from app.ai.groq_client import analyze_document
        import json

        proj = resolve_project(project_id)
        if not proj:
            return "No project found. Call list_projects() first."
        pid = proj["id"]

        snapshots = fetch_evm_snapshots(pid)
        if not snapshots:
            return f"No EVM snapshot history found for project '{proj.get('name', pid)}'. Use calculate_evm_metrics for a one-off calculation instead."

        ctx = (
            f"Project: {proj.get('name')} | Budget: ${proj.get('budget', 0):,.0f}\n\n"
            f"EVM Snapshots, most recent first ({len(snapshots)}):\n{json.dumps(snapshots, indent=2, default=str)}"
        )

        analysis = analyze_document(
            ctx,
            "You are a construction project controls expert. Based on this EVM snapshot history:\n"
            "1. CPI and SPI trend — improving, stable, or deteriorating over the recorded period\n"
            "2. Identify the inflection point, if any, and what likely caused it\n"
            "3. Forecast where CPI/SPI are headed if the trend continues\n"
            "4. Compare latest EAC to BAC and flag if VAC is worsening\n"
            "5. Recommended corrective actions if the trend is negative\n"
            "Be specific with numbers from each snapshot.",
        )
        return f"Project: {proj.get('name')} | Snapshots: {len(snapshots)}\n\nAnalysis:\n{analysis}"
    except Exception as exc:
        return f"EVM history analysis failed: {exc}"


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
    Supported types: rfi, incident_report, change_order, weekly_report, payment_reminder,
    permit_application, letter, email, notice, variation_order, dispute_letter.

    Args:
        document_type: rfi / incident_report / change_order / weekly_report / payment_reminder /
                        permit_application / letter / email / notice / variation_order / dispute_letter
        project_id: The project UUID to pull live data for context. Pass "" to skip.
        context: Additional details — parties, dates, subject, issue description, amounts, etc.
                 Put everything you know about the recipient, sender, and content here; it is
                 used as the body/description for letter, email, notice, and dispute_letter types.
    """
    doc_type = document_type.lower().replace(" ", "_").replace("-", "_")

    live_ctx = ""
    proj_name = ""
    if project_id:
        try:
            from app.ai.live_data import resolve_project, fetch_rfis, fetch_safety, fetch_payments
            proj = resolve_project(project_id)
            if proj:
                proj_name = proj.get("name") or ""
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
        elif doc_type in ("letter", "construction_letter"):
            from app.ai.writing_assistant import generate_letter
            return generate_letter({
                "letter_type": "Construction Correspondence",
                "from_name": "Project Team", "from_company": proj_name,
                "to_name": "Recipient", "to_company": "",
                "project_name": proj_name,
                "subject": (context[:100] if context else "Project Correspondence"),
                "key_points": full_context,
                "tone": "Professional",
            })
        elif doc_type == "email":
            from app.ai.writing_assistant import generate_email
            return generate_email({
                "email_type": "Project Update",
                "from_name": "Project Team", "to_name": "Recipient",
                "project_name": proj_name,
                "subject": (context[:100] if context else "Project Update"),
                "key_points": full_context,
                "tone": "Professional",
            })
        elif doc_type == "notice":
            from app.ai.writing_assistant import generate_notice
            return generate_notice({
                "notice_type": "Formal Notice",
                "project_name": proj_name,
                "issued_by": "Project Team", "issued_to": "Recipient",
                "details": full_context,
            })
        elif doc_type in ("variation_order", "vo"):
            from app.ai.writing_assistant import generate_variation_order
            return generate_variation_order({
                "project_name": proj_name,
                "vo_number": "TBD",
                "requested_by": "Project Team",
                "description": full_context,
                "cost_impact": "See description",
                "time_impact": "See description",
            })
        elif doc_type in ("dispute_letter", "dispute"):
            from app.ai.writing_assistant import generate_dispute_letter
            return generate_dispute_letter({
                "project_name": proj_name,
                "dispute_type": "General Dispute",
                "our_position": full_context,
                "evidence": "See attached context",
                "amount": "TBD",
            })
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
    analyze_contract_terms,
    assess_compliance_data,
    analyze_equipment_data,
    analyze_payment_data,
    get_accounting_reconciliation,
    analyze_workforce_data,
    analyze_procurement_data,
    assess_green_metrics,
    analyze_punch_list_data,
    summarize_meetings,
    get_evm_history,
    run_what_if_scenario,
    generate_advanced_report,
    # EVM + documents
    calculate_evm_metrics,
    generate_document,
    # Text-only (no DB table)
    analyze_vendor_data,
    analyze_bim_data,
    extract_material_prices_from_text,
    extract_budget_items_from_text,
]

_llm = ChatGroq(
    model=_MODEL,
    api_key=settings.GROQ_API_KEY,
    temperature=0.1,
    max_tokens=4096,
)

_agent = create_react_agent(_llm, tools=_TOOLS)


# ── Public helpers ─────────────────────────────────────────────────────────────

def _build_messages(
    user_message: str,
    history: list[dict],
    extra_context: str = "",
    web_context: str = "",
) -> list:
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]

    if extra_context:
        msgs.append(SystemMessage(
            content=f"Live project data already retrieved for this query:\n{extra_context}"
        ))
    if web_context:
        msgs.append(SystemMessage(
            content=(
                "Live public web search results for this query (from the internet, may be more "
                "current than your training data). Only use a result if it is genuinely relevant; "
                "cite it inline as a markdown link, e.g. [Title](URL):\n" + web_context
            )
        ))

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


def _is_groq_rate_limited(exc: Exception) -> bool:
    err = str(exc)
    return "429" in err or "rate_limit_exceeded" in err


def _gemini_fallback_reply(msgs: list) -> str:
    """
    Last-resort tier when the Groq-backed ReAct agent itself is rate-limited —
    routes the same conversation through Gemini as a plain completion (no
    tool-calling, since Gemini isn't wired into this agent's tool loop) so the
    user still gets a grounded answer instead of an error. Mirrors
    groq_client._gemini_fallback, which already covers this for the individual
    analyze_document() calls inside most tools — this closes the same gap for
    the top-level orchestration LLM, which has no fallback of its own.
    """
    from app.ai.gemini_client import text_completion

    system = "\n\n".join(str(m.content) for m in msgs if isinstance(m, SystemMessage))
    convo = "\n\n".join(
        f"{'User' if isinstance(m, HumanMessage) else 'Assistant'}: {m.content}"
        for m in msgs if isinstance(m, (HumanMessage, AIMessage)) and m.content
    )
    return text_completion(convo, system=system or None)


@traceable(name="agent-chat", run_type="chain")
def run_agent(
    user_message: str,
    history: list[dict] | None = None,
    extra_context: str = "",
    web_context: str = "",
) -> dict:
    """
    Synchronous agent run. Returns {reply, tool_steps}.
    Prefer run_agent_stream for long-running requests.
    """
    msgs = _build_messages(user_message, history or [], extra_context, web_context)
    try:
        result = _agent.invoke({"messages": msgs})
        reply, steps = _extract_result(result)
        return {"reply": reply or "I was unable to generate a response. Please try again.", "tool_steps": steps}
    except Exception as exc:
        if _is_groq_rate_limited(exc):
            logger.warning("Agent LLM rate-limited — falling back to Gemini (no tool-calling this turn): %s", exc)
            try:
                return {"reply": _gemini_fallback_reply(msgs), "tool_steps": []}
            except Exception as gem_exc:
                logger.error("Gemini fallback also failed: %s", gem_exc)
        logger.error("Agent run failed: %s", exc)
        raise RuntimeError(f"Agent error: {exc}") from exc


async def run_agent_stream(
    user_message: str,
    history: list[dict] | None = None,
    extra_context: str = "",
    web_context: str = "",
) -> AsyncIterator[dict]:
    """
    Async generator that yields SSE-ready event dicts as the agent runs.

    Event types:
      {"type": "token",      "content": "..."}           — partial response token
      {"type": "tool_start", "tool": "...", "input": {}} — tool about to be called
      {"type": "tool_end",   "tool": "...", "output": ""}— tool finished
      {"type": "done"}                                    — stream complete
    """
    msgs = _build_messages(user_message, history or [], extra_context, web_context)
    emitted_any = False
    try:
        async for event in _agent.astream_events({"messages": msgs}, version="v2"):
            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    content = chunk.content if isinstance(chunk.content, str) else ""
                    if content:
                        emitted_any = True
                        yield {"type": "token", "content": content}

            elif kind == "on_tool_start":
                emitted_any = True
                yield {
                    "type":  "tool_start",
                    "tool":  event.get("name", ""),
                    "input": event["data"].get("input", {}),
                }

            elif kind == "on_tool_end":
                emitted_any = True
                output = event["data"].get("output", "")
                yield {
                    "type":   "tool_end",
                    "tool":   event.get("name", ""),
                    "output": str(output)[:800] if output else "",
                }

        yield {"type": "done"}

    except Exception as exc:
        # Only fall back if nothing has streamed yet — a failure mid-stream (after
        # partial output already reached the client) just ends the generator early,
        # same as before; retrying would duplicate/conflict with what's already shown.
        if not emitted_any and _is_groq_rate_limited(exc):
            logger.warning("Agent stream rate-limited before any output — falling back to Gemini: %s", exc)
            try:
                reply = _gemini_fallback_reply(msgs)
                for i, word in enumerate(reply.split(" ")):
                    yield {"type": "token", "content": word if i == 0 else " " + word}
                yield {"type": "done"}
                return
            except Exception as gem_exc:
                logger.error("Gemini fallback also failed: %s", gem_exc)
        logger.error("Agent stream error: %s", exc)
        yield {"type": "error", "content": str(exc)}
        yield {"type": "done"}
