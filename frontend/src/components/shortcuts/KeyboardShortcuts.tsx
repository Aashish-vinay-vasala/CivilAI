"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Shortcut {
  keys: string[];
  description: string;
  action?: () => void;
}

const Kbd = ({ keys }: { keys: string[] }) => (
  <div className="flex items-center gap-1">
    {keys.map((k, i) => (
      <span key={i} className="px-1.5 py-0.5 text-xs font-mono font-medium bg-secondary border border-border rounded text-foreground">
        {k}
      </span>
    ))}
  </div>
);

const sections = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "C"], description: "Go to Cost & Budget" },
      { keys: ["G", "S"], description: "Go to Scheduling" },
      { keys: ["G", "R"], description: "Go to Reports" },
      { keys: ["G", "A"], description: "Go to Analytics" },
      { keys: ["G", ","], description: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open search" },
      { keys: ["Ctrl", "S"], description: "Save / export" },
      { keys: ["?"], description: "Show this help" },
      { keys: ["Esc"], description: "Close panel / modal" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
      { keys: ["Ctrl", "D"], description: "Toggle dark/light mode" },
      { keys: ["Ctrl", "H"], description: "Open Help Center" },
    ],
  },
];

export function useKeyboardShortcuts(options?: {
  onSearch?: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onOpenHelp?: () => void;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        setShowModal(false);
        return;
      }
      if (e.key === "?" && !inInput) {
        setShowModal((v) => !v);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "k") { e.preventDefault(); options?.onSearch?.(); return; }
        if (e.key === "b") { e.preventDefault(); options?.onToggleSidebar?.(); return; }
        if (e.key === "d") { e.preventDefault(); options?.onToggleTheme?.(); return; }
        if (e.key === "h") { e.preventDefault(); options?.onOpenHelp?.(); return; }
      }
      // G-chord nav (only outside inputs)
      if (!inInput && e.key === "g") {
        const next = (ev: KeyboardEvent) => {
          document.removeEventListener("keydown", next);
          if (ev.key === "d") router.push("/dashboard");
          if (ev.key === "c") router.push("/cost");
          if (ev.key === "s") router.push("/scheduling");
          if (ev.key === "r") router.push("/reports");
          if (ev.key === "a") router.push("/analytics");
          if (ev.key === ",") router.push("/settings");
        };
        document.addEventListener("keydown", next, { once: true });
      }
    },
    [router, options]
  );

  useEffect(() => {
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handler]);

  return { showModal, setShowModal };
}

export default function KeyboardShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 top-1/2 -translate-y-1/2 w-full sm:w-[540px] bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-blue-400" />
                <h2 className="font-semibold text-foreground">Keyboard Shortcuts</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid sm:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
              {sections.map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {section.title}
                  </p>
                  <div className="space-y-2">
                    {section.shortcuts.map((s, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{s.description}</span>
                        <Kbd keys={s.keys} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Press <Kbd keys={["?"]} /> anywhere to toggle this dialog</p>
              <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
