"""
Local MCP server exposing CivilAI's live project data to AI tools (Claude Desktop,
Claude Code, etc.) running on this machine.

Deliberately exposes a curated subset of the in-app copilot's 28 tools
(app.ai.agent_copilot._TOOLS) rather than all of them — a demo-facing MCP
client benefits from a small, predictable tool list more than from parity
with the copilot's full set. The selection lives entirely here, not in
agent_copilot.py, so it can't affect the in-app copilot's own tool selection
or token budget. Add more names to _DEMO_TOOLS below to expose more later.

Every included tool is the exact same function the in-app copilot agent uses,
so results here match what the CivilAI copilot itself would return.

There's no "session" concept for MCP tool calls — each call is independent.
What you provide instead is a project_id (ask the assistant to call
list_projects first if you only know the project by name).

Run directly:
    venv\\Scripts\\python.exe -m app.mcp.server
"""
import os
import sys
from pathlib import Path

# Make this runnable regardless of the caller's working directory (e.g. when
# launched by Claude Desktop, which doesn't set cwd) by putting backend/ on
# sys.path so `app.*` imports resolve, and chdir'ing there so config.py's
# relative `.env` lookup (Config.env_file = ".env") still finds it.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)

from mcp.server.fastmcp import FastMCP

from app.ai.agent_copilot import _TOOLS

mcp = FastMCP("CivilAI")

# Started as a curated demo subset; now mirrors the full agent_copilot._TOOLS
# set (plus add_worker below). Kept as an explicit named list rather than
# switching to "expose everything automatically" so a new tool added to
# agent_copilot.py later doesn't silently appear here without a deliberate
# choice to include it.
_DEMO_TOOLS = {
    "list_projects",
    "get_project_dashboard",
    "analyze_schedule_data",
    "analyze_safety_data",
    "analyze_cost_data",
    "analyze_workforce_data",
    "log_safety_incident",
    "update_schedule_task_status",
    "add_punch_list_item",
    # ── Second batch ──
    "analyze_contract_data",
    "analyze_contract_terms",
    "assess_compliance_data",
    "analyze_equipment_data",
    "analyze_payment_data",
    "get_accounting_reconciliation",
    "analyze_procurement_data",
    "analyze_vendor_data",
    "analyze_punch_list_data",
    "summarize_meetings",
    # ── Third batch — the rest of agent_copilot._TOOLS ──
    "assess_green_metrics",
    "get_evm_history",
    "run_what_if_scenario",
    "generate_advanced_report",
    "calculate_evm_metrics",
    "generate_document",
    "analyze_bim_data",
    "extract_material_prices_from_text",
    "extract_budget_items_from_text",
    "predict_cost_overrun_ml",
}

for _tool in _TOOLS:
    if _tool.name in _DEMO_TOOLS:
        mcp.add_tool(_tool.func, name=_tool.name, description=_tool.description)


def add_worker(
    name: str,
    role: str,
    project_id: str = "",
    trade: str = "",
    phone: str = "",
    email: str = "",
) -> dict:
    """Add a new worker to the workforce roster. Pass project_id to attach
    them to a specific project (call list_projects first if you only have
    a project name, not its ID)."""
    from app.api.v1.routes.workforce import create_worker, WorkerCreate
    return create_worker(WorkerCreate(
        name=name, role=role, project_id=project_id or None,
        trade=trade, phone=phone, email=email,
    ))


mcp.add_tool(add_worker, name="add_worker", description=add_worker.__doc__)

if __name__ == "__main__":
    mcp.run()
