"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  CheckCircle, Brain, Loader2, RefreshCw,
  HardHat, Wrench, Users, DollarSign, ClipboardList, Calendar,
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import axios from "axios";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const ANALYTICS_TABS = [
  { href: "/analytics", label: "Analytics" },
  { href: "/anomaly",   label: "Anomaly Detection" },
  { href: "/mlops",     label: "MLOps" },
];

const PERIOD_MONTHS: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };

const MODULE_LINKS = [
  { href: "/safety",     icon: HardHat,      label: "Safety",     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { href: "/scheduling", icon: Calendar,      label: "Schedule",   color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  { href: "/workforce",  icon: Users,         label: "Workforce",  color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { href: "/equipment",  icon: Wrench,        label: "Equipment",  color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { href: "/cost",       icon: DollarSign,    label: "Cost",       color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { href: "/compliance", icon: ClipboardList, label: "Compliance", color: "text-red-400 bg-red-500/10 border-red-500/20" },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("6M");
  const [allStats, setAllStats]           = useState<any>(null);
  const [predictions, setPredictions]     = useState<any>(null);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [trendLoading, setTrendLoading]   = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const fetchTrend = useCallback(async (p: string) => {
    setTrendLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/ml/performance-trend?months=${PERIOD_MONTHS[p]}`);
      setPerformanceData(res.data || []);
    } catch { /* chart stays with previous data */ }
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
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
    }
  }, [API, period]);

  useEffect(() => { fetchAllData(); }, []);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    fetchTrend(p);
  };

  // ─── Derived data ─────────────────────────────────────────────────────────

  const complianceScore = allStats?.compliance?.compliance_score ?? 0;

  const safetyRisk     = Math.round(100 - (allStats?.safety?.safety_score     ?? 100));
  const scheduleRisk   = Math.round(allStats?.delay?.delay_rate_pct           ?? 0);
  const workforceRisk  = Math.round(allStats?.workforce?.turnover_rate_pct    ?? 0);
  const equipmentRisk  = Math.round(100 - (allStats?.equipment?.avg_health_score ?? 100));
  const costRisk       = predictions ? Math.round(predictions.probability)     : 0;
  const complianceRisk = Math.round(100 - complianceScore);

  // Radar = health scores (higher = better): each dimension = 100 - riskData counterpart
  const radarData = allStats ? [
    { metric: "Safety",     score: 100 - safetyRisk },
    { metric: "Schedule",   score: 100 - scheduleRisk },
    { metric: "Workforce",  score: 100 - workforceRisk },
    { metric: "Equipment",  score: 100 - equipmentRisk },
    { metric: "Cost",       score: 100 - costRisk },
    { metric: "Compliance", score: 100 - complianceRisk },
  ] : [];

  // Risk chart = risk rates (higher = worse): perfectly complementary to radar
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
      color: allStats.delay?.delay_rate_pct > 30
        ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/scheduling",
    },
    {
      type:  allStats.workforce?.turnover_rate_pct > 25 ? "warning" : "success",
      text:  `Workforce: ${allStats.workforce?.turnover_rate_pct}% turnover — ${allStats.workforce?.active_workers} active workers`,
      icon:  allStats.workforce?.turnover_rate_pct > 25 ? AlertTriangle : CheckCircle,
      color: allStats.workforce?.turnover_rate_pct > 25
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/workforce",
    },
    {
      type:  equipmentRisk > 30 ? "warning" : "success",
      text:  `Equipment: ${allStats.equipment?.avg_health_score}% avg health — ${allStats.equipment?.total_equipment} units tracked`,
      icon:  equipmentRisk > 30 ? AlertTriangle : CheckCircle,
      color: equipmentRisk > 30
        ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/equipment",
    },
    {
      type:  predictions?.risk_level === "High" ? "warning" : "success",
      text:  `Cost overrun probability: ${predictions?.probability}% (${predictions?.risk_level} risk) — derived from ${predictions?.inputs?.change_orders ?? 0} RFIs, ${predictions?.inputs?.team_size ?? 0} workers`,
      icon:  predictions?.risk_level === "High" ? AlertTriangle : CheckCircle,
      color: predictions?.risk_level === "High"
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-blue-400 bg-blue-500/10 border-blue-500/20",
      href: "/cost",
    },
    {
      type:  complianceScore < 70 ? "warning" : "success",
      text:  `Compliance: ${complianceScore}% permit approval rate — ${allStats.compliance?.open_violations ?? 0} violations`,
      icon:  complianceScore < 70 ? AlertTriangle : CheckCircle,
      color: complianceScore < 70
        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/compliance",
    },
    {
      type:  allStats.safety?.safety_score < 70 ? "warning" : "success",
      text:  `Safety score: ${allStats.safety?.safety_score}% — ${allStats.safety?.total_incidents} incidents, ${allStats.safety?.days_without_incident} days incident-free`,
      icon:  allStats.safety?.safety_score < 70 ? AlertTriangle : CheckCircle,
      color: allStats.safety?.safety_score < 70
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      href: "/safety",
    },
  ].filter(i => i.text.includes("undefined") === false) : [];

  const kpis = [
    {
      label: "Delay Rate",
      value: allStats ? `${allStats.delay?.delay_rate_pct}%` : "—",
      trend: (allStats?.delay?.delay_rate_pct ?? 0) < 30 ? "up" : "down",
      change: allStats ? `${allStats.delay?.avg_delay_days}d avg overrun` : "Live ML",
      color: "border-orange-500/20 bg-orange-500/5",
      href: "/scheduling",
    },
    {
      label: "Turnover Rate",
      value: allStats ? `${allStats.workforce?.turnover_rate_pct}%` : "—",
      trend: (allStats?.workforce?.turnover_rate_pct ?? 100) < 25 ? "up" : "down",
      change: allStats ? `${allStats.workforce?.active_workers} active` : "Live ML",
      color: "border-red-500/20 bg-red-500/5",
      href: "/workforce",
    },
    {
      label: "Equipment Health",
      value: allStats ? `${allStats.equipment?.avg_health_score}%` : "—",
      trend: (allStats?.equipment?.avg_health_score ?? 0) > 70 ? "up" : "down",
      change: allStats ? `${allStats.equipment?.total_equipment} units` : "Live ML",
      color: "border-emerald-500/20 bg-emerald-500/5",
      href: "/equipment",
    },
    {
      label: "Cost Overrun Risk",
      value: predictions ? `${predictions.probability}%` : "—",
      trend: predictions?.risk_level === "High" ? "down" : "up",
      change: predictions?.risk_level ?? "Live ML",
      color: "border-blue-500/20 bg-blue-500/5",
      href: "/cost",
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={ANALYTICS_TABS} />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Advanced project intelligence — all data live from Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          {["1M", "3M", "6M", "1Y"].map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? "bg-blue-500 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-400 mt-2" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
                <div className={`flex items-center justify-between mt-1`}>
                  <div className={`flex items-center gap-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {kpi.change}
                  </div>
                  <Link href={kpi.href} className="text-xs text-blue-400 hover:underline">View →</Link>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* AI Insights */}
      {!loading && insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Insights</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Supabase Data</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <Link key={i} href={insight.href}>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity ${insight.color}`}
                >
                  <insight.icon className={`w-4 h-4 shrink-0 ${insight.color.split(" ")[0]}`} />
                  <p className="text-sm text-foreground">{insight.text}</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Performance Trends — live from DB */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">Performance Trends</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monthly scores — Cost/Safety from Supabase, Schedule from tasks, Compliance from permits
            </p>
          </div>
          {trendLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
          {!trendLoading && performanceData.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>
          )}
        </div>
        {performanceData.length === 0 && !loading && !trendLoading ? (
          <p className="text-center text-muted-foreground text-sm py-8">No data for this period yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                formatter={(v: any) => [`${v}%`]}
              />
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
            { color: "bg-purple-400", label: "Compliance", href: "/compliance" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="flex items-center gap-1.5 hover:opacity-70 transition-opacity">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Risk by Category + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Risk by Category</h3>
            {allStats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Risk levels from live Supabase data</p>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={riskData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <YAxis dataKey="category" type="category" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                  formatter={(v: any) => [`${v}%`]}
                />
                <Bar dataKey="rate" fill="#ef4444" radius={[0, 6, 6, 0]} name="Risk %" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Project Health Radar</h3>
            {allStats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">All dimensions from real module data</p>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#ffffff08" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 12 }} />
                <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} name="Score" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                  formatter={(v: any) => [`${v}%`]}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Cross-Module Quick Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-foreground text-sm">Connected Modules</h3>
          <span className="text-xs text-muted-foreground">Analytics pulls live data from these modules</span>
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
        placeholder="Ask about trends, performance, benchmarks..."
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
