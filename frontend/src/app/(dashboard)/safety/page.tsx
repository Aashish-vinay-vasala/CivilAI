"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, AlertTriangle, CheckCircle, Upload, Loader2, Brain,
  Clock, XCircle, Wrench, FileWarning, Plus, Trash2, Pencil,
  Search, X, FileText, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import ModuleChat from "@/components/shared/ModuleChat";

// ── Constants ──────────────────────────────────────────────────────────────────

const INCIDENT_TYPES = [
  "Fall", "Near-Miss", "PPE Violation", "Electrical", "Fire",
  "Equipment", "Chemical", "Struck-by", "Caught-in", "Other",
];
const SEVERITIES = ["low", "medium", "high"] as const;
const STATUSES   = ["open", "investigating", "closed"] as const;
const MONTH_LABELS: Record<number, string> = {
  1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
  7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec",
};

const DEFAULT_ML_INPUT = {
  incident_type: "Fall", zone: "Zone A", workers_involved: 3,
  ppe_worn: 0, training_completed: 1, near_miss: 1,
  month: new Date().getMonth() + 1,
};

const BLANK_INCIDENT = {
  type: "", description: "", severity: "low" as const,
  status: "open" as const, zone: "", location: "", injured: "None",
  date: new Date().toISOString().slice(0, 10),
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Incident {
  id: string;
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "open" | "investigating" | "closed";
  zone: string;
  location: string;
  injured: string;
  date: string;
  created_at: string;
  project_id?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEV_STYLE: Record<string, string> = {
  high:   "bg-red-500/10 text-red-400 border border-red-500/20",
  medium: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  low:    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
};
const STATUS_STYLE: Record<string, string> = {
  open:         "bg-red-500/10 text-red-400 border border-red-500/20",
  investigating:"bg-orange-500/10 text-orange-400 border border-orange-500/20",
  closed:       "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
};
const STATUS_NEXT: Record<string, "open"|"investigating"|"closed"> = {
  open: "investigating", investigating: "closed", closed: "open",
};

// Normalise raw DB values to our standard set so legacy rows always render.
const normSeverity = (v: string): string => {
  const l = (v || "").toLowerCase().trim();
  if (["severe","critical","major","fatal"].includes(l)) return "high";
  if (["moderate","notable","significant"].includes(l))  return "medium";
  if (["low","medium","high"].includes(l))               return l;
  return "low";
};
const normStatus = (v: string): "open"|"investigating"|"closed" => {
  const l = (v || "").toLowerCase().trim();
  if (["resolved","completed","done","fixed","archived"].includes(l)) return "closed";
  if (["in progress","in-progress","pending","review","under review"].includes(l)) return "investigating";
  if (l === "closed")        return "closed";
  if (l === "investigating") return "investigating";
  return "open";
};

const inputCls = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";
const selectCls = inputCls + " cursor-pointer";

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SafetyPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL;

  // data
  const [safetyStats, setSafetyStats] = useState<any>(null);
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [mlSafety, setMlSafety]       = useState<any>(null);

  // loading flags
  const [statsLoading, setStatsLoading] = useState(true);
  const [mlLoading, setMlLoading]       = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [savingId, setSavingId]           = useState<string | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [reportingId, setReportingId]     = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);

  // UI state
  const [addOpen, setAddOpen]           = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);
  const [search, setSearch]             = useState("");
  const [filterSev, setFilterSev]       = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [aiReport, setAiReport]         = useState<{id:string; text:string} | null>(null);
  const [analysis, setAnalysis]         = useState("");
  const [mlFormOpen, setMlFormOpen]     = useState(false);
  const [mlInput, setMlInput]           = useState(DEFAULT_ML_INPUT);

  // forms
  const [newForm, setNewForm]   = useState({ ...BLANK_INCIDENT });
  const [editForm, setEditForm] = useState<Partial<Incident>>({});

  // ── Fetch ────────────────────────────────────────────────────────────────────

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async (input = mlInput) => {
    setStatsLoading(true);
    try {
      const [statsRes, incRes] = await Promise.allSettled([
        axios.get(`${API}/api/v1/safety/stats`),
        axios.get(`${API}/api/v1/safety/incidents`),
      ]);
      if (statsRes.status === "fulfilled") setSafetyStats(statsRes.value.data);
      if (incRes.status   === "fulfilled") setIncidents(incRes.value.data.incidents ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
    setMlLoading(true);
    try {
      const mlRes = await axios.post(`${API}/api/v1/ml/safety-risk`, input);
      setMlSafety(mlRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setMlLoading(false);
    }
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const addIncident = async () => {
    if (!newForm.type.trim()) { toast.error("Incident type is required"); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/v1/safety/incidents`, newForm);
      toast.success("Incident logged");
      setNewForm({ ...BLANK_INCIDENT });
      setAddOpen(false);
      triggerRefresh("safety");
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to log incident");
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      await axios.patch(`${API}/api/v1/safety/incidents/${id}`, editForm);
      toast.success("Incident updated");
      setEditId(null);
      setEditForm({});
      fetchAll();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to update");
    } finally {
      setSavingId(null);
    }
  };

  const cycleStatus = async (inc: Incident) => {
    const next = STATUS_NEXT[inc.status];
    try {
      await axios.patch(`${API}/api/v1/safety/incidents/${inc.id}`, { status: next });
      setIncidents(prev => prev.map(i => i.id === inc.id ? { ...i, status: next } : i));
    } catch {
      toast.error("Failed to update status");
    }
  };

  const deleteIncident = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${API}/api/v1/safety/incidents/${id}`);
      toast.success("Incident deleted");
      setIncidents(prev => prev.filter(i => i.id !== id));
      triggerRefresh("safety");
      fetchAll();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const generateAiReport = async (inc: Incident) => {
    setReportingId(inc.id);
    try {
      const res = await axios.post(`${API}/api/v1/safety/incident-report`, {
        type: inc.type, location: inc.location || inc.zone || "Site",
        date: inc.date, description: inc.description, injured: inc.injured,
      });
      setAiReport({ id: inc.id, text: res.data.report });
      toast.success("OSHA report generated");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setReportingId(null);
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/api/v1/safety/analyze-report`, fd,
        { headers: { "Content-Type": "multipart/form-data" } });
      setAnalysis(res.data.analysis);
      toast.success("Audit analyzed!");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to analyze file");
    } finally {
      setUploadLoading(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────

  const filtered = incidents.filter(inc => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      inc.type.toLowerCase().includes(q) ||
      inc.zone.toLowerCase().includes(q) ||
      inc.location.toLowerCase().includes(q) ||
      inc.description.toLowerCase().includes(q);
    const matchSev    = filterSev    === "all" || inc.severity === filterSev;
    const matchStatus = filterStatus === "all" || inc.status   === filterStatus;
    return matchQ && matchSev && matchStatus;
  });

  const incidentChartData = (safetyStats?.monthly_incidents ?? []).map((item: any) => ({
    month: `${MONTH_LABELS[item.month] ?? item.month}'${String(item.year).slice(2)}`,
    incidents: item.incidents,
    nearMiss:  item.near_miss,
  }));

  const radarData = safetyStats?.category_compliance
    ? Object.entries(safetyStats.category_compliance).map(([category, score]) => ({
        category, score: score as number,
      }))
    : ["PPE","Fall","Electrical","Fire","Equipment","Chemical"].map(c => ({ category: c, score: 0 }));

  const zoneRisks = safetyStats?.zone_risk_scores
    ? Object.entries(safetyStats.zone_risk_scores).map(([zone, risk]: any) => ({
        zone, risk: Math.round(risk),
      }))
    : [];

  const s = safetyStats;

  const kpis = [
    {
      label: "Safety Score", icon: Shield,
      value: s ? `${s.safety_score}/100` : "—",
      sub:   s ? `${s.high_risk_count} high-risk` : "",
      status: (s?.safety_score ?? 0) >= 80 ? "good" : (s?.safety_score ?? 0) >= 60 ? "warn" : "bad",
    },
    {
      label: "Total Incidents", icon: AlertTriangle,
      value: s ? String(s.total_incidents) : "—",
      sub:   s ? `${s.near_miss_count} near-miss` : "",
      status: (s?.total_incidents ?? 0) === 0 ? "good" : (s?.total_incidents ?? 0) < 5 ? "warn" : "bad",
    },
    {
      label: "Days Without Incident", icon: Clock,
      value: s ? String(s.days_without_incident) : "—",
      sub:   "since last event",
      status: (s?.days_without_incident ?? 0) >= 30 ? "good" : (s?.days_without_incident ?? 0) >= 7 ? "warn" : "bad",
    },
    {
      label: "Open Violations", icon: XCircle,
      value: s ? String(s.open_violations) : "—",
      sub:   s ? `${s.permit_violations} permit issues` : "",
      status: (s?.open_violations ?? 0) === 0 ? "good" : "bad",
    },
    {
      label: "Near-Miss Rate", icon: FileWarning,
      value: s ? `${s.near_miss_rate}%` : "—",
      sub:   "of total incidents",
      status: (s?.near_miss_rate ?? 0) < 15 ? "good" : "warn",
    },
    {
      label: "PPE Compliance", icon: CheckCircle,
      value: s ? `${s.ppe_compliance_rate}%` : "—",
      sub:   s ? `${s.equipment_at_risk} equip. at risk` : "",
      status: (s?.ppe_compliance_rate ?? 0) >= 90 ? "good" : "warn",
    },
  ];

  const kpiColor = (status: string) => ({
    good: "border-emerald-500/20 bg-emerald-500/5",
    warn: "border-orange-500/20 bg-orange-500/5",
    bad:  "border-red-500/20 bg-red-500/5",
  }[status] ?? "border-border bg-card");

  const kpiIcon = (status: string) => ({
    good: "text-emerald-400", warn: "text-orange-400", bad: "text-red-400",
  }[status] ?? "text-muted-foreground");

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Safety & Risk</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered safety monitoring & incident management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setAddOpen(true); setEditId(null); }}>
            <Plus className="w-4 h-4 mr-2 text-emerald-400" />
            Log Incident
          </Button>
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg"
            onChange={handleFileUpload} />
          <Button className="gradient-blue text-white border-0" disabled={uploadLoading}
            onClick={() => fileInputRef.current?.click()}>
            {uploadLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Upload className="w-4 h-4 mr-2" />}
            Upload Audit
          </Button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }} whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpiColor(kpi.status)}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpiIcon(kpi.status)}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ML Prediction */}
      {mlLoading ? (
        <div className="rounded-2xl border border-border p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">Loading AI safety prediction...</p>
        </div>
      ) : mlSafety && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlSafety.risk_level === "High"   ? "border-red-500/30 bg-red-500/5" :
            mlSafety.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5" :
                                               "border-emerald-500/30 bg-emerald-500/5"
          }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  AI Safety Risk Prediction
                  <button onClick={() => setMlFormOpen(v => !v)}
                    className="ml-2 text-blue-400 hover:underline text-xs">
                    (Configure inputs)
                  </button>
                </p>
                <p className="text-xl font-bold text-foreground">
                  {mlSafety.probability}% severe incident probability
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlSafety.severe_risk ? "Immediate action required" : "Risk under control"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlSafety.risk_level === "High"   ? "bg-red-500/10 text-red-400" :
              mlSafety.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400" :
                                                 "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlSafety.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* ML config form */}
      <AnimatePresence>
        {mlFormOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-blue-500/30 rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-4">Configure AI Risk Prediction</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {[
                { label: "Incident Type",            key: "incident_type",      type: "text"   },
                { label: "Zone",                     key: "zone",               type: "text"   },
                { label: "Workers Involved",         key: "workers_involved",   type: "number" },
                { label: "PPE Worn (0=No, 1=Yes)",   key: "ppe_worn",           type: "number" },
                { label: "Training Completed (0/1)", key: "training_completed", type: "number" },
                { label: "Near-Miss Count",          key: "near_miss",          type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                  <input type={f.type} value={(mlInput as any)[f.key]}
                    onChange={e => setMlInput(prev => ({
                      ...prev,
                      [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                    }))}
                    className={inputCls} />
                </div>
              ))}
            </div>
            <Button onClick={() => { fetchAll(mlInput); setMlFormOpen(false); }}
              className="gradient-blue text-white border-0">
              <Brain className="w-4 h-4 mr-2" />Run Prediction
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Incident Form */}
      <AnimatePresence>
        {addOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Log New Incident</h3>
              <button onClick={() => setAddOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {/* Type */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Incident Type *</label>
                <select value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}
                  className={selectCls}>
                  <option value="">Select type…</option>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Severity */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
                <select value={newForm.severity} onChange={e => setNewForm(p => ({ ...p, severity: e.target.value as any }))}
                  className={selectCls}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              {/* Status */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select value={newForm.status} onChange={e => setNewForm(p => ({ ...p, status: e.target.value as any }))}
                  className={selectCls}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              {/* Zone */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Zone / Area</label>
                <input type="text" placeholder="e.g. Zone A, Level 3"
                  value={newForm.zone} onChange={e => setNewForm(p => ({ ...p, zone: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* Location */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Location Detail</label>
                <input type="text" placeholder="e.g. North stairwell"
                  value={newForm.location} onChange={e => setNewForm(p => ({ ...p, location: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* Date */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <input type="date" value={newForm.date}
                  onChange={e => setNewForm(p => ({ ...p, date: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* Injured */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Injured (if any)</label>
                <input type="text" placeholder="None"
                  value={newForm.injured} onChange={e => setNewForm(p => ({ ...p, injured: e.target.value }))}
                  className={inputCls} />
              </div>
              {/* Description */}
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <textarea placeholder="What happened…" rows={2}
                  value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                  className={inputCls + " resize-none"} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addIncident} disabled={submitting} className="gradient-blue text-white border-0">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Save Incident
              </Button>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incidents Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3 flex-wrap">
          <h3 className="font-semibold text-foreground shrink-0">
            Incidents
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {filtered.length} of {incidents.length}
            </span>
          </h3>
          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input placeholder="Search incidents…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {/* Severity filter */}
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none cursor-pointer">
              <option value="all">All Severity</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            {/* Status filter */}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none cursor-pointer">
              <option value="all">All Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {statsLoading ? (
          <div className="flex items-center gap-3 px-6 py-10">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <p className="text-sm text-muted-foreground">Loading incidents…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              {incidents.length === 0 ? "No incidents logged yet — click Log Incident to add one." : "No incidents match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Date","Type","Zone","Severity","Status","Description","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, i) => (
                  <Fragment key={inc.id}>
                    <tr
                      className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
                      {/* Date */}
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {inc.date || inc.created_at?.slice(0,10) || "—"}
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {editId === inc.id ? (
                          <select value={editForm.type ?? inc.type}
                            onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}
                            className="px-2 py-1 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none">
                            {/* Keep existing value if it's not in our standard list */}
                            {!INCIDENT_TYPES.includes(inc.type) && inc.type && (
                              <option value={inc.type}>{inc.type}</option>
                            )}
                            {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (inc.type || <span className="text-muted-foreground italic text-xs">Unknown</span>)}
                      </td>
                      {/* Zone */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {editId === inc.id ? (
                          <input value={editForm.zone ?? inc.zone}
                            onChange={e => setEditForm(p => ({ ...p, zone: e.target.value }))}
                            className="px-2 py-1 bg-secondary border border-border rounded-lg text-sm text-foreground w-24 focus:outline-none" />
                        ) : (inc.zone || inc.location || "—")}
                      </td>
                      {/* Severity — normalise legacy values for display */}
                      <td className="px-4 py-3">
                        {editId === inc.id ? (
                          <select value={editForm.severity ?? normSeverity(inc.severity)}
                            onChange={e => setEditForm(p => ({ ...p, severity: e.target.value as any }))}
                            className="px-2 py-1 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none">
                            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[normSeverity(inc.severity)]}`}>
                            {normSeverity(inc.severity)}
                          </span>
                        )}
                      </td>
                      {/* Status — click to cycle; normalise legacy values */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => cycleStatus({ ...inc, status: normStatus(inc.status) })}
                          title="Click to change status"
                          className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer transition-opacity hover:opacity-70 ${STATUS_STYLE[normStatus(inc.status)]}`}>
                          {normStatus(inc.status)}
                        </button>
                      </td>
                      {/* Description */}
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        {editId === inc.id ? (
                          <input value={editForm.description ?? inc.description}
                            onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                            className="px-2 py-1 bg-secondary border border-border rounded-lg text-sm text-foreground w-full focus:outline-none" />
                        ) : (
                          <span className="truncate block max-w-50" title={inc.description}>
                            {inc.description || "—"}
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {editId === inc.id ? (
                            <>
                              <Button size="sm" className="gradient-blue text-white border-0 h-7 px-2 text-xs"
                                onClick={() => saveEdit(inc.id)} disabled={savingId === inc.id}>
                                {savingId === inc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                onClick={() => { setEditId(null); setEditForm({}); }}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <button title="Edit"
                                onClick={() => { setEditId(inc.id); setEditForm({ type: inc.type, severity: inc.severity, zone: inc.zone, location: inc.location, description: inc.description }); }}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button title="Generate OSHA Report"
                                onClick={() => generateAiReport(inc)}
                                disabled={reportingId === inc.id}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-blue-400 transition-colors">
                                {reportingId === inc.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <FileText className="w-3.5 h-3.5" />}
                              </button>
                              <button title="Delete"
                                onClick={() => deleteIncident(inc.id)}
                                disabled={deletingId === inc.id}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors">
                                {deletingId === inc.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* AI Report expansion */}
                    {aiReport?.id === inc.id && (
                      <tr className="bg-blue-500/5">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-blue-400">OSHA Report — {inc.type}</p>
                                <button onClick={() => setAiReport(null)} className="text-muted-foreground hover:text-foreground">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {aiReport.text}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Incident Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Incidents vs Near-Miss
                {safetyStats && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
              </p>
            </div>
          </div>
          {incidentChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No monthly data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={incidentChartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                <Bar dataKey="incidents" fill="#ef4444" radius={[6,6,0,0]} name="Incidents" />
                <Bar dataKey="nearMiss"  fill="#f59e0b" radius={[6,6,0,0]} name="Near-Miss" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400"/><span className="text-xs text-muted-foreground">Incidents</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400"/><span className="text-xs text-muted-foreground">Near-Miss</span></div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-1">Safety Compliance</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Score by incident category
            {safetyStats && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live</span>}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#ffffff08" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {safetyStats?.category_compliance && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(safetyStats.category_compliance as Record<string,number>)
                .sort(([,a],[,b]) => a-b).slice(0,3)
                .map(([cat, score]) => (
                  <span key={cat} className={`text-xs px-2 py-0.5 rounded-full ${
                    score < 80 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                  }`}>{cat}: {score}%</span>
                ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Zone Risk Heatmap */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-foreground">Zone Risk Heatmap</h3>
          {safetyStats && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
              Live — {safetyStats.total_incidents} incidents · {safetyStats.active_workers} active workers
            </span>
          )}
        </div>
        {zoneRisks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No zone data yet — fill in the <strong>Zone</strong> field when logging incidents to see the heatmap.
          </p>
        ) : (
          <div className="space-y-4">
            {zoneRisks.map((z, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-foreground w-28 truncate">{z.zone}</span>
                <div className="flex-1 bg-secondary rounded-full h-2.5">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${z.risk}%` }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    className={`h-2.5 rounded-full ${z.risk > 80 ? "bg-red-500" : z.risk > 60 ? "bg-orange-500" : "bg-emerald-500"}`} />
                </div>
                <span className={`text-sm font-medium w-10 text-right ${z.risk > 80 ? "text-red-400" : z.risk > 60 ? "text-orange-400" : "text-emerald-400"}`}>
                  {z.risk}%
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Inter-module alerts */}
      {safetyStats && (safetyStats.equipment_at_risk > 0 || safetyStats.permit_violations > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safetyStats.equipment_at_risk > 0 && (
            <div className="bg-card border border-red-500/20 bg-red-500/5 rounded-2xl p-4 flex items-center gap-3">
              <Wrench className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{safetyStats.equipment_at_risk} Equipment at Risk</p>
                <p className="text-xs text-muted-foreground">Breakdowns or health &lt;50 — check Equipment module</p>
              </div>
            </div>
          )}
          {safetyStats.permit_violations > 0 && (
            <div className="bg-card border border-orange-500/20 bg-orange-500/5 rounded-2xl p-4 flex items-center gap-3">
              <FileWarning className="w-5 h-5 text-orange-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{safetyStats.permit_violations} Permit Issue{safetyStats.permit_violations !== 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">Expired or violated permits — check Compliance module</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit AI Analysis */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-foreground">AI Safety Audit Analysis</h3>
            </div>
            <button onClick={() => setAnalysis("")} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Safety & Risk"
        placeholder="Ask about safety, incidents, compliance…"
        pageSummaryData={{
          safetyScore:         s?.safety_score,
          totalIncidents:      s?.total_incidents,
          nearMissCount:       s?.near_miss_count,
          nearMissRate:        s?.near_miss_rate,
          openViolations:      s?.open_violations,
          daysWithoutIncident: s?.days_without_incident,
          ppeCompliance:       s?.ppe_compliance_rate,
          highRiskCount:       s?.high_risk_count,
          equipmentAtRisk:     s?.equipment_at_risk,
          permitViolations:    s?.permit_violations,
          activeWorkers:       s?.active_workers,
          categoryCompliance:  s?.category_compliance,
          zoneRisks,
          mlPrediction:        mlSafety,
          recentIncidents:     incidents.slice(0, 5).map(i => ({ type: i.type, severity: i.severity, status: i.status, zone: i.zone })),
        }}
      />
    </div>
  );
}
