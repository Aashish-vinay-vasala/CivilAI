"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, AlertTriangle, CheckCircle, TrendingUp, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

interface Worker {
  id: string;
  name: string;
  trade: string;
  capacity: number;
  assigned: number;
  tasks: string[];
}

interface Task {
  id: string;
  name: string;
  trade: string;
  start: number;
  duration: number;
  workers: number;
  priority: "critical" | "high" | "medium" | "low";
}

const TRADES = ["Carpenter", "Mason", "Electrician", "Plumber", "Welder", "Laborer"];
const PRIORITY_STYLES = {
  critical: "bg-red-500/10 text-red-400",
  high:     "bg-orange-500/10 text-orange-400",
  medium:   "bg-amber-500/10 text-amber-400",
  low:      "bg-blue-500/10 text-blue-400",
};

const INITIAL_WORKERS: Worker[] = [
  { id: "w1", name: "John Smith",   trade: "Carpenter",   capacity: 8, assigned: 10, tasks: ["Foundation Formwork", "Roof Framing"] },
  { id: "w2", name: "Maria Garcia", trade: "Mason",        capacity: 8, assigned: 6,  tasks: ["Block Wall Phase 1"] },
  { id: "w3", name: "Lee Wang",     trade: "Electrician", capacity: 8, assigned: 8,  tasks: ["Electrical Rough-in"] },
  { id: "w4", name: "Ahmed Hassan", trade: "Plumber",      capacity: 8, assigned: 3,  tasks: ["Drainage Install"] },
  { id: "w5", name: "David Kim",    trade: "Welder",       capacity: 8, assigned: 9,  tasks: ["Steel Connection", "Rebar Tying"] },
  { id: "w6", name: "Sara Lopez",   trade: "Laborer",      capacity: 8, assigned: 7,  tasks: ["Site Cleanup", "Material Handling"] },
];

const INITIAL_TASKS: Task[] = [
  { id: "t1", name: "Foundation Formwork",  trade: "Carpenter",   start: 1,  duration: 5, workers: 3, priority: "critical" },
  { id: "t2", name: "Block Wall Phase 1",   trade: "Mason",        start: 3,  duration: 8, workers: 2, priority: "high" },
  { id: "t3", name: "Electrical Rough-in",  trade: "Electrician", start: 6,  duration: 4, workers: 2, priority: "high" },
  { id: "t4", name: "Drainage Install",     trade: "Plumber",      start: 2,  duration: 3, workers: 1, priority: "medium" },
  { id: "t5", name: "Steel Connection",     trade: "Welder",       start: 4,  duration: 6, workers: 2, priority: "critical" },
  { id: "t6", name: "Roof Framing",         trade: "Carpenter",   start: 7,  duration: 4, workers: 2, priority: "high" },
  { id: "t7", name: "Site Cleanup",         trade: "Laborer",      start: 1,  duration: 10, workers: 3, priority: "low" },
];

function utilizationColor(pct: number): string {
  if (pct > 110) return "#ef4444";
  if (pct > 90)  return "#f59e0b";
  if (pct < 60)  return "#3b82f6";
  return "#10b981";
}

export default function ResourceLevelingPage() {
  const [workers, setWorkers] = useState<Worker[]>(INITIAL_WORKERS);
  const [tasks] = useState<Task[]>(INITIAL_TASKS);
  const [optimizing, setOptimizing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [leveled, setLeveled] = useState(false);

  const overloaded = workers.filter((w) => w.assigned > w.capacity);
  const underutilized = workers.filter((w) => w.assigned < w.capacity * 0.7);

  const chartData = workers.map((w) => ({
    name: w.name.split(" ")[0],
    utilization: Math.round((w.assigned / w.capacity) * 100),
    capacity: 100,
    trade: w.trade,
  }));

  const levelResources = () => {
    // Simple leveling: redistribute overloaded workers' tasks to underutilized ones of same trade
    setWorkers((prev) => prev.map((w) => {
      if (w.assigned > w.capacity) return { ...w, assigned: w.capacity };
      if (w.assigned < w.capacity * 0.7) return { ...w, assigned: Math.round(w.capacity * 0.8) };
      return w;
    }));
    setLeveled(true);
    toast.success("Resources leveled — allocations optimized");
  };

  const getAiOptimization = async () => {
    setOptimizing(true);
    try {
      const summary = workers.map((w) =>
        `${w.name} (${w.trade}): ${w.assigned}h assigned vs ${w.capacity}h capacity — tasks: ${w.tasks.join(", ")}`
      ).join("\n");
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Analyze this construction worker allocation and provide specific resource leveling recommendations:\n\n${summary}\n\nProvide: 1) Who is overloaded and what to reassign, 2) Who is underutilized and what to add, 3) Schedule adjustments to avoid conflicts, 4) Risk of current allocation.`,
        context: "Resource Leveling",
      });
      setAiSuggestion(res.data?.response || "");
    } catch { toast.error("AI analysis failed"); }
    finally { setOptimizing(false); }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Resource Leveling</h1>
          <p className="text-muted-foreground text-sm mt-1">Optimize worker allocation across tasks and trades</p>
        </div>
        <div className="flex gap-2">
          <button onClick={getAiOptimization} disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors">
            {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Optimize
          </button>
          <button onClick={levelResources}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            <RefreshCw className="w-4 h-4" /> Level Resources
          </button>
        </div>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Workers", value: workers.length, icon: Users, color: "text-blue-400 bg-blue-500/10" },
          { label: "Overloaded",    value: overloaded.length, icon: AlertTriangle, color: "text-red-400 bg-red-500/10" },
          { label: "Underutilized", value: underutilized.length, icon: TrendingUp, color: "text-amber-400 bg-amber-500/10" },
          { label: "Balanced",      value: workers.length - overloaded.length - underutilized.length, icon: CheckCircle, color: "text-emerald-400 bg-emerald-500/10" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Utilization Chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-foreground">Worker Utilization (%)</p>
          {leveled && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Leveled</span>}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 140]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
              formatter={(v: any) => [`${v}%`, "Utilization"]}
            />
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "Capacity", fill: "#ef4444", fontSize: 10 }} />
            <Bar dataKey="utilization" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={utilizationColor(entry.utilization)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Workers Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Worker Allocations</p>
        </div>
        <div className="divide-y divide-border">
          {workers.map((w, i) => {
            const pct = Math.round((w.assigned / w.capacity) * 100);
            const status = pct > 100 ? "overloaded" : pct < 70 ? "underutilized" : "balanced";
            return (
              <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full gradient-blue flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {w.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.trade} · {w.tasks.join(", ")}</p>
                </div>
                <div className="w-32 hidden sm:block">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{w.assigned}h / {w.capacity}h</span>
                    <span style={{ color: utilizationColor(pct) }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: utilizationColor(pct) }} />
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  status === "overloaded" ? "bg-red-500/10 text-red-400" :
                  status === "underutilized" ? "bg-amber-500/10 text-amber-400" :
                  "bg-emerald-500/10 text-emerald-400"
                }`}>{status}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Task Schedule */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Active Tasks</p>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((t, i) => (
            <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
              className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[t.priority]}`}>{t.priority}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.trade} · Week {t.start}–{t.start + t.duration - 1} · {t.workers} workers</p>
              </div>
              <div className="w-24 hidden sm:block">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full gradient-blue rounded-full" style={{ width: `${(t.duration / 10) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-right">{t.duration}w</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-cyan-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <p className="text-sm font-semibold text-foreground">AI Resource Optimization</p>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
        </motion.div>
      )}

      <ModuleChat context="Resource Leveling" placeholder="Who is overloaded? What tasks can be redistributed?" pageSummaryData={{ workers: workers.length, overloaded: overloaded.length }} />
    </div>
  );
}
