"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Sparkles, Plus, Trash2, RefreshCw, Info,
  TrendingUp, TrendingDown,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";
import { exportScenarioAnalysisPDF } from "@/lib/exportPDF";
import { Download } from "lucide-react";

interface Scenario {
  id: string;
  name: string;
  color: string;
  budget: number;
  duration: number;      // months
  laborCostPct: number;
  materialCostPct: number;
  contingencyPct: number;
}

interface ProjectData {
  id: string;
  name: string;
  total_budget: number;
  spent_to_date: number;
  start_date?: string;
  end_date?: string;
  avg_progress?: number;
}

interface EVMSnapshot {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cpi: number;
  spi: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const STORAGE_KEY = "civilai_scenarios_v3";

// Standard Hermite S-curve — no randomness
function sCurve(t: number) {
  return 3 * t * t - 2 * t * t * t;
}

function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}

function buildCumulative(s: Scenario): Array<{ month: string; base: number; withContingency: number }> {
  const months = Math.max(s.duration, 1);
  return Array.from({ length: months }, (_, i) => {
    const t = (i + 1) / months;
    const progress = sCurve(t);
    return {
      month: `M${i + 1}`,
      base: Math.round((s.budget * progress) / 1000),
      withContingency: Math.round((s.budget * (1 + s.contingencyPct / 100) * progress) / 1000),
    };
  });
}

function deriveFromProject(
  project: ProjectData,
  costEntries: any[],
): Omit<Scenario, "id" | "name" | "color"> {
  const budget = Math.max(project.total_budget || 0, 10_000);
  const duration =
    project.start_date && project.end_date
      ? monthsBetween(project.start_date, project.end_date)
      : 18;

  const total = costEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const labor = costEntries.filter((e) => e.category === "Labor").reduce((s, e) => s + Number(e.amount || 0), 0);
  const mats  = costEntries.filter((e) => e.category === "Materials").reduce((s, e) => s + Number(e.amount || 0), 0);

  const laborCostPct    = total > 0 ? Math.round((labor / total) * 100) : 35;
  const materialCostPct = total > 0 ? Math.round((mats  / total) * 100) : 45;

  // Estimate contingency from actual spend trajectory
  const progress = project.avg_progress ?? 0;
  const spent    = project.spent_to_date ?? 0;
  const projectedFinal = progress > 0 ? spent / (progress / 100) : budget;
  const rawContingency = budget > 0 ? ((projectedFinal - budget) / budget) * 100 : 10;
  const contingencyPct = Math.max(5, Math.min(25, Math.round(rawContingency) + 10));

  return { budget, duration, laborCostPct, materialCostPct, contingencyPct };
}

function totalCostEst(s: Scenario)  { return s.budget * (1 + s.contingencyPct / 100); }
function monthlyBurn(s: Scenario)   { return totalCostEst(s) / Math.max(s.duration, 1); }
function laborDollar(s: Scenario)   { return s.budget * s.laborCostPct    / 100; }
function materialDollar(s: Scenario){ return s.budget * s.materialCostPct / 100; }

// Converts **bold** markdown to React elements with proper bold rendering
function renderMarkdown(text: string): ReactNode {
  if (!text) return null;

  return text.split("\n").map((line, li) => {
    if (!line.trim()) return <div key={li} className="h-2" />;

    // Section header: **1. Title** or **Title** pattern at line start
    const hMatch = line.match(/^\*\*(\d+\.\s+[^*]+|\w[^*]*)\*\*(.*)$/);
    if (hMatch) {
      const rest = hMatch[2].replace(/\*\*/g, "").trim();
      return (
        <p key={li} className="mt-4 mb-1 text-sm font-bold text-blue-400">
          {hMatch[1]}{rest ? " " + rest : ""}
        </p>
      );
    }

    // Inline bold: split at **...** markers
    const segs = line.split(/(\*\*[^*]+\*\*)/g);
    const hasInline = segs.some(s => s.startsWith("**") && s.endsWith("**"));

    const isBullet = /^\s*[-•]\s+/.test(line);
    const content  = isBullet ? line.replace(/^\s*[-•]\s+/, "") : line;
    const segsContent = content.split(/(\*\*[^*]+\*\*)/g);

    const rendered = segsContent.map((seg, si) => {
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return <strong key={si} className="font-semibold text-foreground">{seg.slice(2, -2)}</strong>;
      }
      return seg;
    });

    if (isBullet) {
      return (
        <div key={li} className="flex gap-2 text-sm leading-relaxed text-foreground/90 pl-1">
          <span className="text-blue-400 mt-0.5 shrink-0">•</span>
          <span>{rendered}</span>
        </div>
      );
    }

    return (
      <p key={li} className="text-sm leading-relaxed text-foreground/90">
        {hasInline ? rendered : line}
      </p>
    );
  });
}

function fmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${v < 0 ? "-" : ""}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${v < 0 ? "-" : ""}$${Math.round(a / 1e3)}K`;
  return `$${Math.round(v)}`;
}

export default function ScenarioPage({ projectId: propProjectId }: { projectId?: string } = {}) {
  const [projects, setProjects]               = useState<ProjectData[]>([]);
  const [selProjectId, setSelProjectId]       = useState(propProjectId || "");
  const [scenarios, setScenarios]             = useState<Scenario[]>([]);
  const [activeIds, setActiveIds]             = useState<string[]>([]);
  const [evmSnapshot, setEvmSnapshot]         = useState<EVMSnapshot | null>(null);
  const [analyzing, setAnalyzing]             = useState(false);
  const [loadingBase, setLoadingBase]         = useState(false);
  const [analysis, setAnalysis]               = useState("");

  // ── Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.scenarios?.length) {
          setScenarios(parsed.scenarios);
          setActiveIds(parsed.activeIds || parsed.scenarios.map((s: Scenario) => s.id));
        }
      }
    } catch {}
    fetchProjects();
  }, []);

  // ── Persist to localStorage on every change
  useEffect(() => {
    if (scenarios.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarios, activeIds }));
    }
  }, [scenarios, activeIds]);

  // ── Sync prop projectId
  useEffect(() => {
    if (propProjectId && propProjectId !== selProjectId) setSelProjectId(propProjectId);
  }, [propProjectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const ps: ProjectData[] = res.data.projects || [];
      setProjects(ps);
      if (!selProjectId && ps.length > 0) setSelProjectId(ps[0].id);
    } catch (err) {
      console.error("Failed to fetch projects", err);
    }
  };

  const loadFromProject = useCallback(async (pid?: string) => {
    const id = pid || selProjectId;
    if (!id || !projects.length) return;
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    setLoadingBase(true);
    try {
      const [entriesRes, tasksRes] = await Promise.allSettled([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${id}/cost`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${id}/schedule`),
      ]);

      const entries = entriesRes.status === "fulfilled"
        ? (entriesRes.value.data.cost_entries || [])
        : [];

      const tasks = tasksRes.status === "fulfilled"
        ? (tasksRes.value.data.tasks || [])
        : [];

      // Compute EVM snapshot
      if (tasks.length > 0 && project.total_budget > 0) {
        const bac = project.total_budget;
        const avgPlanned = tasks.reduce((s: number, t: any) => s + (t.planned_progress || 0), 0) / tasks.length;
        const avgActual  = tasks.reduce((s: number, t: any) => s + (t.actual_progress  || 0), 0) / tasks.length;
        const pv = bac * (avgPlanned / 100);
        const ev = bac * (avgActual  / 100);
        const ac = project.spent_to_date || entries.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
        setEvmSnapshot({
          bac, pv, ev, ac,
          spi: pv  > 0 ? ev / pv  : 1,
          cpi: ac  > 0 ? ev / ac  : 1,
        });
      } else {
        setEvmSnapshot(null);
      }

      // Build 3 scenarios from real data
      const base = deriveFromProject(project, entries);
      const ids = { base: `base-${id}`, opt: `opt-${id}`, pes: `pes-${id}` };

      const newScenarios: Scenario[] = [
        { id: ids.base, name: "Base Case",   color: COLORS[0], ...base },
        {
          id: ids.opt, name: "Optimistic", color: COLORS[1],
          budget:          Math.round(base.budget * 0.90),
          duration:        Math.max(1, Math.round(base.duration * 0.85)),
          laborCostPct:    Math.max(1, base.laborCostPct    - 5),
          materialCostPct: Math.max(1, base.materialCostPct - 3),
          contingencyPct:  Math.max(2, Math.round(base.contingencyPct * 0.5)),
        },
        {
          id: ids.pes, name: "Pessimistic", color: COLORS[3],
          budget:          Math.round(base.budget * 1.20),
          duration:        Math.round(base.duration * 1.25),
          laborCostPct:    base.laborCostPct    + 8,
          materialCostPct: base.materialCostPct + 5,
          contingencyPct:  Math.min(30, Math.round(base.contingencyPct * 1.5) + 5),
        },
      ];

      setScenarios(newScenarios);
      setActiveIds(Object.values(ids));
      toast.success(`Scenarios loaded from ${project.name}`);
    } catch (err) {
      toast.error("Failed to load project data");
      console.error(err);
    } finally {
      setLoadingBase(false);
    }
  }, [selProjectId, projects]);

  // Auto-load when project available and no scenarios saved
  useEffect(() => {
    if (selProjectId && projects.length > 0 && scenarios.length === 0) {
      loadFromProject(selProjectId);
    }
  }, [selProjectId, projects]);

  // ── CRUD
  const addScenario = () => {
    const id   = crypto.randomUUID();
    const base = scenarios[0];
    setScenarios((prev) => [
      ...prev,
      {
        id,
        name:            `Scenario ${prev.length + 1}`,
        color:           COLORS[prev.length % COLORS.length],
        budget:          base?.budget          ?? 5_000_000,
        duration:        base?.duration        ?? 18,
        laborCostPct:    base?.laborCostPct    ?? 35,
        materialCostPct: base?.materialCostPct ?? 45,
        contingencyPct:  base?.contingencyPct  ?? 10,
      },
    ]);
    setActiveIds((prev) => [...prev, id]);
  };

  const updateScenario = (id: string, field: keyof Scenario, value: string | number) =>
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const removeScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    setActiveIds((prev) => prev.filter((x) => x !== id));
  };

  const toggleActive = (id: string) =>
    setActiveIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // ── Chart data (deterministic)
  const visibleScenarios = scenarios.filter((s) => activeIds.includes(s.id));
  const maxMonths = Math.max(...visibleScenarios.map((s) => s.duration), 1);

  const chartData = Array.from({ length: maxMonths }, (_, i) => {
    const point: Record<string, number | string | null> = { month: `M${i + 1}` };
    visibleScenarios.forEach((s) => {
      const pts = buildCumulative(s);
      point[s.name] = pts[i]?.base ?? null;
    });
    return point;
  });

  // ── AI Analysis
  const analyzeWithAI = async () => {
    setAnalyzing(true);
    const project = projects.find((p) => p.id === selProjectId);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/cost/scenarios/analyze`, {
        project_name: project?.name ?? "the project",
        scenarios: visibleScenarios.map((s) => ({
          name:            s.name,
          budget:          s.budget,
          duration:        s.duration,
          laborCostPct:    s.laborCostPct,
          materialCostPct: s.materialCostPct,
          contingencyPct:  s.contingencyPct,
          totalCost:       totalCostEst(s),
        })),
        evm_cpi: evmSnapshot?.cpi ?? null,
        evm_spi: evmSnapshot?.spi ?? null,
        evm_ac:  evmSnapshot?.ac  ?? null,
        evm_ev:  evmSnapshot?.ev  ?? null,
      });
      setAnalysis(res.data?.analysis || "");
      toast.success("AI analysis complete");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(detail ? `Analysis failed: ${detail}` : "AI analysis failed — check backend logs");
      console.error("Scenario analysis error:", err?.response?.data || err);
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadPDF = () => {
    if (!analysis) return;
    const project = projects.find((p) => p.id === selProjectId);
    exportScenarioAnalysisPDF(
      analysis,
      visibleScenarios,
      evmSnapshot,
      project?.name ?? "Project",
    );
  };

  const selectedProject = projects.find((p) => p.id === selProjectId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Scenario Planner</h1>
          <p className="text-muted-foreground text-sm mt-1">
            What-if budget &amp; schedule modelling — seeded from live project data
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select
              value={selProjectId}
              onChange={(e) => { setSelProjectId(e.target.value); setScenarios([]); setActiveIds([]); }}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none"
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button
            onClick={() => loadFromProject()}
            disabled={loadingBase || !selProjectId}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {loadingBase ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reload from Project
          </button>
          <button
            onClick={analyzeWithAI}
            disabled={analyzing || visibleScenarios.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Analysis
          </button>
          <button
            onClick={addScenario}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Scenario
          </button>
        </div>
      </motion.div>

      {/* EVM Context Banner */}
      {evmSnapshot && selectedProject && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex-wrap">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-medium text-blue-400">{selectedProject.name} — Live EVM:</span>
          {[
            { label: "Spent (AC)",     value: fmt(evmSnapshot.ac) },
            { label: "Earned (EV)",    value: fmt(evmSnapshot.ev) },
            { label: "CPI",            value: evmSnapshot.cpi.toFixed(2) },
            { label: "SPI",            value: evmSnapshot.spi.toFixed(2) },
            { label: "Budget (BAC)",   value: fmt(evmSnapshot.bac) },
          ].map(({ label, value }) => (
            <div key={label} className="text-xs">
              <span className="text-muted-foreground">{label}: </span>
              <span className="text-foreground font-semibold">{value}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Scenario Cards */}
      {loadingBase ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mr-3" />
          <span className="text-muted-foreground text-sm">Loading project data…</span>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Select a project and click <strong>Reload from Project</strong> to seed scenarios from real data.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-card border rounded-2xl p-5 transition-all ${activeIds.includes(s.id) ? "border-blue-500/40" : "border-border opacity-60"}`}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <input
                    className="text-sm font-semibold text-foreground bg-transparent border-none outline-none w-36 truncate"
                    value={s.name}
                    onChange={(e) => updateScenario(s.id, "name", e.target.value)}
                  />
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(s.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      activeIds.includes(s.id)
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        : "text-muted-foreground border-border"
                    }`}
                  >
                    {activeIds.includes(s.id) ? "Visible" : "Hidden"}
                  </button>
                  <button onClick={() => removeScenario(s.id)} className="text-muted-foreground hover:text-red-400 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-3">
                {[
                  { label: "Total Budget ($)",   key: "budget",          step: 50_000, min: 10_000 },
                  { label: "Duration (months)",  key: "duration",        step: 1,      min: 1      },
                  { label: "Labour Cost (%)",    key: "laborCostPct",    step: 1,      min: 0      },
                  { label: "Material Cost (%)",  key: "materialCostPct", step: 1,      min: 0      },
                  { label: "Contingency (%)",    key: "contingencyPct",  step: 1,      min: 0      },
                ].map(({ label, key, ...attrs }) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <input
                      type="number"
                      {...attrs}
                      value={(s as any)[key]}
                      onChange={(e) => updateScenario(s.id, key as keyof Scenario, parseFloat(e.target.value) || 0)}
                      className="w-28 text-right px-2 py-1 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Derived metrics */}
              <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Estimate</span>
                  <span className="font-semibold text-foreground">{fmt(totalCostEst(s))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Monthly Burn</span>
                  <span className="font-medium text-orange-400">{fmt(monthlyBurn(s))}/mo</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Labour</span>
                  <span className="text-foreground">{fmt(laborDollar(s))}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Materials</span>
                  <span className="text-foreground">{fmt(materialDollar(s))}</span>
                </div>
                {evmSnapshot && evmSnapshot.ac > 0 && (
                  <div className="flex justify-between text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">vs Actual Spend</span>
                    <div className={`flex items-center gap-1 ${totalCostEst(s) >= evmSnapshot.ac ? "text-emerald-400" : "text-red-400"}`}>
                      {totalCostEst(s) >= evmSnapshot.ac
                        ? <TrendingUp className="w-3 h-3" />
                        : <TrendingDown className="w-3 h-3" />}
                      {fmt(totalCostEst(s) - evmSnapshot.ac)}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Cumulative Cost Chart */}
      {visibleScenarios.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Cumulative Cost Projection ($K)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">S-curve model · budget only (contingency not included)</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                {visibleScenarios.map((s) => (
                  <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="K" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [`$${v}K`]} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {visibleScenarios.map((s) => (
                <Area
                  key={s.id}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.color}
                  fill={`url(#grad-${s.id})`}
                  strokeWidth={2}
                  connectNulls
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Comparison Table */}
      {visibleScenarios.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
          <h3 className="font-semibold text-foreground mb-4">Scenario Comparison</h3>
          <table className="w-full text-sm min-w-150">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left pb-2 pr-6">Scenario</th>
                <th className="text-right pb-2 pr-4">Budget</th>
                <th className="text-right pb-2 pr-4">Duration</th>
                <th className="text-right pb-2 pr-4">Total Est.</th>
                <th className="text-right pb-2 pr-4">Monthly Burn</th>
                <th className="text-right pb-2 pr-4">Labour</th>
                <th className="text-right pb-2">Contingency</th>
              </tr>
            </thead>
            <tbody>
              {visibleScenarios.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                  <td className="py-2.5 pr-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-medium text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-foreground">{fmt(s.budget)}</td>
                  <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.duration} mo</td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-foreground">{fmt(totalCostEst(s))}</td>
                  <td className="py-2.5 pr-4 text-right text-orange-400">{fmt(monthlyBurn(s))}</td>
                  <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.laborCostPct}%</td>
                  <td className="py-2.5 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.contingencyPct <= 10
                        ? "bg-emerald-500/10 text-emerald-400"
                        : s.contingencyPct <= 15
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                    }`}>
                      {s.contingencyPct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* AI Analysis Result */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-cyan-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <p className="text-sm font-semibold text-foreground">AI Scenario Analysis</p>
            </div>
            <button
              onClick={downloadPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
          <div className="space-y-0.5">{renderMarkdown(analysis)}</div>
        </motion.div>
      )}

      <ModuleChat
        context="Scenario Planner"
        placeholder="Which scenario is safest? What if labour costs rise 20%?"
        pageSummaryData={{
          project:   selectedProject?.name,
          scenarios: visibleScenarios.map((s) => ({
            name:      s.name,
            budget:    fmt(s.budget),
            duration:  `${s.duration} months`,
            totalEst:  fmt(totalCostEst(s)),
            monthly:   fmt(monthlyBurn(s)),
          })),
          evmSnapshot,
        }}
      />
    </div>
  );
}
