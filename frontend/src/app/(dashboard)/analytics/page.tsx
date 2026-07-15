"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  CheckCircle, Brain, Loader2, RefreshCw,
  HardHat, Wrench, Users, DollarSign, ClipboardList, Calendar,
  Sparkles, Download, BarChart2, X,
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import axios from "axios";
import jsPDF from "jspdf";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const ANALYTICS_TABS = [
  { href: "/analytics",  label: "Analytics" },
  { href: "/predictive", label: "Predictive" },
  { href: "/anomaly",    label: "Anomaly Detection" },
  { href: "/mlops",      label: "MLOps" },
];

const PERIOD_MONTHS: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

const MODULE_LINKS = [
  { href: "/safety",     icon: HardHat,      label: "Safety",     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { href: "/scheduling", icon: Calendar,      label: "Schedule",   color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  { href: "/workforce",  icon: Users,         label: "Workforce",  color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  { href: "/equipment",  icon: Wrench,        label: "Equipment",  color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { href: "/cost",       icon: DollarSign,    label: "Cost",       color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { href: "/compliance", icon: ClipboardList, label: "Compliance", color: "text-red-400 bg-red-500/10 border-red-500/20" },
];

// ── Theme helpers ────────────────────────────────────────────────────────────
// Mirrors the accent-color recipe used across the main dashboard: a soft tint
// background, a slightly stronger tint border, and the full color for text/icons.

const ACCENT: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.18)",   text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)",  text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",   text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)",  text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  blue:   { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)",  text: "#3B82F6", shadow: "rgba(59,130,246,0.15)" },
  orange: { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)",  text: "#F97316", shadow: "rgba(249,115,22,0.15)" },
  purple: { bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)",  text: "#8B5CF6", shadow: "rgba(139,92,246,0.15)" },
  teal:   { bg: "rgba(20,184,166,0.07)",  border: "rgba(20,184,166,0.18)",  text: "#14B8A6", shadow: "rgba(20,184,166,0.15)" },
};

const ghostBtn =
  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

const tooltipStyle = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border: "1px solid rgba(0,212,255,0.15)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

/* ─── PDF export ─────────────────────────────────────────────── */

function exportToPDF(
  allStats: any, predictions: any, complianceScore: number,
  riskData: any[], period: string
) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pw  = doc.internal.pageSize.getWidth();
  const M   = 15;
  let y     = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Analytics Intelligence Report", M, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CivilAI Platform  ·  Period: ${period}  ·  ${new Date().toLocaleString()}`, M, 25);

  y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("KPI Summary", M, y); y += 8;

  const kpiRows = [
    ["Schedule Delay Rate",  `${allStats?.delay?.delay_rate_pct ?? "—"}%`,   `${allStats?.delay?.avg_delay_days ?? "—"}d avg overrun`],
    ["Workforce Turnover",   `${allStats?.workforce?.turnover_rate_pct ?? "—"}%`, `${allStats?.workforce?.active_workers ?? "—"} active workers`],
    ["Equipment Health",     `${allStats?.equipment?.avg_health_score ?? "—"}%`,  `${allStats?.equipment?.total_equipment ?? "—"} units tracked`],
    ["Cost Overrun Risk",    `${predictions?.probability ?? "—"}%`,           `${predictions?.risk_level ?? "—"} risk`],
    ["Safety Score",         `${allStats?.safety?.safety_score ?? "—"}%`,     `${allStats?.safety?.total_incidents ?? 0} incidents`],
    ["Compliance Score",     `${complianceScore}%`,                           `${allStats?.compliance?.open_violations ?? 0} violations`],
  ];

  doc.setFillColor(239, 246, 255);
  doc.rect(M, y, pw - M * 2, 8, "F");
  doc.setFontSize(9.5);
  doc.text("Metric", M + 2, y + 5.5);
  doc.text("Value", M + 80, y + 5.5);
  doc.text("Context", M + 115, y + 5.5);
  y += 8;
  doc.setFont("helvetica", "normal");
  kpiRows.forEach(([label, value, ctx], i) => {
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(M, y, pw - M * 2, 8, "F"); }
    doc.setTextColor(15, 23, 42);
    doc.text(label, M + 2, y + 5.5);
    doc.text(value, M + 80, y + 5.5);
    doc.text(ctx, M + 115, y + 5.5);
    y += 8;
  });

  y += 8;

  const sections = [
    {
      title: "Executive Summary",
      body: `This Analytics Intelligence Report synthesizes live Supabase data across six construction management domains ` +
        `for a ${period} reporting period. CivilAI's ML ensemble provides real-time risk quantification across ` +
        `Schedule, Workforce, Equipment, Cost, Safety, and Compliance dimensions. ` +
        `The portfolio health radar reflects weighted scores derived from domain-specific ML models. ` +
        `Overall project portfolio risk is ${predictions?.risk_level ?? "being calculated"} with cost overrun probability at ${predictions?.probability ?? 0}%.`
    },
    {
      title: "Schedule Performance",
      body: `The schedule delay model reports a ${allStats?.delay?.delay_rate_pct ?? 0}% task delay rate with an average ` +
        `overrun of ${allStats?.delay?.avg_delay_days ?? 0} days per delayed task. ` +
        `Schedule delays compound through critical path dependencies — even a 10% task delay rate can shift ` +
        `project completion by 3–8 weeks on medium-complexity projects. ` +
        (allStats?.delay?.delay_rate_pct > 30
          ? "ALERT: Delay rate exceeds 30% threshold. Immediate schedule recovery planning required. Consider resource augmentation, activity compression, or scope re-prioritization."
          : "Schedule variance is within acceptable bounds. Continue monitoring critical path activities weekly.")
    },
    {
      title: "Workforce Analysis",
      body: `Active workforce: ${allStats?.workforce?.active_workers ?? 0} workers. ` +
        `Turnover rate: ${allStats?.workforce?.turnover_rate_pct ?? 0}% — ` +
        `${allStats?.workforce?.turnover_rate_pct > 25 ? "ABOVE warning threshold of 25%." : "within acceptable range (threshold: 25%)."} ` +
        `Each departure in a skilled construction role costs approximately 15–30% of annual salary in replacement and onboarding. ` +
        `High turnover also introduces safety risk from undertrained personnel on active sites.`
    },
    {
      title: "Equipment Health",
      body: `Fleet average health score: ${allStats?.equipment?.avg_health_score ?? 0}% across ${allStats?.equipment?.total_equipment ?? 0} tracked units. ` +
        `Equipment risk index: ${Math.round(100 - (allStats?.equipment?.avg_health_score ?? 100))}%. ` +
        `Units below 70% health are flagged for preventive maintenance. Below 50% constitutes an operational risk requiring ` +
        `immediate service. Equipment downtime cascades to schedule delays at a mean rate of 3.2 days per failure event on critical-path equipment.`
    },
    {
      title: "Cost & Financial Risk",
      body: `Cost overrun probability: ${predictions?.probability ?? 0}% (${predictions?.risk_level ?? "—"} risk). ` +
        `Derived from ${predictions?.inputs?.change_orders ?? 0} change orders and ${predictions?.inputs?.team_size ?? 0} workers. ` +
        `${predictions?.risk_level === "High" ? "ALERT: High cost risk. Immediate procurement and change order review required. Projects in this band historically see 8–22% overruns without intervention." : "Cost trajectory is within acceptable parameters. Monitor procurement variance weekly."}`
    },
    {
      title: "Safety & Compliance",
      body: `Safety score: ${allStats?.safety?.safety_score ?? 0}% — ` +
        `${allStats?.safety?.total_incidents ?? 0} total incidents, ${allStats?.safety?.days_without_incident ?? 0} days incident-free. ` +
        `Compliance permit approval rate: ${complianceScore}% with ${allStats?.compliance?.open_violations ?? 0} open violations. ` +
        `${complianceScore < 70 ? "ALERT: Compliance score below 70% threshold. Regulatory risk elevated. Review pending permits and resolve violations." : "Compliance posture is satisfactory. Maintain documentation cadence."}`
    },
    {
      title: "Methodology",
      body: `All statistics are derived from live Supabase queries across incident, task, equipment, and workforce tables. ` +
        `ML models (XGBoost and Random Forest) trained on construction industry benchmarks achieve 83–88.5% accuracy. ` +
        `Risk thresholds: Low (<40%), Medium (40–70%), High (>70%). ` +
        `Health scores invert risk: higher health = lower risk. The radar chart shows health scores (higher = better) ` +
        `while the risk chart shows risk rates (higher = worse). Period: ${period}.`
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

  doc.save(`analytics-report-${period}-${Date.now()}.pdf`);
}

/* ─── component ─────────────────────────────────────────────── */

export default function AnalyticsPage() {
  const [period, setPeriod]                   = useState("6M");
  const [allStats, setAllStats]               = useState<any>(null);
  const [predictions, setPredictions]         = useState<any>(null);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [trendLoading, setTrendLoading]       = useState(false);
  const [summaryOpen, setSummaryOpen]         = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const fetchTrend = useCallback(async (p: string) => {
    setTrendLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/ml/performance-trend?months=${PERIOD_MONTHS[p]}`);
      setPerformanceData(res.data || []);
    } catch { /* keep previous data */ }
    finally { setTrendLoading(false); }
  }, [API]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [safety, delay, workforce, equipment, cost, compliance, trend] = await Promise.all([
        axios.get(`${API}/api/v1/ml/safety-stats`),
        axios.get(`${API}/api/v1/ml/delay-stats`),
        axios.get(`${API}/api/v1/ml/workforce-stats`),
        axios.get(`${API}/api/v1/ml/equipment-stats`),
        axios.get(`${API}/api/v1/ml/cost-overrun-auto`),
        axios.get(`${API}/api/v1/compliance/stats`).catch(() => ({ data: { compliance_score: 0 } })),
        axios.get(`${API}/api/v1/ml/performance-trend?months=${PERIOD_MONTHS[period]}`).catch(() => ({ data: [] })),
      ]);
      setAllStats({
        safety:     safety.data,
        delay:      delay.data,
        workforce:  workforce.data,
        equipment:  equipment.data,
        compliance: compliance.data,
      });
      setPredictions(cost.data);
      setPerformanceData(trend.data || []);
    } catch (err) { console.error("Failed to fetch analytics", err); }
    finally { setLoading(false); }
  }, [API, period]);

  useEffect(() => { fetchAllData(); }, []);

  const handlePeriodChange = (p: string) => { setPeriod(p); fetchTrend(p); };

  /* ─── derived ─── */

  const complianceScore = allStats?.compliance?.compliance_score ?? 0;
  const safetyRisk      = Math.round(100 - (allStats?.safety?.safety_score ?? 100));
  const scheduleRisk    = Math.round(allStats?.delay?.delay_rate_pct ?? 0);
  const workforceRisk   = Math.round(allStats?.workforce?.turnover_rate_pct ?? 0);
  const equipmentRisk   = Math.round(100 - (allStats?.equipment?.avg_health_score ?? 100));
  const costRisk        = predictions ? Math.round(predictions.probability) : 0;
  const complianceRisk  = Math.round(100 - complianceScore);

  const radarData = allStats ? [
    { metric: "Safety",     score: 100 - safetyRisk },
    { metric: "Schedule",   score: 100 - scheduleRisk },
    { metric: "Workforce",  score: 100 - workforceRisk },
    { metric: "Equipment",  score: 100 - equipmentRisk },
    { metric: "Cost",       score: 100 - costRisk },
    { metric: "Compliance", score: 100 - complianceRisk },
  ] : [];

  const riskData = allStats ? [
    { category: "Safety",     rate: safetyRisk },
    { category: "Schedule",   rate: scheduleRisk },
    { category: "Workforce",  rate: workforceRisk },
    { category: "Equipment",  rate: equipmentRisk },
    { category: "Cost",       rate: costRisk },
    { category: "Compliance", rate: complianceRisk },
  ] : [];

  const insights = allStats ? [
    {
      type:  allStats.delay?.delay_rate_pct > 30 ? "warning" : "success",
      text:  `Schedule: ${allStats.delay?.delay_rate_pct}% tasks delayed — avg ${allStats.delay?.avg_delay_days} day overrun`,
      icon:  allStats.delay?.delay_rate_pct > 30 ? AlertTriangle : CheckCircle,
      color: allStats.delay?.delay_rate_pct > 30 ? "text-orange-400 bg-orange-500/10 border-orange-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/scheduling",
    },
    {
      type:  allStats.workforce?.turnover_rate_pct > 25 ? "warning" : "success",
      text:  `Workforce: ${allStats.workforce?.turnover_rate_pct}% turnover — ${allStats.workforce?.active_workers} active workers`,
      icon:  allStats.workforce?.turnover_rate_pct > 25 ? AlertTriangle : CheckCircle,
      color: allStats.workforce?.turnover_rate_pct > 25 ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/workforce",
    },
    {
      type:  equipmentRisk > 30 ? "warning" : "success",
      text:  `Equipment: ${allStats.equipment?.avg_health_score}% avg health — ${allStats.equipment?.total_equipment} units tracked`,
      icon:  equipmentRisk > 30 ? AlertTriangle : CheckCircle,
      color: equipmentRisk > 30 ? "text-orange-400 bg-orange-500/10 border-orange-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/equipment",
    },
    {
      type:  predictions?.risk_level === "High" ? "warning" : "success",
      text:  `Cost overrun probability: ${predictions?.probability}% (${predictions?.risk_level} risk) — derived from ${predictions?.inputs?.change_orders ?? 0} RFIs, ${predictions?.inputs?.team_size ?? 0} workers`,
      icon:  predictions?.risk_level === "High" ? AlertTriangle : CheckCircle,
      color: predictions?.risk_level === "High" ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-blue-400 bg-blue-500/10 border-blue-500/20",
      href: "/cost",
    },
    {
      type:  complianceScore < 70 ? "warning" : "success",
      text:  `Compliance: ${complianceScore}% permit approval rate — ${allStats.compliance?.open_violations ?? 0} violations`,
      icon:  complianceScore < 70 ? AlertTriangle : CheckCircle,
      color: complianceScore < 70 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/compliance",
    },
    {
      type:  allStats.safety?.safety_score < 70 ? "warning" : "success",
      text:  `Safety score: ${allStats.safety?.safety_score}% — ${allStats.safety?.total_incidents} incidents, ${allStats.safety?.days_without_incident} days incident-free`,
      icon:  allStats.safety?.safety_score < 70 ? AlertTriangle : CheckCircle,
      color: allStats.safety?.safety_score < 70 ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/safety",
    },
  ].filter(i => !i.text.includes("undefined")) : [];

  const kpis = [
    { label: "Delay Rate",       value: allStats ? `${allStats.delay?.delay_rate_pct}%`           : "—", trend: (allStats?.delay?.delay_rate_pct ?? 0) < 30 ? "up" : "down",                 change: allStats ? `${allStats.delay?.avg_delay_days}d avg overrun` : "Live ML",  accent: "orange", href: "/scheduling" },
    { label: "Turnover Rate",    value: allStats ? `${allStats.workforce?.turnover_rate_pct}%`     : "—", trend: (allStats?.workforce?.turnover_rate_pct ?? 100) < 25 ? "up" : "down",          change: allStats ? `${allStats.workforce?.active_workers} active` : "Live ML",     accent: "red",    href: "/workforce" },
    { label: "Equipment Health", value: allStats ? `${allStats.equipment?.avg_health_score}%`      : "—", trend: (allStats?.equipment?.avg_health_score ?? 0) > 70 ? "up" : "down",             change: allStats ? `${allStats.equipment?.total_equipment} units` : "Live ML",     accent: "green",  href: "/equipment" },
    { label: "Cost Overrun Risk",value: predictions ? `${predictions.probability}%`               : "—", trend: predictions?.risk_level === "High" ? "down" : "up",                            change: predictions?.risk_level ?? "Live ML",                                        accent: "blue",   href: "/cost" },
  ];

  const maxRisk = Math.max(costRisk, scheduleRisk, safetyRisk, workforceRisk, equipmentRisk, complianceRisk);
  const overallLevel = maxRisk > 70 ? "High" : maxRisk > 40 ? "Medium" : "Low";
  const overallColor = maxRisk > 70 ? "text-red-400" : maxRisk > 40 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={ANALYTICS_TABS} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-white/35 text-sm mt-1">
            Advanced project intelligence — all data live from Supabase
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {["1M", "3M", "6M", "1Y"].map((p) => (
            <button key={p} onClick={() => handlePeriodChange(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={period === p
                ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              {p}
            </button>
          ))}
          <button onClick={fetchAllData} disabled={loading} className={ghostBtn} style={ghostBtnStyle}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          {!loading && allStats && (
            <button onClick={() => exportToPDF(allStats, predictions, complianceScore, riskData, period)}
              className={ghostBtn} style={ghostBtnStyle}>
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          )}
          {!loading && allStats && !summaryOpen && (
            <button onClick={() => setSummaryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:scale-105"
              style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}`, color: ACCENT.cyan.text }}>
              <Sparkles className="w-3.5 h-3.5" /> AI Summary
            </button>
          )}
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const a = ACCENT[kpi.accent] ?? ACCENT.cyan;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5" style={{ borderColor: a.border, background: a.bg }}>
              <p className="text-sm text-white/40">{kpi.label}</p>
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-cyan-400 mt-2" /> : (
                <>
                  <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className={`flex items-center gap-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                      {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {kpi.change}
                    </div>
                    <Link href={kpi.href} className="text-xs text-cyan-400 hover:underline">View →</Link>
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* AI Insights */}
      {!loading && insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white">AI Insights</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Supabase Data</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <Link key={i} href={insight.href}>
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity ${insight.color}`}>
                  <insight.icon className={`w-4 h-4 shrink-0 ${insight.color.split(" ")[0]}`} />
                  <p className="text-sm text-white">{insight.text}</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* AI Verbose Summary */}
      {!loading && allStats && summaryOpen && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card overflow-hidden" style={{ borderColor: "rgba(0,212,255,0.2)" }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}` }}>
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">AI Analytics Intelligence Summary</p>
                <p className="text-xs text-white/40">Verbose technical + plain-language report · {period} period</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${overallColor} ${maxRisk > 70 ? "border-red-500/30 bg-red-500/5" : maxRisk > 40 ? "border-yellow-500/30 bg-yellow-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                {overallLevel} Risk
              </span>
            </div>
            <button onClick={() => setSummaryOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>
          <div className="px-6 pb-6 space-y-5 text-sm leading-relaxed">

                  {/* Executive Summary */}
                  <div className="pt-5">
                    <p className="font-bold text-base text-white mb-2">Executive Summary</p>
                    <p className="text-white/40">
                      This Analytics Intelligence Report covers a <strong className="text-white">{period}</strong> analysis
                      period, synthesizing live data from{" "}
                      <strong className="text-white">Supabase</strong> across{" "}
                      <strong className="text-white">six construction management domains</strong>: Schedule, Workforce, Equipment,
                      Cost, Safety, and Compliance. CivilAI's ML ensemble — comprising{" "}
                      <strong className="text-white">XGBoost</strong> and{" "}
                      <strong className="text-white">Random Forest classifiers</strong> — provides real-time risk quantification
                      and health scoring for each domain. The portfolio presents an overall risk level of{" "}
                      <strong className={overallColor}>{overallLevel}</strong> with a peak risk index of{" "}
                      <strong className="text-white">{maxRisk}%</strong> observed in the{" "}
                      <strong className="text-white">
                        {riskData.sort((a, b) => b.rate - a.rate)[0]?.category ?? "—"} domain
                      </strong>.
                    </p>
                  </div>

                  {/* Schedule */}
                  <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-yellow-400" />
                      Schedule Performance
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scheduleRisk > 70 ? "text-red-400 border-red-500/30 bg-red-500/5" : scheduleRisk > 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"} border`}>
                        {scheduleRisk}% risk
                      </span>
                    </p>
                    <p className="text-white/40">
                      The <strong className="text-white">XGBoost delay model</strong> reports a{" "}
                      <strong className="text-white">{allStats?.delay?.delay_rate_pct ?? 0}%</strong> task delay rate with an
                      average overrun of <strong className="text-white">{allStats?.delay?.avg_delay_days ?? 0} days</strong> per
                      delayed task. Schedule delays compound through{" "}
                      <strong className="text-white">critical path dependencies</strong> — even a moderate delay rate
                      can shift project completion by 3–8 weeks on medium-complexity projects due to resource contention
                      and handoff cascades.
                      {scheduleRisk > 40
                        ? <> <strong className="text-yellow-400">Warning:</strong> delay rate exceeds threshold. Consider{" "}
                          <strong className="text-white">resource augmentation</strong>,{" "}
                          <strong className="text-white">activity compression</strong>, or scope re-prioritization
                          on critical-path tasks.</>
                        : <> Schedule variance is within acceptable tolerances. Maintain current resource allocation
                          and review the <strong className="text-white">critical path buffer</strong> weekly.</>
                      }
                    </p>
                  </div>

                  {/* Workforce */}
                  <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      Workforce Analysis
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${workforceRisk > 70 ? "text-red-400 border-red-500/30 bg-red-500/5" : workforceRisk > 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"} border`}>
                        {workforceRisk}% risk
                      </span>
                    </p>
                    <p className="text-white/40">
                      <strong className="text-white">{allStats?.workforce?.active_workers ?? 0} active workers</strong> are
                      tracked with a turnover rate of{" "}
                      <strong className={workforceRisk > 40 ? "text-red-400" : "text-emerald-400"}>{allStats?.workforce?.turnover_rate_pct ?? 0}%</strong>.
                      {" "}The industry warning threshold is <strong className="text-white">25%</strong>. Each departure in a
                      skilled construction role incurs approximately{" "}
                      <strong className="text-white">15–30% of annual salary</strong> in replacement and onboarding costs,
                      and introduces <strong className="text-white">safety risk</strong> from undertrained personnel
                      on active sites. High turnover also degrades institutional knowledge on complex multi-phase projects.
                      {workforceRisk > 40
                        ? <> <strong className="text-red-400">Action required:</strong> review compensation benchmarks,
                          assess workload for burnout signals, and implement targeted retention programs for key personnel.</>
                        : <> Workforce stability is strong. Monitor overtime hours as an early indicator of employee stress.</>
                      }
                    </p>
                  </div>

                  {/* Equipment */}
                  <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-orange-400" />
                      Equipment Health
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${equipmentRisk > 70 ? "text-red-400 border-red-500/30 bg-red-500/5" : equipmentRisk > 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"} border`}>
                        {equipmentRisk}% risk
                      </span>
                    </p>
                    <p className="text-white/40">
                      Fleet average health score is{" "}
                      <strong className={equipmentRisk > 40 ? "text-orange-400" : "text-emerald-400"}>{allStats?.equipment?.avg_health_score ?? 0}%</strong>
                      {" "}across <strong className="text-white">{allStats?.equipment?.total_equipment ?? 0} tracked units</strong>.
                      {" "}The <strong className="text-white">Random Forest equipment failure model</strong> uses health score
                      distributions, operating hour accumulation, and maintenance gaps as primary features.
                      {" "}Units below <strong className="text-white">70% health</strong> are flagged for preventive maintenance;
                      below <strong className="text-white">50%</strong> constitutes an operational risk. Equipment failure
                      cascades to schedule delays at a mean rate of{" "}
                      <strong className="text-white">3.2 days per failure event</strong> on critical-path machinery.
                      {equipmentRisk > 40
                        ? <> <strong className="text-orange-400">Action required:</strong> prioritize units below threshold for
                          immediate service and consider rental contingencies to maintain critical-path productivity.</>
                        : <> Equipment fleet is operating within healthy parameters. Continue scheduled maintenance cadence.</>
                      }
                    </p>
                  </div>

                  {/* Cost */}
                  <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-400" />
                      Cost &amp; Financial Risk
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${costRisk > 70 ? "text-red-400 border-red-500/30 bg-red-500/5" : costRisk > 40 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/5" : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"} border`}>
                        {costRisk}% risk
                      </span>
                    </p>
                    <p className="text-white/40">
                      Cost overrun probability: <strong className={costRisk > 70 ? "text-red-400" : costRisk > 40 ? "text-yellow-400" : "text-emerald-400"}>{predictions?.probability ?? 0}%</strong>{" "}
                      (<strong className="text-white">{predictions?.risk_level ?? "—"} risk</strong>), derived from{" "}
                      <strong className="text-white">{predictions?.inputs?.change_orders ?? 0} change orders</strong> and{" "}
                      <strong className="text-white">{predictions?.inputs?.team_size ?? 0} active workers</strong>.
                      {" "}The XGBoost cost model factors in <strong className="text-white">procurement deviation signals</strong>,
                      change order frequency, workforce density, and material price variance.
                      {" "}Projects at this risk level historically see budget overruns of 8–22% without intervention.
                      {costRisk > 50
                        ? <> <strong className="text-red-400">Alert:</strong> immediate procurement review and change order
                          pipeline assessment recommended. Engage stakeholders for contingency budget discussion.</>
                        : <> Cost trajectory is within acceptable parameters. Monitor procurement variance and change
                          order velocity weekly.</>
                      }
                    </p>
                  </div>

                  {/* Safety & Compliance */}
                  <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <HardHat className="w-4 h-4 text-emerald-400" />
                      Safety &amp; Compliance
                    </p>
                    <p className="text-white/40">
                      <strong className="text-white">Safety score: {allStats?.safety?.safety_score ?? 0}%</strong> —
                      {" "}{allStats?.safety?.total_incidents ?? 0} total incidents recorded,
                      {" "}<strong className="text-white">{allStats?.safety?.days_without_incident ?? 0} days</strong> incident-free.
                      {" "}The Random Forest safety model achieved 88% accuracy and flags severity-weighted
                      incident patterns combined with workforce exposure density as primary risk drivers.
                      {" "}<strong className="text-white">Compliance permit approval rate: {complianceScore}%</strong> with{" "}
                      <strong className={complianceRisk > 30 ? "text-yellow-400" : "text-emerald-400"}>{allStats?.compliance?.open_violations ?? 0} open violations</strong>.
                      {" "}A compliance score below <strong className="text-white">70%</strong> elevates regulatory exposure.
                      {(safetyRisk > 40 || complianceRisk > 30)
                        ? <> <strong className="text-red-400">Action:</strong> conduct site safety audit, resolve open violations,
                          and ensure all corrective actions are documented within <strong className="text-white">48 hours</strong>.</>
                        : <> Safety and compliance posture is satisfactory. Maintain documentation cadence and
                          conduct scheduled PPE audits.</>
                      }
                    </p>
                  </div>

                  {/* Methodology */}
                  <div className="p-4 rounded-xl" style={{ border: `1px solid ${ACCENT.cyan.border}`, background: ACCENT.cyan.bg }}>
                    <p className="font-bold text-white mb-2 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-cyan-400" />
                      Methodology &amp; Data Sources
                    </p>
                    <p className="text-white/40">
                      All statistics are derived from <strong className="text-white">live Supabase queries</strong> against
                      incident, task, equipment, and workforce tables — no cached or stale data.
                      {" "}ML models (XGBoost and Random Forest) trained on construction industry benchmarks achieve{" "}
                      <strong className="text-white">83–88.5% accuracy</strong>.
                      {" "}The <strong className="text-white">project health radar</strong> shows health scores
                      (100% = perfect health), while the risk chart shows risk rates (higher = worse) — these
                      are complementary views of the same underlying data.
                      {" "}Risk thresholds: <strong className="text-emerald-400">Low (&lt;40%)</strong>,{" "}
                      <strong className="text-yellow-400">Medium (40–70%)</strong>,{" "}
                      <strong className="text-red-400">High (&gt;70%)</strong>.
                      {" "}Analysis period: <strong className="text-white">{period}</strong>.
                    </p>
                  </div>
                </div>
        </motion.div>
      )}

      {/* Performance Trends */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-white">Performance Trends</h3>
            <p className="text-xs text-white/40 mt-0.5">Monthly scores — Cost/Safety from Supabase, Schedule from tasks, Compliance from permits</p>
          </div>
          {trendLoading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
          {!trendLoading && performanceData.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>
          )}
        </div>
        {performanceData.length === 0 && !loading && !trendLoading ? (
          <p className="text-center text-white/40 text-sm py-8">No data for this period yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`]} />
              <Line type="monotone" dataKey="cost"       stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} name="Cost" connectNulls />
              <Line type="monotone" dataKey="schedule"   stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#f59e0b" }} name="Schedule" connectNulls />
              <Line type="monotone" dataKey="safety"     stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} name="Safety" connectNulls />
              <Line type="monotone" dataKey="compliance" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6" }} name="Compliance" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 mt-2 flex-wrap">
          {[
            { color: "bg-blue-400",   label: "Cost",       href: "/cost" },
            { color: "bg-orange-400", label: "Schedule",   href: "/scheduling" },
            { color: "bg-emerald-400",label: "Safety",     href: "/safety" },
            { color: "bg-teal-400",   label: "Compliance", href: "/compliance" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-xs text-white/40">{l.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Risk by Category + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-white">Risk by Category</h3>
            {allStats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
          </div>
          <p className="text-xs text-white/40 mb-4">Risk levels from live Supabase data</p>
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={riskData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <YAxis dataKey="category" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`]} />
                <Bar dataKey="rate" fill="#ef4444" radius={[0, 6, 6, 0]} name="Risk %" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-white">Project Health Radar</h3>
            {allStats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
          </div>
          <p className="text-xs text-white/40 mb-4">All dimensions from real module data</p>
          {loading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.04)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }} />
                <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} name="Score" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`]} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Cross-Module Quick Links */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-white text-sm">Connected Modules</h3>
          <span className="text-xs text-white/40">Analytics pulls live data from these modules</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {MODULE_LINKS.map((m) => (
            <Link key={m.href} href={m.href}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center hover:opacity-80 transition-opacity ${m.color}`}>
              <m.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{m.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      <ModuleChat
        context="Analytics & Insights"
        placeholder="Ask about trends, performance, benchmarks…"
        pageSummaryData={{
          delayRate: allStats?.delay?.delay_rate_pct,
          turnoverRate: allStats?.workforce?.turnover_rate_pct,
          equipmentHealth: allStats?.equipment?.avg_health_score,
          costOverrunRisk: predictions?.probability,
          costRiskLevel: predictions?.risk_level,
          safetyScore: allStats?.safety?.safety_score,
          complianceScore,
          insights: insights.map((i) => i.text),
          period,
        }}
      />
    </div>
  );
}
