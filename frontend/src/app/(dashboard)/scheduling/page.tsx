"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  AlertTriangle,
  TrendingDown,
  Clock,
  CheckCircle,
  Upload,
  Loader2,
  Brain,
  Plus,
  X,
  Search,
  Flag,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const initialTasks = [
  { id: 1, task: "Foundation Work", phase: "Phase 1", assignee: "John Smith", duration: "45 days", progress: 100, status: "completed", priority: "high", startDate: "2024-01-01", endDate: "2024-02-15" },
  { id: 2, task: "Ground Floor Structure", phase: "Phase 1", assignee: "Sarah Johnson", duration: "60 days", progress: 85, status: "delayed", priority: "high", startDate: "2024-02-16", endDate: "2024-04-15" },
  { id: 3, task: "First Floor Slab", phase: "Phase 2", assignee: "Mike Wilson", duration: "30 days", progress: 60, status: "inprogress", priority: "high", startDate: "2024-04-16", endDate: "2024-05-15" },
  { id: 4, task: "MEP Rough-In", phase: "Phase 2", assignee: "Lisa Davis", duration: "45 days", progress: 40, status: "delayed", priority: "medium", startDate: "2024-05-01", endDate: "2024-06-15" },
  { id: 5, task: "Roofing Works", phase: "Phase 3", assignee: "James Lee", duration: "20 days", progress: 25, status: "inprogress", priority: "medium", startDate: "2024-06-01", endDate: "2024-06-20" },
  { id: 6, task: "Electrical Installation", phase: "Phase 2", assignee: "Mike Wilson", duration: "30 days", progress: 15, status: "atrisk", priority: "high", startDate: "2024-06-10", endDate: "2024-07-10" },
  { id: 7, task: "Plumbing Works", phase: "Phase 2", assignee: "Lisa Davis", duration: "25 days", progress: 10, status: "inprogress", priority: "medium", startDate: "2024-06-15", endDate: "2024-07-10" },
  { id: 8, task: "Interior Finishing", phase: "Phase 3", assignee: "Tom Brown", duration: "60 days", progress: 0, status: "pending", priority: "low", startDate: "2024-08-01", endDate: "2024-09-30" },
  { id: 9, task: "External Works", phase: "Phase 3", assignee: "Robert Garcia", duration: "30 days", progress: 0, status: "pending", priority: "low", startDate: "2024-09-01", endDate: "2024-09-30" },
  { id: 10, task: "Final Inspection", phase: "Phase 4", assignee: "Emily Chen", duration: "10 days", progress: 0, status: "pending", priority: "high", startDate: "2024-10-01", endDate: "2024-10-10" },
];

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
  id: number;
  task: string;
  phase: string;
  assignee: string;
  duration: string;
  progress: number;
  status: string;
  priority: string;
  startDate: string;
  endDate: string;
}

export default function SchedulingPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [scenario, setScenario] = useState({ scenario: "", delay_days: 0 });
  const [whatIfResult, setWhatIfResult] = useState("");
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [delayStats, setDelayStats] = useState<any>(null);
  const [mlDelay, setMlDelay] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [newTask, setNewTask] = useState({
    task: "", phase: "Phase 1", assignee: "",
    duration: "", progress: 0, status: "pending",
    priority: "medium", startDate: "", endDate: "",
  });

  useEffect(() => { fetchDelayData(); }, []);

  const fetchDelayData = async () => {
    setMlLoading(true);
    try {
      const statsRes = await axios.get("http://localhost:8000/api/v1/ml/delay-stats");
      setDelayStats(statsRes.data);
      const mlRes = await axios.post("http://localhost:8000/api/v1/ml/delay", {
        project_type: "Commercial",
        planned_duration_days: 180,
        weather_delays: 10,
        labor_shortage: 1,
        material_delays: 1,
        design_changes: 5,
        subcontractor_issues: 1,
      });
      setMlDelay(mlRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setMlLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("http://localhost:8000/api/v1/schedule/analyze", formData);
      setAnalysis(response.data.analysis);
      toast.success("Schedule analyzed!");
    } catch { toast.error("Failed to analyze"); }
    finally { setLoading(false); }
  };

  const runWhatIf = async () => {
    setWhatIfLoading(true);
    try {
      const response = await axios.post("http://localhost:8000/api/v1/schedule/what-if", scenario);
      setWhatIfResult(response.data.analysis);
      toast.success("What-if analysis complete!");
    } catch { toast.error("Failed to run analysis"); }
    finally { setWhatIfLoading(false); }
  };

  const addTask = () => {
    if (!newTask.task || !newTask.assignee) {
      toast.error("Task name and assignee are required!");
      return;
    }
    setTasks([...tasks, { ...newTask, id: tasks.length + 1 }]);
    setNewTask({ task: "", phase: "Phase 1", assignee: "", duration: "", progress: 0, status: "pending", priority: "medium", startDate: "", endDate: "" });
    setAddTaskOpen(false);
    toast.success("Task added!");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "inprogress": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "delayed": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "atrisk": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-secondary text-muted-foreground border-border";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-400";
      case "medium": return "text-orange-400";
      default: return "text-emerald-400";
    }
  };

  const getProgressColor = (progress: number, status: string) => {
    if (status === "completed") return "bg-emerald-500";
    if (status === "delayed") return "bg-red-500";
    if (status === "atrisk") return "bg-orange-500";
    return "bg-blue-500";
  };

  const phases = ["all", ...Array.from(new Set(tasks.map(t => t.phase)))];

  const filteredTasks = tasks.filter(t => {
    const matchSearch = t.task.toLowerCase().includes(search.toLowerCase()) ||
      t.assignee.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchPhase = filterPhase === "all" || t.phase === filterPhase;
    return matchSearch && matchStatus && matchPhase;
  });

  // KPI calculations
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const overdueTasks = tasks.filter(t => t.status === "delayed" || t.status === "atrisk").length;
  const overallProgress = Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks);

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  const delayByType = delayStats?.delay_by_project_type
    ? Object.entries(delayStats.delay_by_project_type).map(([type, rate]: any) => ({
        task: type, delay: Math.round(rate * 100),
      }))
    : [
        { task: "Residential", delay: 55 },
        { task: "Commercial", delay: 62 },
        { task: "Industrial", delay: 48 },
        { task: "Infrastructure", delay: 70 },
      ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Scheduling</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered delay prediction & task management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddTaskOpen(true)}>
            <Plus className="w-4 h-4 mr-2 text-emerald-400" />
            Add Task
          </Button>
          <Button variant="outline" onClick={() => setWhatIfOpen(!whatIfOpen)}>
            <Clock className="w-4 h-4 mr-2 text-blue-400" />
            What-If
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

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Tasks", value: totalTasks.toString(), icon: Calendar, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Overall Progress", value: `${overallProgress}%`, icon: TrendingDown, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          { label: "Overdue / At Risk", value: overdueTasks.toString(), icon: AlertTriangle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
          { label: "Completed", value: completedTasks.toString(), icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlDelay.risk_level === "High" ? "border-red-500/30 bg-red-500/5" :
            mlDelay.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5" :
            "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Delay Prediction</p>
                <p className="text-xl font-bold text-foreground">{mlDelay.probability}% probability of delay</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlDelay.will_be_delayed ? "Delay likely — review schedule" : "On track — monitor closely"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlDelay.risk_level === "High" ? "bg-red-500/10 text-red-400" :
              mlDelay.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400" :
              "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlDelay.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Add Task Form */}
      <AnimatePresence>
        {addTaskOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Add New Task</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddTaskOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1.5 block">Task Name *</label>
                <input placeholder="e.g. Foundation Excavation" value={newTask.task} onChange={(e) => setNewTask({ ...newTask, task: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Phase</label>
                <select value={newTask.phase} onChange={(e) => setNewTask({ ...newTask, phase: e.target.value })} className={inputClass}>
                  <option>Phase 1</option>
                  <option>Phase 2</option>
                  <option>Phase 3</option>
                  <option>Phase 4</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Assignee *</label>
                <input placeholder="Worker name" value={newTask.assignee} onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Duration</label>
                <input placeholder="e.g. 30 days" value={newTask.duration} onChange={(e) => setNewTask({ ...newTask, duration: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Priority</label>
                <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })} className={inputClass}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Start Date</label>
                <input type="date" value={newTask.startDate} onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">End Date</label>
                <input type="date" value={newTask.endDate} onChange={(e) => setNewTask({ ...newTask, endDate: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Progress %</label>
                <input type="number" min="0" max="100" value={newTask.progress} onChange={(e) => setNewTask({ ...newTask, progress: parseInt(e.target.value) })} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addTask} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </Button>
              <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What-If */}
      <AnimatePresence>
        {whatIfOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-blue-500/30 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">What-If Scenario Simulator</h3>
              <Button variant="ghost" size="icon" onClick={() => setWhatIfOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <textarea
                placeholder="Describe scenario (e.g. Steel delivery delayed 2 weeks)"
                value={scenario.scenario}
                onChange={(e) => setScenario({ ...scenario, scenario: e.target.value })}
                rows={3}
                className={`col-span-2 ${inputClass} resize-none`}
              />
              <input
                type="number"
                placeholder="Delay days"
                value={scenario.delay_days}
                onChange={(e) => setScenario({ ...scenario, delay_days: parseInt(e.target.value) })}
                className={inputClass}
              />
            </div>
            <Button onClick={runWhatIf} disabled={whatIfLoading} className="gradient-blue text-white border-0">
              {whatIfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
              Run Analysis
            </Button>
            {whatIfResult && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{whatIfResult}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Task List</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-36"
              />
            </div>
            <select
              value={filterPhase}
              onChange={(e) => setFilterPhase(e.target.value)}
              className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
            >
              {phases.map(p => <option key={p} value={p}>{p === "all" ? "All Phases" : p}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
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
          <span className="col-span-1">Duration</span>
          <span className="col-span-2">Progress</span>
          <span className="col-span-1">Priority</span>
          <span className="col-span-2">Status</span>
        </div>

        <div className="space-y-1">
          {filteredTasks.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="grid grid-cols-12 gap-2 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors"
            >
              <div className="col-span-3">
                <p className="text-sm font-medium text-foreground truncate">{task.task}</p>
                <p className="text-xs text-muted-foreground">{task.startDate} → {task.endDate}</p>
              </div>
              <div className="col-span-1">
                <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">{task.phase}</span>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-foreground truncate">{task.assignee}</p>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-muted-foreground">{task.duration}</p>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary rounded-full h-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${task.progress}%` }}
                      transition={{ delay: i * 0.05, duration: 0.8 }}
                      className={`h-1.5 rounded-full ${getProgressColor(task.progress, task.status)}`}
                    />
                  </div>
                  <span className="text-xs text-foreground w-8 text-right">{task.progress}%</span>
                </div>
              </div>
              <div className="col-span-1">
                <Flag className={`w-4 h-4 ${getPriorityColor(task.priority)}`} />
              </div>
              <div className="col-span-2">
                <span className={`text-xs px-2 py-1 rounded-full border font-medium capitalize ${getStatusColor(task.status)}`}>
                  {task.status === "inprogress" ? "In Progress" :
                   task.status === "atrisk" ? "At Risk" :
                   task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* S-Curve */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">S-Curve Progress</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Planned vs Actual cumulative %</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-orange-500/10 text-orange-400">-10% Behind</span>
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

      {/* Delay Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">Delay by Project Type</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {delayStats ? "Real ML dataset" : "Sample data"}
            </p>
          </div>
          {delayStats && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={delayByType} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
            <YAxis dataKey="task" type="category" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            <Bar dataKey="delay" fill="#ef4444" radius={[0, 6, 6, 0]} name="Delay %" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Schedule Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Scheduling & Tasks"
        placeholder="Ask about delays, tasks, schedule..."
        pageSummaryData={{
          totalTasks,
          completedTasks,
          overdueTasks,
          overallProgress,
          mlPrediction: mlDelay,
          delayRate: delayStats?.delay_rate_pct,
        }}
      />
    </div>
  );
}