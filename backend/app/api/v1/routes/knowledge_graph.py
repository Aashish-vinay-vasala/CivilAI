"""
Knowledge graph — visual entity/relationship explorer for the frontend.

Builds a lightweight, in-memory graph (networkx, already a LangGraph
dependency — no new infrastructure) directly from live Supabase data on
every request rather than maintaining a separate persisted graph store.
Simple enough for this app's scale, and it can never drift out of sync
with the underlying tables since there's nothing to keep in sync.

Graph shape: each project is a hub node; workers, vendors, schedule tasks,
and safety incidents are spoke nodes connected to the project(s) they
belong to. Read-only — reuses the "reports" module's RBAC (every role has
at least read access to it), matching the /analytics page this feeds.
"""
import networkx as nx
from fastapi import APIRouter, HTTPException
from typing import Optional

from app.services.db_service import supabase

router = APIRouter()

# (table, node type, label column, relation label)
_ENTITY_TABLES = [
    ("workforce",        "worker",     "name",           "works_on"),
    ("vendors",          "vendor",     "name",           "supplies"),
    ("schedule_tasks",   "task",       "task_name",      "part_of"),
    ("safety_incidents", "incident",   "incident_type",  "occurred_on"),
    ("rfis",              "rfi",        "subject",        "raised_on"),
    ("submittals",        "submittal",  "title",          "submitted_for"),
    ("permits",           "permit",     "permit_name",    "required_for"),
]


def _extra_fields(node_type: str, row: dict) -> dict:
    """A few type-specific fields worth showing on hover/click in the UI."""
    if node_type == "worker":
        return {"role": row.get("role"), "status": row.get("status")}
    if node_type == "vendor":
        return {"vendor_type": row.get("vendor_type"), "score": row.get("score")}
    if node_type == "task":
        return {"status": row.get("status"), "delay_days": row.get("delay_days")}
    if node_type == "incident":
        return {"severity": row.get("severity"), "status": row.get("status")}
    if node_type == "rfi":
        return {"status": row.get("status"), "priority": row.get("priority")}
    if node_type == "submittal":
        return {"status": row.get("status"), "submittal_type": row.get("type")}
    if node_type == "permit":
        return {"status": row.get("status"), "permit_type": row.get("permit_type")}
    return {}


@router.get("/data")
def get_knowledge_graph(project_id: Optional[str] = None):
    """Returns {nodes, edges} for the whole portfolio, or a single project
    when project_id is given."""
    try:
        projects_q = supabase.table("projects").select("id,name,status")
        if project_id:
            projects_q = projects_q.eq("id", project_id)
        projects = projects_q.execute().data or []
        project_ids = {p["id"] for p in projects}

        graph = nx.Graph()
        for p in projects:
            graph.add_node(f"project:{p['id']}", label=p["name"], type="project", status=p.get("status"))

        for table, node_type, label_col, relation in _ENTITY_TABLES:
            rows = supabase.table(table).select("*").execute().data or []
            for row in rows:
                pid = row.get("project_id")
                # Skip entities with no project, or (when filtering) belonging
                # to a different project — keeps the graph a clean set of
                # connected components instead of stray floating nodes.
                if not pid or pid not in project_ids:
                    continue
                node_id = f"{node_type}:{row['id']}"
                label = row.get(label_col) or f"{node_type} {str(row['id'])[:8]}"
                graph.add_node(node_id, label=label, type=node_type, **_extra_fields(node_type, row))
                graph.add_edge(f"project:{pid}", node_id, relation=relation)

        return {
            "nodes": [{"id": n, **data} for n, data in graph.nodes(data=True)],
            "edges": [{"source": u, "target": v, **data} for u, v, data in graph.edges(data=True)],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
