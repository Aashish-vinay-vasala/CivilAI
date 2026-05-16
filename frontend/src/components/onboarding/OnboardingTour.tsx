"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string;
  title: string;
  content: string;
  position: "bottom" | "top" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "sidebar-nav",
    title: "Navigation Sidebar",
    content: "Access all 26 modules from here — cost, scheduling, safety, BIM, and more. Collapse it for more screen space.",
    position: "right",
  },
  {
    target: "notification-bell",
    title: "Notifications Center",
    content: "Stay on top of budget alerts, safety incidents, and document updates — all in one place.",
    position: "bottom",
  },
  {
    target: "search-bar",
    title: "Global Search",
    content: "Search across projects, documents, and modules instantly. Press Ctrl+K anytime.",
    position: "bottom",
  },
  {
    target: "theme-toggle",
    title: "Dark / Light Mode",
    content: "Switch between dark and light theme, or let it follow your system preference in Settings.",
    position: "bottom",
  },
  {
    target: "module-chat",
    title: "AI Copilot",
    content: "Every page has a built-in AI assistant. Ask questions, get insights, or request summaries of the current module.",
    position: "top",
  },
];

const STORAGE_KEY = "civilai-tour-complete";

export function useOnboardingTour() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const start = useCallback(() => setActive(true), []);
  const complete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setActive(false);
  }, []);
  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActive(true);
  }, []);

  return { active, start, complete, reset };
}

function Spotlight({ targetId }: { targetId: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el) {
      setRect(el.getBoundingClientRect());
      const obs = new ResizeObserver(() => setRect(el.getBoundingClientRect()));
      obs.observe(el);
      return () => obs.disconnect();
    }
  }, [targetId]);

  if (!rect) return null;

  const pad = 8;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed pointer-events-none z-[60]"
      style={{
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 12,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
        border: "2px solid rgba(59,130,246,0.8)",
      }}
    />
  );
}

function TourTooltip({
  step,
  stepIndex,
  total,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [pos, setPos] = useState({ top: "50%", left: "50%" });

  useEffect(() => {
    const el = document.getElementById(step.target);
    if (!el) { setPos({ top: "50%", left: "50%" }); return; }
    const r = el.getBoundingClientRect();
    const gap = 16;
    switch (step.position) {
      case "bottom": setPos({ top: `${r.bottom + gap}px`, left: `${r.left + r.width / 2}px` }); break;
      case "top":    setPos({ top: `${r.top - gap}px`, left: `${r.left + r.width / 2}px` }); break;
      case "right":  setPos({ top: `${r.top + r.height / 2}px`, left: `${r.right + gap}px` }); break;
      case "left":   setPos({ top: `${r.top + r.height / 2}px`, left: `${r.left - gap}px` }); break;
    }
  }, [step]);

  const isLast = stepIndex === total - 1;

  return (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed z-[61] w-72 bg-card border border-blue-500/30 rounded-2xl shadow-2xl p-5"
      style={{
        top: pos.top,
        left: pos.left,
        transform: step.position === "bottom" || step.position === "top"
          ? "translateX(-50%)"
          : "translateY(-50%)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-blue flex items-center justify-center">
            <Rocket className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="font-semibold text-sm text-foreground">{step.title}</p>
        </div>
        <button onClick={onSkip} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.content}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === stepIndex ? "bg-blue-500" : "bg-border"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 text-xs">
              <ChevronLeft className="w-3 h-3" /> Back
            </Button>
          )}
          <Button size="sm" onClick={isLast ? onSkip : onNext} className="h-7 gap-1 text-xs gradient-blue text-white border-0">
            {isLast ? "Done" : "Next"} {!isLast && <ChevronRight className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function OnboardingTour({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (active) setStep(0);
  }, [active]);

  if (!active) return null;
  const current = TOUR_STEPS[step];

  return (
    <>
      <Spotlight targetId={current.target} />
      <AnimatePresence mode="wait">
        <TourTooltip
          key={step}
          step={current}
          stepIndex={step}
          total={TOUR_STEPS.length}
          onNext={() => setStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1))}
          onBack={() => setStep((s) => Math.max(s - 1, 0))}
          onSkip={onComplete}
        />
      </AnimatePresence>
    </>
  );
}
