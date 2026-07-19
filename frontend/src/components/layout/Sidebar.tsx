"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, LayoutDashboard, DollarSign, Users,
  FileText, Boxes, BarChart3, Bot, Building2,
  ChevronLeft, ChevronRight, X, Calendar, HardHat,
  Shield, ClipboardList, FolderOpen, Pin, PinOff,
  Zap, HeadphonesIcon, Mic, Wand2, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoleStore, ROLE_LABELS } from "@/lib/stores/roleStore";
import { useAuth } from "@/lib/auth";
import { usePinnedStore } from "@/lib/stores/pinnedStore";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
  /** module key in backend/app/core/guardrails.ROLE_PERMISSIONS; item is
   * hidden unless the caller has "read" access to it. */
  requiresModule?: string;
}
interface NavGroup { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard",    icon: LayoutDashboard, label: "Dashboard" },
      { href: "/projects",     icon: FolderOpen,      label: "Projects" },
      { href: "/cost",         icon: DollarSign,      label: "Cost & Budget" },
      { href: "/scheduling",   icon: Calendar,        label: "Scheduling" },
      { href: "/construction", icon: HardHat,         label: "Construction" },
      { href: "/workforce",    icon: Users,           label: "Workforce" },
      { href: "/safety",       icon: Shield,          label: "Safety" },
      { href: "/documents",    icon: FileText,        label: "Documents" },
      { href: "/bim",          icon: Boxes,           label: "Site & BIM" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/copilot",  icon: Bot,            label: "AI Copilot" },
      { href: "/agent",    icon: Wand2,          label: "AI Agent" },
      { href: "/voice",    icon: Mic,            label: "Voice Bot" },
      { href: "/analytics",  icon: BarChart3,     label: "Analytics" },
      { href: "/reports",    icon: ClipboardList, label: "Reports" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/review",   icon: ShieldCheck,    label: "Review Queue", requiresModule: "review" },
      { href: "/support",  icon: HeadphonesIcon, label: "Support" },
      { href: "/settings", icon: Settings,        label: "Settings" },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

const SUB_ROUTE_MAP: Record<string, string> = {
  "/digital-twin":      "/bim",
  "/weather":           "/bim",
  "/green":             "/bim",
  "/procurement":       "/cost",
  "/financials":        "/cost",
  "/payments":          "/cost",
  "/evm":               "/cost",
  "/equipment":         "/workforce",
  "/vendors":           "/workforce",
  "/contracts":         "/documents",
  "/compliance":        "/documents",
  "/transcribe":        "/documents",
  "/writing":           "/documents",
  "/accounting":        "/documents",
  "/voice":             "/voice",
  "/agent":             "/agent",
  "/anomaly":           "/analytics",
  "/mlops":             "/analytics",
  "/gnn":               "/analytics",
  "/predictive":        "/analytics",
  "/daily-reports":     "/construction",
  "/rfis":              "/construction",
  "/meetings":          "/construction",
  "/qr-tracker":        "/construction",
  "/pre-construction":  "/projects",
  "/scenario":          "/projects",
  "/resource-leveling": "/scheduling",
  "/scheduled-reports": "/reports",
};

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

function NavItemRow({
  item, pathname, collapsed, isPinned, onPin, onNavClick, hovered, onHover,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  isPinned: boolean;
  onPin: () => void;
  onNavClick?: () => void;
  hovered: boolean;
  onHover: (href: string | null) => void;
}) {
  const effectivePathname = SUB_ROUTE_MAP[pathname] ?? pathname;
  const isActive = effectivePathname === item.href;

  return (
    <div
      className="relative group"
      onMouseEnter={() => onHover(item.href)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Glowing left active bar */}
      {isActive && (
        <motion.div
          layoutId="active-bar"
          className="nav-active-bar"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}

      <Link href={item.href} onClick={onNavClick}>
        <motion.div
          whileHover={{ x: collapsed ? 0 : 3 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "relative flex items-center gap-3 mx-1 px-3 py-2.5 rounded-xl cursor-pointer transition-colors",
            isActive
              ? "bg-cyan-500/[0.09] text-white"
              : "text-white/35 hover:text-white/75 hover:bg-white/[0.035]"
          )}
        >
          {/* Icon */}
          <item.icon
            className={cn(
              "shrink-0 transition-colors",
              collapsed ? "w-5 h-5" : "w-4 h-4",
              isActive ? "text-cyan-400" : ""
            )}
          />

          {/* Label + badge */}
          {!collapsed && (
            <AnimatePresence initial={false}>
              <motion.div
                key="label"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <span className="text-[13px] font-medium whitespace-nowrap flex-1 leading-none">
                  {item.label}
                </span>

                {item.badge && (
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md font-display text-[9px] font-bold"
                    style={{
                      background: "rgba(0,212,255,0.1)",
                      border: "1px solid rgba(0,212,255,0.22)",
                      color: "#00D4FF",
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    {item.badge}
                  </span>
                )}

                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: "#10B981",
                      boxShadow: "0 0 6px rgba(16,185,129,0.8)",
                      animation: "dot-ping 2s ease-in-out infinite",
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </Link>

      {/* Collapsed tooltip */}
      {collapsed && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-white whitespace-nowrap pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            background: "rgba(4,11,25,0.95)",
            border: "1px solid rgba(0,212,255,0.15)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}>
          {item.label}
        </div>
      )}

      {/* Pin button */}
      {!collapsed && hovered && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          title={isPinned ? "Unpin" : "Pin"}
        >
          {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

function SidebarContent({
  collapsed, setCollapsed, onNavClick, showCloseButton, onClose,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onNavClick?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { role, can } = useRoleStore();
  const { user } = useAuth();
  const { pinned, pin, unpin, isPinned } = usePinnedStore();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const visible = (i: NavItem) => !i.requiresModule || can(i.requiresModule, "read");
  const pinnedItems = allNavItems.filter((i) => pinned.includes(i.href) && visible(i));
  const displayName = user?.user_metadata?.full_name ?? "CivilAI Admin";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const rowProps = (item: NavItem) => ({
    item, pathname, collapsed,
    isPinned: isPinned(item.href),
    onPin: () => isPinned(item.href) ? unpin(item.href) : pin(item.href),
    onNavClick,
    hovered: hoveredHref === item.href,
    onHover: setHoveredHref,
  });

  return (
    <div className="flex flex-col h-full relative z-10">

      {/* ── Logo ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-5 shrink-0 border-b border-white/[0.05]" id="sidebar-nav">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 relative"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,100,160,0.12))",
            border: "1px solid rgba(0,212,255,0.28)",
            boxShadow: "0 0 20px rgba(0,212,255,0.2), inset 0 0 12px rgba(0,212,255,0.06)",
          }}
        >
          <Building2 className="w-4.5 h-4.5 text-cyan-400" />
        </div>

        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0"
          >
            <div className="font-display text-2xl leading-[36px] tracking-wider text-white">
              CIVIL<span className="text-cyan-400 text-glow-cyan">AI</span>
            </div>
          </motion.div>
        )}

        {showCloseButton && (
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/70 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin">

        {/* Pinned */}
        {pinnedItems.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 pb-2 pt-1 text-[10px] font-semibold text-white/25 uppercase tracking-[0.15em]">
                Pinned
              </p>
            )}
            {pinnedItems.map((item) => <NavItemRow key={item.href} {...rowProps(item)} />)}
            <div className="my-2 mx-2 border-t border-white/[0.06]" />
          </>
        )}

        {/* Groups */}
        {navGroups.map((group, gi) => {
          const items = group.items.filter((i) => !pinned.includes(i.href) && visible(i));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className={gi > 0 ? "pt-3" : ""}>
              {!collapsed ? (
                <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-bold text-white/22 uppercase tracking-[0.18em] select-none">
                  {group.label}
                </p>
              ) : (
                gi > 0 && <div className="my-2 mx-2 border-t border-white/[0.05]" />
              )}
              <div className="space-y-0.5">
                {items.map((item) => <NavItemRow key={item.href} {...rowProps(item)} />)}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────────────── */}
      {!showCloseButton && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3.5 top-[72px] w-7 h-7 rounded-full flex items-center justify-center z-20 transition-all"
          style={{
            background: "rgba(4,11,25,0.9)",
            border: "1px solid rgba(0,212,255,0.2)",
            boxShadow: "0 0 12px rgba(0,212,255,0.15)",
            color: "rgba(0,212,255,0.7)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 18px rgba(0,212,255,0.4)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.45)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px rgba(0,212,255,0.15)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,212,255,0.2)";
          }}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      )}

      {/* ── User profile ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.05] p-3">
        <div
          className="rounded-xl p-2.5 flex items-center gap-2.5"
          style={{
            background: "rgba(0,212,255,0.04)",
            border: "1px solid rgba(0,212,255,0.08)",
          }}
        >
          {/* Avatar with online ring */}
          <div className="relative shrink-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg, #00D4FF, #1D4ED8)" }}
            >
              {initials}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
              style={{
                background: "#10B981",
                borderColor: "hsl(var(--sidebar))",
                boxShadow: "0 0 6px rgba(16,185,129,0.8)",
              }}
            />
          </div>

          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="min-w-0 flex-1"
            >
              <p className="text-white text-[12px] font-semibold truncate leading-tight">{displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Zap className="w-2.5 h-2.5 text-cyan-500 shrink-0" />
                <p className="text-white/35 text-[10px] truncate">{ROLE_LABELS[role]}</p>
              </div>
            </motion.div>
          )}

          {!collapsed && (
            <Link href="/settings" className="shrink-0 text-white/20 hover:text-white/55 transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative hidden md:flex flex-col h-screen shrink-0 overflow-hidden z-20"
        style={{
          background: "rgba(2, 7, 18, 0.92)",
          borderRight: "1px solid rgba(0,212,255,0.08)",
          backdropFilter: "blur(32px)",
        }}
      >
        <SidebarContent collapsed={collapsed} setCollapsed={setCollapsed} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", damping: 26, stiffness: 210 }}
              className="fixed left-0 top-0 h-screen w-64 z-50 md:hidden flex flex-col"
              style={{
                background: "rgba(2, 7, 18, 0.96)",
                borderRight: "1px solid rgba(0,212,255,0.1)",
              }}
            >
              <SidebarContent
                collapsed={false}
                setCollapsed={setCollapsed}
                onNavClick={() => setMobileOpen(false)}
                showCloseButton
                onClose={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
