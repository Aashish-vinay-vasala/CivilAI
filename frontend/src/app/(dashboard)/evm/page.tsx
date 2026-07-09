"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, Calendar, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, BarChart3, Plus, Trash2,
} from "lucide-react";
import axios from "axios";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";
import Sparkline from "@/components/shared/Sparkline";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

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

const calculateEVM = (tasks: any[], budget: number, spent: number): EVMData | null => {
  const totalTasks = tasks.length;
  const bac = budget;

  if (!bac || bac <= 0) return null;
  if (totalTasks === 0) return null;

  // Weight each task's contribution to PV/EV by its budgeted cost share when tasks carry
  // real budgets, normalized back to BAC so total_budget stays the single source of truth
  // even if task budgets don't sum exactly to it. Falls back to a simple average across
  // tasks (equal weighting) for projects that haven't assigned per-task budgets yet.
  const totalBudgeted = tasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
  const hasTaskBudgets = totalBudgeted > 0;

  const avgPlanned = tasks.reduce((s, t) => s + (t.planned_progress || 0), 0) / totalTasks;
  const avgActual = tasks.reduce((s, t) => s + (t.actual_progress || 0), 0) / totalTasks;
  const pv = hasTaskBudgets
    ? tasks.reduce((s, t) => s + (Number(t.budget) || 0) * ((t.planned_progress || 0) / 100), 0) * (bac / totalBudgeted)
    : bac * (avgPlanned / 100);
  const ev = hasTaskBudgets
    ? tasks.reduce((s, t) => s + (Number(t.budget) || 0) * ((t.actual_progress || 0) / 100), 0) * (bac / totalBudgeted)
    : bac * (avgActual / 100);
  const ac = spent; // real actual cost — $0 is a legitimate value when no cost entries exist yet
  const sv = ev - pv;
  const cv = ev - ac;
  const spi = pv > 0 ? ev / pv : 1;
  const cpi = ac > 0 ? ev / ac : 1;
  const eac = cpi > 0 ? bac / cpi : bac;
  const etc = eac - ac;
  const vac = bac - eac;
  const tcpi = (bac - ev) / Math.max(bac - ac, 1); // floor = $1, avoids divide-by-zero when AC reaches BAC

  // Physical % complete is EV/BAC by definition — equals avgActual in the unweighted
  // fallback case, and the real budget-weighted progress once task budgets are set.
  const percentComplete = bac > 0 ? (ev / bac) * 100 : avgActual;

  return { bac, pv, ev, ac, sv, cv, spi, cpi, eac, etc, vac, tcpi, percent_complete: percentComplete };
};

export default function EVMPage({ projectId: initialProjectId }: { projectId?: string } = {}) {
  const { triggerRefresh } = useDataRefreshStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const [evm, setEvm] = useState<EVMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [sCurveData, setSCurveData] = useState<any[]>([]);
  const [costEntries, setCostEntries] = useState<any[]>([]);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryForm, setEntryForm] = useState({ amount: "", description: "", category: "", entry_date: "" });
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  // Sync when parent passes a different project
  useEffect(() => {
    if (initialProjectId && initialProjectId !== projectId) {
      setProjectId(initialProjectId);
      setSelectedProject(projects.find((p) => p.id === initialProjectId) ?? null);
    }
  }, [initialProjectId]);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { if (projectId) { calculateProjectEVM(); fetchCostEntries(); } }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) {
        const target = initialProjectId ? p.find((x: any) => x.id === initialProjectId) ?? p[0] : p[0];
        setProjectId(target.id);
        setSelectedProject(target);
      }
    } catch (err) { console.error(err); }
  };

  const calculateProjectEVM = async () => {
    setLoading(true);
    try {
      // Try to get real snapshots first
      let snapshotData: any[] = [];
      try {
        const snapRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/evm-snapshots/${projectId}`);
        snapshotData = snapRes.data.snapshots || [];
      } catch {}

      const tasksRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule`);
      const tasks = tasksRes.data.tasks || [];

      // Re-fetch the projects list rather than reading the cached `projects` state — the list
      // endpoint recomputes spent_to_date live from cost_entries, so this is what keeps AC/CPI
      // in sync right after a Cost Entry is added or deleted instead of showing stale figures.
      let project = projects.find(p => p.id === projectId) || selectedProject;
      try {
        const projRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
        const freshProjects = projRes.data.projects || [];
        if (freshProjects.length > 0) {
          setProjects(freshProjects);
          project = freshProjects.find((p: any) => p.id === projectId) || project;
        }
      } catch (err) { console.error(err); }
      setSelectedProject(project);

      const evmData = calculateEVM(
        tasks,
        project?.total_budget ?? 0,
        project?.spent_to_date ?? 0
      );
      setEvm(evmData);

      if (evmData) {
        const todayStr = new Date().toISOString().slice(0, 10);

        // Persist today's real EVM figures so history genuinely accumulates day over
        // day — the backend upserts on (project_id, snapshot_date), so recalculating
        // repeatedly the same day just updates today's row instead of duplicating it.
        // Column names must match the live evm_snapshots table (pv/ev/ac/cpi/spi/
        // percent_complete) — it has no bac/eac columns, so the chart's BAC reference
        // line is drawn from the current project budget instead of a per-snapshot value.
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/construction/evm-snapshots`, {
            project_id: projectId,
            snapshot_date: todayStr,
            pv: evmData.pv,
            ev: evmData.ev,
            ac: evmData.ac,
            cpi: evmData.cpi,
            spi: evmData.spi,
            percent_complete: evmData.percent_complete,
          });
        } catch (err) { console.error(err); }

        // The S-Curve is built entirely from real evm_snapshots rows — never a
        // fabricated curve. Merge in today's just-computed point in case the POST
        // above hasn't landed in a subsequent fetch yet, so the chart isn't empty
        // on a project's very first visit.
        const withToday = [
          ...snapshotData.filter((s: any) => s.snapshot_date !== todayStr),
          { snapshot_date: todayStr, pv: evmData.pv, ev: evmData.ev, ac: evmData.ac },
        ].sort((a: any, b: any) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));

        setSCurveData(withToday.map((s: any) => ({
          month: new Date(s.snapshot_date).toLocaleDateString("en", { month: "short", day: "2-digit" }),
          pv: Math.round((s.pv ?? 0) / 1000),
          ev: Math.round((s.ev ?? 0) / 1000),
          ac: Math.round((s.ac ?? 0) / 1000),
          bac: Math.round(evmData.bac / 1000),
        })));
      } else {
        setSCurveData([]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchCostEntries = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/cost`);
      setCostEntries(res.data.cost_entries || []);
    } catch (err) { console.error(err); }
  };

  const addCostEntry = async () => {
    if (!entryForm.amount || isNaN(Number(entryForm.amount))) return;
    setEntrySubmitting(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/cost`, {
        amount: Number(entryForm.amount),
        description: entryForm.description || null,
        category: entryForm.category || null,
        entry_date: entryForm.entry_date || null,
      });
      setEntryForm({ amount: "", description: "", category: "", entry_date: "" });
      setShowEntryForm(false);
      await fetchCostEntries();
      await calculateProjectEVM();
      triggerRefresh("cost");
    } catch (err) { console.error(err); }
    finally { setEntrySubmitting(false); }
  };

  const deleteCostEntry = async (entryId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/cost/${entryId}`);
      await fetchCostEntries();
      await calculateProjectEVM();
      triggerRefresh("cost");
    } catch (err) { console.error(err); }
  };

  const fmt = (val: number) => {
    if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  // sCurveData / monthlyMetrics are already expressed in $K (divided by 1000 for chart display),
  // so sparkline tooltips over that data need a formatter scaled accordingly — not the raw fmt() above.
  const fmtK = (val: number) => {
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val);
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}M`;
    return `${sign}$${abs.toFixed(0)}K`;
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

  const getIndexAccent = (val: number) => {
    if (val >= 1.05) return ACCENT.green;
    if (val >= 0.95) return ACCENT.amber;
    if (val >= 0.8) return ACCENT.orange;
    return ACCENT.red;
  };

  const getHealthStatus = (evm: EVMData) => {
    if (evm.cpi >= 1 && evm.spi >= 1) return { label: "On Track", color: "text-emerald-400", border: ACCENT.green.border };
    if (evm.cpi >= 0.9 && evm.spi >= 0.9) return { label: "Minor Issues", color: "text-amber-400", border: ACCENT.amber.border };
    if (evm.cpi >= 0.8 || evm.spi >= 0.8) return { label: "At Risk", color: "text-orange-400", border: ACCENT.orange.border };
    return { label: "Critical", color: "text-red-400", border: ACCENT.red.border };
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

  // Derive monthly CPI/SPI/variance/forecast series from the S-Curve's historical (non-null) points
  // so Performance Indices and Forecast Metrics cards can show real sparklines too.
  // sCurveData (pv/ev/ac/bac) is already scaled to $K, so bacK keeps every derived field in that
  // same scale — mixing it with evm.bac (raw dollars) would silently produce nonsense EAC/ETC/VAC/TCPI.
  const bacK = evm ? evm.bac / 1000 : 0;
  const monthlyMetrics = evm ? sCurveData
    .filter((d: any) => d.pv != null && d.ev != null && d.ac != null)
    .map((d: any) => {
      const cpi = d.ac > 0 ? d.ev / d.ac : 1;
      const spi = d.pv > 0 ? d.ev / d.pv : 1;
      const eac = cpi > 0 ? bacK / cpi : bacK;
      return {
        month: d.month,
        cpi, spi,
        cv: d.ev - d.ac,
        sv: d.ev - d.pv,
        eac,
        etc: eac - d.ac,
        vac: bacK - eac,
        tcpi: (bacK - d.ev) / Math.max(bacK - d.ac, 0.001), // 0.001 $K == $1, matches the raw-dollar floor in calculateEVM
        percentComplete: bacK > 0 ? (d.ev / bacK) * 100 : 0,
        efficiency: cpi * spi * 100, // Critical Ratio (CPI × SPI)
      };
    }) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Earned Value Management</h1>
          <p className="text-white/35 text-[13px] mt-1">
            Real-time EVM · CPI · SPI · Variance Analysis · Forecast at Completion
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <select value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSelectedProject(projects.find(p => p.id === e.target.value)); }}
              className={glassInputClass + " w-auto"} style={glassInputStyle}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={calculateProjectEVM} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium transition-all hover:scale-105"
            style={gradientButtonStyle}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Recalculate
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="ml-3 text-white/40">Calculating EVM metrics...</p>
        </div>
      ) : evm ? (
        <>
          {/* Health Status Banner */}
          {(() => {
            const health = getHealthStatus(evm);
            return (
              <div className="glass-card flex items-center justify-between p-5" style={{ borderColor: health.border }}>
                <div className="flex items-center gap-3">
                  {evm.cpi >= 1 && evm.spi >= 1
                    ? <CheckCircle className="w-6 h-6 text-emerald-400" />
                    : <AlertTriangle className="w-6 h-6 text-amber-400" />}
                  <div>
                    <p className={`font-semibold text-lg ${health.color}`}>
                      Project Status: {health.label}
                    </p>
                    <p className="text-[11px] text-white/35">
                      {selectedProject?.name} · {Math.round(evm.percent_complete)}% complete · BAC: {fmt(evm.bac)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-white/35">Estimate at Completion</p>
                  <p className={`text-2xl font-bold ${evm.eac > evm.bac ? "text-red-400" : "text-emerald-400"}`}>
                    {fmt(evm.eac)}
                  </p>
                  <p className="text-[11px] text-white/35">
                    {evm.eac > evm.bac ? "⚠️ Overrun" : "✅ Under budget"} by {fmt(Math.abs(evm.eac - evm.bac))}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Main KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Planned Value (PV)", value: fmt(evm.pv), sub: "Budgeted cost of work scheduled", icon: Calendar, accent: ACCENT.blue, trendData: sCurveData.filter((d) => d.pv != null && d.ev != null && d.ac != null).map((d) => d.pv), trendType: "area" as const, trendLabels: monthlyMetrics.map((m) => m.month), trendFmt: fmtK },
              { label: "Earned Value (EV)", value: fmt(evm.ev), sub: "Budgeted cost of work performed", icon: CheckCircle, accent: ACCENT.green, trendData: sCurveData.filter((d) => d.pv != null && d.ev != null && d.ac != null).map((d) => d.ev), trendType: "area" as const, trendLabels: monthlyMetrics.map((m) => m.month), trendFmt: fmtK },
              { label: "Actual Cost (AC)", value: fmt(evm.ac), sub: "Actual cost incurred to date", icon: DollarSign, accent: ACCENT.amber, trendData: sCurveData.filter((d) => d.pv != null && d.ev != null && d.ac != null).map((d) => d.ac), trendType: "area" as const, trendLabels: monthlyMetrics.map((m) => m.month), trendFmt: fmtK },
              { label: "Budget at Completion", value: fmt(evm.bac), sub: "Total approved budget", icon: BarChart3, accent: ACCENT.cyan, trendData: sCurveData.filter((d) => d.bac > 0).map((d) => d.bac), trendType: "line" as const, trendLabels: sCurveData.filter((d) => d.bac > 0).map((d) => d.month), trendFmt: fmtK },
            ].map((kpi, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }}
                className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: kpi.accent.border }}>
                <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at top left, ${kpi.accent.bg}, transparent 70%)` }} />
                <div className="relative flex items-center justify-between mb-2">
                  <p className="text-[11px] text-white/35">{kpi.label}</p>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.accent.text }} />
                </div>
                <p className="relative text-2xl font-bold" style={{ color: kpi.accent.text }}>{kpi.value}</p>
                <p className="relative text-[11px] text-white/35 mt-1">{kpi.sub}</p>
                {kpi.trendData.length >= 2 && (
                  <div className="relative -mx-1 mt-2 opacity-70">
                    <Sparkline data={kpi.trendData} color={kpi.accent.text} type={kpi.trendType} labels={kpi.trendLabels} valueFormatter={kpi.trendFmt} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Performance Indices */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "CPI", value: evm.cpi.toFixed(2), full: "Cost Performance Index", desc: evm.cpi >= 1 ? "✅ Under budget" : "⚠️ Over budget", isIndex: true, raw: evm.cpi, trendData: monthlyMetrics.map((m) => m.cpi), trendType: "line" as const, trendFmt: (v: number) => v.toFixed(2) },
              { label: "SPI", value: evm.spi.toFixed(2), full: "Schedule Performance Index", desc: evm.spi >= 1 ? "✅ Ahead of schedule" : "⚠️ Behind schedule", isIndex: true, raw: evm.spi, trendData: monthlyMetrics.map((m) => m.spi), trendType: "line" as const, trendFmt: (v: number) => v.toFixed(2) },
              { label: "CV", value: fmt(evm.cv), full: "Cost Variance", desc: evm.cv >= 0 ? "✅ Under budget" : "⚠️ Over budget", isIndex: false, raw: evm.cv, trendData: monthlyMetrics.map((m) => m.cv), trendType: "bar" as const, trendFmt: fmtK },
              { label: "SV", value: fmt(evm.sv), full: "Schedule Variance", desc: evm.sv >= 0 ? "✅ Ahead of schedule" : "⚠️ Behind schedule", isIndex: false, raw: evm.sv, trendData: monthlyMetrics.map((m) => m.sv), trendType: "bar" as const, trendFmt: fmtK },
            ].map((metric, i) => {
              const a = metric.isIndex ? getIndexAccent(metric.raw) : (metric.raw >= 0 ? ACCENT.green : ACCENT.red);
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }}
                  className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}>
                  <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
                  <div className="relative flex items-center justify-between mb-1">
                    <p className="text-[11px] text-white/35">{metric.full}</p>
                    <span className="text-[11px] font-bold text-white/40 px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>{metric.label}</span>
                  </div>
                  <p className={`relative text-3xl font-bold ${metric.isIndex ? getIndexColor(metric.raw) : getIndexColor(metric.raw, false)}`}>
                    {metric.value}
                  </p>
                  <p className="relative text-[11px] text-white/35 mt-1">{metric.desc}</p>
                  {metric.trendData.length >= 2 && (
                    <div className="relative -mx-1 mt-2 opacity-70">
                      <Sparkline data={metric.trendData} color={a.text} type={metric.trendType} labels={monthlyMetrics.map((m) => m.month)} valueFormatter={metric.trendFmt} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Forecast Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: "EAC", full: "Estimate at Completion", value: fmt(evm.eac), good: evm.eac <= evm.bac, desc: `${evm.eac > evm.bac ? "+" : ""}${fmt(evm.eac - evm.bac)} vs BAC`, trendData: monthlyMetrics.map((m) => m.eac), trendType: "area" as const, trendFmt: fmtK },
              { label: "ETC", full: "Estimate to Complete", value: fmt(evm.etc), good: true, desc: "Remaining cost forecast", trendData: monthlyMetrics.map((m) => m.etc), trendType: "bar" as const, trendFmt: fmtK },
              { label: "VAC", full: "Variance at Completion", value: fmt(evm.vac), good: evm.vac >= 0, desc: evm.vac >= 0 ? "✅ Projected savings" : "⚠️ Projected overrun", trendData: monthlyMetrics.map((m) => m.vac), trendType: "bar" as const, trendFmt: fmtK },
              { label: "TCPI", full: "To-Complete Perf. Index", value: evm.tcpi.toFixed(2), good: evm.tcpi <= 1.1, desc: evm.tcpi <= 1.1 ? "✅ Achievable target" : "⚠️ Challenging target", trendData: monthlyMetrics.map((m) => m.tcpi), trendType: "line" as const, trendFmt: (v: number) => v.toFixed(2) },
              { label: "% Complete", full: "Physical % Complete", value: `${Math.round(evm.percent_complete)}%`, good: true, desc: "Based on task progress", trendData: monthlyMetrics.map((m) => m.percentComplete), trendType: "area" as const, trendFmt: (v: number) => `${v.toFixed(0)}%` },
              { label: "CR", full: "Critical Ratio", value: `${Math.round(evm.cpi * evm.spi * 100)}%`, good: evm.cpi >= 1 && evm.spi >= 1, desc: "CPI × SPI — combined cost/schedule health", trendData: monthlyMetrics.map((m) => m.efficiency), trendType: "line" as const, trendFmt: (v: number) => `${v.toFixed(0)}%` },
            ].map((metric, i) => {
              const a = metric.good ? ACCENT.green : ACCENT.red;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
                  className="glass-card p-4 group relative overflow-hidden" style={{ borderColor: a.border }}>
                  <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
                  <div className="relative flex items-center justify-between mb-1">
                    <p className="text-[11px] text-white/35">{metric.full}</p>
                    <span className="text-[11px] font-bold text-white/40 px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>{metric.label}</span>
                  </div>
                  <p className="relative text-2xl font-bold" style={{ color: a.text }}>
                    {metric.value}
                  </p>
                  <p className="relative text-[11px] text-white/35 mt-1">{metric.desc}</p>
                  {metric.trendData.length >= 2 && (
                    <div className="relative -mx-1 mt-2 opacity-70">
                      <Sparkline data={metric.trendData} color={a.text} type={metric.trendType} labels={monthlyMetrics.map((m) => m.month)} valueFormatter={metric.trendFmt} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* S-Curve */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-1">EVM S-Curve</h3>
              <p className="text-[11px] text-white/35 mb-4">PV · EV · AC over time ($K)</p>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="pv" stroke="#8b5cf6" fill="url(#pvGrad)" strokeWidth={2} name="PV ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="ev" stroke="#10b981" fill="url(#evGrad)" strokeWidth={2} name="EV ($K)" connectNulls dot={false} />
                  <Area type="monotone" dataKey="ac" stroke="#f59e0b" fill="url(#acGrad)" strokeWidth={2} name="AC ($K)" connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Variance Analysis */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-1">Variance Analysis</h3>
              <p className="text-[11px] text-white/35 mb-4">SV · CV · VAC ($K) — Green = positive, Red = negative</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={varianceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ fill: "rgba(0,212,255,0.06)" }}
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
                <p className="text-[11px] font-medium text-white/35 mb-2">📊 Interpretation:</p>
                {[
                  { condition: evm.cpi >= 1, good: "✅ Cost efficient — under budget", bad: `⚠️ Over budget — CPI: ${evm.cpi.toFixed(2)}` },
                  { condition: evm.spi >= 1, good: "✅ Ahead of schedule", bad: `⚠️ Behind schedule — SPI: ${evm.spi.toFixed(2)}` },
                  { condition: evm.eac <= evm.bac, good: "✅ Projected to finish under budget", bad: `🚨 Projected overrun: ${fmt(evm.eac - evm.bac)}` },
                ].map((item, i) => (
                  <p key={i} className="text-[11px] px-2 py-1 rounded-lg"
                    style={item.condition
                      ? { background: ACCENT.green.bg, color: ACCENT.green.text }
                      : { background: ACCENT.amber.bg, color: ACCENT.amber.text }}>
                    {item.condition ? item.good : item.bad}
                  </p>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Budget Overview */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6">
            <h3 className="font-semibold text-white text-[14px] mb-1">Budget Overview</h3>
            <p className="text-[11px] text-white/35 mb-4">
              BAC · PV · EV · AC · EAC · ETC ($K) — color coded by performance
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} unit="K" />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: "rgba(0,212,255,0.06)" }}
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
                  <span className="text-[11px] text-white/35">{item.name}: ${item.value}K</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      ) : (
        <div className="text-center py-20">
          <BarChart3 className="w-12 h-12 text-white/15 mx-auto mb-3" />
          {!projectId ? (
            <p className="text-white/30 text-[13px]">Select a project to calculate EVM metrics</p>
          ) : !selectedProject?.total_budget ? (
            <p className="text-white/30 text-[13px]">No budget set for this project — add a budget to calculate EVM</p>
          ) : (
            <p className="text-white/30 text-[13px]">No schedule tasks found — add tasks with planned/actual progress to calculate EVM</p>
          )}
        </div>
      )}

      {/* Cost Entries */}
      {projectId && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-[15px]">Cost Entries</h3>
              <p className="text-[11px] text-white/35">Actual costs recorded — these drive AC and CPI</p>
            </div>
            <button onClick={() => setShowEntryForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
              style={gradientButtonStyle}>
              <Plus className="w-4 h-4" /> Add Entry
            </button>
          </div>

          {showEntryForm && (
            <div className="mb-4 p-4 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Amount ($) *</label>
                <input type="number" placeholder="50000" value={entryForm.amount}
                  onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))}
                  className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Description</label>
                <input type="text" placeholder="Concrete pour" value={entryForm.description}
                  onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Category</label>
                <select value={entryForm.category}
                  onChange={e => setEntryForm(f => ({ ...f, category: e.target.value }))}
                  className={glassInputClass} style={glassInputStyle}>
                  <option value="">Select…</option>
                  {["Labor", "Materials", "Equipment", "Subcontractor", "Overhead", "Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Date</label>
                <input type="date" value={entryForm.entry_date}
                  onChange={e => setEntryForm(f => ({ ...f, entry_date: e.target.value }))}
                  className={glassInputClass} style={glassInputStyle} />
              </div>
              <div className="col-span-2 md:col-span-4 flex gap-2 justify-end mt-1">
                <button onClick={() => setShowEntryForm(false)}
                  className="px-4 py-1.5 rounded-lg text-sm text-white/50 hover:text-white/80 transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Cancel
                </button>
                <button onClick={addCostEntry} disabled={entrySubmitting || !entryForm.amount}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                  style={gradientButtonStyle}>
                  {entrySubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Entry
                </button>
              </div>
            </div>
          )}

          {costEntries.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-6">No cost entries yet — add one above to update AC</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-white/35" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Description</th>
                    <th className="text-left py-2 pr-4">Category</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {costEntries.map((entry: any) => (
                    <tr key={entry.id} className="transition-colors hover:bg-white/2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="py-2 pr-4 text-white/40">
                        {entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 pr-4 text-white/80">{entry.description || "—"}</td>
                      <td className="py-2 pr-4">
                        {entry.category ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: ACCENT.cyan.bg, color: ACCENT.cyan.text }}>{entry.category}</span>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-amber-400">
                        {fmt(Number(entry.amount))}
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => deleteCostEntry(entry.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-3 text-[11px] text-white/35">Total AC</td>
                    <td className="pt-3 text-right font-bold text-amber-400">
                      {fmt(costEntries.reduce((s, e) => s + Number(e.amount), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </motion.div>
      )}

      <ModuleChat
        context="Earned Value Management"
        placeholder="Ask about CPI, SPI, EAC, cost variance..."
        pageSummaryData={{ evm, project: selectedProject?.name }}
      />
    </div>
  );
}