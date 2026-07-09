"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Upload,
  Loader2,
  TrendingUp,
  TrendingDown,
  Package,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Scale,
  CalendarClock,
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
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import Sparkline from "@/components/shared/Sparkline";
import { MarkdownText } from "@/lib/renderMarkdown";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";
import { useDataRefreshStore } from "@/lib/stores/dataRefreshStore";

type PoItem = { name: string; quantity: number; unit: string; price: number };

const PROJECT_TABS = [
  { href: "/cost",        label: "Cost & Budget" },
  { href: "/financials",  label: "Financial Budget" },
  { href: "/procurement", label: "Procurement" },
];

// Buckets a persisted purchase_orders row by its real `status` string and, when a row is
// still open past its planned delivery_date, treats it as delayed rather than trusting a
// status value that was never updated — the table has no fixed status enum.
function classifyPO(po: any): "delivered" | "pending" | "delayed" {
  const status = String(po.status || "").toLowerCase();
  if (/delivered|received|complete|closed/.test(status)) return "delivered";
  if (/delay|overdue|late|cancel/.test(status)) return "delayed";
  if (po.delivery_date && new Date(po.delivery_date) < new Date()) return "delayed";
  return "pending";
}

function lastNMonths(n: number): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en", { month: "short" }) });
  }
  return months;
}

function buildPoStatusChart(orders: any[]) {
  const months = lastNMonths(6);
  const buckets: Record<string, { delivered: number; pending: number; delayed: number }> = {};
  months.forEach((m) => { buckets[m.key] = { delivered: 0, pending: 0, delayed: 0 }; });
  orders.forEach((po) => {
    const raw = po.order_date || po.created_at;
    if (!raw) return;
    const d = new Date(raw);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!buckets[key]) return;
    buckets[key][classifyPO(po)] += 1;
  });
  return months.map((m) => ({ month: m.label, ...buckets[m.key] }));
}

function buildMaterialDemandChart(orders: any[]) {
  const totals: Record<string, number> = {};
  orders.forEach((po) => {
    const mat = String(po.material || "").trim();
    if (!mat) return;
    totals[mat] = (totals[mat] || 0) + Number(po.quantity || 0);
  });
  const topMaterials = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
  if (topMaterials.length === 0) return { data: [] as any[], materials: [] as string[] };

  const months = lastNMonths(6);
  const buckets: Record<string, Record<string, number>> = {};
  months.forEach((m) => { buckets[m.key] = Object.fromEntries(topMaterials.map((mat) => [mat, 0])); });
  orders.forEach((po) => {
    const mat = String(po.material || "").trim();
    if (!topMaterials.includes(mat)) return;
    const raw = po.order_date || po.created_at;
    if (!raw) return;
    const d = new Date(raw);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!buckets[key]) return;
    buckets[key][mat] += Number(po.quantity || 0);
  });
  return { data: months.map((m) => ({ month: m.label, ...buckets[m.key] })), materials: topMaterials };
}

interface SupplierAgg {
  name: string;
  orders: number;
  totalSpend: number;
  delivered: number;
  pending: number;
  delayed: number;
  onTimeRate: number;
  standing: "Preferred" | "Approved" | "Needs Review";
}

function buildSupplierRegister(orders: any[]): SupplierAgg[] {
  const bySupplier: Record<string, { orders: number; totalSpend: number; delivered: number; pending: number; delayed: number }> = {};
  orders.forEach((po) => {
    const name = String(po.supplier_name || "Unknown Supplier").trim() || "Unknown Supplier";
    if (!bySupplier[name]) bySupplier[name] = { orders: 0, totalSpend: 0, delivered: 0, pending: 0, delayed: 0 };
    bySupplier[name].orders += 1;
    bySupplier[name].totalSpend += Number(po.total_amount || 0);
    bySupplier[name][classifyPO(po)] += 1;
  });
  return Object.entries(bySupplier)
    .map(([name, s]) => {
      const onTimeRate = s.orders > 0 ? Math.round((s.delivered / s.orders) * 100) : 0;
      const standing: SupplierAgg["standing"] =
        s.delayed > 0 && onTimeRate < 50 ? "Needs Review" : onTimeRate >= 80 ? "Preferred" : "Approved";
      return { name, ...s, onTimeRate, standing };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

function fmtMoney(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function ProcurementPage() {
  const { triggerRefresh } = useDataRefreshStore();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const [poOpen, setPoOpen] = useState(false);
  const [po, setPo] = useState({
    project_id: "",
    supplier_name: "",
    project_name: "",
    delivery_date: "",
    payment_terms: "30 days",
    supplier_address: "",
    special_instructions: "",
  });
  const [items, setItems] = useState<PoItem[]>([
    { name: "Material", quantity: 100, unit: "tons", price: 500 },
  ]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<PoItem>({ name: "", quantity: 0, unit: "", price: 0 });
  const [newItem, setNewItem] = useState<PoItem>({ name: "", quantity: 0, unit: "", price: 0 });
  const [addingItem, setAddingItem] = useState(false);
  const [poResult, setPoResult] = useState("");
  const [poLoading, setPoLoading] = useState(false);

  // Compare Suppliers
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [compareRequirements, setCompareRequirements] = useState({ budget_priority: "medium", quality_priority: "high", delivery_priority: "medium" });
  const [compareResult, setCompareResult] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);

  // Demand Forecast
  const [demandOpen, setDemandOpen] = useState(false);
  const [demandForm, setDemandForm] = useState({
    project_name: "", project_type: "", total_area: 0,
    start_date: "", end_date: "", key_materials: "",
  });
  const [demandResult, setDemandResult] = useState("");
  const [demandLoading, setDemandLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchPurchaseOrders();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const list = (res.data.projects || []).map((p: any) => ({ id: p.id, name: p.name }));
      setProjects(list);
      if (list.length > 0) setPo((prev) => ({ ...prev, project_id: prev.project_id || list[0].id }));
    } catch (err) { console.error("Failed to fetch projects", err); }
  };

  const fetchPurchaseOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/purchase-orders`);
      setPurchaseOrders(res.data.purchase_orders || []);
    } catch (err) {
      console.error("Failed to fetch purchase orders", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const poStatusChart = buildPoStatusChart(purchaseOrders);
  const materialDemand = buildMaterialDemandChart(purchaseOrders);
  const supplierRegister = buildSupplierRegister(purchaseOrders);
  const activePOs = purchaseOrders.filter((p) => classifyPO(p) !== "delivered").length;
  const pendingDelivery = purchaseOrders.filter((p) => classifyPO(p) === "pending").length;
  const totalPoValue = purchaseOrders.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const activeSuppliers = supplierRegister.length;

  const MATERIAL_COLORS = ["#3b82f6", "#f59e0b", "#10b981"];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/analyze`,
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
    if (!po.project_id) { toast.error("Select a project first"); return; }
    setPoLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/purchase-order`,
        { ...po, items }
      );
      setPoResult(response.data.purchase_order);
      toast.success("Purchase order generated!");

      // Persist each line item as a real purchase_orders row so this module's own
      // charts/KPIs/supplier register reflect the PO it just created, instead of
      // the AI text output vanishing once the panel closes.
      try {
        await Promise.all(items.map((item) =>
          axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/purchase-orders`, {
            project_id: po.project_id,
            supplier_name: po.supplier_name || "Unspecified Supplier",
            material: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_amount: item.quantity * item.price,
            delivery_date: po.delivery_date || null,
            status: "pending",
          })
        ));
        await fetchPurchaseOrders();
        triggerRefresh("procurement");
      } catch (persistErr) {
        console.error("Failed to save purchase order line items", persistErr);
        toast.error("PO generated, but saving it to your records failed");
      }
    } catch {
      toast.error("Failed to generate PO");
    } finally {
      setPoLoading(false);
    }
  };

  const toggleSupplier = (name: string) => {
    setSelectedSuppliers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const runCompareSuppliers = async () => {
    if (selectedSuppliers.length < 2) { toast.error("Select at least 2 suppliers to compare"); return; }
    setCompareLoading(true);
    setCompareResult("");
    try {
      const selected = supplierRegister.filter((s) => selectedSuppliers.includes(s.name));
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/compare-suppliers`,
        { suppliers: selected, requirements: compareRequirements }
      );
      setCompareResult(response.data.comparison);
      toast.success("Supplier comparison ready!");
    } catch {
      toast.error("Failed to compare suppliers");
    } finally {
      setCompareLoading(false);
    }
  };

  const runDemandForecast = async () => {
    if (!demandForm.project_name || !demandForm.project_type) {
      toast.error("Project name and type are required");
      return;
    }
    setDemandLoading(true);
    setDemandResult("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/procurement/demand-forecast`,
        {
          ...demandForm,
          key_materials: demandForm.key_materials.split(",").map((s) => s.trim()).filter(Boolean),
        }
      );
      setDemandResult(response.data.forecast);
      toast.success("Material demand forecast ready!");
    } catch {
      toast.error("Failed to forecast demand");
    } finally {
      setDemandLoading(false);
    }
  };

  const startEdit = (i: number) => { setEditingIdx(i); setEditItem({ ...items[i] }); };
  const saveEdit = () => {
    if (editingIdx === null) return;
    setItems(items.map((item, i) => (i === editingIdx ? editItem : item)));
    setEditingIdx(null);
  };
  const deleteItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const addItem = () => {
    if (!newItem.name.trim()) return;
    setItems([...items, { ...newItem }]);
    setNewItem({ name: "", quantity: 0, unit: "", price: 0 });
    setAddingItem(false);
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
      <ModuleTabs tabs={PROJECT_TABS} />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Procurement</h1>
          <p className="text-white/35 text-[13px] mt-1">
            AI-powered procurement & supplier management
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPoOpen(!poOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105"
            style={glassButtonStyle}>
            <Package className="w-4 h-4 text-cyan-400" />
            Generate PO
          </button>
          <button onClick={() => setCompareOpen(!compareOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105"
            style={glassButtonStyle}>
            <Scale className="w-4 h-4 text-cyan-400" />
            Compare Suppliers
          </button>
          <button onClick={() => setDemandOpen(!demandOpen)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 transition-all hover:scale-105"
            style={glassButtonStyle}>
            <CalendarClock className="w-4 h-4 text-emerald-400" />
            Demand Forecast
          </button>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".pdf,.xlsx,.docx" onChange={handleFileUpload} />
            <span
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
              style={gradientButtonStyle}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Data
            </span>
          </label>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active POs", value: String(activePOs), accent: ACCENT.blue, trendData: poStatusChart.map((d) => d.delivered + d.pending + d.delayed), trendType: "bar" as const, trendLabels: poStatusChart.map((d) => d.month), trendFmt: (v: number) => `${Math.round(v)} POs` },
          { label: "Pending Delivery", value: String(pendingDelivery), accent: ACCENT.amber, trendData: poStatusChart.map((d) => d.pending), trendType: "bar" as const, trendLabels: poStatusChart.map((d) => d.month), trendFmt: (v: number) => `${Math.round(v)} pending` },
          { label: "Total PO Value", value: fmtMoney(totalPoValue), accent: ACCENT.green, trendData: poStatusChart.map((d) => d.delivered), trendType: "area" as const, trendLabels: poStatusChart.map((d) => d.month), trendFmt: (v: number) => `${Math.round(v)} delivered` },
          { label: "Active Suppliers", value: String(activeSuppliers), accent: ACCENT.cyan, trendData: supplierRegister.slice(0, 6).map((s) => s.onTimeRate), trendType: "bar" as const, trendLabels: supplierRegister.slice(0, 6).map((s) => s.name), trendFmt: (v: number) => `${v}% on-time` },
        ].map((kpi, i) => (
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
            <p className="relative text-2xl font-bold mt-1" style={{ color: kpi.accent.text }}>
              {ordersLoading ? "—" : kpi.value}
            </p>
            {kpi.trendData.length >= 2 && (
              <div className="relative -mx-1 mt-2 opacity-70">
                <Sparkline data={kpi.trendData} color={kpi.accent.text} type={kpi.trendType} labels={kpi.trendLabels} valueFormatter={kpi.trendFmt} />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* PO Form */}
      {poOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}
        >
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Purchase Order Generator</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <select
              value={po.project_id}
              onChange={(e) => setPo({ ...po, project_id: e.target.value })}
              className={glassInputClass} style={glassInputStyle}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {[
              { placeholder: "Supplier name", key: "supplier_name" },
              { placeholder: "Project name (for the PO document)", key: "project_name" },
              { placeholder: "Payment terms", key: "payment_terms" },
            ].map((f) => (
              <input
                key={f.key}
                placeholder={f.placeholder}
                value={po[f.key as keyof typeof po] as string}
                onChange={(e) => setPo({ ...po, [f.key]: e.target.value })}
                className={glassInputClass} style={glassInputStyle}
              />
            ))}
            <input
              type="date"
              value={po.delivery_date}
              onChange={(e) => setPo({ ...po, delivery_date: e.target.value })}
              className={glassInputClass} style={glassInputStyle}
            />
          </div>

          {/* Line Items */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-white">Line Items</p>
              <button onClick={() => setAddingItem(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-white/70 transition-colors"
                style={glassButtonStyle}>
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[rgba(255,255,255,0.06)]">
                  <tr>
                    {["Item", "Qty", "Unit", "Unit Price ($)", ""].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-white/40 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) =>
                    editingIdx === i ? (
                      <tr key={i} className="border-t border-[rgba(255,255,255,0.07)] bg-blue-500/5">
                        {(["name", "quantity", "unit", "price"] as const).map((field) => (
                          <td key={field} className="px-2 py-1.5">
                            <input
                              type={field === "quantity" || field === "price" ? "number" : "text"}
                              value={editItem[field]}
                              onChange={(e) =>
                                setEditItem({ ...editItem, [field]: field === "quantity" || field === "price" ? +e.target.value : e.target.value })
                              }
                              className="w-full px-2 py-1 bg-[rgba(255,255,255,0.05)] border border-blue-500/50 rounded-lg text-white focus:outline-none"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1.5">
                          <div className="flex gap-1">
                            <button onClick={saveEdit} className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingIdx(null)} className="p-1 rounded-lg hover:bg-red-500/20 text-red-400"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-t border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
                        <td className="px-3 py-2 text-white">{item.name}</td>
                        <td className="px-3 py-2 text-white">{item.quantity}</td>
                        <td className="px-3 py-2 text-white">{item.unit}</td>
                        <td className="px-3 py-2 text-white">${item.price.toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(i)} className="p-1 rounded-lg hover:bg-blue-500/20 text-blue-400"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteItem(i)} className="p-1 rounded-lg hover:bg-red-500/20 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  {addingItem && (
                    <tr className="border-t border-[rgba(255,255,255,0.07)] bg-emerald-500/5">
                      {(["name", "quantity", "unit", "price"] as const).map((field) => (
                        <td key={field} className="px-2 py-1.5">
                          <input
                            type={field === "quantity" || field === "price" ? "number" : "text"}
                            placeholder={field}
                            value={newItem[field]}
                            onChange={(e) =>
                              setNewItem({ ...newItem, [field]: field === "quantity" || field === "price" ? +e.target.value : e.target.value })
                            }
                            className="w-full px-2 py-1 bg-[rgba(255,255,255,0.05)] border border-emerald-500/50 rounded-lg text-white placeholder:text-white/40 focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={addItem} className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setAddingItem(false)} className="p-1 rounded-lg hover:bg-red-500/20 text-red-400"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={generatePO} disabled={poLoading || items.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}>
            {poLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Generate PO
          </button>
          <p className="text-[11px] text-white/30 mt-2">Generating also saves these line items to your purchase-order records below.</p>
          {poResult && (
            <div className="mt-4 p-4 bg-[rgba(255,255,255,0.05)] rounded-xl">
              <MarkdownText text={poResult} className="text-sm text-white leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Compare Suppliers */}
      {compareOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}>
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Supplier Comparison</h3>
          <p className="text-xs text-white/40 mb-3">Select 2 or more suppliers from your register to compare</p>
          {supplierRegister.length === 0 ? (
            <p className="text-xs text-white/30 mb-4">No suppliers yet — generate a purchase order first to build your supplier register.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-4">
              {supplierRegister.map((s) => (
                <button key={s.name} onClick={() => toggleSupplier(s.name)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    selectedSuppliers.includes(s.name)
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                      : "bg-[rgba(255,255,255,0.05)] text-white/40 border-[rgba(255,255,255,0.07)] hover:text-white"
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {(["budget_priority", "quality_priority", "delivery_priority"] as const).map((key) => (
              <div key={key}>
                <label className="text-xs text-white/40 mb-1.5 block capitalize">{key.replace("_", " ")}</label>
                <select value={compareRequirements[key]}
                  onChange={(e) => setCompareRequirements({ ...compareRequirements, [key]: e.target.value })}
                  className="w-full px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            ))}
          </div>
          <button onClick={runCompareSuppliers} disabled={compareLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={gradientButtonStyle}>
            {compareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            Compare Selected Suppliers
          </button>
          {compareResult && (
            <div className="mt-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
              <MarkdownText text={compareResult} className="text-sm text-white leading-relaxed" />
            </div>
          )}
        </motion.div>
      )}

      {/* Demand Forecast */}
      {demandOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.green.border }}>
          <h3 className="font-semibold text-white text-[15px] mb-4">AI Material Demand Forecast</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input placeholder="Project name" value={demandForm.project_name}
              onChange={(e) => setDemandForm({ ...demandForm, project_name: e.target.value })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input placeholder="Project type (e.g. Commercial)" value={demandForm.project_type}
              onChange={(e) => setDemandForm({ ...demandForm, project_type: e.target.value })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="number" placeholder="Total area (sqm)" value={demandForm.total_area || ""}
              onChange={(e) => setDemandForm({ ...demandForm, total_area: parseFloat(e.target.value) || 0 })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input placeholder="Key materials (comma-separated)" value={demandForm.key_materials}
              onChange={(e) => setDemandForm({ ...demandForm, key_materials: e.target.value })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="date" value={demandForm.start_date}
              onChange={(e) => setDemandForm({ ...demandForm, start_date: e.target.value })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="date" value={demandForm.end_date}
              onChange={(e) => setDemandForm({ ...demandForm, end_date: e.target.value })}
              className="px-3 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.07)] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={runDemandForecast} disabled={demandLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,95,70,0.2))", border: "1px solid rgba(16,185,129,0.35)" }}>
            {demandLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Forecast Demand
          </button>
          {demandResult && (
            <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <MarkdownText text={demandResult} className="text-sm text-white leading-relaxed" />
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white text-[14px]">Material Demand</h3>
              <p className="text-[11px] text-white/35 mt-0.5">Monthly quantity ordered, by material</p>
            </div>
          </div>
          {materialDemand.materials.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-16">No purchase orders with a material yet — generate a PO to see real demand trends here.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={materialDemand.data}>
                  <defs>
                    {materialDemand.materials.map((mat, i) => (
                      <linearGradient key={mat} id={`material-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={MATERIAL_COLORS[i]} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={MATERIAL_COLORS[i]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  {materialDemand.materials.map((mat, i) => (
                    <Area key={mat} type="monotone" dataKey={mat} stroke={MATERIAL_COLORS[i]} fill={`url(#material-${i})`} strokeWidth={2} name={mat} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-5 mt-3">
                {materialDemand.materials.map((mat, i) => (
                  <div key={mat} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: MATERIAL_COLORS[i] }} />
                    <span className="text-[11px] text-white/35">{mat}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white text-[14px]">PO Status</h3>
              <p className="text-[11px] text-white/35 mt-0.5">Delivered vs Pending vs Delayed</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={poStatusChart} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgba(0,212,255,0.06)" }} />
              <Bar dataKey="delivered" fill="#10b981" radius={[6, 6, 0, 0]} name="Delivered" />
              <Bar dataKey="pending" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Pending" />
              <Bar dataKey="delayed" fill="#ef4444" radius={[6, 6, 0, 0]} name="Delayed" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[11px] text-white/35">Delivered</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[11px] text-white/35">Pending</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[11px] text-white/35">Delayed</span></div>
          </div>
        </motion.div>
      </div>

      {/* Supplier List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <h3 className="font-semibold text-white text-[15px] mb-4">Supplier Register</h3>
        {supplierRegister.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-6">No suppliers yet — suppliers appear here once you generate a purchase order.</p>
        ) : (
          <div className="space-y-2">
            {supplierRegister.map((s, i) => (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="flex items-center gap-4 p-4 rounded-xl transition-colors"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.045)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; }}
              >
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{s.name}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[11px] text-white/35">Orders: <span className="text-white/70">{s.orders}</span></span>
                    <span className="text-[11px] text-white/35">Spend: <span className="text-white/70">{fmtMoney(s.totalSpend)}</span></span>
                    <span className="text-[11px] text-white/35">On-time: <span className="text-white/70">{s.onTimeRate}%</span></span>
                  </div>
                </div>
                <div className="w-24">
                  <div className="rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.onTimeRate}%` }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                      className="h-1.5 rounded-full bg-cyan-500"
                    />
                  </div>
                </div>
                <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${getStatusBadge(s.standing)}`}>
                  {s.standing}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.cyan.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-white/60 leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Procurement"
        placeholder="Ask about suppliers, materials, orders..."
        pageSummaryData={{
          activePOs,
          pendingDelivery,
          totalPoValue: fmtMoney(totalPoValue),
          suppliers: supplierRegister,
          materialDemand: materialDemand.data,
        }}
      />
    </div>
  );
}
