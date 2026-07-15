"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, AlertTriangle, CheckCircle, TrendingUp, Loader2, Sparkles, ListChecks } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import { useWorkforceFilterStore } from "@/lib/stores/workforceFilterStore";
import { ACCENT, glassInputClass, glassInputStyle, glassButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";

// Same worker roster as the Workforce "Team" tab (GET /api/v1/workforce/workers)
// and the same 8-hour standard workday the Workforce page's own "Avg Utilization"
// KPI is built on — so both pages read one real data source and agree on what
// "100% utilized" means, instead of each inventing its own numbers.
const DAILY_CAPACITY_HOURS = 8;

interface Worker {
  id: string;
  project_id?: string;
  name: string;
  role: string;
  trade: string;
  status: string;
  hours_worked: number;
}

interface ScheduleTask {
  id: string;
  task_name: string;
  phase: string;
  assignee: string;
  status: string;
  priority: string;
  planned_start: string;
  planned_end: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const avatarGradient = { background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)" };
const ghostBtn =
  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";

function utilizationColor(pct: number): string {
  if (pct > 110) return "#EF4444";
  if (pct > 90)  return "#F59E0B";
  if (pct < 60)  return "#00D4FF";
  return "#10B981";
}

export default function ResourceLevelingPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const selectedProjectId = useWorkforceFilterStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useWorkforceFilterStore((s) => s.setSelectedProjectId);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  useEffect(() => {
    (async () => {
      setWorkersLoading(true);
      try {
        const [workersRes, projectsRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/workers`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`),
        ]);
        setWorkers(workersRes.data.workers || []);
        setAllProjects(projectsRes.data.projects || []);
      } catch {
        toast.error("Failed to load workforce data");
      } finally {
        setWorkersLoading(false);
      }
    })();
  }, []);

  // Task assignments are project-scoped in the real schedule, so they only load
  // once a specific project is picked (mirrors EVM/Payments on the Cost page).
  useEffect(() => {
    if (selectedProjectId === "all") { setTasks([]); return; }
    (async () => {
      setTasksLoading(true);
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${selectedProjectId}/schedule`);
        setTasks(res.data.tasks || []);
      } catch {
        toast.error("Failed to load tasks");
      } finally {
        setTasksLoading(false);
      }
    })();
  }, [selectedProjectId]);

  // Same project filter used on the Workforce "Team" tab, so switching the
  // dropdown here and there scopes the same people the same way.
  const filteredWorkers = selectedProjectId === "all"
    ? workers
    : workers.filter((w) => w.project_id === selectedProjectId);

  const tasksFor = (workerName: string) =>
    tasks.filter((t) => (t.assignee || "").trim().toLowerCase() === workerName.trim().toLowerCase());

  const overloaded = filteredWorkers.filter((w) => (w.hours_worked || 0) > DAILY_CAPACITY_HOURS);
  const underutilized = filteredWorkers.filter((w) => (w.hours_worked || 0) < DAILY_CAPACITY_HOURS * 0.7);

  const chartData = filteredWorkers.map((w) => ({
    name: w.name.split(" ")[0],
    utilization: Math.round(((w.hours_worked || 0) / DAILY_CAPACITY_HOURS) * 100),
    trade: w.trade,
  }));

  const getAiOptimization = async () => {
    if (filteredWorkers.length === 0) { toast.error("No workers to analyze"); return; }
    setOptimizing(true);
    try {
      const summary = filteredWorkers.map((w) =>
        `${w.name} (${w.trade || w.role}): ${w.hours_worked || 0}h logged today vs ${DAILY_CAPACITY_HOURS}h standard capacity`
      ).join("\n");
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Analyze this construction worker allocation and provide specific resource leveling recommendations:\n\n${summary}\n\nProvide: 1) Who is overloaded and what to reassign, 2) Who is underutilized and what to add, 3) Schedule adjustments to avoid conflicts, 4) Risk of current allocation.`,
        context: "Resource Leveling",
      });
      setAiSuggestion(res.data?.response || "");
    } catch {
      toast.error("AI analysis failed");
    } finally {
      setOptimizing(false);
    }
  };

  const kpis = [
    { label: "Total Workers", value: filteredWorkers.length, icon: Users, accent: "blue" as const },
    { label: "Overloaded",    value: overloaded.length, icon: AlertTriangle, accent: "red" as const },
    { label: "Underutilized", value: underutilized.length, icon: TrendingUp, accent: "amber" as const },
    { label: "Balanced",      value: filteredWorkers.length - overloaded.length - underutilized.length, icon: CheckCircle, accent: "green" as const },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Resource Leveling</h1>
          <p className="text-white/35 text-[13px] mt-1">Optimize worker allocation across tasks and trades</p>
        </div>
        <div className="flex items-center gap-2 flex-nowrap">
          {allProjects.length > 0 && (
            <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}
              className={glassInputClass + " shrink-0"} style={{ ...glassInputStyle, width: "auto" }}>
              <option value="all">All Projects</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button onClick={getAiOptimization} disabled={optimizing} className={ghostBtn + " shrink-0"} style={glassButtonStyle}>
            {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-cyan-400" />}
            AI Optimize
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {workersLoading ? (
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
                <div className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                  <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                </div>
                <p className="relative text-[28px] font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
                <p className="relative text-[13px] text-white/40 mt-1">{kpi.label}</p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Utilization Chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white text-[14px]">Worker Utilization (%)</h3>
          <span className="text-xs text-white/35">vs {DAILY_CAPACITY_HOURS}h standard workday</span>
        </div>
        {workersLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-16 text-sm text-white/35">No workers to chart{selectedProjectId !== "all" ? " for this project" : ""}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 140]} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} formatter={(v: any) => [`${v}%`, "Utilization"]} />
              <ReferenceLine y={100} stroke="#EF4444" strokeDasharray="4 2" label={{ value: "Capacity", fill: "#EF4444", fontSize: 10 }} />
              <Bar dataKey="utilization" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={utilizationColor(entry.utilization)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Worker Allocations */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
        <h3 className="font-semibold text-white mb-4">Worker Allocations</h3>
        {workersLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <p className="text-sm text-white/35">No workers{selectedProjectId !== "all" ? " assigned to this project" : ""}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredWorkers.map((w, i) => {
              const hours = w.hours_worked || 0;
              const pct = Math.round((hours / DAILY_CAPACITY_HOURS) * 100);
              const status = pct > 100 ? "overloaded" : pct < 70 ? "underutilized" : "balanced";
              const assignedTasks = tasksFor(w.name);
              return (
                <motion.div key={w.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/2 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={avatarGradient}>
                    {w.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{w.name}</p>
                    <p className="text-xs text-white/35 truncate">
                      {w.role}{w.trade ? ` · ${w.trade}` : ""}
                      {assignedTasks.length > 0 ? ` · ${assignedTasks.map((t) => t.task_name).join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="w-32 hidden sm:block shrink-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/35">{hours}h / {DAILY_CAPACITY_HOURS}h</span>
                      <span style={{ color: utilizationColor(pct) }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: utilizationColor(pct) }} />
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium shrink-0 ${
                    status === "overloaded" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    status === "underutilized" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  }`}>{status}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Active Tasks — real schedule_tasks for the selected project */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="w-4 h-4 text-white/35" />
          <h3 className="font-semibold text-white">Active Tasks</h3>
        </div>
        {selectedProjectId === "all" ? (
          <div className="text-center py-10 text-sm text-white/35">Select a project above to see its scheduled tasks</div>
        ) : tasksLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-10 text-sm text-white/35">No tasks scheduled for this project yet</div>
        ) : (
          <div className="space-y-1">
            {tasks.map((t, i) => (
              <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/2 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{t.task_name}</p>
                    {t.priority && <span className={`text-xs px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>{t.priority}</span>}
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">
                    {[t.phase, t.assignee, t.status].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="text-xs text-white/35 text-right shrink-0">
                  {t.planned_start && t.planned_end ? `${t.planned_start} → ${t.planned_end}` : "No dates set"}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Resource Optimization</h3>
          </div>
          <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
        </motion.div>
      )}

      <ModuleChat context="Resource Leveling" placeholder="Who is overloaded? What tasks can be redistributed?" pageSummaryData={{ workers: filteredWorkers.length, overloaded: overloaded.length }} />
    </div>
  );
}
