"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Upload,
  Loader2,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const demandData = [
  { month: "Jul", cement: 450, steel: 280, lumber: 320 },
  { month: "Aug", cement: 480, steel: 310, lumber: 290 },
  { month: "Sep", cement: 420, steel: 350, lumber: 340 },
  { month: "Oct", cement: 510, steel: 290, lumber: 310 },
  { month: "Nov", cement: 460, steel: 320, lumber: 280 },
  { month: "Dec", cement: 490, steel: 300, lumber: 360 },
];

const suppliers = [
  { name: "Supplier A", rating: 92, deliveryRate: 95, priceIndex: 88, status: "Preferred" },
  { name: "Supplier B", rating: 78, deliveryRate: 82, priceIndex: 94, status: "Approved" },
  { name: "Supplier C", rating: 85, deliveryRate: 88, priceIndex: 76, status: "Approved" },
  { name: "Supplier D", rating: 65, deliveryRate: 70, priceIndex: 98, status: "Review" },
];

const poData = [
  { month: "Jan", delivered: 28, pending: 8, delayed: 3 },
  { month: "Feb", delivered: 32, pending: 6, delayed: 2 },
  { month: "Mar", delivered: 25, pending: 10, delayed: 5 },
  { month: "Apr", delivered: 38, pending: 4, delayed: 1 },
  { month: "May", delivered: 30, pending: 7, delayed: 3 },
  { month: "Jun", delivered: 42, pending: 3, delayed: 1 },
];

export default function ProcurementPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [poOpen, setPoOpen] = useState(false);
  const [po, setPo] = useState({
    supplier_name: "",
    project_name: "",
    delivery_date: "",
    payment_terms: "30 days",
    items: [],
    supplier_address: "",
    special_instructions: "",
  });
  const [poResult, setPoResult] = useState("");
  const [poLoading, setPoLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        "http://localhost:8000/api/v1/procurement/analyze",
        formData
      );
      setAnalysis(response.data.analysis);
      toast.success("Procurement data analyzed!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const generatePO = async () => {
    setPoLoading(true);
    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/procurement/purchase-order",
        { ...po, items: [{ name: "Material", quantity: 100, unit: "tons", price: 500 }] }
      );
      setPoResult(response.data.purchase_order);
      toast.success("Purchase order generated!");
    } catch {
      toast.error("Failed to generate PO");
    } finally {
      setPoLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Preferred": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "Approved": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default: return "bg-orange-500/10 text-orange-400 border-orange-500/20";
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
          <h1 className="text-3xl font-bold text-foreground">Procurement</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered procurement & supplier management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPoOpen(!poOpen)}>
            <Package className="w-4 h-4 mr-2 text-blue-400" />
            Generate PO
          </Button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <Button className="gradient-blue text-white border-0">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Data
            </Button>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active POs", value: "42", trend: "up", change: "+5", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Pending Delivery", value: "8", trend: "down", change: "-2", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Cost Savings", value: "$128K", trend: "up", change: "+12%", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Supplier Rating", value: "4.2/5", trend: "up", change: "+0.3", color: "border-purple-500/20 bg-purple-500/5" },
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
            <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
              {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {kpi.change}
            </div>
          </motion.div>
        ))}
      </div>

      {/* PO Form */}
      {poOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI Purchase Order Generator</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { placeholder: "Supplier name", key: "supplier_name" },
              { placeholder: "Project name", key: "project_name" },
              { placeholder: "Payment terms", key: "payment_terms" },
            ].map((f) => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={po[f.key as keyof typeof po] as string}
                onChange={(e) => setPo({ ...po, [f.key]: e.target.value })}
                className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ))}
            <input
              type="date"
              value={po.delivery_date}
              onChange={(e) => setPo({ ...po, delivery_date: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={generatePO} disabled={poLoading} className="gradient-blue text-white border-0">
            {poLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
            Generate PO
          </Button>
          {poResult && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{poResult}</p>
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
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Material Demand</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly forecast (tons)</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={demandData}>
              <defs>
                <linearGradient id="cement" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Area type="monotone" dataKey="cement" stroke="#3b82f6" fill="url(#cement)" strokeWidth={2} name="Cement" />
              <Area type="monotone" dataKey="steel" stroke="#f59e0b" fill="none" strokeWidth={2} name="Steel" />
              <Area type="monotone" dataKey="lumber" stroke="#10b981" fill="none" strokeWidth={2} name="Lumber" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Cement</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Steel</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Lumber</span></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">PO Status</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Delivered vs Pending vs Delayed</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={poData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="delivered" fill="#10b981" radius={[6, 6, 0, 0]} name="Delivered" />
              <Bar dataKey="pending" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Pending" />
              <Bar dataKey="delayed" fill="#ef4444" radius={[6, 6, 0, 0]} name="Delayed" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Delivered</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Pending</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Delayed</span></div>
          </div>
        </motion.div>
      </div>

      {/* Supplier List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Supplier Register</h3>
        <div className="space-y-3">
          {suppliers.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">Rating: <span className="text-foreground">{s.rating}%</span></span>
                  <span className="text-xs text-muted-foreground">Delivery: <span className="text-foreground">{s.deliveryRate}%</span></span>
                  <span className="text-xs text-muted-foreground">Price: <span className="text-foreground">{s.priceIndex}%</span></span>
                </div>
              </div>
              <div className="w-24">
                <div className="bg-secondary rounded-full h-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.rating}%` }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    className="h-1.5 rounded-full bg-blue-500"
                  />
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusBadge(s.status)}`}>
                {s.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Procurement"
        placeholder="Ask about suppliers, materials, orders..."
        pageSummaryData={{
          activePOs: 42,
          pendingDelivery: 8,
          costSavings: "$128K",
          suppliers,
          demandData,
        }}
      />
    </div>
  );
}