"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileSignature,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  ShieldAlert,
  TrendingUp,
  Calculator,
  ChevronRight,
  Plus,
  Pencil,
  X,
  Paperclip,
  Download,
  DollarSign,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import GlassModal from "@/components/shared/GlassModal";
import DownloadModal from "@/components/shared/DownloadModal";
import { MarkdownText } from "@/lib/renderMarkdown";
import { ACCENT, AccentKey, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { downloadEntries, ExportColumn, ExportFormat, ExportMode } from "@/lib/export/downloadEntries";

const DOCS_TABS = [
  { href: "/documents",  label: "Documents" },
  { href: "/contracts",  label: "Contracts" },
  { href: "/compliance", label: "Compliance" },
  { href: "/accounting", label: "Accounting Extract" },
];

const clauseRiskData = [
  { category: "Payment", risk: 75 },
  { category: "Liability", risk: 88 },
  { category: "Penalties", risk: 65 },
  { category: "Termination", risk: 45 },
  { category: "IP Rights", risk: 55 },
  { category: "Disputes", risk: 82 },
];

interface RiskData {
  risk_score: number;
  risk_level: "Low" | "Medium" | "High";
  top_risks: string[];
  dispute_probability: string;
}

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

const textareaClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all resize-none",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");

const RISK_BADGE: Record<string, { bg: string; border: string; text: string }> = {
  high:   { bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.2)",  text: "#EF4444" },
  medium: { bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.2)", text: "#F97316" },
  low:    { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)", text: "#10B981" },
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  Draft:      { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.6)" },
  Pending:    { bg: "rgba(249,115,22,0.1)",   text: "#F97316" },
  Active:     { bg: "rgba(16,185,129,0.1)",   text: "#10B981" },
  Review:     { bg: "rgba(249,115,22,0.1)",   text: "#F97316" },
  Approved:   { bg: "rgba(16,185,129,0.1)",   text: "#10B981" },
  Completed:  { bg: "rgba(59,130,246,0.1)",   text: "#3B82F6" },
  Terminated: { bg: "rgba(239,68,68,0.1)",    text: "#EF4444" },
};

const emptyContract = {
  title: "", contractor: "", contract_type: "", value: 0, status: "Draft",
  risk_level: "medium", risk_score: null as number | null, start_date: "", end_date: "",
  payment_terms: "", retention_percent: null as number | null, notes: "",
};

function ContractFormFields({ form, setForm, file, setFile, existingFileName }: {
  form: any; setForm: (fn: (p: any) => any) => void;
  file: File | null; setFile: (f: File | null) => void;
  existingFileName?: string;
}) {
  return (
    <div className="space-y-3">
      <input className={glassInputClass} style={glassInputStyle} placeholder="Contract title *"
        value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} />
      <div className="grid grid-cols-2 gap-3">
        <input className={glassInputClass} style={glassInputStyle} placeholder="Contractor / vendor"
          value={form.contractor} onChange={(e) => setForm((p: any) => ({ ...p, contractor: e.target.value }))} />
        <input className={glassInputClass} style={glassInputStyle} placeholder="Type (e.g. MEP, Supply)"
          value={form.contract_type} onChange={(e) => setForm((p: any) => ({ ...p, contract_type: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Value ($)</label>
          <input type="number" min={0} className={glassInputClass} style={glassInputStyle}
            value={form.value} onChange={(e) => setForm((p: any) => ({ ...p, value: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Status</label>
          <select className={glassInputClass} style={glassInputStyle} value={form.status}
            onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))}>
            <option>Draft</option>
            <option>Pending</option>
            <option>Active</option>
            <option>Review</option>
            <option>Approved</option>
            <option>Completed</option>
            <option>Terminated</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Risk Level</label>
          <select className={glassInputClass} style={glassInputStyle} value={form.risk_level}
            onChange={(e) => setForm((p: any) => ({ ...p, risk_level: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Risk Score (0-10)</label>
          <input type="number" min={0} max={10} step={0.1} className={glassInputClass} style={glassInputStyle}
            value={form.risk_score ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, risk_score: e.target.value === "" ? null : parseFloat(e.target.value) }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Start Date</label>
          <input type="date" className={glassInputClass} style={glassInputStyle}
            value={form.start_date || ""} onChange={(e) => setForm((p: any) => ({ ...p, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">End Date</label>
          <input type="date" className={glassInputClass} style={glassInputStyle}
            value={form.end_date || ""} onChange={(e) => setForm((p: any) => ({ ...p, end_date: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className={glassInputClass} style={glassInputStyle} placeholder="Payment terms"
          value={form.payment_terms || ""} onChange={(e) => setForm((p: any) => ({ ...p, payment_terms: e.target.value }))} />
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Retention (%)</label>
          <input type="number" min={0} max={100} className={glassInputClass} style={glassInputStyle}
            value={form.retention_percent ?? ""} onChange={(e) => setForm((p: any) => ({ ...p, retention_percent: e.target.value === "" ? null : parseFloat(e.target.value) }))} />
        </div>
      </div>
      <textarea placeholder="Notes" value={form.notes || ""} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))}
        rows={2} className={`${glassInputClass} resize-none`} style={glassInputStyle} />
      <div>
        <label className="text-xs text-white/35 mb-1.5 block">Attach contract file (optional)</label>
        <label className="cursor-pointer inline-block">
          <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <span className={ghostBtn} style={glassButtonStyle}>
            <Paperclip className="w-3.5 h-3.5" />
            {file ? file.name : existingFileName || "Choose file"}
          </span>
        </label>
      </div>
    </div>
  );
}

export default function ContractsPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [requiresReview, setRequiresReview] = useState(false);
  const [analysisFilename, setAnalysisFilename] = useState("");
  const [rfiOpen, setRfiOpen] = useState(false);
  const [rfi, setRfi] = useState({ issue: "", project_context: "" });
  const [rfiResult, setRfiResult] = useState("");
  const [rfiLoading, setRfiLoading] = useState(false);

  const [changeOrderOpen, setChangeOrderOpen] = useState(false);
  const [changeOrderText, setChangeOrderText] = useState("");
  const [changeOrderResult, setChangeOrderResult] = useState("");
  const [changeOrderReviewId, setChangeOrderReviewId] = useState<string | null>(null);
  const [changeOrderLoading, setChangeOrderLoading] = useState(false);

  // Live contract register
  const [contractList, setContractList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Add / Edit
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newContract, setNewContract] = useState({ ...emptyContract });
  const [newContractFile, setNewContractFile] = useState<File | null>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ ...emptyContract });
  const [editContractFile, setEditContractFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Download
  const [showDownload, setShowDownload] = useState(false);

  const fetchContracts = async () => {
    setListLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/contracts/`);
      setContractList(res.data.contracts || []);
    } catch {
      toast.error("Failed to load contract register");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { fetchContracts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadContractFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await axios.post(`${API}/api/v1/contracts/upload`, formData);
    return { file_url: res.data.file_url, file_name: res.data.file_name, bucket: res.data.bucket };
  };

  const handleAddContract = async () => {
    if (!newContract.title.trim()) { toast.error("Contract title is required"); return; }
    setAdding(true);
    try {
      let payload: any = { ...newContract };
      if (newContractFile) {
        const uploaded = await uploadContractFile(newContractFile);
        payload = { ...payload, ...uploaded };
      }
      await axios.post(`${API}/api/v1/contracts/`, payload);
      toast.success("Contract added!");
      setShowAdd(false);
      setNewContract({ ...emptyContract });
      setNewContractFile(null);
      fetchContracts();
      triggerRefresh("contracts");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to add contract");
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (c: any) => {
    setEditTarget(c);
    setEditForm({
      title: c.title || "", contractor: c.contractor || "", contract_type: c.contract_type || "",
      value: c.value ?? 0, status: c.status || "Draft", risk_level: c.risk_level || "medium",
      risk_score: c.risk_score ?? null, start_date: c.start_date || "", end_date: c.end_date || "",
      payment_terms: c.payment_terms || "", retention_percent: c.retention_percent ?? null, notes: c.notes || "",
    });
    setEditContractFile(null);
  };

  const handleUpdateContract = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      let payload: any = { ...editForm };
      if (editContractFile) {
        const uploaded = await uploadContractFile(editContractFile);
        payload = { ...payload, ...uploaded };
      }
      await axios.put(`${API}/api/v1/contracts/${editTarget.id}`, payload);
      toast.success("Contract updated");
      setEditTarget(null);
      setEditContractFile(null);
      fetchContracts();
      triggerRefresh("contracts");
    } catch {
      toast.error("Failed to update contract");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" from the contract register?`)) return;
    try {
      await axios.delete(`${API}/api/v1/contracts/${id}`);
      toast.success("Contract deleted");
      fetchContracts();
      triggerRefresh("contracts");
    } catch {
      toast.error("Failed to delete contract");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setAnalysis("");
    setRiskData(null);
    setRequiresReview(false);
    setAnalysisFilename(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts/analyze`,
        formData
      );
      setAnalysis(response.data.analysis || "");
      if (response.data.risk_data) setRiskData(response.data.risk_data);
      setRequiresReview(response.data.requires_review || false);
      toast.success("Contract analyzed!");
    } catch {
      toast.error("Failed to analyze contract");
    } finally {
      setLoading(false);
    }
  };

  const generateRFI = async () => {
    setRfiLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts/rfi`,
        rfi
      );
      setRfiResult(response.data.rfi);
      toast.success("RFI generated!");
    } catch {
      toast.error("Failed to generate RFI");
    } finally {
      setRfiLoading(false);
    }
  };

  const analyzeChangeOrder = async () => {
    if (!changeOrderText.trim()) { toast.error("Describe the change order first"); return; }
    setChangeOrderLoading(true);
    setChangeOrderResult("");
    setChangeOrderReviewId(null);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/contracts/change-order`,
        { text: changeOrderText }
      );
      setChangeOrderResult(response.data.analysis);
      if (response.data.requires_review) setChangeOrderReviewId(response.data.review_id);
      toast.success("Change order analyzed!");
    } catch {
      toast.error("Failed to analyze change order");
    } finally {
      setChangeOrderLoading(false);
    }
  };

  const riskAccent: AccentKey = !riskData ? "blue" : riskData.risk_level === "High" ? "red" : riskData.risk_level === "Medium" ? "orange" : "green";

  // ── Live KPIs, derived from the fetched register (no hardcoding) ──
  const totalContracts = contractList.length;
  const activeCount = contractList.filter((c) => c.status === "Active" || c.status === "Approved").length;
  const highRiskCount = contractList.filter((c) => c.risk_level === "high").length;
  const totalValue = contractList.reduce((s, c) => s + (Number(c.value) || 0), 0);

  const kpis: { label: string; value: string; accent: AccentKey; icon: any }[] = [
    { label: "Total Contracts", value: `${totalContracts}`, accent: "blue", icon: FileSignature },
    { label: "Active", value: `${activeCount}`, accent: "green", icon: CheckCircle },
    { label: "High Risk", value: `${highRiskCount}`, accent: "red", icon: XCircle },
    { label: "Total Value", value: `$${(totalValue / 1000).toFixed(0)}K`, accent: "cyan", icon: DollarSign },
  ];

  // ── Download ──
  const contractColumns: ExportColumn[] = [
    { key: "title", label: "Title" },
    { key: "contractor", label: "Contractor" },
    { key: "contract_type", label: "Type" },
    { key: "value", label: "Value" },
    { key: "status", label: "Status" },
    { key: "risk_level", label: "Risk" },
    { key: "start_date", label: "Start Date" },
    { key: "end_date", label: "End Date" },
  ];

  const handleContractsExport = async (format: ExportFormat, mode: ExportMode) => {
    await downloadEntries({
      format,
      mode,
      title: "Contract Register Report",
      subtitle: `${totalContracts} contract${totalContracts === 1 ? "" : "s"}`,
      kpis: [
        { label: "Total Contracts", value: `${totalContracts}` },
        { label: "Active", value: `${activeCount}` },
        { label: "High Risk", value: `${highRiskCount}` },
        { label: "Total Value", value: `$${totalValue.toLocaleString()}` },
      ],
      columns: contractColumns,
      rows: contractList,
      filenameBase: `CivilAI_Contract_Register_${new Date().toISOString().split("T")[0]}`,
    });
    toast.success("Contract register downloaded");
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={DOCS_TABS} />

      {/* Add Contract Modal */}
      <GlassModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Contract">
        <ContractFormFields form={newContract} setForm={setNewContract} file={newContractFile} setFile={setNewContractFile} />
        <div className="flex gap-2 mt-5">
          <button onClick={() => setShowAdd(false)} className={ghostBtn} style={glassButtonStyle}>Cancel</button>
          <button onClick={handleAddContract} disabled={adding} className={primaryBtn} style={gradientButtonStyle}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Contract
          </button>
        </div>
      </GlassModal>

      {/* Edit Contract Modal */}
      <GlassModal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Contract">
        <ContractFormFields form={editForm} setForm={setEditForm} file={editContractFile} setFile={setEditContractFile} existingFileName={editTarget?.file_name} />
        <div className="flex gap-2 mt-5">
          <button onClick={() => setEditTarget(null)} className={ghostBtn} style={glassButtonStyle}>Cancel</button>
          <button onClick={handleUpdateContract} disabled={saving} className={primaryBtn} style={gradientButtonStyle}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </GlassModal>

      {/* Download Modal */}
      <DownloadModal open={showDownload} onClose={() => setShowDownload(false)} title="Download Contract Register" onExport={handleContractsExport} />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Contracts</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered contract intelligence &amp; risk analysis
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 text-emerald-400" />
            Add Contract
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setShowDownload(true)}>
            <Download className="w-4 h-4 text-cyan-400" />
            Download
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setRfiOpen(!rfiOpen)}>
            <FileText className="w-4 h-4 text-blue-400" />
            Generate RFI
          </button>
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setChangeOrderOpen(!changeOrderOpen)}>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Change Order
          </button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileUpload} />
            <span className={primaryBtn} style={gradientButtonStyle}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Analyze Contract
            </span>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
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
        })}
      </div>

      {/* RFI Form */}
      {rfiOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.blue.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI RFI Generator</h3>
          <div className="space-y-3 mb-4">
            <textarea
              placeholder="Describe the issue requiring clarification..."
              value={rfi.issue}
              onChange={(e) => setRfi({ ...rfi, issue: e.target.value })}
              rows={3}
              className={textareaClass}
              style={glassInputStyle}
            />
            <textarea
              placeholder="Project context (name, phase, contractor...)"
              value={rfi.project_context}
              onChange={(e) => setRfi({ ...rfi, project_context: e.target.value })}
              rows={2}
              className={textareaClass}
              style={glassInputStyle}
            />
          </div>
          <button onClick={generateRFI} disabled={rfiLoading} className={primaryBtn} style={gradientButtonStyle}>
            {rfiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate RFI
          </button>
          {rfiResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
              <MarkdownText text={rfiResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Change Order Analyzer */}
      {changeOrderOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
          style={{ borderColor: ACCENT.amber.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Change Order Analysis</h3>
          <p className="text-xs text-white/35 mb-3">
            Change orders always require project director sign-off — this analysis is automatically sent to the Human Review Queue.
          </p>
          <textarea
            placeholder="Describe the proposed change order (scope, cost impact, schedule impact...)"
            value={changeOrderText}
            onChange={(e) => setChangeOrderText(e.target.value)}
            rows={4}
            className={`${textareaClass} mb-4`}
            style={glassInputStyle}
          />
          <button onClick={analyzeChangeOrder} disabled={changeOrderLoading} className={primaryBtn}
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(180,100,10,0.2))", border: "1px solid rgba(245,158,11,0.3)" }}>
            {changeOrderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            Analyze Change Order
          </button>
          {changeOrderReviewId && (
            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: ACCENT.orange.bg, border: `1px solid ${ACCENT.orange.border}` }}>
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-sm text-orange-300 flex-1">
                Sent to the Human Review Queue for director sign-off.
              </p>
              <a href="/review" className="text-xs font-medium text-orange-300 hover:text-orange-200 flex items-center gap-1 shrink-0">
                View Queue <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          {changeOrderResult && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: ACCENT.amber.bg, border: `1px solid ${ACCENT.amber.border}` }}>
              <MarkdownText text={changeOrderResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Clause Risk + Contracts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold text-white text-[14px] mb-2">Clause Risk Radar</h3>
          <p className="text-xs text-white/35 mb-4">Risk score by contract clause type</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={clauseRiskData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
              <Radar dataKey="risk" stroke="#EF4444" fill="#EF4444" fillOpacity={0.2} strokeWidth={2} />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold text-white text-[14px] mb-4">Risk by Clause</h3>
          <div className="space-y-3">
            {clauseRiskData.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-white/70 w-20">{item.category}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.risk}%` }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.8 }}
                    className="h-2 rounded-full"
                    style={{ background: item.risk > 80 ? "#EF4444" : item.risk > 60 ? "#F97316" : "#10B981" }}
                  />
                </div>
                <span className="text-xs font-medium w-8 text-right"
                  style={{ color: item.risk > 80 ? "#EF4444" : item.risk > 60 ? "#F97316" : "#10B981" }}>
                  {item.risk}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Contracts List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-[15px]">Contract Register</h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-medium hover:bg-cyan-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : contractList.length === 0 ? (
          <div className="text-center py-8">
            <FileSignature className="w-10 h-10 text-white/30 mx-auto mb-2" />
            <p className="text-sm text-white/35">No contracts in register yet</p>
            <button onClick={() => setShowAdd(true)}
              className="mt-3 px-4 py-2 rounded-xl text-white text-xs font-medium transition-all hover:scale-105"
              style={gradientButtonStyle}>
              Add First Contract
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {contractList.map((contract, i) => {
              const riskBadge = RISK_BADGE[contract.risk_level] || RISK_BADGE.medium;
              const statusBadge = STATUS_BADGE[contract.status] || STATUS_BADGE.Draft;
              return (
                <motion.div
                  key={contract.id || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-4 p-4 rounded-xl transition-colors hover:bg-white/[0.03] group"
                  style={{ background: "rgba(255,255,255,0.015)" }}
                >
                  <FileSignature className="w-4 h-4 text-white/35 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{contract.title}</p>
                    <p className="text-xs text-white/35 truncate">
                      {[contract.contractor, contract.contract_type].filter(Boolean).join(" · ")}
                      {" · "}Value: ${Number(contract.value || 0).toLocaleString()}
                      {contract.file_name ? " · 📎 Attached" : ""}
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full border font-medium capitalize"
                    style={{ background: riskBadge.bg, borderColor: riskBadge.border, color: riskBadge.text }}>
                    {contract.risk_level}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full"
                    style={{ background: statusBadge.bg, color: statusBadge.text }}>
                    {contract.status}
                  </span>
                  <button onClick={() => openEdit(contract)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 flex items-center justify-center shrink-0">
                    <Pencil className="w-3 h-3 text-cyan-400" />
                  </button>
                  <button onClick={() => handleDeleteContract(contract.id, contract.title)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center shrink-0">
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {(analysis || riskData) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* HITL review banner */}
          {requiresReview && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: ACCENT.orange.bg, border: `1px solid ${ACCENT.orange.border}` }}>
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-sm text-orange-300 flex-1">
                High-risk contract flagged for human review — a project director or admin will review this before approval.
              </p>
            </div>
          )}

          {/* Structured risk panel */}
          {riskData && (
            <div className="glass-card p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-white text-[15px]">AI Risk Assessment</h3>
                  {analysisFilename && (
                    <span className="text-xs text-white/35 truncate max-w-48">{analysisFilename}</span>
                  )}
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full border"
                  style={{ background: RISK_BADGE[riskData.risk_level.toLowerCase()].bg, borderColor: RISK_BADGE[riskData.risk_level.toLowerCase()].border, color: RISK_BADGE[riskData.risk_level.toLowerCase()].text }}>
                  {riskData.risk_level} Risk
                </span>
              </div>

              {/* Score + dispute probability */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <p className="text-xs text-white/35 mb-1">Risk Score</p>
                  <p className="text-3xl font-bold text-white">{riskData.risk_score.toFixed(1)}<span className="text-base font-normal text-white/35">/10</span></p>
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${riskData.risk_score * 10}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: riskData.risk_score >= 7 ? "#EF4444" : riskData.risk_score >= 5 ? "#F97316" : "#10B981" }}
                    />
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <p className="text-xs text-white/35 mb-1">Dispute Probability</p>
                  <div className="flex items-end gap-1">
                    <TrendingUp className="w-4 h-4 text-orange-400 mb-1" />
                    <p className="text-3xl font-bold text-white">{riskData.dispute_probability}</p>
                  </div>
                </div>
              </div>

              {/* Top risks */}
              {riskData.top_risks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-white/35 mb-2 uppercase tracking-wide">Top Risk Factors</p>
                  <ul className="space-y-1.5">
                    {riskData.top_risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                          i === 0 ? "bg-red-400" : i === 1 ? "bg-orange-400" : "bg-yellow-400"
                        }`} />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cross-link to Accounting */}
              <a
                href="/accounting"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors pt-1 border-t"
                style={{ borderColor: "rgba(255,255,255,0.07)" }}
              >
                <Calculator className="w-3.5 h-3.5" />
                Extract financial terms from this contract in Accounting Extract
                <ChevronRight className="w-3.5 h-3.5 ml-auto" />
              </a>
            </div>
          )}

          {/* Full analysis text */}
          {analysis && (
            <div className="glass-card p-6" style={{ borderColor: ACCENT.blue.border }}>
              <div className="flex items-center gap-2 mb-3">
                <FileSignature className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white text-[15px]">Detailed Analysis</h3>
              </div>
              <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      <ModuleChat
        context="Contract Intelligence"
        placeholder="Ask about contracts, risks, disputes..."
        pageSummaryData={{
          totalContracts,
          active: activeCount,
          highRisk: highRiskCount,
          totalValue,
          contracts: contractList,
          clauseRisks: clauseRiskData,
        }}
      />
    </div>
  );
}
