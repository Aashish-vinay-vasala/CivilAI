"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const ResourceLevelingPage = dynamic(() => import("../resource-leveling/page"), { ssr: false });

const WORKFORCE_TABS = [
  { id: "overview", label: "Team" },
  { id: "resources", label: "Resource Leveling" },
];

import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, TrendingDown, Upload, Loader2, UserPlus,
  Phone, Briefcase, Clock, CheckCircle, XCircle,
  Search, X, Trash2, Target, AlertTriangle, Pencil,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { useWorkforceFilterStore } from "@/lib/stores/workforceFilterStore";
import ModuleChat from "@/components/shared/ModuleChat";
import { MarkdownText } from "@/lib/renderMarkdown";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";

const WORKFORCE_MODULE_TABS = [
  { href: "/workforce", label: "Workforce" },
  { href: "/equipment", label: "Equipment" },
  { href: "/vendors", label: "Vendors" },
];

interface Worker {
  id: string;
  project_id?: string;
  name: string;
  role: string;
  trade: string;
  status: string;
  hours_worked: number;
  phone: string;
  email?: string;
}

interface WorkforceStats {
  total_workers: number;
  active_workers: number;
  on_leave: number;
  inactive: number;
  trade_distribution: Record<string, number>;
  total_hours_today: number;
}

// ─── Shared glass button styles (mirrors Cost & Safety pages) ─

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const ghostBtn =
  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const solidGreenBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60";
const solidAmberBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-60";
const avatarGradient = { background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)" };

export default function WorkforcePage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [subTab, setSubTab] = useState("overview");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stats, setStats] = useState<WorkforceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [mlTurnover, setMlTurnover] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [analysis, setAnalysis] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [editWorkerId, setEditWorkerId] = useState<string | null>(null);
  const [editWorker, setEditWorker] = useState({
    name: "", role: "", trade: "", phone: "", email: "", status: "active", hours_worked: 0, project_id: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [plan, setPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [onboardWorker, setOnboardWorker] = useState({ name: "", role: "", experience_years: 0, start_date: "" });
  const [newWorker, setNewWorker] = useState({
    name: "", role: "", trade: "", phone: "", email: "", status: "active", hours_worked: 0, project_id: "",
  });
  const [skillTargets, setSkillTargets] = useState<Record<string, number>>({});
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState(70);
  const [extractedWorkers, setExtractedWorkers] = useState<any[]>([]);
  const [extractLoading, setExtractLoading] = useState(false);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);

  const [skillMatchOpen, setSkillMatchOpen] = useState(false);
  const [skillMatchLoading, setSkillMatchLoading] = useState(false);
  const [skillMatchResult, setSkillMatchResult] = useState("");
  const [jobReq, setJobReq] = useState({ role: "", trade: "", min_experience_years: 0, notes: "" });

  const [turnoverOpen, setTurnoverOpen] = useState(false);
  const [turnoverLoading, setTurnoverLoading] = useState(false);
  const [turnoverResult, setTurnoverResult] = useState("");

  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const selectedProjectId = useWorkforceFilterStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useWorkforceFilterStore((s) => s.setSelectedProjectId);

  useEffect(() => { fetchAll(); }, []);

  const saveTarget = async (skill: string, value: number) => {
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/skill-targets/${encodeURIComponent(skill)}`,
        { required_pct: value }
      );
      setSkillTargets(prev => ({ ...prev, [skill]: value }));
      toast.success(`Target for ${skill} set to ${value}%`);
    } catch { toast.error("Failed to update target"); }
    setEditingSkill(null);
  };

  const fetchAll = async () => {
    setStatsLoading(true);
    try {
      const [workersRes, statsRes, targetsRes, projectsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/stats`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/skill-targets`).catch(() => ({ data: { targets: {} } })),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`).catch(() => ({ data: { projects: [] } })),
      ]);
      setWorkers(workersRes.data.workers || []);
      setStats(statsRes.data.stats || null);
      setSkillTargets(targetsRes.data.targets || {});
      setAllProjects(projectsRes.data.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
    // ML prediction runs separately so it doesn't block the page
    setMlLoading(true);
    try {
      const mlRes = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/turnover`, {
        role: "Laborer", experience_years: 2, salary: 35000,
        performance_score: 65, safety_violations: 2,
        training_hours: 10, overtime_hours: 30, tenure_months: 8,
      });
      setMlTurnover(mlRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setMlLoading(false);
    }
  };

  const handleExtractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExtractLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/extract-members`, formData);
      const found = res.data.extracted_members ?? [];
      setExtractedWorkers(found);
      toast.success(found.length > 0 ? `Found ${found.length} worker(s) — review below.` : "No workers found in document.");
    } catch { toast.error("Failed to extract workers from file"); }
    finally { setExtractLoading(false); }
  };

  const addExtractedWorker = async (w: any, idx: number) => {
    if (!selectedProjectId || selectedProjectId === "all") { toast.error("Select a project first!"); return; }
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`, { ...w, project_id: selectedProjectId });
      setExtractedWorkers(prev => prev.filter((_, i) => i !== idx));
      toast.success(`${w.name} added`);
      fetchAll();
    } catch { toast.error(`Failed to add ${w.name}`); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedWorkers = async () => {
    if (!selectedProjectId || selectedProjectId === "all") { toast.error("Select a project first!"); return; }
    setAddingExtracted("all");
    let added = 0;
    for (const w of extractedWorkers) {
      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`, { ...w, project_id: selectedProjectId });
        added++;
      } catch { /* skip */ }
    }
    setExtractedWorkers([]);
    toast.success(`Added ${added} worker(s)`);
    fetchAll();
    setAddingExtracted(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/analyze`, formData);
      setAnalysis(response.data.analysis);
      toast.success("Workforce data analyzed!");
    } catch { toast.error("Failed to analyze"); }
    finally { setUploadLoading(false); }
  };

  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/onboarding-plan`, onboardWorker);
      setPlan(response.data.plan);
      toast.success("Onboarding plan generated!");
    } catch { toast.error("Failed to generate plan"); }
    finally { setPlanLoading(false); }
  };

  const runSkillMatch = async () => {
    if (projectWorkers.length === 0) { toast.error("Add workers first"); return; }
    setSkillMatchLoading(true);
    try {
      const job_requirements: Record<string, any> = {};
      if (jobReq.role) job_requirements.role = jobReq.role;
      if (jobReq.trade) job_requirements.trade = jobReq.trade;
      if (jobReq.min_experience_years) job_requirements.min_experience_years = jobReq.min_experience_years;
      if (jobReq.notes) job_requirements.notes = jobReq.notes;
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/match-skills`, {
        job_requirements,
        available_workers: projectWorkers.map(w => ({
          name: w.name, role: w.role, trade: w.trade, status: w.status, hours_worked: w.hours_worked,
        })),
      });
      setSkillMatchResult(response.data.matches);
      toast.success("Skill match complete!");
    } catch { toast.error("Failed to match skills"); }
    finally { setSkillMatchLoading(false); }
  };

  const runTurnoverPredict = async () => {
    if (projectWorkers.length === 0) { toast.error("Add workers first"); return; }
    setTurnoverLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/predict-turnover`, {
        workers: projectWorkers.map(w => ({
          name: w.name, role: w.role, trade: w.trade, status: w.status, hours_worked: w.hours_worked,
        })),
      });
      setTurnoverResult(response.data.prediction);
      toast.success("Turnover risk predicted!");
    } catch { toast.error("Failed to predict turnover"); }
    finally { setTurnoverLoading(false); }
  };

  const addWorker = async () => {
    if (!newWorker.name || !newWorker.role) { toast.error("Name and role are required!"); return; }
    if (!newWorker.project_id) { toast.error("Select a project!"); return; }
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`, newWorker);
      setNewWorker({ name: "", role: "", trade: "", phone: "", email: "", status: "active", hours_worked: 0, project_id: newWorker.project_id });
      setAddWorkerOpen(false);
      toast.success("Worker added!");
      triggerRefresh("workers");
      fetchAll();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const detailMsg = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join("; ")
        : typeof detail === "string" ? detail : null;
      toast.error(detailMsg ? `Failed to add worker: ${detailMsg}` : "Failed to add worker");
      // Log primitives so the Next.js overlay can't serialize them away
      console.error("Add worker error — message:", String(err?.message ?? err ?? "(unknown)"));
      console.error("Add worker error — status:", err?.response?.status ?? "(no response)");
      console.error("Add worker error — data:", JSON.stringify(err?.response?.data ?? null));
      console.error("Add worker error — raw:", err);
    }
  };

  const deleteWorker = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers/${id}`);
      toast.success("Worker removed");
      triggerRefresh("workers");
      fetchAll();
    } catch { toast.error("Failed to delete worker"); }
    finally { setDeletingId(null); }
  };

  const openEditWorker = (w: Worker) => {
    setEditWorker({
      name: w.name, role: w.role, trade: w.trade || "", phone: w.phone || "",
      email: w.email || "", status: w.status, hours_worked: w.hours_worked ?? 0,
      project_id: w.project_id || "",
    });
    setEditWorkerId(w.id);
  };

  const updateWorker = async () => {
    if (!editWorkerId) return;
    if (!editWorker.name || !editWorker.role) { toast.error("Name and role are required!"); return; }
    if (!editWorker.project_id) { toast.error("Select a project!"); return; }
    setSavingEdit(true);
    try {
      await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers/${editWorkerId}`, editWorker);
      toast.success("Worker updated!");
      setEditWorkerId(null);
      triggerRefresh("workers");
      fetchAll();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const detailMsg = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join("; ")
        : typeof detail === "string" ? detail : null;
      toast.error(detailMsg ? `Failed to update worker: ${detailMsg}` : "Failed to update worker");
    } finally {
      setSavingEdit(false);
    }
  };

  // Workers scoped to the selected project (mirrors the same selectedProjectId
  // used by Resource Leveling) so KPIs/charts stay in sync with the table below
  // instead of always reflecting totals across every project.
  const projectWorkers = workers.filter(w => selectedProjectId === "all" || w.project_id === selectedProjectId);

  const scopedStats: WorkforceStats | null = stats && (() => {
    const total = projectWorkers.length;
    const active = projectWorkers.filter(w => w.status === "active").length;
    const onleave = projectWorkers.filter(w => w.status === "onleave").length;
    const trade_distribution: Record<string, number> = {};
    for (const w of projectWorkers) {
      const t = (w.trade || "General").trim() || "General";
      trade_distribution[t] = (trade_distribution[t] || 0) + 1;
    }
    return {
      total_workers: total,
      active_workers: active,
      on_leave: onleave,
      inactive: total - active - onleave,
      trade_distribution,
      total_hours_today: Math.round(projectWorkers.reduce((sum, w) => sum + (w.hours_worked || 0), 0) * 10) / 10,
    };
  })();

  // Skills Gap — trade names from DB are the skill categories; required% from Supabase skill_targets (default 70)
  const skillsData = (() => {
    if (!scopedStats || scopedStats.total_workers === 0) return [];
    const total = scopedStats.total_workers;
    return Object.entries(scopedStats.trade_distribution).map(([trade, count]) => ({
      skill: trade,
      available: Math.round((count as number) / total * 100),
      required: skillTargets[trade] ?? 70,
    }));
  })();

  // Bar chart data from real trade distribution
  const tradeChartData = scopedStats
    ? Object.entries(scopedStats.trade_distribution).map(([trade, count]) => ({ trade, count }))
    : [];

  const filteredWorkers = projectWorkers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = w.name.toLowerCase().includes(q) ||
      w.role.toLowerCase().includes(q) ||
      (w.trade || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status: string) => {
    if (status === "active") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "onleave") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  const getStatusIcon = (status: string) => {
    if (status === "active") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "onleave") return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  };

  const totalWorkers = scopedStats?.total_workers ?? 0;
  const activeToday = scopedStats?.active_workers ?? 0;
  const inactiveCount = scopedStats?.inactive ?? 0;
  const inactiveRate = totalWorkers > 0 ? Math.round(inactiveCount / totalWorkers * 100) : 0;
  const avgUtilization = activeToday > 0 && scopedStats
    ? Math.min(100, Math.round(scopedStats.total_hours_today / (activeToday * 8) * 100))
    : 0;

  const kpis = [
    {
      label: "Total Workers", value: `${totalWorkers}`,
      change: `${scopedStats?.on_leave ?? 0} on leave`,
      trend: "up" as const, accent: "blue" as const, icon: Users,
    },
    {
      label: "Active Today", value: `${activeToday}`,
      change: `${totalWorkers > 0 ? Math.round(activeToday / totalWorkers * 100) : 0}% of workforce`,
      trend: "up" as const, accent: "green" as const, icon: CheckCircle,
    },
    {
      label: "Inactive Rate", value: `${inactiveRate}%`,
      change: `${inactiveCount} workers`,
      trend: (inactiveRate <= 10 ? "up" : "down") as "up" | "down", accent: "amber" as const, icon: XCircle,
    },
    {
      label: "Avg Utilization", value: `${avgUtilization}%`,
      change: `${scopedStats?.total_hours_today ?? 0}h logged today`,
      trend: (avgUtilization >= 70 ? "up" : "down") as "up" | "down", accent: "cyan" as const, icon: Clock,
    },
  ];

  const tabBtnStyle = (active: boolean) => active
    ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
    : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" };

  const tabBar = (
    <div className="flex gap-0.5 p-1 rounded-xl w-fit"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {WORKFORCE_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors"
          style={tabBtnStyle(subTab === t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      <div className="pb-4">{tabBar}</div>
      {subTab === "resources" && <div className="pt-2"><ResourceLevelingPage /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      {tabBar}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Workforce</h1>
          <p className="text-white/35 text-[13px] mt-1">AI-powered workforce management &amp; planning</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {allProjects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3.5 py-2 rounded-xl text-sm text-white/70 hover:text-white outline-none transition-all border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]"
              style={glassInputStyle}
            >
              <option value="all">All Projects</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => {
            setNewWorker(w => ({ ...w, project_id: selectedProjectId !== "all" ? selectedProjectId : w.project_id }));
            setAddWorkerOpen(true);
          }}>
            <UserPlus className="w-4 h-4 text-emerald-400" />Add Worker
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setOnboardingOpen(!onboardingOpen)}>
            <UserPlus className="w-4 h-4 text-blue-400" />Onboard
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setSkillMatchOpen(!skillMatchOpen)}>
            <Target className="w-4 h-4 text-cyan-400" />Match Skills
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setTurnoverOpen(!turnoverOpen)}>
            <AlertTriangle className="w-4 h-4 text-amber-400" />Turnover Risk
          </button>
          <input ref={extractFileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={handleExtractUpload} />
          <button className={primaryBtn} style={gradientButtonStyle} disabled={extractLoading} onClick={() => extractFileRef.current?.click()}>
            {extractLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <span className={ghostBtn} style={glassButtonStyle}>
              {uploadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Analyze
            </span>
          </label>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="w-20 h-4 rounded mb-3" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="w-16 h-7 rounded mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="w-24 h-3 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
          ))
        ) : (
          kpis.map((kpi, i) => {
            const a = ACCENT[kpi.accent];
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
                className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}>
                <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
                <div className="relative flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                    <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: kpi.trend === "up" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      color: kpi.trend === "up" ? "#10B981" : "#EF4444",
                      border: kpi.trend === "up" ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)",
                    }}>
                    {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {kpi.change}
                  </div>
                </div>
                <p className="relative text-[28px] font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
                <p className="relative text-[13px] text-white/40 mt-1">{kpi.label}</p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Add Worker Panel */}
      <AnimatePresence>
        {addWorkerOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.green.border }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Add New Worker</h3>
              <button onClick={() => setAddWorkerOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Project *</label>
                <select value={newWorker.project_id}
                  onChange={(e) => setNewWorker({ ...newWorker, project_id: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                  <option value="">Select project</option>
                  {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Full Name *</label>
                <input placeholder="Worker name" value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Role *</label>
                <input placeholder="e.g. Electrician" value={newWorker.role}
                  onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Trade</label>
                <input
                  list="trades-datalist"
                  placeholder="e.g. Civil, MEP, Safety..."
                  value={newWorker.trade}
                  onChange={(e) => setNewWorker({ ...newWorker, trade: e.target.value })}
                  className={glassInputClass} style={glassInputStyle}
                />
                <datalist id="trades-datalist">
                  {Object.keys(stats?.trade_distribution || {}).map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Phone</label>
                <input placeholder="+1 555-0000" value={newWorker.phone}
                  onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Email</label>
                <input type="email" placeholder="name@company.com" value={newWorker.email}
                  onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Status</label>
                <select value={newWorker.status}
                  onChange={(e) => setNewWorker({ ...newWorker, status: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                  <option value="active">Active</option>
                  <option value="onleave">On Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Hours Today</label>
                <input type="number" min="0" max="24" value={newWorker.hours_worked}
                  onChange={(e) => setNewWorker({ ...newWorker, hours_worked: parseInt(e.target.value, 10) || 0 })}
                  className={glassInputClass} style={glassInputStyle} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addWorker} className={solidGreenBtn}>
                <UserPlus className="w-4 h-4" />Add Worker
              </button>
              <button className={ghostBtn} style={glassButtonStyle} onClick={() => setAddWorkerOpen(false)}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Worker Panel */}
      <AnimatePresence>
        {editWorkerId && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Edit Worker</h3>
              <button onClick={() => setEditWorkerId(null)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Project *</label>
                <select value={editWorker.project_id}
                  onChange={(e) => setEditWorker({ ...editWorker, project_id: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                  <option value="">Select project</option>
                  {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Full Name *</label>
                <input placeholder="Worker name" value={editWorker.name}
                  onChange={(e) => setEditWorker({ ...editWorker, name: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Role *</label>
                <input placeholder="e.g. Electrician" value={editWorker.role}
                  onChange={(e) => setEditWorker({ ...editWorker, role: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Trade</label>
                <input
                  list="trades-datalist"
                  placeholder="e.g. Civil, MEP, Safety..."
                  value={editWorker.trade}
                  onChange={(e) => setEditWorker({ ...editWorker, trade: e.target.value })}
                  className={glassInputClass} style={glassInputStyle}
                />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Phone</label>
                <input placeholder="+1 555-0000" value={editWorker.phone}
                  onChange={(e) => setEditWorker({ ...editWorker, phone: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Email</label>
                <input type="email" placeholder="name@company.com" value={editWorker.email}
                  onChange={(e) => setEditWorker({ ...editWorker, email: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Status</label>
                <select value={editWorker.status}
                  onChange={(e) => setEditWorker({ ...editWorker, status: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                  <option value="active">Active</option>
                  <option value="onleave">On Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/35 mb-1.5 block">Hours Today</label>
                <input type="number" min="0" max="24" value={editWorker.hours_worked}
                  onChange={(e) => setEditWorker({ ...editWorker, hours_worked: parseInt(e.target.value, 10) || 0 })}
                  className={glassInputClass} style={glassInputStyle} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={updateWorker} disabled={savingEdit} className={primaryBtn} style={gradientButtonStyle}>
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                Save Changes
              </button>
              <button className={ghostBtn} style={glassButtonStyle} onClick={() => setEditWorkerId(null)}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Panel */}
      <AnimatePresence>
        {onboardingOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.blue.border }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">AI Onboarding Plan Generator</h3>
              <button onClick={() => setOnboardingOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="Worker name" value={onboardWorker.name}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, name: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              <input placeholder="Role / Position" value={onboardWorker.role}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, role: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              <input type="number" placeholder="Years of experience" value={onboardWorker.experience_years}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, experience_years: parseInt(e.target.value) || 0 })}
                className={glassInputClass} style={glassInputStyle} />
              <input type="date" value={onboardWorker.start_date}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, start_date: e.target.value })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <button onClick={generatePlan} disabled={planLoading} className={primaryBtn} style={gradientButtonStyle}>
              {planLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Generate Plan
            </button>
            {plan && (
              <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                <MarkdownText text={plan} className="text-sm text-white/70 leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Skill Match Panel */}
      <AnimatePresence>
        {skillMatchOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white">AI Skill Match</h3>
                <p className="text-xs text-white/35 mt-0.5">Matches your {projectWorkers.length} worker(s) against a job's requirements</p>
              </div>
              <button onClick={() => setSkillMatchOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="Role needed (e.g. Electrician)" value={jobReq.role}
                onChange={(e) => setJobReq({ ...jobReq, role: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              <input
                list="trades-datalist"
                placeholder="Trade needed (e.g. MEP)"
                value={jobReq.trade}
                onChange={(e) => setJobReq({ ...jobReq, trade: e.target.value })} className={glassInputClass} style={glassInputStyle} />
              <input type="number" min="0" placeholder="Min. years experience" value={jobReq.min_experience_years}
                onChange={(e) => setJobReq({ ...jobReq, min_experience_years: parseInt(e.target.value) || 0 })}
                className={glassInputClass} style={glassInputStyle} />
              <input placeholder="Notes (e.g. certifications required)" value={jobReq.notes}
                onChange={(e) => setJobReq({ ...jobReq, notes: e.target.value })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <button onClick={runSkillMatch} disabled={skillMatchLoading} className={primaryBtn} style={gradientButtonStyle}>
              {skillMatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              Match Skills
            </button>
            {skillMatchResult && (
              <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                <MarkdownText text={skillMatchResult} className="text-sm text-white/70 leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Turnover Risk Panel */}
      <AnimatePresence>
        {turnoverOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.amber.border }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white">AI Turnover Risk</h3>
                <p className="text-xs text-white/35 mt-0.5">Analyzes your {projectWorkers.length} logged worker(s) for retention risk</p>
              </div>
              <button onClick={() => setTurnoverOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <button onClick={runTurnoverPredict} disabled={turnoverLoading} className={solidAmberBtn}>
              {turnoverLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Predict Turnover Risk
            </button>
            {turnoverResult && (
              <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                <MarkdownText text={turnoverResult} className="text-sm text-white/70 leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted workers review panel */}
      <AnimatePresence>
        {extractedWorkers.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: ACCENT.green.border, background: ACCENT.green.bg }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-white">Workers Found in Document</h3>
                <p className="text-xs text-white/35 mt-0.5">Review and add to your workforce</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={addAllExtractedWorkers} disabled={addingExtracted === "all"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60">
                  {addingExtracted === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  Add All ({extractedWorkers.length})
                </button>
                <button onClick={() => setExtractedWorkers([])} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-2">
              {extractedWorkers.map((w, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={avatarGradient}>
                    {w.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.name}</p>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{w.role}</span>
                      {w.trade && <span className="text-xs text-white/35">{w.trade}</span>}
                      {w.email && <span className="text-xs text-white/35">{w.email}</span>}
                      {w.phone && <span className="text-xs text-white/35">{w.phone}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${w.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>{w.status}</span>
                    </div>
                  </div>
                  <button onClick={() => addExtractedWorker(w, idx)} disabled={addingExtracted === String(idx) || addingExtracted === "all"}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60 shrink-0">
                    {addingExtracted === String(idx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Worker Profiles Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-white">Worker Profiles</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
              <input placeholder="Search workers..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs text-white placeholder:text-white/30 outline-none border focus:border-cyan-500/50 w-40"
                style={glassInputStyle} />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs text-white outline-none border" style={glassInputStyle}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="onleave">On Leave</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-white/35 font-medium mb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="col-span-2">Worker</span>
          <span>Trade</span>
          <span>Status</span>
          <span>Hours Today</span>
          <span>Phone</span>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <p className="text-sm text-white/35">
              {projectWorkers.length === 0 ? "No workers yet" : "No results match your search"}
            </p>
            {projectWorkers.length === 0 && (
              <button onClick={() => {
                setNewWorker(w => ({ ...w, project_id: selectedProjectId !== "all" ? selectedProjectId : w.project_id }));
                setAddWorkerOpen(true);
              }}
                className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-white text-xs font-medium transition-all hover:scale-105"
                style={gradientButtonStyle}>
                Add First Worker
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredWorkers.map((w, i) => (
              <motion.div key={w.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="grid grid-cols-6 gap-4 items-center px-4 py-3 rounded-xl hover:bg-white/2 transition-colors group">
                <div className="col-span-2 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={avatarGradient}>
                    {w.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{w.name}</p>
                    <p className="text-xs text-white/35">{w.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-white/35" />
                  <span className="text-xs text-white">{w.trade || "—"}</span>
                </div>
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium flex items-center gap-1 w-fit ${getStatusBadge(w.status)}`}>
                    {getStatusIcon(w.status)}
                    {w.status === "active" ? "Active" : w.status === "onleave" ? "On Leave" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/35" />
                  <span className="text-sm text-white">{w.hours_worked ?? 0}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-white/35" />
                    <span className="text-xs text-white">{w.phone || "—"}</span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-all shrink-0">
                    <button onClick={() => openEditWorker(w)}
                      className="w-6 h-6 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 flex items-center justify-center">
                      <Pencil className="w-3 h-3 text-cyan-400" />
                    </button>
                    <button onClick={() => deleteWorker(w.id)} disabled={deletingId === w.id}
                      className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center">
                      {deletingId === w.id
                        ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                        : <Trash2 className="w-3 h-3 text-red-400" />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skills Gap */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white text-[14px]">Skills Gap Analysis</h3>
            {stats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>}
          </div>
          {skillsData.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/35">
              Add workers to see skills distribution
            </div>
          ) : (
            <div className="space-y-4">
              {skillsData.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-white w-28 shrink-0 truncate">{item.skill}</span>
                  <div className="flex-1 rounded-full h-2 relative" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="absolute h-2 rounded-full bg-cyan-500/20" style={{ width: `${item.required}%` }} />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.available}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                      className={`absolute h-2 rounded-full ${item.available >= item.required ? "bg-emerald-500" : "bg-red-500"}`}
                    />
                  </div>
                  <span className="text-xs text-white/35 w-8 text-right shrink-0">{item.available}%</span>
                  {editingSkill === item.skill ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number" min="0" max="100"
                        value={editTargetValue}
                        onChange={(e) => setEditTargetValue(parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveTarget(item.skill, editTargetValue);
                          if (e.key === "Escape") setEditingSkill(null);
                        }}
                        className="w-12 px-1.5 py-0.5 rounded text-xs text-white outline-none border"
                        style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(0,212,255,0.4)" }}
                        autoFocus
                      />
                      <span className="text-xs text-white/35">%</span>
                      <button onClick={() => saveTarget(item.skill, editTargetValue)} className="text-xs text-cyan-400 hover:text-cyan-300 px-1">✓</button>
                      <button onClick={() => setEditingSkill(null)} className="text-xs text-white/40 hover:text-white px-1">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingSkill(item.skill); setEditTargetValue(item.required); }}
                      className="text-xs text-white/35 hover:text-cyan-400 w-16 text-right shrink-0 transition-colors"
                      title="Click to set target %"
                    >
                      req: {item.required}%
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyan-400/40" />
                  <span className="text-xs text-white/35">Required (click to edit)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-white/35">Available</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Workers by Trade */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-white text-[14px]">Workers by Trade</h3>
            {stats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>}
          </div>
          {tradeChartData.length === 0 ? (
            <div className="text-center py-8 text-sm text-white/35">No trade data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tradeChartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="trade" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                <Bar dataKey="count" fill="#10B981" radius={[6, 6, 0, 0]} name="Workers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* AI Analysis Result */}
      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Workforce Management"
        placeholder="Ask about workers, skills, turnover..."
        pageSummaryData={{
          totalWorkers: scopedStats?.total_workers ?? projectWorkers.length,
          activeWorkers: scopedStats?.active_workers ?? projectWorkers.filter(w => w.status === "active").length,
          inactiveRate: `${inactiveRate}%`,
          tradeDistribution: scopedStats?.trade_distribution,
          mlPrediction: mlTurnover,
        }}
      />
    </div>
  );
}
