"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, X, Loader2, Sparkles, Mic, MicOff, Volume2, Gauge, Globe, Copy, Check,
  Maximize2, Minimize2, Plus, History as HistoryIcon, Download, ChevronLeft, Trash2, ChevronDown,
  Image as ImageIcon, FileAudio, FileText, RefreshCw, Search, Activity, Wrench, CheckCircle2,
  Scale, XCircle, AlertTriangle, ChevronUp, Square,
} from "lucide-react";
import axios from "axios";
import ChatText from "@/components/shared/ChatText";
import { faviconProxyUrl } from "@/lib/chatTokenize";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { speak as speakText, stopSpeaking as stopSpeakingPlayback, fetchGroqVoices, type VoiceChoice } from "@/lib/ttsPlayback";
import { buildChatPdf } from "@/lib/chatPdf";
import {
  streamChat, sendVoiceChat, uploadFileChat, saveTranscript, fetchSessionHistory,
  listSessions, upsertSession, deleteSession,
  type SavedSession,
} from "@/lib/copilotClient";
import {
  useChatWidgetStore,
  type ChatMessage as Message,
} from "@/lib/stores/chatWidgetStore";
import type { ToolEvent } from "@/lib/copilotClient";
import { scoreOutput, type JudgeVerdict } from "@/lib/judgeClient";

const POSITION_KEY    = "civilai_widget_pos";
const SPEECH_RATE_KEY = "civilai_widget_speech_rate";
const SPEECH_RATES    = [0.75, 1, 1.25, 1.5, 1.75, 2];
const VOICE_KEY       = "civilai_widget_voice";
const AUTO_SPEAK_KEY  = "civilai_widget_autospeak";
const DEFAULT_VOICES  = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const BUTTON_SIZE     = 48;
const DRAG_THRESHOLD  = 5;
const SCALE_KEY       = "civilai_widget_scale";

// Sizes for the "open" scales — the bubble itself (closed/`open === false`) is
// the widget's minimized state. Clicking the scale icon cycles mid → large →
// fullscreen → mid. Fullscreen has no fixed w/h — it fills the viewport.
const PANEL_SIZES = {
  mid:   { w: 340, h: 440 },
  large: { w: 640, h: 760 },
} as const;
type PanelScale = "mid" | "large" | "fullscreen";
const SCALE_ORDER: PanelScale[] = ["mid", "large", "fullscreen"];
const SCALE_LABELS: Record<PanelScale, string> = { mid: "Mid", large: "Large", fullscreen: "Full Screen" };
const API             = process.env.NEXT_PUBLIC_API_URL ?? "";
const UPLOAD_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";
const UPLOAD_AUDIO_ACCEPT = ".mp3,.wav,.webm,.m4a,.ogg,.flac";
const UPLOAD_DOC_ACCEPT   = ".pdf,.docx,.doc,.xlsx,.xls,.csv";
const UPLOAD_AUDIO_EXTS = new Set(["mp3", "wav", "webm", "m4a", "ogg", "flac"]);
const UPLOAD_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

type VoiceState = "idle" | "recording" | "processing" | "speaking";

interface ModuleChatProps {
  context: string;
  placeholder?: string;
  pageSummaryData?: Record<string, unknown>;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function defaultPos() {
  return {
    x: window.innerWidth  - BUTTON_SIZE - 20,
    y: window.innerHeight - BUTTON_SIZE - 20,
  };
}

// Human-readable labels for the agent's tool calls — see backend/app/ai/agent_copilot.py _TOOLS.
const TOOL_LABELS: Record<string, string> = {
  list_projects:            "Listing Projects",
  get_project_dashboard:    "Building Project Dashboard",
  analyze_schedule_data:    "Analysing Schedule",
  analyze_safety_data:      "Analysing Safety Report",
  analyze_cost_data:        "Analysing Cost Data",
  analyze_contract_data:    "Analysing Contract",
  analyze_contract_terms:   "Analysing Contract Terms",
  calculate_evm_metrics:    "Calculating EVM Metrics",
  assess_compliance_data:   "Checking Compliance",
  analyze_equipment_data:   "Analysing Equipment",
  generate_document:        "Generating Document",
  analyze_vendor_data:      "Scoring Vendor",
  analyze_payment_data:     "Analysing Payments",
  get_accounting_reconciliation: "Reconciling Accounts",
  analyze_workforce_data:   "Analysing Workforce",
  analyze_procurement_data: "Analysing Procurement",
  assess_green_metrics:     "Assessing Sustainability",
  analyze_punch_list_data:  "Analysing Punch List",
  summarize_meetings:       "Summarising Meeting Minutes",
  get_evm_history:          "Analysing EVM Trend",
  analyze_bim_data:         "Analysing BIM / Clashes",
  extract_material_prices_from_text: "Extracting Material Prices",
  extract_budget_items_from_text:    "Extracting Budget Items",
  run_what_if_scenario:     "Running What-If Scenario",
  generate_advanced_report: "Generating Advanced Report",
};

// Compact "tool used" chips shown above an assistant reply — while a tool is
// running it pulses, once done it shows a checkmark (details aren't expanded
// here, unlike the full Agent page, to keep the floating widget lightweight).
function ToolStepChips({ steps }: { steps: NonNullable<Message["toolSteps"]> }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {steps.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", color: "#fbbf24" }}
        >
          {s.done
            ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            : <Wrench className="w-2.5 h-2.5 animate-pulse" />
          }
          {TOOL_LABELS[s.tool] ?? s.tool}
        </span>
      ))}
    </div>
  );
}

// Compact inline verdict from the LLM Judge (backend/app/api/v1/routes/judge.py,
// copilot_chat rubric) — mirrors the Copilot page's JudgePanel but scaled down
// for the narrow floating-widget panel width.
function MiniJudgePanel({ verdict, expanded, onToggle }: { verdict: JudgeVerdict; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,212,255,0.12)" }}>
      <button onMouseDown={e => e.stopPropagation()} onClick={onToggle} className="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 text-[10px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {verdict.degraded ? (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          ) : verdict.passed ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
          )}
          <span className="text-white/60 truncate">
            {verdict.degraded ? "Judge unavailable" : `Score: ${verdict.overall_score.toFixed(1)}/10`}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-white/25 shrink-0" /> : <ChevronDown className="w-3 h-3 text-white/25 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-white/[0.06] pt-1.5">
          <p className="text-[10px] text-white/50 leading-relaxed">{verdict.summary}</p>
          {verdict.criteria.map(c => (
            <div key={c.name} className="flex items-center justify-between gap-2 text-[9px]">
              <span className="text-white/40 truncate">{c.name}</span>
              <span className="text-white/30 shrink-0">{c.score.toFixed(1)}/10</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_FOLLOWUPS = ["What needs attention?", "Show key risks", "Give recommendations"];
const GENERIC_HEADINGS = new Set(["overview", "summary", "overview / status assessment", "status assessment"]);

// Turns the bold section headings the copilot's own system prompt produces
// (e.g. "**Recommended Actions**") into follow-up chips — no extra LLM call needed.
function extractFollowUps(text: string): string[] {
  const headings = [...text.matchAll(/\*\*([^*]{3,40})\*\*/g)].map(m => m[1].trim());
  const picked = headings.filter(h => !GENERIC_HEADINGS.has(h.toLowerCase()));
  const seen = new Set<string>();
  const unique = picked.filter(h => (seen.has(h.toLowerCase()) ? false : (seen.add(h.toLowerCase()), true)));
  return unique.slice(0, 3).map(h => `Tell me more about ${h}`);
}

function getFollowUps(messages: Message[]): string[] {
  if (messages.length === 0) return [];
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return [];
  if (messages.length <= 1) return DEFAULT_FOLLOWUPS;
  const smart = extractFollowUps(last.content);
  return smart.length >= 3 ? smart : [...smart, ...DEFAULT_FOLLOWUPS].slice(0, 3);
}

// ── Usage gauges ─────────────────────────────────────────────────────────────
// No provider exposes a "quota remaining" API, so this reflects OUR OWN daily
// counters (see backend/app/services/usage_tracker.py) against configured
// estimated limits — not a live-synced number from Groq/Gemini.
interface UsageMetric { used: number; limit: number; }
interface UsageSnapshot {
  date: string;
  llm_tokens: UsageMetric;
  images: UsageMetric;
  audio: UsageMetric;
  web_search: UsageMetric;
}

function usageColor(pctRemaining: number): string {
  if (pctRemaining > 50) return "#34D399"; // plenty left
  if (pctRemaining > 20) return "#FBBF24"; // getting low
  return "#F87171";                        // nearly exhausted
}

interface UsageBarDatum { label: string; value: number; color: string; }

function usageToBarData(usage: UsageSnapshot): UsageBarDatum[] {
  const remainingPct = (m: UsageMetric) =>
    Math.max(0, Math.min(100, Math.round((1 - m.used / Math.max(1, m.limit)) * 100)));
  return ([
    ["Tokens", usage.llm_tokens],
    ["Images", usage.images],
    ["Audio",  usage.audio],
    ["Web",    usage.web_search],
  ] as [string, UsageMetric][]).map(([label, m]) => {
    const pct = remainingPct(m);
    return { label, value: pct, color: usageColor(pct) };
  });
}

// Thin horizontal meter — the track (unused portion) stays neutral/uncolored,
// only the used portion is filled with the health color; brightens slightly on hover.
function UsageBar2D({ label, value, color }: UsageBarDatum) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] font-semibold text-white/60 w-12 shrink-0">{label}</span>
      <div
        className="relative flex-1 rounded-full"
        style={{ height: 5, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          whileHover={{ filter: "brightness(1.3)", scaleY: 1.8 }}
          transition={{ width: { duration: 0.9, ease: "easeOut" }, filter: { duration: 0.15 }, scaleY: { duration: 0.15 } }}
          className="absolute left-0 top-0 bottom-0 rounded-full cursor-default"
          style={{ background: color, boxShadow: `0 0 6px ${color}70` }}
        />
      </div>
      <span className="text-[9px] font-semibold w-8 text-right shrink-0" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function ModuleChat({
  context,
  placeholder,
  pageSummaryData,
}: ModuleChatProps) {
  const {
    open, setOpen,
    messages, setMessages,
    webSearch, setWebSearch,
    sessionId, sessionLabel,
    hydrated, hydrateFromServer,
    startNewSession, loadSession,
  } = useChatWidgetStore();

  const router = useRouter();

  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [streaming,      setStreaming]      = useState(false);
  const [autoSpeak,      setAutoSpeak]      = useState(false);
  const [summarizing,    setSummarizing]    = useState(false);
  const [voiceState,     setVoiceState]     = useState<VoiceState>("idle");
  const [speechRate,     setSpeechRate]     = useState(1);
  const [groqVoices,     setGroqVoices]     = useState<string[]>(DEFAULT_VOICES);
  const [browserVoices,  setBrowserVoices]  = useState<SpeechSynthesisVoice[]>([]);
  const [voiceChoice,    setVoiceChoice]    = useState<VoiceChoice>({ engine: "groq", name: "autumn" });
  const [showVoicePicker,setShowVoicePicker]= useState(false);
  const [voiceMenuPos,   setVoiceMenuPos]   = useState<{ top: number; left: number } | null>(null);
  const [copiedKey,      setCopiedKey]      = useState<string | null>(null);
  const [speakingKey,    setSpeakingKey]    = useState<string | null>(null);
  const [scale,          setScale]          = useState<PanelScale>("mid");
  const [pos,            setPos]            = useState<{ x: number; y: number } | null>(null);
  const [dragging,       setDragging]       = useState(false);
  const [showHistory,    setShowHistory]    = useState(false);
  const [sessions,       setSessions]       = useState<SavedSession[]>([]);
  const [sessionsLoading,setSessionsLoading]= useState(false);
  const [historySearch,  setHistorySearch]  = useState("");
  const [showUsage,      setShowUsage]      = useState(false);
  const [usageData,      setUsageData]      = useState<UsageSnapshot | null>(null);
  const [usageLoading,   setUsageLoading]   = useState(false);
  const [pdfState,       setPdfState]       = useState<"idle" | "saving" | "saved">("idle");
  const [uploadStatus,   setUploadStatus]   = useState<string | null>(null);
  const [judgeResults,   setJudgeResults]   = useState<Record<number, JudgeVerdict>>({});
  const [judgingIdx,     setJudgingIdx]     = useState<Set<number>>(new Set());
  const [judgePanelOpen, setJudgePanelOpen] = useState<Set<number>>(new Set());

  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const speechRateRef   = useRef(1);
  const voiceChoiceRef  = useRef<VoiceChoice>({ engine: "groq", name: "autumn" });
  const hasExplicitVoiceRef = useRef(false);
  const voiceBtnRef     = useRef<HTMLButtonElement>(null);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const audioInputRef   = useRef<HTMLInputElement>(null);
  const docInputRef     = useRef<HTMLInputElement>(null);
  const dragOffset      = useRef({ x: 0, y: 0 });
  const startMouse      = useRef({ x: 0, y: 0 });
  const hasDragged      = useRef(false);
  const abortRef        = useRef<AbortController | null>(null);

  // ── Position init ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        setPos({
          x: clamp(p.x, 0, window.innerWidth  - BUTTON_SIZE),
          y: clamp(p.y, 0, window.innerHeight - BUTTON_SIZE),
        });
        return;
      }
    } catch {}
    setPos(defaultPos());
  }, []);

  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  useEffect(() => {
    const onResize = () => setPos(p => p ? {
      x: clamp(p.x, 0, window.innerWidth  - BUTTON_SIZE),
      y: clamp(p.y, 0, window.innerHeight - BUTTON_SIZE),
    } : defaultPos());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Panel scale (persisted) — mid / large / fullscreen ──────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCALE_KEY);
      if (saved === "mid" || saved === "large" || saved === "fullscreen") setScale(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SCALE_KEY, scale); } catch {}
  }, [scale]);

  const cycleScale = () => setScale(s => SCALE_ORDER[(SCALE_ORDER.indexOf(s) + 1) % SCALE_ORDER.length]);

  // ── Speech rate (persisted) ────────────────────────────────────────
  useEffect(() => {
    const saved = Number(localStorage.getItem(SPEECH_RATE_KEY));
    if (SPEECH_RATES.includes(saved)) { setSpeechRate(saved); speechRateRef.current = saved; }
  }, []);

  const cycleSpeechRate = () => {
    const idx  = SPEECH_RATES.indexOf(speechRate);
    const next = SPEECH_RATES[(idx + 1) % SPEECH_RATES.length];
    setSpeechRate(next);
    speechRateRef.current = next;
    try { localStorage.setItem(SPEECH_RATE_KEY, String(next)); } catch {}
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // ── Auto-speak (persisted) — read every assistant reply aloud automatically ──
  useEffect(() => {
    try { setAutoSpeak(localStorage.getItem(AUTO_SPEAK_KEY) === "1"); } catch {}
  }, []);

  const toggleAutoSpeak = () => {
    setAutoSpeak(v => {
      const next = !v;
      try { localStorage.setItem(AUTO_SPEAK_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  // ── TTS voice (persisted) — browser (Google/Microsoft) voices + Groq AI voices ──
  useEffect(() => {
    (async () => {
      const list = await fetchGroqVoices();
      if (list.length) setGroqVoices(list);
    })();

    try {
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as VoiceChoice;
        setVoiceChoice(parsed);
        voiceChoiceRef.current = parsed;
        hasExplicitVoiceRef.current = true;
      }
    } catch {}

    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadBrowserVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      setBrowserVoices(list);
      // Default to a browser (Google/Microsoft) voice unless the user already
      // picked something explicitly — this is the recommended, zero-setup option.
      if (!hasExplicitVoiceRef.current) {
        const preferred = list.find(v => /^en/i.test(v.lang)) ?? list[0];
        const choice: VoiceChoice = { engine: "browser", voiceURI: preferred.voiceURI, name: preferred.name };
        setVoiceChoice(choice);
        voiceChoiceRef.current = choice;
      }
    };
    loadBrowserVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadBrowserVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadBrowserVoices);
  }, []);

  const selectVoice = (choice: VoiceChoice) => {
    setVoiceChoice(choice);
    voiceChoiceRef.current = choice;
    hasExplicitVoiceRef.current = true;
    setShowVoicePicker(false);
    try { localStorage.setItem(VOICE_KEY, JSON.stringify(choice)); } catch {}
  };

  const voiceLabel = voiceChoice.engine === "browser" ? voiceChoice.name.replace(/\s*\(.*\)\s*$/, "") : voiceChoice.name;

  const filteredSessions = (() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s =>
      s.label?.toLowerCase().includes(q) || (s.messages ?? []).some(m => m.content?.toLowerCase().includes(q))
    );
  })();

  // The dropdown is portaled to <body> (see below) so it isn't clipped by the
  // panel's own overflow-hidden — position it from the trigger button's rect.
  const toggleVoicePicker = () => {
    if (!showVoicePicker && voiceBtnRef.current) {
      const rect = voiceBtnRef.current.getBoundingClientRect();
      const menuWidth = 280;
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      setVoiceMenuPos({ top: rect.bottom + 6, left });
    }
    setShowVoicePicker(v => !v);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
    } catch {}
  };

  // Scores an assistant reply against the copilot_chat rubric via the LLM
  // Judge (backend/app/api/v1/routes/judge.py) — same rubric the full
  // Copilot page's chat tab uses. `context` is the preceding user turn.
  const judgeMessage = async (idx: number, content: string, context?: string) => {
    setJudgingIdx(prev => new Set(prev).add(idx));
    try {
      const verdict = await scoreOutput("copilot_chat", content, context);
      setJudgeResults(prev => ({ ...prev, [idx]: verdict }));
      setJudgePanelOpen(prev => new Set(prev).add(idx));
    } catch {
      // Review aid, not core chat functionality — fail silently, button stays for retry.
    } finally {
      setJudgingIdx(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }
  };

  const toggleJudgePanel = (idx: number) => {
    setJudgePanelOpen(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ── Chat helpers ─────────────────────────────────────────────────
  // On first open, try to resume the shared session's server history (the same
  // history the Copilot page loads) before falling back to the welcome message.
  useEffect(() => {
    if (!open || messages.length > 0 || hydrated) return;
    (async () => {
      const history = await fetchSessionHistory(sessionId);
      if (history.length > 0) {
        hydrateFromServer(history);
      } else {
        hydrateFromServer([{
          role: "assistant",
          content: `I'm your CivilAI assistant for ${context}. Ask me anything or tap "Summarize Page" to get an AI summary!`,
        }]);
      }
    })();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  // Auto-save the conversation to Supabase as it grows (debounced), so it shows
  // up in the Voice Bot module's History tab and can be reopened later.
  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = setTimeout(() => {
      const firstUser = messages.find(m => m.role === "user");
      upsertSession(sessionId, (firstUser?.content ?? context).slice(0, 80), messages);
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, sessionId, context]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // ── Sessions: new chat / history list ──────────────────────────────
  const fetchSessions = async () => {
    setSessionsLoading(true);
    setSessions(await listSessions());
    setSessionsLoading(false);
  };

  const openHistory = () => {
    setShowHistory(true);
    setHistorySearch("");
    fetchSessions();
  };

  const fetchUsage = async () => {
    setUsageLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/copilot/usage`);
      setUsageData(res.data);
    } catch {
      setUsageData(null);
    } finally {
      setUsageLoading(false);
    }
  };

  const openUsage = () => {
    setShowUsage(true);
    fetchUsage();
  };

  const handleLoadSession = (s: SavedSession) => {
    loadSession(s.id, s.messages ?? [], s.label ?? "");
    setShowHistory(false);
  };

  const handleDeleteSession = async (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    await deleteSession(id);
  };

  const handleNewChat = () => {
    startNewSession();
    setShowHistory(false);
  };

  // ── Save conversation as PDF (downloads + stores in Supabase for History) ──
  const handleDownloadPdf = async () => {
    if (messages.length <= 1 || pdfState === "saving") return;
    setPdfState("saving");
    try {
      const doc = await buildChatPdf(messages, { context });
      const filename = `civilai-chat-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      const pdfBlob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
      await saveTranscript(pdfBlob, filename, messages, sessionLabel || context);

      setPdfState("saved");
      setTimeout(() => setPdfState("idle"), 1500);
    } catch {
      setPdfState("idle");
    }
  };

  // Streams the assistant's reply token-by-token into a placeholder message that's
  // already appended to `historyForRequest` (so both `send` and `regenerateResponse`
  // can share this — the only difference between them is what history they pass in).
  const streamAssistantReply = async (question: string, historyForRequest: Message[]) => {
    setLoading(true);
    setStreaming(true);
    setMessages(prev => [...prev, { role: "assistant" as const, content: "", toolSteps: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await streamChat(
        { message: `[Context: ${context}] ${question}`, sessionId, chatHistory: historyForRequest, webSearch },
        (delta) => setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + delta };
          return copy;
        }),
        (toolEvent: ToolEvent) => setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          const steps = last.toolSteps ?? [];
          if (toolEvent.phase === "start") {
            copy[copy.length - 1] = { ...last, toolSteps: [...steps, { tool: toolEvent.tool, input: toolEvent.input ?? {}, output: null, done: false }] };
          } else {
            copy[copy.length - 1] = {
              ...last,
              toolSteps: steps.map(s => (s.tool === toolEvent.tool && !s.done) ? { ...s, output: toolEvent.output ?? "", done: true } : s),
            };
          }
          return copy;
        }),
        controller.signal,
      );
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: result.text, sources: result.sources, toolSteps: result.toolSteps };
        return copy;
      });
      if (autoSpeak && result.text) speak(result.text, `msg-${historyForRequest.length}`);
    } catch (err) {
      if ((err as { name?: string } | undefined)?.name === "AbortError") {
        // User stopped generation — keep the partial text that already streamed in,
        // just finalize any tool steps still mid-flight so they stop pulsing.
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, toolSteps: (last.toolSteps ?? []).map(s => ({ ...s, done: true })) };
          return copy;
        });
      } else {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Error. Please try again." };
          return copy;
        });
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: msg }];
    setMessages(newMessages);
    await streamAssistantReply(msg, newMessages);
  };

  // Re-asks the question behind a given assistant reply, discarding that reply (and
  // anything after it) and streaming a fresh one in its place.
  const regenerateResponse = async (assistantIndex: number) => {
    if (loading) return;
    let uIdx = assistantIndex - 1;
    while (uIdx >= 0 && messages[uIdx].role !== "user") uIdx--;
    if (uIdx < 0) return;
    const question  = messages[uIdx].content;
    const truncated = messages.slice(0, assistantIndex);
    setMessages(truncated);
    await streamAssistantReply(question, truncated);
  };

  // Upload an image / audio clip / document (PDF, DOCX, XLSX, CSV) — the backend
  // extracts its content (Gemini vision OCR for images, Whisper for audio, text/
  // table extraction for documents) and answers the question against it, optionally
  // blended with live web search results, exactly like a typed question.
  const sendFile = async (file: File) => {
    if (loading) return;
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    setUploadStatus(
      UPLOAD_AUDIO_EXTS.has(ext) ? "Transcribing audio…" :
      UPLOAD_IMAGE_EXTS.has(ext) ? "Reading image…" :
      "Reading document…"
    );

    const question = input.trim();
    setInput("");
    const displayText = `📎 ${file.name}${question ? `\n${question}` : ""}`;
    const newMessages = [...messages, { role: "user" as const, content: displayText }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const response = await uploadFileChat(file, question, sessionId, webSearch);
      setMessages([...newMessages, {
        role: "assistant",
        content: response.response,
        sources: response.sources,
      }]);
      if (autoSpeak && response.response) speak(response.response, `msg-${newMessages.length}`);
    } catch (err) {
      const detail = axios.isAxiosError(err) ? (err.response?.data?.detail as string | undefined) : undefined;
      setMessages([...newMessages, { role: "assistant", content: detail ?? "Sorry, I couldn't process that file." }]);
    } finally {
      setLoading(false);
      setUploadStatus(null);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (file) sendFile(file);
  };

  const summarizePage = async () => {
    setSummarizing(true);
    setOpen(true);
    const summaryPrompt = pageSummaryData
      ? `Summarize and analyze this ${context} data concisely. Highlight key insights, risks, and recommendations: ${JSON.stringify(pageSummaryData)}`
      : `Provide a comprehensive summary of the ${context} module and key metrics to watch.`;
    const newMessages = [
      ...messages,
      { role: "user" as const, content: "Summarize this page for me" },
    ];
    setMessages(newMessages);
    setLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`,
        { message: summaryPrompt, chat_history: [] }
      );
      setMessages([...newMessages, { role: "assistant", content: response.data.response }]);
      if (autoSpeak && response.data.response) speak(response.data.response, `msg-${newMessages.length}`);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error summarizing page." }]);
    } finally {
      setLoading(false);
      setSummarizing(false);
    }
  };

  const stopSpeaking = useCallback(() => {
    stopSpeakingPlayback(audioRef, () => { setVoiceState("idle"); setSpeakingKey(null); });
  }, []);

  const speak = useCallback((text: string, key: string | null = null) => {
    setVoiceState("speaking");
    setSpeakingKey(key);
    speakText({
      text,
      voiceChoice: voiceChoiceRef.current,
      speechRate: speechRateRef.current,
      audioRef,
      onEnd: () => { setVoiceState("idle"); setSpeakingKey(null); },
    });
  }, []);

  // Speaker button on a message bubble — click to read it aloud, click again to stop.
  const toggleSpeakMessage = (text: string, key: string) => {
    if (speakingKey === key && voiceState === "speaking") {
      stopSpeaking();
    } else {
      speak(text, key);
    }
  };

  const sendVoiceAudio = useCallback(async (blob: Blob) => {
    setVoiceState("processing");
    try {
      const { transcript, response, sources } = await sendVoiceChat(blob, { sessionId, chatHistory: messages, webSearch });
      setMessages(prev => [
        ...prev,
        { role: "user", content: transcript },
        { role: "assistant", content: response, sources },
      ]);
      speak(response, `msg-${messages.length + 1}`);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that voice message." }]);
      setVoiceState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, webSearch, sessionId, speak]);

  const { state: recorderState, start: startVoiceRecorder, stop: stopRecording } = useVoiceRecorder(sendVoiceAudio);

  // Mirror the recorder's own idle/recording state into the wider idle/recording/
  // processing/speaking machine — the transitions into "processing"/"speaking"
  // are driven by sendVoiceAudio/speak above, not by the recorder itself.
  useEffect(() => {
    if (recorderState === "recording") setVoiceState("recording");
  }, [recorderState]);

  const startRecording = () => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    startVoiceRecorder();
  };

  const toggleVoice = () => {
    if (voiceState === "idle")      return void startRecording();
    if (voiceState === "recording") return stopRecording();
    if (voiceState === "speaking")  stopSpeaking();
  };

  // Stop any in-progress recording/playback/generation when the panel is closed
  useEffect(() => {
    if (open) return;
    if (recorderState === "recording") stopRecording();
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    abortRef.current?.abort();
    setScale(s => (s === "fullscreen" ? "mid" : s));
    setShowVoicePicker(false);
    setShowUsage(false);
  }, [open]);

  // ── Drag — mouse ─────────────────────────────────────────────────
  const beginDrag = useCallback((clientX: number, clientY: number) => {
    hasDragged.current = false;
    startMouse.current = { x: clientX, y: clientY };
    dragOffset.current = { x: clientX - (pos?.x ?? 0), y: clientY - (pos?.y ?? 0) };
    setDragging(true);
  }, [pos]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    beginDrag(e.clientX, e.clientY);
  }, [beginDrag]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startMouse.current.x;
      const dy = e.clientY - startMouse.current.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) hasDragged.current = true;
      if (!hasDragged.current) return;
      setPos({
        x: clamp(e.clientX - dragOffset.current.x, 0, window.innerWidth  - BUTTON_SIZE),
        y: clamp(e.clientY - dragOffset.current.y, 0, window.innerHeight - BUTTON_SIZE),
      });
    };
    const onUp = () => {
      setDragging(false);
      if (!hasDragged.current) setOpen(v => !v);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [dragging]);

  // ── Drag — touch ─────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    beginDrag(t.clientX, t.clientY);
  }, [beginDrag]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - startMouse.current.x;
      const dy = t.clientY - startMouse.current.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) hasDragged.current = true;
      if (!hasDragged.current) return;
      setPos({
        x: clamp(t.clientX - dragOffset.current.x, 0, window.innerWidth  - BUTTON_SIZE),
        y: clamp(t.clientY - dragOffset.current.y, 0, window.innerHeight - BUTTON_SIZE),
      });
    };
    const onEnd = () => {
      setDragging(false);
      if (!hasDragged.current) setOpen(v => !v);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onEnd);
    };
  }, [dragging]);

  // ── Panel placement ───────────────────────────────────────────────
  const fullscreen = scale === "fullscreen";
  const panelW     = fullscreen ? window.innerWidth  : Math.min(PANEL_SIZES[scale].w, window.innerWidth  - 32);
  const panelH     = fullscreen ? window.innerHeight : Math.min(PANEL_SIZES[scale].h, window.innerHeight - 32);
  const panelAbove = pos && !fullscreen ? pos.y + BUTTON_SIZE + panelH + 8 > window.innerHeight : false;
  const panelLeft  = pos && !fullscreen ? pos.x + panelW > window.innerWidth : false;

  if (!pos) return null;

  return (
    <div
      style={{
        position:   "fixed",
        left:       pos.x,
        top:        pos.y,
        zIndex:     50,
        userSelect: "none",
        touchAction:"none",
      }}
    >
      {/* ── Chat panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            layout
            initial={{ opacity: 0, y: fullscreen ? 0 : (panelAbove ? 12 : -12), scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{    opacity: 0, y: fullscreen ? 0 : (panelAbove ? 12 : -12), scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut", layout: { duration: 0.3, ease: "easeOut" } }}
            className={`flex flex-col overflow-hidden shadow-2xl ${fullscreen ? "fixed rounded-none" : "absolute rounded-2xl"}`}
            style={fullscreen ? {
              width:          "100vw",
              height:         "100vh",
              top:            0,
              left:           0,
              background:     "rgba(8,12,24,0.97)",
              border:         "none",
              backdropFilter: "blur(24px)",
              zIndex:         60,
            } : {
              width:          panelW,
              height:         panelH,
              background:     "rgba(8,12,24,0.97)",
              border:         "1px solid rgba(0,212,255,0.2)",
              backdropFilter: "blur(24px)",
              ...(panelAbove ? { bottom: BUTTON_SIZE + 8 } : { top: BUTTON_SIZE + 8 }),
              ...(panelLeft  ? { right: 0 }               : { left: 0 }),
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{
                background:   "linear-gradient(135deg,rgba(0,212,255,0.12),rgba(29,78,216,0.12))",
                borderBottom: "1px solid rgba(0,212,255,0.15)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}
                >
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-white">CivilAI Assistant</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[9px] text-white/40">{context}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  ref={voiceBtnRef}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={toggleVoicePicker}
                  title="TTS voice — click to change"
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors max-w-22.5"
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{voiceLabel}</span>
                  <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                </button>
                {typeof document !== "undefined" && createPortal(
                  <AnimatePresence>
                    {showVoicePicker && voiceMenuPos && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        onMouseDown={e => e.stopPropagation()}
                        className="fixed rounded-xl overflow-hidden shadow-2xl"
                        style={{
                          top: voiceMenuPos.top, left: voiceMenuPos.left, width: 280, zIndex: 200,
                          background: "rgba(4,11,25,0.98)", border: "1px solid rgba(0,212,255,0.15)",
                        }}
                      >
                        <div className="py-3 px-2 max-h-96 overflow-y-auto flex flex-col gap-1.5">
                          {browserVoices.length > 0 && (
                            <>
                              <p className="px-2.5 pt-1.5 pb-2 text-[9.5px] font-semibold text-white/30 uppercase tracking-wider">
                                Browser (Google / Microsoft)
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {browserVoices.map(v => (
                                  <button
                                    key={v.voiceURI}
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={() => selectVoice({ engine: "browser", voiceURI: v.voiceURI, name: v.name })}
                                    title={v.name}
                                    className={`block w-full text-left rounded-lg px-3 py-3 text-[12px] leading-tight truncate transition-colors ${
                                      voiceChoice.engine === "browser" && voiceChoice.voiceURI === v.voiceURI
                                        ? "text-cyan-400 bg-cyan-500/15"
                                        : "text-white/65 hover:text-white hover:bg-white/8"
                                    }`}
                                  >
                                    {v.name}
                                  </button>
                                ))}
                              </div>
                              <div className="my-2.5 border-t border-white/10" />
                            </>
                          )}
                          <p className="px-2.5 pt-1.5 pb-2 text-[9.5px] font-semibold text-white/30 uppercase tracking-wider">
                            AI Voices
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {groqVoices.map(v => (
                              <button
                                key={v}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => selectVoice({ engine: "groq", name: v })}
                                className={`block w-full text-left rounded-lg px-3 py-3 text-[12px] leading-tight capitalize transition-colors ${
                                  voiceChoice.engine === "groq" && voiceChoice.name === v
                                    ? "text-cyan-400 bg-cyan-500/15"
                                    : "text-white/65 hover:text-white hover:bg-white/8"
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={toggleAutoSpeak}
                  title={autoSpeak ? "Auto-speak on — replies are read aloud automatically" : "Auto-speak off — click to read every reply aloud"}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                    autoSpeak ? "text-cyan-400 bg-cyan-500/10" : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Auto
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={cycleSpeechRate}
                  title="Speech speed — click to cycle"
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  {speechRate}x
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={cycleScale}
                  title={`${SCALE_LABELS[scale]} — click for ${SCALE_LABELS[SCALE_ORDER[(SCALE_ORDER.indexOf(scale) + 1) % SCALE_ORDER.length]]}`}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setOpen(false)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!showHistory && !showUsage && (
              <>
                {/* New chat / History / Usage / Download PDF toolbar */}
                <div className="px-3 pt-2.5 flex items-center gap-1.5 shrink-0">
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={handleNewChat}
                    title="Start a new chat"
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <Plus className="w-3 h-3" /> New
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={openHistory}
                    title="Past conversations"
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <HistoryIcon className="w-3 h-3" /> History
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={openUsage}
                    title="Today's AI usage"
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <Activity className="w-3 h-3" /> Usage
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={handleDownloadPdf}
                    disabled={pdfState === "saving" || messages.length <= 1}
                    title="Save conversation as PDF"
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    {pdfState === "saving"
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : pdfState === "saved"
                      ? <Check className="w-3 h-3 text-emerald-400" />
                      : <Download className="w-3 h-3" />
                    }
                    PDF
                  </button>
                </div>

                {/* Summarize button */}
                <div className="px-3 pt-2 shrink-0">
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={summarizePage}
                    disabled={summarizing || loading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors disabled:opacity-50"
                    style={{
                      background: "rgba(0,212,255,0.07)",
                      border:     "1px solid rgba(0,212,255,0.18)",
                      color:      "rgba(0,212,255,0.8)",
                    }}
                  >
                    {summarizing
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />
                    }
                    Summarize This Page
                  </button>
                </div>
              </>
            )}

            {/* Messages / History list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 mt-1">
              {showHistory ? (
                <>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setShowHistory(false)}
                    className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors mb-1"
                  >
                    <ChevronLeft className="w-3 h-3" /> Back to chat
                  </button>

                  {sessions.length > 0 && (
                    <div
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-1"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <Search className="w-3 h-3 text-white/25 shrink-0" />
                      <input
                        value={historySearch}
                        onMouseDown={e => e.stopPropagation()}
                        onChange={e => setHistorySearch(e.target.value)}
                        placeholder="Search conversations…"
                        className="flex-1 min-w-0 bg-transparent text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
                      />
                    </div>
                  )}

                  {sessionsLoading && (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    </div>
                  )}

                  {!sessionsLoading && sessions.length === 0 && (
                    <p className="text-[11px] text-white/25 text-center py-8">No saved conversations yet.</p>
                  )}

                  {!sessionsLoading && sessions.length > 0 && filteredSessions.length === 0 && (
                    <p className="text-[11px] text-white/25 text-center py-8">No conversations match &quot;{historySearch}&quot;.</p>
                  )}

                  {filteredSessions.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => handleLoadSession(s)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-[11px] text-white/80 truncate">{s.label || "Untitled conversation"}</p>
                        <p className="text-[9px] text-white/30">
                          {new Date(s.created_at).toLocaleString()} · {s.messages?.length ?? 0} messages
                        </p>
                      </button>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => handleDeleteSession(s.id)}
                        className="shrink-0 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </>
              ) : showUsage ? (
                <>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setShowUsage(false)}
                    className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors mb-1"
                  >
                    <ChevronLeft className="w-3 h-3" /> Back to chat
                  </button>

                  {usageLoading && (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    </div>
                  )}

                  {!usageLoading && !usageData && (
                    <p className="text-[11px] text-white/25 text-center py-8">Couldn&apos;t load usage data.</p>
                  )}

                  {!usageLoading && usageData && (
                    <>
                      <div className="flex flex-col gap-3 py-3 px-1">
                        {usageToBarData(usageData).map(d => <UsageBar2D key={d.label} {...d} />)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {([
                          ["Tokens", usageData.llm_tokens, "LLM tokens"],
                          ["Images", usageData.images,     "image calls"],
                          ["Audio",  usageData.audio,       "transcriptions"],
                          ["Web",    usageData.web_search,  "web searches"],
                        ] as [string, UsageMetric, string][]).map(([label, m, sub]) => {
                          const pct = Math.max(0, Math.min(100, Math.round((1 - m.used / Math.max(1, m.limit)) * 100)));
                          const color = usageColor(pct);
                          return (
                            <div
                              key={label}
                              className="rounded-lg px-2.5 py-2"
                              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                <span className="text-[10px] font-semibold text-white/70">{label}</span>
                              </div>
                              <p className="text-[9px] text-white/40 mt-0.5">
                                {m.used.toLocaleString()} / {m.limit.toLocaleString()} {sub}
                              </p>
                              <p className="text-[9px] font-medium" style={{ color }}>{pct}% left today</p>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-white/25 text-center pt-2">
                        Resets daily at UTC midnight · estimated limits, not live provider quotas
                      </p>
                    </>
                  )}
                </>
              ) : (
              <>
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 min-w-0 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="max-w-[84%] min-w-0 flex flex-col gap-1.5">
                    {m.role === "assistant" && m.toolSteps && m.toolSteps.length > 0 && (
                      <ToolStepChips steps={m.toolSteps} />
                    )}
                    <div
                      className="px-3 py-2 rounded-xl text-[12px] leading-relaxed text-white/85 whitespace-pre-wrap wrap-break-word"
                      style={m.role === "user" ? {
                        background: "linear-gradient(135deg,rgba(0,212,255,0.18),rgba(29,78,216,0.18))",
                        border:     "1px solid rgba(0,212,255,0.2)",
                        borderTopRightRadius: "4px",
                      } : {
                        background: "rgba(255,255,255,0.04)",
                        border:     "1px solid rgba(255,255,255,0.07)",
                        borderTopLeftRadius: "4px",
                      }}
                    >
                      <ChatText text={m.content} onNavigate={router.push} />
                    </div>

                    <div className={`flex items-center gap-1.5 flex-wrap ${m.role === "user" ? "justify-end" : ""}`}>
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => copyToClipboard(m.content, `msg-${i}`)}
                        title="Copy response"
                        className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
                      >
                        {copiedKey === `msg-${i}`
                          ? <><Check className="w-2.5 h-2.5 text-emerald-400" /> Copied</>
                          : <Copy className="w-2.5 h-2.5" />
                        }
                      </button>

                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => toggleSpeakMessage(m.content, `msg-${i}`)}
                        title={speakingKey === `msg-${i}` && voiceState === "speaking" ? "Stop speaking" : "Read aloud"}
                        className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] transition-colors ${
                          speakingKey === `msg-${i}` && voiceState === "speaking"
                            ? "text-cyan-400 bg-cyan-500/10"
                            : "text-white/25 hover:text-white/60 hover:bg-white/5"
                        }`}
                      >
                        <Volume2 className={`w-2.5 h-2.5 ${speakingKey === `msg-${i}` && voiceState === "speaking" ? "animate-pulse" : ""}`} />
                      </button>

                      {m.role === "assistant" && i > 0 && (
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => regenerateResponse(i)}
                          disabled={loading}
                          title="Regenerate this response"
                          className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-30"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {m.role === "assistant" && i > 0 && !judgeResults[i] && (
                        <button
                          onMouseDown={e => e.stopPropagation()}
                          onClick={() => judgeMessage(i, m.content, i > 0 ? messages[i - 1].content : undefined)}
                          disabled={judgingIdx.has(i)}
                          title="Judge this response"
                          className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] text-white/25 hover:text-cyan-400 hover:bg-white/5 transition-colors disabled:opacity-30"
                        >
                          {judgingIdx.has(i) ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Scale className="w-2.5 h-2.5" />}
                        </button>
                      )}

                      {m.sources && m.sources.length > 0 && m.sources.map((s, si) => {
                        const linkKey = `src-${i}-${si}`;
                        return (
                          <div
                            key={si}
                            className="flex items-center rounded-lg overflow-hidden"
                            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}
                          >
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              title={s.url}
                              onMouseDown={e => e.stopPropagation()}
                              className="max-w-40 flex items-center gap-1 truncate text-[10px] pl-2 pr-1 py-1 transition-colors hover:opacity-80"
                              style={{ color: "rgba(0,212,255,0.85)" }}
                            >
                              <img src={faviconProxyUrl(s.url)} alt="" className="w-3 h-3 rounded-sm shrink-0" />
                              <span className="truncate">{s.title}</span>
                            </a>
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => copyToClipboard(s.url, linkKey)}
                              title="Copy link"
                              className="shrink-0 pl-1 pr-1.5 py-1 text-cyan-400/50 hover:text-cyan-400 transition-colors"
                            >
                              {copiedKey === linkKey
                                ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                                : <Copy className="w-2.5 h-2.5" />
                              }
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {judgeResults[i] && (
                      <MiniJudgePanel
                        verdict={judgeResults[i]}
                        expanded={judgePanelOpen.has(i)}
                        onToggle={() => toggleJudgePanel(i)}
                      />
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div
                    className="px-3 py-2 rounded-xl rounded-tl-sm"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex gap-1 items-center h-4">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1 h-1 rounded-full bg-cyan-400/60"
                          animate={{ y: [0, -3, 0] }}
                          transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.14 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && getFollowUps(messages).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {getFollowUps(messages).map(s => (
                    <button
                      key={s}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => send(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border:     "1px solid rgba(255,255,255,0.09)",
                        color:      "rgba(255,255,255,0.45)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
              </>
              )}
            </div>

            {!showHistory && !showUsage && (voiceState === "recording" || voiceState === "processing" || voiceState === "speaking") && (
              <div className="px-3 pb-1.5 shrink-0">
                <p className={`text-[10px] flex items-center gap-1.5 ${
                  voiceState === "recording" ? "text-red-400/80" :
                  voiceState === "speaking"  ? "text-cyan-400/80" : "text-amber-400/80"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    voiceState === "recording" ? "bg-red-400" :
                    voiceState === "speaking"  ? "bg-cyan-400" : "bg-amber-400"
                  }`} />
                  {voiceState === "recording"  && "Listening… tap mic to stop"}
                  {voiceState === "processing" && "Transcribing…"}
                  {voiceState === "speaking"   && "Speaking… tap mic to stop"}
                </p>
              </div>
            )}

            {!showHistory && !showUsage && uploadStatus && (
              <div className="px-3 pb-1.5 shrink-0">
                <p className="text-[10px] flex items-center gap-1.5 text-cyan-400/80">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-cyan-400" />
                  {uploadStatus}
                </p>
              </div>
            )}

            {/* Input */}
            {!showHistory && !showUsage && (
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-2.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <input ref={imageInputRef} type="file" accept={UPLOAD_IMAGE_ACCEPT} onChange={handleFileSelected} className="hidden" />
              <input ref={audioInputRef} type="file" accept={UPLOAD_AUDIO_ACCEPT} onChange={handleFileSelected} className="hidden" />
              <input ref={docInputRef}   type="file" accept={UPLOAD_DOC_ACCEPT}   onChange={handleFileSelected} className="hidden" />

              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || voiceState === "recording" || voiceState === "processing"}
                title="Upload an image"
                className="w-6 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 text-white/30 hover:text-white/60 disabled:opacity-30"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => audioInputRef.current?.click()}
                disabled={loading || voiceState === "recording" || voiceState === "processing"}
                title="Upload an audio clip"
                className="w-6 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 text-white/30 hover:text-white/60 disabled:opacity-30"
              >
                <FileAudio className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => docInputRef.current?.click()}
                disabled={loading || voiceState === "recording" || voiceState === "processing"}
                title="Upload a document (PDF, Word, Excel, CSV)"
                className="w-6 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 text-white/30 hover:text-white/60 disabled:opacity-30"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                disabled={voiceState === "recording" || voiceState === "processing"}
                placeholder={placeholder || `Ask about ${context}…`}
                className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 focus:outline-none"
              />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setWebSearch(v => !v)}
                title={webSearch ? "Web search on — tap to turn off" : "Turn on web search"}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  webSearch ? "text-cyan-400 bg-cyan-500/10" : "text-white/30 hover:text-white/60"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={toggleVoice}
                disabled={voiceState === "processing"}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  voiceState === "recording" ? "text-red-400 bg-red-500/10"  :
                  voiceState === "speaking"  ? "text-cyan-400 bg-cyan-500/10" :
                  voiceState === "processing" ? "text-amber-400" :
                  "text-white/30 hover:text-white/60"
                }`}
                title={
                  voiceState === "recording"  ? "Stop recording"  :
                  voiceState === "speaking"   ? "Stop speaking"   :
                  voiceState === "processing" ? "Processing…"     :
                  "Speak to AI"
                }
              >
                {voiceState === "recording"  && <MicOff  className="w-3.5 h-3.5" />}
                {voiceState === "speaking"   && <Volume2 className="w-3.5 h-3.5" />}
                {voiceState === "processing" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {voiceState === "idle"       && <Mic     className="w-3.5 h-3.5" />}
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={streaming ? stopGeneration : () => send()}
                disabled={!streaming && (!input.trim() || loading)}
                title={streaming ? "Stop generating" : "Send"}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg,rgba(0,212,255,0.25),rgba(29,78,216,0.25))",
                  border:     "1px solid rgba(0,212,255,0.25)",
                }}
              >
                {streaming
                  ? <Square  className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                  : loading
                  ? <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                  : <Send    className="w-3 h-3 text-cyan-400" />
                }
              </button>
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Trigger button ───────────────────────────────────────────── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          cursor:     dragging ? "grabbing" : "grab",
          width:      BUTTON_SIZE,
          height:     BUTTON_SIZE,
        }}
      >
        <motion.div
          whileHover={{ scale: 1.07 }}
          whileTap={{   scale: 0.95 }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center relative shadow-lg"
          style={{
            background: open
              ? "rgba(0,212,255,0.15)"
              : "linear-gradient(135deg,rgba(0,212,255,0.28),rgba(29,78,216,0.28))",
            border:    "1px solid rgba(0,212,255,0.35)",
            boxShadow: "0 4px 24px rgba(0,212,255,0.22)",
          }}
          title={dragging ? "Drop to place" : open ? "Close chat" : "Chat with CivilAI"}
        >
          <AnimatePresence mode="wait">
            {open
              ? <motion.div key="x"   initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0 }}>
                  <X   className="w-5 h-5 text-cyan-400" />
                </motion.div>
              : <motion.div key="bot" initial={{ opacity: 0, rotate:  90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0 }}>
                  <Bot className="w-5 h-5 text-cyan-400" />
                </motion.div>
            }
          </AnimatePresence>

          {!open && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: "#00D4FF", boxShadow: "0 0 6px #00D4FF" }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
