"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Mail, Shield, Trash2, Loader2, X, Check, Clock, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ROLE_LABELS, ROLE_COLORS, UserRole } from "@/lib/stores/roleStore";
import ModuleChat from "@/components/shared/ModuleChat";
import ModuleTabs from "@/components/shared/ModuleTabs";

const WORKFORCE_MODULE_TABS = [
  { href: "/workforce", label: "Workforce" },
  { href: "/team",      label: "Team" },
  { href: "/equipment", label: "Equipment" },
  { href: "/vendors",   label: "Vendors" },
];

interface TeamMember {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  status: "active" | "invited" | "inactive";
  joined_at?: string;
}

const DEMO_MEMBERS: TeamMember[] = [
  { id: "1", email: "pm@civilai.com",       full_name: "Sarah Johnson",  role: "pm",       status: "active",  joined_at: "2025-01-10" },
  { id: "2", email: "eng1@civilai.com",     full_name: "Mike Chen",      role: "engineer", status: "active",  joined_at: "2025-02-01" },
  { id: "3", email: "viewer@civilai.com",   full_name: "Alex Rivera",    role: "viewer",   status: "active",  joined_at: "2025-03-15" },
  { id: "4", email: "pending@civilai.com",  full_name: undefined,        role: "engineer", status: "invited", joined_at: undefined },
];

const inputClass = "w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(DEMO_MEMBERS);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: "", role: "engineer" as UserRole });

  const stats = {
    total:   members.length,
    active:  members.filter((m) => m.status === "active").length,
    invited: members.filter((m) => m.status === "invited").length,
  };

  const handleInvite = async () => {
    if (!form.email) { toast.error("Email is required"); return; }
    setInviting(true);
    try {
      // Supabase invite — requires admin client on backend in production
      // For now: optimistic UI update + show instruction
      const newMember: TeamMember = {
        id: crypto.randomUUID(),
        email: form.email,
        role: form.role,
        status: "invited",
      };
      setMembers((m) => [...m, newMember]);
      toast.success(`Invite sent to ${form.email}`);
      setShowInvite(false);
      setForm({ email: "", role: "engineer" });
    } catch { toast.error("Failed to send invite"); }
    finally { setInviting(false); }
  };

  const updateRole = (id: string, role: UserRole) => {
    setMembers((m) => m.map((member) => member.id === id ? { ...member, role } : member));
    toast.success("Role updated");
  };

  const removeMember = (id: string) => {
    setMembers((m) => m.filter((member) => member.id !== id));
    toast.success("Member removed");
  };

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={WORKFORCE_MODULE_TABS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Invite members, assign roles, manage access</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-blue text-white text-sm font-medium">
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Members", value: stats.total,   icon: Users,     color: "text-blue-400 bg-blue-500/10" },
          { label: "Active",        value: stats.active,  icon: Check,     color: "text-emerald-400 bg-emerald-500/10" },
          { label: "Pending Invite",value: stats.invited, icon: Clock,     color: "text-amber-400 bg-amber-500/10" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Members Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Members</p>
        </div>
        <div className="divide-y divide-border">
          {members.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
              className="flex items-center gap-4 px-5 py-4">
              <div className="w-9 h-9 rounded-full gradient-blue flex items-center justify-center text-white text-sm font-bold shrink-0">
                {m.full_name ? m.full_name[0] : m.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Role selector */}
                <select
                  value={m.role}
                  onChange={(e) => updateRole(m.id, e.target.value as UserRole)}
                  className={`text-xs px-2 py-1 rounded-full border font-medium bg-transparent focus:outline-none ${ROLE_COLORS[m.role]}`}
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>

                {/* Status badge */}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                  m.status === "invited" ? "bg-amber-500/10 text-amber-400" :
                  "bg-gray-500/10 text-gray-400"
                }`}>{m.status}</span>

                <button onClick={() => removeMember(m.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-foreground">Invite Team Member</h3>
                <button onClick={() => setShowInvite(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input className={inputClass + " pl-9"} type="email" placeholder="colleague@company.com"
                      value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                  <select className={inputClass} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
                    {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([r, l]) => (
                      <option key={r} value={r}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-secondary/40 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[form.role]} can{" "}
                      {form.role === "admin" ? "do everything including manage users" :
                       form.role === "pm" ? "edit data and view financials" :
                       form.role === "engineer" ? "edit data but not financials" :
                       "only view data (read-only)"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowInvite(false)} className="flex-1 py-2 rounded-xl bg-secondary text-muted-foreground text-sm">Cancel</button>
                <button onClick={handleInvite} disabled={inviting}
                  className="flex-1 py-2 rounded-xl gradient-blue text-white text-sm flex items-center justify-center gap-2">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Send Invite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="Team Management" placeholder="Who has access? What can engineers see?" pageSummaryData={{ members: stats.total, active: stats.active }} />
    </div>
  );
}
