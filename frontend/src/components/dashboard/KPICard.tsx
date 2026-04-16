"use client";

import { motion } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
  color: "blue" | "green" | "orange" | "red";
  delay?: number;
}

const colorMap = {
  blue: "from-blue-600 to-blue-400",
  green: "from-emerald-600 to-emerald-400",
  orange: "from-orange-600 to-orange-400",
  red: "from-red-600 to-red-400",
};

const bgMap = {
  blue: "bg-blue-500/10 border-blue-500/20",
  green: "bg-emerald-500/10 border-emerald-500/20",
  orange: "bg-orange-500/10 border-orange-500/20",
  red: "bg-red-500/10 border-red-500/20",
};

export default function KPICard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color,
  delay = 0,
}: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "rounded-xl border p-5 cursor-pointer",
        bgMap[color]
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center",
            colorMap[color]
          )}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
            trend === "up"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          )}
        >
          {trend === "up" ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {change}
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{title}</p>
      </div>
    </motion.div>
  );
}