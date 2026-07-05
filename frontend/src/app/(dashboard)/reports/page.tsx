"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Loader2,
  FileText,
  Download,
  TrendingUp,
  Users,
  DollarSign,
  Shield,
  ChevronDown,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

interface Project {
  id: string;
  name: string;
  location?: string;
  client?: string;
  total_budget?: number;
  spent_to_date?: number;
  progress_percentage?: number;
  status?: string;
  start_date?: string;
  end_date?: string;
}

const reportTypes = [
  { id: "weekly",      title: "Weekly Progress Report", desc: "Auto-generated weekly summary",  icon: TrendingUp, color: "border-blue-500/20 bg-blue-500/5",    iconColor: "text-blue-400" },
  { id: "stakeholder", title: "Stakeholder Report",      desc: "Client-friendly plain English",  icon: Users,      color: "border-cyan-500/20 bg-cyan-500/5", iconColor: "text-cyan-400" },
  { id: "kpi",         title: "KPI Report",              desc: "Performance metrics & targets",  icon: DollarSign, color: "border-emerald-500/20 bg-emerald-500/5",iconColor: "text-emerald-400" },
  { id: "safety",      title: "Safety Report",           desc: "Incidents & compliance",         icon: Shield,     color: "border-red-500/20 bg-red-500/5",       iconColor: "text-red-400" },
];

export default function ReportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [projects, setProjects]           = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [kpiData, setKpiData]             = useState<any[]>([]);
  const [progressData, setProgressData]   = useState<any[]>([]);
  const [radarData, setRadarData]         = useState<any[]>([]);

  useEffect(() => {
    fetchProjects();
    fetchChartData();
  }, []);

  const fetchProjects = async () => {
    setProjectsLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const fetched: Project[] = res.data.projects || [];
      setProjects(fetched);
      if (fetched.length > 0) setSelectedProject(fetched[0]);
    } catch {
      toast.error("Could not load projects");
    } finally {
      setProjectsLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const [kpisRes, progressRes] = await Promise.allSettled([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/kpis`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/progress`),
      ]);
      if (kpisRes.status === "fulfilled") {
        const kpis = kpisRes.value.data.kpis || {};
        setKpiData([
          { month: "Current", cost: kpis.avg_progress ?? 0, schedule: kpis.avg_progress ?? 0, safety: kpis.safety_score ?? 0, quality: 0 },
        ]);
        setRadarData([
          { metric: "Schedule", score: kpis.avg_progress ?? 0 },
          { metric: "Safety",   score: kpis.safety_score ?? 0 },
          { metric: "Budget",   score: kpis.total_budget > 0 ? Math.min(100, Math.round((1 - (kpis.spent_to_date ?? 0) / kpis.total_budget) * 100)) : 0 },
          { metric: "Workforce",score: kpis.active_workers > 0 ? 80 : 0 },
        ]);
      }
      if (progressRes.status === "fulfilled") {
        setProgressData(progressRes.value.data.data || []);
      }
    } catch {
      // charts remain empty — non-critical
    }
  };

  const generateReport = async (type: string) => {
    if (!selectedProject) { toast.error("Select a project first"); return; }
    setLoading(type);
    try {
      let response;
      const p = selectedProject;
      const budget = p.total_budget ?? 0;
      const spent = p.spent_to_date ?? 0;
      const progress = p.progress_percentage ?? 0;
      const overrunPct = budget > 0 ? Math.round(((spent - budget) / budget) * 100) : 0;

      if (type === "weekly") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/weekly`,
          {
            project_name: p.name,
            week_number: Math.ceil(
              ((Date.now() - new Date(p.start_date || Date.now()).getTime()) / 86400000) / 7
            ),
            progress_percentage: progress,
            budget_spent: spent,
            total_budget: budget,
            completed_tasks: [],
            pending_tasks: [],
            issues: overrunPct > 0 ? [`Budget overrun: ${overrunPct}%`] : [],
            safety_incidents: 0,
          }
        );
        setReport(response.data.report);
      } else if (type === "stakeholder") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/stakeholder`,
          {
            project_name: p.name,
            client_name: p.client || "Client",
            report_date: new Date().toISOString().split("T")[0],
            overall_progress: progress,
            budget_status: overrunPct > 0
              ? `${overrunPct}% over budget`
              : overrunPct < 0
              ? `${Math.abs(overrunPct)}% under budget`
              : "On budget",
            key_achievements: [],
            upcoming_milestones: [],
            concerns: overrunPct > 5 ? ["Budget overrun requires attention"] : [],
          }
        );
        setReport(response.data.report);
      } else if (type === "kpi") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/kpi`,
          {
            project_name: p.name,
            kpis:    { cost: Math.max(0, 100 - Math.abs(overrunPct)), schedule: progress, safety: 90, quality: 85 },
            targets: { cost: 90, schedule: 90, safety: 95, quality: 90 },
            period: "Monthly",
          }
        );
        setReport(response.data.report);
      } else if (type === "safety") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/kpi`,
          {
            project_name: p.name,
            kpis:    { safety: 90, ppe_compliance: 87, near_miss: 5 },
            targets: { safety: 95, ppe_compliance: 95, near_miss: 0 },
            period: "Monthly",
          }
        );
        setReport(response.data.report);
      }
      toast.success("Report generated!");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(null);
    }
  };

  const generateMeetingSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/meeting-summary`,
        {
          meeting_title: "Weekly Site Meeting",
          date: new Date().toISOString().split("T")[0],
          attendees: ["PM", "Site Engineer", "Safety Officer"],
          transcript,
        }
      );
      setSummary(response.data.summary);
      toast.success("Meeting summarized!");
    } catch {
      toast.error("Failed to summarize");
    } finally {
      setSummaryLoading(false);
    }
  };

  const weeklyProgress = progressData.length > 0
    ? progressData.slice(-6).map((d: any, i: number) => ({
        week: `W${i + 1}`,
        planned: d.planned ?? 0,
        actual: d.actual ?? 0,
      }))
    : [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered report generation & analytics
          </p>
        </div>
        <Button variant="outline" onClick={() => setMeetingOpen(!meetingOpen)}>
          <FileText className="w-4 h-4 mr-2 text-blue-400" />
          Meeting Summary
        </Button>
      </motion.div>

      {/* Project Selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground shrink-0">Report for:</label>
        {projectsLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="relative">
            <select
              value={selectedProject?.id ?? ""}
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value) ?? null;
                setSelectedProject(p);
              }}
              className="appearance-none px-3 py-2 pr-8 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {projects.length === 0 && <option value="">No projects found</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
        {selectedProject && (
          <span className="text-xs text-muted-foreground">
            {selectedProject.progress_percentage ?? 0}% complete ·{" "}
            ${((selectedProject.spent_to_date ?? 0) / 1e6).toFixed(1)}M spent
          </span>
        )}
      </div>

      {/* Report Generator Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTypes.map((rt, i) => (
          <motion.div
            key={rt.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 cursor-pointer ${rt.color} ${!selectedProject ? "opacity-50 pointer-events-none" : ""}`}
            onClick={() => generateReport(rt.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <rt.icon className={`w-5 h-5 ${rt.iconColor}`} />
              {loading === rt.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <Download className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">{rt.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{rt.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Meeting Summary Form */}
      {meetingOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI Meeting Summarizer</h3>
          <textarea
            placeholder="Paste meeting notes or transcript here..."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
          />
          <Button onClick={generateMeetingSummary} disabled={summaryLoading || !transcript} className="gradient-blue text-white border-0">
            {summaryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Summarize Meeting
          </Button>
          {summary && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{summary}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Generated Report */}
      {report && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">Generated Report</h3>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              const blob = new Blob([report], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${selectedProject?.name ?? "report"}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download
            </Button>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{report}</p>
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
          <h3 className="font-semibold text-foreground mb-2">Progress Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Planned vs actual — all projects</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={progressData.slice(-6)}>
              <defs>
                <linearGradient id="planned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Area type="monotone" dataKey="planned" stroke="#3b82f6" fill="url(#planned)" strokeWidth={2} name="Planned" />
              <Area type="monotone" dataKey="actual"  stroke="#10b981" fill="none" strokeWidth={2} name="Actual" />
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
          <h3 className="font-semibold text-foreground mb-2">Project Health Radar</h3>
          <p className="text-xs text-muted-foreground mb-4">Overall performance by area</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData.length > 0 ? radarData : [{ metric: "No data", score: 0 }]}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Weekly Progress */}
      {weeklyProgress.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Weekly Progress</h3>
          <p className="text-xs text-muted-foreground mb-4">Planned vs Actual tasks completed</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyProgress} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="planned" fill="#3b82f620" stroke="#3b82f6" strokeWidth={1} radius={[6, 6, 0, 0]} name="Planned" />
              <Bar dataKey="actual"  fill="#10b981" radius={[6, 6, 0, 0]} name="Actual" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>
        </motion.div>
      )}

      <ModuleChat
        context="Reports & Analytics"
        placeholder="Ask about reports, KPIs, performance..."
        pageSummaryData={{ progressData, radarData, selectedProject }}
      />
    </div>
  );
}
