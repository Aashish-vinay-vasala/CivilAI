"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ModuleChatProps {
  context: string;
  placeholder?: string;
  pageSummaryData?: Record<string, unknown>;
}

export default function ModuleChat({
  context,
  placeholder,
  pageSummaryData,
}: ModuleChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: `I'm your CivilAI assistant for ${context}. Ask me anything or click "Summarize Page" to get an AI summary!`,
      }]);
    }
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
        "http://localhost:8000/api/v1/copilot/chat",
        {
          message: `[Context: ${context}] ${msg}`,
          chat_history: messages,
        }
      );
      setMessages([...newMessages, {
        role: "assistant",
        content: response.data.response,
      }]);
    } catch {
      setMessages([...newMessages, {
        role: "assistant",
        content: "Error. Please try again.",
      }]);
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
        "http://localhost:8000/api/v1/copilot/chat",
        {
          message: summaryPrompt,
          chat_history: [],
        }
      );
      setMessages([...newMessages, {
        role: "assistant",
        content: response.data.response,
      }]);
    } catch {
      setMessages([...newMessages, {
        role: "assistant",
        content: "Error summarizing page.",
      }]);
    } finally {
      setLoading(false);
      setSummarizing(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={summarizePage}
          disabled={summarizing}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-background border border-border shadow-lg text-sm font-medium text-foreground hover:border-blue-500/50 transition-colors"
        >
          {summarizing ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-blue-400" />
          )}
          Summarize Page
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full gradient-blue shadow-lg flex items-center justify-center"
        >
          <Bot className="w-6 h-6 text-white" />
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 z-40"
            />

            <motion.div
              initial={{ opacity: 0, x: 400 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 400 }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed right-0 top-0 h-full w-96 flex flex-col z-50 shadow-2xl"
              style={{
                background: "hsl(var(--background))",
                borderLeft: "1px solid hsl(var(--border))",
              }}
            >
              <div
                className="flex items-center gap-3 p-4 border-b border-border"
                style={{ background: "hsl(var(--background))" }}
              >
                <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-sm">
                    CivilAI Assistant
                  </p>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-xs text-muted-foreground">{context}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="px-4 pt-3">
                <button
                  onClick={summarizePage}
                  disabled={summarizing || loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors"
                >
                  {summarizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Summarize This Page
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ background: "hsl(var(--background))" }}
              >
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "assistant"
                          ? "gradient-blue"
                          : "bg-secondary border border-border"
                      }`}>
                        {msg.role === "assistant" ? (
                          <Bot className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <span className="text-xs text-foreground">U</span>
                        )}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === "assistant"
                          ? "bg-secondary text-foreground rounded-tl-none border border-border"
                          : "gradient-blue text-white rounded-tr-none"
                      }`}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {loading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full gradient-blue flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-secondary border border-border rounded-2xl rounded-tl-none px-3 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {messages.length <= 1 && (
                <div
                  className="px-4 pb-2 flex flex-wrap gap-2"
                  style={{ background: "hsl(var(--background))" }}
                >
                  {["What needs attention?", "Show key risks", "Give recommendations"].map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="p-4 border-t border-border"
                style={{ background: "hsl(var(--background))" }}
              >
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={placeholder || `Ask about ${context}...`}
                    className="flex-1 px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    onClick={() => send()}
                    disabled={!input.trim() || loading}
                    size="icon"
                    className="gradient-blue text-white border-0 rounded-xl"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}