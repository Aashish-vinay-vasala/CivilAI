"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Loader2, ShieldCheck, ClipboardList, HardHat, Eye, Truck, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, type DemoRole } from "@/lib/auth";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

// Matches the primary/secondary button treatment used across the dashboard
// (e.g. the "New Project" and modal cancel buttons) instead of flat Tailwind fills.
const ctaPrimaryStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
  boxShadow: "0 0 20px rgba(0,212,255,0.15)",
};

const ctaSecondaryStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
};

const ROLE_OPTIONS: { role: DemoRole; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { role: "admin",               label: "Admin",                desc: "Full access to every module",              icon: ShieldCheck,   color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { role: "project_manager",     label: "Project Manager",      desc: "Projects, cost, schedule oversight",       icon: ClipboardList, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { role: "site_engineer",       label: "Site Engineer",        desc: "Field ops: safety, workforce, equipment",  icon: HardHat,       color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { role: "procurement_manager", label: "Procurement / Vendor", desc: "Contracts, vendors, payments",             icon: Truck,         color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { role: "viewer",              label: "Viewer / Client",      desc: "Read-only across dashboards & reports",    icon: Eye,           color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
];

export default function SignupPage() {
  const router = useRouter();
  const { user, loading: authLoading, signUpWithPassword, signUpWithGoogle } = useAuth();
  const [role, setRole] = useState<DemoRole | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const requireRole = () => {
    if (!role) {
      toast.error("Pick a role first");
      return false;
    }
    return true;
  };

  const handlePasswordSignup = async () => {
    if (!requireRole()) return;
    if (!email || !password || !fullName) {
      toast.error("Fill in your name, email, and password");
      return;
    }
    setSubmitting(true);
    const { error } = await signUpWithPassword(email, password, fullName, role as DemoRole);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/dashboard");
  };

  const handleGoogleSignup = async () => {
    if (!requireRole()) return;
    setSubmitting(true);
    const { error } = await signUpWithGoogle(role as DemoRole);
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
    }
    // On success the browser navigates away to Google — nothing more to do here.
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg glass-card p-8"
      >
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,100,160,0.12))",
              border: "1px solid rgba(0,212,255,0.28)",
              boxShadow: "0 0 20px rgba(0,212,255,0.2), inset 0 0 12px rgba(0,212,255,0.06)",
            }}
          >
            <Building2 className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="font-display text-lg tracking-wider text-white">
            CIVIL<span className="text-cyan-400">AI</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-1">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-6">
          You get your own private workspace — nothing here is shared with the demo data or other accounts.
        </p>

        <Label className="mb-2 block">1. Choose a role</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {ROLE_OPTIONS.map(({ role: r, label, desc, icon: Icon, color }) => {
            const selected = role === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`relative glass-card p-4 text-left transition-all ${
                  selected ? "border-cyan-500/50 bg-cyan-500/6" : "hover:border-white/20"
                }`}
              >
                {selected && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                    <Check className="w-3 h-3 text-cyan-400" />
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="font-semibold text-foreground text-sm pr-6">{label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{desc}</p>
              </button>
            );
          })}
        </div>

        <Label className="mb-2 block">2. Sign up</Label>
        <div className="space-y-3 mb-4">
          <Input placeholder="Full name" className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input type="email" placeholder="Email" className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full text-white transition-all hover:scale-[1.02]" style={ctaPrimaryStyle} onClick={handlePasswordSignup} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
          </Button>
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button className="w-full gap-2 text-white/70 hover:text-white transition-all hover:scale-[1.02]" style={ctaSecondaryStyle} onClick={handleGoogleSignup} disabled={submitting}>
          <GoogleIcon />
          Continue with Google
        </Button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Google sign-up requires a one-time code emailed to you before you get access.
        </p>

        <p className="text-sm text-muted-foreground mt-6 text-center">
          Just want to look around?{" "}
          <Link href="/" className="text-cyan-400 hover:underline">
            Try the demo instead
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
