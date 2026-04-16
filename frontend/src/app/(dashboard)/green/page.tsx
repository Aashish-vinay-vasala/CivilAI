"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Leaf,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wind,
  Recycle,
  Factory,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const wasteData = [
  { month: "Jan", concrete: 45, steel: 12, wood: 28, plastic: 8 },
  { month: "Feb", concrete: 38, steel: 15, wood: 22, plastic: 6 },
  { month: "Mar", concrete: 52, steel: 10, wood: 35, plastic: 9 },
  { month: "Apr", concrete: 30, steel: 8, wood: 18, plastic: 5 },
  { month: "May", concrete: 42, steel: 14, wood: 25, plastic: 7 },
  { month: "Jun", concrete: 28, steel: 9, wood: 20, plastic: 4 },
];

const carbonData = [
  { month: "Jan", emissions: 120, target: 100 },
  { month: "Feb", emissions: 115, target: 100 },
  { month: "Mar", emissions: 130, target: 100 },
  { month: "Apr", emissions: 108, target: 100 },
  { month: "May", emissions: 95, target: 100 },
  { month: "Jun", emissions: 88, target: 100 },
];

const wasteTypeData = [
  { name: "Concrete", value: 35, color: "#6b7280" },
  { name: "Steel", value: 20, color: "#3b82f6" },
  { name: "Wood", value: 25, color: "#f59e0b" },
  { name: "Plastic", value: 10, color: "#ef4444" },
  { name: "Other", value: 10, color: "#10b981" },
];

const esgRadar = [
  { metric: "Energy", score: 72 },
  { metric: "Waste", score: 65 },
  { metric: "Water", score: 80 },
  { metric: "Carbon", score: 68 },
  { metric: "Social", score: 85 },
  { metric: "Safety", score: 92 },
];

export default function GreenPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const [wasteForm, setWasteForm] = useState({
    project_name: "CivilAI Tower",
    concrete_waste_tons: 45,
    steel_waste_tons: 12,
    wood_waste_tons: 28,
    plastic_waste_tons: 8,
    general_waste_tons: 15,
    recycled_percentage: 35,
  });

  const [carbonForm, setCarbonForm] = useState({
    project_name: "CivilAI Tower",
    electricity_kwh: 50000,
    diesel_liters: 20000,
    cement_tons: 500,
    steel_tons: 200,
    transport_km: 10000,
  });

  const [esgForm, setEsgForm] = useState({
    project_name: "CivilAI Tower",
    total_workers: 342,
    safety_incidents: 5,
    local_hiring_percentage: 65,
    renewable_energy_percentage: 20,
    waste_recycled_percentage: 35,
    community_investments: 50000,
  });

  const handleAnalyze = async (type: string) => {
    setLoading(true);
    setResult("");
    try {
      let response;
      if (type === "waste") {
        response = await axios.post(
          "http://localhost:8000/api/v1/green/analyze-waste",
          wasteForm
        );
        setResult(response.data.analysis);
      } else if (type === "carbon") {
        response = await axios.post(
          "http://localhost:8000/api/v1/green/carbon-footprint",
          carbonForm
        );
        setResult(response.data.analysis);
      } else if (type === "esg") {
        response = await axios.post(
          "http://localhost:8000/api/v1/green/esg-report",
          esgForm
        );
        setResult(response.data.report);
      }
      toast.success("Analysis complete!");
    } catch {
      toast.error("Failed to analyze");
    } finally {
      setLoading(false);
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
          <h1 className="text-3xl font-bold text-foreground">Green Monitor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sustainability, ESG & carbon tracking
          </p>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "ESG Score", value: "72/100", trend: "up", change: "+3", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Carbon Emissions", value: "88 tCO2", trend: "down", change: "-12%", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Waste Recycled", value: "35%", trend: "up", change: "+5%", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Energy Efficiency", value: "72%", trend: "up", change: "+2%", color: "border-purple-500/20 bg-purple-500/5" },
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
            <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-blue-400"}`}>
              {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {kpi.change}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {["overview", "waste", "carbon", "esg"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setResult(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-emerald-500 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "esg" ? "ESG Report" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Waste by Type</h3>
              <p className="text-xs text-muted-foreground mb-4">Monthly waste generation (tons)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={wasteData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Bar dataKey="concrete" fill="#6b7280" radius={[4, 4, 0, 0]} name="Concrete" />
                  <Bar dataKey="steel" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Steel" />
                  <Bar dataKey="wood" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Wood" />
                  <Bar dataKey="plastic" fill="#ef4444" radius={[4, 4, 0, 0]} name="Plastic" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Carbon Emissions</h3>
              <p className="text-xs text-muted-foreground mb-4">Actual vs Target (tCO2)</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={carbonData}>
                  <defs>
                    <linearGradient id="emissions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="emissions" stroke="#ef4444" fill="url(#emissions)" strokeWidth={2} name="Emissions" />
                  <Area type="monotone" dataKey="target" stroke="#10b981" fill="none" strokeWidth={2} strokeDasharray="5 5" name="Target" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Target</span></div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-4">Waste Distribution</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={wasteTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {wasteTypeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {wasteTypeData.map((item) => (
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
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-4">ESG Performance Radar</h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={esgRadar}>
                  <PolarGrid stroke="#ffffff08" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Radar dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </RadarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>
      )}

      {/* Waste Analysis Tab */}
      {activeTab === "waste" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-foreground">Waste Analysis</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Project Name", key: "project_name", type: "text" },
              { label: "Concrete Waste (tons)", key: "concrete_waste_tons", type: "number" },
              { label: "Steel Waste (tons)", key: "steel_waste_tons", type: "number" },
              { label: "Wood Waste (tons)", key: "wood_waste_tons", type: "number" },
              { label: "Plastic Waste (tons)", key: "plastic_waste_tons", type: "number" },
              { label: "General Waste (tons)", key: "general_waste_tons", type: "number" },
              { label: "Recycled %", key: "recycled_percentage", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={wasteForm[f.key as keyof typeof wasteForm]}
                  onChange={(e) => setWasteForm({ ...wasteForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => handleAnalyze("waste")} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Recycle className="w-4 h-4 mr-2" />}
            Analyze Waste
          </Button>
        </motion.div>
      )}

      {/* Carbon Tab */}
      {activeTab === "carbon" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-foreground">Carbon Footprint Calculator</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Project Name", key: "project_name", type: "text" },
              { label: "Electricity (kWh)", key: "electricity_kwh", type: "number" },
              { label: "Diesel (liters)", key: "diesel_liters", type: "number" },
              { label: "Cement (tons)", key: "cement_tons", type: "number" },
              { label: "Steel (tons)", key: "steel_tons", type: "number" },
              { label: "Transport (km)", key: "transport_km", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={carbonForm[f.key as keyof typeof carbonForm]}
                  onChange={(e) => setCarbonForm({ ...carbonForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => handleAnalyze("carbon")} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wind className="w-4 h-4 mr-2" />}
            Calculate Carbon Footprint
          </Button>
        </motion.div>
      )}

      {/* ESG Tab */}
      {activeTab === "esg" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-foreground">ESG Report Generator</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Project Name", key: "project_name", type: "text" },
              { label: "Total Workers", key: "total_workers", type: "number" },
              { label: "Safety Incidents", key: "safety_incidents", type: "number" },
              { label: "Local Hiring %", key: "local_hiring_percentage", type: "number" },
              { label: "Renewable Energy %", key: "renewable_energy_percentage", type: "number" },
              { label: "Waste Recycled %", key: "waste_recycled_percentage", type: "number" },
              { label: "Community Investment ($)", key: "community_investments", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={esgForm[f.key as keyof typeof esgForm]}
                  onChange={(e) => setEsgForm({ ...esgForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          <Button onClick={() => handleAnalyze("esg")} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate ESG Report
          </Button>
        </motion.div>
      )}

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-emerald-500/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{result}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Green Monitor & Sustainability"
        placeholder="Ask about waste, carbon, ESG..."
        pageSummaryData={{
          esgScore: "72/100",
          carbonEmissions: "88 tCO2",
          wasteRecycled: "35%",
          energyEfficiency: "72%",
        }}
      />
    </div>
  );
}