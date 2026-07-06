"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Send, Bot, User, Loader2, RefreshCw, Hash, X, FileText, Image, AudioLines, Scale, Plus, Sparkles } from "lucide-react";
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
  { id: "compare", label: "Compare" },
  { id: "writing", label: "Writing Assistant" },
];

interface CompareAttr { key: string; value: string }
interface CompareItem { name: string; attrs: CompareAttr[] }

function emptyCompareItem(label: string): CompareItem {
  return { name: label, attrs: [{ key: "", value: "" }] };
}

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
            className="ml-1 text-xs text-blue-400 hover:text-blue-300 hover:underline text-left"
          >
            → {msg.followUp}
          </button>
        )}
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
  const [structuredMode, setStructuredMode] = useState(false);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const docInputRef  = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Compare tab
  const [compareContext, setCompareContext] = useState("Risk Analysis");
  const [compareItems, setCompareItems] = useState<CompareItem[]>([emptyCompareItem("Item A"), emptyCompareItem("Item B")]);
  const [compareResult, setCompareResult] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);

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

  const addCompareItem = () => {
    setCompareItems((prev) => [...prev, emptyCompareItem(`Item ${String.fromCharCode(65 + prev.length)}`)]);
  };

  const removeCompareItem = (idx: number) => {
    setCompareItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCompareItemName = (idx: number, name: string) => {
    setCompareItems((prev) => prev.map((it, i) => i === idx ? { ...it, name } : it));
  };

  const addCompareAttr = (idx: number) => {
    setCompareItems((prev) => prev.map((it, i) => i === idx ? { ...it, attrs: [...it.attrs, { key: "", value: "" }] } : it));
  };

  const updateCompareAttr = (idx: number, attrIdx: number, field: "key" | "value", val: string) => {
    setCompareItems((prev) => prev.map((it, i) => i === idx
      ? { ...it, attrs: it.attrs.map((a, ai) => ai === attrIdx ? { ...a, [field]: val } : a) }
      : it));
  };

  const removeCompareAttr = (idx: number, attrIdx: number) => {
    setCompareItems((prev) => prev.map((it, i) => i === idx
      ? { ...it, attrs: it.attrs.filter((_, ai) => ai !== attrIdx) }
      : it));
  };

  const runCompare = async () => {
    const items = compareItems
      .filter((it) => it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        data: Object.fromEntries(it.attrs.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value])),
      }));
    if (items.length < 2) {
      setCompareResult("");
      return;
    }
    setCompareLoading(true);
    setCompareResult("");
    try {
      const res = await fetch(`${API}/api/v1/copilot/compare`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ context: compareContext, items }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCompareResult(data.response ?? "No comparison generated.");
    } catch {
      setCompareResult("Sorry, the comparison failed. Please try again.");
    } finally {
      setCompareLoading(false);
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

  if (subTab === "compare") {
    return (
      <div className="space-y-6">
        {tabBar}
        <div className="pt-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Scale className="w-5 h-5 text-blue-400" /> Compare Items
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Get an AI-generated side-by-side comparison of 2 or more projects, runs, or datasets.
            </p>
          </div>

          <input
            placeholder="Comparison context (e.g. Risk Analysis, Cost Overrun, Vendor Performance)"
            value={compareContext}
            onChange={(e) => setCompareContext(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {compareItems.map((item, idx) => (
              <div key={idx} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateCompareItemName(idx, e.target.value)}
                    placeholder="Item name"
                    className="flex-1 px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {compareItems.length > 2 && (
                    <button onClick={() => removeCompareItem(idx)} className="text-muted-foreground hover:text-red-400 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {item.attrs.map((attr, attrIdx) => (
                    <div key={attrIdx} className="flex items-center gap-2">
                      <input
                        value={attr.key}
                        onChange={(e) => updateCompareAttr(idx, attrIdx, "key", e.target.value)}
                        placeholder="Field (e.g. risk_score)"
                        className="flex-1 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        value={attr.value}
                        onChange={(e) => updateCompareAttr(idx, attrIdx, "value", e.target.value)}
                        placeholder="Value"
                        className="flex-1 px-2.5 py-1.5 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {item.attrs.length > 1 && (
                        <button onClick={() => removeCompareAttr(idx, attrIdx)} className="text-muted-foreground hover:text-red-400 p-1 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => addCompareAttr(idx)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                  <Plus className="w-3.5 h-3.5" /> Add field
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={addCompareItem}>
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
            <Button onClick={runCompare} disabled={compareLoading} className="gradient-blue text-white border-0">
              {compareLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Compare
            </Button>
          </div>

          {compareResult && (
            <div className="bg-card border border-blue-500/20 rounded-2xl p-6">
              <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">{renderContent(compareResult)}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

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
            <h1 className="text-4xl font-bold text-foreground">AI Copilot</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-muted-foreground">Groq LLaMA 3.3 · Persistent memory</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={structuredMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setStructuredMode((v) => !v)}
            title="Structured mode — confidence score, domain tag, follow-up suggestion"
            className={structuredMode ? "gradient-blue text-white border-0 text-xs" : "text-muted-foreground hover:text-foreground text-xs"}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Structured
          </Button>
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
