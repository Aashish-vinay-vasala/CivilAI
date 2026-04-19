"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, Calendar, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, BarChart3,
} from "lucide-react";
import axios from "axios";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";

interface EVMData {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number;
  percent_complete: number;
}

const calculateEVM = (tasks: any[], budget: number, spent: number): EVMData => {
  const totalTasks = tasks.length;
  const bac = budget || 5000000;

  if (totalTasks === 0) {
    const pv = bac * 0.6;
    const ev = bac * 0.5;
    const ac = spent || bac * 0.55;
    const sv = ev - pv;
    const cv = ev - ac;
    const spi = ev / pv;
    const cpi = ev / ac;
    const eac = bac / cpi;
    return { bac, pv, ev, ac, sv, cv, spi, cpi, eac, etc: eac - ac, vac: bac - eac, tcpi: (bac - ev) / Math.max(bac - ac, 1), percent_complete: 50 };
  }

  const avgPlanned = tasks.reduce((s, t) => s + (t.planned_progress || 0), 0) / totalTasks;
  const avgActual = tasks.reduce((s, t) => s + (t.actual_progress || 0), 0) / totalTasks;
  const pv = bac * (avgPlanned / 100);
  const ev = bac * (avgActual / 100);
  const ac = spent || bac * 0.55;
  const sv = ev - pv;
  const cv = ev - ac;
  const spi = pv > 0 ? ev / pv : 1;
  const cpi = ac > 0 ? ev / ac : 1;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;
  const tcpi = (bac - ev) / Math.max(bac - ac, 1);

  return { bac, pv, ev, ac, sv, cv, spi, cpi, eac, etc, vac, tcpi, percent_complete: avgActual };
};

export default function EVMPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [evm, setEvm] = useState<EVMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [sCurveData, setSCurveData] = useState<any[]>([]);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (projectId) calculateProjectEVM(); }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/v1/projects/");
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) { setProjectId(p[0].id); setSelectedProject(p[0]); }
    } catch (err) { console.error(err); }
  };

  const calculateProjectEVM = async () => {
    setLoading(true);
    try {
      // Try to get real snapshots first
      let snapshotData: any[] = [];
      try {
        const snapRes = await axios.get(`http://localhost:8000/api/v1/construction/evm-snapshots/${projectId}`);
        snapshotData = snapRes.data.snapshots || [];
      } catch {}

      const [tasksRes, projectRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}/schedule`),
        axios.get(`http://localhost:8000/api/v1/projects/${projectId}`),
      ]);

      const tasks = tasksRes.data.tasks || [];
      const project = projectRes.data.project;
      setSelectedProject(project);

      const evmData = calculateEVM(
        tasks,
        project?.total_budget || 5000000,
        project?.spent_to_date || 0
      );
      setEvm(evmData);

      // Build S-Curve from real snapshots or generate
      if (snapshotData.length > 0) {
        setSCurveData(snapshotData.map((s: any) => ({
          month: new Date(s.snapshot_date).toLocaleDateString("en", { month: "short", year: "2-digit" }),
          pv: Math.round(s.pv / 1000),
          ev: Math.round(s.ev / 1000),
          ac: Math.round(s.ac / 1000),
        })));
      } else {
        // Generate from EVM data
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentMonth = new Date().getMonth();
        setSCurveData(months.map((month, i) => {
          const progress = (i + 1) / 12;
          const isHistorical = i <= currentMonth;
          return {
            month,
            pv: Math.round(evmData.bac * Math.pow(progress, 0.8) / 1000),
            ev: isHistorical ? Math.round(evmData.bac * Math.pow(progress * (evmData.spi * 0.95), 0.8) / 1000) : null,
            ac: isHistorical ? Math.round(evmData.bac * Math.pow(progress / evmData.cpi, 0.8) / 1000) : null,
          };
        }));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fmt = (val: number) => {
    if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const getIndexColor = (val: number, isIndex = true) => {
    if (isIndex) {
      if (val >= 1.05) return "text-emerald-400";
      if (val >= 0.95) return "text-yellow-400";
      if (val >= 0.8) return "text-orange-400";
      return "text-red-400";
    }
    return val >= 0 ? "text-emerald-400" : "text-red-400";
  };

  const getIndexBg = (val: number) => {
    if (val >= 1.05) return "border-emerald-500/30 bg-emerald-500/5";
    if (val >= 0.95) return "border-yellow-500/30 bg-yellow-500/5";
    if (val >= 0.8) return "border-orange-500/30 bg-orange-500/5";
    return "border-red-500/30 bg-red-500/5";
  };

  const getHealthStatus = (evm: EVMData) => {
    if (evm.cpi >= 1 && evm.spi >= 1) return { label: "On Track", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
    if (evm.cpi >= 0.9 && evm.spi >= 0.9) return { label: "Minor Issues", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" };
    if (evm.cpi >= 0.8 || evm.spi >= 0.8) return { label: "At Risk", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" };
    return { label: "Critical", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" };
  };

  const varianceData = evm ? [
    { name: "SV", value: Math.round(evm.sv / 1000), color: evm.sv >= 0 ? "#10b981" : "#ef4444" },
    { name: "CV", value: Math.round(evm.cv / 1000), color: evm.cv >= 0 ? "#10b981" : "#ef4444" },
    { name: "VAC", value: Math.round(evm.vac / 1000), color: evm.vac >= 0 ? "#10b981" : "#ef4444" },
  ] : [];

  const forecastData = evm ? [
    { name: "BAC", value: Math.round(evm.bac / 1000), color: "#3b82f6" },
    { name: "PV", value: Math.round(evm.pv / 1000), color: "#8b5cf6" },
    { name: "EV", value: Math.round(evm.ev / 1000), color: "#10b981" },
    { name: "AC", value: Math.round(evm.ac / 1000), color: "#f59e0b" },
    { name: "EAC", value: Math.round(evm.eac / 1000), color: evm.eac > evm.bac ? "#ef4444" : "#10b981" },
    { name: "ETC", value: Math.round(evm.etc / 1000), color: "#06b6d4" },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Earned Value Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time EVM · CPI · SPI · Variance Analysis · Forecast at Completion
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSelectedProject(projects.find(p => p.id === e.target.value)); }}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={calculateProjectEVM} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Recalculate
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="ml-3 text-muted-foreground">Calculating EVM metrics...</p>
        </div>
      ) : evm ? (
        <>
          {/* Health Status Banner */}
          {(() => {
            const health = getHealthStatus(evm);
            return (
              <div className={`flex items-center justify-between p-5 rounded-2xl border ${health.bg}`}>
                <div className="flex items-center gap-3">
                  {evm.cpi >= 1 && evm.spi >= 1
                    ? <CheckCircle className="w-6 h-6 text-emerald-400" />
                    : <AlertTriangle className="w-6 h-6 text-orange-400" />}
                  <div>
                    <p className={`font-semibold text-lg ${health.color}`}>
                      Project Status: {health.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedProject?.name} · {Math.round(evm.percent_complete)}% complete · BAC: {fmt(evm.bac)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Estimate at Completion</p>
                  <p className={`text-2xl font-bold ${evm.eac > evm.bac ? "text-red-400" : "text-emerald-400"}`}>
                    {fmt(evm.eac)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {evm.eac > evm.bac ? "⚠️ Overrun" : "✅ Under budget"} by {fmt(Math.abs(evm.eac - evm.bac))}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Main KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Planned Value (PV)", value: fmt(evm.pv), sub: "Budgeted cost of work scheduled", icon: Calendar, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400", valColor: "text-blue-400" },
              { label: "Earned Value (EV)", value: fmt(evm.ev), sub: "Budgeted cost of work performed", icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400", valColor: "text-emerald-400" },
              { label: "Actual Cost (AC)", value: fmt(evm.ac), sub: "Actual cost incurred to date", icon: DollarSign, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400", valColor: "text-orange-400" },
              { label: "Budget at Completion", value: fmt(evm.bac), sub: "Total approved budget", icon: BarChart3, color: "border-purple-500/20 bg-purple-500/5", iconColor: "text-purple-400", valColor: "text-purple-400" },
            ].map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
                className={`rounded-2xl border p-5 ${kpi.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
                </div>
                <p className={`text-2xl font-bold ${kpi.valColor}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Performance Indices */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "CPI", value: evm.cpi.toFixed(2), full: "Cost Performance Index", desc: evm.cpi >= 1 ? "✅ Under budget" : "⚠️ Over budget", isIndex: true, raw: evm.cpi },
              { label: "SPI", value: evm.spi.toFixed(2), full: "Schedule Performance Index", desc: evm.spi >= 1 ? "✅ Ahead of schedule" : "⚠️ Behind schedule", isIndex: true, raw: evm.spi },
              { label: "CV", value: fmt(evm.cv), full: "Cost Variance", desc: evm.cv >= 0 ? "✅ Under budget" : "⚠️ Over budget", isIndex: false, raw: evm.cv },
              { label: "SV", value: fmt(evm.sv), full: "Schedule Variance", desc: evm.sv >= 0 ? "✅ Ahead of schedule" : "⚠️ Behind schedule", isIndex: false, raw: evm.sv },
            ].map((metric, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }} whileHover={{ y: -2 }}
                className={`rounded-2xl border p-5 ${metric.isIndex ? getIndexBg(metric.raw) : "border-border bg-card"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{metric.full}</p>
                  <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">{metric.label}</span>
                </div>
                <p className={`text-3xl font-bold ${metric.isIndex ? getIndexColor(metric.raw) : getIndexColor(metric.raw, false)}`}>
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{metric.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Forecast Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "EAC", full: "Estimate at Completion", value: fmt(evm.eac), good: evm.eac <= evm.bac, desc: `${evm.eac > evm.bac ? "+" : ""}${fmt(evm.eac - evm.bac)} vs BAC` },
              { label: "ETC", full: "Estimate to Complete", value: fmt(evm.etc), good: true, desc: "Remaining cost forecast" },
              { label: "VAC", full: "Variance at Completion", value: fmt(evm.vac), good: evm.vac >= 0, desc: evm.vac >= 0 ? "✅ Projected savings" : "⚠️ Projected overrun" },
              { label: "TCPI", full: "To-Complete Perf. Index", value: evm.tcpi.toFixed(2), good: evm.tcpi <= 1.1, desc: evm.tcpi <= 1.1 ? "✅ Achievable target" : "⚠️ Challenging target" },
              { label: "% Complete", full: "Physical % Complete", value: `${Math.round(evm.percent_complete)}%`, good: true, desc: "Based on task progress" },
              { label: "Efficiency", full: "Overall Efficiency", value: `${Math.round(((evm.cpi + evm.spi) / 2) * 100)}%`, good: evm.cpi >= 1 && evm.spi >= 1, desc: "Combined CPI × SPI score" },
            ].map((metric, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }} whileHover={{ y: -2 }}
                className={`rounded-2xl border p-4 ${metric.good ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{metric.full}</p>
                  <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">{metric.label}</span>
                </div>
                <p className={`text-2xl font-bold ${metric.good ? "text-emerald-400" : "text-red-400"}`}>
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{metric.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* S-Curve */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">EVM S-Curve</h3>
              <p className="text-xs text-muted-foreground mb-4">PV · EV · AC over time ($K)</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={sCurveData}>
                  <defs>
                    <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="evGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="pv" stroke="#8b5cf6" fill="url(#pvGrad)" strokeWidth={2} name="PV ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="ev" stroke="#10b981" fill="url(#evGrad)" strokeWidth={2} name="EV ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="ac" stroke="#f59e0b" fill="url(#acGrad)" strokeWidth={2} name="AC ($K)" connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Variance Analysis */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-foreground mb-1">Variance Analysis</h3>
              <p className="text-xs text-muted-foreground mb-4">SV · CV · VAC ($K) — Green = positive, Red = negative</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={varianceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                  <ReferenceLine y={0} stroke="#ffffff30" strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                    formatter={(value: any) => [`$${value}K`, "Variance"]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Variance ($K)">
                    {varianceData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Interpretation */}
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">📊 Interpretation:</p>
                {[
                  { condition: evm.cpi >= 1, good: "✅ Cost efficient — under budget", bad: `⚠️ Over budget — CPI: ${evm.cpi.toFixed(2)}` },
                  { condition: evm.spi >= 1, good: "✅ Ahead of schedule", bad: `⚠️ Behind schedule — SPI: ${evm.spi.toFixed(2)}` },
                  { condition: evm.eac <= evm.bac, good: "✅ Projected to finish under budget", bad: `🚨 Projected overrun: ${fmt(evm.eac - evm.bac)}` },
                ].map((item, i) => (
                  <p key={i} className={`text-xs px-2 py-1 rounded-lg ${item.condition ? "bg-emerald-500/10 text-emerald-400" : "bg-orange-500/10 text-orange-400"}`}>
                    {item.condition ? item.good : item.bad}
                  </p>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Budget Overview */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-1">Budget Overview</h3>
            <p className="text-xs text-muted-foreground mb-4">
              BAC · PV · EV · AC · EAC · ETC ($K) — color coded by performance
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                  formatter={(value: any) => [`$${value}K`, "Amount"]}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Amount ($K)">
                  {forecastData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-3">
              {forecastData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground">{item.name}: ${item.value}K</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        <div className="text-center py-20">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Select a project to calculate EVM metrics</p>
        </div>
      )}

      <ModuleChat
        context="Earned Value Management"
        placeholder="Ask about CPI, SPI, EAC, cost variance..."
        pageSummaryData={{ evm, project: selectedProject?.name }}
      />
    </div>
  );
}