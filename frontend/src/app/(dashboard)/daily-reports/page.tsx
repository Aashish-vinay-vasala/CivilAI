"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, X, Loader2, Sparkles, Save,
  CloudSun, Users, Hammer, AlertTriangle, ChevronDown, Mic, MicOff,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import { supabase } from "@/lib/supabase";

interface DailyReport {
  id: string;
  project_id?: string;
  report_date: string;
  weather?: string;
  temperature?: string;
  manpower?: number;
  activities?: string;
  materials?: string;
  equipment_used?: string;
  safety_observations?: string;
  delays?: string;
  ai_report?: string;
  created_at: string;
}

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export default function DailyReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const emptyForm = {
    project_id: "", report_date: today, weather: "Clear", temperature: "",
    manpower: "", activities: "", materials: "", equipment_used: "",
    safety_observations: "", delays: "", ai_report: "",
  };
  const [form, setForm] = useState<any>(emptyForm);

  useEffect(() => {
    fetchProjects();
    fetchReports();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/`);
      const p = res.data.projects || [];
      setProjects(p);
      if (p[0]) setForm((f: any) => ({ ...f, project_id: p[0].id }));
    } catch {}
  };

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase.from("daily_reports").select("*").order("report_date", { ascending: false }).limit(30);
    setReports((data as DailyReport[]) || []);
    setLoading(false);
  };

  // Voice input via Web Speech API
  const startVoice = (field: string) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice not supported in this browser"); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.lang = "en-US";
    setListening(true);
    setActiveField(field);
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setForm((f: any) => ({ ...f, [field]: (f[field] ? f[field] + " " : "") + transcript }));
      setListening(false);
      setActiveField(null);
    };
    recognition.onerror = () => { setListening(false); setActiveField(null); };
    recognition.onend = () => { setListening(false); setActiveField(null); };
    recognition.start();
  };

  const generateAIReport = async () => {
    if (!form.activities) { toast.error("Add today's activities first"); return; }
    setGenerating(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Generate a professional daily site report for ${form.report_date}:
Weather: ${form.weather} ${form.temperature}
Workers on site: ${form.manpower}
Activities completed: ${form.activities}
Materials used: ${form.materials}
Equipment: ${form.equipment_used}
Safety observations: ${form.safety_observations}
Delays/issues: ${form.delays}

Write a structured report: Summary, Work Completed, Resources Used, Safety Notes, Issues & Delays, Tomorrow's Plan.`,
        context: "Daily Site Report",
      });
      const report = res.data?.response || res.data?.message || "";
      setForm((f: any) => ({ ...f, ai_report: report }));
      toast.success("AI report generated");
    } catch { toast.error("AI generation failed"); }
    finally { setGenerating(false); }
  };

  const handleSave = async () => {
    if (!form.report_date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("daily_reports").insert({
        ...form,
        id: crypto.randomUUID(),
        manpower: parseInt(form.manpower) || 0,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Daily report saved");
      setShowCreate(false);
      setForm(emptyForm);
      fetchReports();
    } catch { toast.error("Failed to save report"); }
    finally { setSaving(false); }
  };

  const VoiceButton = ({ field }: { field: string }) => (
    <button
      type="button"
      onClick={() => startVoice(field)}
      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${
        listening && activeField === field ? "text-red-400 bg-red-500/10" : "text-muted-foreground hover:text-foreground"
      }`}
      title="Speak to fill field"
    >
      {listening && activeField === field ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
    </button>
  );

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Daily Site Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-generated daily logs · voice input supported</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> New Report
        </button>
      </motion.div>

      {/* Report List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : reports.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground text-sm">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No reports yet
          </div>
        ) : reports.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-card border border-border rounded-2xl overflow-hidden">
            <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{r.report_date}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {r.weather && <span className="flex items-center gap-1 text-xs text-muted-foreground"><CloudSun className="w-3 h-3" />{r.weather}</span>}
                  {r.manpower ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3 h-3" />{r.manpower} workers</span> : null}
                  {r.ai_report && <span className="text-xs text-purple-400 flex items-center gap-1"><Sparkles className="w-3 h-3" />AI report</span>}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded === r.id ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {expanded === r.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                  <div className="p-5 space-y-3">
                    {r.activities && <div><p className="text-xs text-muted-foreground mb-1">Activities</p><p className="text-sm text-foreground">{r.activities}</p></div>}
                    {r.materials && <div><p className="text-xs text-muted-foreground mb-1">Materials</p><p className="text-sm text-foreground">{r.materials}</p></div>}
                    {r.safety_observations && (
                      <div className="flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div><p className="text-xs text-amber-400 mb-0.5">Safety</p><p className="text-sm text-foreground">{r.safety_observations}</p></div>
                      </div>
                    )}
                    {r.delays && <div><p className="text-xs text-muted-foreground mb-1">Delays / Issues</p><p className="text-sm text-foreground">{r.delays}</p></div>}
                    {r.ai_report && (
                      <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-purple-400" /><p className="text-xs text-purple-400 font-medium">AI Report</p></div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{r.ai_report}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-foreground">New Daily Report</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Mic className="w-3 h-3" /> Click the mic icon on any field to speak
                  </p>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                    <input type="date" className={inputClass} value={form.report_date} onChange={(e) => setForm((f: any) => ({ ...f, report_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Weather</label>
                    <select className={inputClass} value={form.weather} onChange={(e) => setForm((f: any) => ({ ...f, weather: e.target.value }))}>
                      {["Clear","Cloudy","Rainy","Windy","Stormy","Hot","Cold"].map((w) => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Workers</label>
                    <input type="number" className={inputClass} placeholder="0" value={form.manpower} onChange={(e) => setForm((f: any) => ({ ...f, manpower: e.target.value }))} />
                  </div>
                </div>

                {[
                  { key: "activities", label: "Activities Completed *", rows: 3, placeholder: "Work done today…" },
                  { key: "materials", label: "Materials Used", rows: 2, placeholder: "Concrete 20m³, rebar 500kg…" },
                  { key: "equipment_used", label: "Equipment Used", rows: 2, placeholder: "Crane, excavator…" },
                  { key: "safety_observations", label: "Safety Observations", rows: 2, placeholder: "Incidents, near-misses, toolbox talks…" },
                  { key: "delays", label: "Delays / Issues", rows: 2, placeholder: "Any delays, blockers, or issues…" },
                ].map(({ key, label, rows, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                    <div className="relative">
                      <textarea className={inputClass + " pr-8"} rows={rows} placeholder={placeholder}
                        value={form[key]} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))} />
                      <VoiceButton field={key} />
                    </div>
                  </div>
                ))}

                {form.ai_report && (
                  <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-purple-400" /><p className="text-xs text-purple-400 font-medium">AI Report</p></div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{form.ai_report}</p>
                  </div>
                )}

                <button onClick={generateAIReport} disabled={generating}
                  className="w-full py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate AI Report
                </button>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 rounded-xl gradient-blue text-white text-sm flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="Daily Site Reports" placeholder="Ask about today's report, summarize activities…" pageSummaryData={{ total: reports.length }} />
    </div>
  );
}
