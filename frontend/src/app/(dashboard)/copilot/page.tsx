"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Send, Bot, User, Loader2, RefreshCw, Hash, X, FileText, Image, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import VoiceButton from "@/components/shared/VoiceButton";

const WritingPage = dynamic(() => import("../writing/page"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>,
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
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  timestamp: string;
}

function renderContent(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-secondary border border-border" : "gradient-blue",
      )}>
        {isUser
          ? <User className="w-4 h-4 text-foreground" />
          : <Bot  className="w-4 h-4 text-white" />
        }
      </div>
      <div className="max-w-[78%] space-y-1">
        <div className={cn(
          "px-4 py-3 rounded-2xl text-sm leading-relaxed",
          isUser
            ? "gradient-blue rounded-tr-none text-white"
            : "bg-card border border-border rounded-tl-none text-foreground",
        )}>
          <p className="whitespace-pre-wrap">{renderContent(msg.content)}</p>
        </div>
        <p className={cn("text-[10px] text-muted-foreground", isUser ? "text-right pr-1" : "pl-1")}>
          {msg.timestamp}
        </p>
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-blue-400/60"
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

  useEffect(() => {
    let sid = "";
    try { sid = localStorage.getItem(SESSION_KEY) ?? ""; } catch {}
    if (!sid) {
      sid = `copilot_${Date.now()}`;
      try { localStorage.setItem(SESSION_KEY, sid); } catch {}
    }
    setSessionId(sid);
    setMessages([{
      id:        "welcome",
      role:      "assistant",
      content:   "Hello! I'm CivilAI Copilot, your AI assistant for construction management. I remember our conversations across sessions — ask me anything about scheduling, cost, safety, contracts, or workforce.",
      timestamp: new Date().toLocaleTimeString(),
    }]);
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
        id:        crypto.randomUUID(),
        role:      "assistant",
        content:   data.response ?? "Sorry, I couldn't generate a response.",
        timestamp: new Date().toLocaleTimeString(),
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
    <div className="flex gap-0 border-b border-border shrink-0">
      {COPILOT_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setSubTab(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
            subTab === t.id
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
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
        <Suspense fallback={<div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>}>
          {subTab === "writing" && <div className="pt-6"><WritingPage /></div>}
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {tabBar}

      {/* Header */}
      <div className="flex items-center justify-between py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Copilot</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-muted-foreground">Groq LLaMA 3.3 · Persistent memory</p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={clearSession}
          title="New conversation"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Session info strip */}
      <div className="flex items-center gap-3 mb-2 px-1 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Hash className="w-3 h-3" />
          <span className="font-mono">{sessionId ? `${sessionId.slice(0, 24)}…` : "—"}</span>
        </div>
        {msgCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {msgCount} exchange{msgCount !== 1 ? "s" : ""} remembered
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}

        {loading && <TypingDots />}

        {messages.length === 1 && !loading && (
          <div className="pt-2 grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-left text-xs p-3 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 bg-secondary border border-border rounded-xl p-3">
        {/* Attached file chip */}
        {attachedFile && (() => {
          const FileIcon = getFileIcon(attachedFile.name);
          return (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 w-fit max-w-full">
              <FileIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-xs text-blue-400 truncate max-w-50">{attachedFile.name}</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="ml-0.5 text-blue-400/60 hover:text-blue-400 shrink-0"
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
          className="w-full bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[36px] max-h-32 leading-relaxed"
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
          <p className="text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for newline
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Document */}
            <Button
              onClick={() => docInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-blue-400"
              title="Attach PDF or document"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
            {/* Image */}
            <Button
              onClick={() => imgInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-emerald-400"
              title="Attach image"
            >
              <Image className="w-3.5 h-3.5" />
            </Button>
            {/* Audio */}
            <Button
              onClick={() => audioInputRef.current?.click()}
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-amber-400"
              title="Attach audio"
            >
              <AudioLines className="w-3.5 h-3.5" />
            </Button>
            <VoiceButton
              chatHistory={messages.map((m) => ({ role: m.role, content: m.content }))}
              onResult={onVoiceResult}
              size="sm"
            />
            <Button
              onClick={() => send()}
              disabled={(!input.trim() && !attachedFile) || loading}
              size="icon"
              className="w-8 h-8 rounded-lg gradient-blue text-white border-0 shrink-0"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send    className="w-3.5 h-3.5" />
              }
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
