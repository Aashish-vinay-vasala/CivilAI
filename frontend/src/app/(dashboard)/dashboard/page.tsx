"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  DollarSign, Calendar, Users, Shield,
  TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, ArrowRight, Building2,
  Plus, X, Loader2, MapPin, Trash2, Edit2, Save, Zap,
  FileDown, FileText, Boxes, CreditCard, PieChart,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
  LineChart, Line,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";
import CountUp from "@/components/shared/CountUp";
import { Skeleton } from "@/components/shared/Skeleton";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { exportProjectReport, exportAIReportPDF } from "@/lib/exportPDF";
import WidgetCustomizer from "@/components/dashboard/WidgetCustomizer";
import { useWidgetStore } from "@/lib/stores/widgetStore";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { useProjectStore } from "@/lib/stores/projectStore";

const modules = [
  { title: "Cost & Budget",  desc: "AI cost forecasting", href: "/cost",        icon: DollarSign, accent: "cyan" },
  { title: "Scheduling",     desc: "Delay prediction",   href: "/scheduling",   icon: Calendar,   accent: "amber" },
  { title: "Safety",         desc: "Risk monitoring",    href: "/safety",       icon: Shield,     accent: "red" },
  { title: "Workforce",      desc: "Skills & turnover",  href: "/workforce",    icon: Users,      accent: "green" },
  { title: "Documents",      desc: "Contracts & files",  href: "/documents",    icon: FileText,   accent: "teal" },
  { title: "Procurement",    desc: "Purchase orders",    href: "/procurement",  icon: Boxes,      accent: "orange" },
  { title: "Payments",       desc: "Invoices & payouts", href: "/payments",     icon: CreditCard, accent: "purple" },
  { title: "Financials",     desc: "Budget breakdown",   href: "/financials",   icon: PieChart,   accent: "blue" },
];

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

const PROGRESS_PRESETS: { key: string; label: string; months: number }[] = [
  { key: "1m",  label: "1M",  months: 1 },
  { key: "3m",  label: "3M",  months: 3 },
  { key: "6m",  label: "6M",  months: 6 },
  { key: "1y",  label: "1Y",  months: 12 },
  { key: "5y",  label: "5Y",  months: 60 },
  { key: "10y", label: "10Y", months: 120 },
];

const emptyProject = {
  name: "", location: "", status: "active",
  budget: "", start_date: "", end_date: "", client: "",
};

const inputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

// Maps an alert's "module" field (from the backend activity log) to a route.
const MODULE_HREF: Record<string, string> = {
  cost: "/cost", budget: "/cost", schedule: "/scheduling", scheduling: "/scheduling",
  safety: "/safety", workforce: "/workforce", documents: "/documents",
  compliance: "/documents", contracts: "/documents", procurement: "/procurement",
  equipment: "/workforce", projects: "/projects", vendors: "/vendors",
  payments: "/payments", financials: "/financials",
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Shared timeline preset + custom date-range picker, used by both the Project
// Progress and Cost Analysis chart cards so their controls stay in sync visually.
function ChartRangePicker({
  range, onSelectPreset, showPicker, setShowPicker,
  customStart, setCustomStart, customEnd, setCustomEnd, onApplyCustom,
}: {
  range: { preset: string; start?: string; end?: string };
  onSelectPreset: (key: string) => void;
  showPicker: boolean;
  setShowPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  onApplyCustom: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1 p-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {PROGRESS_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => { onSelectPreset(p.key); setShowPicker(false); }}
            className="text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors"
            style={range.preset === p.key
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.35)" }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors flex items-center gap-1"
          style={range.preset === "custom"
            ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
            : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.35)" }}
        >
          <Calendar className="w-3 h-3" />
          Custom
        </button>
      </div>

      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-full mt-2 z-20 rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "rgba(4,11,25,0.98)", border: "1px solid rgba(0,212,255,0.18)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: "230px" }}
          >
            <Field label="From">
              <input type="date" className={inputClass} style={inputStyle} value={customStart}
                onChange={(e) => setCustomStart(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={inputClass} style={inputStyle} value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)} />
            </Field>
            <button
              onClick={onApplyCustom}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }}
            >
              Apply Range
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Project scope selector — "All Projects" plus every individual project.
// Shared by the Project Progress and Cost Analysis chart cards.
function ChartProjectSelect({ projects, value, onChange }: {
  projects: any[]; value: string; onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[11px] px-2.5 py-1.5 rounded-lg outline-none max-w-36 shrink-0"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
    >
      <option value="all" style={{ background: "#0A1628" }}>All Projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id} style={{ background: "#0A1628" }}>{p.name}</option>
      ))}
    </select>
  );
}

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 5)  return { text: "Good night",      emoji: "🌙" };
  if (hour < 12) return { text: "Good morning",     emoji: "☀️" };
  if (hour < 17) return { text: "Good afternoon",   emoji: "🌤️" };
  if (hour < 21) return { text: "Good evening",     emoji: "🌆" };
  return           { text: "Good night",      emoji: "🌙" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">{label}</label>
      {children}
    </div>
  );
}

function ProjectFormFields({ form, setForm }: { form: any; setForm: any }) {
  const inp = (field: string, type = "text", placeholder = "") => (
    <input
      type={type}
      placeholder={placeholder}
      className={inputClass}
      style={inputStyle}
      value={form[field] || ""}
      onChange={(e) => setForm((f: any) => ({ ...f, [field]: e.target.value }))}
    />
  );
  return (
    <div className="space-y-3">
      <Field label="Project Name *">{inp("name", "text", "e.g. CivilAI Tower Phase 2")}</Field>
      <Field label="Client">{inp("client", "text", "e.g. ABC Corporation")}</Field>
      <Field label="Location">{inp("location", "text", "e.g. Dubai, UAE")}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Budget ($)">{inp("budget", "number", "e.g. 5000000")}</Field>
        <Field label="Status">
          <select className={inputClass} style={inputStyle}
            value={form.status || "active"}
            onChange={(e) => setForm((f: any) => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start Date">{inp("start_date", "date")}</Field>
        <Field label="End Date">{inp("end_date", "date")}</Field>
      </div>
    </div>
  );
}

function GlassModal({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void;
  title: string; subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: "rgba(4,11,25,0.92)",
              border: "1px solid rgba(0,212,255,0.15)",
              boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)",
              backdropFilter: "blur(32px)",
            }}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="font-semibold text-white text-[15px]">{title}</h3>
                {subtitle && <p className="text-[11px] text-white/35 mt-0.5">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors p-1 -mr-1 -mt-1">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function DashboardPage() {
  const { widgets } = useWidgetStore();
  const isVisible = (id: string) => widgets.find((w) => w.id === id)?.visible ?? true;
  const { counters, triggerRefresh } = useDataRefreshStore();
  const { setProjects: syncProjects } = useProjectStore();
  const [exporting, setExporting] = useState(false);
  const [summarizingPdf, setSummarizingPdf] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [newProject, setNewProject] = useState(emptyProject);
  const [kpiData, setKpiData] = useState<{
    total_budget: number; spent_to_date: number; committed_amount: number; avg_progress: number;
    active_workers: number; safety_score: number; incident_count: number;
  } | null>(null);
  const [progressData, setProgressData] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const [kpiTrends, setKpiTrends] = useState<{ workers: any[]; safety: any[]; committed: any[] }>({ workers: [], safety: [], committed: [] });
  const [projectView, setProjectView] = useState<"grid" | "compact">("grid");
  const [progressRange, setProgressRange] = useState<{ preset: string; start?: string; end?: string }>({ preset: "1y" });
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [progressProjectId, setProgressProjectId] = useState("all");
  const [costRange, setCostRange] = useState<{ preset: string; start?: string; end?: string }>({ preset: "1y" });
  const [showCostRangePicker, setShowCostRangePicker] = useState(false);
  const [customCostStart, setCustomCostStart] = useState("");
  const [customCostEnd, setCustomCostEnd] = useState("");
  const [costProjectId, setCostProjectId] = useState("all");

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [
    counters.workers, counters.safety, counters.documents, counters.projects,
    counters.cost, counters.schedule, counters.payments,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProgressChart(); }, [progressRange, progressProjectId, counters.schedule, counters.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCostChart(); }, [costRange, costProjectId, counters.cost, counters.projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildRangeParams = (range: { preset: string; start?: string; end?: string }) => {
    const params = new URLSearchParams();
    if (range.preset === "custom" && range.start && range.end) {
      params.set("start_date", range.start);
      params.set("end_date", range.end);
    } else {
      const preset = PROGRESS_PRESETS.find((p) => p.key === range.preset);
      params.set("months", String(preset?.months ?? 12));
    }
    return params;
  };

  const fetchProgressChart = async () => {
    try {
      const params = buildRangeParams(progressRange);
      if (progressProjectId !== "all") params.set("project_id", progressProjectId);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/progress?${params.toString()}`);
      setProgressData(res.data.data || []);
    } catch { /* keep previous chart data on failure */ }
  };

  const fetchCostChart = async () => {
    try {
      const params = buildRangeParams(costRange);
      if (costProjectId !== "all") params.set("project_id", costProjectId);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/costs?${params.toString()}`);
      setCostData(res.data.data || []);
    } catch { /* keep previous chart data on failure */ }
  };

  const fetchAll = async () => {
    setLoading(true);
    const [projectsRes, kpisRes, alertsRes, trendsRes] = await Promise.allSettled([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/kpis`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/alerts`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/kpi-trends`),
    ]);
    if (projectsRes.status === "fulfilled") { const f = projectsRes.value.data.projects || []; setProjects(f); syncProjects(f); }
    if (kpisRes.status === "fulfilled") setKpiData(kpisRes.value.data.kpis || null);
    if (alertsRes.status === "fulfilled") setLiveAlerts(alertsRes.value.data.alerts || []);
    if (trendsRes.status === "fulfilled") setKpiTrends({
      workers: trendsRes.value.data.workers || [],
      safety: trendsRes.value.data.safety || [],
      committed: trendsRes.value.data.committed || [],
    });
    setLoading(false);
  };

  const handleExportReport = async (project: any) => {
    setExporting(true);
    try {
      const [tasksRes, safetyRes, equipRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/schedule`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/safety`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/equipment`),
      ]);
      exportProjectReport(project, tasksRes.data.tasks || [], safetyRes.data.incidents || [], equipRes.data.equipment || []);
      toast.success("PDF exported!");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const handleSummarizeDashboardPDF = async () => {
    setSummarizingPdf(true);
    try {
      const summaryPrompt =
        "Summarize and analyze this entire construction dashboard for a printable report. " +
        "Cover overall budget, schedule progress, workforce, safety, active projects and live alerts. " +
        "Highlight key insights, risks, and 3-5 prioritized recommendations. Use bold section headings and bullet points. Data: " +
        JSON.stringify({
          kpis: kpiData,
          projects: projects.map((p) => ({
            name: p.name, status: p.status,
            progress: p.progress_percentage,
            budget: p.total_budget, spent: p.spent_to_date,
          })),
          alerts: liveAlerts.map((a) => a.text),
        });
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: summaryPrompt, chat_history: [],
      });
      exportAIReportPDF(res.data.response, "dashboard", "All Projects");
      toast.success("Dashboard summary PDF exported!");
    } catch {
      toast.error("Failed to generate dashboard summary");
    } finally {
      setSummarizingPdf(false);
    }
  };

  const handleAddProject = async () => {
    if (!newProject.name) { toast.error("Project name is required"); return; }
    setAdding(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`, {
        ...newProject, budget: parseFloat(newProject.budget) || 0,
        start_date: newProject.start_date || null, end_date: newProject.end_date || null,
      });
      toast.success("Project created!");
      triggerRefresh("projects");
      setShowAddProject(false);
      setNewProject(emptyProject);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create project");
    }
    finally { setAdding(false); }
  };

  const handleEditProject = async () => {
    if (!editingProject) return;
    setSaving(true);
    try {
      await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${editingProject.id}`,
        {
          ...editForm,
          budget: parseFloat(editForm.budget) || 0,
          start_date: editForm.start_date || null,
          end_date: editForm.end_date || null,
        });
      toast.success("Project updated!");
      triggerRefresh("projects");
      setEditingProject(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update project");
    }
    finally { setSaving(false); }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This will delete all related data.`)) return;
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${id}`);
      toast.success(`"${name}" deleted`);
      triggerRefresh("projects");
      fetchAll();
    } catch { toast.error("Failed to delete project"); }
    finally { setDeletingId(null); }
  };

  const tooltipStyle = {
    backgroundColor: "rgba(4,11,25,0.95)",
    border: "1px solid rgba(0,212,255,0.15)",
    borderRadius: "12px",
    color: "#e2e8f0",
    fontSize: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  };

  const greeting = getGreeting();

  // Widgets can be dragged into any order in the Customize panel; sections here
  // follow that order via CSS flex `order` rather than re-fetching/re-rendering.
  const sectionOrder = (ids: string[]) => {
    const idxs = ids.map((id) => { const i = widgets.findIndex((w) => w.id === id); return i === -1 ? 999 : i; });
    return Math.min(...idxs);
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ order: -1 }}
        className="flex items-center justify-between">
        <div>
          <p className="text-white/35 text-[13px] flex items-center gap-1.5">
            {greeting.text}
            <span>{greeting.emoji}</span>
          </p>
          <h1 className="text-4xl font-bold text-white mt-0.5 tracking-tight">
            Project Overview
          </h1>
        </div>
        <div className="flex items-center gap-2 relative">
          <WidgetCustomizer />
          <button
            onClick={handleSummarizeDashboardPDF}
            disabled={summarizingPdf}
            title="Summarize this page and download as PDF"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            {summarizingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            <span className="hidden sm:inline">Summarize PDF</span>
          </button>
          <button
            onClick={() => setShowAddProject(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,100,160,0.15))",
              border: "1px solid rgba(0,212,255,0.3)",
              boxShadow: "0 0 20px rgba(0,212,255,0.12)",
            }}
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </motion.div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <GlassModal open={showAddProject} onClose={() => setShowAddProject(false)} title="New Project">
        <ProjectFormFields form={newProject} setForm={setNewProject} />
        <div className="flex gap-3 mt-6">
          <button onClick={() => setShowAddProject(false)}
            className="flex-1 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Cancel
          </button>
          <button onClick={handleAddProject} disabled={adding}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Project
          </button>
        </div>
      </GlassModal>

      <GlassModal open={!!editingProject} onClose={() => setEditingProject(null)}
        title="Edit Project" subtitle={editingProject?.name}>
        <ProjectFormFields form={editForm} setForm={setEditForm} />
        <div className="flex gap-3 mt-6">
          <button onClick={() => setEditingProject(null)}
            className="flex-1 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Cancel
          </button>
          <button onClick={handleEditProject} disabled={saving}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all hover:scale-105"
            style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </GlassModal>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      {(isVisible("kpi-budget") || isVisible("kpi-committed") || isVisible("kpi-schedule") || isVisible("kpi-workers") || isVisible("kpi-safety")) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          style={{ order: sectionOrder(["kpi-budget", "kpi-committed", "kpi-schedule", "kpi-workers", "kpi-safety"]) }}>
          {loading || !kpiData ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card p-5">
                <div className="flex items-start justify-between mb-4">
                  <Skeleton className="w-11 h-11 rounded-xl" />
                  <Skeleton className="w-20 h-6 rounded-full" />
                </div>
                <Skeleton className="w-28 h-8 rounded mb-2" />
                <Skeleton className="w-20 h-3 rounded" />
              </div>
            ))
          ) : (() => {
            const budgetNum = kpiData.total_budget >= 1_000_000
              ? kpiData.total_budget / 1_000_000
              : kpiData.total_budget / 1_000;
            const budgetSuffix = kpiData.total_budget >= 1_000_000 ? "M" : "K";
            const committedNum = kpiData.committed_amount >= 1_000_000
              ? kpiData.committed_amount / 1_000_000
              : kpiData.committed_amount / 1_000;
            const committedSuffix = kpiData.committed_amount >= 1_000_000 ? "M" : "K";
            const dynamicKpis = [
              {
                id: "kpi-budget", title: "Total Budget",
                numValue: budgetNum, prefix: "$", suffix: budgetSuffix, decimals: 1,
                change: `${projects.length} project${projects.length !== 1 ? "s" : ""}`,
                trend: "up", icon: DollarSign, accent: "cyan", href: "/cost",
                trendData: costData.map((d) => d.actual),
              },
              {
                id: "kpi-committed", title: "Committed Spend",
                numValue: committedNum, prefix: "$", suffix: committedSuffix, decimals: 1,
                change: "Pending / overdue invoices",
                trend: "up", icon: DollarSign, accent: "blue", href: "/payments",
                trendData: kpiTrends.committed.map((d) => d.value),
              },
              {
                id: "kpi-schedule", title: "Schedule Progress",
                numValue: kpiData.avg_progress, suffix: "%", decimals: 0,
                change: kpiData.avg_progress >= 60 ? "On track" : "Behind schedule",
                trend: kpiData.avg_progress >= 60 ? "up" : "down", icon: Calendar, accent: "amber", href: "/scheduling",
                trendData: progressData.map((d) => d.actual),
              },
              {
                id: "kpi-workers", title: "Active Workers",
                numValue: kpiData.active_workers, suffix: "", decimals: 0,
                change: "Across all projects",
                trend: "up", icon: Users, accent: "green", href: "/workforce",
                trendData: kpiTrends.workers.map((d) => d.value),
              },
              {
                id: "kpi-safety", title: "Safety Score",
                numValue: kpiData.safety_score, suffix: "/100", decimals: 0,
                change: `${kpiData.incident_count} incident${kpiData.incident_count !== 1 ? "s" : ""}`,
                trend: kpiData.safety_score >= 80 ? "up" : "down", icon: Shield, accent: "red", href: "/safety",
                trendData: kpiTrends.safety.map((d) => d.value),
              },
            ];
            return dynamicKpis.filter(k => isVisible(k.id)).map((kpi, i) => {
              const a = ACCENT[kpi.accent];
              return (
                <Link href={kpi.href} key={kpi.id} className="h-full block">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
                    className="glass-card p-5 cursor-pointer group relative overflow-hidden h-full flex flex-col"
                    style={{ borderColor: a.border }}
                  >
                    {/* Subtle inner gradient */}
                    <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />

                    <div className="relative flex items-start justify-between mb-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                        <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                      </div>
                      <div className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full`}
                        style={{
                          background: kpi.trend === "up" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                          color: kpi.trend === "up" ? "#10B981" : "#EF4444",
                          border: kpi.trend === "up" ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
                        }}>
                        {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {kpi.change}
                      </div>
                    </div>

                    <CountUp
                      to={kpi.numValue}
                      prefix={kpi.prefix ?? ""}
                      suffix={kpi.suffix}
                      decimals={kpi.decimals}
                      className="stat-number text-[28px] font-bold block"
                      style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` } as React.CSSProperties}
                    />
                    <p className="text-[13px] text-white/40 mt-1">{kpi.title}</p>
                    <div className="relative -mx-1 mt-2 opacity-70 flex-1 flex items-end">
                      {kpi.trendData.length >= 2 && <Sparkline data={kpi.trendData} color={a.text} />}
                    </div>
                  </motion.div>
                </Link>
              );
            });
          })()}
        </div>
      )}

      {/* ── Active Projects ──────────────────────────────────────────────── */}
      {isVisible("projects") && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }} className="glass-card p-6"
          style={{ order: sectionOrder(["projects"]) }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                <Building2 className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="font-semibold text-white text-[15px]">Active Projects</h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981" }}>
                {projects.length} Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {(["grid", "compact"] as const).map((v) => (
                  <button key={v} onClick={() => setProjectView(v)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors"
                    style={projectView === v
                      ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF" }
                      : { color: "rgba(255,255,255,0.35)" }}>
                    {v}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddProject(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.18)", color: "#00D4FF" }}>
                <Plus className="w-3.5 h-3.5" />
                Add Project
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="w-24 h-4 rounded" />
                    <Skeleton className="w-14 h-4 rounded-full" />
                  </div>
                  <Skeleton className="w-32 h-3 rounded mb-3" />
                  <Skeleton className="w-full h-1 rounded-full mb-3" />
                  <div className="space-y-2">
                    <Skeleton className="w-full h-3 rounded" />
                    <Skeleton className="w-full h-3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-10">
              <Building2 className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-[13px] text-white/30">No projects yet</p>
              <button onClick={() => setShowAddProject(true)}
                className="mt-4 px-4 py-2 rounded-xl text-[12px] font-medium text-white"
                style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.25)" }}>
                Create First Project
              </button>
            </div>
          ) : projectView === "compact" ? (
            <div className="space-y-1.5">
              {projects.map((project, i) => {
                const pct = project.progress_percentage || 0;
                const barColor = pct >= 70 ? "#10B981" : pct >= 40 ? "#00D4FF" : "#F59E0B";
                return (
                  <motion.div key={project.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p className="font-medium text-white text-[12px] truncate flex-1 min-w-0">{project.name}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium"
                      style={{
                        background: project.status === "active" ? "rgba(16,185,129,0.12)" : project.status === "planning" ? "rgba(0,212,255,0.12)" : project.status === "completed" ? "rgba(139,92,246,0.12)" : "rgba(245,158,11,0.12)",
                        color: project.status === "active" ? "#10B981" : project.status === "planning" ? "#00D4FF" : project.status === "completed" ? "#8B5CF6" : "#F59E0B",
                      }}>
                      {project.status}
                    </span>
                    <div className="w-20 h-1 rounded-full shrink-0 hidden sm:block" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span className="text-[11px] font-medium shrink-0 w-9 text-right" style={{ color: barColor }}>{pct}%</span>
                    <span className="text-[11px] text-white/40 shrink-0 hidden md:block w-16 text-right">
                      ${((project.total_budget || 0) / 1_000_000).toFixed(1)}M
                    </span>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingProject(project); setEditForm({ name: project.name, client: project.client || "", location: project.location || "", budget: project.total_budget || 0, status: project.status || "active", start_date: project.start_date || "", end_date: project.end_date || "" }); }}
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ background: "rgba(0,212,255,0.1)" }}>
                        <Edit2 className="w-3 h-3 text-cyan-400" />
                      </button>
                      <button onClick={() => handleDeleteProject(project.id, project.name)} disabled={deletingId === project.id}
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ background: "rgba(239,68,68,0.1)" }}>
                        {deletingId === project.id ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" /> : <Trash2 className="w-3 h-3 text-red-400" />}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {projects.map((project, i) => {
                const pct = project.progress_percentage || 0;
                const barColor = pct >= 70 ? "#10B981" : pct >= 40 ? "#00D4FF" : "#F59E0B";
                return (
                  <motion.div key={project.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }} whileHover={{ y: -2 }}
                    className="relative group rounded-xl p-4 transition-all"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,212,255,0.15)"; (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                  >
                    {/* Action buttons + status */}
                    <div className="absolute top-3 right-3 flex items-center gap-1">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleExportReport(project)} disabled={exporting}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                          {exporting ? <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" /> : <span className="text-emerald-400 text-xs font-bold">↓</span>}
                        </button>
                        <button onClick={() => { setEditingProject(project); setEditForm({ name: project.name, client: project.client || "", location: project.location || "", budget: project.total_budget || 0, status: project.status || "active", start_date: project.start_date || "", end_date: project.end_date || "" }); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                          <Edit2 className="w-3 h-3 text-cyan-400" />
                        </button>
                        <button onClick={() => handleDeleteProject(project.id, project.name)} disabled={deletingId === project.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                          {deletingId === project.id ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" /> : <Trash2 className="w-3 h-3 text-red-400" />}
                        </button>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium"
                        style={{
                          background: project.status === "active" ? "rgba(16,185,129,0.12)" : project.status === "planning" ? "rgba(0,212,255,0.12)" : project.status === "completed" ? "rgba(139,92,246,0.12)" : "rgba(245,158,11,0.12)",
                          color: project.status === "active" ? "#10B981" : project.status === "planning" ? "#00D4FF" : project.status === "completed" ? "#8B5CF6" : "#F59E0B",
                          border: `1px solid ${project.status === "active" ? "rgba(16,185,129,0.2)" : project.status === "planning" ? "rgba(0,212,255,0.2)" : project.status === "completed" ? "rgba(139,92,246,0.2)" : "rgba(245,158,11,0.2)"}`,
                        }}>
                        {project.status}
                      </span>
                    </div>

                    <div className="flex items-center mb-2 pr-4">
                      <p className="font-semibold text-white text-[13px] truncate">{project.name}</p>
                    </div>

                    {project.client && <p className="text-[11px] text-white/35 mb-0.5">{project.client}</p>}
                    {project.location && (
                      <div className="flex items-center gap-1 mb-3">
                        <MapPin className="w-3 h-3 text-white/25" />
                        <p className="text-[11px] text-white/30">{project.location}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/35">Progress</span>
                        <span className="font-medium" style={{ color: barColor }}>{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.3 + i * 0.1, duration: 0.9, ease: "easeOut" }}
                          className="h-1 rounded-full"
                          style={{ background: barColor, boxShadow: `0 0 8px ${barColor}60` }}
                        />
                      </div>
                      {[
                        { label: "Budget", value: `$${((project.total_budget || 0) / 1_000_000).toFixed(1)}M` },
                        { label: "Spent",  value: `$${((project.spent_to_date || 0) / 1_000_000).toFixed(1)}M` },
                        ...(project.start_date ? [{ label: "Timeline", value: `${project.start_date} → ${project.end_date || "TBD"}` }] : []),
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between text-[11px]">
                          <span className="text-white/30">{label}</span>
                          <span className="text-white/60 font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      {(isVisible("chart-progress") || isVisible("chart-cost")) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"
          style={{ order: sectionOrder(["chart-progress", "chart-cost"]) }}>
          {isVisible("chart-progress") && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }} className="glass-card p-6">
              <div className="flex items-center justify-between mb-5 relative flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold text-white text-[14px]">Project Progress</h3>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    Planned vs Actual %
                    {progressProjectId !== "all" && (
                      <span className="text-cyan-400 font-medium">
                        {" "}— {projects.find((p) => p.id === progressProjectId)?.name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ChartProjectSelect projects={projects} value={progressProjectId} onChange={setProgressProjectId} />
                  <ChartRangePicker
                    range={progressRange}
                    onSelectPreset={(key) => setProgressRange({ preset: key })}
                    showPicker={showRangePicker}
                    setShowPicker={setShowRangePicker}
                    customStart={customStart} setCustomStart={setCustomStart}
                    customEnd={customEnd} setCustomEnd={setCustomEnd}
                    onApplyCustom={() => {
                      if (!customStart || !customEnd) { toast.error("Pick both dates"); return; }
                      setProgressRange({ preset: "custom", start: customStart, end: customEnd });
                      setShowRangePicker(false);
                    }}
                  />
                </div>
              </div>
              {progressData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-white/25">
                  <TrendingUp className="w-8 h-8 mb-2" />
                  <p className="text-[12px]">No schedule data — add tasks to see progress</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={progressData}>
                      <defs>
                        <linearGradient id="gPlanned" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="planned" stroke="#00D4FF" fill="url(#gPlanned)" strokeWidth={2} name="Planned" />
                      <Area type="monotone" dataKey="actual"  stroke="#10B981" fill="url(#gActual)"  strokeWidth={2} name="Actual" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-5 mt-3">
                    {[{ color: "#00D4FF", label: "Planned" }, { color: "#10B981", label: "Actual" }].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                        <span className="text-[11px] text-white/35">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {isVisible("chart-cost") && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }} className="glass-card p-6">
              <div className="flex items-center justify-between mb-5 relative flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold text-white text-[14px]">Cost Analysis</h3>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    Budget vs Actual ($K)
                    {costProjectId !== "all" && (
                      <span className="text-amber-400 font-medium">
                        {" "}— {projects.find((p) => p.id === costProjectId)?.name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ChartProjectSelect projects={projects} value={costProjectId} onChange={setCostProjectId} />
                  <ChartRangePicker
                    range={costRange}
                    onSelectPreset={(key) => setCostRange({ preset: key })}
                    showPicker={showCostRangePicker}
                    setShowPicker={setShowCostRangePicker}
                    customStart={customCostStart} setCustomStart={setCustomCostStart}
                    customEnd={customCostEnd} setCustomEnd={setCustomCostEnd}
                    onApplyCustom={() => {
                      if (!customCostStart || !customCostEnd) { toast.error("Pick both dates"); return; }
                      setCostRange({ preset: "custom", start: customCostStart, end: customCostEnd });
                      setShowCostRangePicker(false);
                    }}
                  />
                </div>
              </div>
              {costData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-white/25">
                  <TrendingDown className="w-8 h-8 mb-2" />
                  <p className="text-[12px]">No cost data — add cost entries to see analysis</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={costData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                      <Bar dataKey="budget" fill="rgba(0,212,255,0.12)" stroke="#00D4FF" strokeWidth={1} radius={[6, 6, 0, 0]} name="Budget" />
                      <Bar dataKey="actual" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Actual" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-5 mt-3">
                    {[{ color: "#00D4FF", label: "Budget" }, { color: "#F59E0B", label: "Actual" }].map(({ color, label }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                        <span className="text-[11px] text-white/35">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* ── Alerts + Quick Access ────────────────────────────────────────── */}
      {(isVisible("alerts") || isVisible("modules")) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5"
          style={{ order: sectionOrder(["alerts", "modules"]) }}>
          {isVisible("alerts") && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }} className="lg:col-span-2 glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-[14px]">Live Alerts</h3>
                <span className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                  style={liveAlerts.length > 0
                    ? { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}>
                  {liveAlerts.length} Active
                </span>
              </div>
              {liveAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-white/25">
                  <CheckCircle className="w-8 h-8 mb-2 text-emerald-400/60" />
                  <p className="text-[12px]">No recent alerts — all clear</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {liveAlerts.map((alert: any, i: number) => {
                    const isError = alert.type === "error", isWarning = alert.type === "warning", isSuccess = alert.type === "success";
                    const Icon  = isSuccess ? CheckCircle : isError ? AlertTriangle : Clock;
                    const color = isSuccess ? "#10B981" : isError ? "#EF4444" : isWarning ? "#F59E0B" : "#00D4FF";
                    const href = MODULE_HREF[String(alert.module || "").toLowerCase()];
                    const row = (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.06 }}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all ${href ? "cursor-pointer" : ""}`}
                        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.045)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                          <Icon className="w-4 h-4" style={{ color }} />
                        </div>
                        <p className="text-[12px] text-white/70 flex-1">{alert.text}</p>
                        <span className="text-[10px] text-white/25 whitespace-nowrap">{alert.time}</span>
                        {href && <ArrowRight className="w-3 h-3 text-white/20 shrink-0" />}
                      </motion.div>
                    );
                    return href
                      ? <Link href={href} key={alert.id || i}>{row}</Link>
                      : <div key={alert.id || i}>{row}</div>;
                  })}
                </div>
              )}
            </motion.div>
          )}

          {isVisible("modules") && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }} className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-white text-[14px]">Quick Access</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modules.map((mod, i) => {
                  const a = ACCENT[mod.accent];
                  return (
                    <Link key={i} href={mod.href}>
                      <motion.div whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all h-full"
                        style={{ background: a.bg, border: `1px solid ${a.border}` }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${a.text}15`, boxShadow: `0 0 12px ${a.shadow}` }}>
                          <mod.icon className="w-4 h-4" style={{ color: a.text }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-white truncate">{mod.title}</p>
                          <p className="text-[11px] text-white/35">{mod.desc}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-white/25 shrink-0" />
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      <div style={{ order: 999 }}>
        <ModuleChat
          context="Project Dashboard"
          placeholder="Ask about your projects..."
          pageSummaryData={{
            totalProjects: projects.length,
            projects: projects.map(p => ({ name: p.name, progress: p.progress_percentage, budget: p.total_budget, spent: p.spent_to_date, status: p.status })),
          }}
        />
      </div>
    </div>
  );
}
