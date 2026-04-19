"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Zap,
  LineChart,
  TrendingUp,
  Hammer,
  GitBranch,
  CloudSun,
  Globe,
  Boxes,
  Cpu,
  Settings,
  LayoutDashboard,
  DollarSign,
  Calendar,
  Users,
  FileText,
  Shield,
  FileSignature,
  ShoppingCart,
  ClipboardCheck,
  Wrench,
  BarChart3,
  Bot,
  Building2,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Star,
  CreditCard,
  PenTool
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/cost", icon: DollarSign, label: "Cost & Budget" },
  { href: "/scheduling", icon: Calendar, label: "Scheduling" },
  { href: "/workforce", icon: Users, label: "Workforce" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/safety", icon: Shield, label: "Safety" },
  { href: "/contracts", icon: FileSignature, label: "Contracts" },
  { href: "/procurement", icon: ShoppingCart, label: "Procurement" },
  { href: "/compliance", icon: ClipboardCheck, label: "Compliance" },
  { href: "/bim", icon: Boxes, label: "BIM & CAD" },
  { href: "/digital-twin", icon: Globe, label: "Digital Twin" },
  { href: "/construction", icon: Hammer, label: "Construction" },
  { href: "/equipment", icon: Wrench, label: "Equipment" },
  { href: "/green", icon: Leaf, label: "Green Monitor" },
  { href: "/vendors", icon: Star, label: "Vendor Scoring" },
  { href: "/evm", icon: LineChart, label: "EVM" },
  { href: "/payments", icon: CreditCard, label: "Payment Tracker" },
  { href: "/reports", icon: BarChart3, label: "Reports" },
  { href: "/analytics", icon: TrendingUp, label: "Analytics" },
  { href: "/predictive", icon: Zap, label: "Predictive AI" },
  { href: "/anomaly", icon: AlertTriangle, label: "Anomaly Detection" },
  { href: "/writing", icon: PenTool, label: "Writing Assistant" },
  { href: "/mlops", icon: Cpu, label: "MLOps" },
  { href: "/gnn", icon: GitBranch, label: "GNN Risk" },
  { href: "/weather", icon: CloudSun, label: "Weather" },
  { href: "/copilot", icon: Bot, label: "AI Copilot" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative flex flex-col h-screen bg-sidebar border-r border-sidebar-border overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white font-bold text-lg whitespace-nowrap"
          >
            CivilAI
          </motion.span>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 4 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm font-medium whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-white hover:bg-blue-600 transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-7 h-7 rounded-full gradient-blue flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">CA</span>
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-white text-xs font-medium">CivilAI Admin</p>
              <p className="text-sidebar-foreground/40 text-xs">
                admin@civilai.com
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}