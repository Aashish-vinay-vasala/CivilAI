"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Upload,
  Loader2,
  UserPlus,
  Brain,
  Phone,
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Filter,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";

const initialWorkers = [
  { id: 1, name: "John Smith", role: "Senior Engineer", trade: "Civil", status: "active", hoursToday: 8, phone: "+1 555-0101" },
  { id: 2, name: "Sarah Johnson", role: "Foreman", trade: "Structural", status: "active", hoursToday: 7.5, phone: "+1 555-0102" },
  { id: 3, name: "Mike Wilson", role: "Electrician", trade: "MEP", status: "active", hoursToday: 8, phone: "+1 555-0103" },
  { id: 4, name: "Tom Brown", role: "Laborer", trade: "General", status: "onleave", hoursToday: 0, phone: "+1 555-0104" },
  { id: 5, name: "Lisa Davis", role: "Plumber", trade: "MEP", status: "active", hoursToday: 6.5, phone: "+1 555-0105" },
  { id: 6, name: "James Lee", role: "Crane Operator", trade: "Heavy Equipment", status: "active", hoursToday: 8, phone: "+1 555-0106" },
  { id: 7, name: "Emily Chen", role: "Safety Officer", trade: "Safety", status: "active", hoursToday: 7, phone: "+1 555-0107" },
  { id: 8, name: "Robert Garcia", role: "Welder", trade: "Structural", status: "inactive", hoursToday: 0, phone: "+1 555-0108" },
];

const skillsData = [
  { skill: "Concrete", available: 85, required: 90 },
  { skill: "Steel", available: 60, required: 80 },
  { skill: "Electrical", available: 45, required: 70 },
  { skill: "Plumbing", available: 70, required: 65 },
  { skill: "Carpentry", available: 90, required: 85 },
  { skill: "Safety", available: 75, required: 90 },
];

const radarData = [
  { skill: "Technical", score: 78 },
  { skill: "Safety", score: 85 },
  { skill: "Leadership", score: 62 },
  { skill: "Communication", score: 71 },
  { skill: "Equipment", score: 88 },
  { skill: "Planning", score: 65 },
];

interface Worker {
  id: number;
  name: string;
  role: string;
  trade: string;
  status: string;
  hoursToday: number;
  phone: string;
}

export default function WorkforcePage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>(initialWorkers);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [worker, setWorker] = useState({ name: "", role: "", experience_years: 0, start_date: "" });
  const [plan, setPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [workforceStats, setWorkforceStats] = useState<any>(null);
  const [mlTurnover, setMlTurnover] = useState<any>(null);
  const [mlLoading, setMlLoading] = useState(true);
  const [turnoverData, setTurnoverData] = useState<any[]>([
    { month: "Jan", hired: 12, left: 5 },
    { month: "Feb", hired: 8, left: 7 },
    { month: "Mar", hired: 15, left: 4 },
    { month: "Apr", hired: 6, left: 9 },
    { month: "May", hired: 10, left: 6 },
    { month: "Jun", hired: 14, left: 3 },
  ]);
  const [newWorker, setNewWorker] = useState({
    name: "", role: "", trade: "", phone: "", status: "active", hoursToday: 0,
  });

  useEffect(() => { fetchWorkforceData(); }, []);

  const fetchWorkforceData = async () => {
    setMlLoading(true);
    try {
      const statsRes = await axios.get("http://localhost:8000/api/v1/ml/workforce-stats");
      setWorkforceStats(statsRes.data);
      if (statsRes.data?.turnover_by_role) {
        const roles = Object.entries(statsRes.data.turnover_by_role);
        setTurnoverData(roles.map(([role, rate]: any) => ({
          month: role,
          left: Math.round(rate * 100),
          hired: Math.round(rate * 80),
        })));
      }
      const mlRes = await axios.post("http://localhost:8000/api/v1/ml/turnover", {
        role: "Laborer", experience_years: 2, salary: 35000,
        performance_score: 65, safety_violations: 2,
        training_hours: 10, overtime_hours: 30, tenure_months: 8,
      });
      setMlTurnover(mlRes.data);
    } catch (err) {
      console.error(err);
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
      const response = await axios.post("http://localhost:8000/api/v1/workforce/analyze", formData);
      setAnalysis(response.data.analysis);
      toast.success("Workforce data analyzed!");
    } catch { toast.error("Failed to analyze"); }
    finally { setLoading(false); }
  };

  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const response = await axios.post("http://localhost:8000/api/v1/workforce/onboarding-plan", worker);
      setPlan(response.data.plan);
      toast.success("Onboarding plan generated!");
    } catch { toast.error("Failed to generate plan"); }
    finally { setPlanLoading(false); }
  };

  const addWorker = () => {
    if (!newWorker.name || !newWorker.role) {
      toast.error("Name and role are required!");
      return;
    }
    setWorkers([...workers, { ...newWorker, id: workers.length + 1 }]);
    setNewWorker({ name: "", role: "", trade: "", phone: "", status: "active", hoursToday: 0 });
    setAddWorkerOpen(false);
    toast.success("Worker added!");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "onleave": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      default: return "bg-red-500/10 text-red-400 border-red-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case "onleave": return <Clock className="w-3.5 h-3.5 text-orange-400" />;
      default: return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    }
  };

  const filteredWorkers = workers.filter(w => {
    const matchSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.role.toLowerCase().includes(search.toLowerCase()) ||
      w.trade.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered workforce management & planning</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddWorkerOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2 text-emerald-400" />
            Add Worker
          </Button>
          <Button variant="outline" onClick={() => setOnboardingOpen(!onboardingOpen)}>
            <UserPlus className="w-4 h-4 mr-2 text-blue-400" />
            Onboard
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
          { label: "Total Workers", value: workforceStats ? `${workforceStats.total_workers}` : `${workers.length}`, trend: "up", change: "+12", color: "border-blue-500/20 bg-blue-500/5" },
          { label: "Active Today", value: `${workers.filter(w => w.status === "active").length}`, trend: "up", change: "", color: "border-emerald-500/20 bg-emerald-500/5" },
          { label: "Turnover Rate", value: workforceStats ? `${workforceStats.turnover_rate_pct}%` : "8.2%", trend: "down", change: "-1.2%", color: "border-orange-500/20 bg-orange-500/5" },
          { label: "Avg Performance", value: workforceStats ? `${Math.round(workforceStats.avg_performance_score)}%` : "76%", trend: "up", change: "+5", color: "border-purple-500/20 bg-purple-500/5" },
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
            {kpi.change && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {kpi.change}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* ML Prediction */}
      {!mlLoading && mlTurnover && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-5 ${
            mlTurnover.risk_level === "High" ? "border-red-500/30 bg-red-500/5" :
            mlTurnover.risk_level === "Medium" ? "border-orange-500/30 bg-orange-500/5" :
            "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">AI Turnover Risk Prediction</p>
                <p className="text-xl font-bold text-foreground">{mlTurnover.probability}% turnover probability</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mlTurnover.will_leave ? "High retention risk — action needed" : "Workforce stable"}
                </p>
              </div>
            </div>
            <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
              mlTurnover.risk_level === "High" ? "bg-red-500/10 text-red-400" :
              mlTurnover.risk_level === "Medium" ? "bg-orange-500/10 text-orange-400" :
              "bg-emerald-500/10 text-emerald-400"
            }`}>
              {mlTurnover.risk_level} Risk
            </span>
          </div>
        </motion.div>
      )}

      {/* Add Worker Modal */}
      <AnimatePresence>
        {addWorkerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-emerald-500/30 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Add New Worker</h3>
              <Button variant="ghost" size="icon" onClick={() => setAddWorkerOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Full Name *</label>
                <input placeholder="Worker name" value={newWorker.name} onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Role *</label>
                <input placeholder="e.g. Electrician" value={newWorker.role} onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Trade</label>
                <select value={newWorker.trade} onChange={(e) => setNewWorker({ ...newWorker, trade: e.target.value })} className={inputClass}>
                  <option value="">Select trade</option>
                  <option>Civil</option>
                  <option>Structural</option>
                  <option>MEP</option>
                  <option>Safety</option>
                  <option>Heavy Equipment</option>
                  <option>General</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
                <input placeholder="+1 555-0000" value={newWorker.phone} onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
                <select value={newWorker.status} onChange={(e) => setNewWorker({ ...newWorker, status: e.target.value })} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="onleave">On Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Hours Today</label>
                <input type="number" value={newWorker.hoursToday} onChange={(e) => setNewWorker({ ...newWorker, hoursToday: parseFloat(e.target.value) })} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addWorker} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Worker
              </Button>
              <Button variant="outline" onClick={() => setAddWorkerOpen(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Form */}
      <AnimatePresence>
        {onboardingOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-blue-500/30 rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">AI Onboarding Plan Generator</h3>
              <Button variant="ghost" size="icon" onClick={() => setOnboardingOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input placeholder="Worker name" value={worker.name} onChange={(e) => setWorker({ ...worker, name: e.target.value })} className={inputClass} />
              <input placeholder="Role / Position" value={worker.role} onChange={(e) => setWorker({ ...worker, role: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Years of experience" value={worker.experience_years} onChange={(e) => setWorker({ ...worker, experience_years: parseInt(e.target.value) })} className={inputClass} />
              <input type="date" value={worker.start_date} onChange={(e) => setWorker({ ...worker, start_date: e.target.value })} className={inputClass} />
            </div>
            <Button onClick={generatePlan} disabled={planLoading} className="gradient-blue text-white border-0">
              {planLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Generate Plan
            </Button>
            {plan && (
              <div className="mt-4 p-4 bg-secondary rounded-xl">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{plan}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Worker Profiles */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Worker Profiles</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                placeholder="Search workers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-40"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-secondary border border-border rounded-xl text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="onleave">On Leave</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-6 gap-4 px-4 py-2 text-xs text-muted-foreground font-medium border-b border-border mb-2">
          <span className="col-span-2">Worker</span>
          <span>Trade</span>
          <span>Status</span>
          <span>Hours Today</span>
          <span>Phone</span>
        </div>

        <div className="space-y-1">
          {filteredWorkers.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="grid grid-cols-6 gap-4 items-center px-4 py-3 rounded-xl hover:bg-secondary/50 transition-colors group"
            >
              <div className="col-span-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {w.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground">{w.trade || "—"}</span>
              </div>
              <div>
                <span className={`text-xs px-2 py-1 rounded-full border font-medium flex items-center gap-1 w-fit ${getStatusBadge(w.status)}`}>
                  {getStatusIcon(w.status)}
                  {w.status === "active" ? "Active" : w.status === "onleave" ? "On Leave" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">{w.hoursToday}h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground">{w.phone || "—"}</span>
              </div>
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
          <h3 className="font-semibold text-foreground mb-6">Skills Gap Analysis</h3>
          <div className="space-y-4">
            {skillsData.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-foreground w-20">{item.skill}</span>
                <div className="flex-1 bg-secondary rounded-full h-2 relative">
                  <div className="absolute h-2 rounded-full bg-blue-500/20" style={{ width: `${item.required}%` }} />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.available}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                    className={`absolute h-2 rounded-full ${item.available >= item.required ? "bg-emerald-500" : "bg-red-500"}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{item.available}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-foreground">Turnover by Role</h3>
            {workforceStats && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Live Data</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={turnoverData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", color: "#f8fafc", fontSize: "12px" }} />
              <Bar dataKey="hired" fill="#10b981" radius={[6, 6, 0, 0]} name="Hired %" />
              <Bar dataKey="left" fill="#ef4444" radius={[6, 6, 0, 0]} name="Left %" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-blue-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis}</p>
        </motion.div>
      )}

      <ModuleChat
        context="Workforce Management"
        placeholder="Ask about workers, skills, turnover..."
        pageSummaryData={{
          totalWorkers: workers.length,
          activeWorkers: workers.filter(w => w.status === "active").length,
          turnoverRate: workforceStats?.turnover_rate_pct,
          mlPrediction: mlTurnover,
        }}
      />
    </div>
  );
}