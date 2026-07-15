"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, Moon, Sun, Menu, HelpCircle, Keyboard, Cpu, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  "/qr-tracker":        "QR Tracker",
  "/transcribe":        "Transcribe",
  "/writing":           "Writing AI",
};

interface NavbarProps {
  onMenuClick: () => void;
  onToggleHelp: () => void;
  onToggleShortcuts: () => void;
  onOpenSearch: () => void;
}

export default function Navbar({ onMenuClick, onToggleHelp, onToggleShortcuts, onOpenSearch }: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pageTitle = PAGE_TITLES[pathname] ?? pathname.slice(1).replace(/-/g, " ");
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "Admin";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = profile?.role ? profile.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.replace("/");
  };

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
        className="hidden md:flex items-center shrink-0"
      >
        <h1 className="text-[16px] font-semibold text-white leading-none capitalize tracking-tight">
          {pageTitle}
        </h1>
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
        </motion.div>
      </div>

      {/* ── Right actions ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 ml-auto md:ml-0">

        {/* Search — opens the Command Palette (Ctrl/Cmd+K) */}
        <div className="relative hidden sm:block" id="search-bar">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <button
            type="button"
            onClick={onOpenSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="h-8 pl-8 pr-3 text-[12px] text-left text-white/40 rounded-lg outline-none transition-all"
            style={{
              width: searchFocused ? "200px" : "156px",
              background: searchFocused ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.04)",
              border: searchFocused ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(255,255,255,0.07)",
              boxShadow: searchFocused ? "0 0 0 2px rgba(0,212,255,0.08)" : "none",
              transition: "all 0.22s ease",
            }}
          >
            Search… (Ctrl+K)
          </button>
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

        {/* User avatar + menu */}
        <div className="relative ml-1 shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-pointer transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #00D4FF 0%, #1D4ED8 100%)",
              boxShadow: "0 0 14px rgba(0,212,255,0.3)",
            }}
            title={displayName}
          >
            {initials}
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: "rgba(4,11,25,0.98)", border: "1px solid rgba(0,212,255,0.15)", minWidth: "200px" }}
              >
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-sm text-white font-medium truncate">{displayName}</p>
                  <p className="text-xs text-white/40 truncate">{user?.email}</p>
                  {roleLabel && (
                    <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {roleLabel}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.header>
  );
}
