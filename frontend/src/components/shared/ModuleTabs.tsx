"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  href: string;
  label: string;
}

export default function ModuleTabs({ tabs }: { tabs: ModuleTab[] }) {
  const pathname = usePathname();
  return (
    <div
      className="flex gap-0.5 mb-6 p-1 rounded-xl w-fit overflow-x-auto scrollbar-none"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors"
            )}
            style={active
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
