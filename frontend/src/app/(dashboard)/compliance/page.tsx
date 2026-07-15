"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  Pencil,
  X,
  Save,
  Building2,
  Globe,
  Paperclip,
  Download,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import DownloadModal from "@/components/shared/DownloadModal";
import { MarkdownText } from "@/lib/renderMarkdown";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { ACCENT, AccentKey, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { downloadEntries, ExportColumn, ExportFormat, ExportMode } from "@/lib/export/downloadEntries";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const PERMIT_TYPES = [
  "Building Permit",
  "Environmental Clearance",
  "Fire Safety Certificate",
  "Electrical Work Permit",
  "Occupancy Permit",
  "Labor / Work Permit",
  "Safety Permit",
  "Other",
];

const RISK_LEVELS = ["low", "medium", "high"];

interface Permit {
  id?: string;
  name: string;
  type: string;
  status: string;
  expiry_date?: string;
  risk_level: string;
  project_id?: string;
  issued_by?: string;
  created_at?: string;
  file_url?: string;
  file_name?: string;
  bucket?: string;
}

interface Stats {
  compliance_score: number;
  active_permits: number;
  pending_permits: number;
  open_violations: number;
  total_permits: number;
  radar: { category: string; score: number }[];
  trend: { month: string; score: number }[];
}

const EMPTY_STATS: Stats = {
  compliance_score: 0,
  active_permits: 0,
  pending_permits: 0,
  open_violations: 0,
  total_permits: 0,
  radar: [
    { category: "Building Code", score: 0 },
    { category: "Safety", score: 0 },
    { category: "Environmental", score: 0 },
    { category: "Labor", score: 0 },
    { category: "Fire Safety", score: 0 },
    { category: "Electrical", score: 0 },
  ],
  trend: [],
};

const tooltipStyle = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border: "1px solid rgba(0,212,255,0.15)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const ghostBtn =
  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";

const fieldClass = glassInputClass;
const fieldStyle = glassInputStyle;

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  Approved: { bg: "rgba(16,185,129,0.1)", text: "#10B981" },
  Rejected: { bg: "rgba(239,68,68,0.1)", text: "#EF4444" },
  Pending:  { bg: "rgba(249,115,22,0.1)", text: "#F97316" },
};

const RISK_BADGE: Record<string, { bg: string; text: string }> = {
  high:   { bg: "rgba(239,68,68,0.1)", text: "#EF4444" },
  medium: { bg: "rgba(249,115,22,0.1)", text: "#F97316" },
  low:    { bg: "rgba(16,185,129,0.1)", text: "#10B981" },
};

export default function CompliancePage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI analysis
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");

  // AI permit application generator
  const [permitOpen, setPermitOpen] = useState(false);
  const [permitForm, setPermitForm] = useState({
    project_name: "", project_type: "", location: "",
    owner_name: "", contractor_name: "", permit_type: "",
    estimated_cost: 0, start_date: "", end_date: "",
  });
  const [permitResult, setPermitResult] = useState("");
  const [permitLoading, setPermitLoading] = useState(false);

  // AI building code compliance checker
  const [codeCheckOpen, setCodeCheckOpen] = useState(false);
  const [codeCheckForm, setCodeCheckForm] = useState({
    project_name: "", project_type: "", location: "",
    building_height: 0, occupancy_type: "", construction_type: "",
    special_features: "",
  });
  const [codeCheckResult, setCodeCheckResult] = useState("");
  const [codeCheckLoading, setCodeCheckLoading] = useState(false);

  // AI regulatory change tracker
  const [regCheckOpen, setRegCheckOpen] = useState(false);
  const [regCheckForm, setRegCheckForm] = useState({ region: "", project_type: "" });
  const [regCheckResult, setRegCheckResult] = useState("");
  const [regCheckLoading, setRegCheckLoading] = useState(false);

  // Add permit form
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Permit>({
    name: "", type: "Building Permit", status: "Pending",
    expiry_date: "", risk_level: "medium", issued_by: "",
  });
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Permit>>({});
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Download
  const [showDownload, setShowDownload] = useState(false);

  // Extracted permits from upload
  const [extractedPermits, setExtractedPermits] = useState<Permit[]>([]);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setDataLoading(true);
    try {
      const [permitsRes, statsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/stats`),
      ]);
      setPermits(permitsRes.data.permits || []);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load compliance data");
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true);
    setExtractedPermits([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/analyze`,
        formData
      );
      setAnalysis(response.data.analysis);
      const found: Permit[] = response.data.extracted_permits ?? [];
      setExtractedPermits(found);
      toast.success(`Analyzed! ${found.length > 0 ? `Found ${found.length} permit(s) — review below.` : "No permits extracted."}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const uploadPermitFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/upload`, formData);
    return { file_url: res.data.file_url, file_name: res.data.file_name, bucket: res.data.bucket };
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      let payload: Partial<Permit> = { ...editForm };
      if (editFile) {
        const uploaded = await uploadPermitFile(editFile);
        payload = { ...payload, ...uploaded };
      }
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/${id}`, payload);
      toast.success("Permit updated");
      setEditId(null);
      setEditForm({});
      setEditFile(null);
      fetchAll();
      triggerRefresh("compliance");
    } catch {
      toast.error("Failed to update permit");
    } finally {
      setSavingId(null);
    }
  };

  const addExtractedPermit = async (permit: Permit, idx: number) => {
    setAddingExtracted(String(idx));
    try {
      const payload = { ...permit };
      if (!payload.expiry_date) delete payload.expiry_date;
      if (!payload.issued_by) delete payload.issued_by;
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits`, payload);
      toast.success(`"${permit.name}" added to register`);
      setExtractedPermits(prev => prev.filter((_, i) => i !== idx));
      fetchAll();
      triggerRefresh("compliance");
    } catch {
      toast.error("Failed to add permit");
    } finally {
      setAddingExtracted(null);
    }
  };

  const generatePermit = async () => {
    setPermitLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permit-application`,
        permitForm
      );
      setPermitResult(response.data.application);
      toast.success("Permit application generated!");
    } catch {
      toast.error("Failed to generate permit");
    } finally {
      setPermitLoading(false);
    }
  };

  const runCodeCheck = async () => {
    setCodeCheckLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/code-check`,
        {
          ...codeCheckForm,
          special_features: codeCheckForm.special_features.split(",").map(s => s.trim()).filter(Boolean),
        }
      );
      setCodeCheckResult(response.data.compliance_report);
      toast.success("Code compliance report ready");
    } catch {
      toast.error("Failed to check code compliance");
    } finally {
      setCodeCheckLoading(false);
    }
  };

  const runRegulatoryCheck = async () => {
    if (!regCheckForm.region || !regCheckForm.project_type) {
      toast.error("Region and project type are required");
      return;
    }
    setRegCheckLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/regulatory-check`,
        regCheckForm
      );
      setRegCheckResult(response.data.regulatory_info);
      toast.success("Regulatory report ready");
    } catch {
      toast.error("Failed to fetch regulatory info");
    } finally {
      setRegCheckLoading(false);
    }
  };

  const savePermit = async () => {
    if (!addForm.name || !addForm.type) {
      toast.error("Name and type are required");
      return;
    }
    setAddLoading(true);
    try {
      const payload: Permit = { ...addForm };
      if (!payload.expiry_date) delete payload.expiry_date;
      if (!payload.issued_by) delete payload.issued_by;
      if (addFile) {
        const uploaded = await uploadPermitFile(addFile);
        Object.assign(payload, uploaded);
      }
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits`, payload);
      toast.success("Permit saved!");
      setAddOpen(false);
      setAddForm({ name: "", type: "Building Permit", status: "Pending", expiry_date: "", risk_level: "medium", issued_by: "" });
      setAddFile(null);
      fetchAll();
      triggerRefresh("compliance");
    } catch {
      toast.error("Failed to save permit");
    } finally {
      setAddLoading(false);
    }
  };

  const updateStatus = async (permit: Permit, newStatus: string) => {
    if (!permit.id) return;
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/${permit.id}`,
        { status: newStatus }
      );
      toast.success("Status updated");
      fetchAll();
      triggerRefresh("compliance");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const deletePermit = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/compliance/permits/${id}`);
      toast.success("Permit deleted");
      fetchAll();
      triggerRefresh("compliance");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Approved": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "Pending": return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };

  const kpis: { label: string; value: string; accent: AccentKey; icon: any }[] = [
    { label: "Compliance Score", value: `${stats.compliance_score}%`, accent: "green", icon: CheckCircle },
    { label: "Active Permits", value: stats.active_permits.toString(), accent: "blue", icon: ClipboardCheck },
    { label: "Pending Permits", value: stats.pending_permits.toString(), accent: "orange", icon: Clock },
    { label: "Open Violations", value: stats.open_violations.toString(), accent: "red", icon: AlertTriangle },
  ];

  const permitColumns: ExportColumn[] = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "risk_level", label: "Risk" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "issued_by", label: "Issued By" },
  ];

  const handlePermitsExport = async (format: ExportFormat, mode: ExportMode) => {
    await downloadEntries({
      format,
      mode,
      title: "Permit Register Report",
      subtitle: `${permits.length} permit${permits.length === 1 ? "" : "s"}`,
      kpis: [
        { label: "Compliance Score", value: `${stats.compliance_score}%` },
        { label: "Active Permits", value: `${stats.active_permits}` },
        { label: "Pending Permits", value: `${stats.pending_permits}` },
        { label: "Open Violations", value: `${stats.open_violations}` },
      ],
      columns: permitColumns,
      rows: permits,
      filenameBase: `CivilAI_Permit_Register_${new Date().toISOString().split("T")[0]}`,
    });
    toast.success("Permit register downloaded");
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />

      <DownloadModal open={showDownload} onClose={() => setShowDownload(false)} title="Download Permit Register" onExport={handlePermitsExport} />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Compliance</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered compliance &amp; permit management
            {stats.total_permits > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
                {stats.total_permits} permits in database
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className={ghostBtn} style={glassButtonStyle} onClick={fetchAll} disabled={dataLoading}>
            <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setAddOpen(!addOpen)}>
            <Plus className="w-4 h-4 text-emerald-400" />
            Add Permit
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setShowDownload(true)}>
            <Download className="w-4 h-4 text-cyan-400" />
            Download
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setPermitOpen(!permitOpen)}>
            <FileText className="w-4 h-4 text-blue-400" />
            Generate Application
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setCodeCheckOpen(!codeCheckOpen)}>
            <Building2 className="w-4 h-4 text-cyan-400" />
            Code Check
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setRegCheckOpen(!regCheckOpen)}>
            <Globe className="w-4 h-4 text-amber-400" />
            Regulatory Check
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
          <button className={primaryBtn} style={gradientButtonStyle} disabled={loading} onClick={() => fileInputRef.current?.click()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Report
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dataLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="w-11 h-11 rounded-xl mb-4" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-7 w-2/3 rounded mb-2" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-3 w-1/3 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          ))
        ) : (
          kpis.map((kpi, i) => {
            const a = ACCENT[kpi.accent];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className="glass-card p-5 group relative overflow-hidden"
                style={{ borderColor: a.border }}
              >
                <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
                <div className="relative flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: a.bg, border: `1px solid ${a.border}`, boxShadow: `0 0 16px ${a.shadow}` }}>
                    <kpi.icon className="w-5 h-5" style={{ color: a.text }} />
                  </div>
                </div>
                <p className="relative text-[28px] font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
                <p className="relative text-[13px] text-white/40 mt-1">{kpi.label}</p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Add Permit Form */}
      {addOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.green.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">Add Permit to Register</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              placeholder="Permit name *"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            />
            <select
              value={addForm.type}
              onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            >
              {PERMIT_TYPES.map((t) => <option key={t} style={{ background: "#0A1628" }}>{t}</option>)}
            </select>
            <select
              value={addForm.status}
              onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            >
              {["Pending", "Approved", "Rejected"].map((s) => <option key={s} style={{ background: "#0A1628" }}>{s}</option>)}
            </select>
            <select
              value={addForm.risk_level}
              onChange={(e) => setAddForm({ ...addForm, risk_level: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            >
              {RISK_LEVELS.map((r) => <option key={r} style={{ background: "#0A1628" }}>{r}</option>)}
            </select>
            <input
              type="date"
              placeholder="Expiry date"
              value={addForm.expiry_date || ""}
              onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            />
            <input
              placeholder="Issued by"
              value={addForm.issued_by || ""}
              onChange={(e) => setAddForm({ ...addForm, issued_by: e.target.value })}
              className={fieldClass}
              style={fieldStyle}
            />
          </div>
          <div className="mb-4">
            <label className="cursor-pointer inline-block">
              <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls"
                onChange={(e) => setAddFile(e.target.files?.[0] || null)} />
              <span className={ghostBtn} style={glassButtonStyle}>
                <Paperclip className="w-3.5 h-3.5" />
                {addFile ? addFile.name : "Attach permit file (optional)"}
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={savePermit} disabled={addLoading} className={primaryBtn}
              style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,120,80,0.2))", border: "1px solid rgba(16,185,129,0.3)" }}>
              {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Permit
            </button>
            <button className={ghostBtn} style={glassButtonStyle} onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </motion.div>
      )}

      {/* AI Permit Application Generator */}
      {permitOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.blue.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Permit Application Generator</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { placeholder: "Project name", key: "project_name" },
              { placeholder: "Project type", key: "project_type" },
              { placeholder: "Location", key: "location" },
              { placeholder: "Permit type", key: "permit_type" },
              { placeholder: "Owner name", key: "owner_name" },
              { placeholder: "Contractor name", key: "contractor_name" },
            ].map((f) => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={permitForm[f.key as keyof typeof permitForm] as string}
                onChange={(e) => setPermitForm({ ...permitForm, [f.key]: e.target.value })}
                className={fieldClass}
                style={fieldStyle}
              />
            ))}
          </div>
          <button onClick={generatePermit} disabled={permitLoading} className={primaryBtn} style={gradientButtonStyle}>
            {permitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Application
          </button>
          {permitResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
              <MarkdownText text={permitResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* AI Building Code Compliance Checker */}
      {codeCheckOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.cyan.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Building Code Compliance Check</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input placeholder="Project name" value={codeCheckForm.project_name}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, project_name: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Project type (e.g. Commercial)" value={codeCheckForm.project_type}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, project_type: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Location" value={codeCheckForm.location}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, location: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input type="number" placeholder="Building height (m)" value={codeCheckForm.building_height || ""}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, building_height: parseFloat(e.target.value) || 0 })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Occupancy type (e.g. Office)" value={codeCheckForm.occupancy_type}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, occupancy_type: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Construction type (e.g. Steel frame)" value={codeCheckForm.construction_type}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, construction_type: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Special features (comma-separated)" value={codeCheckForm.special_features}
              onChange={(e) => setCodeCheckForm({ ...codeCheckForm, special_features: e.target.value })}
              className={`col-span-2 ${fieldClass}`} style={fieldStyle} />
          </div>
          <button onClick={runCodeCheck} disabled={codeCheckLoading} className={primaryBtn}
            style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }}>
            {codeCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            Check Compliance
          </button>
          {codeCheckResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}` }}>
              <MarkdownText text={codeCheckResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* AI Regulatory Change Tracker */}
      {regCheckOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.amber.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Regulatory Requirements Tracker</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input placeholder="Region (e.g. California, USA)" value={regCheckForm.region}
              onChange={(e) => setRegCheckForm({ ...regCheckForm, region: e.target.value })}
              className={fieldClass} style={fieldStyle} />
            <input placeholder="Project type (e.g. Residential)" value={regCheckForm.project_type}
              onChange={(e) => setRegCheckForm({ ...regCheckForm, project_type: e.target.value })}
              className={fieldClass} style={fieldStyle} />
          </div>
          <button onClick={runRegulatoryCheck} disabled={regCheckLoading} className={primaryBtn}
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(180,100,10,0.2))", border: "1px solid rgba(245,158,11,0.3)" }}>
            {regCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            Get Regulatory Info
          </button>
          {regCheckResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: ACCENT.amber.bg, border: `1px solid ${ACCENT.amber.border}` }}>
              <MarkdownText text={regCheckResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold text-white text-[14px] mb-1">Compliance Radar</h3>
          <p className="text-xs text-white/35 mb-4">Score by permit category</p>
          {dataLoading ? (
            <div className="h-52 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={stats.radar}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                <Radar dataKey="score" stroke="#10B981" fill="#10B981" fillOpacity={0.2} strokeWidth={2} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Score"]} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold text-white text-[14px] mb-1">Compliance Trend</h3>
          <p className="text-xs text-white/35 mb-4">Monthly approval rate</p>
          {dataLoading ? (
            <div className="h-52 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
          ) : stats.trend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-white/30">
              No trend data yet — add permits to see monthly trends
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.trend}>
                <defs>
                  <linearGradient id="compliance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Approval Rate"]} />
                <Area type="monotone" dataKey="score" stroke="#10B981" fill="url(#compliance)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>

      {/* Permit Register */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-[15px]">Permit Register</h3>
          {permits.length > 0 && (
            <span className="text-xs text-white/35">{permits.length} permits</span>
          )}
        </div>

        {dataLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />
            ))}
          </div>
        ) : permits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-white/15 mb-3" />
            <p className="text-sm text-white/35">No permits tracked yet</p>
            <p className="text-xs text-white/25 mt-1">Click "Add Permit" to start tracking permits</p>
          </div>
        ) : (
          <div className="space-y-2">
            {permits.map((permit, i) => (
              <motion.div
                key={permit.id || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl transition-colors group hover:bg-white/[0.03]"
                style={{ background: "rgba(255,255,255,0.015)" }}
              >
                {editId === permit.id ? (
                  /* ── Inline edit row ── */
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.name ?? permit.name}
                        onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Permit name"
                      />
                      <select
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.type ?? permit.type}
                        onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))}
                      >
                        {PERMIT_TYPES.map(t => <option key={t} style={{ background: "#0A1628" }}>{t}</option>)}
                      </select>
                      <select
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.status ?? permit.status}
                        onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                      >
                        {["Pending", "Approved", "Rejected"].map(s => <option key={s} style={{ background: "#0A1628" }}>{s}</option>)}
                      </select>
                      <select
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.risk_level ?? permit.risk_level}
                        onChange={e => setEditForm(p => ({ ...p, risk_level: e.target.value }))}
                      >
                        {RISK_LEVELS.map(r => <option key={r} style={{ background: "#0A1628" }}>{r}</option>)}
                      </select>
                      <input
                        type="date"
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.expiry_date ?? permit.expiry_date ?? ""}
                        onChange={e => setEditForm(p => ({ ...p, expiry_date: e.target.value }))}
                      />
                      <input
                        className={fieldClass}
                        style={fieldStyle}
                        value={editForm.issued_by ?? permit.issued_by ?? ""}
                        onChange={e => setEditForm(p => ({ ...p, issued_by: e.target.value }))}
                        placeholder="Issued by"
                      />
                    </div>
                    <label className="cursor-pointer inline-block">
                      <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls"
                        onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
                      <span className={`${ghostBtn} h-7 px-3 text-xs`} style={glassButtonStyle}>
                        <Paperclip className="w-3.5 h-3.5" />
                        {editFile ? editFile.name : permit.file_name || "Attach file (optional)"}
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <button className={`${primaryBtn} h-7 px-3 text-xs`} style={gradientButtonStyle}
                        onClick={() => permit.id && saveEdit(permit.id)} disabled={savingId === permit.id}>
                        {savingId === permit.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </button>
                      <button className={`${ghostBtn} h-7 px-3 text-xs`} style={glassButtonStyle}
                        onClick={() => { setEditId(null); setEditForm({}); setEditFile(null); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal row ── */
                  <div className="flex items-center gap-4 p-4">
                    {getStatusIcon(permit.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{permit.name}</p>
                      <p className="text-xs text-white/35">{permit.type}{permit.issued_by ? ` · ${permit.issued_by}` : ""}{permit.file_name ? " · 📎 Attached" : ""}</p>
                    </div>
                    <span className="text-xs text-white/35 hidden sm:block">
                      {permit.expiry_date ? `Expiry: ${permit.expiry_date}` : "No expiry"}
                    </span>
                    <select
                      value={permit.status}
                      onChange={(e) => updateStatus(permit, e.target.value)}
                      className="text-xs px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none"
                      style={{ background: STATUS_BADGE[permit.status]?.bg ?? "rgba(255,255,255,0.05)", color: STATUS_BADGE[permit.status]?.text ?? "rgba(255,255,255,0.6)" }}
                    >
                      <option style={{ background: "#0A1628" }}>Pending</option>
                      <option style={{ background: "#0A1628" }}>Approved</option>
                      <option style={{ background: "#0A1628" }}>Rejected</option>
                    </select>
                    <span className="text-xs px-2 py-0.5 rounded-full hidden sm:block"
                      style={{ background: RISK_BADGE[permit.risk_level]?.bg ?? "rgba(255,255,255,0.05)", color: RISK_BADGE[permit.risk_level]?.text ?? "rgba(255,255,255,0.6)" }}>
                      {permit.risk_level}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-blue-400 hover:bg-white/5 transition-colors"
                        onClick={() => { setEditId(permit.id!); setEditForm({ name: permit.name, type: permit.type, status: permit.status, risk_level: permit.risk_level, expiry_date: permit.expiry_date ?? "", issued_by: permit.issued_by ?? "" }); setEditFile(null); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-white/5 transition-colors"
                        onClick={() => permit.id && deletePermit(permit.id)} disabled={deletingId === permit.id}>
                        {deletingId === permit.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Extracted permits from upload */}
      {extractedPermits.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.green.border }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-[15px]">Permits Found in Document</h3>
              <p className="text-xs text-white/35 mt-0.5">Review and add to your permit register</p>
            </div>
            <button onClick={() => setExtractedPermits([])} className="text-white/40 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {extractedPermits.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                {getStatusIcon(p.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  <p className="text-xs text-white/35">{p.type}{p.expiry_date ? ` · Expires ${p.expiry_date}` : ""}{p.issued_by ? ` · ${p.issued_by}` : ""}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: STATUS_BADGE[p.status]?.bg ?? "rgba(255,255,255,0.05)", color: STATUS_BADGE[p.status]?.text ?? "rgba(255,255,255,0.6)" }}>
                  {p.status}
                </span>
                <button className="flex items-center gap-1 h-7 px-3 text-xs rounded-xl font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,120,80,0.2))", border: "1px solid rgba(16,185,129,0.3)" }}
                  onClick={() => addExtractedPermit(p, idx)} disabled={addingExtracted === String(idx)}>
                  {addingExtracted === String(idx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* AI Analysis result */}
      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.blue.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Compliance Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Compliance & Permits"
        placeholder="Ask about permits, violations, regulations..."
        pageSummaryData={{
          complianceScore: `${stats.compliance_score}%`,
          activePermits: stats.active_permits,
          pendingPermits: stats.pending_permits,
          openViolations: stats.open_violations,
          permits,
          radarData: stats.radar,
        }}
      />
    </div>
  );
}
