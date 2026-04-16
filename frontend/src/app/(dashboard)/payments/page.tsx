"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
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

const paymentStatusData = [
  { name: "Received", value: 18200000, color: "#10b981" },
  { name: "Pending", value: 4800000, color: "#f59e0b" },
  { name: "Overdue", value: 1500000, color: "#ef4444" },
];

const monthlyData = [
  { month: "Jan", received: 2800, pending: 800, overdue: 200 },
  { month: "Feb", received: 3200, pending: 600, overdue: 400 },
  { month: "Mar", received: 2500, pending: 1000, overdue: 300 },
  { month: "Apr", received: 3800, pending: 500, overdue: 100 },
  { month: "May", received: 3000, pending: 700, overdue: 250 },
  { month: "Jun", received: 4200, pending: 400, overdue: 150 },
];

const cashflowData = [
  { month: "Jul", inflow: 3500, outflow: 2800 },
  { month: "Aug", inflow: 4000, outflow: 3200 },
  { month: "Sep", inflow: 3200, outflow: 2900 },
  { month: "Oct", inflow: 4500, outflow: 3500 },
  { month: "Nov", inflow: 3800, outflow: 3100 },
  { month: "Dec", inflow: 5000, outflow: 3800 },
];

const recentPayments = [
  { invoice: "INV-001", contractor: "BuildCo Ltd", amount: 850000, due: "2024-06-15", status: "received", daysOverdue: 0 },
  { invoice: "INV-002", contractor: "SteelMart Inc", amount: 320000, due: "2024-06-20", status: "pending", daysOverdue: 0 },
  { invoice: "INV-003", contractor: "ElectroPro", amount: 180000, due: "2024-05-30", status: "overdue", daysOverdue: 25 },
  { invoice: "INV-004", contractor: "ConcretePlus", amount: 450000, due: "2024-06-25", status: "pending", daysOverdue: 0 },
  { invoice: "INV-005", contractor: "QuickBuild", amount: 95000, due: "2024-05-15", status: "overdue", daysOverdue: 40 },
];

export default function PaymentsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [reminderForm, setReminderForm] = useState({
    project_name: "CivilAI Tower",
    invoice_number: "",
    amount: 0,
    due_date: "",
    days_overdue: 0,
    contractor_name: "",
    client_name: "",
  });

  const handleAnalyze = async () => {
    setLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/payments/analyze",
        {
          project_name: "CivilAI Tower",
          total_contract_value: 24500000,
          total_invoiced: 20000000,
          total_received: 18200000,
          total_pending: 4800000,
          total_overdue: 1500000,
          overdue_days: 30,
        }
      );
      setResult(response.data.analysis);
      toast.success("Payment analysis complete!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const handleReminder = async () => {
    setLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/payments/reminder",
        reminderForm
      );
      setResult(response.data.reminder);
      toast.success("Payment reminder generated!");
    } catch {
      toast.error("Failed to generate reminder");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "received": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "pending": return <Clock className="w-4 h-4 text-orange-400" />;
      default: return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received": return "bg-emerald-500/10 text-emerald-400";
      case "pending": return "bg-orange-500/10 text-orange-400";
      default: return "bg-red-500/10 text-red-400";
    }
  };

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

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
            AI-powered payment monitoring & cash flow management
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={loading}
          className="gradient-blue text-white border-0"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
          AI Analysis
        </Button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Contract", value: "$24.5M", trend: "up", change: "", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Received", value: "$18.2M", trend: "up", change: "74%", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Pending", value: "$4.8M", trend: "down", change: "20%", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Overdue", value: "$1.5M", trend: "down", change: "6%", color: "border-red-500/20 bg-red-500/5" },
        ].map((kpi, i) => (
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
                {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.change} of total
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
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
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Payment Status</h3>
              <p className="text-xs text-muted-foreground mb-4">Distribution ($M)</p>
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
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }}
                    formatter={(value: any) => [`$${(value / 1000000).toFixed(1)}M`]}
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Cash Flow Forecast</h3>
              <p className="text-xs text-muted-foreground mb-4">Inflow vs Outflow ($K)</p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={cashflowData}>
                  <defs>
                    <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="inflow" stroke="#10b981" fill="url(#inflow)" strokeWidth={2} name="Inflow" />
                  <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="none" strokeWidth={2} name="Outflow" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Inflow</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Outflow</span></div>
              </div>
            </motion.div>
          </div>

          {/* Monthly Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-2">Monthly Payment Status</h3>
            <p className="text-xs text-muted-foreground mb-4">Received vs Pending vs Overdue ($K)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                <Bar dataKey="received" fill="#10b981" radius={[6, 6, 0, 0]} name="Received" />
                <Bar dataKey="pending" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Pending" />
                <Bar dataKey="overdue" fill="#ef4444" radius={[6, 6, 0, 0]} name="Overdue" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Received</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Pending</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Overdue</span></div>
            </div>
          </motion.div>

          {/* Recent Payments */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Recent Invoices</h3>
            <div className="space-y-2">
              {recentPayments.map((payment, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
                >
                  {getStatusIcon(payment.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{payment.contractor}</p>
                    <p className="text-xs text-muted-foreground">{payment.invoice} · Due: {payment.due}</p>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    ${(payment.amount / 1000).toFixed(0)}K
                  </p>
                  {payment.daysOverdue > 0 && (
                    <span className="text-xs text-red-400">{payment.daysOverdue}d overdue</span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusBadge(payment.status)}`}>
                    {payment.status}
                  </span>
                </motion.div>
              ))}
            </div>
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
              <input placeholder="Project name" value={reminderForm.project_name} onChange={(e) => setReminderForm({ ...reminderForm, project_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Invoice Number</label>
              <input placeholder="e.g. INV-001" value={reminderForm.invoice_number} onChange={(e) => setReminderForm({ ...reminderForm, invoice_number: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Amount ($)</label>
              <input type="number" value={reminderForm.amount} onChange={(e) => setReminderForm({ ...reminderForm, amount: parseFloat(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Due Date</label>
              <input type="date" value={reminderForm.due_date} onChange={(e) => setReminderForm({ ...reminderForm, due_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Days Overdue</label>
              <input type="number" value={reminderForm.days_overdue} onChange={(e) => setReminderForm({ ...reminderForm, days_overdue: parseInt(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Contractor Name</label>
              <input placeholder="Contractor" value={reminderForm.contractor_name} onChange={(e) => setReminderForm({ ...reminderForm, contractor_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Client Name</label>
              <input placeholder="Client" value={reminderForm.client_name} onChange={(e) => setReminderForm({ ...reminderForm, client_name: e.target.value })} className={inputClass} />
            </div>
          </div>
          <Button onClick={handleReminder} disabled={loading} className="gradient-blue text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate Reminder
          </Button>
        </motion.div>
      )}

      {/* Result */}
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

      <ModuleChat
        context="Payment Tracker"
        placeholder="Ask about payments, invoices, cash flow..."
        pageSummaryData={{
          totalContract: "$24.5M",
          received: "$18.2M",
          pending: "$4.8M",
          overdue: "$1.5M",
          recentPayments,
        }}
      />
    </div>
  );
}