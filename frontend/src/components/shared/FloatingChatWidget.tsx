"use client";

/**
 * Floating chat widget — draggable, zero extra dependencies.
 * Drag the button anywhere; position is persisted to localStorage.
 * Appears on every dashboard page except /chatbot.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, HardHat, Loader2 } from "lucide-react";

const API          = process.env.NEXT_PUBLIC_API_URL ?? "";
const SESSION_KEY  = "civilai_chatbot_session";
const POSITION_KEY = "civilai_widget_pos";
const BUTTON_SIZE  = 48;
const PANEL_W      = 320;
const PANEL_H      = 400;
const DRAG_THRESHOLD = 5;

interface Msg {
  id:      string;
  role:    "user" | "assistant";
  content: string;
}

function getOrCreateSession(): string {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (s) return s;
    const id = `web_${Date.now()}`;
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `web_${Date.now()}`;
  }
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

export default function FloatingChatWidget() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pos,      setPos]      = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const dragOffset   = useRef({ x: 0, y: 0 });
  const startMouse   = useRef({ x: 0, y: 0 });
  const hasDragged   = useRef(false);

  // ── Init position from localStorage ────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        const x = clamp(p.x, 0, window.innerWidth  - BUTTON_SIZE);
        const y = clamp(p.y, 0, window.innerHeight - BUTTON_SIZE);
        setPos({ x, y });
        return;
      }
    } catch {}
    setPos(defaultPos());
  }, []);

  // Persist position
  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => {
      setPos(p => p ? {
        x: clamp(p.x, 0, window.innerWidth  - BUTTON_SIZE),
        y: clamp(p.y, 0, window.innerHeight - BUTTON_SIZE),
      } : defaultPos());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Chat helpers ────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        id:      "welcome",
        role:    "assistant",
        content: "Hi! I'm CivilAI. Ask me anything about your construction project.",
      }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/v1/chatbot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg, session_id: getOrCreateSession(), channel: "web" }),
      });
      const data = await res.json();
      if (data.session_id) {
        try { localStorage.setItem(SESSION_KEY, data.session_id); } catch {}
      }
      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    "assistant",
        content: data.reply ?? "Sorry, I couldn't get a response.",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    "assistant",
        content: "Connection error. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── Drag — mouse ────────────────────────────────────────────────
  const beginDrag = useCallback((clientX: number, clientY: number) => {
    hasDragged.current  = false;
    startMouse.current  = { x: clientX, y: clientY };
    dragOffset.current  = { x: clientX - (pos?.x ?? 0), y: clientY - (pos?.y ?? 0) };
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

  // ── Drag — touch ────────────────────────────────────────────────
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

  // ── Panel placement (avoids going off-screen) ───────────────────
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
      {/* ── Chat panel ────────────────────────────────────────────── */}
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
              ...(panelAbove  ? { bottom: BUTTON_SIZE + 8 } : { top: BUTTON_SIZE + 8 }),
              ...(panelLeft   ? { right: 0 }                : { left: 0 }),
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
                  <p className="text-[12px] font-semibold text-white">CivilAI</p>
                  <p className="text-[9px] text-white/30">Construction Assistant</p>
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className="max-w-[82%] px-3 py-2 rounded-xl text-[12px] leading-relaxed text-white/85"
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
                    {m.content}
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

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <input
                ref={inputRef}
                value={input}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Ask CivilAI…"
                className="flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/25 focus:outline-none"
              />
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={send}
                disabled={!input.trim() || loading}
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                style={{
                  background: "linear-gradient(135deg,rgba(0,212,255,0.25),rgba(29,78,216,0.25))",
                  border:     "1px solid rgba(0,212,255,0.25)",
                }}
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  : <Send    className="w-3.5 h-3.5 text-cyan-400" />
                }
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Trigger button ─────────────────────────────────────────── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          cursor: dragging ? "grabbing" : "grab",
          width:  BUTTON_SIZE,
          height: BUTTON_SIZE,
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
              ? <motion.div key="x"  initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0 }}>
                  <X       className="w-5 h-5 text-cyan-400" />
                </motion.div>
              : <motion.div key="hh" initial={{ opacity: 0, rotate:  90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0 }}>
                  <HardHat className="w-5 h-5 text-cyan-400" />
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
