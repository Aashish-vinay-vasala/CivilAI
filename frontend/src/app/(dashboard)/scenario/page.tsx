"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

interface Scenario {
  id: string;
  name: string;
  color: string;
  budget: number;
  duration: number;
  laborCost: number;
  materialCost: number;
  contingency: number;
}

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"];

function projectCashflow(s: Scenario) {
  const months = s.duration;
  return Array.from({ length: months }, (_, i) => {
    const progress = (i + 1) / months;
    const sCurve = 3 * progress ** 2 - 2 * progress ** 3;
    const planned = s.budget * sCurve;
    const contingencyFactor = 1 + (s.contingency / 100) * (0.5 + Math.random() * 0.5);
    const actual = planned * contingencyFactor;
    return { month: `M${i + 1}`, planned: Math.round(planned / 1000), actual: Math.round(actual / 1000) };
  });
}

const DEFAULT_SCENARIOS: Scenario[] = [
  { id: "base", name: "Base Case", color: COLORS[0], budget: 5000000, duration: 18, laborCost: 35, materialCost: 45, contingency: 10 },
  { id: "optimistic", name: "Optimistic", color: COLORS[1], budget: 4500000, duration: 15, laborCost: 30, materialCost: 42, contingency: 5 },
];

export default function ScenarioPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [selected, setSelected] = useState<string[]>(["base", "optimistic"]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const addScenario = () => {
    const id = crypto.randomUUID();
    setScenarios((s) => [...s, {
      id, name: `Scenario ${s.length + 1}`, color: COLORS[s.length % COLORS.length],
      budget: 5000000, duration: 18, laborCost: 35, materialCost: 45, contingency: 10,
    }]);
    setSelected((s) => [...s, id]);
  };

  const updateScenario = (id: string, field: keyof Scenario, value: string | number) =>
    setScenarios((s) => s.map((sc) => sc.id === id ? { ...sc, [field]: value } : sc));

  const removeScenario = (id: string) => {
    setScenarios((s) => s.filter((sc) => sc.id !== id));
    setSelected((s) => s.filter((x) => x !== id));
  };

  const activeScenarios = scenarios.filter((s) => selected.includes(s.id));

  // Build combined chart data across the longest scenario
  const maxMonths = Math.max(...activeScenarios.map((s) => s.duration), 1);
  const chartData = Array.from({ length: maxMonths }, (_, i) => {
    const point: Record<string, number | string> = { month: `M${i + 1}` };
    activeScenarios.forEach((s) => {
      const data = projectCashflow(s);
      point[s.name] = data[i]?.planned ?? null;
    });
    return point;
  });

  const analyzeWithAI = async () => {
    setAnalyzing(true);
    try {
      const summary = activeScenarios.map((s) =>
        `${s.name}: $${(s.budget / 1e6).toFixed(1)}M budget, ${s.duration} months, ${s.contingency}% contingency`
      ).join("\n");
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Analyze these construction project scenarios and provide: risk assessment, recommended scenario, cost optimization suggestions, and schedule recommendations:\n\n${summary}`,
        context: "Scenario Planner",
      });
      setAnalysis(res.data?.response || "");
      toast.success("AI analysis complete");
    } catch { toast.error("AI analysis failed"); }
    finally { setAnalyzing(false); }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Scenario Planner</h1>
          <p className="text-muted-foreground text-sm mt-1">Model what-if budget & schedule scenarios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={analyzeWithAI} disabled={analyzing || activeScenarios.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Analysis
          </button>
          <button onClick={addScenario}
            className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Scenario
          </button>
        </div>
      </motion.div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenarios.map((s) => (
          <motion.div key={s.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className={`bg-card border rounded-2xl p-5 transition-all ${selected.includes(s.id) ? "border-blue-500/40" : "border-border"}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <input
                  className="text-sm font-semibold text-foreground bg-transparent border-none outline-none w-32"
                  value={s.name}
                  onChange={(e) => updateScenario(s.id, "name", e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setSelected((sel) => sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selected.includes(s.id) ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "text-muted-foreground border-border"}`}
                >{selected.includes(s.id) ? "Active" : "Hidden"}</button>
                <button onClick={() => removeScenario(s.id)} className="text-muted-foreground hover:text-red-400 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Budget ($)", key: "budget", type: "number", min: 100000, step: 100000 },
                { label: "Duration (months)", key: "duration", type: "number", min: 1, step: 1 },
                { label: "Labor cost (%)", key: "laborCost", type: "number", min: 0, step: 1 },
                { label: "Material cost (%)", key: "materialCost", type: "number", min: 0, step: 1 },
                { label: "Contingency (%)", key: "contingency", type: "number", min: 0, step: 1 },
              ].map(({ label, key, ...attrs }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <input
                    {...attrs}
                    value={(s as any)[key]}
                    onChange={(e) => updateScenario(s.id, key as keyof Scenario, parseFloat(e.target.value) || 0)}
                    className="w-28 text-right px-2 py-1 bg-secondary border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex justify-between text-xs">
              <span className="text-muted-foreground">Total Cost Est.</span>
              <span className="text-foreground font-semibold">
                ${((s.budget * (1 + s.contingency / 100)) / 1e6).toFixed(2)}M
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart */}
      {activeScenarios.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-4">Cumulative Cost Projection ($K)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                {activeScenarios.map((s) => (
                  <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Legend />
              {activeScenarios.map((s) => (
                <Area key={s.id} type="monotone" dataKey={s.name} stroke={s.color} fill={`url(#grad-${s.id})`} strokeWidth={2} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* AI Analysis */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <p className="text-sm font-semibold text-foreground">AI Scenario Analysis</p>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat context="Scenario Planner" placeholder="Which scenario is safer? What if labor costs rise 20%?" pageSummaryData={{ scenarios: scenarios.map((s) => s.name) }} />
    </div>
  );
}
