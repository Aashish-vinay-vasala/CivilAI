"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Bot, User, Loader2, RefreshCw, Hash, X, FileText, Image, AudioLines, Sparkles,
  Globe, History as HistoryIcon, Download, Mic, MicOff, Volume2, Trash2, Wrench, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ChatText from "@/components/shared/ChatText";
import { faviconProxyUrl } from "@/lib/chatTokenize";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { speak as speakText, stopSpeaking as stopSpeakingPlayback, pickDefaultVoiceChoice, type VoiceChoice } from "@/lib/ttsPlayback";
import { buildChatPdf } from "@/lib/chatPdf";
import {
  streamChat, sendVoiceChat, uploadFileChat, saveTranscript, fetchSessionHistory,
  clearCopilotSession, listSessions, upsertSession, deleteSession,
  type SavedSession, type ToolEvent,
} from "@/lib/copilotClient";
import {
  useChatWidgetStore,
  type ChatMessage, type ChatSource as Source, type ChatToolStep as ToolStep,
} from "@/lib/stores/chatWidgetStore";

const WritingPage = dynamic(() => import("../writing/page"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>,
});

const CONTEXT_LABEL = "AI Copilot";

const COPILOT_TABS = [
  { id: "chat",    label: "Chat" },
  { id: "writing", label: "Writing Assistant" },
];

const SUGGESTIONS = [
  "What are the main causes of construction delays?",
  "Analyze cost overrun risks for my project",
  "Generate a safety checklist for high-rise construction",
  "What should I look for in a construction contract?",
  "How can I reduce material waste on site?",
  "Predict workforce requirements for next month",
];

interface Message {
  id:          string;
  role:        "user" | "assistant";
  content:     string;
  timestamp:   string;
  confidence?: number;
  domain?:     string;
  followUp?:   string;
  sources?:    Source[];
  toolSteps?:  ToolStep[];
}

type VoiceState = "idle" | "recording" | "processing" | "speaking";

function toChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map(m => ({ role: m.role, content: m.content, sources: m.sources }));
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

function ToolStepChips({ steps }: { steps: ToolStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pl-1">
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

function Bubble({ msg, onFollowUp, onNavigate }: { msg: Message; onFollowUp?: (text: string) => void; onNavigate: (href: string) => void }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={isUser
          ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
          : { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}
      >
        {isUser
          ? <User className="w-4 h-4 text-white/70" />
          : <Bot  className="w-4 h-4 text-cyan-400" />
        }
      </div>
      <div className="max-w-[78%] space-y-1">
        {!isUser && msg.toolSteps && msg.toolSteps.length > 0 && <ToolStepChips steps={msg.toolSteps} />}
        <div
          className={cn("px-4 py-3 rounded-2xl text-sm leading-relaxed", isUser ? "rounded-tr-none text-white" : "rounded-tl-none text-white/80")}
          style={isUser
            ? { background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }
            : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="whitespace-pre-wrap"><ChatText text={msg.content} onNavigate={onNavigate} /></p>
        </div>
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pl-1">
            {msg.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.url}
                className="max-w-40 flex items-center gap-1 truncate text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "rgba(0,212,255,0.85)" }}
              >
                <img src={faviconProxyUrl(s.url)} alt="" className="w-2.5 h-2.5 rounded-sm shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        )}
        {!isUser && (msg.domain || msg.confidence !== undefined) && (
          <div className="flex items-center gap-2 flex-wrap pl-1">
            {msg.domain && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 capitalize">
                {msg.domain}
              </span>
            )}
            {msg.confidence !== undefined && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {Math.round(msg.confidence * 100)}% confidence
              </span>
            )}
          </div>
        )}
        {!isUser && msg.followUp && (
          <button
            onClick={() => onFollowUp?.(msg.followUp!)}
            className="ml-1 text-xs text-cyan-400 hover:text-cyan-300 hover:underline text-left"
          >
            → {msg.followUp}
          </button>
        )}
        <p className={cn("text-[10px] text-white/25", isUser ? "text-right pr-1" : "pl-1")}>
          {msg.timestamp}
        </p>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}>
        <Bot className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="rounded-2xl rounded-tl-none px-4 py-3"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const headerBtn = "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all";
const headerBtnOn  = { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" };
const headerBtnOff = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" };

export default function CopilotPage() {
  const router = useRouter();

  // Shared with the floating ModuleChat widget — same session id, "New Chat",
  // and History-list actions, so the two chat surfaces stay on one conversation.
  const {
    sessionId, sessionLabel, webSearch, setWebSearch,
    startNewSession, loadSession: loadSharedSession,
  } = useChatWidgetStore();

  const [subTab,      setSubTab]      = useState("chat");
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [msgCount,    setMsgCount]    = useState(0);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [structuredMode, setStructuredMode] = useState(false);
  const [voiceState,  setVoiceState]  = useState<VoiceState>("idle");
  const [pdfState,    setPdfState]    = useState<"idle" | "saving" | "saved">("idle");
  const [showHistory, setShowHistory] = useState(false);
  const [sessions,    setSessions]    = useState<SavedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const docInputRef  = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const voiceChoiceRef = useRef<VoiceChoice>({ engine: "groq", name: "autumn" });

  const AUDIO_EXTS = new Set(["mp3", "wav", "webm", "m4a", "ogg", "flac", "mp4"]);
  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_EXTS.has(ext)) return AudioLines;
    if (IMAGE_EXTS.has(ext)) return Image;
    return FileText;
  };

  const welcomeMessage = (): Message => ({
    id:        "welcome",
    role:      "assistant",
    content:   "Hello! I'm CivilAI Copilot, your AI assistant for construction management. I remember our conversations across sessions — ask me anything about scheduling, cost, safety, contracts, or workforce.",
    timestamp: new Date().toLocaleTimeString(),
  });

  // Loads whatever this shared session already has (e.g. from the floating widget
  // on another page) — mirrors ModuleChat's own hydration-on-open.
  useEffect(() => {
    (async () => {
      const history = await fetchSessionHistory(sessionId);
      if (history.length > 0) {
        setMessages(history.map((m) => ({
          id: crypto.randomUUID(), role: m.role, content: m.content, timestamp: "",
        })));
        setMsgCount(Math.floor(history.length / 2));
      } else {
        setMessages([welcomeMessage()]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Default TTS voice for the voice loop — a browser English voice once loaded, else Groq.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pick = () => { voiceChoiceRef.current = pickDefaultVoiceChoice(); };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);

  // Auto-save this conversation so it shows up in the shared History list
  // (same copilot_chat_sessions row the widget's "New Chat"/History uses).
  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = setTimeout(() => {
      const firstUser = messages.find(m => m.role === "user");
      upsertSession(sessionId, (firstUser?.content ?? CONTEXT_LABEL).slice(0, 80), toChatMessages(messages));
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, sessionId]);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && !attachedFile) || loading) return;
    setInput("");

    const displayContent = attachedFile
      ? `📎 ${attachedFile.name}${msg ? `\n${msg}` : ""}`
      : msg;

    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: "user", content: displayContent, timestamp: new Date().toLocaleTimeString(),
    }]);
    setLoading(true);

    const fileToSend = attachedFile;
    setAttachedFile(null);

    try {
      if (fileToSend) {
        const data = await uploadFileChat(fileToSend, msg, sessionId, webSearch);
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(), role: "assistant", content: data.response,
          timestamp: new Date().toLocaleTimeString(), sources: data.sources,
        }]);
        setMsgCount((c) => c + 1);
        return;
      }

      if (structuredMode) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/copilot/structured`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ message: msg, session_id: sessionId }),
        });
        const data = await res.json();
        setMessages((prev) => [...prev, {
          id:         crypto.randomUUID(),
          role:       "assistant",
          content:    data.answer ?? "Sorry, I couldn't generate a response.",
          timestamp:  new Date().toLocaleTimeString(),
          confidence: data.confidence,
          domain:     data.domain,
          followUp:   data.follow_up ?? undefined,
        }]);
        setMsgCount((c) => c + 1);
        return;
      }

      // Token-by-token streaming reply — same protocol the floating widget uses.
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "", timestamp: new Date().toLocaleTimeString(), toolSteps: [] }]);
      const result = await streamChat(
        { message: msg, sessionId, chatHistory: [], webSearch },
        (delta) => setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + delta };
          return copy;
        }),
        (toolEvent: ToolEvent) => setMessages((prev) => {
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
      );
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: result.text, sources: result.sources, toolSteps: result.toolSteps };
        return copy;
      });
      setMsgCount((c) => c + 1);
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const errorMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: new Date().toLocaleTimeString() };
        // Replace an in-flight streaming placeholder rather than appending a duplicate.
        return last && last.role === "assistant" && last.content === "" ? [...prev.slice(0, -1), errorMsg] : [...prev, errorMsg];
      });
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, sessionId, attachedFile, structuredMode, webSearch]);

  const clearSession = async () => {
    await clearCopilotSession(sessionId);
    startNewSession();
    setMessages([{
      id:        "welcome-new",
      role:      "assistant",
      content:   "New conversation started. How can I help you?",
      timestamp: new Date().toLocaleTimeString(),
    }]);
    setMsgCount(0);
    setShowHistory(false);
  };

  const openHistory = async () => {
    setShowHistory((v) => !v);
    setSessionsLoading(true);
    setSessions(await listSessions());
    setSessionsLoading(false);
  };

  const handleLoadSession = (s: SavedSession) => {
    loadSharedSession(s.id, s.messages ?? [], s.label ?? "");
    setMessages((s.messages ?? []).map((m) => ({
      id: crypto.randomUUID(), role: m.role, content: m.content, sources: m.sources, timestamp: "",
    })));
    setMsgCount(Math.floor((s.messages ?? []).length / 2));
    setShowHistory(false);
  };

  const handleDeleteSessionEntry = async (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await deleteSession(id);
  };

  const handleDownloadPdf = async () => {
    if (messages.length === 0 || pdfState === "saving") return;
    setPdfState("saving");
    try {
      const chatMessages = toChatMessages(messages);
      const doc = await buildChatPdf(chatMessages, { context: CONTEXT_LABEL });
      const filename = `civilai-chat-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      const pdfBlob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
      await saveTranscript(pdfBlob, filename, chatMessages, sessionLabel || CONTEXT_LABEL);
      setPdfState("saved");
      setTimeout(() => setPdfState("idle"), 1500);
    } catch {
      setPdfState("idle");
    }
  };

  // ── Voice loop: mic → STT → LLM (shared session) → TTS ──────────────────────
  const stopSpeakingLocal = useCallback(() => {
    stopSpeakingPlayback(audioRef, () => setVoiceState("idle"));
  }, []);

  const speakReply = useCallback((text: string) => {
    setVoiceState("speaking");
    speakText({ text, voiceChoice: voiceChoiceRef.current, speechRate: 1, audioRef, onEnd: () => setVoiceState("idle") });
  }, []);

  const handleVoiceStop = useCallback(async (blob: Blob) => {
    setVoiceState("processing");
    try {
      const { transcript, response, sources } = await sendVoiceChat(blob, { sessionId, chatHistory: [], webSearch });
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: transcript, timestamp: new Date().toLocaleTimeString() },
        { id: crypto.randomUUID(), role: "assistant", content: response, timestamp: new Date().toLocaleTimeString(), sources },
      ]);
      setMsgCount((c) => c + 1);
      speakReply(response);
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Sorry, I couldn't process that voice message.", timestamp: new Date().toLocaleTimeString() }]);
      setVoiceState("idle");
    }
  }, [sessionId, webSearch, speakReply]);

  const { state: recorderState, start: startRecording, stop: stopRecording } = useVoiceRecorder(handleVoiceStop);

  useEffect(() => {
    if (recorderState === "recording") setVoiceState("recording");
  }, [recorderState]);

  const toggleVoice = () => {
    if (voiceState === "idle")      return void startRecording();
    if (voiceState === "recording") return stopRecording();
    if (voiceState === "speaking")  stopSpeakingLocal();
  };

  const tabBar = (
    <div className="flex items-center gap-1 p-1 rounded-xl w-fit shrink-0"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {COPILOT_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setSubTab(t.id)}
          className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors"
          style={subTab === t.id
            ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
            : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (subTab !== "chat") {
    return (
      <div className="space-y-0">
        {tabBar}
        <Suspense fallback={<div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>}>
          {subTab === "writing" && <div className="pt-6"><WritingPage /></div>}
        </Suspense>
      </div>
    );
  }

  const VoiceIcon = voiceState === "recording" ? MicOff : voiceState === "speaking" ? Volume2 : Mic;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {tabBar}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between py-3 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)", boxShadow: "0 0 16px rgba(0,212,255,0.15)" }}>
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">AI Copilot</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[13px] text-white/35">Groq LLaMA 3.3 · Persistent memory</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setStructuredMode((v) => !v)}
            title="Structured mode — confidence score, domain tag, follow-up suggestion"
            className={headerBtn}
            style={structuredMode ? headerBtnOn : headerBtnOff}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Structured
          </button>
          <button
            onClick={() => setWebSearch((v) => !v)}
            title="Augment answers with live web search"
            className={headerBtn}
            style={webSearch ? headerBtnOn : headerBtnOff}
          >
            <Globe className="w-3.5 h-3.5" />
            Web
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={messages.length === 0 || pdfState === "saving"}
            title="Download conversation as PDF"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {pdfState === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
          <button
            onClick={openHistory}
            title="Conversation history"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
          <button
            onClick={clearSession}
            title="New conversation"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 top-11 z-20 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl p-2"
                style={{ background: "rgba(20,24,30,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-cyan-400" /></div>
                ) : sessions.length === 0 ? (
                  <p className="text-[11px] text-white/35 text-center py-6">No saved conversations yet.</p>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 cursor-pointer group"
                      onClick={() => handleLoadSession(s)}
                    >
                      <span className="flex-1 truncate text-xs text-white/70">{s.label || "Untitled conversation"}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSessionEntry(s.id); }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Session info strip */}
      <div className="flex items-center gap-3 mb-2 px-1 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-white/35">
          <Hash className="w-3 h-3" />
          <span className="font-mono">{sessionId ? `${sessionId.slice(0, 24)}…` : "—"}</span>
        </div>
        {msgCount > 0 && (
          <span className="text-[10px] text-white/35">
            {msgCount} exchange{msgCount !== 1 ? "s" : ""} remembered
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} onFollowUp={(text) => { setInput(text); inputRef.current?.focus(); }} onNavigate={router.push} />
        ))}

        {loading && <TypingDots />}

        {messages.length === 1 && !loading && (
          <div className="pt-2 grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-left text-xs p-3 rounded-xl text-white/40 hover:text-white/75 transition-colors"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 glass-card p-3">
        {/* Attached file chip */}
        {attachedFile && (() => {
          const FileIcon = getFileIcon(attachedFile.name);
          return (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg w-fit max-w-full"
              style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
              <FileIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-xs text-cyan-400 truncate max-w-50">{attachedFile.name}</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="ml-0.5 text-cyan-400/60 hover:text-cyan-400 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })()}

        {voiceState !== "idle" && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg w-fit"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <span className="text-xs text-cyan-400">
              {voiceState === "recording" ? "Listening…" : voiceState === "processing" ? "Thinking…" : "Speaking…"}
            </span>
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={attachedFile ? "Ask a question about this file…" : "Ask CivilAI anything about your project…"}
          rows={1}
          className="w-full bg-transparent resize-none text-sm text-white placeholder:text-white/30 focus:outline-none min-h-9 max-h-32 leading-relaxed"
          style={{ scrollbarWidth: "none" }}
        />

        {/* Hidden file inputs — one per type */}
        <input ref={docInputRef}   type="file" className="hidden"
          accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAttachedFile(f); e.target.value = ""; }}
        />
        <input ref={imgInputRef}   type="file" className="hidden"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAttachedFile(f); e.target.value = ""; }}
        />
        <input ref={audioInputRef} type="file" className="hidden"
          accept=".mp3,.wav,.webm,.m4a,.ogg,.flac,.mp4"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAttachedFile(f); e.target.value = ""; }}
        />

        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-white/30">
            Enter to send · Shift+Enter for newline
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Document */}
            <Button
              onClick={() => docInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-white/40 hover:text-cyan-400"
              title="Attach PDF or document"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
            {/* Image */}
            <Button
              onClick={() => imgInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-white/40 hover:text-emerald-400"
              title="Attach image"
            >
              <Image className="w-3.5 h-3.5" />
            </Button>
            {/* Audio */}
            <Button
              onClick={() => audioInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-white/40 hover:text-amber-400"
              title="Attach audio"
            >
              <AudioLines className="w-3.5 h-3.5" />
            </Button>
            {/* Voice loop — mic → STT → LLM → TTS, same as the floating widget */}
            <Button
              onClick={toggleVoice}
              size="icon"
              variant="ghost"
              disabled={voiceState === "processing"}
              className={cn("w-8 h-8 rounded-lg", voiceState === "idle" ? "text-white/40 hover:text-cyan-400" : "text-cyan-400")}
              title={voiceState === "idle" ? "Start voice conversation" : voiceState === "recording" ? "Stop recording" : voiceState === "speaking" ? "Stop speaking" : "Processing…"}
            >
              {voiceState === "processing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VoiceIcon className="w-3.5 h-3.5" />}
            </Button>
            <button
              onClick={() => send()}
              disabled={(!input.trim() && !attachedFile) || loading}
              className="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }}
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send    className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
