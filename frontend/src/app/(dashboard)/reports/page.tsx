"use client";

import { useState } from "react";
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

const kpiData = [
  { month: "Jan", cost: 78, schedule: 82, safety: 88, quality: 85 },
  { month: "Feb", cost: 72, schedule: 78, safety: 90, quality: 87 },
  { month: "Mar", cost: 68, schedule: 75, safety: 85, quality: 82 },
  { month: "Apr", cost: 74, schedule: 80, safety: 92, quality: 89 },
  { month: "May", cost: 70, schedule: 77, safety: 94, quality: 91 },
  { month: "Jun", cost: 76, schedule: 82, safety: 91, quality: 88 },
];

const projectRadar = [
  { metric: "Cost", score: 76 },
  { metric: "Schedule", score: 82 },
  { metric: "Safety", score: 94 },
  { metric: "Quality", score: 88 },
  { metric: "Workforce", score: 79 },
  { metric: "Compliance", score: 91 },
];

const weeklyProgress = [
  { week: "W1", planned: 5, actual: 4 },
  { week: "W2", planned: 8, actual: 7 },
  { week: "W3", planned: 6, actual: 6 },
  { week: "W4", planned: 9, actual: 8 },
  { week: "W5", planned: 7, actual: 5 },
  { week: "W6", planned: 10, actual: 9 },
];

const reportTypes = [
  { title: "Weekly Progress Report", desc: "Auto-generated weekly summary", icon: TrendingUp, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
  { title: "Stakeholder Report", desc: "Client-friendly plain English", icon: Users, color: "border-purple-500/20 bg-purple-500/5", iconColor: "text-purple-400" },
  { title: "Cost Report", desc: "Budget & financial summary", icon: DollarSign, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
  { title: "Safety Report", desc: "Incidents & compliance", icon: Shield, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
];

export default function ReportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const generateReport = async (type: string) => {
    setLoading(type);
    try {
      let response;
      if (type === "weekly") {
        response = await axios.post(
          "http://localhost:8000/api/v1/reports/weekly",
          {
            project_name: "CivilAI Demo Project",
            week_number: 24,
            progress_percentage: 62,
            budget_spent: 18200000,
            total_budget: 24500000,
            completed_tasks: ["Foundation", "Ground Floor"],
            pending_tasks: ["First Floor", "MEP", "Roofing"],
            issues: ["Steel delivery delayed", "Cost overrun on foundation"],
            safety_incidents: 0,
          }
        );
        setReport(response.data.report);
      } else if (type === "stakeholder") {
        response = await axios.post(
          "http://localhost:8000/api/v1/reports/stakeholder",
          {
            project_name: "CivilAI Demo Project",
            client_name: "ABC Corporation",
            report_date: new Date().toISOString().split("T")[0],
            overall_progress: 62,
            budget_status: "On track with 4.2% overrun",
            key_achievements: ["Foundation complete", "Ground floor structure done"],
            upcoming_milestones: ["First floor by Aug 2026", "MEP by Oct 2026"],
            concerns: ["Steel delivery delay", "Weather impact"],
          }
        );
        setReport(response.data.report);
      } else if (type === "kpi") {
        response = await axios.post(
          "http://localhost:8000/api/v1/reports/kpi",
          {
            project_name: "CivilAI Demo Project",
            kpis: { cost: 76, schedule: 82, safety: 94, quality: 88 },
            targets: { cost: 85, schedule: 90, safety: 95, quality: 90 },
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
        "http://localhost:8000/api/v1/reports/meeting-summary",
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

      {/* Report Generator Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTypes.map((rt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 cursor-pointer ${rt.color}`}
            onClick={() => generateReport(i === 0 ? "weekly" : i === 1 ? "stakeholder" : "kpi")}
          >
            <div className="flex items-center justify-between mb-3">
              <rt.icon className={`w-5 h-5 ${rt.iconColor}`} />
              {loading === (i === 0 ? "weekly" : i === 1 ? "stakeholder" : "kpi") ? (
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
              a.download = "report.txt";
              a.click();
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
          <h3 className="font-semibold text-foreground mb-2">KPI Trends</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly performance scores</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={kpiData}>
              <defs>
                <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Area type="monotone" dataKey="cost" stroke="#3b82f6" fill="url(#cost)" strokeWidth={2} name="Cost" />
              <Area type="monotone" dataKey="schedule" stroke="#f59e0b" fill="none" strokeWidth={2} name="Schedule" />
              <Area type="monotone" dataKey="safety" stroke="#10b981" fill="none" strokeWidth={2} name="Safety" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Cost</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Schedule</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Safety</span></div>
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
            <RadarChart data={projectRadar}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Weekly Progress */}
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
            <Bar dataKey="actual" fill="#10b981" radius={[6, 6, 0, 0]} name="Actual" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
        </div>
      </motion.div>

      <ModuleChat
        context="Reports & Analytics"
        placeholder="Ask about reports, KPIs, performance..."
        pageSummaryData={{
          kpiData,
          projectRadar,
          weeklyProgress,
        }}
      />
    </div>
  );
}