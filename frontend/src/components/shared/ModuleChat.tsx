"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Loader2, Sparkles, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";

const POSITION_KEY   = "civilai_widget_pos";
const BUTTON_SIZE    = 48;
const PANEL_W        = 340;
const PANEL_H        = 440;
const DRAG_THRESHOLD = 5;

interface Message {
  role: "user" | "assistant";
  content: string;
}

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

function renderContent(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function ModuleChat({
  context,
  placeholder,
  pageSummaryData,
}: ModuleChatProps) {
  const [open,        setOpen]        = useState(false);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [listening,   setListening]   = useState(false);
  const [pos,         setPos]         = useState<{ x: number; y: number } | null>(null);
  const [dragging,    setDragging]    = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const dragOffset     = useRef({ x: 0, y: 0 });
  const startMouse     = useRef({ x: 0, y: 0 });
  const hasDragged     = useRef(false);

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

  // ── Chat helpers ─────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: `I'm your CivilAI assistant for ${context}. Ask me anything or tap "Summarize Page" to get an AI summary!`,
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`,
        { message: `[Context: ${context}] ${msg}`, chat_history: messages }
      );
      setMessages([...newMessages, { role: "assistant", content: response.data.response }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error. Please try again." }]);
    } finally {
      setLoading(false);
    }
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
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error summarizing page." }]);
    } finally {
      setLoading(false);
      setSummarizing(false);
    }
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported in this browser. Try Chrome."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition: any = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart  = () => setListening(true);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
      setTimeout(() => send(transcript), 300);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend   = () => setListening(false);
    recognition.start();
  };

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
  const panelAbove = pos ? pos.y + BUTTON_SIZE + PANEL_H + 8 > window.innerHeight : false;
  const panelLeft  = pos ? pos.x + PANEL_W > window.innerWidth : false;

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
            initial={{ opacity: 0, y: panelAbove ? 12 : -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{    opacity: 0, y: panelAbove ? 12 : -12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col rounded-2xl overflow-hidden shadow-2xl absolute"
            style={{
              width:          PANEL_W,
              height:         PANEL_H,
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
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setOpen(false)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summarize button */}
            <div className="px-3 pt-2.5 shrink-0">
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 mt-1">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className="max-w-[84%] px-3 py-2 rounded-xl text-[12px] leading-relaxed text-white/85 whitespace-pre-wrap"
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
                    {renderContent(m.content)}
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

              {messages.length <= 1 && !loading && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["What needs attention?", "Show key risks", "Give recommendations"].map(s => (
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
            </div>

            {/* Input */}
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-2.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <input
                ref={inputRef}
                value={input}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={placeholder || `Ask about ${context}…`}
                className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 focus:outline-none"
              />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={toggleVoice}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  listening ? "text-red-400 bg-red-500/10" : "text-white/30 hover:text-white/60"
                }`}
                title={listening ? "Stop recording" : "Speak to AI"}
              >
                {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg,rgba(0,212,255,0.25),rgba(29,78,216,0.25))",
                  border:     "1px solid rgba(0,212,255,0.25)",
                }}
              >
                {loading
                  ? <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                  : <Send    className="w-3 h-3 text-cyan-400" />
                }
              </button>
            </div>
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
