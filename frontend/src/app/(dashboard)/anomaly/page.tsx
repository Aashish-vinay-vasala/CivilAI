"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Loader2, Zap,
  CheckCircle, DollarSign, Calendar,
  Shield, Wrench, RefreshCw,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
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
    const deviation = spent > 0 && expectedSpend > 0
      ? ((spent - expectedSpend) / expectedSpend) * 100
      : 0;

    if (Math.abs(deviation) > 15) {
      anomalies.push({
        id: "cost-1", type: "cost",
        severity: Math.abs(deviation) > 30 ? "critical" : "high",
        title: "Cost Variance Anomaly",
        description: `Spending ${deviation > 0 ? "exceeds" : "lags"} expected by ${Math.abs(deviation).toFixed(1)}% relative to progress`,
        value: spent, expected: expectedSpend,
        deviation: Math.round(deviation),
        category: "Financial",
        detected_at: new Date().toISOString(),
      });
    }
  }

  // Schedule anomalies
  const delayedTasks = tasks.filter(t => (t.delay_days || 0) > 14);
  if (delayedTasks.length > tasks.length * 0.3 && tasks.length > 0) {
    anomalies.push({
      id: "schedule-1", type: "schedule", severity: "high",
      title: "Mass Schedule Delay Detected",
      description: `${delayedTasks.length} tasks (${Math.round(delayedTasks.length / tasks.length * 100)}%) delayed by 2+ weeks`,
      value: delayedTasks.length,
      expected: Math.round(tasks.length * 0.1),
      deviation: Math.round((delayedTasks.length / tasks.length) * 100),
      category: "Schedule",
      detected_at: new Date().toISOString(),
    });
  }

  const stuckTasks = tasks.filter(t =>
    t.status === "inprogress" && (t.actual_progress || 0) < 20 && (t.delay_days || 0) > 7
  );
  if (stuckTasks.length > 0) {
    anomalies.push({
      id: "schedule-2", type: "schedule", severity: "medium",
      title: "Stalled Tasks Detected",
      description: `${stuckTasks.length} in-progress tasks show minimal progress`,
      value: stuckTasks.length, expected: 0, deviation: stuckTasks.length,
      category: "Schedule",
      detected_at: new Date().toISOString(),
    });
  }

  // Equipment anomalies
  const criticalEquip = equipment.filter(e => (e.health_score || 100) < 50);
  if (criticalEquip.length > 0) {
    anomalies.push({
      id: "equip-1", type: "equipment",
      severity: criticalEquip.length > 2 ? "critical" : "high",
      title: "Multiple Equipment Critical",
      description: `${criticalEquip.length} equipment items below 50% health`,
      value: criticalEquip.length, expected: 0, deviation: criticalEquip.length,
      category: "Equipment",
      detected_at: new Date().toISOString(),
    });
  }

  const highHoursEquip = equipment.filter(e => (e.operating_hours || 0) > 8000);
  if (highHoursEquip.length > 0) {
    anomalies.push({
      id: "equip-2", type: "equipment", severity: "medium",
      title: "High Operating Hours",
      description: `${highHoursEquip.length} items exceed 8000 operating hours`,
      value: highHoursEquip[0]?.operating_hours || 0,
      expected: 6000,
      deviation: Math.round(((highHoursEquip[0]?.operating_hours || 8000) - 6000) / 6000 * 100),
      category: "Equipment",
      detected_at: new Date().toISOString(),
    });
  }

  // Safety anomalies
  const severeIncidents = incidents.filter(i => i.severity === "Severe");
  if (severeIncidents.length >= 2) {
    anomalies.push({
      id: "safety-1", type: "safety", severity: "critical",
      title: "Multiple Severe Incidents",
      description: `${severeIncidents.length} severe incidents — safety intervention required`,
      value: severeIncidents.length, expected: 0, deviation: severeIncidents.length * 100,
      category: "Safety",
      detected_at: new Date().toISOString(),
    });
  }

  const openIncidents = incidents.filter(i => i.status === "open");
  if (openIncidents.length > 3) {
    anomalies.push({
      id: "safety-2", type: "safety", severity: "high",
      title: "High Open Incident Count",
      description: `${openIncidents.length} incidents still open — resolution rate below threshold`,
      value: openIncidents.length, expected: 1,
      deviation: Math.round((openIncidents.length - 1) * 100),
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
      id: "cost-2", type: "cost",
      severity: overBudgetCodes.length > 3 ? "high" : "medium",
      title: "Cost Code Overspend",
      description: `${overBudgetCodes.length} cost codes exceed budget by 20%+`,
      value: overBudgetCodes.length, expected: 0,
      deviation: Math.round(overBudgetCodes.length * 25),
      category: "Financial",
      detected_at: new Date().toISOString(),
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      id: "all-clear", type: "info", severity: "low",
      title: "All Systems Normal",
      description: "No anomalies detected in cost, schedule, equipment or safety data",
      value: 0, expected: 0, deviation: 0,
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
  const [showDataInput, setShowDataInput] = useState(false);
  const [savingData, setSavingData] = useState(false);
  const [liveData, setLiveData] = useState({
    spent_to_date: "",
    progress_percentage: "",
    equipment_health: "",
    new_incident_severity: "none",
  });

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
      const [tasksRes, equipRes, safetyRes, costRes, projectRes, historyRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/safety`),
        axios.get(`http://localhost:8000/api/v1/construction/cost-codes/${projectId}`).catch(() => ({ data: { cost_codes: [] } })),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}`),
        axios.get(`http://localhost:8000/api/v1/construction/anomaly-history/${projectId}`).catch(() => ({ data: { history: [] } })),
      ]);

      const tasks = tasksRes.data.tasks || [];
      const equipment = equipRes.data.equipment || [];
      const incidents = safetyRes.data.incidents || [];
      const costCodes = costRes.data.cost_codes || [];
      const project = projectRes.data.project;
      const history = historyRes.data.history || [];
      setSelectedProject(project);

      const detected = detectAnomalies(tasks, equipment, incidents, costCodes, project);
      setAnomalies(detected);

      // Save to history
      if (detected.filter(a => a.type !== "info").length > 0) {
        axios.post("http://localhost:8000/api/v1/construction/anomaly-history", {
          project_id: projectId, anomalies: detected,
        }).catch(() => {});
      }

      // Real trend from history
      if (history.length > 0) {
        const weekMap: { [key: string]: any } = {};
        history.forEach((h: any) => {
          const date = new Date(h.detected_at);
          const weekNum = Math.floor((Date.now() - date.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const weekKey = `W${8 - weekNum}`;
          if (weekNum >= 0 && weekNum < 8) {
            if (!weekMap[weekKey]) weekMap[weekKey] = { week: weekKey, cost: 0, schedule: 0, safety: 0, equipment: 0 };
            if (h.anomaly_type === "cost") weekMap[weekKey].cost++;
            else if (h.anomaly_type === "schedule") weekMap[weekKey].schedule++;
            else if (h.anomaly_type === "safety") weekMap[weekKey].safety++;
            else if (h.anomaly_type === "equipment") weekMap[weekKey].equipment++;
          }
        });
        setTrendData(Array.from({ length: 8 }, (_, i) => {
          const key = `W${i + 1}`;
          return weekMap[key] || { week: key, cost: 0, schedule: 0, safety: 0, equipment: 0 };
        }));
      } else {
        setTrendData(Array.from({ length: 8 }, (_, i) => ({
          week: `W${i + 1}`, cost: 0, schedule: 0, safety: 0, equipment: 0,
        })));
      }

      // Scatter
      setScatterData(tasks.map((t: any) => ({
        x: t.planned_progress || 0,
        y: t.actual_progress || 0,
        name: t.task_name,
        anomaly: Math.abs((t.planned_progress || 0) - (t.actual_progress || 0)) > 20,
      })));

    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSaveLiveData = async () => {
    setSavingData(true);
    try {
      const updates: Promise<any>[] = [];

      // Update project
      if (liveData.spent_to_date || liveData.progress_percentage) {
        const updateData: any = {};
        if (liveData.spent_to_date) updateData.spent_to_date = parseFloat(liveData.spent_to_date);
        if (liveData.progress_percentage) updateData.progress_percentage = parseFloat(liveData.progress_percentage);
        updates.push(axios.patch(`http://localhost:8000/api/v1/projects/${projectId}`, updateData));
      }

      // Add incident
      if (liveData.new_incident_severity !== "none") {
        updates.push(
          axios.post("http://localhost:8000/api/v1/safety/incidents", {
            project_id: projectId,
            incident_type: "Live Report",
            severity: liveData.new_incident_severity,
            status: "open",
            date: new Date().toISOString().split("T")[0],
            location: "Site",
            description: "Reported via Anomaly Detection dashboard",
          }).catch(() => {})
        );
      }

      // Update equipment health
      if (liveData.equipment_health) {
        const equipRes = await axios.get(`http://localhost:8000/api/v1/projects/${projectId}/equipment`);
        const equipment = equipRes.data.equipment || [];
        if (equipment.length > 0) {
          const health = parseFloat(liveData.equipment_health);
          updates.push(
            axios.patch(`http://localhost:8000/api/v1/equipment/${equipment[0].id}`, {
              health_score: health,
              status: health < 50 ? "critical" : health < 70 ? "needs_service" : "operational",
            }).catch(() => {})
          );
        }
      }

      await Promise.all(updates);
      toast.success("Data saved! Re-running detection...");
      setShowDataInput(false);
      setLiveData({ spent_to_date: "", progress_percentage: "", equipment_health: "", new_incident_severity: "none" });
      await runDetection();
    } catch (err) {
      toast.error("Failed to save data");
    } finally { setSavingData(false); }
  };

  const severityColor = {
    critical: "text-red-400 border-red-500/30 bg-red-500/5",
    high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
    medium: "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
    low: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  };

  const severityIcon = { critical: "🚨", high: "⚠️", medium: "⚡", low: "✅" };
  const categoryIcon: { [k: string]: string } = { Financial: "💰", Schedule: "📅", Equipment: "🔧", Safety: "🦺", General: "ℹ️" };

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

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
            Real-time detection of unusual patterns · Updates saved to Supabase
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

      {/* Live Data Input Panel */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <h3 className="font-semibold text-foreground text-sm">Live Data Input</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">
              Enter real site data → triggers re-detection
            </span>
          </div>
          <button onClick={() => setShowDataInput(!showDataInput)}
            className="text-xs px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors">
            {showDataInput ? "Hide ▲" : "Enter Data ▼"}
          </button>
        </div>

        <AnimatePresence>
          {showDataInput && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="pt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">💰 Amount Spent ($)</label>
                  <input type="number" placeholder={`e.g. ${Math.round((selectedProject?.total_budget || 5000000) * 0.5)}`}
                    value={liveData.spent_to_date}
                    onChange={(e) => setLiveData(d => ({ ...d, spent_to_date: e.target.value }))}
                    className={inputClass} />
                  <p className="text-xs text-muted-foreground mt-0.5">Updates project spend in DB</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">📊 Overall Progress (%)</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 45"
                    value={liveData.progress_percentage}
                    onChange={(e) => setLiveData(d => ({ ...d, progress_percentage: e.target.value }))}
                    className={inputClass} />
                  <p className="text-xs text-muted-foreground mt-0.5">Updates project progress in DB</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">🔧 Equipment Health (%)</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 35"
                    value={liveData.equipment_health}
                    onChange={(e) => setLiveData(d => ({ ...d, equipment_health: e.target.value }))}
                    className={inputClass} />
                  <p className="text-xs text-muted-foreground mt-0.5">Updates first equipment item in DB</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">🦺 Report New Incident</label>
                  <select value={liveData.new_incident_severity}
                    onChange={(e) => setLiveData(d => ({ ...d, new_incident_severity: e.target.value }))}
                    className={inputClass}>
                    <option value="none">None</option>
                    <option value="Minor">Minor Incident</option>
                    <option value="Moderate">Moderate Incident</option>
                    <option value="Severe">Severe Incident</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-0.5">Adds incident to safety DB</p>
                </div>
              </div>

              {/* Quick Scenarios */}
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">⚡ Quick Scenarios — click to auto-fill:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      label: "💸 Cost Overrun",
                      desc: "Spend 30% above expected",
                      action: () => setLiveData(d => ({
                        ...d,
                        spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.8)),
                        progress_percentage: "45",
                      })),
                      color: "hover:border-red-500/30 hover:bg-red-500/5",
                    },
                    {
                      label: "🔧 Equipment Crisis",
                      desc: "Health drops to critical",
                      action: () => setLiveData(d => ({ ...d, equipment_health: "25" })),
                      color: "hover:border-orange-500/30 hover:bg-orange-500/5",
                    },
                    {
                      label: "🚨 Safety Alert",
                      desc: "Report severe incident",
                      action: () => setLiveData(d => ({ ...d, new_incident_severity: "Severe" })),
                      color: "hover:border-red-500/30 hover:bg-red-500/5",
                    },
                    {
                      label: "📅 Schedule Crisis",
                      desc: "Progress lags behind spend",
                      action: () => setLiveData(d => ({
                        ...d,
                        spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.7)),
                        progress_percentage: "30",
                      })),
                      color: "hover:border-yellow-500/30 hover:bg-yellow-500/5",
                    },
                    {
                      label: "✅ All Healthy",
                      desc: "Reset to good state",
                      action: () => setLiveData({
                        spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.5)),
                        progress_percentage: "55",
                        equipment_health: "90",
                        new_incident_severity: "none",
                      }),
                      color: "hover:border-emerald-500/30 hover:bg-emerald-500/5",
                    },
                  ].map((s, i) => (
                    <button key={i} onClick={s.action}
                      className={`flex flex-col items-start px-3 py-2 rounded-xl bg-secondary border border-border ${s.color} transition-colors text-left`}>
                      <span className="text-xs font-medium text-foreground">{s.label}</span>
                      <span className="text-xs text-muted-foreground">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowDataInput(false)}
                  className="px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">
                  Cancel
                </button>
                <button onClick={handleSaveLiveData} disabled={savingData}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
                  {savingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {savingData ? "Saving & Detecting..." : "Save to DB & Run Detection"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-muted-foreground">Scanning Supabase data for anomalies...</p>
        </div>
      ) : anomalies.length > 0 ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Anomalies", value: anomalies.filter(a => a.type !== "info").length, icon: AlertTriangle, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
              { label: "Critical", value: criticalCount, icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
              { label: "High Severity", value: highCount, icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
              { label: "Medium", value: mediumCount, icon: CheckCircle, color: "border-yellow-500/20 bg-yellow-500/5", iconColor: "text-yellow-400" },
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
                Computed from live Supabase data
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
                              {Math.abs(anomaly.deviation)}% deviation
                            </span>
                            <div className="flex-1 bg-secondary/50 rounded-full h-1.5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(Math.abs(anomaly.deviation), 100)}%` }}
                                transition={{ delay: i * 0.06 + 0.3, duration: 0.8 }}
                                className={`h-1.5 rounded-full ${
                                  anomaly.severity === "critical" ? "bg-red-500" :
                                  anomaly.severity === "high" ? "bg-orange-500" :
                                  anomaly.severity === "medium" ? "bg-yellow-500" : "bg-emerald-500"
                                }`}
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
              <p className="text-xs text-muted-foreground mb-4">Weekly count from anomaly_history table</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={3} stroke="#ef444440" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} name="Cost" />
                  <Line type="monotone" dataKey="schedule" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} name="Schedule" />
                  <Line type="monotone" dataKey="safety" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} name="Safety" />
                  <Line type="monotone" dataKey="equipment" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} name="Equipment" />
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

            {/* Scatter */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Schedule Anomaly Scatter</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Planned vs Actual progress — 🔴 Red = anomaly (&gt;20% deviation)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="x" name="Planned" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <YAxis dataKey="y" name="Actual" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                    formatter={(v: any, name: string) => [`${v}%`, name]}
                  />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#ffffff15" strokeDasharray="4 4" />
                  <Scatter data={scatterData} name="Tasks">
                    {scatterData.map((entry, i) => (
                      <Cell key={i} fill={entry.anomaly ? "#ef4444" : "#10b981"} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">Normal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-muted-foreground">Anomaly</span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      ) : (
        <div className="text-center py-20">
          <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Ready to Scan</p>
          <p className="text-sm text-muted-foreground mb-6">Select a project and run detection</p>
          <button onClick={runDetection}
            className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
            <Zap className="w-4 h-4" />Run Detection
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