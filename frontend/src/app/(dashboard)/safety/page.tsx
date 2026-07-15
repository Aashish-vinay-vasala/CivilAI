"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, AlertTriangle, CheckCircle, Upload, Loader2, Brain,
  Clock, XCircle, Wrench, FileWarning, Plus, Trash2, Pencil,
  Search, X, FileText, ChevronDown, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import ModuleChat from "@/components/shared/ModuleChat";
import CountUp from "@/components/shared/CountUp";
import { MarkdownText } from "@/lib/renderMarkdown";

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

const _NEAR_MISS_TYPES = new Set(["near miss", "near-miss", "near_miss", "nearmiss"]);
const isNearMissIncident = (inc: Incident) => {
  const t = (inc.type || "").toLowerCase().trim();
  const d = (inc.description || "").toLowerCase();
  return _NEAR_MISS_TYPES.has(t) || d.includes("near miss") || d.includes("near-miss");
};

// Builds the AI Safety Risk Prediction payload from the *real* latest incident
// and live stats, instead of a frozen literal — so the prediction actually
// shifts when incidents are logged. The model (trained on synthetic data —
// see chat) only has real ground truth for incident_type/zone/near_miss/month
// from the incident itself; ppe_worn/training_completed have no per-incident
// field in the schema, so they fall back to a threshold on the live aggregate
// rates rather than a fabricated per-incident fact. workers_involved isn't
// tracked per incident either, so it keeps the model's own baseline default.
function deriveMlInput(incidents: Incident[], stats: any) {
  if (incidents.length === 0) return DEFAULT_ML_INPUT;
  const latest = [...incidents].sort((a, b) =>
    (b.date || b.created_at || "").localeCompare(a.date || a.created_at || "")
  )[0];
  const dateStr = latest.date || latest.created_at?.slice(0, 10) || "";
  const month = /^\d{4}-\d{2}/.test(dateStr) ? Number(dateStr.slice(5, 7)) : new Date().getMonth() + 1;
  return {
    incident_type: latest.type || DEFAULT_ML_INPUT.incident_type,
    zone: latest.zone || latest.location || DEFAULT_ML_INPUT.zone,
    workers_involved: DEFAULT_ML_INPUT.workers_involved,
    ppe_worn: (stats?.ppe_compliance_rate ?? 100) >= 70 ? 1 : 0,
    training_completed: (stats?.safety_score ?? 100) >= 70 ? 1 : 0,
    near_miss: isNearMissIncident(latest) ? 1 : 0,
    month,
  };
}

// ── Theme helpers ────────────────────────────────────────────────────────────
// Mirrors the accent-color recipe used across the main dashboard: a soft tint
// background, a slightly stronger tint border, and the full color for text/icons.

const ACCENT: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",  border: "rgba(0,212,255,0.18)",  text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.18)", text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.18)", text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.18)",  text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
};

const kpiAccent = (status: string) => ACCENT[{ good: "green", warn: "amber", bad: "red" }[status] ?? "cyan"];

const RGB: Record<string, string> = {
  "#EF4444": "239,68,68", "#F59E0B": "245,158,11", "#10B981": "16,185,129", "#00D4FF": "0,212,255",
};
const pillStyle = (hex: string) => ({
  background: `rgba(${RGB[hex]},0.1)`,
  border: `1px solid rgba(${RGB[hex]},0.2)`,
  color: hex,
});

const inputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
const selectClass = inputClass + " cursor-pointer";

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const primaryBtnStyle = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
};
const ghostBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors";
const ghostBtnStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" };

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string>    = { high: "#EF4444", medium: "#F59E0B", low: "#10B981" };
const STATUS_COLOR: Record<string, string> = { open: "#EF4444", investigating: "#F59E0B", closed: "#10B981" };
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

const tooltipStyle = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border: "1px solid rgba(0,212,255,0.15)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

// Tiny trend line for the KPI cards — same shape as the one on the main dashboard.
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SafetyPage() {
  const { triggerRefresh, counters } = useDataRefreshStore();
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
  const [extractedIncidents, setExtractedIncidents] = useState<any[]>([]);
  const [extractLoading, setExtractLoading]         = useState(false);
  const [addingExtracted, setAddingExtracted]       = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);
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
  const [zoneRiskOpen, setZoneRiskOpen]     = useState(false);
  const [zoneRiskLoading, setZoneRiskLoading] = useState(false);
  const [zoneRiskResult, setZoneRiskResult] = useState<any>(null);
  const [zoneRiskForm, setZoneRiskForm] = useState({
    name: "", tasks: "", workers: 5, equipment: "", weather: "Clear",
  });

  // forms
  const [newForm, setNewForm]   = useState({ ...BLANK_INCIDENT });
  const [editForm, setEditForm] = useState<Partial<Incident>>({});

  // ── Fetch ────────────────────────────────────────────────────────────────────

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh when incidents/equipment/compliance change elsewhere — the ML
  // prediction (derived from the latest incident) and the inter-module alerts
  // (equipment at risk, permit violations) all depend on them.
  useEffect(() => { fetchAll(); }, [counters.safety, counters.equipment, counters.compliance]); // eslint-disable-line react-hooks/exhaustive-deps

  // `overrideInput` is only passed by the "Configure inputs" form's Run
  // Prediction button — every other caller (mount, refresh, CRUD actions)
  // leaves it undefined so the ML input is re-derived from the incident that
  // was just fetched, keeping the prediction in sync with real data.
  const fetchAll = async (overrideInput?: typeof DEFAULT_ML_INPUT) => {
    setStatsLoading(true);
    let latestStats: any = null;
    let latestIncidents: Incident[] = [];
    try {
      const [statsRes, incRes] = await Promise.allSettled([
        axios.get(`${API}/api/v1/safety/stats`),
        axios.get(`${API}/api/v1/safety/incidents`),
      ]);
      if (statsRes.status === "fulfilled") { latestStats = statsRes.value.data; setSafetyStats(latestStats); }
      if (incRes.status   === "fulfilled") { latestIncidents = incRes.value.data.incidents ?? []; setIncidents(latestIncidents); }
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }

    const input = overrideInput ?? deriveMlInput(latestIncidents, latestStats);
    setMlInput(input);
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

  const runZoneRiskAssessment = async () => {
    if (!zoneRiskForm.name.trim()) { toast.error("Zone name is required"); return; }
    setZoneRiskLoading(true);
    setZoneRiskResult(null);
    try {
      const res = await axios.post(`${API}/api/v1/safety/zone-risk`, {
        name: zoneRiskForm.name,
        tasks: zoneRiskForm.tasks.split(",").map(t => t.trim()).filter(Boolean),
        workers: Number(zoneRiskForm.workers) || 0,
        equipment: zoneRiskForm.equipment.split(",").map(t => t.trim()).filter(Boolean),
        weather: zoneRiskForm.weather,
      });
      setZoneRiskResult(res.data.assessment?.assessment ?? res.data.assessment);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to assess zone risk");
    } finally {
      setZoneRiskLoading(false);
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

  const handleExtractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExtractLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/api/v1/safety/extract-incidents`, fd);
      const found = res.data.extracted_incidents ?? [];
      setExtractedIncidents(found);
      toast.success(found.length > 0 ? `Found ${found.length} incident(s) — review below.` : "No incidents found in document.");
    } catch { toast.error("Failed to extract incidents from file"); }
    finally { setExtractLoading(false); }
  };

  const addExtractedIncident = async (inc: any, idx: number) => {
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${API}/api/v1/safety/incidents`, inc);
      setExtractedIncidents(prev => prev.filter((_, i) => i !== idx));
      toast.success(`Incident added`);
      fetchAll();
    } catch { toast.error("Failed to add incident"); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedIncidents = async () => {
    setAddingExtracted("all");
    let added = 0;
    for (const inc of extractedIncidents) {
      try { await axios.post(`${API}/api/v1/safety/incidents`, inc); added++; } catch { /* skip */ }
    }
    setExtractedIncidents([]);
    toast.success(`Added ${added} incident(s)`);
    fetchAll();
    setAddingExtracted(null);
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

  // Real month-over-month series (from safetyStats.monthly_incidents) feed the
  // sparkline on each KPI card — same pattern as the main dashboard's KPIs.
  const monthlySeries: any[] = safetyStats?.monthly_incidents ?? [];
  const monthlyTrend = (key: string) => monthlySeries.map((m) => Number(m[key]) || 0);
  const nearMissRateTrend = monthlySeries.map((m) =>
    m.incidents > 0 ? Math.round((m.near_miss / m.incidents) * 1000) / 10 : 0
  );

  const kpis = [
    {
      id: "score", label: "Safety Score", icon: Shield,
      numValue: s?.safety_score ?? 0, suffix: "/100", decimals: 0,
      sub:   s ? `${s.high_risk_count} high-risk` : "",
      status: (s?.safety_score ?? 0) >= 80 ? "good" : (s?.safety_score ?? 0) >= 60 ? "warn" : "bad",
      trendData: monthlyTrend("safety_score"),
    },
    {
      id: "incidents", label: "Total Incidents", icon: AlertTriangle,
      numValue: s?.total_incidents ?? 0, suffix: "", decimals: 0,
      sub:   s ? `${s.near_miss_count} near-miss` : "",
      status: (s?.total_incidents ?? 0) === 0 ? "good" : (s?.total_incidents ?? 0) < 5 ? "warn" : "bad",
      trendData: monthlyTrend("incidents"),
    },
    {
      id: "days", label: "Days Without Incident", icon: Clock,
      numValue: s?.days_without_incident ?? 0, suffix: "", decimals: 0,
      sub:   "since last event",
      status: (s?.days_without_incident ?? 0) >= 30 ? "good" : (s?.days_without_incident ?? 0) >= 7 ? "warn" : "bad",
      trendData: [] as number[], // running day-count has no month-over-month series
    },
    {
      id: "violations", label: "Open Violations", icon: XCircle,
      numValue: s?.open_violations ?? 0, suffix: "", decimals: 0,
      sub:   s ? `${s.permit_violations} permit issues` : "",
      status: (s?.open_violations ?? 0) === 0 ? "good" : "bad",
      trendData: monthlyTrend("open_violations"),
    },
    {
      id: "nearmiss", label: "Near-Miss Rate", icon: FileWarning,
      numValue: s?.near_miss_rate ?? 0, suffix: "%", decimals: 1,
      sub:   "of total incidents",
      status: (s?.near_miss_rate ?? 0) < 15 ? "good" : "warn",
      trendData: nearMissRateTrend,
    },
    {
      id: "ppe", label: "PPE Compliance", icon: CheckCircle,
      numValue: s?.ppe_compliance_rate ?? 0, suffix: "%", decimals: 1,
      sub:   s ? `${s.equipment_at_risk} equip. at risk` : "",
      status: (s?.ppe_compliance_rate ?? 0) >= 90 ? "good" : "warn",
      trendData: monthlyTrend("ppe_compliance"),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Safety & Risk</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered safety monitoring & incident management
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setAddOpen(true); setEditId(null); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <Plus className="w-4 h-4 text-emerald-400" />
            Log Incident
          </button>
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg"
            onChange={handleFileUpload} />
          <button
            disabled={uploadLoading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105 disabled:opacity-50"
            style={ghostBtnStyle}>
            {uploadLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Analyze Audit
          </button>
          <input ref={extractFileRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
            onChange={handleExtractUpload} />
          <button
            disabled={extractLoading}
            onClick={() => extractFileRef.current?.click()}
            className={primaryBtn}
            style={{ ...primaryBtnStyle, boxShadow: "0 0 20px rgba(0,212,255,0.12)" }}>
            {extractLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => {
          const a = kpiAccent(kpi.status);
          return (
            <motion.div key={kpi.id}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden h-full flex flex-col"
              style={{ borderColor: a.border }}>
              {/* Subtle inner gradient on hover — matches the dashboard KPI cards */}
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />

              <div className="relative flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                  <kpi.icon className="w-4.5 h-4.5" style={{ color: a.text }} />
                </div>
                {kpi.sub && (
                  <div className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full text-right"
                    style={{ background: a.bg, color: a.text, border: `1px solid ${a.border}` }}>
                    {kpi.status === "bad" ? <TrendingDown className="w-3 h-3 shrink-0" /> : <TrendingUp className="w-3 h-3 shrink-0" />}
                    <span className="truncate max-w-20">{kpi.sub}</span>
                  </div>
                )}
              </div>

              {s ? (
                <CountUp
                  to={kpi.numValue} suffix={kpi.suffix} decimals={kpi.decimals}
                  className="text-[26px] font-bold block"
                  style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` } as React.CSSProperties}
                />
              ) : (
                <span className="text-[26px] font-bold text-white/20 block">—</span>
              )}
              <p className="text-[11px] text-white/40 mt-1">{kpi.label}</p>

              <div className="relative -mx-1 mt-2 opacity-70 flex-1 flex items-end min-h-[28px]">
                {kpi.trendData.length >= 2 && <Sparkline data={kpi.trendData} color={a.text} />}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ML Prediction */}
      {mlLoading ? (
        <div className="glass-card p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          <p className="text-sm text-white/40">Loading AI safety prediction...</p>
        </div>
      ) : mlSafety && (() => {
        const riskAccent = mlSafety.risk_level === "High" ? ACCENT.red : mlSafety.risk_level === "Medium" ? ACCENT.amber : ACCENT.green;
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5" style={{ borderColor: riskAccent.border, background: riskAccent.bg }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                  <Brain className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-[11px] text-white/35 mb-0.5">
                    AI Safety Risk Prediction
                    <button onClick={() => setMlFormOpen(v => !v)} className="ml-2 text-cyan-400 hover:underline text-[11px]">
                      (Configure inputs)
                    </button>
                  </p>
                  <p className="text-xl font-bold text-white">
                    {mlSafety.probability}% severe incident probability
                  </p>
                  <p className="text-[13px] text-white/40 mt-0.5">
                    {mlSafety.severe_risk ? "Immediate action required" : "Risk under control"}
                  </p>
                </div>
              </div>
              <span className="text-[12px] px-3 py-1.5 rounded-full font-medium"
                style={{ background: riskAccent.bg, border: `1px solid ${riskAccent.border}`, color: riskAccent.text }}>
                {mlSafety.risk_level} Risk
              </span>
            </div>
            {mlSafety.warnings?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  {mlSafety.warnings.join(" ")}
                </p>
              </div>
            )}
          </motion.div>
        );
      })()}

      {/* ML config form */}
      <AnimatePresence>
        {mlFormOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: "rgba(0,212,255,0.22)" }}>
            <h3 className="font-semibold text-white text-[15px] mb-4">Configure AI Risk Prediction</h3>
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
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">{f.label}</label>
                  <input type={f.type} value={(mlInput as any)[f.key]}
                    onChange={e => setMlInput(prev => ({
                      ...prev,
                      [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                    }))}
                    className={inputClass} style={inputStyle} />
                </div>
              ))}
            </div>
            <button onClick={() => { fetchAll(mlInput); setMlFormOpen(false); }}
              className={primaryBtn} style={primaryBtnStyle}>
              <Brain className="w-4 h-4" />Run Prediction
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Incident Form */}
      <AnimatePresence>
        {addOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6" style={{ borderColor: "rgba(16,185,129,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-[15px]">Log New Incident</h3>
              <button onClick={() => setAddOpen(false)} className="text-white/25 hover:text-white/60 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {/* Type */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Incident Type *</label>
                <select value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}
                  className={selectClass} style={inputStyle}>
                  <option value="">Select type…</option>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Severity */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Severity</label>
                <select value={newForm.severity} onChange={e => setNewForm(p => ({ ...p, severity: e.target.value as any }))}
                  className={selectClass} style={inputStyle}>
                  {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv.charAt(0).toUpperCase()+sv.slice(1)}</option>)}
                </select>
              </div>
              {/* Status */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Status</label>
                <select value={newForm.status} onChange={e => setNewForm(p => ({ ...p, status: e.target.value as any }))}
                  className={selectClass} style={inputStyle}>
                  {STATUSES.map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>)}
                </select>
              </div>
              {/* Zone */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Zone / Area</label>
                <input type="text" placeholder="e.g. Zone A, Level 3"
                  value={newForm.zone} onChange={e => setNewForm(p => ({ ...p, zone: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </div>
              {/* Location */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Location Detail</label>
                <input type="text" placeholder="e.g. North stairwell"
                  value={newForm.location} onChange={e => setNewForm(p => ({ ...p, location: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </div>
              {/* Date */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Date</label>
                <input type="date" value={newForm.date}
                  onChange={e => setNewForm(p => ({ ...p, date: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </div>
              {/* Injured */}
              <div>
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Injured (if any)</label>
                <input type="text" placeholder="None"
                  value={newForm.injured} onChange={e => setNewForm(p => ({ ...p, injured: e.target.value }))}
                  className={inputClass} style={inputStyle} />
              </div>
              {/* Description */}
              <div className="col-span-2">
                <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Description</label>
                <textarea placeholder="What happened…" rows={2}
                  value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
                  className={inputClass + " resize-none"} style={inputStyle} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addIncident} disabled={submitting} className={primaryBtn} style={primaryBtnStyle}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save Incident
              </button>
              <button onClick={() => setAddOpen(false)} className={ghostBtn} style={ghostBtnStyle}>Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted Incidents Review Panel */}
      <AnimatePresence>
        {extractedIncidents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-5" style={{ borderColor: "rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.03)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white text-[15px]">Extracted Incidents</h3>
                <p className="text-[11px] text-white/35 mt-0.5">{extractedIncidents.length} incident(s) found — select which to add</p>
              </div>
              <button
                disabled={addingExtracted === "all"} onClick={addAllExtractedIncidents}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                style={primaryBtnStyle}>
                {addingExtracted === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add All
              </button>
            </div>
            <div className="space-y-2">
              {extractedIncidents.map((inc: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: SEV_COLOR[inc.severity] ?? SEV_COLOR.low }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{inc.type}</p>
                    <p className="text-[11px] text-white/35">
                      {[inc.severity, inc.status, inc.zone || inc.location, inc.date].filter(Boolean).join(" · ")}
                    </p>
                    {inc.description && <p className="text-[11px] text-white/30 truncate mt-0.5">{inc.description}</p>}
                  </div>
                  <button disabled={addingExtracted === String(idx)}
                    onClick={() => addExtractedIncident(inc, idx)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                    {addingExtracted === String(idx) ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <Plus className="w-3.5 h-3.5 text-cyan-400" />}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Incidents Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between px-6 py-4 gap-3 flex-wrap"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 className="font-semibold text-white text-[15px] shrink-0">
            Incidents
            <span className="ml-2 text-[11px] text-white/35 font-normal">
              {filtered.length} of {incidents.length}
            </span>
          </h3>
          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
              <input placeholder="Search incidents…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30 outline-none transition-all border focus:border-cyan-500/50"
                style={inputStyle} />
            </div>
            {/* Severity filter */}
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm text-white/70 outline-none cursor-pointer border"
              style={inputStyle}>
              <option value="all">All Severity</option>
              {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv.charAt(0).toUpperCase()+sv.slice(1)}</option>)}
            </select>
            {/* Status filter */}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm text-white/70 outline-none cursor-pointer border"
              style={inputStyle}>
              <option value="all">All Status</option>
              {STATUSES.map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase()+st.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {statsLoading ? (
          <div className="flex items-center gap-3 px-6 py-10">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <p className="text-sm text-white/40">Loading incidents…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-[13px] text-white/30">
              {incidents.length === 0 ? "No incidents logged yet — click Log Incident to add one." : "No incidents match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Date","Type","Zone","Severity","Status","Description","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-white/35 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inc, i) => (
                  <Fragment key={inc.id}>
                    <tr
                      className="transition-colors"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.03)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)"; }}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-white/40 whitespace-nowrap">
                        {inc.date || inc.created_at?.slice(0,10) || "—"}
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                        {editId === inc.id ? (
                          <select value={editForm.type ?? inc.type}
                            onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}
                            className="px-2 py-1 rounded-lg text-sm text-white outline-none border"
                            style={inputStyle}>
                            {/* Keep existing value if it's not in our standard list */}
                            {!INCIDENT_TYPES.includes(inc.type) && inc.type && (
                              <option value={inc.type}>{inc.type}</option>
                            )}
                            {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (inc.type || <span className="text-white/30 italic text-xs">Unknown</span>)}
                      </td>
                      {/* Zone */}
                      <td className="px-4 py-3 text-white/40">
                        {editId === inc.id ? (
                          <input value={editForm.zone ?? inc.zone}
                            onChange={e => setEditForm(p => ({ ...p, zone: e.target.value }))}
                            className="px-2 py-1 rounded-lg text-sm text-white w-24 outline-none border"
                            style={inputStyle} />
                        ) : (inc.zone || inc.location || "—")}
                      </td>
                      {/* Severity — normalise legacy values for display */}
                      <td className="px-4 py-3">
                        {editId === inc.id ? (
                          <select value={editForm.severity ?? normSeverity(inc.severity)}
                            onChange={e => setEditForm(p => ({ ...p, severity: e.target.value as any }))}
                            className="px-2 py-1 rounded-lg text-sm text-white outline-none border"
                            style={inputStyle}>
                            {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                          </select>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={pillStyle(SEV_COLOR[normSeverity(inc.severity)])}>
                            {normSeverity(inc.severity)}
                          </span>
                        )}
                      </td>
                      {/* Status — click to cycle; normalise legacy values */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => cycleStatus({ ...inc, status: normStatus(inc.status) })}
                          title="Click to change status"
                          className="text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer transition-opacity hover:opacity-70"
                          style={pillStyle(STATUS_COLOR[normStatus(inc.status)])}>
                          {normStatus(inc.status)}
                        </button>
                      </td>
                      {/* Description */}
                      <td className="px-4 py-3 text-white/40 max-w-xs">
                        {editId === inc.id ? (
                          <input value={editForm.description ?? inc.description}
                            onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                            className="px-2 py-1 rounded-lg text-sm text-white w-full outline-none border"
                            style={inputStyle} />
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
                              <button
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-white transition-all hover:scale-105"
                                style={primaryBtnStyle}
                                onClick={() => saveEdit(inc.id)} disabled={savingId === inc.id}>
                                {savingId === inc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                              </button>
                              <button className="px-2.5 py-1 rounded-lg text-[11px] text-white/50 hover:text-white/80 transition-colors"
                                style={ghostBtnStyle}
                                onClick={() => { setEditId(null); setEditForm({}); }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button title="Edit"
                                onClick={() => { setEditId(inc.id); setEditForm({ type: inc.type, severity: inc.severity, zone: inc.zone, location: inc.location, description: inc.description }); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
                                <Pencil className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                              <button title="Generate OSHA Report"
                                onClick={() => generateAiReport(inc)}
                                disabled={reportingId === inc.id}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}>
                                {reportingId === inc.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                  : <FileText className="w-3.5 h-3.5 text-cyan-400" />}
                              </button>
                              <button title="Delete"
                                onClick={() => deleteIncident(inc.id)}
                                disabled={deletingId === inc.id}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                {deletingId === inc.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                                  : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* AI Report expansion */}
                    {aiReport?.id === inc.id && (
                      <tr style={{ background: "rgba(0,212,255,0.03)" }}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] font-medium text-cyan-400">OSHA Report — {inc.type}</p>
                                <button onClick={() => setAiReport(null)} className="text-white/25 hover:text-white/60 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <MarkdownText text={aiReport.text} className="text-[12px] text-white/50 leading-relaxed" />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
          className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white text-[14px]">Incident Trend</h3>
              <p className="text-[11px] text-white/35 mt-0.5">
                Incidents vs Near-Miss
                {safetyStats && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full" style={pillStyle("#10B981")}>Live</span>}
              </p>
            </div>
          </div>
          {incidentChartData.length === 0 ? (
            <p className="text-[13px] text-white/30 text-center py-8">No monthly data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={incidentChartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                <Bar dataKey="incidents" fill="#EF4444" radius={[6,6,0,0]} name="Incidents" />
                <Bar dataKey="nearMiss"  fill="#F59E0B" radius={[6,6,0,0]} name="Near-Miss" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-5 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: "#EF4444", boxShadow: "0 0 6px #EF4444" }}/><span className="text-[11px] text-white/35">Incidents</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: "#F59E0B", boxShadow: "0 0 6px #F59E0B" }}/><span className="text-[11px] text-white/35">Near-Miss</span></div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="glass-card p-6">
          <h3 className="font-semibold text-white text-[14px] mb-1">Safety Compliance</h3>
          <p className="text-[11px] text-white/35 mb-4">
            Score by incident category
            {safetyStats && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full" style={pillStyle("#10B981")}>Live</span>}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
              <Radar dataKey="score" stroke="#00D4FF" fill="#00D4FF" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {safetyStats?.category_compliance && (
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(safetyStats.category_compliance as Record<string,number>)
                .sort(([,a],[,b]) => a-b).slice(0,3)
                .map(([cat, score]) => (
                  <span key={cat} className="text-[11px] px-2 py-0.5 rounded-full"
                    style={pillStyle(score < 80 ? "#EF4444" : "#10B981")}>{cat}: {score}%</span>
                ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Zone Risk Heatmap */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white text-[14px]">Zone Risk Heatmap</h3>
          {safetyStats && (
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={pillStyle("#10B981")}>
              Live — {safetyStats.total_incidents} incidents · {safetyStats.active_workers} active workers
            </span>
          )}
        </div>
        {zoneRisks.length === 0 ? (
          <p className="text-[13px] text-white/30">
            No zone data yet — fill in the <strong className="text-white/50">Zone</strong> field when logging incidents to see the heatmap.
          </p>
        ) : (
          <div className="space-y-4">
            {zoneRisks.map((z, i) => {
              const color = z.risk > 80 ? "#EF4444" : z.risk > 60 ? "#F59E0B" : "#10B981";
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-white/70 w-28 truncate">{z.zone}</span>
                  <div className="flex-1 rounded-full h-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${z.risk}%` }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                      className="h-2.5 rounded-full"
                      style={{ background: color, boxShadow: `0 0 8px ${color}60` }} />
                  </div>
                  <span className="text-sm font-medium w-10 text-right" style={{ color }}>
                    {z.risk}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* AI Zone Risk Assessment */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
        className="glass-card p-6">
        <button onClick={() => setZoneRiskOpen(v => !v)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            <h3 className="font-semibold text-white text-[14px]">AI Zone Risk Assessment</h3>
          </div>
          <ChevronDown className={`w-4 h-4 text-white/35 transition-transform ${zoneRiskOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {zoneRiskOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 mb-4">
                <div>
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Zone Name *</label>
                  <input type="text" placeholder="e.g. Zone A — 3rd Floor" value={zoneRiskForm.name}
                    onChange={e => setZoneRiskForm(p => ({ ...p, name: e.target.value }))}
                    className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Workers Present</label>
                  <input type="number" min={0} value={zoneRiskForm.workers}
                    onChange={e => setZoneRiskForm(p => ({ ...p, workers: Number(e.target.value) }))}
                    className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Weather</label>
                  <select value={zoneRiskForm.weather}
                    onChange={e => setZoneRiskForm(p => ({ ...p, weather: e.target.value }))}
                    className={selectClass} style={inputStyle}>
                    {["Clear","Rain","Wind","Heat","Snow","Storm"].map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Equipment (comma-separated)</label>
                  <input type="text" placeholder="Crane, Scaffolding" value={zoneRiskForm.equipment}
                    onChange={e => setZoneRiskForm(p => ({ ...p, equipment: e.target.value }))}
                    className={inputClass} style={inputStyle} />
                </div>
                <div className="col-span-2 lg:col-span-4">
                  <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Tasks (comma-separated)</label>
                  <input type="text" placeholder="Welding, Working at height, Excavation" value={zoneRiskForm.tasks}
                    onChange={e => setZoneRiskForm(p => ({ ...p, tasks: e.target.value }))}
                    className={inputClass} style={inputStyle} />
                </div>
              </div>
              <button onClick={runZoneRiskAssessment} disabled={zoneRiskLoading} className={primaryBtn} style={primaryBtnStyle}>
                {zoneRiskLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Assess Risk
              </button>

              {zoneRiskResult && (() => {
                const riskAccent = zoneRiskResult.risk_level === "High" ? ACCENT.red : zoneRiskResult.risk_level === "Medium" ? ACCENT.amber : ACCENT.green;
                return (
                  <div className="mt-4 rounded-xl p-4" style={{ background: riskAccent.bg, border: `1px solid ${riskAccent.border}` }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-white">{zoneRiskResult.zone || zoneRiskForm.name}</p>
                      <span className="text-[11px] px-3 py-1 rounded-full font-medium"
                        style={{ background: riskAccent.bg, color: riskAccent.text }}>
                        {zoneRiskResult.risk_level} Risk · {zoneRiskResult.risk_score}/10
                      </span>
                    </div>
                    {zoneRiskResult.hazards?.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[11px] font-medium text-white/35 mb-1">Hazards</p>
                        <ul className="text-sm text-white/50 list-disc list-inside space-y-0.5">
                          {zoneRiskResult.hazards.map((h: string, i: number) => <li key={i}>{h}</li>)}
                        </ul>
                      </div>
                    )}
                    {zoneRiskResult.recommendations?.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-white/35 mb-1">Recommendations</p>
                        <ul className="text-sm text-white/50 list-disc list-inside space-y-0.5">
                          {zoneRiskResult.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Inter-module alerts */}
      {safetyStats && (safetyStats.equipment_at_risk > 0 || safetyStats.permit_violations > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safetyStats.equipment_at_risk > 0 && (
            <div className="glass-card p-4 flex items-center gap-3" style={{ borderColor: ACCENT.red.border, background: ACCENT.red.bg }}>
              <Wrench className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">{safetyStats.equipment_at_risk} Equipment at Risk</p>
                <p className="text-[11px] text-white/35">Breakdowns or health &lt;50 — check Equipment module</p>
              </div>
            </div>
          )}
          {safetyStats.permit_violations > 0 && (
            <div className="glass-card p-4 flex items-center gap-3" style={{ borderColor: ACCENT.amber.border, background: ACCENT.amber.bg }}>
              <FileWarning className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">{safetyStats.permit_violations} Permit Issue{safetyStats.permit_violations !== 1 ? "s" : ""}</p>
                <p className="text-[11px] text-white/35">Expired or violated permits — check Compliance module</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit AI Analysis */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: "rgba(0,212,255,0.22)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white text-[15px]">AI Safety Audit Analysis</h3>
            </div>
            <button onClick={() => setAnalysis("")} className="text-white/25 hover:text-white/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <MarkdownText text={analysis} className="text-[13px] text-white/50 leading-relaxed" />
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
