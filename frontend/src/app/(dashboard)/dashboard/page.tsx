"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  DollarSign, Calendar, Users, Shield,
  TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, ArrowRight, Building2,
  Plus, X, Loader2, MapPin, Trash2, Edit2, Save,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import ModuleChat from "@/components/shared/ModuleChat";
import Link from "next/link";
import axios from "axios";
import { toast } from "sonner";
import { exportProjectReport } from "@/lib/exportPDF";
import WidgetCustomizer from "@/components/dashboard/WidgetCustomizer";
import { useWidgetStore } from "@/lib/stores/widgetStore";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { useProjectStore } from "@/lib/stores/projectStore";

const modules = [
  { title: "Cost & Budget", desc: "AI cost forecasting", href: "/cost", color: "from-blue-600/20 to-blue-400/5", border: "border-blue-500/20", icon: DollarSign, iconColor: "text-blue-400" },
  { title: "Scheduling", desc: "Delay prediction", href: "/scheduling", color: "from-orange-600/20 to-orange-400/5", border: "border-orange-500/20", icon: Calendar, iconColor: "text-orange-400" },
  { title: "Safety", desc: "Risk monitoring", href: "/safety", color: "from-red-600/20 to-red-400/5", border: "border-red-500/20", icon: Shield, iconColor: "text-red-400" },
  { title: "Workforce", desc: "Skills & turnover", href: "/workforce", color: "from-emerald-600/20 to-emerald-400/5", border: "border-emerald-500/20", icon: Users, iconColor: "text-emerald-400" },
];

const emptyProject = {
  name: "", location: "", status: "active",
  budget: "", start_date: "", end_date: "", client: "",
};

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

function ProjectFormFields({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Project Name *</label>
        <input className={inputClass} placeholder="e.g. CivilAI Tower Phase 2"
          value={form.name || ""}
          onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Client</label>
        <input className={inputClass} placeholder="e.g. ABC Corporation"
          value={form.client || ""}
          onChange={(e) => setForm((f: any) => ({ ...f, client: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Location</label>
        <input className={inputClass} placeholder="e.g. Dubai, UAE"
          value={form.location || ""}
          onChange={(e) => setForm((f: any) => ({ ...f, location: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Budget ($)</label>
          <input className={inputClass} placeholder="e.g. 5000000" type="number"
            value={form.budget || ""}
            onChange={(e) => setForm((f: any) => ({ ...f, budget: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
          <select className={inputClass} value={form.status || "active"}
            onChange={(e) => setForm((f: any) => ({ ...f, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
          <input className={inputClass} type="date"
            value={form.start_date || ""}
            onChange={(e) => setForm((f: any) => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
          <input className={inputClass} type="date"
            value={form.end_date || ""}
            onChange={(e) => setForm((f: any) => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { widgets } = useWidgetStore();
  const isVisible = (id: string) => widgets.find((w) => w.id === id)?.visible ?? true;
  const { counters, triggerRefresh } = useDataRefreshStore();
  const { setProjects: syncProjects } = useProjectStore();
  const [exporting, setExporting] = useState(false);
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
    total_budget: number;
    avg_progress: number;
    active_workers: number;
    safety_score: number;
    incident_count: number;
  } | null>(null);
  const [progressData, setProgressData] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch KPIs whenever workers, safety, documents, or projects change in other modules
  useEffect(() => {
    fetchAll();
  }, [counters.workers, counters.safety, counters.documents, counters.projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    setLoading(true);
    const [projectsRes, kpisRes, progressRes, costsRes, alertsRes] = await Promise.allSettled([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/kpis`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/progress`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/costs`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/alerts`),
    ]);
    if (projectsRes.status === "fulfilled") {
      const fetched = projectsRes.value.data.projects || [];
      setProjects(fetched);
      syncProjects(fetched);
    }
    if (kpisRes.status === "fulfilled") setKpiData(kpisRes.value.data.kpis || null);
    if (progressRes.status === "fulfilled") setProgressData(progressRes.value.data.data || []);
    if (costsRes.status === "fulfilled") setCostData(costsRes.value.data.data || []);
    if (alertsRes.status === "fulfilled") setLiveAlerts(alertsRes.value.data.alerts || []);
    setLoading(false);
  };

  const handleExportReport = async (project: any) => {
  setExporting(true);
  try {
    // Fetch project data
    const [tasksRes, safetyRes, equipRes] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/schedule`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/safety`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${project.id}/equipment`),
    ]);
    exportProjectReport(
      project,
      tasksRes.data.tasks || [],
      safetyRes.data.incidents || [],
      equipRes.data.equipment || [],
    );
    toast.success("PDF exported!");
  } catch {
    toast.error("Export failed");
  } finally {
    setExporting(false);
  }
};


  const handleAddProject = async () => {
    if (!newProject.name) { toast.error("Project name is required"); return; }
    setAdding(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/create`, {
        ...newProject,
        budget: parseFloat(newProject.budget) || 0,
        start_date: newProject.start_date || null,
        end_date: newProject.end_date || null,
      });
      toast.success("Project created!");
      triggerRefresh("projects");
      setShowAddProject(false);
      setNewProject(emptyProject);
      fetchAll();
    } catch { toast.error("Failed to create project"); }
    finally { setAdding(false); }
  };

  const handleEditProject = async () => {
    if (!editingProject) return;
    setSaving(true);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${editingProject.id}`,
        { ...editForm, budget: parseFloat(editForm.budget) || 0 }
      );
      toast.success("Project updated!");
      setEditingProject(null);
      fetchAll();
    } catch { toast.error("Failed to update project"); }
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Good morning 👋</p>
          <h1 className="text-3xl font-bold text-foreground mt-1">Project Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          <WidgetCustomizer />
          <button onClick={() => setShowAddProject(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </motion.div>

      {/* Add Project Modal */}
      <AnimatePresence>
        {showAddProject && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-foreground text-lg">New Project</h3>
                <button onClick={() => setShowAddProject(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ProjectFormFields form={newProject} setForm={setNewProject} />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAddProject(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">
                  Cancel
                </button>
                <button onClick={handleAddProject} disabled={adding}
                  className="flex-1 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium flex items-center justify-center gap-2">
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Project
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Project Modal */}
      <AnimatePresence>
        {editingProject && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-foreground text-lg">Edit Project</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{editingProject.name}</p>
                </div>
                <button onClick={() => setEditingProject(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ProjectFormFields form={editForm} setForm={setEditForm} />
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingProject(null)}
                  className="flex-1 px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">
                  Cancel
                </button>
                <button onClick={handleEditProject} disabled={saving}
                  className="flex-1 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      {(isVisible("kpi-budget") || isVisible("kpi-schedule") || isVisible("kpi-workers") || isVisible("kpi-safety")) && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !kpiData ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border p-5 bg-card animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-secondary" />
                <div className="w-16 h-6 rounded-full bg-secondary" />
              </div>
              <div className="w-24 h-7 rounded bg-secondary mb-2" />
              <div className="w-32 h-4 rounded bg-secondary" />
            </div>
          ))
        ) : (() => {
          const budgetM = kpiData.total_budget >= 1_000_000
            ? `$${(kpiData.total_budget / 1_000_000).toFixed(1)}M`
            : kpiData.total_budget >= 1_000
            ? `$${(kpiData.total_budget / 1_000).toFixed(0)}K`
            : `$${kpiData.total_budget.toFixed(0)}`;
          const dynamicKpis = [
            {
              title: "Total Budget", value: budgetM,
              change: `${projects.length} project${projects.length !== 1 ? "s" : ""}`,
              trend: "up", icon: DollarSign,
              color: "from-blue-600 to-blue-400", border: "border-blue-500/20", href: "/cost",
            },
            {
              title: "Schedule Progress", value: `${kpiData.avg_progress}%`,
              change: kpiData.avg_progress >= 60 ? "On track" : "Behind schedule",
              trend: kpiData.avg_progress >= 60 ? "up" : "down", icon: Calendar,
              color: "from-orange-600 to-orange-400", border: "border-orange-500/20", href: "/scheduling",
            },
            {
              title: "Active Workers", value: `${kpiData.active_workers}`,
              change: "Across all projects",
              trend: "up", icon: Users,
              color: "from-emerald-600 to-emerald-400", border: "border-emerald-500/20", href: "/workforce",
            },
            {
              title: "Safety Score", value: `${kpiData.safety_score}/100`,
              change: `${kpiData.incident_count} incident${kpiData.incident_count !== 1 ? "s" : ""}`,
              trend: kpiData.safety_score >= 80 ? "up" : "down", icon: Shield,
              color: "from-purple-600 to-purple-400", border: "border-purple-500/20", href: "/safety",
            },
          ];
          return dynamicKpis.map((kpi, i) => (
            <Link href={kpi.href} key={i}>
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -4 }}
                className={`rounded-2xl border ${kpi.border} p-5 cursor-pointer bg-card hover:shadow-lg transition-shadow`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-11 h-11 rounded-xl bg-linear-to-br ${kpi.color} flex items-center justify-center`}>
                    <kpi.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    kpi.trend === "up" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {kpi.change}
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{kpi.title}</p>
              </motion.div>
            </Link>
          ));
        })()}
      </div>
      )}

      {/* Live Projects */}
      {isVisible("projects") && <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }} className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">Active Projects</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              {projects.length} Live
            </span>
          </div>
          <button onClick={() => setShowAddProject(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Project
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <button onClick={() => setShowAddProject(true)}
              className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-xs font-medium">
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
                className="p-4 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/70 transition-colors relative group"
              >
                {/* Action Buttons */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditingProject(project);
                      setEditForm({
                        name: project.name,
                        client: project.client || "",
                        location: project.location || "",
                        budget: project.total_budget || 0,
                        status: project.status || "active",
                        start_date: project.start_date || "",
                        end_date: project.end_date || "",
                      });
                    }}
                    className="w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 flex items-center justify-center transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                  </button>
                  <button
                  onClick={() => handleExportReport(project)}
                  disabled={exporting}
                  className="w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center transition-colors"
                  title="Export PDF"
                  >
                    {exporting
                    ? <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    : <span className="text-emerald-400 text-xs">↓</span>
                  }
                  </button>
                  <button
                    onClick={() => handleDeleteProject(project.id, project.name)}
                    disabled={deletingId === project.id}
                    className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                  >
                    {deletingId === project.id
                      ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    }
                  </button>
                </div>

                <div className="flex items-center justify-between mb-2 pr-16">
                  <p className="font-medium text-foreground text-sm truncate">{project.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    project.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                    project.status === "planning" ? "bg-blue-500/10 text-blue-400" :
                    project.status === "completed" ? "bg-purple-500/10 text-purple-400" :
                    "bg-orange-500/10 text-orange-400"
                  }`}>
                    {project.status}
                  </span>
                </div>

                {project.client && (
                  <p className="text-xs text-muted-foreground mb-0.5">{project.client}</p>
                )}
                {project.location && (
                  <div className="flex items-center gap-1 mb-3">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{project.location}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-foreground font-medium">{project.progress_percentage || 0}%</span>
                  </div>
                  <div className="bg-secondary rounded-full h-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${project.progress_percentage || 0}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                      className={`h-1.5 rounded-full ${
                        (project.progress_percentage || 0) >= 70 ? "bg-emerald-500" :
                        (project.progress_percentage || 0) >= 40 ? "bg-blue-500" : "bg-orange-500"
                      }`}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="text-foreground font-medium">
                      ${((project.total_budget || 0) / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Spent</span>
                    <span className="text-foreground font-medium">
                      ${((project.spent_to_date || 0) / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  {project.start_date && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Timeline</span>
                      <span className="text-foreground">{project.start_date} → {project.end_date || "TBD"}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>}

      {/* Charts */}
      {(isVisible("chart-progress") || isVisible("chart-cost")) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }} className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Project Progress</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Planned vs Actual %</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400">This Year</span>
          </div>
          {progressData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-muted-foreground">
              <TrendingUp className="w-8 h-8 mb-2" />
              <p className="text-sm">No schedule data yet — add tasks to see progress</p>
            </div>
          ) : null}
          {progressData.length > 0 && <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={progressData}>
              <defs>
                <linearGradient id="planned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Area type="monotone" dataKey="planned" stroke="#3b82f6" fill="url(#planned)" strokeWidth={2} name="Planned" />
              <Area type="monotone" dataKey="actual" stroke="#10b981" fill="url(#actual)" strokeWidth={2} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>}
          {progressData.length > 0 && <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }} className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Cost Analysis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Budget vs Actual ($K)</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-orange-500/10 text-orange-400">Monthly</span>
          </div>
          {costData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-muted-foreground">
              <TrendingDown className="w-8 h-8 mb-2" />
              <p className="text-sm">No cost data yet — add cost entries to see analysis</p>
            </div>
          ) : null}
          {costData.length > 0 && <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="budget" fill="#3b82f620" stroke="#3b82f6" strokeWidth={1} radius={[6, 6, 0, 0]} name="Budget" />
              <Bar dataKey="actual" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Actual" />
            </BarChart>
          </ResponsiveContainer>}
          {costData.length > 0 && <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>}
        </motion.div>
      </div>
      )}

      {/* Bottom Row */}
      {(isVisible("alerts") || isVisible("modules")) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Live Alerts</h3>
            <span className={`text-xs px-2 py-1 rounded-full ${liveAlerts.length > 0 ? "bg-red-500/10 text-red-400" : "bg-secondary text-muted-foreground"}`}>
              {liveAlerts.length} Active
            </span>
          </div>
          {liveAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCircle className="w-8 h-8 mb-2 text-emerald-400" />
              <p className="text-sm">No recent alerts — all clear</p>
            </div>
          ) : (
            <div className="space-y-2">
              {liveAlerts.map((alert: any, i: number) => {
                const isError   = alert.type === "error";
                const isWarning = alert.type === "warning";
                const isSuccess = alert.type === "success";
                const Icon  = isSuccess ? CheckCircle : isError ? AlertTriangle : Clock;
                const color = isSuccess ? "text-emerald-400" : isError ? "text-red-400" : isWarning ? "text-orange-400" : "text-blue-400";
                const bg    = isSuccess ? "bg-emerald-500/10" : isError ? "bg-red-500/10" : isWarning ? "bg-orange-500/10" : "bg-blue-500/10";
                return (
                  <motion.div key={alert.id || i}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-sm text-foreground flex-1">{alert.text}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{alert.time}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }} className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Quick Access</h3>
          <div className="space-y-2">
            {modules.map((mod, i) => (
              <Link key={i} href={mod.href}>
                <motion.div whileHover={{ x: 4 }}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-linear-to-r ${mod.color} border ${mod.border} cursor-pointer mb-2`}
                >
                  <mod.icon className={`w-4 h-4 ${mod.iconColor}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{mod.title}</p>
                    <p className="text-xs text-muted-foreground">{mod.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
      )}

      <ModuleChat
        context="Project Dashboard"
        placeholder="Ask about your projects..."
        pageSummaryData={{
          totalProjects: projects.length,
          projects: projects.map(p => ({
            name: p.name,
            progress: p.progress_percentage,
            budget: p.total_budget,
            spent: p.spent_to_date,
            status: p.status,
          })),
        }}
      />
    </div>
  );
}