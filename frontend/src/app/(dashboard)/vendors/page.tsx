"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Loader2,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  Scale,
  FileText,
  Plus,
  Pencil,
  X,
  Upload,
  Building2,
  Download,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { MarkdownText } from "@/lib/renderMarkdown";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";
import { exportAIReportPDF, exportVendorsReport } from "@/lib/exportPDF";

const WORKFORCE_MODULE_TABS = [
  { href: "/workforce", label: "Workforce" },
  { href: "/equipment", label: "Equipment" },
  { href: "/vendors", label: "Vendors" },
];

const FINANCIAL_RATING_SCORE: Record<string, number> = {
  Excellent: 95, Good: 80, Average: 60, Poor: 35,
};

// Shared threshold coloring for anything graded 0-100 (mini-bars, scatter risk tiers).
const riskTierColor = (v: number) => v >= 80 ? "#10B981" : v >= 60 ? "#F97316" : "#EF4444";

// Vendor status is a fixed operational state (not a generic category), so it takes
// the app's existing reserved status tokens — same colors as the register badges.
const STATUS_ORDER = ["Preferred", "Approved", "Review", "Blacklisted"] as const;
const STATUS_BAR_COLOR: Record<string, string> = {
  Preferred: "#3B82F6", Approved: "#10B981", Review: "#F97316", Blacklisted: "#EF4444",
};

// Financial rating is an ordered tier (Poor < Average < Good < Excellent), so it
// takes a one-hue ordinal ramp rather than four unrelated categorical colors —
// validated light→dark (monotone L, ΔL >= 0.06, light-end contrast, single hue)
// via scripts/validate_palette.js --ordinal. Listed best-first (Recharts renders
// index 0 at the top of a vertical bar chart) to match the Vendor Status chart's
// best-at-top convention next to it.
const RATING_ORDER = ["Excellent", "Good", "Average", "Poor"] as const;
const RATING_BAR_COLOR: Record<string, string> = {
  Poor: "#0E7490", Average: "#0891B2", Good: "#22D3EE", Excellent: "#67E8F9",
};

const emptyVendor = {
  name: "", vendor_type: "Subcontractor", contact_name: "", email: "", phone: "",
  status: "Approved", score: 0, delivery_score: 0, quality_score: 0, safety_score: 0,
  financial_rating: "Good", notes: "",
};

const primaryBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";
const ghostBtn =
  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:text-white whitespace-nowrap transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100";

function GlassModal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{
          background: "rgba(4,11,25,0.92)",
          border: "1px solid rgba(0,212,255,0.15)",
          boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)",
          backdropFilter: "blur(32px)",
        }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-white text-[15px]">{title}</h3>
          <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors p-1 -mr-1 -mt-1">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function MiniStat({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div className="w-20 shrink-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/35">{label}</span>
        <span className="text-white font-medium">{value}</span>
      </div>
      <div className="rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.8 }}
          className="h-1.5 rounded-full" style={{ backgroundColor: riskTierColor(value) }} />
      </div>
    </div>
  );
}

// 24px transparent hit area around each mark (visible dot stays 10px / r=5, meeting
// the >=8px marker spec) plus a 2px surface-color ring so points stay legible where
// they overlap.
function SafetyDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  return (
    <g style={{ cursor: "pointer" }}>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={riskTierColor(payload.safety)} stroke="#040B19" strokeWidth={2} />
    </g>
  );
}

function SafetyScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium text-white mb-1">{d.name}</p>
      <p className="text-xs text-white/60">Safety score: <span className="text-white font-medium">{d.safety}%</span></p>
      <p className="text-xs text-white/60">Incidents: <span className="text-white font-medium">{d.incidents}</span></p>
    </div>
  );
}

function VendorFormFields({ form, setForm }: { form: any; setForm: (fn: (p: any) => any) => void }) {
  return (
    <div className="space-y-3">
      <input className={glassInputClass} style={glassInputStyle} placeholder="Company name *"
        value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} />
      <div className="grid grid-cols-2 gap-3">
        <select className={glassInputClass} style={glassInputStyle} value={form.vendor_type}
          onChange={(e) => setForm((p: any) => ({ ...p, vendor_type: e.target.value }))}>
          <option>Main Contractor</option>
          <option>Subcontractor</option>
          <option>Material Supplier</option>
          <option>MEP Contractor</option>
          <option>Consultant</option>
        </select>
        <select className={glassInputClass} style={glassInputStyle} value={form.status}
          onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))}>
          <option>Preferred</option>
          <option>Approved</option>
          <option>Review</option>
          <option>Blacklisted</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input className={glassInputClass} style={glassInputStyle} placeholder="Contact name"
          value={form.contact_name} onChange={(e) => setForm((p: any) => ({ ...p, contact_name: e.target.value }))} />
        <input className={glassInputClass} style={glassInputStyle} placeholder="Phone"
          value={form.phone} onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))} />
      </div>
      <input className={glassInputClass} style={glassInputStyle} placeholder="Email"
        value={form.email} onChange={(e) => setForm((p: any) => ({ ...p, email: e.target.value }))} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Overall Score (0-100)</label>
          <input type="number" min={0} max={100} className={glassInputClass} style={glassInputStyle}
            value={form.score} onChange={(e) => setForm((p: any) => ({ ...p, score: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Financial Rating</label>
          <select className={glassInputClass} style={glassInputStyle} value={form.financial_rating}
            onChange={(e) => setForm((p: any) => ({ ...p, financial_rating: e.target.value }))}>
            <option>Excellent</option>
            <option>Good</option>
            <option>Average</option>
            <option>Poor</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Delivery %</label>
          <input type="number" min={0} max={100} className={glassInputClass} style={glassInputStyle}
            value={form.delivery_score} onChange={(e) => setForm((p: any) => ({ ...p, delivery_score: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Quality %</label>
          <input type="number" min={0} max={100} className={glassInputClass} style={glassInputStyle}
            value={form.quality_score} onChange={(e) => setForm((p: any) => ({ ...p, quality_score: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label className="text-xs text-white/35 mb-1.5 block">Safety %</label>
          <input type="number" min={0} max={100} className={glassInputClass} style={glassInputStyle}
            value={form.safety_score} onChange={(e) => setForm((p: any) => ({ ...p, safety_score: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>
      <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))}
        rows={2} className={`${glassInputClass} resize-none`} style={glassInputStyle} />
    </div>
  );
}

export default function VendorsPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [activeTab, setActiveTab] = useState("register");
  const [form, setForm] = useState({
    vendor_name: "",
    vendor_type: "Subcontractor",
    years_experience: 0,
    completed_projects: 0,
    on_time_delivery_pct: 0,
    quality_score: 0,
    safety_incidents: 0,
    financial_rating: "Good",
    certifications: [],
    past_issues: "",
  });

  // Live vendor register
  const [vendorList, setVendorList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Add / Edit modals
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState({ ...emptyVendor });
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ ...emptyVendor });
  const [saving, setSaving] = useState(false);

  // Document upload -> AI extraction -> per-entry review
  const [extractedVendors, setExtractedVendors] = useState<any[]>([]);
  const [extractLoading, setExtractLoading] = useState(false);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);

  // Register download menu (CSV/Excel/PDF)
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const fetchVendors = async () => {
    setListLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/vendors/`);
      setVendorList(res.data.vendors || []);
    } catch {
      toast.error("Failed to load vendor register");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { fetchVendors(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Register export (CSV / Excel / PDF) ────────────────────────────────────
  // Built synchronously inside the click handler (no await before the download
  // fires) — an async gap before it can make some browsers block the download
  // since it no longer looks like it came straight from the user gesture.

  const exportFileBase = () => `vendor_register_${new Date().toISOString().split("T")[0]}`;

  const handleExportCSV = () => {
    if (vendorList.length === 0) { toast.error("No vendors to export"); return; }
    setShowExportMenu(false);
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Name", "Type", "Contact", "Email", "Phone", "Status", "Score", "Delivery %", "Quality %", "Safety %", "Financial Rating", "Notes"];
    const lines = [header.join(",")];
    for (const v of vendorList) {
      lines.push([
        v.name, v.vendor_type, v.contact_name, v.email, v.phone, v.status,
        v.score ?? 0, v.delivery_score ?? 0, v.quality_score ?? 0, v.safety_score ?? 0,
        v.financial_rating, v.notes,
      ].map(escape).join(","));
    }
    const blobUrl = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${exportFileBase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    toast.success("Vendor register exported to CSV");
  };

  const handleExportExcel = () => {
    if (vendorList.length === 0) { toast.error("No vendors to export"); return; }
    setShowExportMenu(false);
    const rows = vendorList.map((v) => ({
      "Name": v.name, "Type": v.vendor_type, "Contact": v.contact_name, "Email": v.email,
      "Phone": v.phone, "Status": v.status, "Score": v.score ?? 0,
      "Delivery %": v.delivery_score ?? 0, "Quality %": v.quality_score ?? 0, "Safety %": v.safety_score ?? 0,
      "Financial Rating": v.financial_rating, "Notes": v.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, `${exportFileBase()}.xlsx`);
    toast.success("Vendor register exported to Excel");
  };

  const handleExportPDF = () => {
    if (vendorList.length === 0) { toast.error("No vendors to export"); return; }
    setShowExportMenu(false);
    exportVendorsReport(vendorList);
    toast.success("Vendor register exported to PDF");
  };

  const handleAddVendor = async () => {
    if (!newVendor.name.trim()) { toast.error("Vendor name is required"); return; }
    setAdding(true);
    try {
      await axios.post(`${API}/api/v1/vendors/`, newVendor);
      toast.success("Vendor added!");
      setShowAdd(false);
      setNewVendor({ ...emptyVendor });
      fetchVendors();
      triggerRefresh("vendors");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to add vendor");
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (v: any) => {
    setEditTarget(v);
    setEditForm({
      name: v.name || "", vendor_type: v.vendor_type || "Subcontractor",
      contact_name: v.contact_name || "", email: v.email || "", phone: v.phone || "",
      status: v.status || "Approved", score: v.score ?? 0, delivery_score: v.delivery_score ?? 0,
      quality_score: v.quality_score ?? 0, safety_score: v.safety_score ?? 0,
      financial_rating: v.financial_rating || "Good", notes: v.notes || "",
    });
  };

  const handleUpdateVendor = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await axios.patch(`${API}/api/v1/vendors/${editTarget.id}`, editForm);
      toast.success("Vendor updated");
      setEditTarget(null);
      fetchVendors();
      triggerRefresh("vendors");
    } catch {
      toast.error("Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from the vendor register?`)) return;
    try {
      await axios.delete(`${API}/api/v1/vendors/${id}`);
      toast.success("Vendor deleted");
      fetchVendors();
      triggerRefresh("vendors");
    } catch {
      toast.error("Failed to delete vendor");
    }
  };

  const handleExtractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExtractLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/api/v1/vendors/extract-items`, formData);
      const found = res.data.extracted_items ?? [];
      setExtractedVendors(found);
      toast.success(found.length > 0 ? `Found ${found.length} vendor(s) — review below.` : "No vendors found in document.");
    } catch {
      toast.error("Failed to extract vendors from file");
    } finally {
      setExtractLoading(false);
    }
  };

  // Maps AI-extracted fields onto the register's create payload — this is what
  // actually gets written once the user explicitly approves the entry.
  const toVendorCreatePayload = (v: any) => {
    const delivery = v.on_time_delivery_pct ?? 0;
    const quality = v.quality_score ?? 0;
    const safety = Math.max(0, 100 - (v.safety_incidents ?? 0) * 10);
    return {
      name: v.name,
      vendor_type: v.vendor_type || "",
      contact_name: v.contact_name || "",
      email: v.email || "",
      phone: v.phone || "",
      status: "Review",
      delivery_score: delivery,
      quality_score: quality,
      safety_score: safety,
      score: Math.round((delivery + quality + safety) / 3),
      financial_rating: v.financial_rating || "Good",
      years_experience: v.years_experience || 0,
      completed_projects: v.completed_projects || 0,
      safety_incidents: v.safety_incidents || 0,
      certifications: v.certifications || [],
      notes: v.notes || "",
    };
  };

  const addExtractedVendor = async (v: any, idx: number) => {
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${API}/api/v1/vendors/`, toVendorCreatePayload(v));
      setExtractedVendors((prev) => prev.filter((_, i) => i !== idx));
      toast.success(`${v.name} added to register`);
      fetchVendors();
      triggerRefresh("vendors");
    } catch {
      toast.error(`Failed to add ${v.name}`);
    } finally {
      setAddingExtracted(null);
    }
  };

  const addAllExtractedVendors = async () => {
    setAddingExtracted("all");
    let added = 0;
    for (const v of extractedVendors) {
      try { await axios.post(`${API}/api/v1/vendors/`, toVendorCreatePayload(v)); added++; } catch { /* skip */ }
    }
    setExtractedVendors([]);
    toast.success(`Added ${added} vendor(s)`);
    fetchVendors();
    if (added > 0) triggerRefresh("vendors");
    setAddingExtracted(null);
  };

  const handleScore = async () => {
    setLoading(true);
    setResult("");
    try {
      const response = await axios.post(`${API}/api/v1/vendors/score`, form);
      setResult(response.data.analysis);
      toast.success("Vendor scored!");
    } catch {
      toast.error("Failed to score vendor");
    } finally {
      setLoading(false);
    }
  };

  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState("");

  const toggleCompare = (name: string) => {
    setCompareSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const runCompare = async () => {
    if (compareSelected.length < 2) { toast.error("Select at least 2 vendors to compare"); return; }
    setCompareLoading(true);
    setCompareResult("");
    try {
      const response = await axios.post(
        `${API}/api/v1/vendors/compare`,
        { vendors: vendorList.filter(v => compareSelected.includes(v.name)) }
      );
      setCompareResult(response.data.comparison);
      toast.success("Vendors compared!");
    } catch {
      toast.error("Failed to compare vendors");
    } finally {
      setCompareLoading(false);
    }
  };

  const [reportLoading, setReportLoading] = useState(false);
  const [reportResult, setReportResult] = useState("");

  const runReport = async () => {
    if (!form.vendor_name.trim()) { toast.error("Enter a vendor name first"); return; }
    setReportLoading(true);
    setReportResult("");
    try {
      const response = await axios.post(`${API}/api/v1/vendors/report`, form);
      setReportResult(response.data.report);
      toast.success("Vendor report generated!");
    } catch {
      toast.error("Failed to generate vendor report");
    } finally {
      setReportLoading(false);
    }
  };

  const handleDownloadReportPDF = () => {
    if (!reportResult) return;
    exportAIReportPDF(reportResult, "vendor", form.vendor_name || "Vendor");
    toast.success("Report downloaded as PDF");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Preferred": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "Approved": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Review": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-red-500/10 text-red-400 border-red-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Preferred": return <Star className="w-4 h-4 text-blue-400" />;
      case "Approved": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "Review": return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
    }
  };


  const tabLabel: Record<string, string> = { register: "Vendor Register", score: "AI Score Vendor", compare: "Compare Vendors", report: "Vendor Report" };

  // ── Live KPIs & chart data, derived from the fetched register (no hardcoding) ──
  const totalVendors = vendorList.length;
  const preferredCount = vendorList.filter(v => v.status === "Preferred").length;
  const underReviewCount = vendorList.filter(v => v.status === "Review").length;
  const avgScore = totalVendors > 0
    ? Math.round(vendorList.reduce((s, v) => s + (v.score || 0), 0) / totalVendors)
    : null;

  const avgOf = (key: string) => totalVendors > 0
    ? Math.round(vendorList.reduce((s, v) => s + (v[key] || 0), 0) / totalVendors)
    : 0;
  const avgFinancial = totalVendors > 0
    ? Math.round(vendorList.reduce((s, v) => s + (FINANCIAL_RATING_SCORE[v.financial_rating] ?? 60), 0) / totalVendors)
    : 0;
  const radarData = totalVendors > 0 ? [
    { metric: "Quality", score: avgOf("quality_score") },
    { metric: "Delivery", score: avgOf("delivery_score") },
    { metric: "Safety", score: avgOf("safety_score") },
    { metric: "Financial", score: avgFinancial },
  ] : [];

  // A ranking chart has to actually be ranked — the register list itself is sorted
  // by recency, so sort by score for this chart specifically, and cap to the top 8
  // so it stays readable once the register grows past a handful of vendors.
  const rankedVendors = [...vendorList].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const topVendors = rankedVendors.slice(0, 8);

  // Status is a fixed 4-slot scale — show all four (including zero counts; "0
  // Blacklisted" is itself a useful signal) rather than dropping empty ones.
  const statusChartData = STATUS_ORDER.map((status) => ({
    status, count: vendorList.filter((v) => v.status === status).length,
  }));
  const ratingChartData = RATING_ORDER.map((rating) => ({
    rating, count: vendorList.filter((v) => (v.financial_rating || "Good") === rating).length,
  }));
  const safetyScatterData = vendorList.map((v) => ({
    name: v.name, incidents: v.safety_incidents ?? 0, safety: v.safety_score ?? 0,
  }));
  const maxIncidents = Math.max(1, ...safetyScatterData.map((d) => d.incidents));
  // Vendors sharing identical (incidents, safety) values render as one dot — flag
  // it so the chart doesn't silently undercount when that happens.
  const hasOverlappingSafetyPoints = (() => {
    const seen = new Set<string>();
    for (const d of safetyScatterData) {
      const key = `${d.incidents}|${d.safety}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  })();

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />

      {/* Add Vendor Modal */}
      <GlassModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Vendor">
        <VendorFormFields form={newVendor} setForm={setNewVendor} />
        <div className="flex gap-2 mt-5">
          <button onClick={() => setShowAdd(false)} className={ghostBtn} style={glassButtonStyle}>Cancel</button>
          <button onClick={handleAddVendor} disabled={adding} className={primaryBtn} style={gradientButtonStyle}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Vendor
          </button>
        </div>
      </GlassModal>

      {/* Edit Vendor Modal */}
      <GlassModal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Vendor">
        <VendorFormFields form={editForm} setForm={setEditForm} />
        <div className="flex gap-2 mt-5">
          <button onClick={() => setEditTarget(null)} className={ghostBtn} style={glassButtonStyle}>Cancel</button>
          <button onClick={handleUpdateVendor} disabled={saving} className={primaryBtn} style={gradientButtonStyle}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </GlassModal>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Vendor Scoring</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered subcontractor &amp; vendor performance management
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button className={ghostBtn} style={glassButtonStyle} onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 text-emerald-400" />Add Vendor
          </button>
          <input ref={extractFileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={handleExtractUpload} />
          <button className={primaryBtn} style={gradientButtonStyle} disabled={extractLoading} onClick={() => extractFileRef.current?.click()}>
            {extractLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Document
          </button>
          <div ref={exportMenuRef} className="relative">
            <button className={ghostBtn} style={glassButtonStyle} onClick={() => setShowExportMenu((v) => !v)}>
              <Download className="w-4 h-4 text-cyan-400" />Download
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showExportMenu && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 w-44 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0d1220] shadow-2xl z-50 overflow-hidden">
                  <button onClick={handleExportCSV}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />CSV
                  </button>
                  <button onClick={handleExportExcel}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left border-t border-[rgba(255,255,255,0.06)]">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />Excel
                  </button>
                  <button onClick={handleExportPDF}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-white/80 hover:bg-white/5 hover:text-white transition-colors text-left border-t border-[rgba(255,255,255,0.06)]">
                    <FileText className="w-3.5 h-3.5 text-red-400" />PDF
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Vendors", value: `${totalVendors}`, accent: "blue" as const },
          { label: "Preferred", value: `${preferredCount}`, accent: "green" as const },
          { label: "Under Review", value: `${underReviewCount}`, accent: "orange" as const },
          { label: "Avg Score", value: avgScore != null ? `${avgScore}/100` : "—", accent: "cyan" as const },
        ].map((kpi, i) => {
          const a = ACCENT[kpi.accent];
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }} whileHover={{ y: -4, scale: 1.02 }}
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}>
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <p className="relative text-[13px] text-white/40">{kpi.label}</p>
              <p className="relative text-[28px] font-bold mt-1" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-xl w-fit flex-wrap"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {["register", "score", "compare", "report"].map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setResult(""); }}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors"
            style={activeTab === tab
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}>
            {tabLabel[tab]}
          </button>
        ))}
      </div>

      {/* Vendor Register */}
      {activeTab === "register" && (
        <div className="space-y-6">
          {/* Extracted vendors review panel — nothing is saved until approved per-entry */}
          <AnimatePresence>
            {extractedVendors.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="glass-card p-6" style={{ borderColor: ACCENT.green.border, background: ACCENT.green.bg }}>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-white">Extracted Vendors</h3>
                    <p className="text-xs text-white/35 mt-0.5">{extractedVendors.length} vendor(s) found in the uploaded document — review and approve each before it's added</p>
                  </div>
                  <button onClick={addAllExtractedVendors} disabled={addingExtracted === "all"}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60">
                    {addingExtracted === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Approve All
                  </button>
                </div>
                <div className="space-y-2">
                  {extractedVendors.map((v: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{v.name}</p>
                        <p className="text-xs text-white/35 truncate">
                          {[v.vendor_type, v.contact_name, v.financial_rating].filter(Boolean).join(" · ")}
                          {v.quality_score != null && ` · Quality: ${v.quality_score}%`}
                        </p>
                      </div>
                      <button onClick={() => addExtractedVendor(v, idx)} disabled={addingExtracted === String(idx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-60 shrink-0">
                        {addingExtracted === String(idx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Approve
                      </button>
                      <button onClick={() => setExtractedVendors(prev => prev.filter((_, i) => i !== idx))}
                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center shrink-0">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Vendor List */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Vendor Register</h3>
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
            ) : vendorList.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-10 h-10 text-white/30 mx-auto mb-2" />
                <p className="text-sm text-white/35">No vendors in register yet</p>
                <button onClick={() => setShowAdd(true)}
                  className="mt-3 px-4 py-2 rounded-xl text-white text-xs font-medium transition-all hover:scale-105"
                  style={gradientButtonStyle}>
                  Add First Vendor
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {vendorList.map((vendor, i) => (
                  <motion.div key={vendor.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/3 transition-colors group">
                    {getStatusIcon(vendor.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{vendor.name}</p>
                      <p className="text-xs text-white/35 truncate">{vendor.vendor_type}</p>
                    </div>
                    <div className="hidden lg:flex gap-3">
                      <MiniStat label="Delivery" value={vendor.delivery_score ?? 0} delay={i * 0.08} />
                      <MiniStat label="Quality" value={vendor.quality_score ?? 0} delay={i * 0.08 + 0.03} />
                      <MiniStat label="Safety" value={vendor.safety_score ?? 0} delay={i * 0.08 + 0.06} />
                    </div>
                    <MiniStat label="Score" value={vendor.score ?? 0} delay={i * 0.08 + 0.09} />
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(vendor.status)}`}>
                      {vendor.status}
                    </span>
                    <button onClick={() => openEdit(vendor)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 flex items-center justify-center shrink-0">
                      <Pencil className="w-3 h-3 text-cyan-400" />
                    </button>
                    <button onClick={() => handleDeleteVendor(vendor.id, vendor.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center shrink-0">
                      <X className="w-3 h-3 text-red-400" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-2">Vendor Scores</h3>
              <p className="text-xs text-white/35 mb-4">
                Top {Math.min(8, vendorList.length)} of {vendorList.length} by overall score
              </p>
              {vendorList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/35">
                  <Building2 className="w-8 h-8 mb-2" />
                  <p className="text-sm">No vendors yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topVendors} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
                    <Bar dataKey="score" radius={[0, 6, 6, 0]} name="Score" fill="#00D4FF" barSize={16}>
                      <LabelList dataKey="score" position="right" fill="rgba(255,255,255,0.5)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-4">Register-wide Performance</h3>
              {radarData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/35">
                  <Star className="w-8 h-8 mb-2" />
                  <p className="text-sm">No vendors yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
                    <Radar dataKey="score" stroke="#00D4FF" fill="#00D4FF" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </motion.div>
          </div>

          {/* Status, financial rating & safety risk breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-2">Vendor Status</h3>
              <p className="text-xs text-white/35 mb-4">Register composition by status</p>
              {vendorList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/35">
                  <Building2 className="w-8 h-8 mb-2" />
                  <p className="text-sm">No vendors yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statusChartData} layout="vertical" barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="status" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      formatter={(v: any) => [`${v} vendor${v === 1 ? "" : "s"}`, "Count"]} />
                    <Bar dataKey="count" barSize={16} radius={[0, 4, 4, 0]}>
                      {statusChartData.map((d) => <Cell key={d.status} fill={STATUS_BAR_COLOR[d.status]} />)}
                      <LabelList dataKey="count" position="right" fill="rgba(255,255,255,0.5)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-2">Financial Rating</h3>
              <p className="text-xs text-white/35 mb-4">Register composition, Poor → Excellent</p>
              {vendorList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/35">
                  <Building2 className="w-8 h-8 mb-2" />
                  <p className="text-sm">No vendors yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ratingChartData} layout="vertical" barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="rating" type="category" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      formatter={(v: any) => [`${v} vendor${v === 1 ? "" : "s"}`, "Count"]} />
                    <Bar dataKey="count" barSize={16} radius={[0, 4, 4, 0]}>
                      {ratingChartData.map((d) => <Cell key={d.rating} fill={RATING_BAR_COLOR[d.rating]} />)}
                      <LabelList dataKey="count" position="right" fill="rgba(255,255,255,0.5)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="glass-card p-6">
              <h3 className="font-semibold text-white text-[14px] mb-2">Safety Risk</h3>
              <p className="text-xs text-white/35 mb-4">Incidents vs. safety score, per vendor</p>
              {vendorList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/35">
                  <Building2 className="w-8 h-8 mb-2" />
                  <p className="text-sm">No vendors yet</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <ScatterChart margin={{ top: 8, right: 8, bottom: 12, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis type="number" dataKey="incidents" name="Incidents" allowDecimals={false}
                        domain={[0, maxIncidents]}
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false}
                        label={{ value: "Incidents", position: "insideBottom", offset: -4, fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
                      <YAxis type="number" dataKey="safety" name="Safety Score" domain={[0, 100]}
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                      <ReferenceLine y={80} stroke="rgba(16,185,129,0.45)" strokeDasharray="4 4"
                        label={{ value: "Safe ≥80", position: "insideTopRight", fill: "rgba(16,185,129,0.7)", fontSize: 10 }} />
                      <Tooltip content={<SafetyScatterTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }} />
                      <Scatter data={safetyScatterData} shape={<SafetyDot />} />
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-1 flex-wrap">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: "#10B981" }} /><span className="text-xs text-white/35">Low risk (≥80%)</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: "#F97316" }} /><span className="text-xs text-white/35">Medium (60–79%)</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: "#EF4444" }} /><span className="text-xs text-white/35">High risk (&lt;60%)</span></div>
                  </div>
                  {hasOverlappingSafetyPoints && (
                    <p className="text-xs text-white/25 mt-2">Some vendors share identical values and overlap into a single point.</p>
                  )}
                </>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* AI Score Form */}
      {activeTab === "score" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4" style={{ borderColor: ACCENT.cyan.border }}>
          <h3 className="font-semibold text-white">AI Vendor Scorer</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Vendor Name</label>
              <input placeholder="Company name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Vendor Type</label>
              <select value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                <option>Main Contractor</option>
                <option>Subcontractor</option>
                <option>Material Supplier</option>
                <option>MEP Contractor</option>
                <option>Consultant</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Years Experience</label>
              <input type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: parseInt(e.target.value) })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Completed Projects</label>
              <input type="number" value={form.completed_projects} onChange={(e) => setForm({ ...form, completed_projects: parseInt(e.target.value) })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">On-Time Delivery %</label>
              <input type="number" value={form.on_time_delivery_pct} onChange={(e) => setForm({ ...form, on_time_delivery_pct: parseFloat(e.target.value) })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Quality Score (0-100)</label>
              <input type="number" value={form.quality_score} onChange={(e) => setForm({ ...form, quality_score: parseFloat(e.target.value) })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Safety Incidents</label>
              <input type="number" value={form.safety_incidents} onChange={(e) => setForm({ ...form, safety_incidents: parseInt(e.target.value) })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Financial Rating</label>
              <select value={form.financial_rating} onChange={(e) => setForm({ ...form, financial_rating: e.target.value })} className={glassInputClass} style={glassInputStyle}>
                <option>Excellent</option>
                <option>Good</option>
                <option>Average</option>
                <option>Poor</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-white/35 mb-1.5 block">Past Issues (if any)</label>
              <textarea placeholder="Any past issues, disputes, delays..." value={form.past_issues} onChange={(e) => setForm({ ...form, past_issues: e.target.value })} rows={2} className={`${glassInputClass} resize-none`} style={glassInputStyle} />
            </div>
          </div>
          <button onClick={handleScore} disabled={loading} className={primaryBtn} style={gradientButtonStyle}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
            Score Vendor
          </button>
        </motion.div>
      )}

      {/* Compare Vendors */}
      {activeTab === "compare" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4" style={{ borderColor: ACCENT.cyan.border }}>
          <div>
            <h3 className="font-semibold text-white">AI Vendor Comparison</h3>
            <p className="text-xs text-white/35 mt-0.5">Select 2 or more vendors from the register to compare</p>
          </div>
          {vendorList.length === 0 ? (
            <p className="text-sm text-white/35">Add vendors to the register first.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {vendorList.map((vendor) => (
                <label key={vendor.id || vendor.name}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                  style={compareSelected.includes(vendor.name)
                    ? { borderColor: "rgba(0,212,255,0.4)", background: "rgba(0,212,255,0.05)" }
                    : { borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                  <input type="checkbox" checked={compareSelected.includes(vendor.name)} onChange={() => toggleCompare(vendor.name)} className="accent-cyan-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{vendor.name}</p>
                    <p className="text-xs text-white/35 truncate">{vendor.vendor_type} · Score {vendor.score ?? 0}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <button onClick={runCompare} disabled={compareLoading} className={primaryBtn} style={gradientButtonStyle}>
            {compareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            Compare Selected ({compareSelected.length})
          </button>
          {compareResult && (
            <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
              <MarkdownText text={compareResult} className="text-sm text-white/70 leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Vendor Report */}
      {activeTab === "report" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4" style={{ borderColor: ACCENT.cyan.border }}>
          <div>
            <h3 className="font-semibold text-white">AI Vendor Performance Report</h3>
            <p className="text-xs text-white/35 mt-0.5">Uses the vendor details from the AI Score Vendor tab — fill those in first</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Vendor Name</label>
              <input placeholder="Company name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} className={glassInputClass} style={glassInputStyle} />
            </div>
            <div>
              <label className="text-xs text-white/35 mb-1.5 block">Vendor Type</label>
              <input value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value })} className={glassInputClass} style={glassInputStyle} />
            </div>
          </div>
          <button onClick={runReport} disabled={reportLoading} className={primaryBtn} style={gradientButtonStyle}>
            {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate Report
          </button>
          {reportResult && (
            <>
              <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                <MarkdownText text={reportResult} className="text-sm text-white/70 leading-relaxed" />
              </div>
              <button onClick={handleDownloadReportPDF} className={ghostBtn} style={glassButtonStyle}>
                <Download className="w-4 h-4 text-cyan-400" />Download PDF
              </button>
            </>
          )}
        </motion.div>
      )}

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Vendor Analysis</h3>
          </div>
          <MarkdownText text={result} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Vendor Scoring"
        placeholder="Ask about vendors, scores, performance..."
        pageSummaryData={{
          totalVendors,
          preferred: preferredCount,
          underReview: underReviewCount,
          avgScore: avgScore != null ? `${avgScore}/100` : "—",
          vendors: vendorList,
        }}
      />
    </div>
  );
}
