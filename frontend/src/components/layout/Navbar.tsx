"use client";

import { motion } from "framer-motion";
import { Search, Moon, Sun, Menu, HelpCircle, Keyboard, Cpu } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import NotificationCenter from "@/components/notifications/NotificationCenter";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":         "Dashboard",
  "/projects":          "Projects",
  "/cost":              "Cost & Budget",
  "/scheduling":        "Scheduling",
  "/construction":      "Construction",
  "/workforce":         "Workforce",
  "/safety":            "Safety",
  "/documents":         "Documents",
  "/bim":               "Site & BIM",
  "/copilot":           "AI Copilot",
  "/analytics":         "Analytics",
  "/predictive":        "Predictive AI",
  "/reports":           "Reports",
  "/settings":          "Settings",
  "/equipment":         "Equipment",
  "/vendors":           "Vendors",
  "/contracts":         "Contracts",
  "/compliance":        "Compliance",
  "/anomaly":           "Anomaly Detection",
  "/mlops":             "ML Operations",
  "/digital-twin":      "Digital Twin",
  "/weather":           "Weather Intelligence",
  "/green":             "Green Initiative",
  "/procurement":       "Procurement",
  "/financials":        "Financials",
  "/payments":          "Payments",
  "/evm":               "Earned Value",
  "/gnn":               "GNN Analysis",
  "/daily-reports":     "Daily Reports",
  "/rfis":              "RFIs",
  "/meetings":          "Meetings",
  "/pre-construction":  "Pre-Construction",
  "/scenario":          "Scenario Planning",
  "/resource-leveling": "Resource Leveling",
  "/scheduled-reports": "Scheduled Reports",
  "/team":              "Team",
  "/qr-tracker":        "QR Tracker",
  "/transcribe":        "Transcribe",
  "/writing":           "Writing AI",
};

interface NavbarProps {
  onMenuClick: () => void;
  onToggleHelp: () => void;
  onToggleShortcuts: () => void;
}

export default function Navbar({ onMenuClick, onToggleHelp, onToggleShortcuts }: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  const pageTitle = PAGE_TITLES[pathname] ?? pathname.slice(1).replace(/-/g, " ");
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "Admin";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-[60px] flex items-center px-5 gap-4 sticky top-0 z-30 shrink-0"
      style={{
        background: "rgba(2, 7, 18, 0.82)",
        borderBottom: "1px solid rgba(0,212,255,0.07)",
        backdropFilter: "blur(28px)",
      }}
    >
      {/* Mobile menu */}
      <Button
        variant="ghost" size="icon"
        className="md:hidden shrink-0 h-8 w-8 text-white/40 hover:text-white hover:bg-white/[0.05]"
        onClick={onMenuClick}
      >
        <Menu className="w-4.5 h-4.5" />
      </Button>

      {/* Page title */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="hidden md:flex flex-col justify-center shrink-0"
      >
        <h1 className="text-[14px] font-semibold text-white leading-none capitalize tracking-tight">
          {pageTitle}
        </h1>
        <p className="text-[10px] text-white/22 mt-0.5 font-mono tracking-wider">
          civilai.platform
        </p>
      </motion.div>

      {/* ── AI Status Pill — center ─────────────────────────────────────── */}
      <div className="flex-1 flex justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="hidden md:flex items-center gap-2.5 px-4 py-1.5 rounded-full cursor-default select-none"
          style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.18)",
          }}
        >
          {/* Pulsing dot */}
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{
                background: "#10B981",
                animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>

          <Cpu className="w-3 h-3 text-emerald-400/70" />

          <span className="font-display text-[10px] text-emerald-400 tracking-[0.15em]">
            AI Systems Online
          </span>

          <span className="w-px h-3 bg-white/10" />

          <span className="text-[10px] text-white/28 font-mono">
            7 models active
          </span>
        </motion.div>
      </div>

      {/* ── Right actions ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 ml-auto md:ml-0">

        {/* Search */}
        <div className="relative hidden sm:block" id="search-bar">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <input
            type="text"
            placeholder="Search… (Ctrl+K)"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-8 pl-8 pr-3 text-[12px] text-white placeholder:text-white/22 rounded-lg outline-none transition-all"
            style={{
              width: searchFocused ? "200px" : "156px",
              background: searchFocused ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.04)",
              border: searchFocused ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
              boxShadow: searchFocused ? "0 0 0 2px rgba(0,212,255,0.08)" : "none",
              transition: "all 0.22s ease",
            }}
          />
        </div>

        {/* Keyboard shortcuts */}
        <Button
          variant="ghost" size="icon"
          className="hidden sm:flex h-8 w-8 text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
          onClick={onToggleShortcuts}
          id="shortcuts-btn"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </Button>

        {/* Help */}
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
          onClick={onToggleHelp}
          id="help-btn"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </Button>

        {/* Notifications */}
        <NotificationCenter />

        {/* Theme toggle */}
        {mounted && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            id="theme-toggle"
          >
            {theme === "dark"
              ? <Sun className="w-3.5 h-3.5" />
              : <Moon className="w-3.5 h-3.5" />}
          </Button>
        )}

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-pointer ml-1 shrink-0 transition-all hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)",
            boxShadow: "0 0 14px rgba(0,212,255,0.3)",
          }}
          title={displayName}
        >
          {initials}
        </div>
      </div>
    </motion.header>
  );
}
