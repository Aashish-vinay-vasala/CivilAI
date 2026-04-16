"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Upload,
  Loader2,
  Brain,
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
  LineChart,
  Line,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const burnData = [
  { month: "Jan", budget: 500, actual: 480 },
  { month: "Feb", budget: 800, actual: 820 },
  { month: "Mar", budget: 650, actual: 700 },
  { month: "Apr", budget: 900, actual: 950 },
  { month: "May", budget: 750, actual: 740 },
  { month: "Jun", budget: 850, actual: 900 },
];

const cashflowData = [
  { month: "Jul", inflow: 1200, outflow: 980 },
  { month: "Aug", inflow: 1100, outflow: 1050 },
  { month: "Sep", inflow: 1400, outflow: 1200 },
  { month: "Oct", inflow: 900, outflow: 1100 },
  { month: "Nov", inflow: 1300, outflow: 1000 },
  { month: "Dec", inflow: 1500, outflow: 1100 },
];

const defaultMaterials = [
  { name: "Steel", risk: 92, price: 780 },
  { name: "Cement", risk: 85, price: 320 },
  { name: "Copper", risk: 78, price: 560 },
  { name: "Lumber", risk: 65, price: 450 },
];

export default function CostPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [mlData, setMlData] = useState<any>(null);
  const [materialPrices, setMaterialPrices] = useState(defaultMaterials);
  const [mlLoading, setMlLoading] = useState(true);

  useEffect(() => {
    fetchRealData();
  }, []);

  const fetchRealData = async () => {
    setMlLoading(true);
    try {
      const pricesRes = await axios.get(
        "http://localhost:8000/api/v1/ml/material-prices"
      );
      const prices = pricesRes.data;
      const latest: any = {};
      prices.forEach((p: any) => {
        if (!latest[p.material] || p.year > latest[p.material].year) {
          latest[p.material] = p;
        }
      });
      const processed = Object.entries(latest).map(([name, data]: any) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        price: Math.round(data.price),
        risk: Math.min(Math.round((data.price / 400) * 100), 100),
      }));
      if (processed.length > 0) setMaterialPrices(processed);

      const predRes = await axios.post(
        "http://localhost:8000/api/v1/ml/cost-overrun",
        {
          project_type: "Commercial",
          duration_months: 18,
          team_size: 50,
          change_orders: 8,
          material_price_increase: 15.5,
          weather_impact_days: 10,
          subcontractor_count: 5,
        }
      );
      setMlData(predRes.data);
    } catch (err) {
      console.error("Failed to fetch ML data", err);
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
        "http://localhost:8000/api/v1/cost/analyze-report",
        formData
      );
      setAnalysis(response.data.analysis);
      toast.success("Cost report analyzed!");
    } catch {
      toast.error("Failed to analyze report");
    } finally {
      setLoading(false);
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
          <h1 className="text-3xl font-bold text-foreground">Cost & Budget</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered cost intelligence & forecasting
          </p>
        </div>
        <label className="cursor-pointer">
          <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx" onChange={handleFileUpload} />
          <Button className="gradient-blue text-white border-0">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload Report
          </Button>
        </label>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Budget", value: "$24.5M", trend: "up", change: "+2.4%", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Spent to Date", value: "$18.2M", trend: "up", change: "+5.1%", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Remaining", value: "$6.3M", trend: "down", change: "-8.2%", color: "border-red-500/20 bg-red-500/5" },
          { label: "Cost Overrun", value: "4.2%", trend: "down", change: "+1.1%", color: "border-emerald-500/20 bg-emerald-500/5" },
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
              {kpi.change} this month
            </div>
          </motion.div>
        ))}
      </div>

      {/* ML Prediction Card */}
      {mlLoading ? (
        <div className="rounded-2xl border border-border p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">Loading AI prediction...</p>
        </div>
      ) : mlData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlData.risk_level === "High"
              ? "border-red-500/30 bg-red-500/5"
              : mlData.risk_level === "Medium"
              ? "border-orange-500/30 bg-orange-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Cost Overrun Prediction</p>
                <p className="text-xl font-bold text-foreground">
                  {mlData.probability}% probability of overrun
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Estimated overrun: {mlData.estimated_overrun_pct}% — {mlData.will_overrun ? "Action required" : "Under control"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlData.risk_level === "High"
                ? "bg-red-500/10 text-red-400"
                : mlData.risk_level === "Medium"
                ? "bg-orange-500/10 text-orange-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlData.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Budget Burn Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-foreground">Budget Burn Rate</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Budget vs Actual ($K)</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400">6 Months</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={burnData}>
            <defs>
              <linearGradient id="budget" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
            <Area type="monotone" dataKey="budget" stroke="#3b82f6" fill="url(#budget)" strokeWidth={2} name="Budget" />
            <Area type="monotone" dataKey="actual" stroke="#f59e0b" fill="url(#actual)" strokeWidth={2} name="Actual" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Budget</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
        </div>
      </motion.div>

      {/* Cash Flow + Material Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Cash Flow Forecast</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Inflow vs Outflow ($K)</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashflowData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="inflow" fill="#10b981" radius={[6, 6, 0, 0]} name="Inflow" />
              <Bar dataKey="outflow" fill="#ef4444" radius={[6, 6, 0, 0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs text-muted-foreground">Inflow</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs text-muted-foreground">Outflow</span></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h3 className="font-semibold text-foreground">
              Material Price Risk
              {materialPrices !== defaultMaterials && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live BLS Data</span>
              )}
            </h3>
          </div>
          <div className="space-y-4">
            {materialPrices.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-14">{m.name}</span>
                <div className="flex-1 bg-secondary rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${m.risk}%` }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    className={`h-2 rounded-full ${m.risk > 80 ? "bg-red-500" : m.risk > 60 ? "bg-orange-500" : "bg-emerald-500"}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{m.risk}%</span>
                <span className="text-xs font-medium text-foreground w-16 text-right">${m.price}/t</span>
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
            <DollarSign className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Cost & Budget"
        placeholder="Ask about costs, budgets, forecasts..."
        pageSummaryData={{
          totalBudget: "$24.5M",
          spentToDate: "$18.2M",
          remaining: "$6.3M",
          costOverrun: "4.2%",
          mlPrediction: mlData,
          materialPrices,
        }}
      />
    </div>
  );
}