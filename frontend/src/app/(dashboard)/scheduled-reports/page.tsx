"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Clock, Plus, Trash2, Loader2, Send, CheckCircle, X, Calendar, Bell } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

interface Schedule {
  id: string;
  name: string;
  type: "daily" | "weekly" | "alert";
  emails: string;
  project: string;
  enabled: boolean;
  lastSent?: string;
}

const DEFAULT_SCHEDULES: Schedule[] = [
  { id: "1", name: "Weekly Project Summary", type: "weekly",  emails: "pm@civilai.com", project: "Highway Project", enabled: true,  lastSent: "2025-04-14" },
  { id: "2", name: "Daily Safety Report",    type: "daily",   emails: "safety@civilai.com", project: "Tower A",   enabled: true,  lastSent: "2025-04-19" },
  { id: "3", name: "Budget Alerts",          type: "alert",   emails: "finance@civilai.com", project: "All",      enabled: false },
];

const TYPE_STYLES = {
  daily:  "bg-blue-500/10 text-blue-400",
  weekly: "bg-emerald-500/10 text-emerald-400",
  alert:  "bg-amber-500/10 text-amber-400",
};

const TYPE_FREQ = { daily: "Every day at 8am", weekly: "Every Monday at 8am", alert: "On threshold breach" };

const ACCENT: Record<string, { bg: string; border: string; text: string }> = {
  cyan:  { bg: "rgba(0,212,255,0.1)",  border: "rgba(0,212,255,0.2)",  text: "#00D4FF" },
  green: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)", text: "#10B981" },
  amber: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)", text: "#F59E0B" },
};

const inputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const primaryBtnStyle = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
};
const ghostBtn =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

export default function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<Schedule[]>(DEFAULT_SCHEDULES);
  const [showCreate, setShowCreate] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "weekly" as Schedule["type"], emails: "", project: "All Projects" });

  const handleCreate = () => {
    if (!form.name || !form.emails) { toast.error("Name and emails required"); return; }
    setSchedules((s) => [...s, { id: crypto.randomUUID(), ...form, enabled: true }]);
    setShowCreate(false);
    setForm({ name: "", type: "weekly", emails: "", project: "All Projects" });
    toast.success("Schedule created");
  };

  const toggleEnabled = (id: string) =>
    setSchedules((s) => s.map((sc) => sc.id === id ? { ...sc, enabled: !sc.enabled } : sc));

  const removeSchedule = (id: string) => {
    setSchedules((s) => s.filter((sc) => sc.id !== id));
    toast.success("Schedule removed");
  };

  const sendNow = async (schedule: Schedule) => {
    setSending(schedule.id);
    try {
      const recipients = schedule.emails.split(",").map((e) => e.trim()).filter(Boolean);
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/email/report`, {
        to: recipients,
        project_name: schedule.project,
        report_type: schedule.type,
        summary: `${schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1)} report for ${schedule.project}.\n\nThis is a test send triggered manually from CivilAI Scheduled Reports.`,
        metrics: {
          "Report Type": schedule.type,
          "Project": schedule.project,
          "Sent To": recipients.join(", "),
          "Timestamp": new Date().toLocaleString(),
        },
      });
      setSchedules((s) => s.map((sc) => sc.id === schedule.id ? { ...sc, lastSent: new Date().toISOString().split("T")[0] } : sc));
      toast.success(`Report sent to ${recipients.length} recipient(s)`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? "Failed to send report";
      toast.error(detail);
    } finally { setSending(null); }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Scheduled Reports</h1>
          <p className="text-white/35 text-[13px] mt-1">Automate email reports to your team</p>
        </div>
        <button onClick={() => setShowCreate(true)} className={primaryBtn} style={primaryBtnStyle}>
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Schedules", value: schedules.length, icon: Calendar, accent: "cyan" },
          { label: "Active",          value: schedules.filter((s) => s.enabled).length, icon: CheckCircle, accent: "green" },
          { label: "Report Types",    value: 3, icon: Bell, accent: "amber" },
        ].map((s, i) => {
          const a = ACCENT[s.accent];
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass-card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: a.bg, border: `1px solid ${a.border}` }}>
                <s.icon className="w-4 h-4" style={{ color: a.text }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/35">{s.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Schedule List */}
      <div className="space-y-3">
        {schedules.map((sc, i) => (
          <motion.div key={sc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="glass-card p-5 transition-all" style={sc.enabled ? undefined : { opacity: 0.6 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={sc.enabled
                    ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Mail className="w-4 h-4" style={{ color: sc.enabled ? "#00D4FF" : "rgba(255,255,255,0.35)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{sc.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_STYLES[sc.type]}`}>{sc.type}</span>
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">{TYPE_FREQ[sc.type]} · {sc.project}</p>
                  <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {sc.emails}
                  </p>
                  {sc.lastSent && (
                    <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Last sent: {sc.lastSent}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle */}
                <button onClick={() => toggleEnabled(sc.id)}
                  className="relative w-9 h-5 rounded-full transition-colors"
                  style={sc.enabled
                    ? { background: "#00D4FF" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sc.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
                <button onClick={() => sendNow(sc)} disabled={sending === sc.id} className={ghostBtn} style={ghostBtnStyle}>
                  {sending === sc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Send Now
                </button>
                <button onClick={() => removeSchedule(sc.id)} className="p-1.5 text-white/35 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: "rgba(4,11,25,0.92)", border: "1px solid rgba(0,212,255,0.15)", boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)", backdropFilter: "blur(32px)" }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-white">New Report Schedule</h3>
                <button onClick={() => setShowCreate(false)} className="text-white/35 hover:text-white/70"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs text-white/35 mb-1 block">Schedule Name *</label>
                  <input className={inputClass} style={inputStyle} placeholder="e.g. Weekly Summary" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div><label className="text-xs text-white/35 mb-1 block">Type</label>
                  <select className={inputClass} style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Schedule["type"] }))}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="alert">Alert</option>
                  </select>
                </div>
                <div><label className="text-xs text-white/35 mb-1 block">Recipient Emails * (comma-separated)</label>
                  <input className={inputClass} style={inputStyle} placeholder="pm@company.com, eng@company.com" value={form.emails} onChange={(e) => setForm((f) => ({ ...f, emails: e.target.value }))} />
                </div>
                <div><label className="text-xs text-white/35 mb-1 block">Project</label>
                  <input className={inputClass} style={inputStyle} placeholder="All Projects" value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl text-white/50 hover:text-white/80 text-sm transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>Cancel</button>
                <button onClick={handleCreate} className="flex-1 py-2 rounded-xl text-white text-sm flex items-center justify-center gap-2 transition-all hover:scale-105"
                  style={primaryBtnStyle}>
                  <Mail className="w-4 h-4" /> Create Schedule
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="Scheduled Reports" placeholder="When was the last report sent? Set up weekly alerts..." pageSummaryData={{ schedules: schedules.length, active: schedules.filter((s) => s.enabled).length }} />
    </div>
  );
}
