"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ClipboardList, HardHat, Eye, Truck, Loader2 } from "lucide-react";
import { useAuth, type DemoRole } from "@/lib/auth";
import { toast } from "sonner";

const DEMO_ROLES: { role: DemoRole; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { role: "admin",               label: "Admin",                desc: "Full access to every module",              icon: ShieldCheck,   color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { role: "project_manager",     label: "Project Manager",       desc: "Projects, cost, schedule oversight",       icon: ClipboardList, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { role: "site_engineer",       label: "Site Engineer",         desc: "Field ops: safety, workforce, equipment",  icon: HardHat,       color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { role: "procurement_manager", label: "Procurement / Vendor",  desc: "Contracts, vendors, payments",             icon: Truck,         color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { role: "viewer",              label: "Viewer / Client",       desc: "Read-only across dashboards & reports",    icon: Eye,           color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
];

export default function DemoRoleCards({ onDone }: { onDone: () => void }) {
  const { demoLogin } = useAuth();
  const [signingInRole, setSigningInRole] = useState<DemoRole | null>(null);

  const handleClick = async (role: DemoRole) => {
    setSigningInRole(role);
    const { error } = await demoLogin(role);
    if (error) {
      toast.error(error.message);
      setSigningInRole(null);
      return;
    }
    onDone();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
      {DEMO_ROLES.map(({ role, label, desc, icon: Icon, color }) => (
        <motion.button
          key={role}
          whileHover={{ y: -2 }}
          disabled={signingInRole !== null}
          onClick={() => handleClick(role)}
          className={`glass-card flex items-start gap-3 p-4 text-left transition-all disabled:opacity-50 ${
            signingInRole && signingInRole !== role ? "" : "hover:border-cyan-500/40"
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${color}`}>
            {signingInRole === role ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
          </div>
          <div>
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </motion.button>
      ))}
    </div>
  );
}
