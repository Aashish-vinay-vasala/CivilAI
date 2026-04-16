"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Wrench,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  Brain,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const equipmentList = [
  { id: "EQ001", name: "Tower Crane #1", health: 92, status: "Operational", nextService: "Jul 15" },
  { id: "EQ002", name: "Excavator #2", health: 65, status: "Needs Service", nextService: "Jun 30" },
  { id: "EQ003", name: "Concrete Mixer", health: 78, status: "Operational", nextService: "Jul 28" },
  { id: "EQ004", name: "Bulldozer #1", health: 88, status: "Operational", nextService: "Aug 10" },
  { id: "EQ005", name: "Generator #3", health: 45, status: "Critical", nextService: "Immediate" },
];

const downtimeData = [
  { month: "Jan", planned: 8, unplanned: 3 },
  { month: "Feb", planned: 6, unplanned: 5 },
  { month: "Mar", planned: 10, unplanned: 2 },
  { month: "Apr", planned: 7, unplanned: 8 },
  { month: "May", planned: 9, unplanned: 4 },
  { month: "Jun", planned: 8, unplanned: 1 },
];

const costData = [
  { month: "Jan", cost: 12000 },
  { month: "Feb", cost: 18000 },
  { month: "Mar", cost: 9000 },
  { month: "Apr", cost: 25000 },
  { month: "May", cost: 15000 },
  { month: "Jun", cost: 11000 },
];

export default function EquipmentPage() {
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

  useEffect(() => {
    fetchEquipmentData();
  }, []);

  const fetchEquipmentData = async () => {
    setMlLoading(true);
    try {
      const statsRes = await axios.get(
        "http://localhost:8000/api/v1/ml/equipment-stats"
      );
      setEquipmentStats(statsRes.data);

      if (statsRes.data?.health_by_type) {
        setHealthData(
          Object.entries(statsRes.data.health_by_type).map(([equipment, health]: any) => ({
            equipment,
            health: Math.round(health),
          }))
        );
      }

      const mlRes = await axios.post(
        "http://localhost:8000/api/v1/ml/equipment-failure",
        {
          equipment_type: "Excavator",
          age_years: 8,
          operating_hours: 6000,
          maintenance_count: 3,
          last_service_days_ago: 180,
          breakdowns: 2,
        }
      );
      setMlEquipment(mlRes.data);
    } catch (err) {
      console.error("Failed to fetch equipment data", err);
    } finally {
      setMlLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        "http://localhost:8000/api/v1/equipment/analyze",
        formData
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
        "http://localhost:8000/api/v1/ml/equipment-failure",
        {
          equipment_type: equipment.equipment_type,
          age_years: equipment.age_years,
          operating_hours: equipment.operating_hours,
          maintenance_count: 3,
          last_service_days_ago: 90,
          breakdowns: 1,
        }
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
    switch (status) {
      case "Operational": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Needs Service": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-red-500/10 text-red-400 border-red-500/20";
    }
  };

  const getHealthColor = (health: number) => {
    if (health >= 80) return "bg-emerald-500";
    if (health >= 60) return "bg-orange-500";
    return "bg-red-500";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Operational": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "Needs Service": return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default: return <XCircle className="w-4 h-4 text-red-400" />;
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
          <h1 className="text-3xl font-bold text-foreground">Equipment</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered equipment health & maintenance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPredictOpen(!predictOpen)}>
            <Activity className="w-4 h-4 mr-2 text-blue-400" />
            Predict Failure
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
          { label: "Total Equipment", value: equipmentStats ? `${equipmentStats.total_equipment}` : "24", icon: Wrench, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Avg Health Score", value: equipmentStats ? `${equipmentStats.avg_health_score}%` : "78%", icon: CheckCircle, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Failure Rate", value: equipmentStats ? `${equipmentStats.failure_rate_pct}%` : "20%", icon: AlertTriangle, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
          { label: "Critical", value: "1", icon: XCircle, color: "border-red-500/20 bg-red-500/5", iconColor: "text-red-400" },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlEquipment.risk_level === "High"
              ? "border-red-500/30 bg-red-500/5"
              : mlEquipment.risk_level === "Medium"
              ? "border-orange-500/30 bg-orange-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Equipment Failure Prediction — Excavator</p>
                <p className="text-xl font-bold text-foreground">
                  {mlEquipment.probability}% failure probability
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlEquipment.will_fail ? "Schedule maintenance immediately" : "Equipment operating normally"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlEquipment.risk_level === "High"
                ? "bg-red-500/10 text-red-400"
                : mlEquipment.risk_level === "Medium"
                ? "bg-orange-500/10 text-orange-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlEquipment.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Predict Form */}
      {predictOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">AI Failure Predictor</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <input placeholder="Equipment type" value={equipment.equipment_type} onChange={(e) => setEquipment({ ...equipment, equipment_type: e.target.value })} className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Age (years)" value={equipment.age_years} onChange={(e) => setEquipment({ ...equipment, age_years: parseInt(e.target.value) })} className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="number" placeholder="Operating hours" value={equipment.operating_hours} onChange={(e) => setEquipment({ ...equipment, operating_hours: parseInt(e.target.value) })} className="px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

      {/* Equipment Register */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Equipment Register</h3>
        <div className="space-y-3">
          {equipmentList.map((eq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
            >
              {getStatusIcon(eq.status)}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{eq.name}</p>
                <p className="text-xs text-muted-foreground">ID: {eq.id}</p>
              </div>
              <div className="w-28">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Health</span>
                  <span className="text-xs font-medium text-foreground">{eq.health}%</span>
                </div>
                <div className="bg-secondary rounded-full h-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${eq.health}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                    className={`h-1.5 rounded-full ${getHealthColor(eq.health)}`}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Next: {eq.nextService}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(eq.status)}`}>
                {eq.status}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="font-semibold text-foreground mb-2">Downtime Analysis</h3>
          <p className="text-xs text-muted-foreground mb-4">Planned vs Unplanned (hours)</p>
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
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Health by Equipment Type</h3>
            {equipmentStats && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Average health score %</p>
          <div className="space-y-3">
            {(healthData.length > 0 ? healthData : [
              { equipment: "Crane", health: 92 },
              { equipment: "Excavator", health: 65 },
              { equipment: "Mixer", health: 78 },
              { equipment: "Bulldozer", health: 88 },
              { equipment: "Generator", health: 45 },
            ]).map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-foreground w-20">{item.equipment}</span>
                <div className="flex-1 bg-secondary rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.health}%` }}
                    transition={{ delay: 0.6 + i * 0.1, duration: 0.8 }}
                    className={`h-2 rounded-full ${getHealthColor(item.health)}`}
                  />
                </div>
                <span className="text-sm font-medium text-foreground w-10 text-right">
                  {item.health}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-blue-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Equipment Management"
        placeholder="Ask about equipment health, maintenance..."
        pageSummaryData={{
          totalEquipment: equipmentStats?.total_equipment,
          avgHealthScore: equipmentStats?.avg_health_score,
          failureRate: equipmentStats?.failure_rate_pct,
          mlPrediction: mlEquipment,
          healthByType: equipmentStats?.health_by_type,
        }}
      />
    </div>
  );
}