"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Bell,
  Shield,
  Palette,
  Database,
  Key,
  Save,
  Loader2,
  CheckCircle,
  Users,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import ActivityLog from "@/components/activity/ActivityLog";
import { useRoleStore, ROLE_LABELS, ROLE_COLORS, UserRole, ROLE_PERMISSIONS } from "@/lib/stores/roleStore";
import { useActivityStore } from "@/lib/stores/activityStore";
import dynamic from "next/dynamic";

const ScheduledReportsPage = dynamic(() => import("../scheduled-reports/page"), { ssr: false });

const tabs = [
  { id: "profile",          label: "Profile",            icon: User },
  { id: "roles",            label: "Roles",              icon: Users },
  { id: "notifications",    label: "Notifications",      icon: Bell },
  { id: "scheduled-reports",label: "Scheduled Reports",  icon: Bell },
  { id: "activity",         label: "Activity Log",       icon: Activity },
  { id: "security",         label: "Security",           icon: Shield },
  { id: "appearance",       label: "Appearance",         icon: Palette },
  { id: "integrations",     label: "Integrations",       icon: Database },
  { id: "api",              label: "API Keys",           icon: Key },
];

const integrations = [
  { name: "Supabase", desc: "Database & Auth", connected: true, color: "bg-emerald-500/10 text-emerald-400" },
  { name: "Groq API", desc: "Primary LLM", connected: true, color: "bg-blue-500/10 text-blue-400" },
  { name: "Gemini API", desc: "Vision & Backup LLM", connected: true, color: "bg-cyan-500/10 text-cyan-400" },
  { name: "HuggingFace", desc: "Embeddings", connected: true, color: "bg-orange-500/10 text-orange-400" },
  { name: "Procore", desc: "Project Management", connected: false, color: "bg-gray-500/10 text-gray-400" },
  { name: "QuickBooks", desc: "Accounting", connected: false, color: "bg-gray-500/10 text-gray-400" },
];

const ALL_ROLES: UserRole[] = ["admin", "pm", "engineer", "viewer"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const { role, setRole } = useRoleStore();
  const logActivity = useActivityStore((s) => s.log);
  const [profile, setProfile] = useState({
    name: "CivilAI Admin",
    email: "admin@civilai.com",
    role: "Project Manager",
    company: "CivilAI Construction",
    phone: "+1 (555) 000-0000",
  });
  const [notifToggles, setNotifToggles] = useState([true, false, true, false, true, false]);

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Settings saved!");
      logActivity("Saved settings", "Settings", activeTab);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account & preferences</p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Sidebar Tabs */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="w-full sm:w-48 shrink-0">
          <div className="bg-card border border-border rounded-2xl p-2 flex sm:flex-col flex-row flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-1 min-w-0">

          {/* Profile */}
          {activeTab === "profile" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-foreground">Profile Settings</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl gradient-blue flex items-center justify-center text-white text-xl font-bold shrink-0">
                  CA
                </div>
                <div>
                  <p className="font-medium text-foreground">{profile.name}</p>
                  <p className="text-sm text-muted-foreground">{profile.role}</p>
                  <span className={`inline-flex items-center mt-1 text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Full Name", key: "name" },
                  { label: "Email", key: "email" },
                  { label: "Role", key: "role" },
                  { label: "Company", key: "company" },
                  { label: "Phone", key: "phone" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{field.label}</label>
                    <input
                      value={profile[field.key as keyof typeof profile]}
                      onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                      className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
              <Button onClick={handleSave} disabled={saving} className="gradient-blue text-white border-0">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          )}

          {/* Roles */}
          {activeTab === "roles" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <div>
                <h2 className="font-semibold text-foreground">User Role</h2>
                <p className="text-sm text-muted-foreground mt-1">Select your role to configure permissions</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRole(r); toast.success(`Role changed to ${ROLE_LABELS[r]}`); }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      role === r
                        ? "border-blue-500 bg-blue-500/5"
                        : "border-border hover:border-border/80 hover:bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[r]}`}>
                        {ROLE_LABELS[r]}
                      </span>
                      {role === r && <CheckCircle className="w-4 h-4 text-blue-400" />}
                    </div>
                    <div className="mt-2 space-y-1">
                      {Object.entries(ROLE_PERMISSIONS[r]).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${v ? "bg-emerald-400" : "bg-gray-600"}`} />
                          <span className="text-xs text-muted-foreground capitalize">
                            {k.replace(/([A-Z])/g, " $1").replace("can ", "")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === "notifications" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-foreground">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  { label: "Cost overrun alerts", desc: "Get notified when budget exceeds threshold" },
                  { label: "Schedule delay warnings", desc: "Alerts for predicted delays" },
                  { label: "Safety incidents", desc: "Immediate notification for safety events" },
                  { label: "Document processed", desc: "When OCR processing completes" },
                  { label: "Weekly reports", desc: "Auto-generated weekly summary" },
                  { label: "AI insights", desc: "New AI recommendations available" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-secondary/40 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifToggles((t) => t.map((v, j) => j === i ? !v : v))}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        notifToggles[i] ? "bg-blue-500" : "bg-secondary border border-border"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        notifToggles[i] ? "translate-x-5" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          {activeTab === "scheduled-reports" && <ScheduledReportsPage />}
          {activeTab === "activity" && <ActivityLog />}

          {/* Security */}
          {activeTab === "security" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-foreground">Security Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Current Password</label>
                  <input type="password" placeholder="••••••••" className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">New Password</label>
                  <input type="password" placeholder="••••••••" className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Confirm Password</label>
                  <input type="password" placeholder="••••••••" className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <Button onClick={handleSave} disabled={saving} className="gradient-blue text-white border-0">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                  Update Password
                </Button>
              </div>
              <div className="border-t border-border pt-4">
                <h3 className="font-medium text-foreground mb-3">Two-Factor Authentication</h3>
                <div className="flex items-center justify-between p-4 bg-secondary/40 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-foreground">Enable 2FA</p>
                    <p className="text-xs text-muted-foreground">Add extra security to your account</p>
                  </div>
                  <Button variant="outline" size="sm">Enable</Button>
                </div>
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeTab === "appearance" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-foreground">Appearance</h2>
              <div>
                <p className="text-sm text-muted-foreground mb-3">Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {["dark", "light", "system"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`p-4 rounded-xl border text-sm font-medium capitalize transition-colors ${
                        theme === t
                          ? "border-blue-500 bg-blue-500/10 text-blue-400"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "dark" ? "🌙" : t === "light" ? "☀️" : "💻"} {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-3">Accent Color</p>
                <div className="flex gap-3">
                  {["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"].map((color) => (
                    <button
                      key={color}
                      className="w-8 h-8 rounded-full border-2 border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Integrations */}
          {activeTab === "integrations" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Integrations</h2>
              <div className="space-y-3">
                {integrations.map((integration, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-secondary/40 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl ${integration.color} flex items-center justify-center text-xs font-bold`}>
                        {integration.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">{integration.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.connected ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400">Connected</span>
                        </>
                      ) : (
                        <Button variant="outline" size="sm">Connect</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Keys */}
          {activeTab === "api" && (
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="font-semibold text-foreground">API Keys</h2>
              <div className="space-y-3">
                {[
                  { name: "Groq API Key", value: "gsk_••••••••••••••••••••" },
                  { name: "Gemini API Key", value: "AIza••••••••••••••••••" },
                  { name: "Supabase URL", value: "https://••••.supabase.co" },
                  { name: "HuggingFace Token", value: "hf_••••••••••••••••••" },
                ].map((key, i) => (
                  <div key={i} className="p-4 bg-secondary/40 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-2">{key.name}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm text-foreground font-mono bg-secondary px-3 py-2 rounded-lg truncate">
                        {key.value}
                      </code>
                      <Button variant="outline" size="sm">Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <ModuleChat
        context="Settings"
        placeholder="Ask about settings, integrations, API..."
        pageSummaryData={{ activeTab, integrations: integrations.filter(i => i.connected).map(i => i.name) }}
      />
    </div>
  );
}
