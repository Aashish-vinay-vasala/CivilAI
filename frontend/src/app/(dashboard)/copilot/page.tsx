"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, Trash2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";

const TranscribePage = dynamic(() => import("../transcribe/page"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>,
});
const WritingPage = dynamic(() => import("../writing/page"), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>,
});

const COPILOT_TABS = [
  { id: "chat",       label: "Chat" },
  { id: "transcribe", label: "Transcription" },
  { id: "writing",    label: "Writing Assistant" },
];

const STORAGE_KEY = "civilai_copilot_history";
const MAX_HISTORY = 40;
const RATE_LIMIT_MS = 1000;

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hello! I'm CivilAI Copilot, your AI assistant for construction management. I can help you with project scheduling, cost analysis, safety assessments, contract reviews, and much more. What would you like to know?",
  timestamp: new Date().toISOString(),
};

const suggestions = [
  "What are the main causes of construction delays?",
  "Analyze cost overrun risks for my project",
  "Generate a safety checklist for high-rise construction",
  "What should I look for in a construction contract?",
  "How can I reduce material waste on site?",
  "Predict workforce requirements for next month",
];

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Message[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupt storage — reset
  }
  return [INITIAL_MESSAGE];
}

function saveHistory(msgs: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY)));
  } catch {
    // storage quota — ignore
  }
}

export default function CopilotPage() {
  const [subTab, setSubTab] = useState("chat");
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lastSentAt = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = text || input.trim();
      if (!messageText || loading) return;

      // Rate limit: 1 message per second
      const now = Date.now();
      if (now - lastSentAt.current < RATE_LIMIT_MS) return;
      lastSentAt.current = now;

      const userMsg: Message = {
        role: "user",
        content: messageText,
        timestamp: new Date().toISOString(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      saveHistory(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`,
          { message: messageText, chat_history: history }
        );

        const assistantMsg: Message = {
          role: "assistant",
          content: response.data.response,
          timestamp: new Date().toISOString(),
        };
        const withReply = [...nextMessages, assistantMsg];
        setMessages(withReply);
        saveHistory(withReply);
      } catch {
        const errMsg: Message = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };
        const withErr = [...nextMessages, errMsg];
        setMessages(withErr);
        saveHistory(withErr);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages]
  );

  const clearChat = () => {
    const fresh = [{ ...INITIAL_MESSAGE, content: "Chat cleared! How can I help you?", timestamp: new Date().toISOString() }];
    setMessages(fresh);
    saveHistory(fresh);
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
          {subTab === "transcribe" && <div className="pt-6"><TranscribePage /></div>}
          {subTab === "writing" && <div className="pt-6"><WritingPage /></div>}
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {tabBar}
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Copilot</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-muted-foreground">Powered by Groq LLaMA 3.3</p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearChat}
          className="text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear
        </Button>
      </motion.div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === "assistant"
                    ? "gradient-blue"
                    : "bg-secondary border border-border"
                }`}
              >
                {message.role === "assistant" ? (
                  <Bot className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-foreground" />
                )}
              </div>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  message.role === "assistant"
                    ? "bg-card border border-border rounded-tl-none"
                    : "gradient-blue rounded-tr-none"
                }`}
              >
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
                {mounted && (
                  <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length === 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-2 gap-2 mb-4"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => sendMessage(suggestion)}
              className="text-left text-xs p-3 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </motion.div>
      )}

      {/* Input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-2 items-end"
      >
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask CivilAI anything about your project..."
            rows={1}
            className="w-full px-4 py-3 pr-12 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-2 bottom-2 w-8 h-8 text-muted-foreground hover:text-blue-400"
          >
            <Mic className="w-4 h-4" />
          </Button>
        </div>
        <Button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="gradient-blue text-white border-0 h-11 w-11 rounded-xl shrink-0"
          size="icon"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </motion.div>
    </div>
  );
}
