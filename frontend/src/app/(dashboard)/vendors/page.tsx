"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Star,
  Loader2,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const vendors = [
  { name: "BuildCo Ltd", type: "Main Contractor", score: 88, delivery: 92, quality: 85, safety: 95, status: "Preferred" },
  { name: "SteelMart Inc", type: "Steel Supplier", score: 76, delivery: 78, quality: 80, safety: 88, status: "Approved" },
  { name: "ElectroPro", type: "MEP Contractor", score: 82, delivery: 85, quality: 88, safety: 90, status: "Approved" },
  { name: "QuickBuild", type: "Subcontractor", score: 58, delivery: 55, quality: 62, safety: 70, status: "Review" },
  { name: "ConcretePlus", type: "Concrete Supplier", score: 91, delivery: 94, quality: 90, safety: 92, status: "Preferred" },
];

const radarData = [
  { metric: "Quality", score: 85 },
  { metric: "Delivery", score: 88 },
  { metric: "Safety", score: 92 },
  { metric: "Financial", score: 78 },
  { metric: "Communication", score: 82 },
  { metric: "Compliance", score: 88 },
];

export default function VendorsPage() {
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

  const handleScore = async () => {
    setLoading(true);
    setResult("");
    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/vendors/score",
        form
      );
      setResult(response.data.analysis);
      toast.success("Vendor scored!");
    } catch {
      toast.error("Failed to score vendor");
    } finally {
      setLoading(false);
    }
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

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold text-foreground">Vendor Scoring</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered subcontractor & vendor performance management
        </p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Vendors", value: "24", trend: "up", change: "+3", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Preferred", value: "8", trend: "up", change: "+1", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Under Review", value: "3", trend: "down", change: "-1", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Avg Score", value: "79/100", trend: "up", change: "+2.1", color: "border-purple-500/20 bg-purple-500/5" },
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

      {/* Tabs */}
      <div className="flex gap-2">
        {["register", "score"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setResult(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-blue-500 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "score" ? "AI Score Vendor" : "Vendor Register"}
          </button>
        ))}
      </div>

      {/* Vendor Register */}
      {activeTab === "register" && (
        <div className="space-y-6">
          {/* Vendor List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Vendor Register</h3>
            <div className="space-y-3">
              {vendors.map((vendor, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
                >
                  {getStatusIcon(vendor.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{vendor.name}</p>
                    <p className="text-xs text-muted-foreground">{vendor.type}</p>
                  </div>
                  <div className="hidden lg:flex gap-4 text-xs text-muted-foreground">
                    <span>Delivery: <span className="text-foreground">{vendor.delivery}%</span></span>
                    <span>Quality: <span className="text-foreground">{vendor.quality}%</span></span>
                    <span>Safety: <span className="text-foreground">{vendor.safety}%</span></span>
                  </div>
                  <div className="w-20">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Score</span>
                      <span className="text-foreground font-medium">{vendor.score}</span>
                    </div>
                    <div className="bg-secondary rounded-full h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${vendor.score}%` }}
                        transition={{ delay: i * 0.1, duration: 0.8 }}
                        className={`h-1.5 rounded-full ${
                          vendor.score >= 80 ? "bg-emerald-500" :
                          vendor.score >= 60 ? "bg-orange-500" : "bg-red-500"
                        }`}
                      />
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(vendor.status)}`}>
                    {vendor.status}
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
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-2">Vendor Scores</h3>
              <p className="text-xs text-muted-foreground mb-4">Overall performance score</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vendors} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]} name="Score"
                    fill="#3b82f6"
                  />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-card border border-border rounded-2xl p-6"
            >
              <h3 className="font-semibold text-foreground mb-4">Top Vendor Performance</h3>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#ffffff08" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
                </RadarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>
      )}

      {/* AI Score Form */}
      {activeTab === "score" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="font-semibold text-foreground">AI Vendor Scorer</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Vendor Name</label>
              <input placeholder="Company name" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Vendor Type</label>
              <select value={form.vendor_type} onChange={(e) => setForm({ ...form, vendor_type: e.target.value })} className={inputClass}>
                <option>Main Contractor</option>
                <option>Subcontractor</option>
                <option>Material Supplier</option>
                <option>MEP Contractor</option>
                <option>Consultant</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Years Experience</label>
              <input type="number" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: parseInt(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Completed Projects</label>
              <input type="number" value={form.completed_projects} onChange={(e) => setForm({ ...form, completed_projects: parseInt(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">On-Time Delivery %</label>
              <input type="number" value={form.on_time_delivery_pct} onChange={(e) => setForm({ ...form, on_time_delivery_pct: parseFloat(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Quality Score (0-100)</label>
              <input type="number" value={form.quality_score} onChange={(e) => setForm({ ...form, quality_score: parseFloat(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Safety Incidents</label>
              <input type="number" value={form.safety_incidents} onChange={(e) => setForm({ ...form, safety_incidents: parseInt(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Financial Rating</label>
              <select value={form.financial_rating} onChange={(e) => setForm({ ...form, financial_rating: e.target.value })} className={inputClass}>
                <option>Excellent</option>
                <option>Good</option>
                <option>Average</option>
                <option>Poor</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Past Issues (if any)</label>
              <textarea placeholder="Any past issues, disputes, delays..." value={form.past_issues} onChange={(e) => setForm({ ...form, past_issues: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
            </div>
          </div>
          <Button onClick={handleScore} disabled={loading} className="gradient-blue text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
            Score Vendor
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
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Vendor Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{result}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Vendor Scoring"
        placeholder="Ask about vendors, scores, performance..."
        pageSummaryData={{
          totalVendors: 24,
          preferred: 8,
          underReview: 3,
          avgScore: "79/100",
          vendors,
        }}
      />
    </div>
  );
}