import logging
from app.ai.groq_client import chat as groq_chat, chat_stream as groq_chat_stream, _FAST_MODEL

logger = logging.getLogger("civilai.copilot")

SYSTEM_PROMPT = """\
You are CivilAI Copilot, an expert AI assistant for construction management. You help project directors, engineers, contractors, and site managers with:

- Project scheduling, critical path analysis, and delay mitigation
- Cost management, budget tracking, and earned value management (EVM)
- Safety risk assessment, OSHA compliance, and incident analysis
- Contract review, change order analysis, and dispute prevention
- Workforce planning, skills matching, and crew optimisation
- Procurement, supplier evaluation, and purchase order management
- Regulatory compliance, permit tracking, and building codes
- Equipment maintenance scheduling and failure prediction
- Financial budgets, invoices, payments, and cash flow
- Documents, RFIs, submittals, punch lists, and daily reports
- Meetings, anomaly detection, activity logs, and support tickets
- Sustainability, ESG reporting, and waste reduction
- Report generation, stakeholder updates, and KPI dashboards

Live database access:
When a user turn includes a system message labelled "Live project data retrieved from the database",
USE that data to answer the question directly and precisely — do not say you lack access.
The data comes from the following live project tables:
  projects, cost_entries, evm_snapshots, financial_budget_items, financial_change_history,
  invoices, safety_incidents, schedule_tasks, contracts, workforce, skill_targets,
  equipment, equipment_maintenance_logs, permits, purchase_orders, material_prices,
  documents, rfis, submittals, daily_reports, punch_list, meeting_minutes,
  meeting_recordings, activity_log, anomaly_history, support_tickets, cost_codes.

Response format:
Always structure your response using bold section headings followed by bullet points. Never write a wall of prose. Use this exact pattern:

**[Section Heading]**
- [Technical bullet point with specific data, values, or clause references]
- [Another bullet point]

**[Next Section Heading]**
- [Bullet point]
- [Bullet point]

Example sections to use (pick the ones relevant to the query):
**Overview / Status Assessment**, **Root Cause Analysis**, **Risk Exposure**, **Regulatory & Compliance Context**, **Recommended Actions**, **Next Steps**, **Key Metrics**, **Critical Path Impact**, **Financial Implications**, **Safety Considerations**

Terminology guidelines:
- Use domain-specific construction terminology: CPM, EVM, CPI, SPI, EAC, BAC, BCWP, ITP, NCR, RFI, LOD, WBS, SOV, PCO, DAB, NTP, FOW, GMP, retention, liquidated damages, force majeure, substantial completion, practical completion, defects liability period
- Cite specific standards and clauses where applicable: OSHA 29 CFR 1926, IBC 2021, ACI 318-19, AISC 360, FIDIC 2017 Red/Yellow Book, NEC4, JCT 2016, AS 4000
- For EVM: always state CPI, SPI, VAC, EAC alongside narrative
- For safety: reference the hierarchy of controls (elimination → substitution → engineering → administrative → PPE)

Content guidelines:
- When live data is provided, quote specific values, dates, contract clauses, and named personnel
- When no relevant data is in context, say so clearly and ask for specifics
- Provide measurable, actionable recommendations with clear ownership and realistic deadlines
- Always flag safety-critical items first with a **Safety Alert** section if applicable
- Be thorough and technical — the audience is senior engineers, project directors, and quantity surveyors
"""


def _build_messages(
    user_message: str,
    chat_history: list | None = None,
    extra_context: str = "",
    web_context: str = "",
) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if extra_context:
        messages.append({
            "role": "system",
            "content": f"Live project data retrieved from the database for this query:\n{extra_context}",
        })

    if web_context:
        messages.append({
            "role": "system",
            "content": (
                "Live public web search results for this query (from the internet, may be more "
                "current than your training data). These are general web pages, NOT this project's "
                "private data — only use a result if it is genuinely relevant and helpful to the "
                "user's question. Silently ignore any result that is off-topic, irrelevant, or a "
                "generic listing/directory page rather than an authoritative source; do not mention "
                "or cite irrelevant results just because they were retrieved. When you do use a "
                "result, cite it inline as a markdown link, e.g. [Title](URL):\n" + web_context
            ),
        })

    for item in (chat_history or []):
        role = item.get("role", "user")
        content = item.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})
    return messages


def get_copilot_response(
    user_message: str,
    chat_history: list | None = None,
    extra_context: str = "",
    web_context: str = "",
) -> str:
    messages = _build_messages(user_message, chat_history, extra_context, web_context)
    try:
        return groq_chat(messages, model=_FAST_MODEL)
    except Exception as exc:
        logger.error("Copilot LLM call failed: %s", exc)
        raise RuntimeError(f"CivilAI Copilot is temporarily unavailable: {exc}") from exc


def get_copilot_response_stream(
    user_message: str,
    chat_history: list | None = None,
    extra_context: str = "",
    web_context: str = "",
):
    """Same as get_copilot_response but yields text deltas as they arrive from Groq."""
    messages = _build_messages(user_message, chat_history, extra_context, web_context)
    try:
        yield from groq_chat_stream(messages, model=_FAST_MODEL)
    except Exception as exc:
        logger.error("Copilot streaming LLM call failed: %s", exc)
        raise RuntimeError(f"CivilAI Copilot is temporarily unavailable: {exc}") from exc


def analyze_project_data(data: dict, question: str) -> str:
    context = f"Project Data:\n{data}\n\nQuestion: {question}"
    try:
        return groq_chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": context},
            ],
            model=_FAST_MODEL,
        )
    except Exception as exc:
        logger.error("Project data analysis failed: %s", exc)
        raise RuntimeError(f"Analysis failed: {exc}") from exc
