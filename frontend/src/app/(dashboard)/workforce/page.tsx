"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const ResourceLevelingPage = dynamic(() => import("../resource-leveling/page"), { ssr: false });

const WORKFORCE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "resources", label: "Resource Leveling" },
];

import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, TrendingDown, Upload, Loader2, UserPlus,
  Brain, Phone, Briefcase, Clock, CheckCircle, XCircle,
  Search, X, Trash2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [plan, setPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [onboardWorker, setOnboardWorker] = useState({ name: "", role: "", experience_years: 0, start_date: "" });
  const [newWorker, setNewWorker] = useState({
    name: "", role: "", trade: "", phone: "", email: "", status: "active", hours_worked: 0,
  });
  const [skillTargets, setSkillTargets] = useState<Record<string, number>>({});
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState(70);

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
      const [workersRes, statsRes, targetsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/stats`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/skill-targets`).catch(() => ({ data: { targets: {} } })),
      ]);
      setWorkers(workersRes.data.workers || []);
      setStats(statsRes.data.stats || null);
      setSkillTargets(targetsRes.data.targets || {});
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

  const addWorker = async () => {
    if (!newWorker.name || !newWorker.role) { toast.error("Name and role are required!"); return; }
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`, newWorker);
      setNewWorker({ name: "", role: "", trade: "", phone: "", email: "", status: "active", hours_worked: 0 });
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

  // Skills Gap — trade names from DB are the skill categories; required% from Supabase skill_targets (default 70)
  const skillsData = (() => {
    if (!stats || stats.total_workers === 0) return [];
    const total = stats.total_workers;
    return Object.entries(stats.trade_distribution).map(([trade, count]) => ({
      skill: trade,
      available: Math.round((count as number) / total * 100),
      required: skillTargets[trade] ?? 70,
    }));
  })();

  // Bar chart data from real trade distribution
  const tradeChartData = stats
    ? Object.entries(stats.trade_distribution).map(([trade, count]) => ({ trade, count }))
    : [];

  const filteredWorkers = workers.filter(w => {
    const q = search.toLowerCase();
    const matchSearch = w.name.toLowerCase().includes(q) ||
      w.role.toLowerCase().includes(q) ||
      (w.trade || "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status: string) => {
    if (status === "active") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "onleave") return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  const getStatusIcon = (status: string) => {
    if (status === "active") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "onleave") return <Clock className="w-3.5 h-3.5 text-orange-400" />;
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  };

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  const totalWorkers = stats?.total_workers ?? 0;
  const activeToday = stats?.active_workers ?? 0;
  const inactiveCount = stats?.inactive ?? 0;
  const inactiveRate = totalWorkers > 0 ? Math.round(inactiveCount / totalWorkers * 100) : 0;
  const avgUtilization = activeToday > 0 && stats
    ? Math.min(100, Math.round(stats.total_hours_today / (activeToday * 8) * 100))
    : 0;

  const tabBar = (
    <div className="flex gap-0 border-b border-border">
      {WORKFORCE_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            subTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}>{t.label}</button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      {tabBar}
      {subTab === "resources" && <div className="pt-6"><ResourceLevelingPage /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      {tabBar}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered workforce management & planning</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddWorkerOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2 text-emerald-400" />Add Worker
          </Button>
          <Button variant="outline" onClick={() => setOnboardingOpen(!onboardingOpen)}>
            <UserPlus className="w-4 h-4 mr-2 text-blue-400" />Onboard
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0" asChild>
              <span>
                {uploadLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload Data
              </span>
            </Button>
          </label>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border p-5 bg-card animate-pulse">
              <div className="w-20 h-4 bg-secondary rounded mb-3" />
              <div className="w-16 h-7 bg-secondary rounded mb-2" />
              <div className="w-24 h-3 bg-secondary rounded" />
            </div>
          ))
        ) : (
          [
            {
              label: "Total Workers", value: `${totalWorkers}`,
              change: `${stats?.on_leave ?? 0} on leave`,
              trend: "up", color: "border-blue-500/20 bg-blue-500/5",
            },
            {
              label: "Active Today", value: `${activeToday}`,
              change: `${totalWorkers > 0 ? Math.round(activeToday / totalWorkers * 100) : 0}% of workforce`,
              trend: "up", color: "border-emerald-500/20 bg-emerald-500/5",
            },
            {
              label: "Inactive Rate", value: `${inactiveRate}%`,
              change: `${inactiveCount} workers`,
              trend: inactiveRate <= 10 ? "up" : "down", color: "border-orange-500/20 bg-orange-500/5",
            },
            {
              label: "Avg Utilization", value: `${avgUtilization}%`,
              change: `${stats?.total_hours_today ?? 0}h logged today`,
              trend: avgUtilization >= 70 ? "up" : "down", color: "border-purple-500/20 bg-purple-500/5",
            },
          ].map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
              className={`rounded-2xl border p-5 ${kpi.color}`}>
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
              <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.change}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* ML Prediction */}
      {!mlLoading && mlTurnover && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlTurnover.risk_level === "High" ? "border-red-500/30 bg-red-500/5" :
            mlTurnover.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5" :
            "border-emerald-500/30 bg-emerald-500/5"
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Turnover Risk Prediction</p>
                <p className="text-xl font-bold text-foreground">{mlTurnover.probability}% turnover probability</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlTurnover.will_leave ? "High retention risk — action needed" : "Workforce stable"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlTurnover.risk_level === "High" ? "bg-red-500/10 text-red-400" :
              mlTurnover.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400" :
              "bg-emerald-500/10 text-emerald-400"
            }`}>{mlTurnover.risk_level} Risk</span>
          </div>
        </motion.div>
      )}

      {/* Add Worker Panel */}
      <AnimatePresence>
        {addWorkerOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Add New Worker</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddWorkerOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Full Name *</label>
                <input placeholder="Worker name" value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Role *</label>
                <input placeholder="e.g. Electrician" value={newWorker.role}
                  onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Trade</label>
                <input
                  list="trades-datalist"
                  placeholder="e.g. Civil, MEP, Safety..."
                  value={newWorker.trade}
                  onChange={(e) => setNewWorker({ ...newWorker, trade: e.target.value })}
                  className={inputClass}
                />
                <datalist id="trades-datalist">
                  {Object.keys(stats?.trade_distribution || {}).map(t => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
                <input placeholder="+1 555-0000" value={newWorker.phone}
                  onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                <input type="email" placeholder="name@company.com" value={newWorker.email}
                  onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
                <select value={newWorker.status}
                  onChange={(e) => setNewWorker({ ...newWorker, status: e.target.value })} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="onleave">On Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Hours Today</label>
                <input type="number" min="0" max="24" value={newWorker.hours_worked}
                  onChange={(e) => setNewWorker({ ...newWorker, hours_worked: parseInt(e.target.value, 10) || 0 })}
                  className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addWorker} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <UserPlus className="w-4 h-4 mr-2" />Add Worker
              </Button>
              <Button variant="outline" onClick={() => setAddWorkerOpen(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Panel */}
      <AnimatePresence>
        {onboardingOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">AI Onboarding Plan Generator</h3>
              <Button variant="ghost" size="icon" onClick={() => setOnboardingOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="Worker name" value={onboardWorker.name}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, name: e.target.value })} className={inputClass} />
              <input placeholder="Role / Position" value={onboardWorker.role}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, role: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Years of experience" value={onboardWorker.experience_years}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, experience_years: parseInt(e.target.value) || 0 })}
                className={inputClass} />
              <input type="date" value={onboardWorker.start_date}
                onChange={(e) => setOnboardWorker({ ...onboardWorker, start_date: e.target.value })} className={inputClass} />
            </div>
            <Button onClick={generatePlan} disabled={planLoading} className="gradient-blue text-white border-0">
              {planLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Generate Plan
            </Button>
            {plan && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{plan}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Worker Profiles Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Worker Profiles</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input placeholder="Search workers..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-40" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="onleave">On Leave</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
          <span className="col-span-2">Worker</span>
          <span>Trade</span>
          <span>Status</span>
          <span>Hours Today</span>
          <span>Phone</span>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {workers.length === 0 ? "No workers yet" : "No results match your search"}
            </p>
            {workers.length === 0 && (
              <button onClick={() => setAddWorkerOpen(true)}
                className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-xs font-medium">
                Add First Worker
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredWorkers.map((w, i) => (
              <motion.div key={w.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="grid grid-cols-6 gap-4 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                <div className="col-span-2 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {w.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{w.trade || "—"}</span>
                </div>
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium flex items-center gap-1 w-fit ${getStatusBadge(w.status)}`}>
                    {getStatusIcon(w.status)}
                    {w.status === "active" ? "Active" : w.status === "onleave" ? "On Leave" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">{w.hours_worked ?? 0}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-foreground">{w.phone || "—"}</span>
                  </div>
                  <button onClick={() => deleteWorker(w.id)} disabled={deletingId === w.id}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-all shrink-0">
                    {deletingId === w.id
                      ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                      : <Trash2 className="w-3 h-3 text-red-400" />}
                  </button>
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
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-foreground">Skills Gap Analysis</h3>
            {stats && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Live Data</span>}
          </div>
          {skillsData.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Add workers to see skills distribution
            </div>
          ) : (
            <div className="space-y-4">
              {skillsData.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-foreground w-28 shrink-0 truncate">{item.skill}</span>
                  <div className="flex-1 bg-secondary rounded-full h-2 relative">
                    <div className="absolute h-2 rounded-full bg-blue-500/20" style={{ width: `${item.required}%` }} />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.available}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                      className={`absolute h-2 rounded-full ${item.available >= item.required ? "bg-emerald-500" : "bg-red-500"}`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{item.available}%</span>
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
                        className="w-12 px-1.5 py-0.5 bg-secondary border border-blue-500 rounded text-xs text-foreground focus:outline-none"
                        autoFocus
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <button onClick={() => saveTarget(item.skill, editTargetValue)} className="text-xs text-blue-400 hover:text-blue-300 px-1">✓</button>
                      <button onClick={() => setEditingSkill(null)} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingSkill(item.skill); setEditTargetValue(item.required); }}
                      className="text-xs text-muted-foreground hover:text-blue-400 w-16 text-right shrink-0 transition-colors"
                      title="Click to set target %"
                    >
                      req: {item.required}%
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400/40" />
                  <span className="text-xs text-muted-foreground">Required (click to edit)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">Available</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Workers by Trade */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-foreground">Workers by Trade</h3>
            {stats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>}
          </div>
          {tradeChartData.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No trade data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tradeChartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="trade" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} name="Workers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* AI Analysis Result */}
      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Workforce Management"
        placeholder="Ask about workers, skills, turnover..."
        pageSummaryData={{
          totalWorkers: stats?.total_workers ?? workers.length,
          activeWorkers: stats?.active_workers ?? workers.filter(w => w.status === "active").length,
          inactiveRate: `${inactiveRate}%`,
          tradeDistribution: stats?.trade_distribution,
          mlPrediction: mlTurnover,
        }}
      />
    </div>
  );
}
