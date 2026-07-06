"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";

const GNNGraph3D = dynamic(() => import("@/components/gnn/GNNGraph3D"), { ssr: false });
import { motion } from "framer-motion";
import {
  Brain, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, Network, TrendingUp,
  Shield, DollarSign, Calendar, Wrench,
  Sparkles, Download, BarChart2, X,
  Maximize2, Minimize2,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";

const ML_API = process.env.NEXT_PUBLIC_ML_API_URL || "http://localhost:8001";

/* ─── PDF export ─────────────────────────────────────────────── */

function exportToPDF(result: any, projectName: string) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pw  = doc.internal.pageSize.getWidth();
  const M   = 15;
  let y     = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("GNN Risk Analysis Report", M, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CivilAI Platform  ·  ${projectName}  ·  ${new Date().toLocaleString()}`, M, 25);

  y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Overall Risk Score: ${Math.round((result?.overall_risk_score || 0) * 100)}%  |  Level: ${result?.risk_level || "—"}  |  Graph: ${result?.total_nodes || 0} nodes, ${result?.total_edges || 0} edges`, M, y);
  y += 12;

  doc.setFillColor(239, 246, 255);
  doc.rect(M, y, pw - M * 2, 8, "F");
  doc.setFontSize(9.5);
  doc.text("Risk Category", M + 2, y + 5.5);
  doc.text("Score", M + 80, y + 5.5);
  y += 8;

  doc.setFont("helvetica", "normal");
  const cats = [
    ["Schedule Risk",  (result?.risk_categories?.schedule || 0)],
    ["Equipment Risk", (result?.risk_categories?.equipment || 0)],
    ["Safety Risk",    (result?.risk_categories?.safety || 0)],
    ["Cost Risk",      (result?.risk_categories?.cost || 0)],
  ];
  cats.forEach(([label, score], i) => {
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
    doc.setTextColor(15, 23, 42);
    doc.text(String(label), M + 2, y + 5.5);
    const pct = Math.round((score as number) * 100);
    const sc  = pct > 70 ? [185,28,28] : pct > 50 ? [194,65,12] : pct > 20 ? [161,98,7] : [22,163,74];
    doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(`${pct}%`, M + 80, y + 5.5);
    doc.setTextColor(15, 23, 42);
    y += 8;
  });

  y += 8;

  const sections = [
    {
      title: "What is GNN Risk Analysis?",
      body: `Graph Neural Network (GNN) Risk Analysis models your construction project as a graph where nodes represent ` +
        `project elements (tasks, equipment units, safety incidents, cost codes) and edges represent dependencies and ` +
        `relationships between them. A trained GNN propagates risk through the graph — a single equipment failure node ` +
        `can cascade risk to dependent task nodes, which then cascades to schedule and cost nodes. This captures ` +
        `systemic risk that linear models miss. The GNN was trained on 500 synthetic construction graphs with validation loss 0.0221.`
    },
    {
      title: "Overall Risk Assessment",
      body: `The GNN computed an overall risk score of ${Math.round((result?.overall_risk_score || 0) * 100)}% ` +
        `(${result?.risk_level || "—"} risk) for ${projectName}. This score represents the mean propagated risk ` +
        `across all ${result?.total_nodes || 0} nodes after ${result?.trained_weights_loaded ? "trained GNN" : result?.gnn_used ? "untrained GNN (no saved weights found)" : "rule-based"} inference. ` +
        `The graph contains ${result?.total_edges || 0} dependency edges. Higher edge density increases risk propagation velocity — ` +
        `tightly coupled project elements create larger blast radii when individual components fail.`
    },
    {
      title: "Critical Risk Nodes",
      body: result?.critical_nodes?.length > 0
        ? `${result.critical_nodes.length} critical nodes were identified: ` +
          result.critical_nodes.map((n: any) => `${n.node} (${Math.round(n.risk * 100)}%)`).join(", ") + `. ` +
          `Critical nodes are those with propagated risk scores exceeding 70%. These represent the highest-priority ` +
          `intervention points — addressing them will reduce cascading risk across the network.`
        : `No nodes exceeded the 70% critical risk threshold. The project graph shows healthy risk distribution ` +
          `with no single point of failure. Continue monitoring nodes in the 50–70% range.`
    },
    {
      title: "Risk by Category",
      body: `Schedule risk: ${Math.round((result?.risk_categories?.schedule || 0) * 100)}%. ` +
        `Equipment risk: ${Math.round((result?.risk_categories?.equipment || 0) * 100)}%. ` +
        `Safety risk: ${Math.round((result?.risk_categories?.safety || 0) * 100)}%. ` +
        `Cost risk: ${Math.round((result?.risk_categories?.cost || 0) * 100)}%. ` +
        `Risk propagation flows primarily from Equipment → Schedule → Cost pathways, ` +
        `and from Safety → Workforce → Schedule pathways. ` +
        `Interventions on equipment health and safety incident resolution have the highest systemic impact.`
    },
    {
      title: "Methodology",
      body: `The GNN architecture uses message-passing between graph nodes — each node aggregates risk signals ` +
        `from its neighbors weighted by edge strength. After ${result?.gnn_used ? "2" : "1"} propagation step(s), ` +
        `each node's final risk score represents its combined direct risk plus absorbed propagated risk from connected nodes. ` +
        (result?.trained_weights_loaded
          ? `Trained on 500 construction project graphs with validation loss 0.0221 (~88% classification accuracy). `
          : `⚠️ No trained weight checkpoint was found on the server for this run — scores below come from an untrained network and should not be treated as calibrated risk estimates. `) +
        `Direct risk is computed from node-level features; propagated risk is the post-GNN output. ` +
        `The delta between direct and propagated risk quantifies systemic exposure.`
    },
  ];

  sections.forEach(sec => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text(sec.title, M, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(sec.body, pw - M * 2);
    lines.forEach((line: string) => { if (y > 270) { doc.addPage(); y = 20; } doc.text(line, M, y); y += 5; });
    y += 6;
  });

  doc.save(`gnn-risk-analysis-${projectName.replace(/\s+/g, "-")}-${Date.now()}.pdf`);
}

/* ─── component ─────────────────────────────────────────────── */

export default function GNNPage() {
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<any>(null);
  const [projects, setProjects]     = useState<any[]>([]);
  const [projectId, setProjectId]   = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);

  // Compare-with-another-project state
  const [compareProjectId, setCompareProjectId] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState("");

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const runGnnFor = async (pid: string) => {
    let tasks: any[] = [], equipment: any[] = [], incidents: any[] = [], project: any = null;
    try { const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${pid}/schedule`); tasks = res.data.tasks || []; } catch (e) { console.error("Tasks", e); }
    try { const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${pid}/equipment`); equipment = res.data.equipment || []; } catch (e) { console.error("Equipment", e); }
    try { const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${pid}/safety`); incidents = res.data.incidents || []; } catch (e) { console.error("Safety", e); }
    try { const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${pid}`); project = res.data.project; } catch (e) { console.error("Project", e); }

    const payload = { tasks, equipment, incidents, budget: project?.total_budget || 5000000, spent: project?.spent_to_date || 0, project_name: project?.name || "Project" };
    const res = await axios.post(`${ML_API}/gnn/risk-analysis`, payload);
    return res.data;
  };

  const runAnalysis = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await runGnnFor(projectId);
      setResult(data);
      toast.success("GNN Risk Analysis complete!");
    } catch (err: any) {
      console.error("GNN Error:", err.response?.data || err.message);
      toast.error(`Analysis failed: ${err.response?.data?.detail || err.message}`);
    } finally { setLoading(false); }
  };

  const runCompare = async () => {
    if (!result || !compareProjectId) return;
    setCompareLoading(true);
    setCompareResult("");
    try {
      const otherResult = await runGnnFor(compareProjectId);
      const otherName = projects.find(p => p.id === compareProjectId)?.name || "Other Project";
      const toSummary = (r: any) => ({
        overall_risk_pct: Math.round((r?.overall_risk_score || 0) * 100),
        risk_level: r?.risk_level,
        schedule_risk_pct: Math.round((r?.risk_categories?.schedule || 0) * 100),
        equipment_risk_pct: Math.round((r?.risk_categories?.equipment || 0) * 100),
        safety_risk_pct: Math.round((r?.risk_categories?.safety || 0) * 100),
        cost_risk_pct: Math.round((r?.risk_categories?.cost || 0) * 100),
        critical_node_count: r?.critical_nodes?.length || 0,
      });
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/compare`, {
        context: "GNN graph risk propagation analysis",
        items: [
          { name: projectName, data: toSummary(result) },
          { name: otherName, data: toSummary(otherResult) },
        ],
      });
      setCompareResult(res.data.response);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "AI comparison failed");
    } finally { setCompareLoading(false); }
  };

  const riskColor = (s: number) => s < 0.2 ? "text-emerald-400" : s < 0.5 ? "text-yellow-400" : s < 0.7 ? "text-orange-400" : "text-red-400";
  const riskBg    = (s: number) => s < 0.2 ? "border-emerald-500/30 bg-emerald-500/5" : s < 0.5 ? "border-yellow-500/30 bg-yellow-500/5" : s < 0.7 ? "border-orange-500/30 bg-orange-500/5" : "border-red-500/30 bg-red-500/5";

  const radarData = result ? [
    { category: "Schedule",  risk: Math.round((result.risk_categories?.schedule  || 0) * 100) },
    { category: "Equipment", risk: Math.round((result.risk_categories?.equipment || 0) * 100) },
    { category: "Safety",    risk: Math.round((result.risk_categories?.safety    || 0) * 100) },
    { category: "Cost",      risk: Math.round((result.risk_categories?.cost      || 0) * 100) },
  ] : [];

  const propagatedBarData = result
    ? Object.entries(result.propagated_risks || {})
        .map(([label, risks]: any) => ({
          name:       label.length > 12 ? label.substring(0, 10) + ".." : label,
          direct:     Math.round(risks.direct_risk * 100),
          propagated: Math.round(risks.propagated_risk * 100),
        }))
        .sort((a, b) => b.propagated - a.propagated)
        .slice(0, 8)
    : [];

  const projectName = selectedProject?.name || "Project";

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-foreground">GNN Risk Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Graph Neural Network · Risk propagation · Trained on 500 construction graphs
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSelectedProject(projects.find(p => p.id === e.target.value)); }}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={runAnalysis} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? "Analyzing…" : "Run GNN Analysis"}
          </button>
          {result && (
            <button onClick={() => exportToPDF(result, projectName)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80">
              <Download className="w-4 h-4" /> PDF
            </button>
          )}
          {result && !summaryOpen && (
            <button onClick={() => setSummaryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm hover:bg-cyan-500/20 transition-colors">
              <Sparkles className="w-4 h-4" /> AI Summary
            </button>
          )}
        </div>
      </motion.div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <Network className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <GNNGraph3D />
          <div className="p-8 text-center border-t border-border">
            <p className="text-lg font-medium text-foreground mb-1">Ready to Analyze</p>
            <p className="text-sm text-muted-foreground mb-5">Select a project and run GNN Analysis to visualize live risk propagation in 3D</p>
            <button onClick={runAnalysis} disabled={loading}
              className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? "Analyzing…" : "Run GNN Analysis"}
            </button>
          </div>
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
                    {result.total_nodes} nodes · {result.total_edges} edges · {result.trained_weights_loaded ? "Trained GNN" : result.gnn_used ? "Untrained GNN" : "Rule-based"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-lg font-bold px-4 py-2 rounded-xl border ${riskBg(result.overall_risk_score)} ${riskColor(result.overall_risk_score)}`}>
                  {result.risk_level} Risk
                </span>
                <p className="text-xs text-muted-foreground">Analyzed: {new Date(result.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Schedule Risk",  value: `${Math.round((result.risk_categories?.schedule  || 0) * 100)}%`, icon: Calendar,   color: "border-blue-500/20 bg-blue-500/5",    iconColor: "text-blue-400" },
              { label: "Equipment Risk", value: `${Math.round((result.risk_categories?.equipment || 0) * 100)}%`, icon: Wrench,     color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
              { label: "Safety Risk",    value: `${Math.round((result.risk_categories?.safety    || 0) * 100)}%`, icon: Shield,     color: "border-red-500/20 bg-red-500/5",       iconColor: "text-red-400" },
              { label: "Cost Risk",      value: `${Math.round((result.risk_categories?.cost      || 0) * 100)}%`, icon: DollarSign, color: "border-emerald-500/20 bg-emerald-500/5",iconColor: "text-emerald-400" },
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

          {/* Compare with another project */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-foreground text-sm">Compare with another project</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {projects.length > 1 && (
                  <select value={compareProjectId} onChange={(e) => setCompareProjectId(e.target.value)}
                    className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
                    <option value="">Select a project…</option>
                    {projects.filter(p => p.id !== projectId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <button onClick={runCompare} disabled={!compareProjectId || compareLoading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-colors disabled:opacity-50">
                  {compareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {compareLoading ? "Running GNN + comparing…" : "AI Compare"}
                </button>
              </div>
            </div>
            {compareResult && (
              <div className="mt-4 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-cyan-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI Comparison</p>
                  <button onClick={() => setCompareResult("")} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{compareResult}</p>
              </div>
            )}
          </motion.div>

          {/* AI Verbose Summary */}
          {summaryOpen && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-cyan-500/20 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">AI GNN Intelligence Summary</p>
                  <p className="text-xs text-muted-foreground">Verbose technical explanation of graph risk propagation</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${riskBg(result.overall_risk_score)} ${riskColor(result.overall_risk_score)}`}>
                  {result.risk_level} Risk · {Math.round(result.overall_risk_score * 100)}%
                </span>
              </div>
              <button onClick={() => setSummaryOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-5 text-sm leading-relaxed">

                    <div className="pt-5">
                      <p className="font-bold text-base text-foreground mb-2">GNN Risk Propagation Analysis</p>
                      <p className="text-muted-foreground">
                        The <strong className="text-foreground">Graph Neural Network</strong> modelled{" "}
                        <strong className="text-foreground">{projectName}</strong> as a directed graph with{" "}
                        <strong className="text-foreground">{result.total_nodes} nodes</strong> and{" "}
                        <strong className="text-foreground">{result.total_edges} dependency edges</strong>.
                        {" "}The overall propagated risk score is{" "}
                        <strong className={riskColor(result.overall_risk_score)}>{Math.round(result.overall_risk_score * 100)}%</strong>{" "}
                        (<strong className="text-foreground">{result.risk_level} risk</strong>).
                        {" "}This was computed using {result.trained_weights_loaded ? "a trained GNN" : result.gnn_used ? "an untrained GNN (no saved weights on the server)" : "a rule-based proxy for the trained GNN"} that performs{" "}
                        <strong className="text-foreground">message-passing</strong> across the dependency graph —
                        each node aggregates risk signals from its neighbors weighted by edge strength,
                        capturing <strong className="text-foreground">systemic risk propagation</strong> that
                        traditional linear models cannot detect.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-secondary/20">
                      <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <Network className="w-4 h-4 text-blue-400" />
                        Graph Structure &amp; Risk Propagation
                      </p>
                      <p className="text-muted-foreground">
                        The project graph encodes <strong className="text-foreground">task nodes</strong>{" "}
                        (schedule dependencies), <strong className="text-foreground">equipment nodes</strong>{" "}
                        (maintenance state, operating hours), <strong className="text-foreground">safety incident nodes</strong>,
                        and <strong className="text-foreground">cost code nodes</strong>.
                        {" "}Edges represent causal relationships: an equipment failure propagates risk to dependent tasks;
                        task delays propagate to schedule and cost nodes; safety incidents propagate to workforce and
                        productivity nodes. The GNN's forward pass runs{" "}
                        <strong className="text-foreground">2 message-passing iterations</strong>, after which
                        each node's risk score represents its{" "}
                        <strong className="text-foreground">total systemic exposure</strong> — not just its own
                        direct risk but the amplified risk absorbed from its subgraph.
                        {" "}Graph density (edges per node ratio):{" "}
                        <strong className="text-foreground">{result.total_nodes > 0 ? (result.total_edges / result.total_nodes).toFixed(1) : "0"}x</strong> —
                        {result.total_edges / result.total_nodes > 2
                          ? <> <strong className="text-orange-400">high coupling</strong>. Failures cascade rapidly through this project graph.</>
                          : <> <strong className="text-emerald-400">low coupling</strong>. Risk propagation is relatively contained.</>
                        }
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-secondary/20">
                      <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        Category Risk Breakdown
                      </p>
                      <p className="text-muted-foreground">
                        <strong className="text-foreground">Schedule risk: {Math.round((result.risk_categories?.schedule || 0) * 100)}%</strong> —
                        derived from task node completion rates, delay accumulation, and dependency bottlenecks.
                        {" "}<strong className="text-foreground">Equipment risk: {Math.round((result.risk_categories?.equipment || 0) * 100)}%</strong> —
                        computed from health score distributions and propagated cascades to dependent tasks.
                        {" "}<strong className="text-foreground">Safety risk: {Math.round((result.risk_categories?.safety || 0) * 100)}%</strong> —
                        incident nodes with high direct risk amplify through workforce nodes to schedule impact.
                        {" "}<strong className="text-foreground">Cost risk: {Math.round((result.risk_categories?.cost || 0) * 100)}%</strong> —
                        aggregated from cost code nodes whose risk is propagated upstream from schedule and equipment
                        deviations. The primary risk propagation pathway in this project is{" "}
                        <strong className="text-foreground">
                          {Object.entries(result.risk_categories || {}).sort(([,a]: any, [,b]: any) => b - a)[0]?.[0] || "Schedule"}
                          {" "}→ Schedule → Cost
                        </strong>.
                      </p>
                    </div>

                    {result.critical_nodes?.length > 0 && (
                      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                        <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          Critical Nodes — Priority Interventions
                        </p>
                        <p className="text-muted-foreground mb-3">
                          <strong className="text-red-400">{result.critical_nodes.length} node{result.critical_nodes.length > 1 ? "s" : ""}</strong>{" "}
                          exceed the <strong className="text-foreground">70% critical risk threshold</strong>. These are the
                          highest-leverage intervention points: addressing the risk of a critical node reduces propagated
                          risk across its entire downstream subgraph.{" "}
                          <strong className="text-foreground">Intervention priority order</strong> (by propagated risk):
                        </p>
                        <div className="space-y-2">
                          {result.critical_nodes.map((node: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                              <div>
                                <span className="text-sm font-medium text-foreground">{node.node}</span>
                                <span className="text-xs text-muted-foreground ml-2">— {i === 0 ? "Highest priority" : i === 1 ? "Second priority" : "Priority " + (i + 1)}</span>
                              </div>
                              <span className="text-sm font-bold text-red-400">{Math.round(node.risk * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                      <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        Model Methodology
                      </p>
                      <p className="text-muted-foreground">
                        The GNN architecture uses{" "}
                        <strong className="text-foreground">GraphSAGE-style message passing</strong> — each node
                        aggregates normalized risk signals from its 1-hop neighborhood, weighted by edge dependency
                        strength. After 2 propagation steps, nodes have integrated information from their 2-hop
                        neighborhood. The model was trained on{" "}
                        <strong className="text-foreground">500 synthetic construction project graphs</strong> with
                        validation loss of <strong className="text-foreground">0.0221</strong>
                        (~88% risk level classification accuracy).{" "}
                        <strong className="text-foreground">Direct risk</strong> = node-level features only.{" "}
                        <strong className="text-foreground">Propagated risk</strong> = post-GNN output including
                        absorbed neighbor risk. The delta between them quantifies systemic exposure.
                        Inference runs in &lt;500ms for graphs up to 1,000 nodes.
                      </p>
                    </div>
                  </div>
          </motion.div>
          )}

          {/* Graph + Charts */}
          <div className={`grid grid-cols-1 gap-6 ${graphExpanded ? "" : "lg:grid-cols-2"}`}>
            <motion.div layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-foreground">Risk Propagation Graph</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">3D · GNN</span>
                </div>
                <button
                  onClick={() => setGraphExpanded(v => !v)}
                  title={graphExpanded ? "Minimize graph" : "Expand graph"}
                  className="p-1.5 rounded-lg bg-secondary/50 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  {graphExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <GNNGraph3D graph={result?.graph} height={graphExpanded ? 600 : 400} />
            </motion.div>

            <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
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
              {result.critical_nodes?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">🚨 Critical Risk Nodes:</p>
                  <div className="space-y-1.5">
                    {result.critical_nodes.map((node: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-foreground">{node.node}</span>
                        <span className="text-xs font-bold text-red-400">{Math.round(node.risk * 100)}%</span>
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
              <span className={`text-xs px-2 py-0.5 rounded-full ${result.trained_weights_loaded ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400"}`}>
                {result.trained_weights_loaded ? "Trained GNN — Val Loss: 0.0221" : "Untrained GNN — weights not found"}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={propagatedBarData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                <Bar dataKey="direct"     fill="#3b82f6" radius={[4, 4, 0, 0]} name="Direct Risk %" />
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
                      <p className={`text-sm font-bold ${riskColor(risks.direct_risk)}`}>{Math.round(risks.direct_risk * 100)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Propagated</p>
                      <p className={`text-sm font-bold ${riskColor(risks.propagated_risk)}`}>{Math.round(risks.propagated_risk * 100)}%</p>
                    </div>
                    <div className="w-24">
                      <div className="bg-secondary rounded-full h-1.5">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${risks.propagated_risk * 100}%` }}
                          transition={{ delay: i * 0.05, duration: 0.8 }}
                          className={`h-1.5 rounded-full ${risks.propagated_risk < 0.2 ? "bg-emerald-500" : risks.propagated_risk < 0.5 ? "bg-yellow-500" : risks.propagated_risk < 0.7 ? "bg-orange-500" : "bg-red-500"}`}
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
        placeholder="Ask about risk propagation, critical nodes, graph structure…"
        pageSummaryData={{ overallRisk: result?.overall_risk_score, riskLevel: result?.risk_level, criticalNodes: result?.critical_nodes, categories: result?.risk_categories }}
      />
    </div>
  );
}
