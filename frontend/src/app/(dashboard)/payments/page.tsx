"use client";

import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
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
}

type StatusFilter = "all" | InvoiceStatus;

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}


export default function PaymentsPage() {
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
  });
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => { fetchPayments(); }, []);

  const fetchPayments = async () => {
    setDataLoading(true);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`
      );
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
    setAddLoading(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices`, {
        ...addForm,
        amount: parseFloat(addForm.amount),
      });
      toast.success("Invoice added successfully!");
      setShowAddModal(false);
      setAddForm({ invoice_number: "", contractor: "", amount: "", due_date: "", status: "pending", description: "" });
      fetchPayments();
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
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/invoices/${id}`);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invoice deleted");
      fetchPayments();
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "received": return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "pending":  return <Clock className="w-4 h-4 text-orange-400 shrink-0" />;
      default:         return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
    }
  };

  const getStatusBadge = (status: string) =>
    STATUS_BADGE[status as keyof typeof STATUS_BADGE] ?? STATUS_BADGE.overdue;

  const inputClass =
    "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

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
          <h1 className="text-3xl font-bold text-foreground">Payment Tracker</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered payment monitoring &amp; cash flow management
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={fetchPayments}
            variant="outline"
            size="icon"
            disabled={dataLoading}
            className="border-border"
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            variant="outline"
            className="border-border"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Invoice
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={aiLoading || dataLoading || !hasData}
            className="gradient-blue text-white border-0"
          >
            {aiLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <DollarSign className="w-4 h-4 mr-2" />}
            AI Analysis
          </Button>
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
                color: "border-blue-500/20 bg-blue-500/5",
              },
              {
                label: "Received",
                value: fmtMoney(kpis.total_received),
                trend: "up" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_received / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                color: "border-emerald-500/20 bg-emerald-500/5",
              },
              {
                label: "Pending",
                value: fmtMoney(kpis.total_pending),
                trend: "down" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_pending / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                color: "border-orange-500/20 bg-orange-500/5",
              },
              {
                label: "Overdue",
                value: fmtMoney(kpis.total_overdue),
                trend: "down" as const,
                change: kpis.total_contract > 0
                  ? `${((kpis.total_overdue / kpis.total_contract) * 100).toFixed(0)}% of total`
                  : "—",
                color: "border-red-500/20 bg-red-500/5",
              },
            ]
          : [
              { label: "Total Contract", value: dataLoading ? "…" : "$0", trend: "up" as const,   change: "Loading…", color: "border-blue-500/20 bg-blue-500/5"    },
              { label: "Received",       value: dataLoading ? "…" : "$0", trend: "up" as const,   change: "Loading…", color: "border-emerald-500/20 bg-emerald-500/5" },
              { label: "Pending",        value: dataLoading ? "…" : "$0", trend: "down" as const, change: "Loading…", color: "border-orange-500/20 bg-orange-500/5" },
              { label: "Overdue",        value: dataLoading ? "…" : "$0", trend: "down" as const, change: "Loading…", color: "border-red-500/20 bg-red-500/5"       },
            ]
        ).map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
            {kpi.change && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.trend === "up"
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
                {kpi.change}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2">
        {["overview", "reminder"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setResult(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-blue-500 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "reminder" ? "Payment Reminder" : "Overview"}
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
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Payment Status</h3>
              <p className="text-xs text-muted-foreground mb-4">Distribution by amount</p>
              {dataLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : !hasData ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
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
                        <span className="text-xs text-muted-foreground">{item.name}</span>
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
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Cash Flow</h3>
              <p className="text-xs text-muted-foreground mb-4">Received vs Pending+Overdue ($K)</p>
              {dataLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : !hasData ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: any) => [`$${Number(v).toFixed(1)}K`]}
                      />
                      <Area type="monotone" dataKey="inflow"  stroke={STATUS_COLORS.received} fill="url(#inflow)" strokeWidth={2} name="Received" />
                      <Area type="monotone" dataKey="outflow" stroke={STATUS_COLORS.overdue}  fill="none"         strokeWidth={2} name="Pending+Overdue" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Received</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Pending + Overdue</span></div>
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
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-2">Monthly Payment Status</h3>
            <p className="text-xs text-muted-foreground mb-4">Received vs Pending vs Overdue ($K) by due date</p>
            {dataLoading ? (
              <div className="flex items-center justify-center h-56">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : !hasData ? (
              <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
                No invoices — add invoices to see monthly breakdown
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(v: any) => [`$${Number(v).toFixed(1)}K`]}
                    />
                    <Bar dataKey="received" fill={STATUS_COLORS.received} radius={[6, 6, 0, 0]} name="Received" />
                    <Bar dataKey="pending"  fill={STATUS_COLORS.pending}  radius={[6, 6, 0, 0]} name="Pending"  />
                    <Bar dataKey="overdue"  fill={STATUS_COLORS.overdue}  radius={[6, 6, 0, 0]} name="Overdue"  />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Received</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Pending</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Overdue</span></div>
                </div>
              </>
            )}
          </motion.div>

          {/* Invoice List with Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Invoices</h3>
              <span className="text-xs text-muted-foreground">{filteredInvoices.length} shown</span>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(["all", "received", "pending", "overdue"] as StatusFilter[]).map((f) => {
                const colors: Record<StatusFilter, string> = {
                  all:      activeTab === f ? "bg-blue-500 text-white" : "bg-secondary text-muted-foreground",
                  received: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                  pending:  "bg-orange-500/10 text-orange-400 border border-orange-500/20",
                  overdue:  "bg-red-500/10 text-red-400 border border-red-500/20",
                };
                const active: Record<StatusFilter, string> = {
                  all:      "bg-blue-500 text-white",
                  received: "bg-emerald-500 text-white",
                  pending:  "bg-orange-500 text-white",
                  overdue:  "bg-red-500 text-white",
                };
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                      statusFilter === f ? active[f] : colors[f]
                    }`}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1.5 opacity-70">{filterCounts[f]}</span>
                  </button>
                );
              })}
            </div>

            {dataLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
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
                      className="flex items-center gap-3 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group"
                    >
                      {getStatusIcon(payment.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{payment.contractor}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {payment.invoice_number} · Due {payment.due_date}
                          {payment.description && <> · {payment.description}</>}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {fmtMoney(payment.amount)}
                      </p>
                      {payment.days_overdue > 0 && (
                        <span className="text-xs text-red-400 whitespace-nowrap">{payment.days_overdue}d overdue</span>
                      )}
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${getStatusBadge(payment.status)}`}>
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
                          className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-foreground">AI Payment Reminder Generator</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Project Name</label>
              <input
                placeholder="Project name"
                value={reminderForm.project_name}
                onChange={(e) => setReminderForm({ ...reminderForm, project_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Invoice Number</label>
              <input
                placeholder="e.g. INV-001"
                value={reminderForm.invoice_number}
                onChange={(e) => setReminderForm({ ...reminderForm, invoice_number: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Amount ($)</label>
              <input
                type="number"
                value={reminderForm.amount}
                onChange={(e) => setReminderForm({ ...reminderForm, amount: parseFloat(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Due Date</label>
              <input
                type="date"
                value={reminderForm.due_date}
                onChange={(e) => setReminderForm({ ...reminderForm, due_date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Days Overdue</label>
              <input
                type="number"
                value={reminderForm.days_overdue}
                onChange={(e) => setReminderForm({ ...reminderForm, days_overdue: parseInt(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Contractor Name</label>
              <input
                placeholder="Contractor"
                value={reminderForm.contractor_name}
                onChange={(e) => setReminderForm({ ...reminderForm, contractor_name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Client Name</label>
              <input
                placeholder="Client"
                value={reminderForm.client_name}
                onChange={(e) => setReminderForm({ ...reminderForm, client_name: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <Button
            onClick={handleReminder}
            disabled={aiLoading}
            className="gradient-blue text-white border-0"
          >
            {aiLoading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <FileText className="w-4 h-4 mr-2" />}
            Generate Reminder
          </Button>
        </motion.div>
      )}

      {/* AI Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{result}</p>
        </motion.div>
      )}

      {/* Add Invoice Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-lg">Add Invoice</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Invoice # *</label>
                  <input
                    placeholder="INV-001"
                    value={addForm.invoice_number}
                    onChange={(e) => setAddForm({ ...addForm, invoice_number: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Status</label>
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Contractor *</label>
                <input
                  placeholder="Contractor name"
                  value={addForm.contractor}
                  onChange={(e) => setAddForm({ ...addForm, contractor: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Amount ($) *</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Due Date *</label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <input
                  placeholder="Optional description"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="flex-1 border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddInvoice}
                disabled={addLoading}
                className="flex-1 gradient-blue text-white border-0"
              >
                {addLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Invoice
              </Button>
            </div>
          </motion.div>
        </div>
      )}

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
