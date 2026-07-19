"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Shield,
  Users,
  FileText,
  Bot,
  ArrowRight,
  DollarSign,
  Calendar,
  Boxes,
  Truck,
  FileCheck,
  Activity,
  Mic,
  Leaf,
  ShieldCheck,
  ClipboardList,
  HardHat,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import DemoRoleCards from "@/components/auth/DemoRoleCards";
import CountUp from "@/components/shared/CountUp";

const features = [
  { icon: DollarSign, title: "Cost Intelligence", desc: "AI predicts overruns before they happen", color: "text-blue-400 bg-blue-500/10" },
  { icon: Calendar, title: "Delay Prediction", desc: "Smart scheduling with ML models", color: "text-orange-400 bg-orange-500/10" },
  { icon: Shield, title: "Safety Monitor", desc: "Real-time risk scoring & OSHA reporting", color: "text-red-400 bg-red-500/10" },
  { icon: FileText, title: "Document AI", desc: "OCR + VLM for any document format", color: "text-amber-400 bg-amber-500/10" },
  { icon: Users, title: "Workforce Engine", desc: "Skills matching & turnover prediction", color: "text-emerald-400 bg-emerald-500/10" },
  { icon: Bot, title: "AI Copilot", desc: "Chat with your project data live", color: "text-cyan-400 bg-cyan-500/10" },
  { icon: Boxes, title: "Site & BIM", desc: "Interactive 3D models with a live site digital twin", color: "text-purple-400 bg-purple-500/10" },
  { icon: Truck, title: "Procurement & Vendors", desc: "Purchase orders, vendor tracking, and price analysis", color: "text-teal-400 bg-teal-500/10" },
  { icon: FileCheck, title: "Contracts & Compliance", desc: "AI-reviewed contracts and OSHA/regulatory compliance tracking", color: "text-indigo-400 bg-indigo-500/10" },
  { icon: Activity, title: "Predictive Analytics", desc: "Anomaly detection & GNN-based risk forecasting", color: "text-pink-400 bg-pink-500/10" },
  { icon: Mic, title: "Voice & AI Agent", desc: "Hands-free voice assistant and autonomous AI agent for site tasks", color: "text-sky-400 bg-sky-500/10" },
  { icon: Leaf, title: "Green & Sustainability", desc: "ESG tracking and green building metrics", color: "text-lime-400 bg-lime-500/10" },
];

const stats = [
  { to: 40, prefix: "", suffix: "+", label: "AI Modules" },
  { to: 86, prefix: "", suffix: "%+", label: "ML Accuracy" },
  { to: 6, prefix: "", suffix: "", label: "ML Models" },
  { to: 0, prefix: "$", suffix: "", label: "To Start" },
];

const howItWorks = [
  { icon: Users, title: "Pick a role", desc: "Jump into the demo as an Admin, PM, Site Engineer, or any role — no signup needed", color: "text-cyan-400 bg-cyan-500/10" },
  { icon: Bot, title: "Let AI do the work", desc: "Cost forecasts, delay predictions, and safety scores generate automatically from your project data", color: "text-blue-400 bg-blue-500/10" },
  { icon: Building2, title: "Create your workspace", desc: "Ready for the real thing? Sign up for your own private workspace in seconds", color: "text-emerald-400 bg-emerald-500/10" },
];

const previewStats = [
  { icon: DollarSign, label: "Total Budget", value: "$12.4M", accent: "#00D4FF" },
  { icon: Calendar, label: "Schedule Progress", value: "78%", accent: "#F59E0B" },
  { icon: Users, label: "Active Workers", value: "214", accent: "#10B981" },
  { icon: Shield, label: "Safety Score", value: "92/100", accent: "#EF4444" },
];

const rolesStrip = [
  { icon: ShieldCheck, label: "Admin", desc: "Full control across every module", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { icon: ClipboardList, label: "Project Manager", desc: "Cost, schedule & team oversight", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { icon: HardHat, label: "Site Engineer", desc: "Safety, workforce & equipment in the field", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { icon: Truck, label: "Procurement", desc: "Vendors, contracts & purchase orders", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { icon: Eye, label: "Viewer / Client", desc: "Read-only visibility into progress", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
];

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

export default function LandingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [showDemoPicker, setShowDemoPicker] = useState(false);

  // Already signed in — skip straight to the dashboard.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToDashboard = () => router.push("/dashboard");

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient glow — a single continuous atmosphere behind every section so
          the page reads as one rich surface instead of flat alternating blocks. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[5%] left-1/2 w-225 h-225 rounded-full animate-glow-drift-a"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.07), transparent 70%)" }} />
        <div className="absolute top-[45%] left-[10%] w-175 h-175 rounded-full animate-glow-drift-b"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%)" }} />
        <div className="absolute top-[80%] right-[10%] w-175 h-175 rounded-full animate-glow-drift-c"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.06), transparent 70%)" }} />
      </div>

      <div className="relative z-10">
      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
        style={{
          background: "rgba(2, 7, 18, 0.82)",
          borderBottom: "1px solid rgba(0,212,255,0.07)",
          backdropFilter: "blur(28px)",
        }}
      >
        <div className="flex items-center gap-2.5">
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
        <div className="flex items-center gap-3">
          <Link href="/signup">
            <Button className="text-white/70 hover:text-white transition-all hover:scale-105" style={ctaSecondaryStyle}>
              Create Account
            </Button>
          </Link>
          <Button className="text-white transition-all hover:scale-105" style={ctaPrimaryStyle} onClick={() => setShowDemoPicker(true)}>
            Demo
          </Button>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-8 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-base mb-8">
            <Bot className="w-5 h-5" />
            AI-Powered Construction Management
          </span>

          <div
            className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl flex items-center justify-center mx-auto mb-8"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,100,160,0.12))",
              border: "1px solid rgba(0,212,255,0.28)",
              boxShadow: "0 0 48px rgba(0,212,255,0.22), inset 0 0 28px rgba(0,212,255,0.06)",
            }}
          >
            <Building2 className="w-14 h-14 lg:w-18 lg:h-18 text-cyan-400" />
          </div>

          <h1 className="font-display text-7xl lg:text-9xl tracking-wider text-white mb-8">
            CIVIL<span className="text-cyan-400">AI</span>
          </h1>
          <p className="text-2xl text-muted-foreground max-w-2xl mx-auto mb-12">
            Construction management platform powered by AI
          </p>

          <AnimatePresence mode="wait">
            {showDemoPicker ? (
              <motion.div
                key="picker"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p className="text-base text-muted-foreground mb-4">Pick a role to explore the demo</p>
                <DemoRoleCards onDone={goToDashboard} />
              </motion.div>
            ) : (
              <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-4 justify-center">
                <Button size="lg" className="text-white text-base transition-all hover:scale-105 px-10 py-6" style={ctaPrimaryStyle} onClick={() => setShowDemoPicker(true)}>
                  Try the Demo
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Link href="/signup">
                  <Button size="lg" className="text-white/70 hover:text-white text-base transition-all hover:scale-105 px-10 py-6" style={ctaSecondaryStyle}>
                    Create Account
                  </Button>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-sm text-muted-foreground mt-5">No credentials needed for the demo — just pick a role</p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-4 gap-10 max-w-3xl mx-auto mt-20"
        >
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <CountUp
                to={stat.to}
                prefix={stat.prefix}
                suffix={stat.suffix}
                decimals={0}
                duration={1.6}
                className="text-4xl lg:text-5xl font-bold text-foreground block"
              />
              <p className="text-base text-muted-foreground mt-2">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-8 border-t border-white/5">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">Everything you need</h2>
          <p className="text-muted-foreground">40+ AI modules covering every aspect of construction management</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="glass-card p-6"
            >
              <div className={`w-10 h-10 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                <feature.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 px-8 border-t border-white/5">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">How it works</h2>
          <p className="text-muted-foreground">From first click to full oversight in three steps</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {howItWorks.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-6 text-center relative"
            >
              <span className="absolute top-4 right-4 font-display text-[11px] text-white/15 tracking-wider">0{i + 1}</span>
              <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center mb-4 mx-auto`}>
                <step.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 px-8 border-t border-white/5">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">See it in action</h2>
          <p className="text-muted-foreground">A live look at the same dashboard your team will use every day</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(0,212,255,0.15)", boxShadow: "0 0 60px rgba(0,212,255,0.08)" }}
        >
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: "rgba(2,7,18,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <span className="text-[11px] text-white/30 px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                app.civilai.dev/dashboard
              </span>
            </div>
          </div>
          <div className="p-6 sm:p-8" style={{ background: "rgba(4,11,25,0.98)" }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {previewStats.map((s, i) => (
                <div key={i} className="glass-card p-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: `${s.accent}15`, border: `1px solid ${s.accent}30` }}>
                    <s.icon className="w-4 h-4" style={{ color: s.accent }} />
                  </div>
                  <p className="text-xl font-bold" style={{ color: s.accent, textShadow: `0 0 20px ${s.accent}30` }}>{s.value}</p>
                  <p className="text-[11px] text-white/35 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Roles */}
      <section className="py-20 px-8 border-t border-white/5">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">Built for every role on your team</h2>
          <p className="text-muted-foreground">Role-based permissions mean everyone sees exactly what they need</p>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {rolesStrip.map((r, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-5 text-center"
            >
              <div className={`w-11 h-11 rounded-xl border ${r.color} flex items-center justify-center mb-3 mx-auto`}>
                <r.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{r.label}</h3>
              <p className="text-xs text-muted-foreground leading-snug">{r.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-8 text-center border-t border-white/5">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to transform your projects?</h2>
          <p className="text-muted-foreground mb-8">Join construction companies using AI to build better</p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="text-white transition-all hover:scale-105 px-10" style={ctaPrimaryStyle} onClick={() => { setShowDemoPicker(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Try the Demo
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Link href="/signup">
              <Button size="lg" className="text-white/70 hover:text-white transition-all hover:scale-105 px-10" style={ctaSecondaryStyle}>
                Create Account
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-10 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,100,160,0.12))",
                border: "1px solid rgba(0,212,255,0.28)",
              }}
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <span className="font-display text-sm tracking-wider text-white">
              CIVIL<span className="text-cyan-400">AI</span>
            </span>
          </div>

          <p className="text-xs text-muted-foreground">Construction management platform powered by AI</p>

          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hover:text-white transition-colors">
              Home
            </button>
            <button
              onClick={() => { setShowDemoPicker(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="hover:text-white transition-colors"
            >
              Try the Demo
            </button>
            <Link href="/signup" className="hover:text-white transition-colors">
              Create Account
            </Link>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground/60 mt-8">
          © {new Date().getFullYear()} CivilAI. All rights reserved.
        </p>
      </footer>
      </div>
    </div>
  );
}
