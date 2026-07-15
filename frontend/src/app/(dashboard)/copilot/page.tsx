"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Send, Bot, User, Loader2, RefreshCw, Hash, X, FileText, Image, AudioLines, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import VoiceButton from "@/components/shared/VoiceButton";

const WritingPage = dynamic(() => import("../writing/page"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>,
});

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const SESSION_KEY = "civilai_copilot_session";

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
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  timestamp:  string;
  confidence?: number;
  domain?:     string;
  followUp?:   string;
}

function renderContent(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function Bubble({ msg, onFollowUp }: { msg: Message; onFollowUp?: (text: string) => void }) {
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
        <div
          className={cn("px-4 py-3 rounded-2xl text-sm leading-relaxed", isUser ? "rounded-tr-none text-white" : "rounded-tl-none text-white/80")}
          style={isUser
            ? { background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))", border: "1px solid rgba(0,212,255,0.3)" }
            : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="whitespace-pre-wrap">{renderContent(msg.content)}</p>
        </div>
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

export default function CopilotPage() {
  const [subTab,      setSubTab]      = useState("chat");
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [sessionId,   setSessionId]   = useState("");
  const [msgCount,    setMsgCount]    = useState(0);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [structuredMode, setStructuredMode] = useState(false);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const docInputRef  = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let sid = "";
    try { sid = localStorage.getItem(SESSION_KEY) ?? ""; } catch {}
    if (!sid) {
      sid = `copilot_${Date.now()}`;
      try { localStorage.setItem(SESSION_KEY, sid); } catch {}
    }
    setSessionId(sid);

    (async () => {
      try {
        const res = await fetch(`${API}/api/v1/copilot/sessions/${sid}/history`);
        const data = await res.json();
        const history: { role: "user" | "assistant"; content: string; created_at?: string }[] = data.messages || [];
        if (history.length > 0) {
          setMessages(history.map((m) => ({
            id:        crypto.randomUUID(),
            role:      m.role,
            content:   m.content,
            timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString() : "",
          })));
          setMsgCount(Math.floor(history.length / 2));
          return;
        }
      } catch { /* fall through to welcome message */ }
      setMessages([welcomeMessage()]);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && !attachedFile) || loading) return;
    setInput("");

    const displayContent = attachedFile
      ? `📎 ${attachedFile.name}${msg ? `\n${msg}` : ""}`
      : msg;

    const userMsg: Message = {
      id:        crypto.randomUUID(),
      role:      "user",
      content:   displayContent,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const fileToSend = attachedFile;
    setAttachedFile(null);

    try {
      let data: any;

      if (fileToSend) {
        const form = new FormData();
        form.append("file",       fileToSend);
        form.append("message",    msg);
        form.append("session_id", sessionId);
        const res = await fetch(`${API}/api/v1/copilot/upload`, { method: "POST", body: form });
        data = await res.json();
      } else if (structuredMode) {
        const res = await fetch(`${API}/api/v1/copilot/structured`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ message: msg, session_id: sessionId }),
        });
        data = await res.json();
      } else {
        const res = await fetch(`${API}/api/v1/copilot/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ message: msg, session_id: sessionId }),
        });
        data = await res.json();
      }

      const sid = data.session_id ?? sessionId;
      if (sid && sid !== sessionId) {
        setSessionId(sid);
        try { localStorage.setItem(SESSION_KEY, sid); } catch {}
      }
      setMessages((prev) => [...prev, {
        id:         crypto.randomUUID(),
        role:       "assistant",
        content:    data.answer ?? data.response ?? "Sorry, I couldn't generate a response.",
        timestamp:  new Date().toLocaleTimeString(),
        confidence: data.confidence,
        domain:     data.domain,
        followUp:   data.follow_up ?? undefined,
      }]);
      setMsgCount((c) => c + 1);
    } catch {
      setMessages((prev) => [...prev, {
        id:        crypto.randomUUID(),
        role:      "assistant",
        content:   "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toLocaleTimeString(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, sessionId, attachedFile]);

  const clearSession = async () => {
    if (sessionId) {
      try { await fetch(`${API}/api/v1/copilot/session/${sessionId}`, { method: "DELETE" }); } catch {}
    }
    const newSid = `copilot_${Date.now()}`;
    setSessionId(newSid);
    try { localStorage.setItem(SESSION_KEY, newSid); } catch {}
    setMessages([{
      id:        "welcome-new",
      role:      "assistant",
      content:   "New conversation started. How can I help you?",
      timestamp: new Date().toLocaleTimeString(),
    }]);
    setMsgCount(0);
  };

  const onVoiceResult = (transcript: string, response: string) => {
    if (transcript) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user",      content: transcript, timestamp: new Date().toLocaleTimeString() },
        { id: crypto.randomUUID(), role: "assistant", content: response,   timestamp: new Date().toLocaleTimeString() },
      ]);
      setMsgCount((c) => c + 1);
    }
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

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {tabBar}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between py-3 shrink-0">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStructuredMode((v) => !v)}
            title="Structured mode — confidence score, domain tag, follow-up suggestion"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={structuredMode
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Structured
          </button>
          <button
            onClick={clearSession}
            title="New conversation"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
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
          <Bubble key={msg.id} msg={msg} onFollowUp={(text) => { setInput(text); inputRef.current?.focus(); }} />
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
            <VoiceButton
              chatHistory={messages.map((m) => ({ role: m.role, content: m.content }))}
              onResult={onVoiceResult}
              size="sm"
            />
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
