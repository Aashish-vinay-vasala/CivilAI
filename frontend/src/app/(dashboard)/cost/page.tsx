"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
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
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import {
  CHART_TOOLTIP_STYLE,
  CHART_LOOKBACK_MONTHS,
  CHART_FORECAST_MONTHS,
  DEFAULT_PROJECT_TYPE,
  DEFAULT_TEAM_SIZE,
  DEFAULT_AVG_DURATION_MONTHS,
  BURN_CHART_COLORS,
  CASHFLOW_CHART_COLORS,
} from "@/lib/constants";

const EVMPage       = dynamic(() => import("../evm/page"),      { ssr: false });
const PaymentsPage  = dynamic(() => import("../payments/page"), { ssr: false });
const ScenarioPage  = dynamic(() => import("../scenario/page"), { ssr: false });

const COST_TABS = [
  { id: "overview", label: "Overview" },
  { id: "evm",      label: "EVM" },
  { id: "payments", label: "Payments" },
  { id: "scenario", label: "Scenario Planner" },
];

const PROJECT_TABS = [
  { href: "/cost",        label: "Cost & Budget" },
  { href: "/financials",  label: "Financial Budget" },
  { href: "/procurement", label: "Procurement" },
];


interface CostKpis {
  totalBudget: number;
  spentToDate: number;
  remaining: number;
  overrunPct: number;
  projectCount: number;
}

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export default function CostPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subTab, setSubTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [mlData, setMlData] = useState<any>(null);
  const [materialPrices, setMaterialPrices] = useState<{ name: string; risk: number; price: number; unit: string; change_pct: number }[]>([]);
  const [mlLoading, setMlLoading] = useState(true);
  const [costKpis, setCostKpis] = useState<CostKpis | null>(null);
  const [burnChartData, setBurnChartData] = useState<any[]>([]);
  const [cashflowChartData, setCashflowChartData] = useState<any[]>([]);

  useEffect(() => {
    fetchRealData();
  }, []);

  const fetchRealData = async () => {
    setMlLoading(true);
    try {
      const [pricesRes, projectsRes, burnRes, cashflowRes] = await Promise.allSettled([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/material-prices`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/costs`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/charts/cashflow`),
      ]);

      let materialPriceIncrease = 0;
      if (pricesRes.status === "fulfilled") {
        const prices = pricesRes.value.data;
        const latest: any = {};
        prices.forEach((p: any) => {
          if (!latest[p.material] || p.year > latest[p.material].year) {
            latest[p.material] = p;
          }
        });
        const processed = Object.entries(latest).map(([name, data]: any) => ({
          name:       name.charAt(0).toUpperCase() + name.slice(1),
          price:      data.price as number,
          unit:       (data.unit as string) || "unit",
          change_pct: (data.change_pct as number) || 0,
          risk:       Math.min(Math.round(Math.abs(data.change_pct || 0) * 10), 100),
        }));
        if (processed.length > 0) setMaterialPrices(processed);
        if (processed.length > 0) {
          const avgChange = processed.reduce((s, m) => s + m.change_pct, 0) / processed.length;
          materialPriceIncrease = Math.max(0, avgChange);
        }
      }

      if (projectsRes.status === "fulfilled") {
        const projects: any[] = projectsRes.value.data.projects || [];
        const totalBudget = projects.reduce((s, p) => s + (p.total_budget || 0), 0);
        const spentToDate = projects.reduce((s, p) => s + (p.spent_to_date || 0), 0);
        const remaining = totalBudget - spentToDate;
        const overrunPct = totalBudget > 0
          ? Math.max(0, ((spentToDate - totalBudget) / totalBudget) * 100)
          : 0;
        setCostKpis({ totalBudget, spentToDate, remaining, overrunPct, projectCount: projects.length });

        // Derive real ML inputs from project aggregates
        let totalMonths = 0, count = 0, totalWorkers = 0, totalContracts = 0;
        for (const p of projects) {
          if (p.start_date && p.end_date) {
            const s = new Date(p.start_date), e = new Date(p.end_date);
            const months = (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth();
            totalMonths += Math.max(1, months);
            count++;
          }
        }
        const avgDurationMonths = count > 0 ? Math.round(totalMonths / count) : DEFAULT_AVG_DURATION_MONTHS;

        const [workforceRes, contractsRes] = await Promise.allSettled([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workforce/`),
          projects.length > 0
            ? axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projects[0].id}/contracts`)
            : Promise.reject(),
        ]);
        if (workforceRes.status === "fulfilled") {
          const wf = workforceRes.value.data.workforce || workforceRes.value.data || [];
          totalWorkers = Array.isArray(wf) ? wf.length : 0;
        }
        if (contractsRes.status === "fulfilled") {
          const contracts = contractsRes.value.data.contracts || [];
          totalContracts = contracts.length;
        }

        const predRes = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/cost-overrun`, {
          project_type: DEFAULT_PROJECT_TYPE,
          duration_months: avgDurationMonths,
          team_size: totalWorkers || DEFAULT_TEAM_SIZE,
          change_orders: 0,
          material_price_increase: Math.round(materialPriceIncrease * 10) / 10,
          weather_impact_days: 0,
          subcontractor_count: totalContracts,
        }).catch(() => null);
        if (predRes) setMlData(predRes.data);
      }

      if (burnRes.status === "fulfilled") {
        setBurnChartData(burnRes.value.data.data || []);
      }

      if (cashflowRes.status === "fulfilled") {
        setCashflowChartData(cashflowRes.value.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch cost data", err);
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/cost/analyze-report`,
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

  const tabBar = (
    <div className="flex gap-0 border-b border-border">
      {COST_TABS.map((t) => (
        <button key={t.id} onClick={() => setSubTab(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            subTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}>{t.label}</button>
      ))}
    </div>
  );

  if (subTab !== "overview") return (
    <div className="space-y-0">
      <ModuleTabs tabs={PROJECT_TABS} />
      {tabBar}
      {subTab === "evm"      && <div className="pt-6"><EVMPage /></div>}
      {subTab === "payments" && <div className="pt-6"><PaymentsPage /></div>}
      {subTab === "scenario" && <div className="pt-6"><ScenarioPage /></div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={PROJECT_TABS} />
      {tabBar}
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
        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx" onChange={handleFileUpload} />
        <Button className="gradient-blue text-white border-0" onClick={() => fileInputRef.current?.click()}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Upload Report
        </Button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(costKpis ? [
          {
            label: "Total Budget",
            value: fmtMoney(costKpis.totalBudget),
            trend: "up" as const,
            change: `${costKpis.projectCount} project${costKpis.projectCount !== 1 ? "s" : ""}`,
            color: "border-blue-500/20 bg-blue-500/5",
          },
          {
            label: "Spent to Date",
            value: fmtMoney(costKpis.spentToDate),
            trend: "up" as const,
            change: costKpis.totalBudget > 0
              ? `${((costKpis.spentToDate / costKpis.totalBudget) * 100).toFixed(1)}% of budget`
              : "—",
            color: "border-orange-500/20 bg-orange-500/5",
          },
          {
            label: "Remaining",
            value: fmtMoney(Math.abs(costKpis.remaining)),
            trend: (costKpis.remaining >= 0 ? "up" : "down") as "up" | "down",
            change: costKpis.totalBudget > 0
              ? `${((Math.abs(costKpis.remaining) / costKpis.totalBudget) * 100).toFixed(1)}% ${costKpis.remaining >= 0 ? "left" : "over"}`
              : "—",
            color: "border-red-500/20 bg-red-500/5",
          },
          {
            label: "Cost Overrun",
            value: `${costKpis.overrunPct.toFixed(1)}%`,
            trend: (costKpis.overrunPct > 0 ? "down" : "up") as "up" | "down",
            change: costKpis.overrunPct > 0 ? "Over budget" : "On budget",
            color: "border-emerald-500/20 bg-emerald-500/5",
          },
        ] : [
          { label: "Total Budget", value: "—", trend: "up" as const, change: "Loading…", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Spent to Date", value: "—", trend: "up" as const, change: "Loading…", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Remaining", value: "—", trend: "up" as const, change: "Loading…", color: "border-red-500/20 bg-red-500/5" },
          { label: "Cost Overrun", value: "—", trend: "up" as const, change: "Loading…", color: "border-emerald-500/20 bg-emerald-500/5" },
        ]).map((kpi, i) => (
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
          <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400">{CHART_LOOKBACK_MONTHS} Months</span>
        </div>
        {mlLoading ? (
          <div className="flex items-center justify-center h-56">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : burnChartData.length === 0 ? (
          <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
            No cost entries found — add cost entries to see burn rate
          </div>
        ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={burnChartData}>
              <defs>
                <linearGradient id="budget" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BURN_CHART_COLORS.budget} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={BURN_CHART_COLORS.budget} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BURN_CHART_COLORS.actual} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={BURN_CHART_COLORS.actual} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="budget" stroke={BURN_CHART_COLORS.budget} fill="url(#budget)" strokeWidth={2} name="Budget" />
              <Area type="monotone" dataKey="actual" stroke={BURN_CHART_COLORS.actual} fill="url(#actual)" strokeWidth={2} name="Actual" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-xs text-muted-foreground">Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-xs text-muted-foreground">Actual</span></div>
          </div>
        </>
        )}
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
              <p className="text-xs text-muted-foreground mt-0.5">Inflow vs Outflow ($K) — {CHART_LOOKBACK_MONTHS}mo historical + {CHART_FORECAST_MONTHS}mo projected</p>
            </div>
          </div>
          {mlLoading ? (
            <div className="flex items-center justify-center h-52">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : cashflowChartData.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
              No data — set project budgets to generate cash flow forecast
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashflowChartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="inflow"  fill={CASHFLOW_CHART_COLORS.inflow}  radius={[6, 6, 0, 0]} name="Inflow" />
              <Bar dataKey="outflow" fill={CASHFLOW_CHART_COLORS.outflow} radius={[6, 6, 0, 0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
          )}
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
              {materialPrices.length > 0 && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Market Prices</span>
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
                <span className="text-xs font-medium text-foreground w-16 text-right">${Number(m.price).toFixed(2)}/{m.unit}</span>
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
          totalBudget: costKpis ? fmtMoney(costKpis.totalBudget) : "—",
          spentToDate: costKpis ? fmtMoney(costKpis.spentToDate) : "—",
          remaining: costKpis ? fmtMoney(Math.abs(costKpis.remaining)) : "—",
          costOverrun: costKpis ? `${costKpis.overrunPct.toFixed(1)}%` : "—",
          mlPrediction: mlData,
          materialPrices,
        }}
      />
    </div>
  );
}