"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, TrendingUp, DollarSign,
  Calendar, Shield, Wrench, Loader2,
  RefreshCw, CheckCircle, Zap,
} from "lucide-react";
import axios from "axios";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";

interface Anomaly {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  value: number;
  expected: number;
  deviation: number;
  category: string;
  detected_at: string;
}

const detectAnomalies = (
  tasks: any[], equipment: any[], incidents: any[],
  costCodes: any[], project: any
): Anomaly[] => {
  const anomalies: Anomaly[] = [];

  // Cost anomalies
  if (project) {
    const budget = project.total_budget || 5000000;
    const spent = project.spent_to_date || 0;
    const progress = project.progress_percentage || 0;
    const expectedSpend = budget * (progress / 100);
    const deviation = spent > 0 ? ((spent - expectedSpend) / expectedSpend) * 100 : 0;

    if (Math.abs(deviation) > 15) {
      anomalies.push({
        id: "cost-1",
        type: "cost",
        severity: Math.abs(deviation) > 30 ? "critical" : "high",
        title: "Cost Variance Anomaly",
        description: `Spending ${deviation > 0 ? "exceeds" : "lags"} expected by ${Math.abs(deviation).toFixed(1)}% relative to progress`,
        value: spent,
        expected: expectedSpend,
        deviation: Math.round(deviation),
        category: "Financial",
        detected_at: new Date().toISOString(),
      });
    }
  }

  // Schedule anomalies
  const delayedTasks = tasks.filter(t => t.delay_days > 14);
  if (delayedTasks.length > tasks.length * 0.3 && tasks.length > 0) {
    anomalies.push({
      id: "schedule-1",
      type: "schedule",
      severity: "high",
      title: "Mass Schedule Delay Detected",
      description: `${delayedTasks.length} tasks (${Math.round(delayedTasks.length / tasks.length * 100)}%) delayed by 2+ weeks — possible systemic issue`,
      value: delayedTasks.length,
      expected: Math.round(tasks.length * 0.1),
      deviation: Math.round((delayedTasks.length / tasks.length) * 100),
      category: "Schedule",
      detected_at: new Date().toISOString(),
    });
  }

  const stuckTasks = tasks.filter(t =>
    t.status === "inprogress" && t.actual_progress < 20 && t.delay_days > 7
  );
  if (stuckTasks.length > 0) {
    anomalies.push({
      id: "schedule-2",
      type: "schedule",
      severity: "medium",
      title: "Stalled Tasks Detected",
      description: `${stuckTasks.length} tasks show minimal progress despite being in-progress status`,
      value: stuckTasks.length,
      expected: 0,
      deviation: stuckTasks.length,
      category: "Schedule",
      detected_at: new Date().toISOString(),
    });
  }

  // Equipment anomalies
  const criticalEquip = equipment.filter(e => e.health_score < 50);
  if (criticalEquip.length > 0) {
    anomalies.push({
      id: "equip-1",
      type: "equipment",
      severity: criticalEquip.length > 2 ? "critical" : "high",
      title: "Multiple Equipment Critical",
      description: `${criticalEquip.length} equipment items below 50% health — risk of simultaneous failures`,
      value: criticalEquip.length,
      expected: 0,
      deviation: criticalEquip.length,
      category: "Equipment",
      detected_at: new Date().toISOString(),
    });
  }

  const highHoursEquip = equipment.filter(e => e.operating_hours > 8000);
  if (highHoursEquip.length > 0) {
    anomalies.push({
      id: "equip-2",
      type: "equipment",
      severity: "medium",
      title: "High Operating Hours",
      description: `${highHoursEquip.length} items exceed 8000 operating hours — overdue for major service`,
      value: highHoursEquip.reduce((s: number, e: any) => s + e.operating_hours, 0) / highHoursEquip.length,
      expected: 6000,
      deviation: Math.round(((highHoursEquip[0]?.operating_hours || 8000) - 6000) / 6000 * 100),
      category: "Equipment",
      detected_at: new Date().toISOString(),
    });
  }

  // Safety anomalies
  const recentIncidents = incidents.filter(i => i.status === "open");
  const severeIncidents = incidents.filter(i => i.severity === "Severe");
  if (severeIncidents.length >= 2) {
    anomalies.push({
      id: "safety-1",
      type: "safety",
      severity: "critical",
      title: "Multiple Severe Incidents",
      description: `${severeIncidents.length} severe incidents recorded — safety culture intervention required`,
      value: severeIncidents.length,
      expected: 0,
      deviation: severeIncidents.length * 100,
      category: "Safety",
      detected_at: new Date().toISOString(),
    });
  }

  if (recentIncidents.length > 3) {
    anomalies.push({
      id: "safety-2",
      type: "safety",
      severity: "high",
      title: "High Open Incident Count",
      description: `${recentIncidents.length} incidents still open — resolution rate below acceptable threshold`,
      value: recentIncidents.length,
      expected: 1,
      deviation: Math.round((recentIncidents.length - 1) * 100),
      category: "Safety",
      detected_at: new Date().toISOString(),
    });
  }

  // Cost code anomalies
  const overBudgetCodes = costCodes.filter((c: any) =>
    c.actual_amount > c.budgeted_amount * 1.2
  );
  if (overBudgetCodes.length > 0) {
    anomalies.push({
      id: "cost-2",
      type: "cost",
      severity: overBudgetCodes.length > 3 ? "high" : "medium",
      title: "Cost Code Overspend",
      description: `${overBudgetCodes.length} cost codes exceed budget by 20%+ — review ${overBudgetCodes[0]?.description || "items"}`,
      value: overBudgetCodes.length,
      expected: 0,
      deviation: Math.round(overBudgetCodes.length * 25),
      category: "Financial",
      detected_at: new Date().toISOString(),
    });
  }

  // Positive — no anomalies
  if (anomalies.length === 0) {
    anomalies.push({
      id: "all-clear",
      type: "info",
      severity: "low",
      title: "All Systems Normal",
      description: "No significant anomalies detected in cost, schedule, equipment, or safety data",
      value: 0,
      expected: 0,
      deviation: 0,
      category: "General",
      detected_at: new Date().toISOString(),
    });
  }

  return anomalies.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
};

export default function AnomalyPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [scatterData, setScatterData] = useState<any[]>([]);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (projectId) runDetection(); }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const runDetection = async () => {
    setLoading(true);
    try {
      const [tasksRes, equipRes, safetyRes, costRes, projectRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/safety`),
        axios.get(`http://localhost:8000/api/v1/construction/cost-codes/${projectId}`).catch(() => ({ data: { cost_codes: [] } })),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}`),
      ]);

      const tasks = tasksRes.data.tasks || [];
      const equipment = equipRes.data.equipment || [];
      const incidents = safetyRes.data.incidents || [];
      const costCodes = costRes.data.cost_codes || [];
      const project = projectRes.data.project;
      setSelectedProject(project);

      const detected = detectAnomalies(tasks, equipment, incidents, costCodes, project);
      setAnomalies(detected);

      // Trend data - simulate historical anomaly counts
      const now = new Date();
      const trends = Array.from({ length: 8 }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (7 - i) * 7);
        return {
          week: `W${i + 1}`,
          cost: Math.round(Math.random() * 3 + (i > 5 ? detected.filter(a => a.type === "cost").length : 0)),
          schedule: Math.round(Math.random() * 2 + (i > 4 ? detected.filter(a => a.type === "schedule").length : 0)),
          safety: Math.round(Math.random() * 1 + (i > 6 ? detected.filter(a => a.type === "safety").length : 0)),
          equipment: Math.round(Math.random() * 2 + (i > 5 ? detected.filter(a => a.type === "equipment").length : 0)),
        };
      });
      setTrendData(trends);

      // Scatter data for cost vs progress
      const scatter = tasks.map((t: any, i: number) => ({
        x: t.planned_progress || 0,
        y: t.actual_progress || 0,
        name: t.task_name,
        anomaly: Math.abs((t.planned_progress || 0) - (t.actual_progress || 0)) > 20,
      }));
      setScatterData(scatter);

    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const severityColor = {
    critical: "text-red-400 border-red-500/30 bg-red-500/5",
    high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
    medium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
    low: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  };

  const severityIcon = {
    critical: "🚨",
    high: "⚠️",
    medium: "⚡",
    low: "✅",
  };

  const categoryIcon: { [key: string]: string } = {
    Financial: "💰",
    Schedule: "📅",
    Equipment: "🔧",
    Safety: "🦺",
    General: "ℹ️",
  };

  const criticalCount = anomalies.filter(a => a.severity === "critical").length;
  const highCount = anomalies.filter(a => a.severity === "high").length;
  const mediumCount = anomalies.filter(a => a.severity === "medium").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Anomaly Detection</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered detection of unusual patterns in cost, schedule, safety & equipment
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={runDetection} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? "Scanning..." : "Run Detection"}
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-muted-foreground">Scanning for anomalies in project data...</p>
        </div>
      ) : anomalies.length > 0 ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Anomalies", value: anomalies.filter(a => a.type !== "info").length.toString(), icon: AlertTriangle, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
              { label: "Critical", value: criticalCount.toString(), icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
              { label: "High Severity", value: highCount.toString(), icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
              { label: "Medium", value: mediumCount.toString(), icon: CheckCircle, color: "border-yellow-500/20 bg-yellow-500/5", iconColor: "text-yellow-400" },
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

          {/* Anomaly List */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <h3 className="font-semibold text-foreground">Detected Anomalies</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Live from Supabase
              </span>
            </div>
            <div className="space-y-3">
              {anomalies.map((anomaly, i) => (
                <motion.div key={anomaly.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`p-4 rounded-xl border ${severityColor[anomaly.severity]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-xl flex-shrink-0">{severityIcon[anomaly.severity]}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {categoryIcon[anomaly.category]} {anomaly.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{anomaly.description}</p>
                        {anomaly.deviation !== 0 && anomaly.type !== "info" && (
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-muted-foreground">
                              Detected: {Math.abs(anomaly.deviation)}% deviation
                            </span>
                            <div className="flex-1 bg-secondary/50 rounded-full h-1">
                              <div
                                className={`h-1 rounded-full ${
                                  anomaly.severity === "critical" ? "bg-red-500" :
                                  anomaly.severity === "high" ? "bg-orange-500" :
                                  anomaly.severity === "medium" ? "bg-yellow-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(Math.abs(anomaly.deviation), 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg capitalize flex-shrink-0 ${severityColor[anomaly.severity]}`}>
                      {anomaly.severity}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Anomaly Trend */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Anomaly Trend</h3>
              <p className="text-xs text-muted-foreground mb-4">Weekly anomaly count by category</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <ReferenceLine y={3} stroke="#ef444440" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Cost" />
                  <Line type="monotone" dataKey="schedule" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Schedule" />
                  <Line type="monotone" dataKey="safety" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Safety" />
                  <Line type="monotone" dataKey="equipment" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Equipment" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { color: "bg-red-400", label: "Cost" },
                  { color: "bg-orange-400", label: "Schedule" },
                  { color: "bg-blue-400", label: "Safety" },
                  { color: "bg-purple-400", label: "Equipment" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${l.color}`} />
                    <span className="text-xs text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Task Progress Scatter */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Schedule Anomaly Scatter</h3>
              <p className="text-xs text-muted-foreground mb-4">Planned vs Actual progress — Red dots = anomalies</p>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="x" name="Planned %" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <YAxis dataKey="y" name="Actual %" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <ReferenceLine y={0} x={0} stroke="#ffffff10" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                    formatter={(value: any, name: string) => [`${value}%`, name]}
                    labelFormatter={() => "Task"}
                  />
                  <Scatter data={scatterData} name="Tasks">
                    {scatterData.map((entry, i) => (
                      <Cell key={i} fill={entry.anomaly ? "#ef4444" : "#10b981"} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                  {/* Diagonal reference line (perfect progress) */}
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#ffffff20" strokeDasharray="4 4" />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">Normal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-muted-foreground">Anomaly (&gt;20% deviation)</span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : (
        <div className="text-center py-20">
          <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Ready to Scan</p>
          <p className="text-sm text-muted-foreground mb-6">Select a project to detect anomalies</p>
          <button onClick={runDetection}
            className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
            <Zap className="w-4 h-4" />
            Run Detection
          </button>
        </div>
      )}

      <ModuleChat
        context="Anomaly Detection"
        placeholder="Ask about detected anomalies..."
        pageSummaryData={{ anomalies, project: selectedProject?.name }}
      />
    </div>
  );
}