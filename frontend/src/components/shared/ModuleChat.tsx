"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, X, Loader2, Sparkles, Mic, MicOff, Volume2, Gauge, Globe, Copy, Check,
  Maximize2, Minimize2, Plus, History as HistoryIcon, Download, ChevronLeft, Trash2, ChevronDown,
  Image as ImageIcon, FileAudio, FileText, RefreshCw, Search, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";
import {
  useChatWidgetStore,
  type ChatMessage as Message,
  type ChatSource as Source,
} from "@/lib/stores/chatWidgetStore";

const POSITION_KEY    = "civilai_widget_pos";
const SPEECH_RATE_KEY = "civilai_widget_speech_rate";
const SPEECH_RATES    = [0.75, 1, 1.25, 1.5, 1.75, 2];
const VOICE_KEY       = "civilai_widget_voice";
const DEFAULT_VOICES  = ["autumn", "diana", "hannah", "austin", "daniel", "troy"];
const BUTTON_SIZE     = 48;
const PANEL_W         = 340;
const PANEL_H         = 440;
const MAX_PANEL_W     = 640;
const MAX_PANEL_H     = 720;
const DRAG_THRESHOLD  = 5;
const API             = process.env.NEXT_PUBLIC_API_URL ?? "";
const UPLOAD_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";
const UPLOAD_AUDIO_ACCEPT = ".mp3,.wav,.webm,.m4a,.ogg,.flac";
const UPLOAD_DOC_ACCEPT   = ".pdf,.docx,.doc,.xlsx,.xls,.csv";
const UPLOAD_AUDIO_EXTS = new Set(["mp3", "wav", "webm", "m4a", "ogg", "flac"]);
const UPLOAD_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

type VoiceState = "idle" | "recording" | "processing" | "speaking";

// "browser" = the OS/browser's own speech engine (window.speechSynthesis) — on
// Windows these are literally named "Microsoft David/Zira/...", and Chrome adds
// "Google US English" etc. Free, instant, no backend round-trip.
// "groq" = the backend's Groq Orpheus TTS voices (server round-trip, MP3).
type VoiceChoice =
  | { engine: "browser"; voiceURI: string; name: string }
  | { engine: "groq"; name: string };

// Plain fetch() isn't covered by the axios auth interceptor (axiosAuthInterceptor.ts),
// so the voice endpoints need their Supabase bearer token attached manually.
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface SavedSession {
  id: string;
  label: string;
  messages: Message[];
  created_at: string;
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

type InlineToken =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "link"; content: string; url: string }
  | { type: "navlink"; content: string; href: string };

// Recognized module keywords → internal route, for turning plain mentions like
// "3 open RFIs" into an in-app link. Ordered roughly most- to least-specific;
// first match wins at each position so more specific phrases beat generic ones.
const MODULE_LINKS: { re: RegExp; href: string }[] = [
  { re: /\bRFIs?\b/i,                                   href: "/rfis" },
  { re: /\bsafety incidents?\b/i,                       href: "/safety" },
  { re: /\bsafety score\b/i,                            href: "/safety" },
  { re: /\bcost overruns?\b/i,                          href: "/cost" },
  { re: /\bbudget\b/i,                                  href: "/cost" },
  { re: /\b(?:EVM|earned value management|CPI|SPI)\b/,  href: "/evm" },
  { re: /\bcritical path\b/i,                           href: "/scheduling" },
  { re: /\bschedul(?:e|ing|ed) (?:tasks?|delays?)\b/i,   href: "/scheduling" },
  { re: /\bworkforce\b/i,                                href: "/workforce" },
  { re: /\bequipment\b/i,                                href: "/equipment" },
  { re: /\bchange orders?\b/i,                           href: "/contracts" },
  { re: /\bcontracts?\b/i,                                href: "/contracts" },
  { re: /\bpermits?\b/i,                                 href: "/compliance" },
  { re: /\bpurchase orders?\b/i,                         href: "/procurement" },
  { re: /\bvendors?\b/i,                                 href: "/vendors" },
  { re: /\binvoices?\b/i,                                href: "/payments" },
  { re: /\bpayments?\b/i,                                href: "/payments" },
  { re: /\bsubmittals?\b/i,                              href: "/documents" },
  { re: /\bdaily reports?\b/i,                           href: "/daily-reports" },
  { re: /\bmeetings?\b/i,                                href: "/meetings" },
  { re: /\banomal(?:y|ies)\b/i,                          href: "/anomaly" },
  { re: /\bsupport tickets?\b/i,                         href: "/support" },
];

// Splits a plain-text run into text/navlink pieces by finding the earliest
// MODULE_LINKS match and recursing on the remainder.
function linkifyModules(text: string): InlineToken[] {
  let earliest: { index: number; length: number; href: string } | null = null;
  for (const { re, href } of MODULE_LINKS) {
    const m = re.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { index: m.index, length: m[0].length, href };
    }
  }
  if (!earliest) return text ? [{ type: "text", content: text }] : [];
  const before = text.slice(0, earliest.index);
  const match   = text.slice(earliest.index, earliest.index + earliest.length);
  const after   = text.slice(earliest.index + earliest.length);
  const tokens: InlineToken[] = [];
  if (before) tokens.push({ type: "text", content: before });
  tokens.push({ type: "navlink", content: match, href: earliest.href });
  tokens.push(...linkifyModules(after));
  return tokens;
}

// Splits message text into plain / **bold** / [markdown link](url) segments, in
// order, then further expands plain-text runs into recognized module deep-links.
function parseInlineTokens(text: string): InlineToken[] {
  const rawTokens: InlineToken[] = [];
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) rawTokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
    if (match[1]) {
      rawTokens.push({ type: "bold", content: match[1].slice(2, -2) });
    } else if (match[2]) {
      const linkMatch = match[2].match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) rawTokens.push({ type: "link", content: linkMatch[1], url: linkMatch[2] });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) rawTokens.push({ type: "text", content: text.slice(lastIndex) });

  const tokens: InlineToken[] = [];
  for (const tok of rawTokens) {
    if (tok.type === "text") tokens.push(...linkifyModules(tok.content));
    else tokens.push(tok);
  }
  return tokens;
}

// Proxied through our own backend (not called directly) — the favicon provider
// sends no CORS headers, so a raw <img src="https://www.google.com/s2/favicons...">
// would display fine but couldn't be read as pixel data for the PDF export.
function faviconProxyUrl(pageUrl: string): string {
  return `${API}/api/v1/copilot/favicon?url=${encodeURIComponent(pageUrl)}`;
}

function renderContent(text: string, navigate: (href: string) => void) {
  return parseInlineTokens(text).map((tok, i) => {
    if (tok.type === "bold") return <strong key={i}>{tok.content}</strong>;
    if (tok.type === "link") {
      return (
        <a
          key={i}
          href={tok.url}
          target="_blank"
          rel="noreferrer"
          onMouseDown={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-cyan-400 underline decoration-cyan-400/40 hover:text-cyan-300"
        >
          <img src={faviconProxyUrl(tok.url)} alt="" className="inline-block w-3 h-3 rounded-sm" />
          {tok.content}
        </a>
      );
    }
    if (tok.type === "navlink") {
      return (
        <button
          key={i}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => navigate(tok.href)}
          title={`Go to ${tok.href}`}
          className="font-medium text-cyan-400 underline decoration-cyan-400/40 hover:text-cyan-300"
        >
          {tok.content}
        </button>
      );
    }
    return <span key={i}>{tok.content}</span>;
  });
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

// ── PDF export helpers ───────────────────────────────────────────────────────
// jsPDF has no rich-text support, so bold/link tokens are flattened into
// individually-styled "pieces" (one per word) and word-wrapped by hand.

interface PdfPiece {
  text: string;
  bold: boolean;
  url?: string;
  iconFirst?: boolean; // true on the first word of a link, so the favicon is only drawn once
}

function tokensToPieces(tokens: InlineToken[]): PdfPiece[] {
  const pieces: PdfPiece[] = [];
  for (const tok of tokens) {
    if (tok.type === "link") {
      tok.content.split(" ").filter(Boolean).forEach((w, i) =>
        pieces.push({ text: w, bold: false, url: tok.url, iconFirst: i === 0 }));
    } else if (tok.type === "navlink") {
      // Absolute so the link still works when the PDF is opened later/elsewhere.
      const absoluteUrl = typeof window !== "undefined" ? `${window.location.origin}${tok.href}` : tok.href;
      tok.content.split(" ").filter(Boolean).forEach(w =>
        pieces.push({ text: w, bold: false, url: absoluteUrl }));
    } else {
      tok.content.split(" ").filter(Boolean).forEach(w =>
        pieces.push({ text: w, bold: tok.type === "bold" }));
    }
  }
  return pieces;
}

async function fetchFaviconDataUrl(pageUrl: string): Promise<string | null> {
  try {
    // cache: "no-store" avoids a Chromium quirk where a favicon already loaded via
    // an <img> tag (no-cors, opaque) can shadow this cors fetch() to the same URL.
    const res = await fetch(faviconProxyUrl(pageUrl), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function collectLinkUrls(messages: Message[]): string[] {
  const urls = new Set<string>();
  for (const m of messages) {
    for (const tok of parseInlineTokens(m.content)) {
      if (tok.type === "link") urls.add(tok.url);
    }
    (m.sources ?? []).forEach(s => urls.add(s.url));
  }
  return [...urls];
}

const PDF_MARGIN = 14;
const PDF_BOTTOM = 282;
const PDF_LINE_H = 5;

interface PdfCursor { y: number; }

function pdfNewPageIfNeeded(doc: jsPDF, cursor: PdfCursor, need = PDF_LINE_H) {
  if (cursor.y + need > PDF_BOTTOM) {
    doc.addPage();
    cursor.y = 20;
  }
}

// Word-wraps `text` (with **bold** / [link](url) tokens already resolved) onto the
// page, drawing real bold glyphs and real clickable+favicon-tagged links instead of
// literal markdown syntax.
function drawRichParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  maxWidth: number,
  cursor: PdfCursor,
  faviconMap: Map<string, string>,
) {
  const iconSize = 3.2;
  for (const rawPara of text.split("\n")) {
    const para = rawPara.trim();
    if (!para) { cursor.y += PDF_LINE_H * 0.6; continue; }

    const bulletMatch = para.match(/^[-•]\s+(.*)$/);
    const paraX   = bulletMatch ? x + 4 : x;
    const paraW   = bulletMatch ? maxWidth - 4 : maxWidth;
    const pieces  = tokensToPieces(parseInlineTokens(bulletMatch ? `•  ${bulletMatch[1]}` : para));

    let cx = paraX;
    let firstOnLine = true;
    pdfNewPageIfNeeded(doc, cursor);

    for (const p of pieces) {
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      if (p.url) doc.setTextColor(37, 130, 210);
      else       doc.setTextColor(60, 60, 60);

      const hasIcon = !!(p.iconFirst && p.url && faviconMap.get(p.url));
      const iconW   = hasIcon ? iconSize + 1 : 0;
      const sepW    = firstOnLine ? 0 : doc.getTextWidth(" ");
      const textW   = doc.getTextWidth(p.text);

      if (!firstOnLine && cx + sepW + iconW + textW > paraX + paraW) {
        cursor.y += PDF_LINE_H;
        pdfNewPageIfNeeded(doc, cursor);
        cx = paraX;
        firstOnLine = true;
      }

      let drawX = cx + (firstOnLine ? 0 : sepW);
      if (hasIcon) {
        try { doc.addImage(faviconMap.get(p.url!)!, "PNG", drawX, cursor.y - iconSize + 0.9, iconSize, iconSize); } catch { /* skip malformed icon */ }
        drawX += iconW;
      }

      doc.text(p.text, drawX, cursor.y);
      if (p.url) doc.link(drawX, cursor.y - 3.3, textW, 4, { url: p.url });

      cx = drawX + textW;
      firstOnLine = false;
    }
    cursor.y += PDF_LINE_H;
  }
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
    startNewSession, loadSession,
  } = useChatWidgetStore();

  const router = useRouter();

  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
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
  const [maximized,      setMaximized]      = useState(false);
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

  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const streamRef       = useRef<MediaStream | null>(null);
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

  // ── TTS voice (persisted) — browser (Google/Microsoft) voices + Groq AI voices ──
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${API}/api/v1/voice/voices`);
        const data = await res.json();
        const list: string[] = data.voices ?? [];
        if (list.length) setGroqVoices(list);
      } catch { /* keep DEFAULT_VOICES fallback */ }
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

  // Stop any in-progress recording/playback when the panel is closed or unmounted
  useEffect(() => {
    if (open) return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setMaximized(false);
    setShowVoicePicker(false);
    setShowUsage(false);
  }, [open]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  // Auto-save the conversation to Supabase as it grows (debounced), so it shows
  // up in the Voice Bot module's History tab and can be reopened later.
  useEffect(() => {
    if (messages.length <= 1) return;
    const timer = setTimeout(() => {
      const firstUser = messages.find(m => m.role === "user");
      axios.post(`${API}/api/v1/copilot/sessions`, {
        id:       sessionId,
        label:    (firstUser?.content ?? context).slice(0, 80),
        messages,
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, sessionId, context]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // ── Sessions: new chat / history list ──────────────────────────────
  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/copilot/sessions`);
      setSessions(res.data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
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
    try { await axios.delete(`${API}/api/v1/copilot/sessions/${id}`); } catch {}
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
      // Preload every referenced favicon as a data URL up front — jsPDF.addImage
      // needs actual pixel data in hand, it can't fetch asynchronously mid-draw.
      const urls = collectLinkUrls(messages);
      const faviconMap = new Map<string, string>();
      await Promise.all(urls.map(async u => {
        const dataUrl = await fetchFaviconDataUrl(u);
        if (dataUrl) faviconMap.set(u, dataUrl);
      }));

      const doc = new jsPDF();
      const pw    = doc.internal.pageSize.getWidth();
      const bodyW = pw - PDF_MARGIN * 2;
      const cursor: PdfCursor = { y: 20 };

      // ── Cover header ──
      doc.setFontSize(18); doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.text("CivilAI Assistant Conversation", pw / 2, cursor.y, { align: "center" });
      cursor.y += 7;
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      doc.text(`${context} · ${new Date().toLocaleString()}`, pw / 2, cursor.y, { align: "center" });
      cursor.y += 5;
      doc.setDrawColor(0, 180, 220);
      doc.setLineWidth(0.6);
      doc.line(PDF_MARGIN, cursor.y, pw - PDF_MARGIN, cursor.y);
      cursor.y += 10;

      for (const m of messages) {
        pdfNewPageIfNeeded(doc, cursor, 12);

        // Role tag — small colored pill
        const isUser = m.role === "user";
        const tag    = isUser ? "You" : "CivilAI Assistant";
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        const tagW = doc.getTextWidth(tag) + 6;
        doc.setFillColor(isUser ? 230 : 210, isUser ? 240 : 235, isUser ? 250 : 255);
        doc.roundedRect(PDF_MARGIN, cursor.y - 4, tagW, 6, 1.5, 1.5, "F");
        doc.setTextColor(isUser ? 30 : 20, isUser ? 100 : 110, isUser ? 180 : 190);
        doc.text(tag, PDF_MARGIN + 3, cursor.y);
        cursor.y += 7;

        // Body text — real bold, real clickable+favicon links, bullet indents
        doc.setFontSize(10);
        drawRichParagraph(doc, m.content, PDF_MARGIN, bodyW, cursor, faviconMap);

        // Sources mini-list (web-search citations), mirrors the chat UI's chips
        if (m.sources && m.sources.length > 0) {
          cursor.y += 1;
          pdfNewPageIfNeeded(doc, cursor, 6);
          doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(140, 140, 140);
          doc.text("SOURCES", PDF_MARGIN, cursor.y);
          cursor.y += 4.5;
          for (const s of m.sources) {
            pdfNewPageIfNeeded(doc, cursor, 5);
            const icon = faviconMap.get(s.url);
            let sx = PDF_MARGIN;
            if (icon) {
              try { doc.addImage(icon, "PNG", sx, cursor.y - 3, 3.2, 3.2); } catch { /* skip */ }
              sx += 4.2;
            }
            doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(37, 130, 210);
            const label = doc.splitTextToSize(s.title, pw - PDF_MARGIN - sx)[0] as string;
            doc.text(label, sx, cursor.y);
            doc.link(sx, cursor.y - 3, doc.getTextWidth(label), 4, { url: s.url });
            cursor.y += 4.5;
          }
        }

        // Divider between turns
        cursor.y += 3;
        pdfNewPageIfNeeded(doc, cursor, 4);
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(PDF_MARGIN, cursor.y - 2, pw - PDF_MARGIN, cursor.y - 2);
        cursor.y += 4;
      }

      // Page numbers
      const pageCount = doc.internal.pages.length - 1;
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8); doc.setTextColor(160, 160, 160); doc.setFont("helvetica", "normal");
        doc.text(`Page ${p} of ${pageCount}`, pw / 2, 292, { align: "center" });
      }

      const filename = `civilai-chat-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);

      const pdfBlob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
      const form = new FormData();
      form.append("pdf", pdfBlob, filename);
      form.append("messages", JSON.stringify(messages));
      form.append("label", sessionLabel || context);
      await fetch(`${API}/api/v1/copilot/transcripts/save`, {
        method: "POST", body: form, headers: await authHeaders(),
      });

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
    setMessages(prev => [...prev, { role: "assistant" as const, content: "" }]);
    try {
      const res = await fetch(`${API}/api/v1/copilot/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          message: `[Context: ${context}] ${question}`,
          chat_history: historyForRequest,
          web_search: webSearch,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Stream request failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          let evt: { delta?: string; done?: boolean; blocked?: boolean; response?: string; final?: string; sources?: Source[] };
          try { evt = JSON.parse(line); } catch { continue; }

          if (evt.delta) {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + evt.delta };
              return copy;
            });
          } else if (evt.done) {
            const finalText = evt.blocked ? (evt.response ?? "") : (evt.final ?? "");
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: finalText, sources: evt.sources };
              return copy;
            });
          }
        }
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Error. Please try again." };
        return copy;
      });
    } finally {
      setLoading(false);
    }
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
      const form = new FormData();
      form.append("file", file);
      form.append("message", question);
      form.append("session_id", sessionId);
      form.append("web_search", String(webSearch));
      const response = await axios.post(`${API}/api/v1/copilot/upload`, form);
      setMessages([...newMessages, {
        role: "assistant",
        content: response.data.response,
        sources: response.data.sources,
      }]);
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
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error summarizing page." }]);
    } finally {
      setLoading(false);
      setSummarizing(false);
    }
  };

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setVoiceState("idle");
    setSpeakingKey(null);
  }, []);

  const speak = useCallback((text: string, key: string | null = null) => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();

    const choice = voiceChoiceRef.current;
    setVoiceState("speaking");
    setSpeakingKey(key);

    if (choice.engine === "browser") {
      if (typeof window === "undefined" || !window.speechSynthesis) { setVoiceState("idle"); setSpeakingKey(null); return; }
      const voices = window.speechSynthesis.getVoices();
      const match  = voices.find(v => v.voiceURI === choice.voiceURI) ?? voices.find(v => v.name === choice.name);
      const utter  = new SpeechSynthesisUtterance(text.slice(0, 1000));
      if (match) utter.voice = match;
      utter.rate = speechRateRef.current;
      utter.onend   = () => { setVoiceState("idle"); setSpeakingKey(null); };
      utter.onerror = () => { setVoiceState("idle"); setSpeakingKey(null); };
      window.speechSynthesis.speak(utter);
      return;
    }

    (async () => {
      try {
        const form = new FormData();
        form.append("text", text.slice(0, 1000));
        form.append("voice", choice.name);
        const res = await fetch(`${API}/api/v1/voice/speak`, { method: "POST", body: form, headers: await authHeaders() });
        if (!res.ok) throw new Error("TTS failed");
        const blob  = await res.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.playbackRate = speechRateRef.current;
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); setVoiceState("idle"); setSpeakingKey(null); };
        audio.onerror = () => { URL.revokeObjectURL(url); setVoiceState("idle"); setSpeakingKey(null); };
        await audio.play();
      } catch {
        setVoiceState("idle");
        setSpeakingKey(null);
      }
    })();
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
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("chat_history", JSON.stringify(messages));
      form.append("web_search", String(webSearch));
      const res  = await fetch(`${API}/api/v1/voice/voice-chat`, { method: "POST", body: form, headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Voice chat failed");
      const { transcript, response, sources } = data as { transcript: string; response: string; sources?: Source[] };
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
  }, [messages, webSearch, speak]);

  const startRecording = useCallback(async () => {
    audioRef.current?.pause();
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        sendVoiceAudio(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.start(250);
      setVoiceState("recording");
    } catch {
      alert("Microphone access denied — please allow microphone access in your browser settings.");
    }
  }, [sendVoiceAudio]);

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const toggleVoice = () => {
    if (voiceState === "idle")      return void startRecording();
    if (voiceState === "recording") return stopRecording();
    if (voiceState === "speaking")  stopSpeaking();
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
  const maxPanelW  = Math.min(MAX_PANEL_W, window.innerWidth  - 32);
  const maxPanelH  = Math.min(MAX_PANEL_H, window.innerHeight - 32);

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
            initial={{ opacity: 0, y: maximized ? 0 : (panelAbove ? 12 : -12), scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{    opacity: 0, y: maximized ? 0 : (panelAbove ? 12 : -12), scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut", layout: { duration: 0.3, ease: "easeOut" } }}
            className={`flex flex-col rounded-2xl overflow-hidden shadow-2xl ${maximized ? "fixed" : "absolute"}`}
            style={maximized ? {
              width:          maxPanelW,
              height:         maxPanelH,
              top:            `calc(50vh - ${maxPanelH / 2}px)`,
              left:           `calc(50vw - ${maxPanelW / 2}px)`,
              background:     "rgba(8,12,24,0.97)",
              border:         "1px solid rgba(0,212,255,0.2)",
              backdropFilter: "blur(24px)",
              zIndex:         60,
            } : {
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
                  onClick={cycleSpeechRate}
                  title="Speech speed — click to cycle"
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  {speechRate}x
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setMaximized(v => !v)}
                  title={maximized ? "Minimize" : "Maximize"}
                  className="text-white/30 hover:text-white/70 transition-colors"
                >
                  {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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
                      {renderContent(m.content, router.push)}
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
