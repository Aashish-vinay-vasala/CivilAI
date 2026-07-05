"""
Cross-module context builder for voice chat.

Scans the user's transcript for topic keywords and fetches matching live
project data from Supabase, which is then injected into the LLM context so
the voice assistant can answer questions about any module (costs, safety,
schedule, contracts, workforce, equipment, compliance, procurement, documents,
financials, EVM, punch lists, meetings, anomalies, support, etc.).
"""
import json
import logging
import re

logger = logging.getLogger("civilai.voice_db")

# (regex pattern, table, columns to select, row limit, order column or None)
_TOPIC_MAP: list[tuple] = [
    # ── Projects overview ──────────────────────────────────────────────────────
    (
        r"project|overview|summary|portfolio|dashboard|all.project|status",
        "projects",
        "name,status,location,client,budget,start_date,end_date",
        10, "created_at",
    ),
    # ── Cost entries & EVM ────────────────────────────────────────────────────
    (
        r"cost|spend|expenditure|burn.rate|overrun|variance|earn|evm|cpi|spi",
        "cost_entries",
        "amount,category,description,created_at",
        8, "created_at",
    ),
    (
        r"earned.value|evm.snapshot|schedule.performance|cost.performance|bac|pv\b|ev\b|ac\b|eac\b",
        "evm_snapshots",
        "date,bac,pv,ev,ac,cpi,spi,eac,project_id",
        5, "date",
    ),
    # ── Financial budget items ────────────────────────────────────────────────
    (
        r"budget.item|line.item|revised.budget|projected.budget|committed.cost|direct.cost|financial.budget|cost.division",
        "financial_budget_items",
        "code,description,div_name,original_budget,revised_budget,projected_budget,committed_costs,direct_costs",
        10, None,
    ),
    (
        r"budget.change|change.history|budget.modification|approved.co|pending.change",
        "financial_change_history",
        "date,user_name,field,division,delta,reason",
        5, "date",
    ),
    # ── Invoices & Payments ───────────────────────────────────────────────────
    (
        r"invoice|payment|billing|overdue|cashflow|cash.flow|receivable|payable|remittance",
        "invoices",
        "invoice_number,contractor,amount,due_date,status",
        8, "due_date",
    ),
    # ── Safety ────────────────────────────────────────────────────────────────
    (
        r"safety|incident|hazard|osha|injury|risk|accident|violation|near.miss|ppe|toolbox|ltir|trir",
        "safety_incidents",
        "type,description,severity,status,date",
        8, "created_at",
    ),
    # ── Schedule & Tasks ──────────────────────────────────────────────────────
    (
        r"schedule|task|progress|delay|milestone|deadline|critical.path|float|phase|completion|gantt|overdu|behind",
        "schedule_tasks",
        "name,status,actual_progress,due_date,phase,assignee,delay_days",
        10, "created_at",
    ),
    # ── Contracts ─────────────────────────────────────────────────────────────
    (
        r"contract|clause|change.order|dispute|subcontract|retention|penalty|award|agreement|lump.sum",
        "contracts",
        "title,status,value,contractor",
        5, "created_at",
    ),
    # ── Workforce & Skills ────────────────────────────────────────────────────
    (
        r"workforce|worker|crew|labor|manpower|employee|team|headcount|staff|personnel|resource",
        "workforce",
        "name,role,status",
        10, "created_at",
    ),
    (
        r"skill|training|certification|competency|qualification|skill.gap|target",
        "skill_targets",
        "skill_name,target_count,current_count",
        8, None,
    ),
    # ── Equipment & Maintenance ───────────────────────────────────────────────
    (
        r"equipment|machine|crane|excavator|maintenance|breakdown|plant|fleet|utilisation|downtime",
        "equipment",
        "name,type,status,condition",
        8, "created_at",
    ),
    (
        r"maintenance.log|service.history|equipment.maintenance|repair.history|service.record",
        "equipment_maintenance_logs",
        "maintenance_type,description,date,cost",
        5, "date",
    ),
    # ── Compliance & Permits ──────────────────────────────────────────────────
    (
        r"compliance|permit|regulation|code|licence|license|certificate|inspection|approval|expir",
        "permits",
        "name,type,status,expiry_date",
        8, "created_at",
    ),
    # ── Procurement & Materials ───────────────────────────────────────────────
    (
        r"purchase|procurement|material|supplier|vendor|order|po\b|purchase.order|requisition",
        "purchase_orders",
        "item,status,total_amount,vendor",
        8, "created_at",
    ),
    (
        r"material.price|market.price|material.cost|commodity|price.trend|price.index",
        "material_prices",
        "material,price,unit,date",
        5, "date",
    ),
    # ── Documents ─────────────────────────────────────────────────────────────
    (
        r"document|drawing|plan|specification|file|upload|attachment",
        "documents",
        "name,type,status,created_at",
        5, "created_at",
    ),
    (
        r"\brfi\b|request.for.information|design.query|technical.query|rfi.status",
        "rfis",
        "subject,status,priority,due_date",
        5, "created_at",
    ),
    (
        r"submittal|shop.drawing|material.submittal|product.data|sample.submittal",
        "submittals",
        "title,status,type,due_date",
        5, "created_at",
    ),
    # ── Daily Reports ─────────────────────────────────────────────────────────
    (
        r"daily.report|site.report|daily.log|site.diary|daily.progress|today.on.site",
        "daily_reports",
        "date,weather,crew_count,work_completed,issues",
        5, "date",
    ),
    # ── Punch List & Closeout ─────────────────────────────────────────────────
    (
        r"punch.list|defect|snag|snagging|closeout|commissioning|handover|punchlist",
        "punch_list",
        "description,status,priority,assignee,due_date",
        10, "created_at",
    ),
    # ── Meetings ──────────────────────────────────────────────────────────────
    (
        r"meeting.minute|meeting.note|agenda|action.item|minutes",
        "meeting_minutes",
        "title,date,attendees,summary",
        5, "date",
    ),
    (
        r"meeting.recording|recorded.meeting|voice.recording|transcribed.meeting",
        "meeting_recordings",
        "filename,summary,num_speakers,created_at",
        5, "created_at",
    ),
    # ── Activity Log ──────────────────────────────────────────────────────────
    (
        r"activity|recent.activity|audit|audit.log|history|who.changed|who.did",
        "activity_log",
        "action,user,table_name,created_at",
        8, "created_at",
    ),
    # ── Anomaly Detection ─────────────────────────────────────────────────────
    (
        r"anomal|unusual|outlier|detect|abnormal|alert|flag|triggered",
        "anomaly_history",
        "detected_at,type,description,severity,status",
        5, "detected_at",
    ),
    # ── Support ───────────────────────────────────────────────────────────────
    (
        r"support|ticket|help.desk|complaint|issue.report|request.help",
        "support_tickets",
        "subject,status,priority,created_at",
        5, "created_at",
    ),
    # ── Cost Codes ────────────────────────────────────────────────────────────
    (
        r"cost.code|wbs|work.breakdown|cost.category|accounting.code",
        "cost_codes",
        "code,description,category",
        8, None,
    ),
]

# Always loaded regardless of query — gives the LLM grounding in what projects exist
_BASELINE_TABLES: list[tuple] = [
    ("projects", "name,status,location,client,budget,start_date,end_date", 10, "created_at"),
]


def _fetch_table(supabase, table: str, cols: str, limit: int, order_col) -> list:
    """
    Fetch rows with optional ordering. Falls back to unordered if the order
    column doesn't exist on this table.
    """
    try:
        q = supabase.table(table).select(cols)
        if order_col:
            q = q.order(order_col, desc=True)
        return q.limit(limit).execute().data or []
    except Exception:
        try:
            return supabase.table(table).select(cols).limit(limit).execute().data or []
        except Exception as exc:
            logger.debug("Context fetch failed for %s: %s", table, exc)
            return []


def build_module_context(text: str) -> str:
    """
    Return a formatted context string with live project data relevant to
    the given voice transcript.

    Always includes the projects table as baseline. Then scans the text for
    topic keywords and fetches data from matching tables. The result is
    injected into the LLM system prompt so the voice assistant can answer
    any question about the project.
    """
    from app.core.database import supabase  # lazy import — avoids circular deps at load time

    text_lower = (text or "").lower()
    parts: list[str] = []
    fetched_tables: set[str] = set()

    # ── Baseline: always load project list ────────────────────────────────────
    for table, cols, limit, order_col in _BASELINE_TABLES:
        rows = _fetch_table(supabase, table, cols, limit, order_col)
        if rows:
            parts.append(f"[{table} — {len(rows)} records]\n" + json.dumps(rows, default=str))
        fetched_tables.add(table)

    # ── Topic-matched tables ──────────────────────────────────────────────────
    for pattern, table, cols, limit, order_col in _TOPIC_MAP:
        if table in fetched_tables:
            continue
        if not re.search(pattern, text_lower):
            continue
        rows = _fetch_table(supabase, table, cols, limit, order_col)
        if rows:
            parts.append(
                f"[{table} — {len(rows)} most-recent records]\n"
                + json.dumps(rows, default=str)
            )
        fetched_tables.add(table)

    return "\n\n".join(parts)
