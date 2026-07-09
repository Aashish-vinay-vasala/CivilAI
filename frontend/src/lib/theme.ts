// Shared "glass HUD" visual tokens — mirrors the dashboard's local ACCENT/input
// styling so cost, EVM, payments, scenario, financials and procurement pages
// stay visually consistent with the main dashboard.

export type AccentKey = "cyan" | "amber" | "red" | "green" | "blue" | "orange" | "purple";

export const ACCENT: Record<AccentKey, { bg: string; border: string; text: string; shadow: string }> = {
  cyan:   { bg: "rgba(0,212,255,0.07)",   border: "rgba(0,212,255,0.18)",   text: "#00D4FF", shadow: "rgba(0,212,255,0.15)" },
  amber:  { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)",  text: "#F59E0B", shadow: "rgba(245,158,11,0.15)" },
  red:    { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",   text: "#EF4444", shadow: "rgba(239,68,68,0.15)" },
  green:  { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.18)",  text: "#10B981", shadow: "rgba(16,185,129,0.15)" },
  blue:   { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)",  text: "#3B82F6", shadow: "rgba(59,130,246,0.15)" },
  orange: { bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)",  text: "#F97316", shadow: "rgba(249,115,22,0.15)" },
  purple: { bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.18)",  text: "#8B5CF6", shadow: "rgba(139,92,246,0.15)" },
};

// Glass form-input styling shared across modals/panels
export const glassInputClass = [
  "w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-white/30",
  "outline-none transition-all",
  "border focus:border-cyan-500/50 focus:shadow-[0_0_0_2px_rgba(0,212,255,0.08)]",
].join(" ");

export const glassInputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

// Primary gradient CTA button (e.g. "New Project", "Upload Report")
export const gradientButtonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,100,160,0.15))",
  border: "1px solid rgba(0,212,255,0.3)",
  boxShadow: "0 0 20px rgba(0,212,255,0.12)",
};

// Secondary / outline glass button
export const glassButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
};

export function pillStyle(active: boolean, accent: AccentKey = "cyan") {
  const a = ACCENT[accent];
  return active
    ? { background: a.bg.replace("0.07", "0.15"), border: `1px solid ${a.border.replace("0.18", "0.3")}`, color: a.text }
    : { background: "transparent", border: "1px solid transparent", color: "rgba(255,255,255,0.35)" };
}
