"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, LayoutDashboard, DollarSign, Users,
  FileText, Boxes, BarChart3, Bot, Building2, ChevronLeft, ChevronRight,
  X, Calendar, HardHat, Shield, Brain, ClipboardList, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoleStore, ROLE_LABELS, ROLE_COLORS } from "@/lib/stores/roleStore";
import { useAuth } from "@/lib/auth";
import { usePinnedStore } from "@/lib/stores/pinnedStore";
import { Pin, PinOff } from "lucide-react";

interface NavItem { href: string; icon: React.ElementType; label: string }
interface NavGroup { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: "CORE",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "PROJECT",
    items: [
      { href: "/projects",     icon: FolderOpen, label: "Projects" },
      { href: "/cost",         icon: DollarSign, label: "Cost & Budget" },
      { href: "/scheduling",   icon: Calendar,   label: "Scheduling" },
      { href: "/construction", icon: HardHat,    label: "Construction" },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { href: "/workforce", icon: Users,  label: "Workforce" },
      { href: "/safety",    icon: Shield, label: "Safety" },
    ],
  },
  {
    label: "DOCS",
    items: [
      { href: "/documents", icon: FileText, label: "Documents" },
    ],
  },
  {
    label: "SITE",
    items: [
      { href: "/bim", icon: Boxes, label: "Site & BIM" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/copilot",    icon: Bot,          label: "AI Copilot" },
      { href: "/analytics",  icon: BarChart3,    label: "Analytics" },
      { href: "/predictive", icon: Brain,        label: "Predictive" },
      { href: "/reports",    icon: ClipboardList, label: "Reports" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

// Maps sub-tab routes back to their parent sidebar entry
const SUB_ROUTE_MAP: Record<string, string> = {
  "/digital-twin": "/bim",
  "/weather":      "/bim",
  "/green":        "/bim",
  "/procurement":  "/cost",
  "/financials":   "/cost",
  "/equipment":    "/workforce",
  "/vendors":      "/workforce",
  "/contracts":    "/documents",
  "/compliance":   "/documents",
  "/anomaly":      "/analytics",
  "/mlops":        "/analytics",
};

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

function NavItemRow({ item, pathname, collapsed, isPinned, onPin, onNavClick, hovered, onHover }: {
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
      <Link href={item.href} onClick={onNavClick}>
        <motion.div
          whileHover={{ x: 3 }}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer",
            isActive
              ? "bg-sidebar-accent text-white"
              : "text-sidebar-foreground/60 hover:text-white hover:bg-white/5"
          )}
        >
          <item.icon className="w-4.5 h-4.5 shrink-0" />
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[13px] font-medium whitespace-nowrap flex-1 leading-none"
            >
              {item.label}
            </motion.span>
          )}
          {isActive && !collapsed && (
            <motion.div
              layoutId="activeIndicator"
              className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"
            />
          )}
        </motion.div>
      </Link>

      {!collapsed && hovered && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-sidebar-foreground/30 hover:text-white hover:bg-white/10 transition-colors"
          title={isPinned ? "Unpin" : "Pin to top"}
        >
          {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

function SidebarContent({
  collapsed,
  setCollapsed,
  onNavClick,
  showCloseButton,
  onClose,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onNavClick?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { role } = useRoleStore();
  const { user } = useAuth();
  const { pinned, pin, unpin, isPinned } = usePinnedStore();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const pinnedItems = allNavItems.filter((i) => pinned.includes(i.href));

  const displayName = user?.user_metadata?.full_name ?? "CivilAI Admin";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const rowProps = (item: NavItem) => ({
    item,
    pathname,
    collapsed,
    isPinned: isPinned(item.href),
    onPin: () => isPinned(item.href) ? unpin(item.href) : pin(item.href),
    onNavClick,
    hovered: hoveredHref === item.href,
    onHover: setHoveredHref,
  });

  return (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center shrink-0" id="sidebar-nav">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white font-bold text-lg whitespace-nowrap flex-1"
          >
            CivilAI
          </motion.span>
        )}
        {showCloseButton && (
          <button onClick={onClose} className="text-sidebar-foreground/60 hover:text-white ml-auto p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">

        {/* Pinned section */}
        {pinnedItems.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 pt-1 pb-2 text-[11px] font-semibold text-sidebar-foreground/35 uppercase tracking-wider">
                Pinned
              </p>
            )}
            {pinnedItems.map((item) => (
              <NavItemRow key={item.href} {...rowProps(item)} />
            ))}
            <div className="my-3 border-t border-sidebar-border/40" />
          </>
        )}

        {/* Grouped nav */}
        {navGroups.map((group, gi) => {
          const groupItems = group.items.filter((i) => !pinned.includes(i.href));
          if (groupItems.length === 0) return null;
          return (
            <div key={group.label} className={gi > 0 ? "pt-2" : ""}>
              {!collapsed ? (
                <p className="px-3 pb-1.5 pt-1 text-[13px] font-semibold text-sidebar-foreground/60 select-none">
                  {group.label}
                </p>
              ) : (
                gi > 0 && <div className="my-2 border-t border-sidebar-border/30 mx-1" />
              )}
              <div className="space-y-0.5">
                {groupItems.map((item) => (
                  <NavItemRow key={item.href} {...rowProps(item)} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle — desktop only */}
      {!showCloseButton && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-white hover:bg-blue-600 transition-colors z-10 shadow-md"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      )}

      {/* User profile */}
      <div className="shrink-0 border-t border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0">
              <p className="text-white text-sm font-medium truncate leading-tight">{displayName}</p>
              <span className={`inline-flex mt-1 text-[10px] px-1.5 py-0.5 rounded font-semibold border ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </span>
            </motion.div>
          )}
        </div>
      </div>

    </div>
  );
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 68 : 248 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="relative hidden md:flex flex-col h-screen bg-sidebar border-r border-sidebar-border overflow-hidden shrink-0"
      >
        <SidebarContent collapsed={collapsed} setCollapsed={setCollapsed} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -270 }} animate={{ x: 0 }} exit={{ x: -270 }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border z-50 md:hidden flex flex-col"
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
