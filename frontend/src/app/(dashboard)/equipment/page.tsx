"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const QRTrackerPage = dynamic(() => import("../qr-tracker/page"), { ssr: false });

const EQUIPMENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "qr",       label: "QR Tracker" },
];
import { motion, AnimatePresence } from "framer-motion";
import {
  Wrench,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Brain,
  Plus,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { MarkdownText } from "@/lib/renderMarkdown";

const WORKFORCE_MODULE_TABS = [
  { href: "/workforce", label: "Workforce" },
  { href: "/team",      label: "Team" },
  { href: "/equipment", label: "Equipment" },
  { href: "/vendors", label: "Vendors" },
];

const emptyEquipment = {
  name: "", equipment_code: "", equipment_type: "",
  health_score: 80, status: "Operational", next_service: "",
};

export default function EquipmentPage() {
  const [subTab, setSubTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [predictOpen, setPredictOpen] = useState(false);
  const [equipment, setEquipment] = useState({
    equipment_id: "", equipment_type: "",
    age_years: 0, last_maintenance: "",
    operating_hours: 0, condition: "Good",
  });
  const [prediction, setPrediction] = useState("");
  const [predictLoading, setPredictLoading] = useState(false);
  const [equipmentStats, setEquipmentStats] = useState<any>(null);
  const [mlEquipment, setMlEquipment] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [healthData, setHealthData] = useState<any[]>([]);

  // Live DB state
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [downtimeData, setDowntimeData] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  // Add equipment modal
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEquipment, setNewEquipment] = useState({ ...emptyEquipment });
  // Extract from upload
  const [extractedEquipment, setExtractedEquipment] = useState<any[]>([]);
  const [extractLoading, setExtractLoading] = useState(false);
  const [addingExtracted, setAddingExtracted] = useState<string | null>(null);
  const extractFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEquipmentData();
    fetchEquipmentList();
    fetchMaintenanceSummary();
  }, []);

  const fetchEquipmentList = async () => {
    setListLoading(true);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/all`
      );
      setEquipmentList(res.data.equipment || []);
    } catch {
      toast.error("Failed to load equipment register");
    } finally {
      setListLoading(false);
    }
  };

  const fetchMaintenanceSummary = async () => {
    setChartsLoading(true);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/maintenance-summary`
      );
      const data: any[] = res.data.data || [];
      setDowntimeData(data.map((d: any) => ({
        month: d.month, planned: d.planned, unplanned: d.unplanned,
      })));
      setCostData(data.map((d: any) => ({ month: d.month, cost: d.cost })));
    } catch {
      // silent — charts will show empty state
    } finally {
      setChartsLoading(false);
    }
  };

  const fetchEquipmentData = async () => {
    setMlLoading(true);
    try {
      const statsRes = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/equipment-stats`
      );
      setEquipmentStats(statsRes.data);

      if (statsRes.data?.health_by_type) {
        setHealthData(
          Object.entries(statsRes.data.health_by_type).map(([eq, health]: any) => ({
            equipment: eq, health: Math.round(health),
          }))
        );
      }

      const mlRes = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/equipment-failure`,
        { equipment_type: "Excavator", age_years: 8, operating_hours: 6000,
          maintenance_count: 3, last_service_days_ago: 180, breakdowns: 2 }
      );
      setMlEquipment(mlRes.data);
    } catch (err) {
      console.error("Failed to fetch equipment data", err);
    } finally {
      setMlLoading(false);
    }
  };

  const handleAddEquipment = async () => {
    if (!newEquipment.name) { toast.error("Equipment name is required"); return; }
    setAdding(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/`,
        newEquipment
      );
      toast.success("Equipment added!");
      setShowAdd(false);
      setNewEquipment({ ...emptyEquipment });
      fetchEquipmentList();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to add equipment");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteEquipment = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/${id}`);
      toast.success("Equipment deleted");
      fetchEquipmentList();
    } catch {
      toast.error("Failed to delete equipment");
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
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/extract-items`, formData);
      const found = res.data.extracted_items ?? [];
      setExtractedEquipment(found);
      toast.success(found.length > 0 ? `Found ${found.length} item(s) — review below.` : "No equipment found in document.");
    } catch { toast.error("Failed to extract equipment from file"); }
    finally { setExtractLoading(false); }
  };

  const addExtractedItem = async (eq: any, idx: number) => {
    setAddingExtracted(String(idx));
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/`, eq);
      setExtractedEquipment(prev => prev.filter((_, i) => i !== idx));
      toast.success(`${eq.name} added`);
      fetchEquipmentList();
    } catch { toast.error(`Failed to add ${eq.name}`); }
    finally { setAddingExtracted(null); }
  };

  const addAllExtractedItems = async () => {
    setAddingExtracted("all");
    let added = 0;
    for (const eq of extractedEquipment) {
      try { await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/`, eq); added++; } catch { /* skip */ }
    }
    setExtractedEquipment([]);
    toast.success(`Added ${added} item(s)`);
    fetchEquipmentList();
    setAddingExtracted(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/equipment/analyze`, formData
      );
      setAnalysis(response.data.analysis);
      toast.success("Equipment data analyzed!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const predictFailure = async () => {
    setPredictLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/equipment-failure`,
        { equipment_type: equipment.equipment_type, age_years: equipment.age_years,
          operating_hours: equipment.operating_hours, maintenance_count: 3,
          last_service_days_ago: 90, breakdowns: 1 }
      );
      setPrediction(JSON.stringify(response.data, null, 2));
      toast.success("Prediction complete!");
    } catch {
      toast.error("Failed to predict");
    } finally {
      setPredictLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "Operational") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "Needs Service") return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  const getHealthColor = (health: number) => {
    if (health >= 80) return "bg-emerald-500";
    if (health >= 60) return "bg-orange-500";
    return "bg-red-500";
  };

  const getStatusIcon = (status: string) => {
    if (status === "Operational") return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (status === "Needs Service") return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  const tabBar = (
    <div className="flex gap-0 border-b border-border">
      {EQUIPMENT_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            subTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}>{t.label}</button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      {tabBar}
      {subTab === "qr" && <div className="pt-6"><QRTrackerPage /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      {tabBar}

      {/* Add Equipment Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground text-lg">Add Equipment</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input className={inputClass} placeholder="Equipment name *"
                value={newEquipment.name}
                onChange={(e) => setNewEquipment(p => ({ ...p, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputClass} placeholder="Code (e.g. EQ001)"
                  value={newEquipment.equipment_code}
                  onChange={(e) => setNewEquipment(p => ({ ...p, equipment_code: e.target.value }))} />
                <input className={inputClass} placeholder="Type (e.g. Crane)"
                  value={newEquipment.equipment_type}
                  onChange={(e) => setNewEquipment(p => ({ ...p, equipment_type: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className={inputClass} type="number" placeholder="Health score (0-100)"
                  value={newEquipment.health_score}
                  onChange={(e) => setNewEquipment(p => ({ ...p, health_score: parseInt(e.target.value) || 80 }))} />
                <select className={inputClass} value={newEquipment.status}
                  onChange={(e) => setNewEquipment(p => ({ ...p, status: e.target.value }))}>
                  <option>Operational</option>
                  <option>Needs Service</option>
                  <option>Critical</option>
                  <option>Inactive</option>
                </select>
              </div>
              <input className={inputClass} placeholder="Next service date (e.g. Jul 15)"
                value={newEquipment.next_service}
                onChange={(e) => setNewEquipment(p => ({ ...p, next_service: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:text-foreground">
                Cancel
              </button>
              <button onClick={handleAddEquipment} disabled={adding}
                className="flex-1 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium flex items-center justify-center gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Equipment
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Equipment</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered equipment health &amp; maintenance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Equipment
          </Button>
          <Button variant="outline" onClick={() => setPredictOpen(!predictOpen)}>
            <Activity className="w-4 h-4 mr-2 text-blue-400" />
            Predict Failure
          </Button>
          <input ref={extractFileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={handleExtractUpload} />
          <Button className="gradient-blue text-white border-0" disabled={extractLoading} onClick={() => extractFileRef.current?.click()}>
            {extractLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload
          </Button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Equipment", value: equipmentStats ? `${equipmentStats.total_equipment}` : `${equipmentList.length || "—"}`, icon: Wrench, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Avg Health Score", value: equipmentStats ? `${equipmentStats.avg_health_score}%` : equipmentList.length ? `${Math.round(equipmentList.reduce((s: number, e: any) => s + (e.health_score || 0), 0) / equipmentList.length)}%` : "—", icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Failure Rate", value: equipmentStats ? `${equipmentStats.failure_rate_pct}%` : "—", icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          { label: "Critical", value: `${equipmentList.filter((e: any) => e.status === "Critical").length}`, icon: XCircle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            {equipmentStats && i < 3 && (
              <p className="text-xs text-emerald-400 mt-1">Live ML Data</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* ML Prediction */}
      {mlLoading ? (
        <div className="rounded-2xl border border-border p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">Loading AI equipment prediction...</p>
        </div>
      ) : mlEquipment && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlEquipment.risk_level === "High" ? "border-red-500/30 bg-red-500/5"
            : mlEquipment.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Equipment Failure Prediction — Excavator</p>
                <p className="text-xl font-bold text-foreground">{mlEquipment.probability}% failure probability</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlEquipment.will_fail ? "Schedule maintenance immediately" : "Equipment operating normally"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlEquipment.risk_level === "High" ? "bg-red-500/10 text-red-400"
              : mlEquipment.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400"
              : "bg-emerald-500/10 text-emerald-400"}`}>
              {mlEquipment.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Predict Form */}
      {predictOpen && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-4">AI Failure Predictor</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <input placeholder="Equipment type" value={equipment.equipment_type}
              onChange={(e) => setEquipment({ ...equipment, equipment_type: e.target.value })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Age (years)" value={equipment.age_years}
              onChange={(e) => setEquipment({ ...equipment, age_years: parseInt(e.target.value) })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Operating hours" value={equipment.operating_hours}
              onChange={(e) => setEquipment({ ...equipment, operating_hours: parseInt(e.target.value) })}
              className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <Button onClick={predictFailure} disabled={predictLoading} className="gradient-blue text-white border-0">
            {predictLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
            Predict Failure
          </Button>
          {prediction && (
            <div className="mt-4 p-4 bg-secondary rounded-xl">
              <pre className="text-sm text-foreground leading-relaxed">{prediction}</pre>
            </div>
          )}
        </motion.div>
      )}

      {/* Extracted Equipment Review Panel */}
      <AnimatePresence>
        {extractedEquipment.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">Extracted Equipment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{extractedEquipment.length} item(s) found — select which to add</p>
              </div>
              <Button size="sm" className="gradient-blue text-white border-0"
                disabled={addingExtracted === "all"} onClick={addAllExtractedItems}>
                {addingExtracted === "all" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Add All
              </Button>
            </div>
            <div className="space-y-2">
              {extractedEquipment.map((eq: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <Wrench className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{eq.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[eq.equipment_type, eq.equipment_code, eq.status].filter(Boolean).join(" · ")}
                      {eq.health_score != null && ` · Health: ${eq.health_score}%`}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={addingExtracted === String(idx)}
                    onClick={() => addExtractedItem(eq, idx)}>
                    {addingExtracted === String(idx) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Equipment Register */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }} className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Equipment Register</h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : equipmentList.length === 0 ? (
          <div className="text-center py-8">
            <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No equipment in register yet</p>
            <button onClick={() => setShowAdd(true)}
              className="mt-3 px-4 py-2 rounded-xl gradient-blue text-white text-xs font-medium">
              Add First Equipment
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {equipmentList.map((eq: any, i: number) => (
              <motion.div key={eq.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group">
                {getStatusIcon(eq.status || "Operational")}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{eq.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {eq.equipment_code && `ID: ${eq.equipment_code}`}
                    {eq.equipment_type && ` · ${eq.equipment_type}`}
                  </p>
                </div>
                <div className="w-28">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Health</span>
                    <span className="text-xs font-medium text-foreground">{eq.health_score ?? "—"}%</span>
                  </div>
                  <div className="bg-secondary rounded-full h-1.5">
                    <motion.div initial={{ width: 0 }}
                      animate={{ width: `${eq.health_score ?? 0}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                      className={`h-1.5 rounded-full ${getHealthColor(eq.health_score ?? 0)}`} />
                  </div>
                </div>
                {eq.next_service && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Next: {eq.next_service}
                  </span>
                )}
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(eq.status || "Operational")}`}>
                  {eq.status || "Operational"}
                </span>
                <button onClick={() => handleDeleteEquipment(eq.id, eq.name)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10">
                  <X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }} className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Downtime Analysis</h3>
            {!chartsLoading && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Live Data</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Planned vs Unplanned (hours)</p>
          {chartsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
          ) : downtimeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Wrench className="w-8 h-8 mb-2" />
              <p className="text-sm">No maintenance logs yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={downtimeData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Bar dataKey="planned" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Planned" />
                  <Bar dataKey="unplanned" fill="#ef4444" radius={[6, 6, 0, 0]} name="Unplanned" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Planned</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Unplanned</span></div>
              </div>
            </>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }} className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Health by Equipment Type</h3>
            {equipmentStats && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Average health score %</p>
          {healthData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2" />
              <p className="text-sm">No health data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {healthData.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-foreground w-20">{item.equipment}</span>
                  <div className="flex-1 bg-secondary rounded-full h-2">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${item.health}%` }}
                      transition={{ delay: 0.6 + i * 0.1, duration: 0.8 }}
                      className={`h-2 rounded-full ${getHealthColor(item.health)}`} />
                  </div>
                  <span className="text-sm font-medium text-foreground w-10 text-right">{item.health}%</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <MarkdownText text={analysis} className="text-sm text-muted-foreground leading-relaxed" />
        </motion.div>
      )}

      <ModuleChat
        context="Equipment Management"
        placeholder="Ask about equipment health, maintenance..."
        pageSummaryData={{
          totalEquipment: equipmentList.length,
          avgHealthScore: equipmentStats?.avg_health_score,
          failureRate: equipmentStats?.failure_rate_pct,
          mlPrediction: mlEquipment,
          healthByType: equipmentStats?.health_by_type,
        }}
      />
    </div>
  );
}
