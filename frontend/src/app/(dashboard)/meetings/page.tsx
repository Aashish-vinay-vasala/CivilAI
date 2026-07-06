"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileSpreadsheet, Plus, X, Loader2, Sparkles, Save, Clock, Users, ChevronDown } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";
import { MarkdownText } from "@/lib/renderMarkdown";
import { supabase } from "@/lib/supabase";

const CONSTRUCTION_MODULE_TABS = [
  { href: "/construction",   label: "Construction" },
  { href: "/daily-reports",  label: "Daily Reports" },
  { href: "/rfis",           label: "RFIs" },
  { href: "/meetings",       label: "Meetings" },
];
import { useAuth } from "@/lib/auth";

interface Meeting {
  id: string;
  title: string;
  date: string;
  location?: string;
  attendees?: string;
  agenda?: string;
  discussion?: string;
  action_items?: string;
  ai_summary?: string;
  created_at: string;
}

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyForm = { title: "", date: new Date().toISOString().split("T")[0], location: "", attendees: "", agenda: "", discussion: "", action_items: "", ai_summary: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchMeetings(); }, []);

  const fetchMeetings = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("meeting_minutes").select("*").order("date", { ascending: false }).limit(50);
    setMeetings((data as Meeting[]) || []);
    setLoading(false);
  };

  const generateAISummary = async () => {
    if (!form.discussion && !form.agenda) { toast.error("Add agenda or discussion notes first"); return; }
    setGenerating(true);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`, {
        message: `Generate a professional meeting minutes summary for the following meeting:
Title: ${form.title}
Date: ${form.date}
Attendees: ${form.attendees}
Agenda: ${form.agenda}
Discussion: ${form.discussion}
Action Items: ${form.action_items}

Format with: Executive Summary, Key Decisions, Action Items (with owner and due date if mentioned), Next Steps.`,
        context: "Meeting Minutes",
      });
      const summary = res.data?.response || res.data?.message || "";
      setForm((f) => ({ ...f, ai_summary: summary }));
      toast.success("AI summary generated");
    } catch { toast.error("AI generation failed"); }
    finally { setGenerating(false); }
  };

  const handleSave = async () => {
    if (!form.title) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("meeting_minutes").insert({
        ...form,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Meeting minutes saved");
      setShowCreate(false);
      setForm(emptyForm);
      fetchMeetings();
    } catch { toast.error("Failed to save meeting"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={CONSTRUCTION_MODULE_TABS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Meeting Minutes</h1>
          <p className="text-muted-foreground text-sm mt-1">Structure & save meeting notes with AI</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> New Meeting
        </button>
      </motion.div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
        ) : meetings.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground text-sm">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No meetings yet — create the first one
          </div>
        ) : meetings.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-card border border-border rounded-2xl overflow-hidden">
            <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{m.date}</span>
                  {m.attendees && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3 h-3" />{m.attendees.split(",").length} attendees</span>}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded === m.id ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {expanded === m.id && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden border-t border-border">
                  <div className="p-5 space-y-4">
                    {m.agenda && <div><p className="text-xs text-muted-foreground mb-1">Agenda</p><p className="text-sm text-foreground whitespace-pre-wrap">{m.agenda}</p></div>}
                    {m.discussion && <div><p className="text-xs text-muted-foreground mb-1">Discussion</p><p className="text-sm text-foreground whitespace-pre-wrap">{m.discussion}</p></div>}
                    {m.action_items && <div><p className="text-xs text-muted-foreground mb-1">Action Items</p><p className="text-sm text-foreground whitespace-pre-wrap">{m.action_items}</p></div>}
                    {m.ai_summary && (
                      <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-cyan-400" /><p className="text-xs text-cyan-400 font-medium">AI Summary</p></div>
                        <MarkdownText text={m.ai_summary} className="text-sm text-foreground" />
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
                <h3 className="font-semibold text-foreground">New Meeting Minutes</h3>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                    <input className={inputClass} placeholder="e.g. Weekly Site Meeting" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                    <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                    <input className={inputClass} placeholder="e.g. Site Office, Room 2" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Attendees</label>
                    <input className={inputClass} placeholder="John, Sarah, Mike…" value={form.attendees} onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Agenda</label>
                  <textarea className={inputClass} rows={3} placeholder="Meeting topics…" value={form.agenda} onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Discussion Notes</label>
                  <textarea className={inputClass} rows={4} placeholder="Key points discussed…" value={form.discussion} onChange={(e) => setForm((f) => ({ ...f, discussion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Action Items</label>
                  <textarea className={inputClass} rows={3} placeholder="Tasks assigned, owners, deadlines…" value={form.action_items} onChange={(e) => setForm((f) => ({ ...f, action_items: e.target.value }))} />
                </div>
                {form.ai_summary && (
                  <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-cyan-400" /><p className="text-xs text-cyan-400 font-medium">AI Summary</p></div>
                    <MarkdownText text={form.ai_summary} className="text-sm text-foreground" />
                  </div>
                )}
                <button onClick={generateAISummary} disabled={generating}
                  className="w-full py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors flex items-center justify-center gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate AI Summary
                </button>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 rounded-xl gradient-blue text-white text-sm flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Minutes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="Meeting Minutes" placeholder="Summarize this meeting, extract action items…" pageSummaryData={{ total: meetings.length }} />
    </div>
  );
}
