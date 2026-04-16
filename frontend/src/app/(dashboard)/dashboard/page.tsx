"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  DollarSign,
  Calendar,
  Users,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowRight,
  Building2,
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
import ModuleChat from "@/components/shared/ModuleChat";
import Link from "next/link";
import axios from "axios";

const progressData = [
  { month: "Jan", planned: 10, actual: 8 },
  { month: "Feb", planned: 25, actual: 22 },
  { month: "Mar", planned: 40, actual: 35 },
  { month: "Apr", planned: 55, actual: 52 },
  { month: "May", planned: 70, actual: 65 },
  { month: "Jun", planned: 85, actual: 78 },
];

const costData = [
  { month: "Jan", budget: 120, actual: 115 },
  { month: "Feb", budget: 180, actual: 195 },
  { month: "Mar", budget: 150, actual: 148 },
  { month: "Apr", budget: 200, actual: 220 },
  { month: "May", budget: 170, actual: 165 },
  { month: "Jun", budget: 190, actual: 188 },
];

const kpis = [
  { title: "Total Budget", value: "$24.5M", change: "+2.4%", trend: "up", icon: DollarSign, color: "from-blue-600 to-blue-400", border: "border-blue-500/20", href: "/cost" },
  { title: "Schedule Progress", value: "78%", change: "-3.2%", trend: "down", icon: Calendar, color: "from-orange-600 to-orange-400", border: "border-orange-500/20", href: "/scheduling" },
  { title: "Active Workers", value: "342", change: "+12", trend: "up", icon: Users, color: "from-emerald-600 to-emerald-400", border: "border-emerald-500/20", href: "/workforce" },
  { title: "Safety Score", value: "94/100", change: "+1.2%", trend: "up", icon: Shield, color: "from-purple-600 to-purple-400", border: "border-purple-500/20", href: "/safety" },
];

const alerts = [
  { icon: AlertTriangle, text: "Cost overrun detected — Foundation work", time: "2h ago", color: "text-orange-400", bg: "bg-orange-500/10" },
  { icon: Clock, text: "Schedule delay predicted — Block B MEP", time: "4h ago", color: "text-blue-400", bg: "bg-blue-500/10" },
  { icon: CheckCircle, text: "Permit approved — Phase 2", time: "6h ago", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { icon: AlertTriangle, text: "Steel delivery delayed by 3 days", time: "1d ago", color: "text-red-400", bg: "bg-red-500/10" },
];

const modules = [
  { title: "Cost & Budget", desc: "AI cost forecasting", href: "/cost", color: "from-blue-600/20 to-blue-400/5", border: "border-blue-500/20", icon: DollarSign, iconColor: "text-blue-400" },
  { title: "Scheduling", desc: "Delay prediction", href: "/scheduling", color: "from-orange-600/20 to-orange-400/5", border: "border-orange-500/20", icon: Calendar, iconColor: "text-orange-400" },
  { title: "Safety", desc: "Risk monitoring", href: "/safety", color: "from-red-600/20 to-red-400/5", border: "border-red-500/20", icon: Shield, iconColor: "text-red-400" },
  { title: "Workforce", desc: "Skills & turnover", href: "/workforce", color: "from-emerald-600/20 to-emerald-400/5", border: "border-emerald-500/20", icon: Users, iconColor: "text-emerald-400" },
];

export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    axios.get("http://localhost:8000/api/v1/projects/")
      .then(res => setProjects(res.data.projects))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-muted-foreground text-sm">Good morning 👋</p>
        <h1 className="text-3xl font-bold text-foreground mt-1">Project Overview</h1>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Link href={kpi.href} key={i}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className={`rounded-2xl border ${kpi.border} p-5 cursor-pointer bg-card hover:shadow-lg transition-shadow`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
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
        ))}
      </div>

      {/* Live Projects from Supabase */}
      {projects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">Active Projects</h3>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              Live Supabase
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {projects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -2 }}
                className="p-4 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/70 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-foreground text-sm">{project.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                    {project.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-0.5">{project.client}</p>
                <p className="text-xs text-muted-foreground mb-3">{project.location}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="text-foreground font-medium">{project.progress_percentage}%</span>
                  </div>
                  <div className="bg-secondary rounded-full h-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${project.progress_percentage}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                      className="h-1.5 rounded-full bg-blue-500"
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="text-foreground font-medium">
                      ${(project.total_budget / 1000000).toFixed(1)}M
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Spent</span>
                    <span className="text-foreground font-medium">
                      ${(project.spent_to_date / 1000000).toFixed(1)}M
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Project Progress</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Planned vs Actual %</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400">This Year</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
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
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Cost Analysis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Budget vs Actual ($K)</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-orange-500/10 text-orange-400">Monthly</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="budget" fill="#3b82f620" stroke="#3b82f6" strokeWidth={1} radius={[6, 6, 0, 0]} name="Budget" />
              <Bar dataKey="actual" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Actual" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Live Alerts</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400">4 Active</span>
          </div>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg ${alert.bg} flex items-center justify-center flex-shrink-0`}>
                  <alert.icon className={`w-4 h-4 ${alert.color}`} />
                </div>
                <p className="text-sm text-foreground flex-1">{alert.text}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{alert.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Quick Access</h3>
          <div className="space-y-2">
            {modules.map((mod, i) => (
              <Link key={i} href={mod.href}>
                <motion.div
                  whileHover={{ x: 4 }}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${mod.color} border ${mod.border} cursor-pointer mb-2`}
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

      <ModuleChat
        context="Project Dashboard"
        placeholder="Ask about your project..."
        pageSummaryData={{
          totalBudget: "$24.5M",
          scheduleProgress: "78%",
          activeWorkers: 342,
          safetyScore: "94/100",
          projects: projects.map(p => ({
            name: p.name,
            progress: p.progress_percentage,
            budget: p.total_budget,
          })),
        }}
      />
    </div>
  );
}