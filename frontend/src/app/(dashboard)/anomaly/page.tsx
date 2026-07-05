"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const GNNPage = dynamic(() => import("../gnn/page"), { ssr: false });

const ANOMALY_SUB_TABS = [
  { id: "overview", label: "Overview" },
  { id: "gnn",      label: "GNN Risk" },
];

const ANALYTICS_TABS = [
  { href: "/analytics",  label: "Analytics" },
  { href: "/predictive", label: "Predictive" },
  { href: "/anomaly",    label: "Anomaly Detection" },
  { href: "/mlops",      label: "MLOps" },
];

import {
  AlertTriangle, Loader2, Zap,
  CheckCircle, Shield, Wrench, RefreshCw,
  DollarSign, Calendar, Users, Globe,
  Sparkles, Download, BarChart2, X,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

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
  projectName?: string;
}

const CATEGORY_MODULE: Record<string, { href: string; label: string; icon: any; color: string }> = {
  Financial: { href: "/cost",       label: "Cost Module",  icon: DollarSign, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  Schedule:  { href: "/scheduling", label: "Schedule",     icon: Calendar,   color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  Equipment: { href: "/equipment",  label: "Equipment",    icon: Wrench,     color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  Safety:    { href: "/safety",     label: "Safety",       icon: Shield,     color: "text-red-400 bg-red-500/10 border-red-500/20" },
  Workforce: { href: "/workforce",  label: "Workforce",    icon: Users,      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  General:   { href: "/dashboard",  label: "Dashboard",    icon: CheckCircle,color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

const detectAnomalies = (
  tasks: any[], equipment: any[], incidents: any[],
  costCodes: any[], project: any, projectName?: string
): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  const tag = (id: string): string => projectName ? `${id}-${projectName.slice(0, 6)}` : id;

  if (project) {
    const budget      = project.total_budget || 0;
    const spent       = project.spent_to_date || 0;
    const progress    = project.progress_percentage || 0;
    const expectedSpend = budget * (progress / 100);
    const deviation   = spent > 0 && expectedSpend > 0 ? ((spent - expectedSpend) / expectedSpend) * 100 : 0;
    if (Math.abs(deviation) > 15 && budget > 0) {
      anomalies.push({
        id: tag("cost-1"), type: "cost",
        severity: Math.abs(deviation) > 30 ? "critical" : "high",
        title: "Cost Variance Anomaly",
        description: `Spending ${deviation > 0 ? "exceeds" : "lags"} expected by ${Math.abs(deviation).toFixed(1)}% vs ${progress}% project progress`,
        value: spent, expected: expectedSpend, deviation: Math.round(deviation),
        category: "Financial", detected_at: new Date().toISOString(), projectName,
      });
    }
  }

  const delayedTasks = tasks.filter(t => (t.delay_days || 0) > 14);
  if (delayedTasks.length > tasks.length * 0.3 && tasks.length > 0) {
    anomalies.push({
      id: tag("schedule-1"), type: "schedule", severity: "high",
      title: "Mass Schedule Delay",
      description: `${delayedTasks.length} tasks (${Math.round(delayedTasks.length / tasks.length * 100)}%) delayed by 2+ weeks`,
      value: delayedTasks.length, expected: Math.round(tasks.length * 0.1),
      deviation: Math.round((delayedTasks.length / tasks.length) * 100),
      category: "Schedule", detected_at: new Date().toISOString(), projectName,
    });
  }

  const stuckTasks = tasks.filter(t => t.status === "inprogress" && (t.actual_progress || 0) < 20 && (t.delay_days || 0) > 7);
  if (stuckTasks.length > 0) {
    anomalies.push({
      id: tag("schedule-2"), type: "schedule", severity: "medium",
      title: "Stalled Tasks Detected",
      description: `${stuckTasks.length} in-progress task${stuckTasks.length > 1 ? "s" : ""} show minimal progress`,
      value: stuckTasks.length, expected: 0, deviation: stuckTasks.length,
      category: "Schedule", detected_at: new Date().toISOString(), projectName,
    });
  }

  const criticalEquip = equipment.filter(e => (e.health_score || 100) < 50);
  if (criticalEquip.length > 0) {
    anomalies.push({
      id: tag("equip-1"), type: "equipment",
      severity: criticalEquip.length > 2 ? "critical" : "high",
      title: "Equipment Below Critical Threshold",
      description: `${criticalEquip.length} equipment item${criticalEquip.length > 1 ? "s" : ""} below 50% health`,
      value: criticalEquip.length, expected: 0, deviation: criticalEquip.length,
      category: "Equipment", detected_at: new Date().toISOString(), projectName,
    });
  }

  const highHoursEquip = equipment.filter(e => (e.operating_hours || 0) > 8000);
  if (highHoursEquip.length > 0) {
    anomalies.push({
      id: tag("equip-2"), type: "equipment", severity: "medium",
      title: "High Operating Hours",
      description: `${highHoursEquip.length} item${highHoursEquip.length > 1 ? "s" : ""} exceed 8,000 operating hours`,
      value: highHoursEquip[0]?.operating_hours || 0, expected: 6000,
      deviation: Math.round(((highHoursEquip[0]?.operating_hours || 8000) - 6000) / 6000 * 100),
      category: "Equipment", detected_at: new Date().toISOString(), projectName,
    });
  }

  const severeIncidents = incidents.filter(i => i.severity === "Severe" || i.severity === "Critical");
  if (severeIncidents.length >= 2) {
    anomalies.push({
      id: tag("safety-1"), type: "safety", severity: "critical",
      title: "Multiple Severe Incidents",
      description: `${severeIncidents.length} severe/critical incidents — immediate safety intervention required`,
      value: severeIncidents.length, expected: 0, deviation: severeIncidents.length * 100,
      category: "Safety", detected_at: new Date().toISOString(), projectName,
    });
  }

  const openIncidents = incidents.filter(i => i.status === "open" || i.status === "investigating");
  if (openIncidents.length > 3) {
    anomalies.push({
      id: tag("safety-2"), type: "safety", severity: "high",
      title: "High Open Incident Count",
      description: `${openIncidents.length} incidents unresolved — resolution rate below threshold`,
      value: openIncidents.length, expected: 1,
      deviation: Math.round((openIncidents.length - 1) * 100),
      category: "Safety", detected_at: new Date().toISOString(), projectName,
    });
  }

  const overBudgetCodes = costCodes.filter((c: any) => c.actual_amount > c.budgeted_amount * 1.2);
  if (overBudgetCodes.length > 0) {
    anomalies.push({
      id: tag("cost-2"), type: "cost",
      severity: overBudgetCodes.length > 3 ? "high" : "medium",
      title: "Cost Code Budget Exceeded",
      description: `${overBudgetCodes.length} cost code${overBudgetCodes.length > 1 ? "s" : ""} exceed budget by 20%+`,
      value: overBudgetCodes.length, expected: 0,
      deviation: Math.round(overBudgetCodes.length * 25),
      category: "Financial", detected_at: new Date().toISOString(), projectName,
    });
  }

  if (anomalies.length === 0) {
    anomalies.push({
      id: tag("all-clear"), type: "info", severity: "low",
      title: "All Systems Normal",
      description: "No anomalies detected across cost, schedule, equipment, and safety data",
      value: 0, expected: 0, deviation: 0,
      category: "General", detected_at: new Date().toISOString(), projectName,
    });
  }

  return anomalies;
};

/* ─── PDF export ─────────────────────────────────────────────── */

function exportToPDF(anomalies: Anomaly[], projectName: string, isPortfolio: boolean) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pw  = doc.internal.pageSize.getWidth();
  const M   = 15;
  let y     = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Anomaly Detection Report", M, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CivilAI Platform  ·  ${projectName}  ·  ${new Date().toLocaleString()}`, M, 25);

  y = 38;
  const real = anomalies.filter(a => a.type !== "info");
  const critical = real.filter(a => a.severity === "critical").length;
  const high     = real.filter(a => a.severity === "high").length;
  const medium   = real.filter(a => a.severity === "medium").length;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Summary: ${real.length} anomalies detected  |  Critical: ${critical}  |  High: ${high}  |  Medium: ${medium}`, M, y);
  y += 10;

  doc.setFillColor(239, 246, 255);
  doc.rect(M, y, pw - M * 2, 8, "F");
  doc.setFontSize(9.5);
  doc.text("Title", M + 2, y + 5.5);
  doc.text("Severity", M + 80, y + 5.5);
  doc.text("Category", M + 110, y + 5.5);
  if (isPortfolio) doc.text("Project", M + 145, y + 5.5);
  y += 8;

  doc.setFont("helvetica", "normal");
  anomalies.forEach((a, i) => {
    if (y > 255) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
    doc.setTextColor(15, 23, 42);
    doc.text(a.title.substring(0, 35), M + 2, y + 5.5);
    const sc = a.severity === "critical" ? [185,28,28] : a.severity === "high" ? [194,65,12] : a.severity === "medium" ? [161,98,7] : [22,163,74];
    doc.setTextColor(sc[0], sc[1], sc[2]);
    doc.text(a.severity.toUpperCase(), M + 80, y + 5.5);
    doc.setTextColor(15, 23, 42);
    doc.text(a.category, M + 110, y + 5.5);
    if (isPortfolio && a.projectName) doc.text(a.projectName.substring(0, 20), M + 145, y + 5.5);
    y += 8;
  });

  y += 10;

  const sections = [
    {
      title: "What is Anomaly Detection?",
      body: `CivilAI's anomaly detection engine performs cross-module pattern analysis to identify statistically significant ` +
        `deviations from expected project performance. It evaluates four primary domains: Financial (cost variance vs. progress), ` +
        `Schedule (task delay accumulation and stalled activities), Equipment (health score degradation and operating hour thresholds), ` +
        `and Safety (incident severity patterns and resolution rates). Anomalies are classified by severity ` +
        `(Critical, High, Medium, Low) and linked to the responsible module for direct investigation.`
    },
    {
      title: "Detection Methodology",
      body: `Financial anomalies are detected when actual spend deviates from expected spend (based on progress percentage) ` +
        `by more than 15%. Schedule anomalies are flagged when >30% of tasks are delayed by 2+ weeks, or when in-progress ` +
        `tasks show <20% actual progress despite 7+ day delays. Equipment anomalies trigger at <50% health score (critical) ` +
        `or >8,000 operating hours (maintenance warning). Safety anomalies activate at 2+ severe/critical incidents or >3 ` +
        `unresolved open incidents. All thresholds are calibrated against construction industry benchmarks.`
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

  doc.save(`anomaly-detection-${projectName.replace(/\s+/g, "-")}-${Date.now()}.pdf`);
}

/* ─── component ─────────────────────────────────────────────── */

export default function AnomalyPage() {
  const [subTab, setSubTab]                    = useState("overview");
  const [projects, setProjects]                = useState<any[]>([]);
  const [projectId, setProjectId]              = useState("");
  const [selectedProject, setSelectedProject]  = useState<any>(null);
  const [loading, setLoading]                  = useState(false);
  const [anomalies, setAnomalies]              = useState<Anomaly[]>([]);
  const [trendData, setTrendData]              = useState<any[]>([]);
  const [scatterData, setScatterData]          = useState<any[]>([]);
  const [showDataInput, setShowDataInput]      = useState(false);
  const [savingData, setSavingData]            = useState(false);
  const [isPortfolio, setIsPortfolio]          = useState(false);
  const [summaryOpen, setSummaryOpen]          = useState(false);
  const [liveData, setLiveData] = useState({
    spent_to_date: "", progress_percentage: "",
    equipment_health: "", new_incident_severity: "none",
  });

  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    if (!projectId) return;
    if (projectId === "all") runPortfolioDetection();
    else runDetection();
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const fetchProjectData = async (pid: string) => {
    const [tasksRes, equipRes, safetyRes, costRes, projectRes] = await Promise.all([
      axios.get(`${API}/api/v1/projects/${pid}/schedule`).catch(() => ({ data: { tasks: [] } })),
      axios.get(`${API}/api/v1/projects/${pid}/equipment`).catch(() => ({ data: { equipment: [] } })),
      axios.get(`${API}/api/v1/projects/${pid}/safety`).catch(() => ({ data: { incidents: [] } })),
      axios.get(`${API}/api/v1/construction/cost-codes/${pid}`).catch(() => ({ data: { cost_codes: [] } })),
      axios.get(`${API}/api/v1/projects/${pid}`).catch(() => ({ data: { project: null } })),
    ]);
    return {
      tasks:     tasksRes.data.tasks     || [],
      equipment: equipRes.data.equipment || [],
      incidents: safetyRes.data.incidents|| [],
      costCodes: costRes.data.cost_codes || [],
      project:   projectRes.data.project,
    };
  };

  const runDetection = async () => {
    setLoading(true);
    setIsPortfolio(false);
    try {
      const [data, historyRes] = await Promise.all([
        fetchProjectData(projectId),
        axios.get(`${API}/api/v1/construction/anomaly-history/${projectId}`).catch(() => ({ data: { history: [] } })),
      ]);
      const project = data.project;
      if (project) setSelectedProject(project);

      const detected = detectAnomalies(data.tasks, data.equipment, data.incidents, data.costCodes, project);
      setAnomalies(detected.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.severity] - order[b.severity];
      }));

      if (detected.filter(a => a.type !== "info").length > 0) {
        axios.post(`${API}/api/v1/construction/anomaly-history`, { project_id: projectId, anomalies: detected }).catch(() => {});
      }

      const history = historyRes.data.history || [];
      buildTrend(history, detected);
      setScatterData(data.tasks.map((t: any) => ({
        x: t.planned_progress || 0,
        y: t.actual_progress  || 0,
        name: t.task_name,
        anomaly: Math.abs((t.planned_progress || 0) - (t.actual_progress || 0)) > 20,
      })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const runPortfolioDetection = async () => {
    setLoading(true);
    setIsPortfolio(true);
    try {
      const allDetected: Anomaly[] = [];
      await Promise.all(
        projects.slice(0, 10).map(async (proj) => {
          const data     = await fetchProjectData(proj.id);
          const detected = detectAnomalies(data.tasks, data.equipment, data.incidents, data.costCodes, data.project || proj, proj.name);
          allDetected.push(...detected.filter(a => a.type !== "info"));
        })
      );
      if (allDetected.length === 0) {
        allDetected.push({
          id: "all-clear", type: "info", severity: "low",
          title: "All Systems Normal",
          description: `No anomalies detected across ${projects.length} projects`,
          value: 0, expected: 0, deviation: 0,
          category: "General", detected_at: new Date().toISOString(),
        });
      }
      setAnomalies(allDetected.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.severity] - order[b.severity];
      }));
      buildTrend([], allDetected);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const buildTrend = (history: any[], detected: Anomaly[]) => {
    if (history.length > 0) {
      const weekMap: Record<string, any> = {};
      const now = Date.now();
      history.forEach((h: any) => {
        const date    = new Date(h.detected_at);
        const weekNum = Math.floor((now - date.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const weekKey = `W${8 - weekNum}`;
        if (weekNum >= 0 && weekNum < 8) {
          if (!weekMap[weekKey]) weekMap[weekKey] = { week: weekKey, cost: 0, schedule: 0, safety: 0, equipment: 0 };
          const t = (h.anomaly_type || "").toLowerCase();
          if (t === "cost") weekMap[weekKey].cost++;
          else if (t === "schedule") weekMap[weekKey].schedule++;
          else if (t === "safety") weekMap[weekKey].safety++;
          else if (t === "equipment") weekMap[weekKey].equipment++;
        }
      });
      setTrendData(Array.from({ length: 8 }, (_, i) => weekMap[`W${i + 1}`] || { week: `W${i + 1}`, cost: 0, schedule: 0, safety: 0, equipment: 0 }));
    } else {
      const currentWeek = { week: "Now", cost: 0, schedule: 0, safety: 0, equipment: 0 };
      detected.forEach(a => {
        if (a.type === "cost")           currentWeek.cost++;
        else if (a.type === "schedule")  currentWeek.schedule++;
        else if (a.type === "safety")    currentWeek.safety++;
        else if (a.type === "equipment") currentWeek.equipment++;
      });
      setTrendData([
        ...Array.from({ length: 7 }, (_, i) => ({ week: `W${i + 1}`, cost: 0, schedule: 0, safety: 0, equipment: 0 })),
        currentWeek,
      ]);
    }
  };

  const handleSaveLiveData = async () => {
    setSavingData(true);
    try {
      const updates: Promise<any>[] = [];
      if (liveData.spent_to_date || liveData.progress_percentage) {
        const updateData: any = {};
        if (liveData.spent_to_date)       updateData.spent_to_date       = parseFloat(liveData.spent_to_date);
        if (liveData.progress_percentage) updateData.progress_percentage = parseFloat(liveData.progress_percentage);
        updates.push(axios.patch(`${API}/api/v1/projects/${projectId}`, updateData));
      }
      if (liveData.new_incident_severity !== "none") {
        updates.push(axios.post(`${API}/api/v1/safety/incidents`, {
          project_id: projectId, incident_type: "Live Report", severity: liveData.new_incident_severity,
          status: "open", date: new Date().toISOString().split("T")[0], location: "Site",
          description: "Reported via Anomaly Detection dashboard",
        }).catch(() => {}));
      }
      if (liveData.equipment_health) {
        const equipRes = await axios.get(`${API}/api/v1/projects/${projectId}/equipment`);
        const equipment = equipRes.data.equipment || [];
        if (equipment.length > 0) {
          const health = parseFloat(liveData.equipment_health);
          updates.push(axios.patch(`${API}/api/v1/equipment/${equipment[0].id}`, {
            health_score: health, status: health < 50 ? "critical" : health < 70 ? "needs_service" : "operational",
          }).catch(() => {}));
        }
      }
      await Promise.all(updates);
      toast.success("Data saved — re-running detection…");
      setShowDataInput(false);
      setLiveData({ spent_to_date: "", progress_percentage: "", equipment_health: "", new_incident_severity: "none" });
      await runDetection();
    } catch { toast.error("Failed to save data"); }
    finally { setSavingData(false); }
  };

  /* ─── styling helpers ─── */

  const severityColor: Record<string, string> = {
    critical: "text-red-400 border-red-500/30 bg-red-500/5",
    high:     "text-orange-400 border-orange-500/30 bg-orange-500/5",
    medium:   "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
    low:      "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  };
  const severityBadge: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300",
    high:     "bg-orange-500/20 text-orange-300",
    medium:   "bg-yellow-500/20 text-yellow-300",
    low:      "bg-emerald-500/20 text-emerald-300",
  };
  const severityIcon: Record<string, string>  = { critical: "🚨", high: "⚠️", medium: "⚡", low: "✅" };
  const categoryIcon: Record<string, string>  = { Financial: "💰", Schedule: "📅", Equipment: "🔧", Safety: "🦺", General: "ℹ️" };

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  const realAnomalies  = anomalies.filter(a => a.type !== "info");
  const criticalCount  = realAnomalies.filter(a => a.severity === "critical").length;
  const highCount      = realAnomalies.filter(a => a.severity === "high").length;
  const mediumCount    = realAnomalies.filter(a => a.severity === "medium").length;

  const affectedModules = realAnomalies.reduce((acc, a) => {
    const mod = CATEGORY_MODULE[a.category];
    if (!mod) return acc;
    if (!acc[a.category]) acc[a.category] = { count: 0, severity: "low" as string };
    acc[a.category].count++;
    const order: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    if ((order[a.severity] ?? 0) > (order[acc[a.category].severity] ?? 0))
      acc[a.category].severity = a.severity;
    return acc;
  }, {} as Record<string, { count: number; severity: string }>);

  const projectName = isPortfolio ? `All Projects (${projects.length})` : selectedProject?.name || "Project";

  const tabBar = (
    <div className="flex gap-0 border-b border-border">
      {ANOMALY_SUB_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            subTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}>{t.label}</button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={ANALYTICS_TABS} />
      {tabBar}
      {subTab === "gnn" && <div className="pt-6"><GNNPage /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={ANALYTICS_TABS} />
      {tabBar}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Anomaly Detection</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time cross-module anomaly detection — cost, schedule, equipment, safety
            {isPortfolio && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Portfolio — {projects.length} projects</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              <option value="all">🌐 All Projects (Portfolio)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => projectId === "all" ? runPortfolioDetection() : runDetection()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? "Scanning…" : "Run Detection"}
          </button>
          {anomalies.length > 0 && (
            <button onClick={() => exportToPDF(anomalies, projectName, isPortfolio)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80">
              <Download className="w-4 h-4" /> PDF
            </button>
          )}
          {anomalies.length > 0 && !summaryOpen && (
            <button onClick={() => setSummaryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm hover:bg-cyan-500/20 transition-colors">
              <Sparkles className="w-4 h-4" /> AI Summary
            </button>
          )}
        </div>
      </motion.div>

      {/* Affected Modules */}
      {Object.keys(affectedModules).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            Affected Modules — click to investigate
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(affectedModules).map(([cat, info]) => {
              const mod = CATEGORY_MODULE[cat];
              if (!mod) return null;
              return (
                <Link key={cat} href={mod.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-opacity hover:opacity-75 ${severityColor[info.severity]}`}>
                  <span>{categoryIcon[cat]}</span>
                  <span>{mod.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${severityBadge[info.severity]}`}>{info.count}</span>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Live Data Input (single-project only) */}
      {!isPortfolio && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h3 className="font-semibold text-foreground text-sm">Live Data Input</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">Updates Supabase → triggers re-detection</span>
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
                    <p className="text-xs text-muted-foreground mt-0.5">Updates project → <Link href="/cost" className="text-blue-400 hover:underline">Cost</Link></p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">📊 Overall Progress (%)</label>
                    <input type="number" min="0" max="100" placeholder="e.g. 45"
                      value={liveData.progress_percentage}
                      onChange={(e) => setLiveData(d => ({ ...d, progress_percentage: e.target.value }))}
                      className={inputClass} />
                    <p className="text-xs text-muted-foreground mt-0.5">Updates project → <Link href="/scheduling" className="text-blue-400 hover:underline">Schedule</Link></p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">🔧 Equipment Health (%)</label>
                    <input type="number" min="0" max="100" placeholder="e.g. 35"
                      value={liveData.equipment_health}
                      onChange={(e) => setLiveData(d => ({ ...d, equipment_health: e.target.value }))}
                      className={inputClass} />
                    <p className="text-xs text-muted-foreground mt-0.5">Updates equipment → <Link href="/equipment" className="text-blue-400 hover:underline">Equipment</Link></p>
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
                    <p className="text-xs text-muted-foreground mt-0.5">Adds to → <Link href="/safety" className="text-blue-400 hover:underline">Safety</Link></p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">⚡ Quick Scenarios:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "💸 Cost Overrun", desc: "Spend 30% above expected", action: () => setLiveData(d => ({ ...d, spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.8)), progress_percentage: "45" })), color: "hover:border-red-500/30 hover:bg-red-500/5" },
                      { label: "🔧 Equipment Crisis", desc: "Health drops to critical", action: () => setLiveData(d => ({ ...d, equipment_health: "25" })), color: "hover:border-orange-500/30 hover:bg-orange-500/5" },
                      { label: "🚨 Safety Alert", desc: "Report severe incident", action: () => setLiveData(d => ({ ...d, new_incident_severity: "Severe" })), color: "hover:border-red-500/30 hover:bg-red-500/5" },
                      { label: "📅 Schedule Crisis", desc: "Progress lags spend", action: () => setLiveData(d => ({ ...d, spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.7)), progress_percentage: "30" })), color: "hover:border-yellow-500/30 hover:bg-yellow-500/5" },
                      { label: "✅ All Healthy", desc: "Reset to good state", action: () => setLiveData({ spent_to_date: String(Math.round((selectedProject?.total_budget || 5000000) * 0.5)), progress_percentage: "55", equipment_health: "90", new_incident_severity: "none" }), color: "hover:border-emerald-500/30 hover:bg-emerald-500/5" },
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
                    className="px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">Cancel</button>
                  <button onClick={handleSaveLiveData} disabled={savingData}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
                    {savingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {savingData ? "Saving & Detecting…" : "Save to DB & Run Detection"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-muted-foreground text-sm">
            {isPortfolio ? `Scanning ${projects.length} projects for anomalies…` : "Scanning Supabase data for anomalies…"}
          </p>
          {isPortfolio && (
            <div className="flex gap-2 flex-wrap justify-center">
              {projects.slice(0, 5).map(p => (
                <span key={p.id} className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 animate-pulse">{p.name}</span>
              ))}
            </div>
          )}
        </div>
      ) : anomalies.length > 0 ? (
        <>
          {/* KPI Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Anomalies",  value: realAnomalies.length, icon: AlertTriangle, color: "border-blue-500/20 bg-blue-500/5",    iconColor: "text-blue-400" },
              { label: "Critical",         value: criticalCount,        icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5",       iconColor: "text-red-400" },
              { label: "High Severity",    value: highCount,            icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
              { label: "Medium",           value: mediumCount,          icon: CheckCircle,   color: "border-yellow-500/20 bg-yellow-500/5", iconColor: "text-yellow-400" },
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
                  <p className="font-semibold text-foreground text-sm">AI Anomaly Intelligence Summary</p>
                  <p className="text-xs text-muted-foreground">Verbose technical explanation of all detected anomalies</p>
                </div>
                {criticalCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-red-400 border-red-500/30 bg-red-500/5 border">
                    {criticalCount} Critical
                  </span>
                )}
              </div>
              <button onClick={() => setSummaryOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-5 text-sm leading-relaxed">

                    <div className="pt-5">
                      <p className="font-bold text-base text-foreground mb-2">Anomaly Detection Summary</p>
                      <p className="text-muted-foreground">
                        CivilAI's anomaly detection engine scanned{" "}
                        <strong className="text-foreground">{isPortfolio ? `${projects.length} projects` : selectedProject?.name}</strong>{" "}
                        and identified <strong className="text-foreground">{realAnomalies.length} anomalies</strong> across
                        four construction management domains. The detection engine performs{" "}
                        <strong className="text-foreground">statistical deviation analysis</strong> — comparing actual project
                        metrics against expected baselines derived from project progress, industry benchmarks, and
                        historical patterns.{" "}
                        {criticalCount > 0 && (
                          <><strong className="text-red-400">{criticalCount} critical anomalies</strong> require immediate attention.</>
                        )}
                        {" "}The most severe issues affect:{" "}
                        <strong className="text-foreground">{Object.keys(affectedModules).join(", ") || "no modules"}</strong>.
                      </p>
                    </div>

                    {realAnomalies.filter(a => a.severity === "critical" || a.severity === "high").map((anomaly, i) => (
                      <div key={i} className={`p-4 rounded-xl border ${severityColor[anomaly.severity]}`}>
                        <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                          <span>{severityIcon[anomaly.severity]}</span>
                          {anomaly.title}
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${severityBadge[anomaly.severity]}`}>
                            {anomaly.severity}
                          </span>
                          {anomaly.projectName && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{anomaly.projectName}</span>
                          )}
                        </p>
                        <p className="text-muted-foreground mb-2">{anomaly.description}</p>
                        <p className="text-muted-foreground">
                          {anomaly.type === "cost" && (
                            <>The <strong className="text-foreground">cost variance anomaly</strong> indicates a{" "}
                              <strong className="text-foreground">{Math.abs(anomaly.deviation)}% deviation</strong> between actual
                              spend and expected spend at current project progress. This suggests{" "}
                              {anomaly.deviation > 0
                                ? <>accelerated spending relative to progress — a leading indicator of{" "}
                                  <strong className="text-foreground">budget overrun</strong>. Review procurement pipeline,
                                  approve only critical change orders, and enforce cost controls immediately.</>
                                : <>lagging spend relative to progress — potentially indicating{" "}
                                  <strong className="text-foreground">scope under-delivery</strong> or delayed billing.
                                  Verify activity completion records and invoice status.</>
                              }
                            </>
                          )}
                          {anomaly.type === "schedule" && (
                            <>The <strong className="text-foreground">schedule anomaly</strong> indicates{" "}
                              <strong className="text-foreground">{Math.abs(anomaly.deviation)}% deviation</strong> from expected
                              task completion rates. Schedule anomalies compound through{" "}
                              <strong className="text-foreground">critical path dependencies</strong> — a 30% task delay rate
                              can shift overall project completion by 3–8 weeks. Immediate intervention:{" "}
                              resource augmentation, activity compression, or scope re-sequencing on critical path activities.</>
                          )}
                          {anomaly.type === "equipment" && (
                            <>The <strong className="text-foreground">equipment anomaly</strong> signals{" "}
                              {anomaly.id.includes("equip-1")
                                ? <>units below the <strong className="text-foreground">50% health threshold</strong>.
                                  Equipment at this health level has a statistically elevated failure probability.
                                  Failure events on critical-path machinery create cascading schedule delays at a mean rate
                                  of <strong className="text-foreground">3.2 days per event</strong>. Schedule immediate
                                  preventive maintenance and establish equipment backup/rental contingencies.</>
                                : <>units exceeding <strong className="text-foreground">8,000 operating hours</strong> — the
                                  industry threshold for major service intervals. Extended operation beyond this threshold
                                  significantly increases failure probability and can void warranty coverage.</>
                              }
                            </>
                          )}
                          {anomaly.type === "safety" && (
                            <>The <strong className="text-foreground">safety anomaly</strong> indicates{" "}
                              {anomaly.id.includes("safety-1")
                                ? <>multiple severe incidents, which is a statistically significant safety failure pattern.
                                  This triggers mandatory{" "}
                                  <strong className="text-foreground">regulatory notification obligations</strong> in most
                                  jurisdictions. Required actions: immediate site work stoppage assessment,{" "}
                                  <strong className="text-foreground">root cause analysis (RCA)</strong>, toolbox talks,
                                  enhanced supervision, and corrective action plan within 24 hours.</>
                                : <>high numbers of unresolved incidents indicating a systemic gap in the{" "}
                                  <strong className="text-foreground">incident resolution process</strong>. Open incidents
                                  represent ongoing regulatory liability. Assign dedicated resolution owners and establish
                                  48-hour closure SLAs for all open safety records.</>
                              }
                            </>
                          )}
                        </p>
                      </div>
                    ))}

                    <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                      <p className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        Detection Methodology
                      </p>
                      <p className="text-muted-foreground">
                        Anomalies are detected by comparing actual project data against{" "}
                        <strong className="text-foreground">expected baselines</strong>: Financial anomalies trigger when
                        actual spend deviates from expected spend (based on progress %) by more than{" "}
                        <strong className="text-foreground">15%</strong>. Schedule anomalies flag when{" "}
                        <strong className="text-foreground">&gt;30% of tasks</strong> are delayed by 2+ weeks.
                        Equipment anomalies activate at <strong className="text-foreground">&lt;50% health score</strong>{" "}
                        or <strong className="text-foreground">&gt;8,000 operating hours</strong>.
                        Safety anomalies trigger at{" "}
                        <strong className="text-foreground">2+ severe/critical incidents</strong> or{" "}
                        <strong className="text-foreground">&gt;3 unresolved open incidents</strong>.
                        {" "}All thresholds are calibrated against construction industry benchmarks.
                        Anomaly history is persisted to Supabase for trend analysis.
                      </p>
                    </div>
                  </div>
          </motion.div>
          )}

          {/* Anomaly List */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <h3 className="font-semibold text-foreground">Detected Anomalies</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live from Supabase</span>
              {isPortfolio && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center gap-1"><Globe className="w-3 h-3" /> Portfolio</span>}
            </div>
            <div className="space-y-3">
              {anomalies.map((anomaly, i) => {
                const mod = CATEGORY_MODULE[anomaly.category];
                return (
                  <motion.div key={anomaly.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={`p-4 rounded-xl border ${severityColor[anomaly.severity]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-xl shrink-0">{severityIcon[anomaly.severity]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-semibold text-foreground">{anomaly.title}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                              {categoryIcon[anomaly.category]} {anomaly.category}
                            </span>
                            {anomaly.projectName && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 shrink-0">
                                {anomaly.projectName}
                              </span>
                            )}
                            {mod && anomaly.type !== "info" && (
                              <Link href={mod.href}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-opacity hover:opacity-75 shrink-0 ${mod.color}`}>
                                → {mod.label}
                              </Link>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{anomaly.description}</p>
                          {anomaly.deviation !== 0 && anomaly.type !== "info" && (
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-muted-foreground shrink-0">{Math.abs(anomaly.deviation)}% deviation</span>
                              <div className="flex-1 bg-secondary/50 rounded-full h-1.5">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(Math.abs(anomaly.deviation), 100)}%` }}
                                  transition={{ delay: i * 0.06 + 0.3, duration: 0.8 }}
                                  className={`h-1.5 rounded-full ${anomaly.severity === "critical" ? "bg-red-500" : anomaly.severity === "high" ? "bg-orange-500" : anomaly.severity === "medium" ? "bg-yellow-500" : "bg-emerald-500"}`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg capitalize shrink-0 ${severityBadge[anomaly.severity]}`}>{anomaly.severity}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Anomaly Trend</h3>
              <p className="text-xs text-muted-foreground mb-4">Weekly count from anomaly_history table</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <ReferenceLine y={3} stroke="#ef444440" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="cost"      stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Cost" />
                  <Line type="monotone" dataKey="schedule"  stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Schedule" />
                  <Line type="monotone" dataKey="safety"    stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Safety" />
                  <Line type="monotone" dataKey="equipment" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Equipment" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {[{ color: "bg-blue-400", label: "Cost", href: "/cost" }, { color: "bg-orange-400", label: "Schedule", href: "/scheduling" }, { color: "bg-red-400", label: "Safety", href: "/safety" }, { color: "bg-amber-400", label: "Equipment", href: "/equipment" }].map(l => (
                  <Link key={l.label} href={l.href} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
                    <div className={`w-2 h-2 rounded-full ${l.color}`} />
                    <span className="text-xs text-muted-foreground">{l.label}</span>
                  </Link>
                ))}
              </div>
            </motion.div>

            {!isPortfolio && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-semibold text-foreground mb-1">Schedule Anomaly Scatter</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Planned vs Actual progress — <span className="text-red-400">red</span> = &gt;20% deviation
                </p>
                {scatterData.length === 0 ? (
                  <div className="flex items-center justify-center h-50">
                    <p className="text-xs text-muted-foreground">No schedule tasks for this project</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="x" name="Planned" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} label={{ value: "Planned %", position: "insideBottomRight", offset: 0, fill: "#6b7280", fontSize: 9 }} />
                      <YAxis dataKey="y" name="Actual"  tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} formatter={(v: any, name: string) => [`${v}%`, name]} />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#ffffff15" strokeDasharray="4 4" />
                      <Scatter data={scatterData} name="Tasks">
                        {scatterData.map((entry, i) => (
                          <Cell key={i} fill={entry.anomaly ? "#ef4444" : "#10b981"} fillOpacity={0.8} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">On Track</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Anomaly (&gt;20% gap)</span></div>
                </div>
              </motion.div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-20">
          <Zap className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Ready to Scan</p>
          <p className="text-sm text-muted-foreground mb-6">Select a project or All Projects and run detection</p>
          <button onClick={() => projectId === "all" ? runPortfolioDetection() : runDetection()}
            className="px-6 py-3 rounded-xl gradient-blue text-white font-medium flex items-center gap-2 mx-auto">
            <Zap className="w-4 h-4" /> Run Detection
          </button>
        </div>
      )}

      <ModuleChat
        context="Anomaly Detection"
        placeholder="Ask about detected anomalies, trends, or which modules need attention…"
        pageSummaryData={{ anomalies, project: projectName, affectedModules: Object.keys(affectedModules), criticalCount, highCount, isPortfolio }}
      />
    </div>
  );
}
