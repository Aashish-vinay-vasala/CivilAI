"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, User, Loader2, Sparkles, Wrench,
  ChevronDown, ChevronRight, RefreshCw, Wand2,
  AlertTriangle, CheckCircle2, Send, FileText,
  Image as ImageIcon, AudioLines, X, Download,
  History, MessageSquare, Trash2, ListChecks,
  ShieldAlert, Clock, Zap, TrendingUp, Scale, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import VoiceButton from "@/components/shared/VoiceButton";
import { authHeaders } from "@/lib/apiAuth";
import { scoreOutput, type JudgeVerdict } from "@/lib/judgeClient";

const API          = process.env.NEXT_PUBLIC_API_URL ?? "";
const SESSION_KEY  = "civilai_agent_session";
const PROJECT_KEY  = "civilai_agent_project";

interface Project { id: string; name: string; status: string; }

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToolStep {
  tool:   string;
  input:  Record<string, unknown>;
  output: string | null;
  done:   boolean;
}

interface Message {
  id:          string;
  role:        "user" | "agent";
  content:     string;
  timestamp:   string;
  toolSteps:   ToolStep[];
  intent?:     string;
  confidence?: number;
  urgency?:    string;
  actionItems?: string[];
  streaming:   boolean;
}

interface AgentSession {
  session_id:   string;
  last_message: string;
  last_reply:   string;
  intent:       string;
  tool_steps:   { tool: string; output: string }[];
  updated_at:   string;
}

// ── Tool label mapping ─────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  analyze_schedule_data:    "Analysing Schedule",
  analyze_safety_data:      "Analysing Safety Report",
  analyze_cost_data:        "Analysing Cost Data",
  analyze_contract_data:    "Analysing Contract",
  calculate_evm_metrics:    "Calculating EVM Metrics",
  assess_compliance_data:   "Checking Compliance",
  analyze_equipment_data:   "Analysing Equipment",
  generate_document:        "Generating Document",
  analyze_vendor_data:      "Scoring Vendor",
  analyze_payment_data:     "Analysing Payments",
  analyze_workforce_data:   "Analysing Workforce",
  analyze_procurement_data: "Analysing Procurement",
  assess_green_metrics:     "Assessing Sustainability",
  analyze_bim_data:         "Analysing BIM / Clashes",
  run_what_if_scenario:     "Running What-If Scenario",
  generate_advanced_report: "Generating Advanced Report",
};

const INTENT_LABELS: Record<string, string> = {
  schedule_analysis:    "Schedule",
  safety_analysis:      "Safety",
  cost_analysis:        "Cost",
  contract_analysis:    "Contract",
  workforce_analysis:   "Workforce",
  procurement_analysis: "Procurement",
  compliance_analysis:  "Compliance",
  equipment_analysis:   "Equipment",
  evm_calculation:      "EVM",
  document_generation:  "Document",
  vendor_scoring:       "Vendor",
  payment_tracking:     "Payments",
  sustainability:       "Green / ESG",
  bim_coordination:     "BIM",
  what_if_scenario:     "What-If",
  general_advice:       "General",
  greeting:             "Greeting",
};

const URGENCY_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  critical: { label: "Critical", color: "#ef4444", icon: ShieldAlert },
  high:     { label: "High",     color: "#f97316", icon: AlertTriangle },
  medium:   { label: "Medium",   color: "#eab308", icon: Clock },
  low:      { label: "Low",      color: "#22c55e", icon: Zap },
};

const QUICK_PROMPTS = [
  "Calculate EVM: PV=$500k, EV=$430k, AC=$490k",
  "What are OSHA's top 10 construction violations?",
  "Draft an RFI for delayed concrete delivery",
  "Score this vendor: 5 years experience, 2 late deliveries, ISO certified",
  "Run what-if: add 10 workers to concrete crew",
  "Generate a stakeholder report for a delayed bridge project",
  "Assess sustainability: 50 tonnes concrete waste, diesel generators on site",
];

const AUDIO_EXTS = new Set(["mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (AUDIO_EXTS.has(ext)) return AudioLines;
  if (IMAGE_EXTS.has(ext)) return ImageIcon;
  return FileText;
}

function renderContent(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: string }) {
  const label = INTENT_LABELS[intent] ?? intent;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
      {label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#eab308" : "#f97316";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
      <TrendingUp className="w-2.5 h-2.5" />
      {pct}% confident
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const cfg = URGENCY_CONFIG[urgency];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, color: cfg.color }}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function ToolCard({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[step.tool] ?? step.tool;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="rounded-xl overflow-hidden"
      style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-amber-500/5 transition-colors"
      >
        <Wrench className={cn("w-3.5 h-3.5 shrink-0", step.done ? "text-emerald-400" : "text-amber-400 animate-pulse")} />
        <span className="text-xs text-amber-300/80 flex-1 font-medium">{label}</span>
        {step.done
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        }
        {step.done && (open
          ? <ChevronDown  className="w-3 h-3 text-white/30 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {open && step.done && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-2"
          >
            {Object.keys(step.input).length > 0 && (
              <div>
                <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wider">Input</p>
                <pre className="text-[10px] text-white/50 whitespace-pre-wrap break-words font-mono bg-black/20 rounded-lg p-2">
                  {JSON.stringify(step.input, null, 2).slice(0, 600)}
                </pre>
              </div>
            )}
            {step.output && (
              <div>
                <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wider">Output</p>
                <p className="text-[11px] text-white/60 whitespace-pre-wrap leading-relaxed">
                  {step.output.slice(0, 600)}{step.output.length > 600 ? "…" : ""}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ActionItems({ items }: { items: string[] }) {
  return (
    <div className="mt-2 rounded-xl p-3 space-y-1.5"
      style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}>
      <p className="text-[10px] text-cyan-400/70 uppercase tracking-wider font-semibold mb-1">Action Items</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <CheckCircle2 className="w-3 h-3 text-cyan-400/60 mt-0.5 shrink-0" />
          <span className="text-[11px] text-white/60 leading-relaxed">{item}</span>
        </div>
      ))}
    </div>
  );
}

// Inline verdict from the LLM Judge (backend/app/api/v1/routes/judge.py,
// agent_copilot_reply rubric — checks tool-use appropriateness and grounding
// against what the tools actually returned, not just prose quality).
function AgentJudgePanel({ verdict, expanded, onToggle }: { verdict: JudgeVerdict; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,212,255,0.12)" }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {verdict.degraded ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : verdict.passed ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          )}
          <span className="text-xs text-white/60">
            {verdict.degraded ? "Judge unavailable" : `Judge score: ${verdict.overall_score.toFixed(1)}/10`}
          </span>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/[0.06] pt-2">
          <p className="text-[11px] text-white/50 leading-relaxed">{verdict.summary}</p>
          {verdict.criteria.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-white/40">{c.name}</span>
              <span className="text-white/30">{c.score.toFixed(1)}/10</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentBubble({
  msg,
  onExtractActions,
  onJudge,
  judging,
  verdict,
  judgePanelOpen,
  onToggleJudgePanel,
}: {
  msg: Message;
  onExtractActions: (id: string, content: string) => void;
  onJudge?: () => void;
  judging?: boolean;
  verdict?: JudgeVerdict;
  judgePanelOpen?: boolean;
  onToggleJudgePanel?: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      {msg.toolSteps.length > 0 && (
        <div className="ml-11 space-y-1.5">
          {msg.toolSteps.map((step, i) => <ToolCard key={i} step={step} />)}
        </div>
      )}
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(29,78,216,0.18))", border: "1px solid rgba(0,212,255,0.25)" }}>
          <Bot className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 space-y-1.5">
          {/* Badges row */}
          {(msg.intent || msg.confidence !== undefined || msg.urgency) && (
            <div className="flex flex-wrap gap-1.5">
              {msg.intent    && <IntentBadge    intent={msg.intent} />}
              {msg.confidence !== undefined && <ConfidenceBadge confidence={msg.confidence} />}
              {msg.urgency   && <UrgencyBadge   urgency={msg.urgency} />}
            </div>
          )}

          <div className="max-w-[88%] px-4 py-3 rounded-2xl rounded-tl-none text-sm leading-relaxed text-white/80 whitespace-pre-wrap"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {msg.content
              ? renderContent(msg.content)
              : (msg.streaming && (
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              ))
            }
          </div>

          {msg.actionItems && msg.actionItems.length > 0 && (
            <div className="max-w-[88%]">
              <ActionItems items={msg.actionItems} />
            </div>
          )}

          {verdict && (
            <div className="max-w-[88%]">
              <AgentJudgePanel verdict={verdict} expanded={!!judgePanelOpen} onToggle={() => onToggleJudgePanel?.()} />
            </div>
          )}

          <div className="flex items-center gap-3 pl-1">
            <p className="text-[10px] text-white/25">{msg.timestamp}</p>
            {!msg.streaming && msg.content && !msg.actionItems && (
              <button
                onClick={() => onExtractActions(msg.id, msg.content)}
                className="flex items-center gap-1 text-[10px] text-white/25 hover:text-cyan-400/70 transition-colors"
              >
                <ListChecks className="w-3 h-3" />
                Extract Actions
              </button>
            )}
            {!msg.streaming && msg.content && !verdict && (
              <button
                onClick={() => onJudge?.()}
                disabled={judging}
                className="flex items-center gap-1 text-[10px] text-white/25 hover:text-cyan-400/70 transition-colors disabled:opacity-40"
              >
                {judging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scale className="w-3 h-3" />}
                Judge this
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function UserBubble({ msg }: { msg: Message }) {
  const FileIcon = msg.content.startsWith("📎") ? FileText : undefined;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 flex-row-reverse">
      <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="max-w-[78%] space-y-1">
        <div className="px-4 py-3 rounded-2xl rounded-tr-none text-sm leading-relaxed text-white whitespace-pre-wrap"
          style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(29,78,216,0.18))", border: "1px solid rgba(0,212,255,0.2)" }}>
          {msg.content}
        </div>
        <p className="text-[10px] text-white/25 text-right pr-1">{msg.timestamp}</p>
      </div>
    </motion.div>
  );
}

function DataHint({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs mb-3"
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span className="text-amber-300/70">
            Paste your schedule, report, or data in the message box so the agent can analyse it.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── History Panel ──────────────────────────────────────────────────────────────

function HistoryPanel({
  onLoad,
}: {
  onLoad: (sessionId: string) => void;
}) {
  const [sessions,  setSessions]  = useState<AgentSession[]>([]);
  const [fetching,  setFetching]  = useState(false);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch(`${API}/api/v1/agent/sessions`, { headers: await authHeaders() });
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const deleteSession = async (sid: string) => {
    setDeleting(sid);
    try {
      await fetch(`${API}/api/v1/agent/sessions/${sid}`, { method: "DELETE", headers: await authHeaders() });
      setSessions((prev) => prev.filter((s) => s.session_id !== sid));
    } catch {}
    setDeleting(null);
  };

  if (fetching) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-cyan-400/60" />
    </div>
  );

  if (!sessions.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <History className="w-10 h-10 text-white/10 mb-3" />
      <p className="text-sm text-white/30">No saved sessions yet</p>
      <p className="text-xs text-white/20 mt-1">Sessions are saved automatically after each conversation</p>
    </div>
  );

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/30">{sessions.length} saved session{sessions.length !== 1 ? "s" : ""}</p>
        <button onClick={fetchSessions} className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {sessions.map((s) => (
        <div key={s.session_id} className="rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-3 px-4 py-3">
            <MessageSquare className="w-4 h-4 text-cyan-400/50 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium truncate">{s.last_message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {s.intent && <IntentBadge intent={s.intent} />}
                <p className="text-[10px] text-white/25">
                  {new Date(s.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExpanded(expanded === s.session_id ? null : s.session_id)}
                className="p-1 text-white/25 hover:text-white/60 transition-colors"
              >
                {expanded === s.session_id
                  ? <ChevronDown  className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />
                }
              </button>
              <button
                onClick={() => onLoad(s.session_id)}
                className="p-1 text-cyan-400/40 hover:text-cyan-400 transition-colors"
                title="Continue this session"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deleteSession(s.session_id)}
                disabled={deleting === s.session_id}
                className="p-1 text-white/20 hover:text-red-400 transition-colors"
              >
                {deleting === s.session_id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2  className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          </div>

          <AnimatePresence>
            {expanded === s.session_id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t px-4 py-3 space-y-2"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Last Reply</p>
                  <p className="text-[11px] text-white/50 leading-relaxed line-clamp-4">{s.last_reply}</p>
                </div>
                {s.tool_steps?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Tools Used</p>
                    <div className="flex flex-wrap gap-1">
                      {s.tool_steps.map((t, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                          {TOOL_LABELS[t.tool] ?? t.tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

type Tab = "chat" | "history";

export default function AgentPage() {
  const [tab,           setTab]           = useState<Tab>("chat");
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [sessionId,     setSessionId]     = useState("");
  const [dataHint,      setDataHint]      = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading,     setUploading]     = useState(false);
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectOpen,   setProjectOpen]   = useState(false);
  const [judgeResults,   setJudgeResults]   = useState<Record<string, JudgeVerdict>>({});
  const [judgingIds,     setJudgingIds]     = useState<Set<string>>(new Set());
  const [judgePanelOpen, setJudgePanelOpen] = useState<Set<string>>(new Set());

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const docInputRef  = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const audInputRef  = useRef<HTMLInputElement>(null);

  // Load projects for selector
  useEffect(() => {
    fetch(`${API}/api/v1/projects/`)
      .then((r) => r.json())
      .then((d) => {
        const list: Project[] = (d.projects ?? d ?? []).slice(0, 30);
        setProjects(list);
        // Restore last selected project
        try {
          const saved = localStorage.getItem(PROJECT_KEY);
          if (saved) {
            const p = list.find((x) => x.id === saved);
            if (p) setSelectedProject(p);
          } else if (list.length > 0) {
            setSelectedProject(list[0]);
            localStorage.setItem(PROJECT_KEY, list[0].id);
          }
        } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedProject) {
      try { localStorage.setItem(PROJECT_KEY, selectedProject.id); } catch {}
    }
  }, [selectedProject]);

  useEffect(() => {
    let sid = "";
    try { sid = localStorage.getItem(SESSION_KEY) ?? ""; } catch {}
    if (!sid) {
      sid = `agent_${Date.now()}`;
      try { localStorage.setItem(SESSION_KEY, sid); } catch {}
    }
    setSessionId(sid);
    setMessages([{
      id: "welcome", role: "agent",
      content: "Hi! I'm CivilAI Agent — I have direct access to your live project data in the database.\n\nSelect a project above, then ask me anything: schedule status, cost overruns, safety incidents, workforce gaps, equipment health, overdue payments, compliance issues, and more. I pull real data automatically.",
      timestamp: new Date().toLocaleTimeString(),
      toolSteps: [], streaming: false,
    }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addFile = (f: File | undefined) => {
    if (!f) return;
    setAttachedFiles((prev) => [...prev, f]);
  };

  const removeFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && attachedFiles.length === 0) || loading) return;
    setInput("");
    setDataHint(false);

    const isFileOnly = !msg && attachedFiles.length > 0;
    const fileNames  = attachedFiles.map((f) => f.name).join(", ");
    const displayContent = attachedFiles.length > 0
      ? `📎 ${fileNames}${msg ? `\n${msg}` : ""}`
      : msg;

    const userMsg: Message = {
      id: crypto.randomUUID(), role: "user",
      content: displayContent,
      timestamp: new Date().toLocaleTimeString(),
      toolSteps: [], streaming: false,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const filesToSend = [...attachedFiles];
    setAttachedFiles([]);

    const agentId = crypto.randomUUID();
    const placeholder: Message = {
      id: agentId, role: "agent", content: "",
      timestamp: new Date().toLocaleTimeString(),
      toolSteps: [], streaming: true,
    };
    setMessages((prev) => [...prev, placeholder]);

    try {
      if (filesToSend.length > 0) {
        // Upload first file via multipart; additional files queued as text context
        setUploading(true);
        const form = new FormData();
        form.append("file",       filesToSend[0]);
        form.append("message",    msg || "Analyse this file and provide a detailed assessment.");
        form.append("session_id", sessionId);
        if (selectedProject) form.append("project_id", selectedProject.id);

        const res  = await fetch(`${API}/api/v1/agent/upload`, { method: "POST", body: form, headers: await authHeaders() });
        const data = await res.json();
        setUploading(false);

        const reply = data.reply ?? "Analysis complete.";
        setMessages((prev) => prev.map((m) =>
          m.id === agentId
            ? {
                ...m,
                content:   reply,
                intent:    data.intent,
                toolSteps: (data.tool_steps ?? []).map((s: { tool: string; input?: Record<string, unknown>; output?: string }) => ({
                  tool: s.tool, input: s.input ?? {}, output: s.output ?? null, done: true,
                })),
                streaming: false,
              }
            : m
        ));
      } else {
        // SSE streaming for text-only
        const res = await fetch(`${API}/api/v1/agent/stream`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body:    JSON.stringify({ message: msg, session_id: sessionId, project_id: selectedProject?.id ?? "" }),
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type:          string;
                content?:      string;
                tool?:         string;
                input?:        Record<string, unknown>;
                output?:       string;
                intent?:       string;
                confidence?:   number;
                urgency?:      string;
                requires_data?: boolean;
                session_id?:   string;
              };

              if (event.type === "intent") {
                if (event.session_id) {
                  setSessionId(event.session_id);
                  try { localStorage.setItem(SESSION_KEY, event.session_id); } catch {}
                }
                if (event.requires_data) setDataHint(true);
                setMessages((prev) => prev.map((m) =>
                  m.id === agentId
                    ? { ...m, intent: event.intent, confidence: event.confidence, urgency: event.urgency }
                    : m
                ));
              } else if (event.type === "token" && event.content) {
                setMessages((prev) => prev.map((m) =>
                  m.id === agentId ? { ...m, content: m.content + event.content } : m
                ));
              } else if (event.type === "tool_start" && event.tool) {
                setMessages((prev) => prev.map((m) => {
                  if (m.id !== agentId) return m;
                  return { ...m, toolSteps: [...m.toolSteps, { tool: event.tool!, input: event.input ?? {}, output: null, done: false }] };
                }));
              } else if (event.type === "tool_end" && event.tool) {
                setMessages((prev) => prev.map((m) => {
                  if (m.id !== agentId) return m;
                  const steps = m.toolSteps.map((s) =>
                    s.tool === event.tool && !s.done
                      ? { ...s, output: event.output ?? "", done: true }
                      : s
                  );
                  return { ...m, toolSteps: steps };
                }));
              } else if (event.type === "done") {
                setMessages((prev) => prev.map((m) =>
                  m.id === agentId ? { ...m, streaming: false } : m
                ));
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Agent error";
      setMessages((prev) => prev.map((m) =>
        m.id === agentId
          ? { ...m, content: `Sorry, an error occurred: ${errMsg}`, streaming: false }
          : m
      ));
    } finally {
      setLoading(false);
      setUploading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, sessionId, attachedFiles]);

  // Scores an agent reply against the agent_copilot_reply rubric via the LLM
  // Judge (backend/app/api/v1/routes/judge.py) — checks whether tools were
  // used appropriately and the reply is consistent with tool output, not
  // just prose quality. `context` is the preceding user turn.
  const judgeMessage = async (id: string, content: string, context?: string) => {
    setJudgingIds((prev) => new Set(prev).add(id));
    try {
      const verdict = await scoreOutput("agent_copilot_reply", content, context);
      setJudgeResults((prev) => ({ ...prev, [id]: verdict }));
      setJudgePanelOpen((prev) => new Set(prev).add(id));
    } catch {
      // Review aid, not core chat functionality — fail silently, button stays for retry.
    } finally {
      setJudgingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const toggleJudgePanel = (id: string) => {
    setJudgePanelOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const extractActionItems = async (msgId: string, content: string) => {
    try {
      const res  = await fetch(`${API}/api/v1/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: `Extract a concise numbered list of specific action items from this text. Return only the action items, one per line, no preamble:\n\n${content.slice(0, 3000)}`,
          session_id: `extract_${Date.now()}`,
        }),
      });
      const data = await res.json();
      const raw  = (data.response ?? "") as string;
      const items = raw
        .split("\n")
        .map((l: string) => l.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((l: string) => l.length > 5)
        .slice(0, 10);
      if (items.length) {
        setMessages((prev) => prev.map((m) =>
          m.id === msgId ? { ...m, actionItems: items } : m
        ));
      }
    } catch {}
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 18;
    let y = 20;

    doc.setFontSize(16);
    doc.setTextColor(0, 180, 220);
    doc.text("CivilAI Agent — Conversation Export", margin, y);
    y += 7;
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Session: ${sessionId}   Exported: ${new Date().toLocaleString()}`, margin, y);
    y += 10;

    for (const msg of messages) {
      if (msg.id === "welcome") continue;
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const who = msg.role === "user" ? "You" : "AI Agent";
      doc.text(`[${who}] ${msg.timestamp}`, margin, y);
      y += 4;

      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(msg.content || "(streaming)", pageW - margin * 2);
      if (y + lines.length * 5 > 275) { doc.addPage(); y = 20; }
      doc.text(lines, margin, y);
      y += lines.length * 5 + 6;

      if (msg.actionItems?.length) {
        doc.setFontSize(8);
        doc.setTextColor(0, 180, 220);
        doc.text("Action Items:", margin, y); y += 4;
        doc.setTextColor(60, 60, 60);
        for (const item of msg.actionItems) {
          const al = doc.splitTextToSize(`• ${item}`, pageW - margin * 2 - 4);
          if (y + al.length * 4 > 275) { doc.addPage(); y = 20; }
          doc.text(al, margin + 2, y);
          y += al.length * 4 + 2;
        }
        y += 4;
      }
    }

    doc.save(`civilai-agent-${Date.now()}.pdf`);
  };

  const loadSession = (sid: string) => {
    setSessionId(sid);
    try { localStorage.setItem(SESSION_KEY, sid); } catch {}
    setTab("chat");
    setMessages([{
      id: "resume", role: "agent",
      content: `Session ${sid.slice(0, 20)}… loaded. Continue asking questions.`,
      timestamp: new Date().toLocaleTimeString(),
      toolSteps: [], streaming: false,
    }]);
  };

  const clearSession = () => {
    const newSid = `agent_${Date.now()}`;
    setSessionId(newSid);
    try { localStorage.setItem(SESSION_KEY, newSid); } catch {}
    setMessages([{
      id: "welcome-new", role: "agent",
      content: "New session started. Paste your data or ask me anything.",
      timestamp: new Date().toLocaleTimeString(), toolSteps: [], streaming: false,
    }]);
    setAttachedFiles([]);
    setDataHint(false);
  };

  const onVoiceResult = (transcript: string, response: string) => {
    if (transcript) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user",  content: transcript, timestamp: new Date().toLocaleTimeString(), toolSteps: [], streaming: false },
        { id: crypto.randomUUID(), role: "agent", content: response,   timestamp: new Date().toLocaleTimeString(), toolSteps: [], streaming: false },
      ]);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const chatReady = messages.length > 1 && !loading;

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(29,78,216,0.18))", border: "1px solid rgba(0,212,255,0.25)", boxShadow: "0 0 20px rgba(0,212,255,0.12)" }}>
            <Wand2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">AI Agent</h1>
            <p className="text-white/35 text-[13px] mt-1">LangGraph ReAct · 18 live-data tools · SSE streaming</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chatReady && (
            <Button variant="ghost" size="icon" onClick={exportPDF} title="Export PDF"
              className="text-muted-foreground hover:text-cyan-400 w-8 h-8">
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={clearSession} title="New session"
            className="text-muted-foreground hover:text-foreground w-8 h-8">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Project selector */}
      {projects.length > 0 && (
        <div className="relative shrink-0 mb-2">
          <button
            onClick={() => setProjectOpen((v) => !v)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm text-left transition-colors"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            <span className="text-white/80 font-medium flex-1 truncate">
              {selectedProject ? selectedProject.name : "Select a project…"}
            </span>
            {selectedProject && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF" }}>
                {selectedProject.status}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
          </button>

          <AnimatePresence>
            {projectOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: "rgba(8,12,24,0.98)", border: "1px solid rgba(0,212,255,0.2)", maxHeight: 240, overflowY: "auto" }}
              >
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProject(p); setProjectOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-cyan-500/5 transition-colors"
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                      p.status === "active" ? "bg-emerald-400" :
                      p.status === "completed" ? "bg-blue-400" : "bg-amber-400"
                    )} />
                    <span className="text-white/70 flex-1 truncate">{p.name}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{p.status}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b shrink-0 mb-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        {([
          { id: "chat",    label: "Chat",    icon: MessageSquare },
          { id: "history", label: "History", icon: History       },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* History tab */}
      {tab === "history" && (
        <div className="flex-1 overflow-y-auto">
          <HistoryPanel onLoad={loadSession} />
        </div>
      )}

      {/* Chat tab */}
      {tab === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto space-y-5 pr-1 mb-4">
            {messages.map((msg, idx) => {
              if (msg.role === "user") return <UserBubble key={msg.id} msg={msg} />;
              const precedingUser = idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].content : undefined;
              return (
                <AgentBubble
                  key={msg.id}
                  msg={msg}
                  onExtractActions={extractActionItems}
                  onJudge={() => judgeMessage(msg.id, msg.content, precedingUser)}
                  judging={judgingIds.has(msg.id)}
                  verdict={judgeResults[msg.id]}
                  judgePanelOpen={judgePanelOpen.has(msg.id)}
                  onToggleJudgePanel={() => toggleJudgePanel(msg.id)}
                />
              );
            })}

            {messages.length === 1 && !loading && (
              <div className="pt-2 ml-11">
                <p className="text-[11px] text-white/30 mb-2">Try asking…</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button key={p} onClick={() => send(p)}
                      className="text-xs px-3 py-1.5 rounded-full transition-colors text-white/50 hover:text-white/80"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <DataHint show={dataHint} />

          {/* Input bar */}
          <div className="shrink-0 rounded-2xl p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>

            {/* Attached file chips */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachedFiles.map((f, i) => {
                  const Icon = fileIcon(f.name);
                  return (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.18)" }}>
                      <Icon className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="text-[11px] text-cyan-400 truncate max-w-[120px]">{f.name}</span>
                      <button onClick={() => removeFile(i)} className="text-cyan-400/50 hover:text-cyan-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  attachedFiles.length > 0
                    ? "Ask a question about this file…"
                    : "Ask a question or paste schedule / cost / contract data…"
                }
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-h-[36px] max-h-48 py-2 px-1 leading-relaxed"
                style={{ scrollbarWidth: "none" }}
              />

              {/* Hidden file inputs */}
              <input ref={docInputRef} type="file" className="hidden"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt"
                onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={imgInputRef} type="file" className="hidden"
                accept=".png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={audInputRef} type="file" className="hidden"
                accept=".mp3,.wav,.webm,.m4a,.ogg,.flac,.mp4"
                onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />

              <div className="flex items-center gap-1 shrink-0">
                {/* File attach buttons */}
                <button onClick={() => docInputRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-blue-400 transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  title="Attach PDF or document">
                  <FileText className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => imgInputRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-emerald-400 transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  title="Attach image">
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => audInputRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-amber-400 transition-colors"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  title="Attach audio">
                  <AudioLines className="w-3.5 h-3.5" />
                </button>

                <VoiceButton
                  chatHistory={messages.map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }))}
                  onResult={onVoiceResult}
                  size="md"
                />
                <Button
                  onClick={() => send()}
                  disabled={(!input.trim() && attachedFiles.length === 0) || loading}
                  size="icon"
                  className="w-9 h-9 rounded-xl border-0 shrink-0"
                  style={{
                    background: (!input.trim() && attachedFiles.length === 0) || loading
                      ? "rgba(0,212,255,0.08)"
                      : "linear-gradient(135deg,rgba(0,212,255,0.3),rgba(29,78,216,0.3))",
                    border: "1px solid rgba(0,212,255,0.2)",
                  }}
                >
                  {uploading
                    ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    : loading
                    ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    : <Send    className="w-4 h-4 text-cyan-400" />
                  }
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-white/20 mt-1.5 pl-1">
              Enter to send · Shift+Enter for new line · Agent picks tools automatically · Streams in real time
            </p>
          </div>
        </>
      )}
    </div>
  );
}
