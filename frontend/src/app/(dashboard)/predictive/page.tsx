"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Brain, DollarSign, Calendar, Shield,
  Wrench, Loader2, Sparkles,
  Download, Users, X,
  BarChart2, Globe,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const ANALYTICS_TABS = [
  { href: "/analytics",  label: "Analytics" },
  { href: "/predictive", label: "Predictive" },
  { href: "/anomaly",    label: "Anomaly Detection" },
  { href: "/mlops",      label: "MLOps" },
];

/* ─── theme helpers ──────────────────────────────────────────── */
// Mirrors the accent-color recipe used across the main dashboard / safety page:
// a soft tint background, a slightly stronger tint border, and the full color
// for text/icons.

const ACCENT: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.18)",   text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)",  text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",   text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)",  text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  blue:   { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)",  text: "#3B82F6", shadow: "rgba(59,130,246,0.15)" },
  orange: { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)",  text: "#F97316", shadow: "rgba(249,115,22,0.15)" },
};

const inputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const primaryBtnStyle = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
};
const ghostBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

const tooltipStyle = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border: "1px solid rgba(0,212,255,0.15)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

/* ─── helpers ─────────────────────────────────────────────────── */

const rLevel = (p: number) => p > 70 ? "High" : p > 40 ? "Medium" : "Low";

/**
 * Pulls live risk numbers for one project from the backend's real Supabase-backed
 * stats endpoints (the same endpoints and formulas the Analytics page uses), instead
 * of fabricating probabilities client-side. Cost overrun is the one domain with an
 * actual scored model behind it (rule-based, not a trained model — see AI Summary);
 * the rest are real aggregate risk indicators derived from this project's own data.
 */
async function fetchPredictions(api: string | undefined, pid: string) {
  const safe = (p: Promise<any>, fb: any) => p.then((r) => r.data).catch(() => fb);
  const [cost, delay, safety, equipment, workforce] = await Promise.all([
    safe(axios.get(`${api}/api/v1/ml/cost-overrun-auto?project_id=${pid}`), { probability: 0, will_overrun: false, estimated_overrun_pct: 0, risk_level: "Low", inputs: {} }),
    safe(axios.get(`${api}/api/v1/ml/delay-stats?project_id=${pid}`),       { delay_rate_pct: 0, avg_delay_days: 0, total_projects: 0 }),
    safe(axios.get(`${api}/api/v1/ml/safety-stats?project_id=${pid}`),      { safety_score: 100, total_incidents: 0 }),
    safe(axios.get(`${api}/api/v1/ml/equipment-stats?project_id=${pid}`),   { avg_health_score: 100, failure_rate_pct: 0, total_equipment: 0 }),
    safe(axios.get(`${api}/api/v1/ml/workforce-stats?project_id=${pid}`),   { turnover_rate_pct: 0, total_workers: 0 }),
  ]);

  const delayProb  = delay.delay_rate_pct ?? 0;
  const safetyProb = Math.round(100 - (safety.safety_score ?? 100));
  const equipProb  = Math.round(100 - (equipment.avg_health_score ?? 100));
  const turnProb   = workforce.turnover_rate_pct ?? 0;

  return {
    cost:      { probability: cost.probability ?? 0, will_overrun: !!cost.will_overrun, estimated_overrun_pct: cost.estimated_overrun_pct ?? 0, risk_level: cost.risk_level || rLevel(cost.probability ?? 0), inputs: cost.inputs },
    delay:     { probability: delayProb,  will_be_delayed: delayProb > 45, risk_level: rLevel(delayProb), avgDelayDays: delay.avg_delay_days ?? 0 },
    safety:    { probability: safetyProb, severe_risk: safetyProb > 60,    risk_level: rLevel(safetyProb) },
    equipment: { probability: equipProb,  will_fail: equipProb > 50,       risk_level: rLevel(equipProb) },
    turnover:  { probability: turnProb,   will_leave: turnProb > 45,       risk_level: rLevel(turnProb) },
    meta: {
      tasks: delay.total_tasks ?? 0,
      equipment: equipment.total_equipment ?? 0,
      incidents: safety.total_incidents ?? 0,
      workforce: workforce.total_workers ?? 0,
      changeOrders: cost.inputs?.change_orders ?? 0,
    },
  };
}

function generateAISummary(
  predictions: any, projectName: string, isPortfolio: boolean,
  allProjectPredictions?: { name: string; preds: any }[]
) {
  const p    = predictions;
  const maxRisk = Math.max(
    p.cost?.probability || 0, p.delay?.probability || 0,
    p.safety?.probability || 0, p.equipment?.probability || 0, p.turnover?.probability || 0
  );
  const overallLevel = rLevel(maxRisk);
  const meta = p.meta || {};

  return { overallLevel, maxRisk, meta };
}

function exportToPDF(
  predictions: any, projectName: string, forecastData: any[],
  allProjectPredictions?: { name: string; preds: any }[]
) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pw  = doc.internal.pageSize.getWidth();
  const M   = 15;
  let y     = 15;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Predictive Analytics Report", M, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CivilAI Platform  ·  ${new Date().toLocaleString()}`, M, 25);

  y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Project: ${projectName}`, M, y); y += 10;

  // Risk summary table header
  doc.setFillColor(239, 246, 255);
  doc.rect(M, y, pw - M * 2, 8, "F");
  doc.setFontSize(10);
  doc.text("Risk Domain", M + 2, y + 5.5);
  doc.text("Probability", M + 62, y + 5.5);
  doc.text("Level", M + 100, y + 5.5);
  doc.text("Status", M + 130, y + 5.5);
  y += 10;

  const rows = [
    ["Cost Overrun",       predictions.cost?.probability,      predictions.cost?.risk_level,      predictions.cost?.will_overrun ? "ALERT" : "OK"],
    ["Schedule Delay",     predictions.delay?.probability,     predictions.delay?.risk_level,     predictions.delay?.will_be_delayed ? "ALERT" : "OK"],
    ["Safety Risk",        predictions.safety?.probability,    predictions.safety?.risk_level,    predictions.safety?.severe_risk ? "ALERT" : "OK"],
    ["Equipment Failure",  predictions.equipment?.probability, predictions.equipment?.risk_level, predictions.equipment?.will_fail ? "ALERT" : "OK"],
    ["Workforce Turnover", predictions.turnover?.probability,  predictions.turnover?.risk_level,  predictions.turnover?.will_leave ? "ALERT" : "OK"],
  ];

  doc.setFont("helvetica", "normal");
  rows.forEach(([label, prob, level, status], i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
    doc.text(String(label), M + 2, y + 5.5);
    doc.text(`${prob}%`, M + 62, y + 5.5);
    doc.text(String(level), M + 100, y + 5.5);
    const isAlert = status === "ALERT";
    doc.setTextColor(isAlert ? 185 : 22, isAlert ? 28 : 163, isAlert ? 28 : 74);
    doc.text(String(status), M + 130, y + 5.5);
    doc.setTextColor(15, 23, 42);
    y += 8;
  });

  y += 8;

  // AI Analysis sections
  const sections = [
    {
      title: "Executive Summary",
      body: `This Predictive Analytics Report for ${projectName} is computed from live Supabase data — ` +
        `schedule tasks (${predictions.meta?.tasks || 0} tracked), equipment records (${predictions.meta?.equipment || 0} units), ` +
        `workforce records (${predictions.meta?.workforce || 0}), and safety incident logs (${predictions.meta?.incidents || 0}). ` +
        `Overall project risk is classified as ${rLevel(Math.max(predictions.cost?.probability || 0, predictions.delay?.probability || 0, predictions.safety?.probability || 0))}. ` +
        `The highest risk domain is ${
          predictions.cost?.probability > predictions.delay?.probability &&
          predictions.cost?.probability > predictions.safety?.probability ? "Cost Overrun" :
          predictions.delay?.probability > predictions.safety?.probability ? "Schedule Delay" : "Safety"
        } at ${Math.max(predictions.cost?.probability || 0, predictions.delay?.probability || 0, predictions.safety?.probability || 0)}%.`
    },
    {
      title: "Cost Overrun Analysis",
      body: `A rule-based risk score computed a probability of ${predictions.cost?.probability}% for budget overrun, ` +
        `classifying this project as ${predictions.cost?.risk_level} risk. This was derived from ${predictions.meta?.changeOrders || 0} open RFIs (change-order proxy), ` +
        `active workforce count, real material price trend data, and weather-related incident counts — all pulled live from this project's records. ` +
        (predictions.cost?.will_overrun
          ? `An overrun of approximately ${predictions.cost?.estimated_overrun_pct}% above baseline budget is estimated. ` +
            `Review procurement channels and the change order pipeline.`
          : `Current indicators suggest the project is tracking within budget. Continue monitoring procurement variance and change order velocity.`)
    },
    {
      title: "Schedule Delay Analysis",
      body: `${predictions.delay?.probability}% of this project's tracked tasks are currently delayed (${predictions.delay?.risk_level} risk), ` +
        `averaging ${(predictions.delay as any)?.avgDelayDays || 0} days of overrun per delayed task, across ${predictions.meta?.tasks || 0} tracked activities. ` +
        (predictions.delay?.will_be_delayed
          ? `This is a live measured delay rate, not a forecast. Critical path acceleration, resource augmentation, or fast-tracking parallel activities is advised.`
          : `Schedule appears to be progressing within acceptable variance bands. No intervention recommended at this time.`)
    },
    {
      title: "Safety Risk Analysis",
      body: `Safety risk is ${predictions.safety?.probability}% (${predictions.safety?.risk_level} risk), the inverse of this project's live safety score, ` +
        `derived from ${predictions.meta?.incidents || 0} recorded safety incidents and their severity. ` +
        (predictions.safety?.severe_risk
          ? `Elevated risk flag triggered. Site safety audit, enhanced PPE enforcement, and toolbox talks are recommended.`
          : `Safety metrics are within manageable bounds. Maintain current safety protocols and continue regular incident reporting cadence.`)
    },
    {
      title: "Equipment Failure Analysis",
      body: `Equipment risk is ${predictions.equipment?.probability}% (${predictions.equipment?.risk_level} risk), the inverse of this project's live average equipment health score, ` +
        `computed across ${predictions.meta?.equipment || 0} tracked equipment units. ` +
        (predictions.equipment?.will_fail
          ? `Preventive maintenance intervention is recommended for low-health units. Equipment downtime could cascade to schedule delays.`
          : `Equipment fleet is operating within healthy parameters. Continue scheduled maintenance and health monitoring.`)
    },
    {
      title: "Methodology",
      body: `Cost overrun risk is a rule-based score (not a trained model) computed from this project's real RFI, workforce, ` +
        `and material-price data. Delay, Safety, and Equipment risk are live measured rates from this project's actual Supabase records — ` +
        `not forward-looking model predictions. Workforce Turnover risk is this project's current turnover rate. ` +
        `These are current-state risk indicators, not probabilistic forecasts, and should be supplemented with domain expertise and site-specific knowledge. ` +
        `Risk thresholds: Low (<40%), Medium (40–70%), High (>70%). A separately hosted trained-model service (XGBoost/Random Forest, plus a GNN for cross-project risk propagation) ` +
        `exists for scenario-style what-if predictions but is not yet wired into this per-project view — see the MLOps tab for its status.`
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
    lines.forEach((line: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, M, y); y += 5;
    });
    y += 6;
  });

  if (allProjectPredictions && allProjectPredictions.length > 1) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 64, 175);
    doc.text("Portfolio — All Projects", M, y); y += 8;

    doc.setFillColor(239, 246, 255);
    doc.rect(M, y, pw - M * 2, 8, "F");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Project", M + 2, y + 5.5);
    doc.text("Cost", M + 70, y + 5.5);
    doc.text("Delay", M + 90, y + 5.5);
    doc.text("Safety", M + 110, y + 5.5);
    doc.text("Equip", M + 130, y + 5.5);
    doc.text("Overall", M + 150, y + 5.5);
    y += 8;

    doc.setFont("helvetica", "normal");
    allProjectPredictions.forEach(({ name, preds }, i) => {
      if (y > 260) { doc.addPage(); y = 20; }
      if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
      const overall = Math.max(
        preds.cost?.probability || 0, preds.delay?.probability || 0,
        preds.safety?.probability || 0
      );
      doc.setTextColor(15, 23, 42);
      doc.text(name.substring(0, 25), M + 2, y + 5.5);
      doc.text(`${preds.cost?.probability}%`, M + 70, y + 5.5);
      doc.text(`${preds.delay?.probability}%`, M + 90, y + 5.5);
      doc.text(`${preds.safety?.probability}%`, M + 110, y + 5.5);
      doc.text(`${preds.equipment?.probability}%`, M + 130, y + 5.5);
      doc.setTextColor(overall > 70 ? 185 : overall > 40 ? 194 : 22, overall > 70 ? 28 : overall > 40 ? 65 : 163, overall > 70 ? 28 : overall > 40 ? 12 : 74);
      doc.text(`${overall}%`, M + 150, y + 5.5);
      y += 8;
    });
  }

  doc.save(`predictive-analytics-${projectName.replace(/\s+/g, "-")}-${Date.now()}.pdf`);
}

/* ─── component ───────────────────────────────────────────────── */

export default function PredictivePage() {
  const [projects, setProjects]             = useState<any[]>([]);
  const [projectId, setProjectId]           = useState("");
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [loading, setLoading]               = useState(false);
  const [predictions, setPredictions]       = useState<{ [key: string]: any }>({});
  const [forecastData, setForecastData]     = useState<any[]>([]);
  const [riskTimeline, setRiskTimeline]     = useState<any[]>([]);
  const [summaryOpen, setSummaryOpen]       = useState(false);
  const [isPortfolio, setIsPortfolio]       = useState(false);
  const [allProjectPredictions, setAllProjectPredictions] = useState<{ name: string; preds: any; project: any }[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult]   = useState("");

  useEffect(() => { fetchProjects(); }, []);

  const runCompare = async () => {
    if (allProjectPredictions.length < 2) return;
    setCompareLoading(true);
    setCompareResult("");
    try {
      const items = allProjectPredictions.slice(0, 8).map(({ name, preds }) => ({
        name,
        data: {
          cost_risk_pct: preds.cost?.probability,
          delay_risk_pct: preds.delay?.probability,
          safety_risk_pct: preds.safety?.probability,
          equipment_risk_pct: preds.equipment?.probability,
          turnover_risk_pct: preds.turnover?.probability,
        },
      }));
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/compare`, {
        context: "Predictive Analytics project risk",
        items,
      });
      setCompareResult(res.data.response);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "AI comparison failed");
    } finally { setCompareLoading(false); }
  };

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const fetchProjectRecord = async (pid: string) => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${pid}`);
      return res.data.project ?? null;
    } catch { return null; }
  };

  useEffect(() => {
    if (!projectId) return;
    if (projectId === "all") runPortfolio();
    else runPredictions();
  }, [projectId]);

  const runPredictions = async () => {
    setLoading(true);
    setIsPortfolio(false);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL;
      const [projRecord, preds] = await Promise.all([
        fetchProjectRecord(projectId),
        fetchPredictions(api, projectId),
      ]);
      if (projRecord) setSelectedProject(projRecord);
      const proj = projRecord ?? selectedProject;
      setPredictions(preds);
      buildForecastAndTimeline(preds, proj);
    } finally { setLoading(false); }
  };

  const runPortfolio = async () => {
    setPortfolioLoading(true);
    setIsPortfolio(true);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL;
      const results = await Promise.all(
        projects.slice(0, 10).map(async (proj) => {
          const preds = await fetchPredictions(api, proj.id);
          return { name: proj.name, preds, project: proj };
        })
      );
      setAllProjectPredictions(results);
      // Aggregate predictions
      const avg = (key: string) => results.reduce((s, r) => s + (r.preds[key]?.probability || 0), 0) / results.length;
      const aggPreds = {
        cost:      { probability: +avg("cost").toFixed(1),      risk_level: rLevel(avg("cost")),      will_overrun:     avg("cost") > 50,  estimated_overrun_pct: +(Math.max(0, (avg("cost") - 40) * 0.35)).toFixed(1) },
        delay:     { probability: +avg("delay").toFixed(1),     risk_level: rLevel(avg("delay")),     will_be_delayed:  avg("delay") > 45 },
        safety:    { probability: +avg("safety").toFixed(1),    risk_level: rLevel(avg("safety")),    severe_risk:      avg("safety") > 60 },
        equipment: { probability: +avg("equipment").toFixed(1), risk_level: rLevel(avg("equipment")), will_fail:        avg("equipment") > 50 },
        turnover:  { probability: +avg("turnover").toFixed(1),  risk_level: rLevel(avg("turnover")),  will_leave:       avg("turnover") > 45 },
        meta: { tasks: 0, equipment: 0, incidents: 0, workforce: 0, changeOrders: 0 },
      };
      setPredictions(aggPreds);
      buildForecastAndTimeline(aggPreds, null);
    } finally { setPortfolioLoading(false); }
  };

  const buildForecastAndTimeline = (preds: any, project: any) => {
    const budget = project?.total_budget || 5000000;
    const spent  = project?.spent_to_date || budget * 0.4;
    const spendRate = spent / 6;
    setForecastData(Array.from({ length: 12 }, (_, i) => {
      const month   = new Date(2024, i, 1).toLocaleDateString("en", { month: "short" });
      const planned = Math.round(budget * ((i + 1) / 12) / 1000);
      const actual    = i <= 5 ? Math.round((spent + spendRate * (i - 5)) / 1000) : null;
      const predicted = i >= 5 ? Math.round((spent + spendRate * (1 + (preds.cost?.will_overrun ? 0.12 : 0.02)) * (i - 5)) / 1000) : null;
      return { month, planned, actual, predicted };
    }));
    setRiskTimeline(Array.from({ length: 6 }, (_, i) => ({
      month:         new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en", { month: "short" }),
      costRisk:      Math.min(99, Math.round((preds.cost?.probability || 0)      + i * 2)),
      scheduleRisk:  Math.min(99, Math.round((preds.delay?.probability || 0)     + i * 1.5)),
      safetyRisk:    Math.min(99, Math.round((preds.safety?.probability || 0)    + i * 0.5)),
      equipmentRisk: Math.min(99, Math.round((preds.equipment?.probability || 0) + i * 2.5)),
    })));
  };

  const getRiskColor = (p: number) => p > 70 ? "text-red-400" : p > 50 ? "text-orange-400" : p > 30 ? "text-yellow-400" : "text-emerald-400";
  const getRiskBg    = (p: number) => p > 70 ? "border-red-500/30 bg-red-500/5" : p > 50 ? "border-orange-500/30 bg-orange-500/5" : p > 30 ? "border-yellow-500/30 bg-yellow-500/5" : "border-emerald-500/30 bg-emerald-500/5";
  // Same probability→accent mapping as getRiskColor/getRiskBg, expressed as ACCENT-recipe
  // objects for the KPI cards that need inline style (background/border/shadow), not classNames.
  const getRiskAccent = (p: number) => p > 70 ? ACCENT.red : p > 50 ? ACCENT.orange : p > 30 ? ACCENT.amber : ACCENT.green;

  const hasPredictions = Object.keys(predictions).length > 0;
  const isLoading      = loading || portfolioLoading;
  const projectName    = isPortfolio ? "All Projects (Portfolio)" : selectedProject?.name || "—";

  const maxRisk = hasPredictions ? Math.max(
    predictions.cost?.probability || 0, predictions.delay?.probability || 0,
    predictions.safety?.probability || 0
  ) : 0;

  // Portfolio bar chart data
  const portfolioChartData = allProjectPredictions.map(({ name, preds }) => ({
    name: name.length > 14 ? name.slice(0, 12) + "…" : name,
    cost:  preds.cost?.probability  || 0,
    delay: preds.delay?.probability || 0,
    safety:preds.safety?.probability|| 0,
  }));

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={ANALYTICS_TABS} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Predictive Analytics</h1>
          <p className="text-white/35 text-sm mt-1">
            Live risk indicators from your project data · Cost · Delay · Safety · Equipment · Turnover
            {isPortfolio && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">Portfolio View — {projects.length} projects</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass + " cursor-pointer w-auto"} style={inputStyle}>
              <option value="all" style={{ background: "#0A1628" }}>🌐 All Projects (Portfolio)</option>
              {projects.map(p => <option key={p.id} value={p.id} style={{ background: "#0A1628" }}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => projectId === "all" ? runPortfolio() : runPredictions()} disabled={isLoading}
            className={primaryBtn} style={primaryBtnStyle}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {isLoading ? "Predicting…" : "Run Predictions"}
          </button>
          {hasPredictions && (
            <button
              onClick={() => exportToPDF(predictions, projectName, forecastData, isPortfolio ? allProjectPredictions : undefined)}
              className={ghostBtn} style={ghostBtnStyle}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          {hasPredictions && !summaryOpen && (
            <button onClick={() => setSummaryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-cyan-400 text-sm hover:scale-105 transition-all"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
              <Sparkles className="w-4 h-4" /> AI Summary
            </button>
          )}
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
          <p className="text-white/40">
            {isPortfolio ? `Analyzing ${projects.length} projects…` : "Fetching live risk data for your project…"}
          </p>
          {isPortfolio && (
            <div className="flex gap-2 flex-wrap justify-center">
              {projects.slice(0, 6).map(p => (
                <span key={p.id} className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 animate-pulse">{p.name}</span>
              ))}
            </div>
          )}
        </div>
      ) : hasPredictions ? (
        <>
          {/* ML Prediction Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {[
              { key: "cost",      label: "Cost Overrun",       icon: DollarSign, prob: predictions.cost?.probability,      detail: predictions.cost?.will_overrun     ? `+${predictions.cost?.estimated_overrun_pct?.toFixed(1)}% overrun` : "Within budget" },
              { key: "delay",     label: "Schedule Delay",     icon: Calendar,   prob: predictions.delay?.probability,     detail: predictions.delay?.will_be_delayed  ? "Delay likely"     : "On schedule" },
              { key: "safety",    label: "Safety Risk",        icon: Shield,     prob: predictions.safety?.probability,    detail: predictions.safety?.severe_risk     ? "High severity"    : "Manageable" },
              { key: "equipment", label: "Equipment Failure",  icon: Wrench,     prob: predictions.equipment?.probability, detail: predictions.equipment?.will_fail    ? "Service needed"   : "Operating well" },
              { key: "turnover",  label: "Staff Turnover",     icon: Users,      prob: predictions.turnover?.probability,  detail: predictions.turnover?.will_leave    ? "Retention risk"   : "Staff stable" },
            ].map((pred, i) => {
              const a = getRiskAccent(pred.prob || 0);
              return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }}
                className="glass-card p-4" style={{ borderColor: a.border, background: a.bg }}>
                <div className="flex items-center justify-between mb-3">
                  <pred.icon className="w-5 h-5" style={{ color: a.text }} />
                  <span className="text-xs font-bold" style={{ color: a.text }}>
                    {predictions[pred.key]?.risk_level || "—"}
                  </span>
                </div>
                <p className="text-xs text-white/40 mb-1">{pred.label}</p>
                <p className="text-3xl font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>
                  {pred.prob?.toFixed(0) || 0}%
                </p>
                <p className="text-xs text-white/40 mt-1">{pred.detail}</p>
                <div className="mt-2 rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pred.prob || 0}%` }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.8 }}
                    className="h-1.5 rounded-full"
                    style={{ background: a.text, boxShadow: `0 0 8px ${a.shadow}` }}
                  />
                </div>
              </motion.div>
              );
            })}
          </div>

          {/* Portfolio table */}
          {isPortfolio && allProjectPredictions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-semibold text-white">Portfolio Risk Overview</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">{allProjectPredictions.length} projects</span>
                </div>
                <button onClick={runCompare} disabled={compareLoading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-colors disabled:opacity-60">
                  {compareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {compareLoading ? "Comparing…" : "AI Compare Projects"}
                </button>
              </div>
              {compareResult && (
                <div className="mb-6 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-cyan-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI Comparison</p>
                    <button onClick={() => setCompareResult("")} className="text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{compareResult}</p>
                </div>
              )}
              {/* Per-project table */}
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="text-left pb-2 pr-4">Project</th>
                      <th className="text-center pb-2 px-3">Cost</th>
                      <th className="text-center pb-2 px-3">Delay</th>
                      <th className="text-center pb-2 px-3">Safety</th>
                      <th className="text-center pb-2 px-3">Equipment</th>
                      <th className="text-center pb-2 px-3">Turnover</th>
                      <th className="text-center pb-2 pl-3">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allProjectPredictions.map(({ name, preds }, i) => {
                      const overall = Math.max(
                        preds.cost?.probability || 0, preds.delay?.probability || 0,
                        preds.safety?.probability || 0
                      );
                      return (
                        <tr key={i} className="transition-colors hover:bg-white/5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="py-2.5 pr-4 font-medium text-white">{name}</td>
                          {[preds.cost?.probability, preds.delay?.probability, preds.safety?.probability, preds.equipment?.probability, preds.turnover?.probability].map((v, j) => (
                            <td key={j} className={`text-center py-2.5 px-3 text-xs font-semibold ${getRiskColor(v || 0)}`}>{v?.toFixed(0)}%</td>
                          ))}
                          <td className={`text-center py-2.5 pl-3 text-sm font-bold ${getRiskColor(overall)}`}>{overall.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Portfolio chart */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={portfolioChartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                  <Bar dataKey="cost"  fill="#EF4444" radius={[3, 3, 0, 0]} name="Cost Risk %" />
                  <Bar dataKey="delay" fill="#F59E0B" radius={[3, 3, 0, 0]} name="Delay Risk %" />
                  <Bar dataKey="safety"fill="#3B82F6" radius={[3, 3, 0, 0]} name="Safety Risk %" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {[{ color: "bg-red-400", label: "Cost" }, { color: "bg-orange-400", label: "Delay" }, { color: "bg-blue-400", label: "Safety" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${l.color}`} /><span className="text-xs text-white/40">{l.label}</span></div>
                ))}
              </div>
            </motion.div>
          )}

          {/* AI Verbose Summary */}
          {summaryOpen && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card overflow-hidden" style={{ borderColor: "rgba(0,212,255,0.22)" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">AI Analytics Summary</p>
                  <p className="text-xs text-white/40">Verbose technical + plain-language report</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getRiskBg(maxRisk)} ${getRiskColor(maxRisk)}`}>
                  {rLevel(maxRisk)} Risk
                </span>
              </div>
              <button onClick={() => setSummaryOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-5 text-sm leading-relaxed">
                    {/* Executive Summary */}
                    <div className="pt-5">
                      <p className="font-bold text-base text-white mb-2">Executive Summary</p>
                      <p className="text-white/40">
                        This Predictive Analytics Report for <strong className="text-white">{projectName}</strong> is
                        computed live from this {isPortfolio ? "portfolio's" : "project's"} own{" "}
                        <strong className="text-white">Supabase</strong> records — schedule task delays,
                        equipment health scores, workforce records, safety incidents, RFIs, and material price trends.
                        Cost overrun risk is a rule-based score; Delay, Safety, Equipment, and Turnover risk are
                        this {isPortfolio ? "portfolio's" : "project's"} live measured rates, not model forecasts (see Methodology below).
                        {" "}Overall, this {isPortfolio ? "portfolio" : "project"} presents a{" "}
                        <strong className={`${getRiskColor(maxRisk)}`}>{rLevel(maxRisk)} risk profile</strong>{" "}
                        with a peak risk score of <strong className="text-white">{maxRisk.toFixed(0)}%</strong>.
                        {isPortfolio && ` This represents the average across ${allProjectPredictions.length} active projects.`}
                      </p>
                    </div>

                    {/* Cost */}
                    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-cyan-400" />
                        Cost Overrun Analysis
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRiskBg(predictions.cost?.probability || 0)} ${getRiskColor(predictions.cost?.probability || 0)}`}>
                          {predictions.cost?.probability}% · {predictions.cost?.risk_level}
                        </span>
                      </p>
                      <p className="text-white/40">
                        A <strong className="text-white">rule-based risk score</strong> (not a trained model) returned a
                        probability of <strong className="text-white">{predictions.cost?.probability}%</strong> for
                        budget exceedance, classifying this {isPortfolio ? "portfolio" : "project"} as{" "}
                        <strong className={getRiskColor(predictions.cost?.probability || 0)}>{predictions.cost?.risk_level} risk</strong>.
                        {" "}This figure was derived from <strong className="text-white">open RFI count</strong>{" "}
                        (change-order proxy), <strong className="text-white">active workforce size</strong>,
                        real material price trend data, and weather-related incident counts — all live from this project's own records.
                        {predictions.cost?.will_overrun
                          ? <> A budget overrun of approximately <strong className="text-red-400">{predictions.cost?.estimated_overrun_pct}%</strong> above
                            the baseline is predicted. Immediate review of the procurement pipeline, change order approval velocity,
                            and material cost variance is strongly recommended. Projects in this risk band historically see
                            overruns of 8–22% without intervention.</>
                          : <> Current spend trajectory and change-order patterns suggest the project remains{" "}
                            <strong className="text-emerald-400">within budget</strong>. Continue monitoring procurement variance
                            and ensure change orders do not accumulate beyond the 5% threshold.</>
                        }
                      </p>
                    </div>

                    {/* Schedule */}
                    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-yellow-400" />
                        Schedule Delay Analysis
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRiskBg(predictions.delay?.probability || 0)} ${getRiskColor(predictions.delay?.probability || 0)}`}>
                          {predictions.delay?.probability}% · {predictions.delay?.risk_level}
                        </span>
                      </p>
                      <p className="text-white/40">
                        <strong className="text-white">{predictions.delay?.probability}%</strong> of this{" "}
                        {isPortfolio ? "portfolio's" : "project's"} tracked tasks are currently delayed ({predictions.delay?.risk_level} risk),
                        averaging <strong className="text-white">{(predictions.delay as any)?.avgDelayDays || 0} days</strong> of
                        overrun per delayed task. This is a live measured rate from actual task records, not a forecast.
                        {" "}Accumulated delays compound exponentially in the final 20% of a project lifecycle due to{" "}
                        <strong className="text-white">critical path compression</strong>.
                        {predictions.delay?.will_be_delayed
                          ? <> A delay outcome is predicted. Recommended interventions include{" "}
                            <strong className="text-white">resource augmentation</strong> on critical-path activities,{" "}
                            <strong className="text-white">fast-tracking</strong> parallel work streams,
                            and immediate schedule re-baselining with stakeholder alignment.</>
                          : <> Schedule variance remains within acceptable tolerances. Maintain current resource allocation
                            and task sequencing. Monitor the <strong className="text-white">critical path buffer</strong> weekly.</>
                        }
                      </p>
                    </div>

                    {/* Safety */}
                    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-red-400" />
                        Safety Risk Analysis
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRiskBg(predictions.safety?.probability || 0)} ${getRiskColor(predictions.safety?.probability || 0)}`}>
                          {predictions.safety?.probability}% · {predictions.safety?.risk_level}
                        </span>
                      </p>
                      <p className="text-white/40">
                        Safety risk stands at{" "}
                        <strong className={getRiskColor(predictions.safety?.probability || 0)}>{predictions.safety?.probability}%</strong>,
                        the inverse of this {isPortfolio ? "portfolio's" : "project's"} live safety score — derived directly from{" "}
                        <strong className="text-white">recorded incident count and severity</strong>.
                        {" "}Open incidents signal systemic process gaps rather than isolated events.
                        {predictions.safety?.severe_risk
                          ? <> A <strong className="text-red-400">HIGH severity flag</strong> has been triggered.
                            Immediate actions required: site safety audit, mandatory{" "}
                            <strong className="text-white">toolbox talks</strong>, enhanced PPE enforcement,
                            and incident root cause analysis. Regulatory notification may be required depending on jurisdiction.</>
                          : <> Safety metrics are within manageable bounds. Maintain current safety protocols,
                            conduct scheduled PPE audits, and ensure all incidents — regardless of severity —
                            are documented with corrective actions within 48 hours.</>
                        }
                      </p>
                    </div>

                    {/* Equipment */}
                    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-orange-400" />
                        Equipment Failure Analysis
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRiskBg(predictions.equipment?.probability || 0)} ${getRiskColor(predictions.equipment?.probability || 0)}`}>
                          {predictions.equipment?.probability}% · {predictions.equipment?.risk_level}
                        </span>
                      </p>
                      <p className="text-white/40">
                        Equipment risk is{" "}
                        <strong className={getRiskColor(predictions.equipment?.probability || 0)}>{predictions.equipment?.probability}%</strong>,
                        the inverse of this {isPortfolio ? "portfolio's" : "project's"} live average equipment health score across{" "}
                        <strong className="text-white">{predictions.meta?.equipment || 0} tracked units</strong>.
                        {" "}Equipment failures in construction projects cascade directly to{" "}
                        <strong className="text-white">schedule delays</strong> (mean 3.2-day impact per failure event)
                        and can trigger safety incidents.
                        {predictions.equipment?.will_fail
                          ? <> Preventive maintenance is <strong className="text-orange-400">urgently recommended</strong>.
                            Prioritize units with health scores below 60% for immediate servicing.
                            Consider equipment rental contingencies to maintain critical-path productivity during downtime.</>
                          : <> Equipment fleet is operating within healthy parameters.
                            Continue scheduled maintenance cadence and health score monitoring.
                            Flag any unit falling below <strong className="text-white">70% health</strong> for early intervention.</>
                        }
                      </p>
                    </div>

                    {/* Turnover */}
                    <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4 text-cyan-400" />
                        Workforce Turnover Analysis
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRiskBg(predictions.turnover?.probability || 0)} ${getRiskColor(predictions.turnover?.probability || 0)}`}>
                          {predictions.turnover?.probability}% · {predictions.turnover?.risk_level}
                        </span>
                      </p>
                      <p className="text-white/40">
                        Workforce turnover risk is{" "}
                        <strong className={getRiskColor(predictions.turnover?.probability || 0)}>{predictions.turnover?.probability}%</strong>,
                        this {isPortfolio ? "portfolio's" : "project's"} live measured turnover rate across{" "}
                        <strong className="text-white">{predictions.meta?.workforce || 0} tracked workers</strong>.
                        {" "}High turnover in construction projects incurs a hidden cost of{" "}
                        <strong className="text-white">15–30% of annual salary per departure</strong> in onboarding
                        and productivity loss, and introduces safety risks from undertrained replacements.
                        {predictions.turnover?.will_leave
                          ? <> Retention risk is elevated. Review{" "}
                            <strong className="text-white">compensation benchmarks</strong> against local market rates,
                            assess workload distribution for burnout indicators, and consider retention bonuses for
                            key personnel on critical-path activities.</>
                          : <> Staff stability is strong. Continue competitive compensation practices
                            and regular engagement check-ins. Monitor overtime rates as a leading indicator
                            of workforce stress.</>
                        }
                      </p>
                    </div>

                    {/* Methodology */}
                    <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
                      <p className="font-bold text-white mb-2 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-cyan-400" />
                        Model Methodology &amp; Confidence
                      </p>
                      <p className="text-white/40">
                        <strong className="text-white">Cost Overrun</strong> is a rule-based risk score (not a trained
                        model) computed from this {isPortfolio ? "portfolio's" : "project's"} real RFI, workforce, and
                        material-price data. <strong className="text-white">Delay, Safety, Equipment, and Turnover</strong> risk
                        are live measured current-state rates from actual Supabase records — not forward-looking predictions.
                        {" "}Risk thresholds: <strong className="text-emerald-400">Low (&lt;40%)</strong>,{" "}
                        <strong className="text-yellow-400">Medium (40–70%)</strong>,{" "}
                        <strong className="text-red-400">High (&gt;70%)</strong>.
                        {" "}All figures are recalculated live each time you run predictions — supplement with domain expertise
                        and site-specific intelligence. A separately hosted trained-model service (XGBoost / Random Forest
                        classifiers, plus a Graph Neural Network for cross-element risk propagation) exists for scenario-style
                        what-if predictions but is not yet wired into this per-project view — see the MLOps tab for its status.
                      </p>
                    </div>
                  </div>
          </motion.div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white mb-1">Cost Forecast</h3>
              <p className="text-xs text-white/40 mb-4">Planned · Actual · AI Predicted ($K)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={forecastData}>
                  <defs>
                    <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                    <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="K" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                  <Area type="monotone" dataKey="planned"   stroke="#3B82F6" fill="url(#pGrad)"  strokeWidth={2} name="Planned ($K)"      connectNulls dot={false} />
                  <Area type="monotone" dataKey="actual"    stroke="#10B981" fill="url(#aGrad)"  strokeWidth={2} name="Actual ($K)"       connectNulls dot={false} />
                  <Area type="monotone" dataKey="predicted" stroke="#EF4444" fill="url(#prGrad)" strokeWidth={2} strokeDasharray="5 5" name="AI Predicted ($K)" connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {[{ color: "bg-blue-400", label: "Planned" }, { color: "bg-emerald-400", label: "Actual" }, { color: "bg-red-400", label: "AI Predicted" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${l.color}`} /><span className="text-xs text-white/40">{l.label}</span></div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white mb-1">Risk Score Timeline</h3>
              <p className="text-xs text-white/40 mb-4">6-month risk forecast by category (%)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={riskTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" label={{ value: "50%", fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(0,212,255,0.2)" }} />
                  <Line type="monotone" dataKey="costRisk"      stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: "#EF4444" }} name="Cost Risk %" />
                  <Line type="monotone" dataKey="scheduleRisk"  stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: "#F59E0B" }} name="Schedule Risk %" />
                  <Line type="monotone" dataKey="safetyRisk"    stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: "#3B82F6" }} name="Safety Risk %" />
                  <Line type="monotone" dataKey="equipmentRisk" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3, fill: "#8B5CF6" }} name="Equipment Risk %" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {[{ color: "bg-red-400", label: "Cost" }, { color: "bg-orange-400", label: "Schedule" }, { color: "bg-blue-400", label: "Safety" }, { color: "bg-amber-400", label: "Equipment" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${l.color}`} /><span className="text-xs text-white/40">{l.label}</span></div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Recommendations */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white">AI Recommendations</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[
                predictions.cost?.will_overrun && {
                  icon: "💰", title: "Cost Control Alert",
                  desc: `${predictions.cost?.estimated_overrun_pct?.toFixed(1)}% overrun predicted. Review procurement and change orders immediately.`,
                  color: "border-red-500/30 bg-red-500/5",
                },
                predictions.delay?.will_be_delayed && {
                  icon: "📅", title: "Schedule Recovery",
                  desc: "Delay predicted. Add resources or fast-track critical path activities.",
                  color: "border-orange-500/30 bg-orange-500/5",
                },
                predictions.safety?.severe_risk && {
                  icon: "🦺", title: "Safety Intervention",
                  desc: "High safety risk. Conduct site audit and toolbox talks immediately.",
                  color: "border-red-500/30 bg-red-500/5",
                },
                predictions.equipment?.will_fail && {
                  icon: "🔧", title: "Equipment Maintenance",
                  desc: "Failure risk high. Schedule preventive maintenance immediately.",
                  color: "border-orange-500/30 bg-orange-500/5",
                },
                predictions.turnover?.will_leave && {
                  icon: "👥", title: "Staff Retention",
                  desc: "High turnover risk. Review compensation and workload distribution.",
                  color: "border-yellow-500/30 bg-yellow-500/5",
                },
                !predictions.cost?.will_overrun && !predictions.delay?.will_be_delayed && {
                  icon: "✅", title: "Project Health Good",
                  desc: "Project performing well. Continue monitoring KPIs and maintain current pace.",
                  color: "border-emerald-500/30 bg-emerald-500/5",
                },
              ].filter(Boolean).map((rec: any, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${rec.color}`}>
                  <span className="text-2xl shrink-0">{rec.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{rec.title}</p>
                    <p className="text-xs text-white/40 mt-1">{rec.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        <div className="text-center py-20">
          <Brain className="w-16 h-16 text-white/15 mx-auto mb-4" />
          <p className="text-lg font-medium text-white mb-2">Ready to Predict</p>
          <p className="text-sm text-white/40 mb-6">Select a project (or All Projects) and run ML predictions</p>
          <button onClick={() => projectId === "all" ? runPortfolio() : runPredictions()}
            className="px-6 py-3 rounded-xl text-white font-medium flex items-center gap-2 mx-auto hover:scale-105 transition-all"
            style={primaryBtnStyle}>
            <Brain className="w-4 h-4" /> Run Predictions
          </button>
        </div>
      )}

      <ModuleChat
        context="Predictive Analytics"
        placeholder="Ask about forecasts, risk predictions, portfolio risk…"
        pageSummaryData={{ predictions, project: projectName, isPortfolio }}
      />
    </div>
  );
}
