"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  Plus,
  X,
  Trash2,
  ChevronDown,
  Upload,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import GlassModal from "@/components/shared/GlassModal";
import Sparkline from "@/components/shared/Sparkline";
import { MarkdownText } from "@/lib/renderMarkdown";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";
import { ACCENT, glassInputClass, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import {
  INVOICE_STATUSES,
  type InvoiceStatus,
  STATUS_COLORS,
  STATUS_BADGE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/constants";

interface PaymentKpis {
  total_contract: number;
  total_received: number;
  total_pending: number;
  total_overdue: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  contractor: string;
  amount: number;
  due_date: string;
  status: InvoiceStatus;
  days_overdue: number;
  description?: string;
  project_id?: string | null;
}

type StatusFilter = "all" | InvoiceStatus;

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}


export default function PaymentsPage({ projectId: filterProjectId }: { projectId?: string } = {}) {
  const { triggerRefresh } = useDataRefreshStore();
  const [dataLoading, setDataLoading] = useState(true);
  const [kpis, setKpis] = useState<PaymentKpis | null>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const [reminderForm, setReminderForm] = useState({
    project_name: "",
    invoice_number: "",
    amount: 0,
    due_date: "",
    days_overdue: 0,
    contractor_name: "",
    client_name: "",
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    invoice_number: "",
    contractor: "",
    amount: "",
    due_date: "",
    status: "pending" as InvoiceStatus,
    description: "",
    project_id: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [extractedInvoices, setExtractedInvoices] = useState<any[]>([]);
  const [extractLoading, setExtractLoading]       = useState(false);
  const [addingExtracted, setAddingExtracted]     = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);

  const [cashflowForm, setCashflowForm] = useState({
    current_balance: 0,
    expected_payments: [{ description: "", amount: 0 }],
    planned_expenses: [{ description: "", amount: 0 }],
  });

  useEffect(() => { fetchPayments(); }, [filterProjectId]);

  // Only needed in the standalone page (embedded-as-tab callers already have a
  // project chosen by their parent) — used for the Add Invoice project picker
  // and for assigning a project to legacy invoices that were created without one.
  useEffect(() => {
    if (filterProjectId) return;
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`)
      .then((res) => setAllProjects(res.data.projects || []))
      .catch(() => setAllProjects([]));
  }, [filterProjectId]);

  const fetchPayments = async () => {
    setDataLoading(true);
    try {
      const url = filterProjectId
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices?project_id=${filterProjectId}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`;
      const res = await axios.get(url);
      const data = res.data;
      setKpis(data.kpis);
      setMonthlyData(data.monthly || []);
      setInvoices(data.invoices || []);
    } catch {
      toast.error("Failed to load payment data");
    } finally {
      setDataLoading(false);
    }
  };

  const handleAddInvoice = async () => {
    if (!addForm.invoice_number || !addForm.contractor || !addForm.amount || !addForm.due_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    // Without a project, this invoice would never show up on Cost & Budget,
    // Financial Budget, or Accounting — those pages only ever query by project_id.
    if (!filterProjectId && !addForm.project_id) {
      toast.error("Select a project first — otherwise this invoice won't show up in Cost & Budget or Financial Budget");
      return;
    }
    setAddLoading(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`, {
        ...addForm,
        amount: parseFloat(addForm.amount),
        project_id: filterProjectId || addForm.project_id,
      });
      toast.success("Invoice added successfully!");
      setShowAddModal(false);
      setAddForm({ invoice_number: "", contractor: "", amount: "", due_date: "", status: "pending", description: "", project_id: "" });
      fetchPayments();
      triggerRefresh("payments");
    } catch {
      toast.error("Failed to add invoice");
    } finally {
      setAddLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: InvoiceStatus) => {
    setUpdatingId(id);
    try {
      await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices/${id}`, { status });
      setInvoices((prev) => prev.map((inv) => inv.id === id ? { ...inv, status } : inv));
      toast.success(`Invoice marked as ${status}`);
      // Refresh KPIs after status change
      fetchPayments();
      triggerRefresh("payments");
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssignProject = async (id: string, projectId: string) => {
    setAssigningId(id);
    try {
      await axios.patch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices/${id}`, { project_id: projectId });
      toast.success("Invoice assigned to project");
      fetchPayments();
      triggerRefresh("payments");
    } catch {
      toast.error("Failed to assign project");
    } finally {
      setAssigningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices/${id}`);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invoice deleted");
      fetchPayments();
      triggerRefresh("payments");
    } catch {
      toast.error("Failed to delete invoice");
    } finally {
      setDeletingId(null);
    }
  };

  const paymentStatusData = kpis
    ? [
        { name: "Received", value: kpis.total_received, color: STATUS_COLORS.received },
        { name: "Pending",  value: kpis.total_pending,  color: STATUS_COLORS.pending  },
        { name: "Overdue",  value: kpis.total_overdue,  color: STATUS_COLORS.overdue  },
      ]
    : [];

  const cashflowData = monthlyData.map((m) => ({
    month:   m.month,
    inflow:  m.received,
    outflow: Number((m.pending + m.overdue).toFixed(1)),
  }));

  const handleAnalyze = async () => {
    if (!kpis) { toast.error("No payment data to analyze"); return; }
    setAiLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/analyze`,
        {
          project_name:         reminderForm.project_name || "All Projects",
          total_contract_value: kpis.total_contract,
          total_invoiced:       kpis.total_received + kpis.total_pending + kpis.total_overdue,
          total_received:       kpis.total_received,
          total_pending:        kpis.total_pending,
          total_overdue:        kpis.total_overdue,
          overdue_days:         invoices.find((i) => i.status === "overdue")?.days_overdue ?? 0,
        }
      );
      setResult(response.data.analysis);
      toast.success("Payment analysis complete!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setAiLoading(false);
    }
  };

  const handleReminder = async () => {
    setAiLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/reminder`,
        reminderForm
      );
      setResult(response.data.reminder);
      toast.success("Payment reminder generated!");
    } catch {
      toast.error("Failed to generate reminder");
    } finally {
      setAiLoading(false);
    }
  };

  const handleForecast = async () => {
    setAiLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/forecast`,
        {
          project_name: reminderForm.project_name || "All Projects",
          current_balance: cashflowForm.current_balance,
          expected_payments: cashflowForm.expected_payments.filter(p => p.description.trim()),
          planned_expenses: cashflowForm.planned_expenses.filter(p => p.description.trim()),
        }
      );
      setResult(response.data.forecast);
      toast.success("Cash flow forecast generated!");
    } catch {
      toast.error("Failed to generate forecast");
    } finally {
      setAiLoading(false);
    }
  };

  const addForecastRow = (field: "expected_payments" | "planned_expenses") => {
    setCashflowForm(p => ({ ...p, [field]: [...p[field], { description: "", amount: 0 }] }));
  };

  const updateForecastRow = (field: "expected_payments" | "planned_expenses", idx: number, key: "description" | "amount", value: string) => {
    setCashflowForm(p => ({
      ...p,
      [field]: p[field].map((row, i) => i === idx ? { ...row, [key]: key === "amount" ? parseFloat(value) || 0 : value } : row),
    }));
  };

  const removeForecastRow = (field: "expected_payments" | "planned_expenses", idx: number) => {
    setCashflowForm(p => ({ ...p, [field]: p[field].filter((_, i) => i !== idx) }));
  };

  const handleExtractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setExtractLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/extract-invoices`, fd);
      const found = res.data.extracted_invoices ?? [];
      setExtractedInvoices(found);
      toast.success(found.length > 0 ? `Found ${found.length} invoice(s) — review below.` : "No invoices found in document.");
    } catch { toast.error("Failed to extract invoices from file"); }
    finally { setExtractLoading(false); }
  };

  const addExtractedInvoice = async (inv: any, idx: number) => {
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`, {
        ...inv,
        ...(filterProjectId ? { project_id: filterProjectId } : {}),
      });
      setExtractedInvoices(prev => prev.filter((_, i) => i !== idx));
      toast.success(`Invoice ${inv.invoice_number} added`);
      fetchPayments();
      triggerRefresh("payments");
    } catch { toast.error(`Failed to add invoice`); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedInvoices = async () => {
    setAddingExtracted("all");
    let added = 0;
    for (const inv of extractedInvoices) {
      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`, {
          ...inv,
          ...(filterProjectId ? { project_id: filterProjectId } : {}),
        });
        added++;
      } catch { /* skip */ }
    }
    setExtractedInvoices([]);
    toast.success(`Added ${added} invoice(s)`);
    fetchPayments();
    if (added > 0) triggerRefresh("payments");
    setAddingExtracted(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "received": return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "pending":  return <Clock className="w-4 h-4 text-orange-400 shrink-0" />;
      default:         return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
    }
  };

  const getStatusBadge = (status: string) =>
    STATUS_BADGE[status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.overdue;

  const inputClass = glassInputClass + " bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]";

  const hasData = !!(kpis && kpis.total_contract > 0);

  const filterCounts = {
    all:      invoices.length,
    received: invoices.filter((i) => i.status === "received").length,
    pending:  invoices.filter((i) => i.status === "pending").length,
    overdue:  invoices.filter((i) => i.status === "overdue").length,
  };

  const filteredInvoices = statusFilter === "all"
    ? invoices
    : invoices.filter((i) => i.status === statusFilter);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Payment Tracker</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered payment monitoring &amp; cash flow management
            {filterProjectId && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: ACCENT.cyan.bg, border: `1px solid ${ACCENT.cyan.border}`, color: ACCENT.cyan.text }}>
                Filtered by project
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPayments}
            disabled={dataLoading}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-white/70 transition-all hover:scale-105"
            style={glassButtonStyle}
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105"
            style={glassButtonStyle}
          >
            <Plus className="w-4 h-4" />
            Add Invoice
          </button>
          <input ref={extractFileRef} type="file" className="hidden"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
            onChange={handleExtractUpload} />
          <button disabled={extractLoading}
            onClick={() => extractFileRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
            style={gradientButtonStyle}>
            {extractLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
          <button
            onClick={handleAnalyze}
            disabled={aiLoading || dataLoading || !hasData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}
          >
            {aiLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <DollarSign className="w-4 h-4" />}
            AI Analysis
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(kpis
          ? [
              {
                label: "Total Contract",
                value: fmtMoney(kpis.total_contract),
                trend: "up" as const,
                change: `${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}`,
                accent: ACCENT.cyan,
                trendData: monthlyData.map((m) => (m.received || 0) + (m.pending || 0) + (m.overdue || 0)), trendType: "area" as const,
                trendLabels: monthlyData.map((m) => m.month), trendFmt: (v: number) => `$${v.toFixed(1)}K`,
              },
              {
                label: "Received",
                value: fmtMoney(kpis.total_received),
                trend: "up" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_received / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                accent: ACCENT.green,
                trendData: monthlyData.map((m) => m.received), trendType: "bar" as const,
                trendLabels: monthlyData.map((m) => m.month), trendFmt: (v: number) => `$${v.toFixed(1)}K`,
              },
              {
                label: "Pending",
                value: fmtMoney(kpis.total_pending),
                trend: "down" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_pending / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                accent: ACCENT.amber,
                trendData: monthlyData.map((m) => m.pending), trendType: "bar" as const,
                trendLabels: monthlyData.map((m) => m.month), trendFmt: (v: number) => `$${v.toFixed(1)}K`,
              },
              {
                label: "Overdue",
                value: fmtMoney(kpis.total_overdue),
                trend: "down" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_overdue / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                accent: ACCENT.red,
                trendData: monthlyData.map((m) => m.overdue), trendType: "bar" as const,
                trendLabels: monthlyData.map((m) => m.month), trendFmt: (v: number) => `$${v.toFixed(1)}K`,
              },
            ]
          : [
              { label: "Total Contract", value: dataLoading ? "…" : "$0", trend: "up" as const,   change: "Loading…", accent: ACCENT.cyan, trendData: [] as number[], trendType: "area" as const, trendLabels: [] as string[], trendFmt: (v: number) => `$${v.toFixed(1)}K` },
              { label: "Received",       value: dataLoading ? "…" : "$0", trend: "up" as const,   change: "Loading…", accent: ACCENT.green, trendData: [] as number[], trendType: "bar" as const, trendLabels: [] as string[], trendFmt: (v: number) => `$${v.toFixed(1)}K` },
              { label: "Pending",        value: dataLoading ? "…" : "$0", trend: "down" as const, change: "Loading…", accent: ACCENT.amber, trendData: [] as number[], trendType: "bar" as const, trendLabels: [] as string[], trendFmt: (v: number) => `$${v.toFixed(1)}K` },
              { label: "Overdue",        value: dataLoading ? "…" : "$0", trend: "down" as const, change: "Loading…", accent: ACCENT.red, trendData: [] as number[], trendType: "bar" as const, trendLabels: [] as string[], trendFmt: (v: number) => `$${v.toFixed(1)}K` },
            ]
        ).map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className="glass-card p-5 group relative overflow-hidden"
            style={{ borderColor: kpi.accent.border }}
          >
            <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${kpi.accent.bg}, transparent 70%)` }} />
            <p className="relative text-[11px] text-white/35">{kpi.label}</p>
            <p className="relative text-2xl font-bold mt-1" style={{ color: kpi.accent.text }}>{kpi.value}</p>
            {kpi.change && (
              <div className={`relative flex items-center gap-1 mt-1 text-[11px] ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.trend === "up"
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
                {kpi.change}
              </div>
            )}
            {kpi.trendData.length >= 2 && (
              <div className="relative -mx-1 mt-2 opacity-70">
                <Sparkline data={kpi.trendData} color={kpi.accent.text} type={kpi.trendType} labels={kpi.trendLabels} valueFormatter={kpi.trendFmt} />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-0.5 p-1 rounded-xl w-fit"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {["overview", "reminder", "forecast"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setResult(""); }}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors capitalize"
            style={activeTab === tab
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
          >
            {tab === "reminder" ? "Payment Reminder" : tab === "forecast" ? "Cash Flow Forecast" : "Overview"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-2">Payment Status</h3>
              <p className="text-xs text-white/40 mb-4">Distribution by amount</p>
              {dataLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : !hasData ? (
                <div className="flex items-center justify-center h-48 text-white/40 text-sm">
                  No invoices yet — add invoices to see distribution
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {paymentStatusData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: any) => [fmtMoney(Number(value))]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 mt-2">
                    {paymentStatusData.map((item) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-white/40">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>

            {/* Cashflow Chart */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-2">Cash Flow</h3>
              <p className="text-xs text-white/40 mb-4">Received vs Pending+Overdue ($K)</p>
              {dataLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : !hasData ? (
                <div className="flex items-center justify-center h-48 text-white/40 text-sm">
                  No data — add invoices to see cash flow
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={cashflowData}>
                      <defs>
                        <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={STATUS_COLORS.received} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={STATUS_COLORS.received} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: any) => [`$${Number(v).toFixed(1)}K`]}
                      />
                      <Area type="monotone" dataKey="inflow"  stroke={STATUS_COLORS.received} fill="url(#inflow)" strokeWidth={2} name="Received" />
                      <Area type="monotone" dataKey="outflow" stroke={STATUS_COLORS.overdue}  fill="none"         strokeWidth={2} name="Pending+Overdue" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-white/40">Received</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-white/40">Pending + Overdue</span></div>
                  </div>
                </>
              )}
            </motion.div>
          </div>

          {/* Monthly Bar Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-white mb-2">Monthly Payment Status</h3>
            <p className="text-xs text-white/40 mb-4">Received vs Pending vs Overdue ($K) by due date</p>
            {dataLoading ? (
              <div className="flex items-center justify-center h-56">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : !hasData ? (
              <div className="flex items-center justify-center h-56 text-white/40 text-sm">
                No invoices — add invoices to see monthly breakdown
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ fill: "rgba(0,212,255,0.06)" }}
                      formatter={(v: any) => [`$${Number(v).toFixed(1)}K`]}
                    />
                    <Bar dataKey="received" fill={STATUS_COLORS.received} radius={[6, 6, 0, 0]} name="Received" />
                    <Bar dataKey="pending"  fill={STATUS_COLORS.pending}  radius={[6, 6, 0, 0]} name="Pending"  />
                    <Bar dataKey="overdue"  fill={STATUS_COLORS.overdue}  radius={[6, 6, 0, 0]} name="Overdue"  />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-white/40">Received</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-white/40">Pending</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-white/40">Overdue</span></div>
                </div>
              </>
            )}
          </motion.div>

          {/* Extracted Invoices Review Panel */}
          <AnimatePresence>
            {extractedInvoices.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="glass-card p-5" style={{ borderColor: ACCENT.green.border }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white text-[15px]">Extracted Invoices</h3>
                    <p className="text-[11px] text-white/35 mt-0.5">{extractedInvoices.length} invoice(s) found — select which to add</p>
                  </div>
                  <button
                    disabled={addingExtracted === "all"} onClick={addAllExtractedInvoices}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
                    style={gradientButtonStyle}>
                    {addingExtracted === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add All
                  </button>
                </div>
                <div className="space-y-2">
                  {extractedInvoices.map((inv: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {getStatusIcon(inv.status || "pending")}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {inv.contractor} <span className="text-white/40 font-normal">#{inv.invoice_number}</span>
                        </p>
                        <p className="text-[11px] text-white/35">
                          {fmtMoney(inv.amount || 0)}
                          {inv.due_date && ` · Due ${inv.due_date}`}
                          {inv.status && ` · ${inv.status}`}
                          {inv.description && ` · ${inv.description}`}
                        </p>
                      </div>
                      <button disabled={addingExtracted === String(idx)}
                        onClick={() => addExtractedInvoice(inv, idx)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 transition-colors"
                        style={glassButtonStyle}>
                        {addingExtracted === String(idx) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Invoice List with Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-[15px]">Invoices</h3>
              <span className="text-[11px] text-white/35">{filteredInvoices.length} shown</span>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(["all", "received", "pending", "overdue"] as StatusFilter[]).map((f) => {
                const accents: Record<StatusFilter, typeof ACCENT.cyan> = {
                  all: ACCENT.cyan, received: ACCENT.green, pending: ACCENT.amber, overdue: ACCENT.red,
                };
                const a = accents[f];
                const active = statusFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all capitalize"
                    style={active
                      ? { background: a.text, color: "#08131f" }
                      : { background: a.bg, border: `1px solid ${a.border}`, color: a.text }}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1.5 opacity-70">{filterCounts[f]}</span>
                  </button>
                );
              })}
            </div>

            {dataLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-white/30 text-[13px]">
                {invoices.length === 0
                  ? "No invoices found — invoices added to your database will appear here"
                  : `No ${statusFilter} invoices`}
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {filteredInvoices.map((payment, i) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3 p-4 rounded-xl transition-colors group"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.045)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
                    >
                      {getStatusIcon(payment.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{payment.contractor}</p>
                        <p className="text-[11px] text-white/35 truncate">
                          {payment.invoice_number} · Due {payment.due_date}
                          {payment.description && <> · {payment.description}</>}
                        </p>
                      </div>
                      {!filterProjectId && !payment.project_id && (
                        <div className="flex items-center gap-1.5" title="Not linked to a project — won't show up in Cost & Budget or Financial Budget">
                          <span className="text-[11px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Unassigned
                          </span>
                          <select
                            defaultValue=""
                            disabled={assigningId === payment.id}
                            onChange={(e) => { if (e.target.value) handleAssignProject(payment.id, e.target.value); }}
                            className="text-[11px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-lg px-1.5 py-1 text-white outline-none"
                          >
                            <option value="" disabled>Assign…</option>
                            {allProjects.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <p className="text-sm font-semibold text-white whitespace-nowrap">
                        {fmtMoney(payment.amount)}
                      </p>
                      {payment.days_overdue > 0 && (
                        <span className="text-[11px] text-red-400 whitespace-nowrap">{payment.days_overdue}d overdue</span>
                      )}
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${getStatusBadge(payment.status)}`}>
                        {payment.status}
                      </span>

                      {/* Inline Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {payment.status !== "received" && (
                          <button
                            onClick={() => handleUpdateStatus(payment.id, "received")}
                            disabled={updatingId === payment.id}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-medium flex items-center gap-1"
                            title="Mark as received"
                          >
                            {updatingId === payment.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <CheckCircle className="w-3 h-3" />}
                          </button>
                        )}
                        {payment.status === "pending" && (
                          <button
                            onClick={() => handleUpdateStatus(payment.id, "overdue")}
                            disabled={updatingId === payment.id}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Mark as overdue"
                          >
                            <AlertTriangle className="w-3 h-3" />
                          </button>
                        )}
                        {payment.status === "received" && (
                          <button
                            onClick={() => handleUpdateStatus(payment.id, "pending")}
                            disabled={updatingId === payment.id}
                            className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                            title="Mark as pending"
                          >
                            <Clock className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(payment.id)}
                          disabled={deletingId === payment.id}
                          className="p-1.5 rounded-lg text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                          title="Delete invoice"
                        >
                          {deletingId === payment.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Payment Reminder */}
      {activeTab === "reminder" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4"
        >
          <h3 className="font-semibold text-white text-[15px]">AI Payment Reminder Generator</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Project Name</label>
              <input
                placeholder="Project name"
                value={reminderForm.project_name}
                onChange={(e) => setReminderForm({ ...reminderForm, project_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Invoice Number</label>
              <input
                placeholder="e.g. INV-001"
                value={reminderForm.invoice_number}
                onChange={(e) => setReminderForm({ ...reminderForm, invoice_number: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Amount ($)</label>
              <input
                type="number"
                value={reminderForm.amount}
                onChange={(e) => setReminderForm({ ...reminderForm, amount: parseFloat(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Due Date</label>
              <input
                type="date"
                value={reminderForm.due_date}
                onChange={(e) => setReminderForm({ ...reminderForm, due_date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Days Overdue</label>
              <input
                type="number"
                value={reminderForm.days_overdue}
                onChange={(e) => setReminderForm({ ...reminderForm, days_overdue: parseInt(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Contractor Name</label>
              <input
                placeholder="Contractor"
                value={reminderForm.contractor_name}
                onChange={(e) => setReminderForm({ ...reminderForm, contractor_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Client Name</label>
              <input
                placeholder="Client"
                value={reminderForm.client_name}
                onChange={(e) => setReminderForm({ ...reminderForm, client_name: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <button
            onClick={handleReminder}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}
          >
            {aiLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <FileText className="w-4 h-4" />}
            Generate Reminder
          </button>
        </motion.div>
      )}

      {activeTab === "forecast" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4"
        >
          <h3 className="font-semibold text-white text-[15px]">AI 90-Day Cash Flow Forecast</h3>
          <div>
            <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">Current Balance ($)</label>
            <input
              type="number"
              value={cashflowForm.current_balance || ""}
              onChange={(e) => setCashflowForm({ ...cashflowForm, current_balance: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </div>

          {(["expected_payments", "planned_expenses"] as const).map((field) => (
            <div key={field}>
              <label className="text-[11px] text-white/35 mb-1.5 block tracking-wide uppercase">
                {field === "expected_payments" ? "Expected Payments (incoming)" : "Planned Expenses (outgoing)"}
              </label>
              <div className="space-y-2">
                {cashflowForm[field].map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      placeholder="Description"
                      value={row.description}
                      onChange={(e) => updateForecastRow(field, i, "description", e.target.value)}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={row.amount || ""}
                      onChange={(e) => updateForecastRow(field, i, "amount", e.target.value)}
                      className={`${inputClass} w-32`}
                    />
                    {cashflowForm[field].length > 1 && (
                      <button onClick={() => removeForecastRow(field, i)} className="text-white/40 hover:text-red-400 p-1 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => addForecastRow(field)} className="flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 mt-2">
                <Plus className="w-3.5 h-3.5" /> Add row
              </button>
            </div>
          ))}

          <button
            onClick={handleForecast}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}
          >
            {aiLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <TrendingUp className="w-4 h-4" />}
            Generate Forecast
          </button>
        </motion.div>
      )}

      {/* AI Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Analysis</h3>
          </div>
          <MarkdownText text={result} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      {/* Add Invoice Modal */}
      <GlassModal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Invoice">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Invoice # *</label>
                  <input
                    placeholder="INV-001"
                    value={addForm.invoice_number}
                    onChange={(e) => setAddForm({ ...addForm, invoice_number: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value as InvoiceStatus })}
                    className={inputClass}
                  >
                    {INVOICE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {!filterProjectId && (
                <div>
                  <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Project *</label>
                  <select
                    value={addForm.project_id}
                    onChange={(e) => setAddForm({ ...addForm, project_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select a project…</option>
                    {allProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-white/30 mt-1">Required — invoices without a project don&apos;t show up in Cost &amp; Budget or Financial Budget.</p>
                </div>
              )}
              <div>
                <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Contractor *</label>
                <input
                  placeholder="Contractor name"
                  value={addForm.contractor}
                  onChange={(e) => setAddForm({ ...addForm, contractor: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Amount ($) *</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Due Date *</label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-white/35 mb-1 block tracking-wide uppercase">Description</label>
                <input
                  placeholder="Optional description"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Cancel
              </button>
              <button onClick={handleAddInvoice} disabled={addLoading}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                style={gradientButtonStyle}>
                {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Invoice
              </button>
            </div>
      </GlassModal>

      <ModuleChat
        context="Payment Tracker"
        placeholder="Ask about payments, invoices, cash flow..."
        pageSummaryData={{
          totalContract:   kpis ? fmtMoney(kpis.total_contract) : "$0",
          received:        kpis ? fmtMoney(kpis.total_received) : "$0",
          pending:         kpis ? fmtMoney(kpis.total_pending)  : "$0",
          overdue:         kpis ? fmtMoney(kpis.total_overdue)  : "$0",
          invoiceCount:    invoices.length,
          overdueInvoices: invoices.filter((i) => i.status === "overdue").length,
        }}
      />
    </div>
  );
}
