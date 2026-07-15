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
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import Sparkline from "@/components/shared/Sparkline";
import { ACCENT, AccentKey, glassInputClass, glassInputStyle } from "@/lib/theme";
import { CHART_TOOLTIP_STYLE } from "@/lib/constants";

const SITE_TABS = [
  { href: "/bim", label: "BIM & CAD" },
  { href: "/digital-twin", label: "Digital Twin" },
  { href: "/weather", label: "Weather" },
  { href: "/green", label: "Green Monitor" },
];

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
  { name: "Concrete", value: 35, color: "#94A3B8" },
  { name: "Steel", value: 20, color: "#3B82F6" },
  { name: "Wood", value: 25, color: "#F59E0B" },
  { name: "Plastic", value: 10, color: "#EF4444" },
  { name: "Other", value: 10, color: "#10B981" },
];

const esgRadar = [
  { metric: "Energy", score: 72 },
  { metric: "Waste", score: 65 },
  { metric: "Water", score: 80 },
  { metric: "Carbon", score: 68 },
  { metric: "Social", score: 85 },
  { metric: "Safety", score: 92 },
];

const TABS = ["overview", "waste", "carbon", "esg"];

// ─── Shared glass button styles ─
const solidGreenBtn =
  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60";

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
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/green/analyze-waste`,
          wasteForm
        );
        setResult(response.data.analysis);
      } else if (type === "carbon") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/green/carbon-footprint`,
          carbonForm
        );
        setResult(response.data.analysis);
      } else if (type === "esg") {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/green/esg-report`,
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

  const kpis: {
    label: string; value: string; trend: "up" | "down"; change: string; icon: any; accent: AccentKey;
    sparkline: { data: number[]; labels: (string | number)[]; type: "bar" | "area" };
  }[] = [
    {
      label: "ESG Score", value: "72/100", trend: "up", change: "+3", icon: Leaf, accent: "green",
      // Real breakdown: the same 6 sub-scores plotted in the ESG radar chart below.
      sparkline: { data: esgRadar.map(m => m.score), labels: esgRadar.map(m => m.metric), type: "bar" },
    },
    {
      label: "Carbon Emissions", value: "88 tCO2", trend: "down", change: "-12%", icon: Wind, accent: "blue",
      // Real 6-month trend, same series as the Carbon Emissions chart below.
      sparkline: { data: carbonData.map(d => d.emissions), labels: carbonData.map(d => d.month), type: "area" },
    },
    {
      label: "Waste Recycled", value: "35%", trend: "up", change: "+5%", icon: Recycle, accent: "amber",
      // Recycled vs. not, from the live waste-analysis form's own recycled_percentage.
      sparkline: { data: [wasteForm.recycled_percentage, 100 - wasteForm.recycled_percentage], labels: ["Recycled", "Other"], type: "bar" },
    },
    {
      label: "Energy Efficiency", value: "72%", trend: "up", change: "+2%", icon: Factory, accent: "cyan",
      // Renewable vs. not, from the live ESG-report form's own renewable_energy_percentage.
      sparkline: { data: [esgForm.renewable_energy_percentage, 100 - esgForm.renewable_energy_percentage], labels: ["Renewable", "Other"], type: "bar" },
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={SITE_TABS} />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Green Monitor</h1>
          <p className="text-white/35 text-[13px] mt-1">
            Sustainability, ESG & carbon tracking
          </p>
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
              className="glass-card p-5 group relative overflow-hidden" style={{ borderColor: a.border }}
            >
              <div className="absolute inset-0 rounded-[0.875rem] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${a.bg}, transparent 70%)` }} />
              <div className="relative flex items-center justify-between mb-2">
                <p className="text-sm text-white/40">{kpi.label}</p>
                <kpi.icon className="w-4 h-4" style={{ color: a.text }} />
              </div>
              <p className="relative text-2xl font-bold" style={{ color: a.text, textShadow: `0 0 20px ${a.shadow}` }}>{kpi.value}</p>
              <div className={`relative flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-cyan-400"}`}>
                {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.change}
              </div>
              {kpi.sparkline.data.length >= 2 && (
                <div className="relative -mx-1 mt-2 opacity-80">
                  <Sparkline data={kpi.sparkline.data} color={a.text} type={kpi.sparkline.type} labels={kpi.sparkline.labels} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setResult(""); }}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize"
              style={active
                ? { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
            >
              {tab === "esg" ? "ESG Report" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-2">Waste by Type</h3>
              <p className="text-xs text-white/35 mb-4">Monthly waste generation (tons)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={wasteData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="concrete" fill="#94A3B8" radius={[4, 4, 0, 0]} name="Concrete" />
                  <Bar dataKey="steel" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Steel" />
                  <Bar dataKey="wood" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Wood" />
                  <Bar dataKey="plastic" fill="#EF4444" radius={[4, 4, 0, 0]} name="Plastic" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-2">Carbon Emissions</h3>
              <p className="text-xs text-white/35 mb-4">Actual vs Target (tCO2)</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={carbonData}>
                  <defs>
                    <linearGradient id="emissions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="emissions" stroke="#EF4444" fill="url(#emissions)" strokeWidth={2} name="Emissions" />
                  <Area type="monotone" dataKey="target" stroke="#10B981" fill="none" strokeWidth={2} strokeDasharray="5 5" name="Target" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-white/35">Actual</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-white/35">Target</span></div>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-4">Waste Distribution</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={wasteTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {wasteTypeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {wasteTypeData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-white/35">{item.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <h3 className="font-semibold text-white mb-4">ESG Performance Radar</h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={esgRadar}>
                  <PolarGrid stroke="rgba(255,255,255,0.04)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} />
                  <Radar dataKey="score" stroke="#10B981" fill="#10B981" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
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
          className="glass-card p-6 space-y-4"
        >
          <h3 className="font-semibold text-white">Waste Analysis</h3>
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
                <label className="text-xs text-white/35 mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={wasteForm[f.key as keyof typeof wasteForm]}
                  onChange={(e) => setWasteForm({ ...wasteForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={glassInputClass}
                  style={glassInputStyle}
                />
              </div>
            ))}
          </div>
          <button onClick={() => handleAnalyze("waste")} disabled={loading} className={solidGreenBtn}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Recycle className="w-4 h-4" />}
            Analyze Waste
          </button>
        </motion.div>
      )}

      {/* Carbon Tab */}
      {activeTab === "carbon" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4"
        >
          <h3 className="font-semibold text-white">Carbon Footprint Calculator</h3>
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
                <label className="text-xs text-white/35 mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={carbonForm[f.key as keyof typeof carbonForm]}
                  onChange={(e) => setCarbonForm({ ...carbonForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={glassInputClass}
                  style={glassInputStyle}
                />
              </div>
            ))}
          </div>
          <button onClick={() => handleAnalyze("carbon")} disabled={loading} className={solidGreenBtn}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wind className="w-4 h-4" />}
            Calculate Carbon Footprint
          </button>
        </motion.div>
      )}

      {/* ESG Tab */}
      {activeTab === "esg" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-4"
        >
          <h3 className="font-semibold text-white">ESG Report Generator</h3>
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
                <label className="text-xs text-white/35 mb-1.5 block">{f.label}</label>
                <input
                  type={f.type}
                  value={esgForm[f.key as keyof typeof esgForm]}
                  onChange={(e) => setEsgForm({ ...esgForm, [f.key]: f.type === "number" ? parseFloat(e.target.value) : e.target.value })}
                  className={glassInputClass}
                  style={glassInputStyle}
                />
              </div>
            ))}
          </div>
          <button onClick={() => handleAnalyze("esg")} disabled={loading} className={solidGreenBtn}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Generate ESG Report
          </button>
        </motion.div>
      )}

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6" style={{ borderColor: ACCENT.green.border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white text-[15px]">AI Analysis</h3>
          </div>
          <p className="text-sm text-white/60 whitespace-pre-wrap leading-relaxed">{result}</p>
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
