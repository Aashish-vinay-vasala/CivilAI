"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Brain, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, Network, TrendingUp,
  Shield, DollarSign, Calendar, Wrench,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";

export default function GNNPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (result?.graph) drawGraph();
  }, [result]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) {
        setProjectId(p[0].id);
        setSelectedProject(p[0]);
      }
    } catch (err) { console.error(err); }
  };

  const runAnalysis = async () => {
  if (!projectId) return;
  setLoading(true);
  try {
    // Fetch each separately to identify which fails
    let tasks = [], equipment = [], incidents = [], project = null;

    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`);
      tasks = res.data.tasks || [];
    } catch (e) { console.error("Tasks fetch failed", e); }

    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`);
      equipment = res.data.equipment || [];
    } catch (e) { console.error("Equipment fetch failed", e); }

    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/safety`);
      incidents = res.data.incidents || [];
    } catch (e) { console.error("Safety fetch failed", e); }

    try {
      const res = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}`);
      project = res.data.project;
    } catch (e) { console.error("Project fetch failed", e); }

    const payload = {
      tasks,
      equipment,
      incidents,
      budget: project?.total_budget || 5000000,
      spent: project?.spent_to_date || 0,
      project_name: project?.name || "Project",
    };

    console.log("GNN payload:", payload);

    const res = await axios.post("http://localhost:8001/gnn/risk-analysis", payload);
    setResult(res.data);
    toast.success("GNN Risk Analysis complete!");
  } catch (err: any) {
    console.error("GNN Error:", err.response?.data || err.message);
    toast.error(`Analysis failed: ${err.response?.data?.detail || err.message}`);
  } finally {
    setLoading(false);
  }
};

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas || !result?.graph) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nodes, edges } = result.graph;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (nodes.length === 0) return;

    // Position nodes in circle layout
    const centerX = W / 2;
    const centerY = H / 2;
    const radius = Math.min(W, H) * 0.35;

    const positions: { x: number; y: number }[] = nodes.map((_: any, i: number) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    // Draw edges
    edges.forEach((edge: any) => {
      const from = positions[edge.source];
      const to = positions[edge.target];
      if (!from || !to) return;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.2 + edge.weight * 0.3})`;
      ctx.lineWidth = edge.weight * 2;
      ctx.stroke();

      // Arrow
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const arrowX = to.x - 18 * Math.cos(angle);
      const arrowY = to.y - 18 * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 8 * Math.cos(angle - 0.4), arrowY - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(arrowX - 8 * Math.cos(angle + 0.4), arrowY - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
      ctx.fill();
    });

    // Draw nodes
    nodes.forEach((node: any, i: number) => {
      const { x, y } = positions[i];
      const risk = node.risk_score;
      const propagated = result.propagated_risks?.[node.label];

      // Node color by risk
      let color: string;
      if (risk < 0.2) color = "#10b981";
      else if (risk < 0.5) color = "#f59e0b";
      else if (risk < 0.7) color = "#f97316";
      else color = "#ef4444";

      // Glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
      gradient.addColorStop(0, color + "80");
      gradient.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff30";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Risk ring
      ctx.beginPath();
      ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + (risk * Math.PI * 2));
      ctx.strokeStyle = "#ffffff80";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Type icon
      const typeIcons: { [key: string]: string } = {
        task: "T", equipment: "E", safety: "S", cost: "$", schedule: "📅"
      };
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typeIcons[node.type] || "?", x, y);

      // Label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px Arial";
      ctx.textAlign = "center";
      const label = node.label.length > 14 ? node.label.substring(0, 12) + ".." : node.label;
      ctx.fillText(label, x, y + 24);

      // Risk %
      ctx.fillStyle = color;
      ctx.font = "bold 8px Arial";
      ctx.fillText(`${Math.round(risk * 100)}%`, x, y + 34);
    });

    // Legend
    ctx.fillStyle = "#334155";
    ctx.roundRect?.(10, 10, 120, 90, 8);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.fillText("Risk Level", 18, 26);
    [
      { color: "#10b981", label: "Low (< 20%)" },
      { color: "#f59e0b", label: "Medium (20-50%)" },
      { color: "#f97316", label: "High (50-70%)" },
      { color: "#ef4444", label: "Critical (> 70%)" },
    ].forEach((l, i) => {
      ctx.beginPath();
      ctx.arc(22, 40 + i * 16, 5, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px Arial";
      ctx.fillText(l.label, 32, 44 + i * 16);
    });
  };

  const riskColor = (score: number) => {
    if (score < 0.2) return "text-emerald-400";
    if (score < 0.5) return "text-yellow-400";
    if (score < 0.7) return "text-orange-400";
    return "text-red-400";
  };

  const riskBg = (score: number) => {
    if (score < 0.2) return "border-emerald-500/30 bg-emerald-500/5";
    if (score < 0.5) return "border-yellow-500/30 bg-yellow-500/5";
    if (score < 0.7) return "border-orange-500/30 bg-orange-500/5";
    return "border-red-500/30 bg-red-500/5";
  };

  const radarData = result ? [
    { category: "Schedule", risk: Math.round((result.risk_categories?.schedule || 0) * 100) },
    { category: "Equipment", risk: Math.round((result.risk_categories?.equipment || 0) * 100) },
    { category: "Safety", risk: Math.round((result.risk_categories?.safety || 0) * 100) },
    { category: "Cost", risk: Math.round((result.risk_categories?.cost || 0) * 100) },
  ] : [];

  const propagatedBarData = result ? Object.entries(result.propagated_risks || {})
    .map(([label, risks]: any) => ({
      name: label.length > 12 ? label.substring(0, 10) + ".." : label,
      direct: Math.round(risks.direct_risk * 100),
      propagated: Math.round(risks.propagated_risk * 100),
    }))
    .sort((a, b) => b.propagated - a.propagated)
    .slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">GNN Risk Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Graph Neural Network · Risk propagation · Trained on 500 construction graphs
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSelectedProject(projects.find(p => p.id === e.target.value));
              }}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={runAnalysis} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Brain className="w-4 h-4" />
            }
            {loading ? "Analyzing..." : "Run GNN Analysis"}
          </button>
        </div>
      </motion.div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <Network className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">How GNN Risk Analysis Works</p>
          <p className="text-xs text-muted-foreground mt-1">
            Builds a graph where nodes = project elements (tasks, equipment, incidents, cost) and
            edges = dependencies. A trained Graph Neural Network propagates risk through the graph,
            showing how one issue cascades to others. Trained on 500 synthetic construction projects
            with val loss 0.0221.
          </p>
        </div>
      </div>

      {!result ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Brain className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Ready to Analyze</p>
          <p className="text-sm text-muted-foreground mb-6">
            Select a project and click Run GNN Analysis to see risk propagation
          </p>
          <button onClick={runAnalysis} disabled={loading}
            className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? "Analyzing..." : "Run GNN Analysis"}
          </button>
        </div>
      ) : (
        <>
          {/* Overall Risk Score */}
          <div className={`rounded-2xl border p-6 ${riskBg(result.overall_risk_score)}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <Brain className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">GNN Overall Risk Score</p>
                  <p className={`text-4xl font-bold ${riskColor(result.overall_risk_score)}`}>
                    {Math.round(result.overall_risk_score * 100)}%
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {result.total_nodes} nodes · {result.total_edges} edges · {result.gnn_used ? "Trained GNN" : "Rule-based"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-lg font-bold px-4 py-2 rounded-xl border ${riskBg(result.overall_risk_score)} ${riskColor(result.overall_risk_score)}`}>
                  {result.risk_level} Risk
                </span>
                <p className="text-xs text-muted-foreground">
                  Analyzed: {new Date(result.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Schedule Risk", value: `${Math.round((result.risk_categories?.schedule || 0) * 100)}%`, icon: Calendar, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
              { label: "Equipment Risk", value: `${Math.round((result.risk_categories?.equipment || 0) * 100)}%`, icon: Wrench, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
              { label: "Safety Risk", value: `${Math.round((result.risk_categories?.safety || 0) * 100)}%`, icon: Shield, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
              { label: "Cost Risk", value: `${Math.round((result.risk_categories?.cost || 0) * 100)}%`, icon: DollarSign, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
            ].map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
                className={`rounded-2xl border p-5 ${kpi.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Graph + Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Propagation Graph */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Network className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-foreground">Risk Propagation Graph</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">GNN</span>
              </div>
              <canvas ref={canvasRef} width={480} height={380}
                className="w-full rounded-xl border border-border" />
            </motion.div>

            {/* Radar Chart */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-foreground">Risk Category Radar</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#ffffff08" />
                  <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Radar dataKey="risk" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </RadarChart>
              </ResponsiveContainer>

              {/* Critical Nodes */}
              {result.critical_nodes?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">🚨 Critical Risk Nodes:</p>
                  <div className="space-y-1.5">
                    {result.critical_nodes.map((node: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-foreground">{node.node}</span>
                        <span className="text-xs font-bold text-red-400">
                          {Math.round(node.risk * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Propagated Risk Bar Chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">Direct vs Propagated Risk</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Trained GNN — Val Loss: 0.0221
              </span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={propagatedBarData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                <Bar dataKey="direct" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Direct Risk %" />
                <Bar dataKey="propagated" fill="#ef4444" radius={[4, 4, 0, 0]} name="Propagated Risk %" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Direct Risk</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Propagated Risk (after GNN)</span></div>
            </div>
          </motion.div>

          {/* All Node Risks Table */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-4">All Node Risk Scores</h3>
            <div className="space-y-2">
              {Object.entries(result.propagated_risks || {}).map(([label, risks]: any, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-secondary/50 transition-colors">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Direct</p>
                      <p className={`text-sm font-bold ${riskColor(risks.direct_risk)}`}>
                        {Math.round(risks.direct_risk * 100)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Propagated</p>
                      <p className={`text-sm font-bold ${riskColor(risks.propagated_risk)}`}>
                        {Math.round(risks.propagated_risk * 100)}%
                      </p>
                    </div>
                    <div className="w-24">
                      <div className="bg-secondary rounded-full h-1.5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${risks.propagated_risk * 100}%` }}
                          transition={{ delay: i * 0.05, duration: 0.8 }}
                          className={`h-1.5 rounded-full ${
                            risks.propagated_risk < 0.2 ? "bg-emerald-500" :
                            risks.propagated_risk < 0.5 ? "bg-yellow-500" :
                            risks.propagated_risk < 0.7 ? "bg-orange-500" : "bg-red-500"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </>
      )}

      <ModuleChat
        context="GNN Risk Analysis"
        placeholder="Ask about risk propagation, critical nodes..."
        pageSummaryData={{
          overallRisk: result?.overall_risk_score,
          riskLevel: result?.risk_level,
          criticalNodes: result?.critical_nodes,
          categories: result?.risk_categories,
        }}
      />
    </div>
  );
}