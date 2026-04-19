import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
from datetime import datetime
import os

try:
    from torch_geometric.nn import GCNConv, GATConv, global_mean_pool
    from torch_geometric.data import Data
    HAS_GEOMETRIC = True
except ImportError:
    HAS_GEOMETRIC = False
    print("torch_geometric not available, using fallback")


class GNNRiskModel(nn.Module):
    """Graph Neural Network for construction risk propagation analysis"""

    def __init__(self, node_features=8, hidden_dim=64, output_dim=3):
        super(GNNRiskModel, self).__init__()
        if HAS_GEOMETRIC:
            self.conv1 = GCNConv(node_features, hidden_dim)
            self.conv2 = GCNConv(hidden_dim, hidden_dim)
            self.conv3 = GATConv(hidden_dim, hidden_dim // 4, heads=4)
            self.fc1 = nn.Linear(hidden_dim, 32)
            self.fc2 = nn.Linear(32, output_dim)
            self.dropout = nn.Dropout(0.3)

    def forward(self, x, edge_index, batch=None):
        if not HAS_GEOMETRIC:
            return torch.zeros(x.shape[0], 3)
        x = F.relu(self.conv1(x, edge_index))
        x = self.dropout(x)
        x = F.relu(self.conv2(x, edge_index))
        x = self.dropout(x)
        x = F.elu(self.conv3(x, edge_index))
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        return torch.sigmoid(x)


def build_project_graph(project_data: dict) -> dict:
    """
    Build a risk propagation graph from project data.
    Nodes = project elements (tasks, workers, equipment, cost, safety)
    Edges = dependencies and relationships
    """

    nodes = []
    edges = []
    node_map = {}

    # Add task nodes
    tasks = project_data.get("tasks", [])
    for i, task in enumerate(tasks):
        node_id = len(nodes)
        node_map[f"task_{task.get('id', i)}"] = node_id
        progress = task.get("actual_progress", 0) / 100.0
        delay = min(task.get("delay_days", 0) / 30.0, 1.0)
        status_map = {"done": 0, "completed": 0, "inprogress": 0.3, "pending": 0.5, "atrisk": 0.7, "delayed": 0.9}
        status_risk = status_map.get(task.get("status", "pending"), 0.5)

        nodes.append({
            "id": node_id,
            "label": task.get("task_name", f"Task {i+1}"),
            "type": "task",
            "risk_score": round(status_risk * 0.6 + delay * 0.4, 3),
            "features": [
                progress,
                delay,
                status_risk,
                1.0 if task.get("priority") == "high" else 0.5 if task.get("priority") == "medium" else 0.2,
                0.0, 0.0, 0.0, 0.0
            ]
        })

    # Add equipment nodes
    equipment = project_data.get("equipment", [])
    for i, eq in enumerate(equipment):
        node_id = len(nodes)
        node_map[f"eq_{eq.get('id', i)}"] = node_id
        health = eq.get("health_score", 100) / 100.0
        status_map = {"operational": 0.1, "needs_service": 0.5, "critical": 0.9}
        eq_risk = status_map.get(eq.get("status", "operational"), 0.1)

        nodes.append({
            "id": node_id,
            "label": eq.get("name", f"Equipment {i+1}"),
            "type": "equipment",
            "risk_score": round(eq_risk * 0.5 + (1 - health) * 0.5, 3),
            "features": [
                health,
                eq_risk,
                eq.get("operating_hours", 0) / 10000.0,
                0.0, 0.0, 0.0, 0.0, 0.0
            ]
        })

    # Add safety nodes
    incidents = project_data.get("incidents", [])
    for i, inc in enumerate(incidents[:5]):
        node_id = len(nodes)
        node_map[f"inc_{inc.get('id', i)}"] = node_id
        severity_map = {"Minor": 0.2, "Moderate": 0.5, "Severe": 0.9}
        sev_risk = severity_map.get(inc.get("severity", "Minor"), 0.3)

        nodes.append({
            "id": node_id,
            "label": f"{inc.get('incident_type', 'Incident')} - {inc.get('location', '')}",
            "type": "safety",
            "risk_score": sev_risk,
            "features": [
                sev_risk,
                1.0 if inc.get("status") == "open" else 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0
            ]
        })

    # Add cost node
    cost_node_id = len(nodes)
    node_map["cost"] = cost_node_id
    budget = project_data.get("budget", 1000000)
    spent = project_data.get("spent", 0)
    cost_overrun = min(spent / max(budget, 1), 2.0)
    nodes.append({
        "id": cost_node_id,
        "label": "Cost & Budget",
        "type": "cost",
        "risk_score": round(min(cost_overrun - 0.8, 0.9) if cost_overrun > 0.8 else 0.1, 3),
        "features": [cost_overrun / 2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    })

    # Add schedule node
    schedule_node_id = len(nodes)
    node_map["schedule"] = schedule_node_id
    avg_delay = sum(t.get("delay_days", 0) for t in tasks) / max(len(tasks), 1)
    avg_progress = sum(t.get("actual_progress", 0) for t in tasks) / max(len(tasks), 1)
    schedule_risk = min(avg_delay / 30.0 + (1 - avg_progress / 100) * 0.3, 0.95)
    nodes.append({
        "id": schedule_node_id,
        "label": "Schedule",
        "type": "schedule",
        "risk_score": round(schedule_risk, 3),
        "features": [avg_delay / 30, avg_progress / 100, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    })

    # Build edges (dependencies)
    # Tasks → Schedule
    for task in tasks:
        task_node = node_map.get(f"task_{task.get('id', 0)}")
        if task_node is not None:
            edges.append({
                "source": task_node,
                "target": schedule_node_id,
                "type": "affects_schedule",
                "weight": 0.8
            })

    # Equipment → Tasks
    for i, eq in enumerate(equipment):
        eq_node = node_map.get(f"eq_{eq.get('id', i)}")
        if eq_node is not None:
            for j, task in enumerate(tasks[:3]):
                task_node = node_map.get(f"task_{task.get('id', j)}")
                if task_node is not None:
                    edges.append({
                        "source": eq_node,
                        "target": task_node,
                        "type": "equipment_task",
                        "weight": 0.6
                    })

    # Safety → Schedule and Cost
    for i, inc in enumerate(incidents[:5]):
        inc_node = node_map.get(f"inc_{inc.get('id', i)}")
        if inc_node is not None:
            edges.append({"source": inc_node, "target": schedule_node_id, "type": "safety_schedule", "weight": 0.7})
            edges.append({"source": inc_node, "target": cost_node_id, "type": "safety_cost", "weight": 0.5})

    # Cost ↔ Schedule
    edges.append({"source": cost_node_id, "target": schedule_node_id, "type": "cost_schedule", "weight": 0.9})

    # Task dependencies (sequential)
    for i in range(len(tasks) - 1):
        t1 = node_map.get(f"task_{tasks[i].get('id', i)}")
        t2 = node_map.get(f"task_{tasks[i+1].get('id', i+1)}")
        if t1 is not None and t2 is not None:
            edges.append({"source": t1, "target": t2, "type": "task_dependency", "weight": 0.95})

    return {
        "nodes": nodes,
        "edges": edges,
        "total_nodes": len(nodes),
        "total_edges": len(edges),
    }


def run_gnn_risk_analysis(project_data: dict) -> dict:
    """Run GNN-based risk propagation analysis"""
    try:
        graph = build_project_graph(project_data)
        nodes = graph["nodes"]
        edges = graph["edges"]

        if len(nodes) == 0:
            return {"error": "No nodes in graph"}

        # Run GNN if available
        propagated_risks = {}
        if HAS_GEOMETRIC and len(nodes) > 1:
            node_features = torch.tensor(
                [n["features"] for n in nodes], dtype=torch.float
            ) 

            if len(edges) > 0:
                edge_index = torch.tensor(
                    [[e["source"], e["target"]] for e in edges],
                    dtype=torch.long
                ).t().contiguous()
            else:
                edge_index = torch.zeros((2, 0), dtype=torch.long)
                
            
            # Load trained model
            model = GNNRiskModel(node_features=8, hidden_dim=64, output_dim=3)
            model_path = os.path.join(os.path.dirname(__file__), "saved/gnn_risk_model.pt")
            if os.path.exists(model_path):
                model.load_state_dict(torch.load(model_path, map_location="cpu"))
                print("✅ Loaded trained GNN weights")
            else:
                print("⚠️ No trained weights found, using random initialization")
            model.eval()
            with torch.no_grad():
                risk_output = model(node_features, edge_index)

            # Run GNN
            model = GNNRiskModel(node_features=8, hidden_dim=64, output_dim=3)
            model.eval()
            with torch.no_grad():
                risk_output = model(node_features, edge_index)

            for i, node in enumerate(nodes):
                propagated_risks[node["label"]] = {
                    "direct_risk": round(float(risk_output[i][0]), 3),
                    "propagated_risk": round(float(risk_output[i][1]), 3),
                    "mitigation_priority": round(float(risk_output[i][2]), 3),
                }
        else:
            # Fallback: simple risk propagation
            for node in nodes:
                base_risk = node["risk_score"]
                connected_risks = []
                for edge in edges:
                    if edge["target"] == node["id"]:
                        source_node = next((n for n in nodes if n["id"] == edge["source"]), None)
                        if source_node:
                            connected_risks.append(source_node["risk_score"] * edge["weight"])

                propagated = base_risk + sum(connected_risks) * 0.3
                propagated = min(propagated, 0.99)
                propagated_risks[node["label"]] = {
                    "direct_risk": round(base_risk, 3),
                    "propagated_risk": round(propagated, 3),
                    "mitigation_priority": round(propagated * 1.2, 3),
                }

        # Calculate overall project risk
        all_risks = [v["propagated_risk"] for v in propagated_risks.values()]
        overall_risk = sum(all_risks) / len(all_risks) if all_risks else 0

        # Identify critical paths
        critical_nodes = [
            {"node": k, "risk": v["propagated_risk"], "priority": v["mitigation_priority"]}
            for k, v in propagated_risks.items()
            if v["propagated_risk"] > 0.5
        ]
        critical_nodes.sort(key=lambda x: x["risk"], reverse=True)

        # Risk categories
        risk_categories = {
            "schedule": round(sum(v["propagated_risk"] for k, v in propagated_risks.items()
                                  if any(n["type"] == "task" or n["type"] == "schedule"
                                         for n in nodes if n["label"] == k)) / max(1, len([
                                             n for n in nodes if n["type"] in ["task", "schedule"]
                                         ])), 3),
            "equipment": round(sum(v["propagated_risk"] for k, v in propagated_risks.items()
                                   if any(n["type"] == "equipment" for n in nodes if n["label"] == k)) / max(1, len([
                                       n for n in nodes if n["type"] == "equipment"
                                   ])), 3),
            "safety": round(sum(v["propagated_risk"] for k, v in propagated_risks.items()
                                if any(n["type"] == "safety" for n in nodes if n["label"] == k)) / max(1, len([
                                    n for n in nodes if n["type"] == "safety"
                                ])), 3),
            "cost": round(next((v["propagated_risk"] for k, v in propagated_risks.items()
                                if k == "Cost & Budget"), 0), 3),
        }

        return {
            "success": True,
            "graph": graph,
            "propagated_risks": propagated_risks,
            "overall_risk_score": round(overall_risk, 3),
            "risk_level": "Critical" if overall_risk > 0.7 else "High" if overall_risk > 0.5 else "Medium" if overall_risk > 0.3 else "Low",
            "critical_nodes": critical_nodes[:5],
            "risk_categories": risk_categories,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "gnn_used": HAS_GEOMETRIC,
            "timestamp": datetime.now().isoformat(),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}