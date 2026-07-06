"use client";

import { exportScheduleReport } from "@/lib/exportPDF";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, AlertTriangle, TrendingDown, Clock,
  CheckCircle, Upload, Loader2, Brain, Plus, X,
  Search, Flag, Edit2, Save, Trash2, Wrench,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import dynamic from "next/dynamic";
import { MarkdownText } from "@/lib/renderMarkdown";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

const GanttChart = dynamic(() => import("@/components/scheduling/GanttChart"), { ssr: false });
const ML_API = process.env.NEXT_PUBLIC_ML_API_URL || "http://localhost:8001";

const sCurveData = [
  { month: "Jan", planned: 5, actual: 4 },
  { month: "Feb", planned: 15, actual: 12 },
  { month: "Mar", planned: 28, actual: 24 },
  { month: "Apr", planned: 42, actual: 37 },
  { month: "May", planned: 58, actual: 50 },
  { month: "Jun", planned: 72, actual: 62 },
  { month: "Jul", planned: 83, actual: null },
  { month: "Aug", planned: 92, actual: null },
  { month: "Sep", planned: 100, actual: null },
];

interface Task {
  id: string;
  task_name: string;
  phase: string;
  assignee: string;
  planned_progress: number;
  actual_progress: number;
  status: string;
  priority: string;
  planned_start: string;
  planned_end: string;
  delay_days: number;
}

interface ExtractedTask {
  task_name: string;
  phase?: string;
  assignee?: string;
  planned_progress?: number;
  actual_progress?: number;
  status: string;
  priority: string;
  planned_start?: string;
  planned_end?: string;
  delay_days?: number;
}

export default function SchedulingPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "gantt">("tasks");
  const [scenario, setScenario] = useState({ scenario: "", delay_days: 0 });
  const [whatIfResult, setWhatIfResult] = useState("");
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [predictOpen, setPredictOpen] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictResult, setPredictResult] = useState("");
  const [predictForm, setPredictForm] = useState({
    weather_conditions: "Normal", labor_availability: "Full", material_status: "Available",
  });
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState("");
  const [recoveryForm, setRecoveryForm] = useState({
    delay_days: 7, delay_causes: "", available_resources: "", budget_remaining: 0,
  });
  const [mlDelay, setMlDelay] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editProgress, setEditProgress] = useState(0);
  const [editStatus, setEditStatus] = useState("");
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    task_name: "", phase: "Phase 1", assignee: "",
    planned_progress: 100, actual_progress: 0,
    status: "pending", priority: "medium",
    planned_start: "", planned_end: "", delay_days: 0,
  });

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  useEffect(() => {
    fetchProjects();
    fetchMLData();
  }, []);

  useEffect(() => {
    if (projectId) fetchTasks();
  }, [projectId]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p.length > 0) setProjectId(p[0].id);
    } catch (err) { console.error(err); }
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule`);
      setTasks(res.data.tasks || []);
    } catch (err) { console.error(err); }
    finally { setTasksLoading(false); }
  };

  const fetchMLData = async () => {
    setMlLoading(true);
    try {
      const mlRes = await axios.post(`${ML_API}/predict/delay`, {
        project_type: "Commercial", planned_duration_days: 180,
        weather_delays: 10, labor_shortage: 1, material_delays: 1,
        design_changes: 5, subcontractor_issues: 1,
      });
      setMlDelay(mlRes.data);
    } catch (err) { console.error(err); }
    finally { setMlLoading(false); }
  };

  const handleUpdateTask = async (taskId: string) => {
    setSavingTask(taskId);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule/${taskId}`,
        { actual_progress: editProgress, status: editStatus }
      );
      toast.success("Task updated!");
      setEditingTask(null);
      fetchTasks();
      triggerRefresh("schedule");
    } catch {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, actual_progress: editProgress, status: editStatus } : t
      ));
      toast.success("Task updated!");
      setEditingTask(null);
      triggerRefresh("schedule");
    } finally { setSavingTask(null); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;
    setDeletingTask(taskId);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule/${taskId}`);
      toast.success("Task deleted!");
      fetchTasks();
      triggerRefresh("schedule");
    } catch {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success("Task removed!");
      triggerRefresh("schedule");
    } finally { setDeletingTask(null); }
  };

  const handleAddTask = async () => {
    if (!newTask.task_name || !newTask.assignee) {
      toast.error("Task name and assignee required!");
      return;
    }
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule`,
        { ...newTask, project_id: projectId }
      );
      toast.success("Task saved to database!");
      setAddTaskOpen(false);
      setNewTask({
        task_name: "", phase: "Phase 1", assignee: "",
        planned_progress: 100, actual_progress: 0,
        status: "pending", priority: "medium",
        planned_start: "", planned_end: "", delay_days: 0,
      });
      fetchTasks();
      triggerRefresh("schedule");
    } catch { toast.error("Failed to add task"); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true);
    setExtractedTasks([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/schedule/analyze`, formData);
      setAnalysis(response.data.analysis);
      const found: ExtractedTask[] = response.data.extracted_tasks ?? [];
      setExtractedTasks(found);
      toast.success(found.length > 0 ? `Found ${found.length} task(s) — review below.` : "Schedule analyzed!");
    } catch { toast.error("Failed to analyze"); }
    finally { setLoading(false); }
  };

  const addExtractedTask = async (task: ExtractedTask, idx: number) => {
    if (!projectId) { toast.error("Select a project first"); return; }
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule`, { ...task, project_id: projectId });
      toast.success(`"${task.task_name}" added to task list`);
      setExtractedTasks(prev => prev.filter((_, i) => i !== idx));
      fetchTasks();
      triggerRefresh("schedule");
    } catch { toast.error("Failed to add task"); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedTasks = async () => {
    if (!projectId) { toast.error("Select a project first"); return; }
    setAddingExtracted("all");
    let added = 0;
    for (const task of extractedTasks) {
      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/schedule`, { ...task, project_id: projectId });
        added++;
      } catch { /* skip individual failures */ }
    }
    toast.success(`${added} task(s) added to task list`);
    setExtractedTasks([]);
    fetchTasks();
    if (added > 0) triggerRefresh("schedule");
    setAddingExtracted(null);
  };

  const runWhatIf = async () => {
    setWhatIfLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/schedule/what-if`, scenario);
      setWhatIfResult(response.data.analysis);
    } catch { toast.error("Failed to run analysis"); }
    finally { setWhatIfLoading(false); }
  };

  const runPredictDelays = async () => {
    if (!selectedProject) { toast.error("Select a project first"); return; }
    setPredictLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/schedule/predict-delays`, {
        project_name: selectedProject.name,
        start_date: selectedProject.start_date || "",
        end_date: selectedProject.end_date || "",
        completion_percentage: overallProgress,
        weather_conditions: predictForm.weather_conditions,
        labor_availability: predictForm.labor_availability,
        material_status: predictForm.material_status,
        pending_tasks: tasks.filter(t => t.status !== "done" && t.status !== "completed").map(t => t.task_name),
      });
      setPredictResult(response.data.prediction);
    } catch { toast.error("Failed to predict delays"); }
    finally { setPredictLoading(false); }
  };

  const runRecoveryPlan = async () => {
    setRecoveryLoading(true);
    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/schedule/recovery-plan`, {
        project_name: selectedProject?.name || "",
        delay_days: Number(recoveryForm.delay_days) || 0,
        delay_causes: recoveryForm.delay_causes.split(",").map(t => t.trim()).filter(Boolean),
        available_resources: recoveryForm.available_resources.split(",").map(t => t.trim()).filter(Boolean),
        budget_remaining: Number(recoveryForm.budget_remaining) || 0,
      });
      setRecoveryResult(response.data.plan);
    } catch { toast.error("Failed to generate recovery plan"); }
    finally { setRecoveryLoading(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": case "completed": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "inprogress": case "in_progress": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "delayed": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "atrisk": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-secondary text-muted-foreground border-border";
    }
  };

  const getProgressColor = (progress: number, status: string) => {
    if (status === "done" || status === "completed") return "bg-emerald-500";
    if (status === "delayed") return "bg-red-500";
    if (status === "atrisk") return "bg-orange-500";
    return "bg-blue-500";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-400";
      case "medium": return "text-orange-400";
      default: return "text-emerald-400";
    }
  };

  const phases = ["all", ...Array.from(new Set(tasks.map(t => t.phase).filter(Boolean)))];

  const filteredTasks = tasks.filter(t => {
    const matchSearch = t.task_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.assignee?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchPhase = filterPhase === "all" || t.phase === filterPhase;
    return matchSearch && matchStatus && matchPhase;
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "done" || t.status === "completed").length;
  const overdueTasks = tasks.filter(t => t.status === "delayed" || t.status === "atrisk").length;
  const overallProgress = totalTasks > 0
    ? Math.round(tasks.reduce((sum, t) => sum + (t.actual_progress || 0), 0) / totalTasks)
    : 0;

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-4xl font-bold text-foreground">Scheduling</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered delay prediction & task management</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <Button variant="outline" onClick={() => setAddTaskOpen(true)}>
            <Plus className="w-4 h-4 mr-2 text-emerald-400" />Add Task
          </Button>
          <Button variant="outline" onClick={() => exportScheduleReport(tasks, selectedProject?.name || "Project")}>
            <span className="mr-2">↓</span>
            Export PDF
            </Button>
          <Button variant="outline" onClick={() => setWhatIfOpen(!whatIfOpen)}>
            <Clock className="w-4 h-4 mr-2 text-blue-400" />What-If
          </Button>
          <Button variant="outline" onClick={() => setPredictOpen(!predictOpen)}>
            <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" />Predict Delays
          </Button>
          <Button variant="outline" onClick={() => setRecoveryOpen(!recoveryOpen)}>
            <Wrench className="w-4 h-4 mr-2 text-emerald-400" />Recovery Plan
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload
            </Button>
          </label>
        </div>
      </motion.div>

      {/* Project Info */}
      {selectedProject && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-blue-500/5 border border-blue-500/20 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs text-blue-400 font-medium">{selectedProject.name}</span>
          </div>
          {tasks.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              {tasks.length} tasks · Live DB
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            Overall Progress: <span className="text-foreground font-medium">{overallProgress}%</span>
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Tasks", value: totalTasks.toString(), icon: Calendar, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Overall Progress", value: `${overallProgress}%`, icon: TrendingDown, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          { label: "Delayed / At Risk", value: overdueTasks.toString(), icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
          { label: "Completed", value: completedTasks.toString(), icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ML Prediction */}
      {!mlLoading && mlDelay && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlDelay.risk_level === "High" ? "border-red-500/30 bg-red-500/5" :
            mlDelay.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5" :
            "border-emerald-500/30 bg-emerald-500/5"
          }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">AI Delay Prediction</p>
                <p className="text-xl font-bold text-foreground">{mlDelay.probability}% probability of delay</p>
                <p className="text-sm text-muted-foreground">
                  {mlDelay.will_be_delayed ? "Delay likely — review schedule" : "On track — monitor closely"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlDelay.risk_level === "High" ? "bg-red-500/10 text-red-400" :
              mlDelay.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400" :
              "bg-emerald-500/10 text-emerald-400"
            }`}>{mlDelay.risk_level} Risk</span>
          </div>
        </motion.div>
      )}

      {/* Add Task Form */}
      <AnimatePresence>
        {addTaskOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Add New Task</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddTaskOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Task Name *</label>
                <input placeholder="e.g. Foundation Excavation" value={newTask.task_name}
                  onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Phase</label>
                <input placeholder="e.g. Structure" value={newTask.phase}
                  onChange={(e) => setNewTask({ ...newTask, phase: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Assignee *</label>
                <input placeholder="Worker name" value={newTask.assignee}
                  onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Priority</label>
                <select value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })} className={inputClass}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
                <select value={newTask.status}
                  onChange={(e) => setNewTask({ ...newTask, status: e.target.value })} className={inputClass}>
                  <option value="pending">Pending</option>
                  <option value="inprogress">In Progress</option>
                  <option value="delayed">Delayed</option>
                  <option value="atrisk">At Risk</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Actual Progress %</label>
                <input type="number" min="0" max="100" value={newTask.actual_progress}
                  onChange={(e) => setNewTask({ ...newTask, actual_progress: parseInt(e.target.value) || 0 })}
                  className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Start Date</label>
                <input type="date" value={newTask.planned_start}
                  onChange={(e) => setNewTask({ ...newTask, planned_start: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">End Date</label>
                <input type="date" value={newTask.planned_end}
                  onChange={(e) => setNewTask({ ...newTask, planned_end: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddTask} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <Plus className="w-4 h-4 mr-2" />Save to Database
              </Button>
              <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What-If */}
      <AnimatePresence>
        {whatIfOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">What-If Scenario Simulator</h3>
              <Button variant="ghost" size="icon" onClick={() => setWhatIfOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <textarea placeholder="Describe scenario (e.g. Steel delivery delayed 2 weeks)"
                value={scenario.scenario}
                onChange={(e) => setScenario({ ...scenario, scenario: e.target.value })}
                rows={3} className={`col-span-2 ${inputClass} resize-none`} />
              <input type="number" placeholder="Delay days" value={scenario.delay_days}
                onChange={(e) => setScenario({ ...scenario, delay_days: parseInt(e.target.value) })}
                className={inputClass} />
            </div>
            <Button onClick={runWhatIf} disabled={whatIfLoading} className="gradient-blue text-white border-0">
              {whatIfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
              Run Analysis
            </Button>
            {whatIfResult && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <MarkdownText text={whatIfResult} className="text-sm text-foreground leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Predict Delays */}
      <AnimatePresence>
        {predictOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-orange-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">AI Delay Prediction</h3>
              <Button variant="ghost" size="icon" onClick={() => setPredictOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Uses {selectedProject ? selectedProject.name : "the selected project"}'s current progress
              ({overallProgress}%) and open tasks to forecast delay risk.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Weather Conditions</label>
                <select value={predictForm.weather_conditions}
                  onChange={(e) => setPredictForm({ ...predictForm, weather_conditions: e.target.value })} className={inputClass}>
                  {["Normal", "Rainy", "Extreme Heat", "Storms", "Winter"].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Labor Availability</label>
                <select value={predictForm.labor_availability}
                  onChange={(e) => setPredictForm({ ...predictForm, labor_availability: e.target.value })} className={inputClass}>
                  {["Full", "Partial", "Short-staffed"].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Material Status</label>
                <select value={predictForm.material_status}
                  onChange={(e) => setPredictForm({ ...predictForm, material_status: e.target.value })} className={inputClass}>
                  {["Available", "Delayed", "Backordered"].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={runPredictDelays} disabled={predictLoading} className="gradient-blue text-white border-0">
              {predictLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
              Predict Delays
            </Button>
            {predictResult && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <MarkdownText text={predictResult} className="text-sm text-foreground leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recovery Plan */}
      <AnimatePresence>
        {recoveryOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">AI Recovery Plan Generator</h3>
              <Button variant="ghost" size="icon" onClick={() => setRecoveryOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Delay (days)</label>
                <input type="number" min="0" value={recoveryForm.delay_days}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, delay_days: parseInt(e.target.value) || 0 })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Budget Remaining ($)</label>
                <input type="number" min="0" value={recoveryForm.budget_remaining}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, budget_remaining: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Delay Causes (comma-separated)</label>
                <input placeholder="e.g. Steel delivery delay, Permit hold-up" value={recoveryForm.delay_causes}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, delay_causes: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Available Resources (comma-separated)</label>
                <input placeholder="e.g. Extra crew, Overtime budget" value={recoveryForm.available_resources}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, available_resources: e.target.value })} className={inputClass} />
              </div>
            </div>
            <Button onClick={runRecoveryPlan} disabled={recoveryLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
              {recoveryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
              Generate Recovery Plan
            </Button>
            {recoveryResult && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <MarkdownText text={recoveryResult} className="text-sm text-foreground leading-relaxed" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted tasks from upload */}
      <AnimatePresence>
        {extractedTasks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-foreground">Tasks Found in Document</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Review and add to your task list</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={addAllExtractedTasks} disabled={addingExtracted === "all"}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-7 px-3 text-xs">
                  {addingExtracted === "all" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  Add All ({extractedTasks.length})
                </Button>
                <button onClick={() => setExtractedTasks([])} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {extractedTasks.map((task, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.task_name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {task.phase && <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{task.phase}</span>}
                      {task.assignee && <span className="text-xs text-muted-foreground">{task.assignee}</span>}
                      {task.planned_start && <span className="text-xs text-muted-foreground">{task.planned_start} → {task.planned_end || "?"}</span>}
                      {task.delay_days > 0 && <span className="text-xs text-red-400">{task.delay_days}d delay</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    <Button size="sm" onClick={() => addExtractedTask(task, idx)}
                      disabled={addingExtracted === String(idx) || addingExtracted === "all"}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-7 px-3 text-xs">
                      {addingExtracted === String(idx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab("tasks")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "tasks" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
          }`}>
          📋 Task List
        </button>
        <button onClick={() => setActiveTab("gantt")}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "gantt" ? "bg-blue-500 text-white" : "text-muted-foreground hover:text-foreground"
          }`}>
          📊 Gantt Chart
        </button>
      </div>

      {/* Task List */}
      {activeTab === "tasks" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }} className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Task List</h3>
              {tasks.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live DB</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-36" />
              </div>
              <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}
                className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none">
                {phases.map(p => <option key={p} value={p}>{p === "all" ? "All Phases" : p}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none">
                <option value="all">All Status</option>
                <option value="done">Completed</option>
                <option value="inprogress">In Progress</option>
                <option value="delayed">Delayed</option>
                <option value="atrisk">At Risk</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
            <span className="col-span-3">Task</span>
            <span className="col-span-1">Phase</span>
            <span className="col-span-2">Assignee</span>
            <span className="col-span-3">Progress</span>
            <span className="col-span-1">Priority</span>
            <span className="col-span-2">Actions</span>
          </div>

          {tasksLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <p className="ml-2 text-sm text-muted-foreground">Loading tasks...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tasks found</p>
              <button onClick={() => setAddTaskOpen(true)}
                className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-xs">
                Add First Task
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((task, i) => (
                <motion.div key={task.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                  <div className="col-span-3">
                    <p className="text-sm font-medium text-foreground truncate">{task.task_name}</p>
                    <p className="text-xs text-muted-foreground">{task.planned_start} → {task.planned_end}</p>
                    {task.delay_days > 0 && <p className="text-xs text-red-400">{task.delay_days}d delay</p>}
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground truncate block">
                      {task.phase || "—"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-foreground truncate">{task.assignee || "—"}</p>
                  </div>
                  <div className="col-span-3">
                    {editingTask === task.id ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input type="range" min="0" max="100" value={editProgress}
                            onChange={(e) => setEditProgress(parseInt(e.target.value))}
                            className="flex-1 h-1.5" />
                          <span className="text-xs text-foreground w-8">{editProgress}%</span>
                        </div>
                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                          className="w-full px-2 py-1 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none">
                          <option value="pending">Pending</option>
                          <option value="inprogress">In Progress</option>
                          <option value="delayed">Delayed</option>
                          <option value="atrisk">At Risk</option>
                          <option value="done">Done</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-secondary rounded-full h-1.5">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${task.actual_progress || 0}%` }}
                            transition={{ delay: i * 0.05, duration: 0.8 }}
                            className={`h-1.5 rounded-full ${getProgressColor(task.actual_progress, task.status)}`} />
                        </div>
                        <span className="text-xs text-foreground w-8 text-right">{task.actual_progress || 0}%</span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Flag className={`w-4 h-4 ${getPriorityColor(task.priority || "medium")}`} />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    {editingTask === task.id ? (
                      <>
                        <button onClick={() => handleUpdateTask(task.id)} disabled={savingTask === task.id}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors">
                          {savingTask === task.id
                            ? <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                            : <Save className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                        <button onClick={() => setEditingTask(null)}
                          className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors">
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getStatusColor(task.status)}`}>
                          {task.status === "inprogress" ? "Active" :
                           task.status === "atrisk" ? "Risk" :
                           task.status === "done" ? "Done" :
                           task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || "—"}
                        </span>
                        <button onClick={() => { setEditingTask(task.id); setEditProgress(task.actual_progress || 0); setEditStatus(task.status || "pending"); }}
                          className="p-1.5 rounded-lg hover:bg-blue-500/10 transition-colors opacity-0 group-hover:opacity-100">
                          <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button onClick={() => handleDeleteTask(task.id)} disabled={deletingTask === task.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                          {deletingTask === task.id
                            ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Gantt Chart */}
      {activeTab === "gantt" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">Gantt Chart</h3>
            {selectedProject && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                {selectedProject.name}
              </span>
            )}
            {tasks.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                Live DB
              </span>
            )}
          </div>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : tasks.length > 0 ? (
            <GanttChart tasks={tasks} projectName={selectedProject?.name} />
          ) : (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tasks to display on Gantt</p>
              <button onClick={() => setAddTaskOpen(true)}
                className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-xs">
                Add Tasks
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* S-Curve */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }} className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">S-Curve Progress</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Planned vs Actual cumulative %</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-orange-500/10 text-orange-400">
            {overallProgress}% Overall
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={sCurveData}>
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
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            <Area type="monotone" dataKey="planned" stroke="#3b82f6" fill="url(#planned)" strokeWidth={2} name="Planned" />
            <Area type="monotone" dataKey="actual" stroke="#10b981" fill="url(#actual)" strokeWidth={2} name="Actual" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
        </div>
      </motion.div>

      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Schedule Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-muted-foreground leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Scheduling & Tasks"
        placeholder="Ask about delays, tasks, schedule..."
        pageSummaryData={{
          totalTasks, completedTasks, overdueTasks, overallProgress,
          project: selectedProject?.name, mlPrediction: mlDelay,
        }}
      />
    </div>
  );
}