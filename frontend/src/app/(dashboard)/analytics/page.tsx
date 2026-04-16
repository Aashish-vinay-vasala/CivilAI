"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  Brain,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import axios from "axios";
import ModuleChat from "@/components/shared/ModuleChat";

const performanceData = [
  { month: "Jan", cost: 78, schedule: 82, safety: 88, quality: 85 },
  { month: "Feb", cost: 72, schedule: 78, safety: 90, quality: 87 },
  { month: "Mar", cost: 68, schedule: 75, safety: 85, quality: 82 },
  { month: "Apr", cost: 74, schedule: 80, safety: 92, quality: 89 },
  { month: "May", cost: 70, schedule: 77, safety: 94, quality: 91 },
  { month: "Jun", cost: 76, schedule: 82, safety: 91, quality: 88 },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("6M");
  const [allStats, setAllStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<any>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [safety, delay, workforce, equipment, cost] = await Promise.all([
        axios.get("http://localhost:8000/api/v1/ml/safety-stats"),
        axios.get("http://localhost:8000/api/v1/ml/delay-stats"),
        axios.get("http://localhost:8000/api/v1/ml/workforce-stats"),
        axios.get("http://localhost:8000/api/v1/ml/equipment-stats"),
        axios.post("http://localhost:8000/api/v1/ml/cost-overrun", {
          project_type: "Commercial",
          duration_months: 18,
          team_size: 50,
          change_orders: 8,
          material_price_increase: 15.5,
          weather_impact_days: 10,
          subcontractor_count: 5,
        }),
      ]);

      setAllStats({
        safety: safety.data,
        delay: delay.data,
        workforce: workforce.data,
        equipment: equipment.data,
      });
      setPredictions(cost.data);
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
    }
  };

  const radarData = allStats ? [
    { metric: "Safety", score: Math.round(100 - (allStats.safety?.avg_risk_score || 50)) },
    { metric: "Schedule", score: Math.round(100 - (allStats.delay?.delay_rate_pct || 60)) },
    { metric: "Workforce", score: Math.round(100 - (allStats.workforce?.turnover_rate_pct || 30)) },
    { metric: "Equipment", score: Math.round(allStats.equipment?.avg_health_score || 78) },
    { metric: "Cost", score: predictions ? Math.round(100 - predictions.probability) : 76 },
    { metric: "Compliance", score: 91 },
  ] : [
    { metric: "Safety", score: 94 },
    { metric: "Schedule", score: 82 },
    { metric: "Workforce", score: 79 },
    { metric: "Equipment", score: 78 },
    { metric: "Cost", score: 76 },
    { metric: "Compliance", score: 91 },
  ];

  const riskData = allStats ? [
    { category: "Safety", rate: Math.round(allStats.safety?.avg_risk_score || 50) },
    { category: "Delays", rate: Math.round(allStats.delay?.delay_rate_pct || 60) },
    { category: "Turnover", rate: Math.round(allStats.workforce?.turnover_rate_pct || 30) },
    { category: "Equipment", rate: Math.round(allStats.equipment?.failure_rate_pct || 20) },
    { category: "Cost", rate: predictions ? Math.round(predictions.probability) : 45 },
  ] : [];

  const insights = allStats ? [
    {
      type: allStats.delay?.delay_rate_pct > 50 ? "warning" : "success",
      text: `Project delay rate: ${allStats.delay?.delay_rate_pct}% — avg overrun ${allStats.delay?.avg_cost_overrun_pct}%`,
      icon: allStats.delay?.delay_rate_pct > 50 ? AlertTriangle : CheckCircle,
      color: allStats.delay?.delay_rate_pct > 50
        ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      type: allStats.workforce?.turnover_rate_pct > 25 ? "warning" : "success",
      text: `Workforce turnover: ${allStats.workforce?.turnover_rate_pct}% — avg performance ${Math.round(allStats.workforce?.avg_performance_score)}%`,
      icon: allStats.workforce?.turnover_rate_pct > 25 ? AlertTriangle : CheckCircle,
      color: allStats.workforce?.turnover_rate_pct > 25
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      type: allStats.equipment?.failure_rate_pct > 20 ? "warning" : "success",
      text: `Equipment health: ${allStats.equipment?.avg_health_score}% avg — failure rate ${allStats.equipment?.failure_rate_pct}%`,
      icon: allStats.equipment?.failure_rate_pct > 20 ? AlertTriangle : CheckCircle,
      color: allStats.equipment?.failure_rate_pct > 20
        ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
        : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      type: predictions?.risk_level === "High" ? "warning" : "success",
      text: `Cost overrun probability: ${predictions?.probability}% — ${predictions?.risk_level} risk`,
      icon: predictions?.risk_level === "High" ? AlertTriangle : CheckCircle,
      color: predictions?.risk_level === "High"
        ? "text-red-400 bg-red-500/10 border-red-500/20"
        : "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
  ] : [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Advanced project intelligence & insights
          </p>
        </div>
        <div className="flex gap-2">
          {["1M", "3M", "6M", "1Y"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? "bg-blue-500 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Delay Rate",
            value: allStats ? `${allStats.delay?.delay_rate_pct}%` : "...",
            trend: "down",
            change: "Live ML",
            color: "border-orange-500/20 bg-orange-500/5"
          },
          {
            label: "Turnover Rate",
            value: allStats ? `${allStats.workforce?.turnover_rate_pct}%` : "...",
            trend: "down",
            change: "Live ML",
            color: "border-red-500/20 bg-red-500/5"
          },
          {
            label: "Equipment Health",
            value: allStats ? `${allStats.equipment?.avg_health_score}%` : "...",
            trend: "up",
            change: "Live ML",
            color: "border-emerald-500/20 bg-emerald-500/5"
          },
          {
            label: "Cost Overrun Risk",
            value: predictions ? `${predictions.probability}%` : "...",
            trend: predictions?.risk_level === "High" ? "down" : "up",
            change: predictions?.risk_level || "...",
            color: "border-blue-500/20 bg-blue-500/5"
          },
        ].map((kpi, i) => (
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
                <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                  {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.change}
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
            <h3 className="font-semibold text-foreground">AI Insights — Real Data</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live ML</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className={`flex items-center gap-3 p-3 rounded-xl border ${insight.color}`}
              >
                <insight.icon className={`w-4 h-4 flex-shrink-0 ${insight.color.split(" ")[0]}`} />
                <p className="text-sm text-foreground">{insight.text}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Performance Trends */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">Performance Trends</h3>
            <p className="text-xs text-muted-foreground mt-0.5">All KPIs over time</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={performanceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} name="Cost" />
            <Line type="monotone" dataKey="schedule" stroke="#f59e0b" strokeWidth={2} dot={false} name="Schedule" />
            <Line type="monotone" dataKey="safety" stroke="#10b981" strokeWidth={2} dot={false} name="Safety" />
            <Line type="monotone" dataKey="quality" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Quality" />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          {[
            { color: "bg-blue-400", label: "Cost" },
            { color: "bg-orange-400", label: "Schedule" },
            { color: "bg-emerald-400", label: "Safety" },
            { color: "bg-purple-400", label: "Quality" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Risk + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Risk by Category</h3>
            {allStats && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Real ML dataset risk rates</p>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={riskData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <YAxis dataKey="category" type="category" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
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
            {allStats && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Overall performance across all dimensions</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 12 }} />
              <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <ModuleChat
        context="Analytics & Insights"
        placeholder="Ask about trends, performance, benchmarks..."
        pageSummaryData={{
          delayRate: allStats?.delay?.delay_rate_pct,
          turnoverRate: allStats?.workforce?.turnover_rate_pct,
          equipmentHealth: allStats?.equipment?.avg_health_score,
          costOverrunRisk: predictions?.probability,
          insights: insights.map((i) => i.text),
        }}
      />
    </div>
  );
}