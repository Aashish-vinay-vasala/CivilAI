"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Shield,
  Users,
  FileText,
  Bot,
  ArrowRight,
  CheckCircle,
  DollarSign,
  Calendar,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const features = [
  { icon: DollarSign, title: "Cost Intelligence", desc: "AI predicts overruns before they happen", color: "text-blue-400 bg-blue-500/10" },
  { icon: Calendar, title: "Delay Prediction", desc: "Smart scheduling with ML models", color: "text-orange-400 bg-orange-500/10" },
  { icon: Shield, title: "Safety Monitor", desc: "Real-time risk scoring & OSHA reporting", color: "text-red-400 bg-red-500/10" },
  { icon: FileText, title: "Document AI", desc: "OCR + VLM for any document format", color: "text-purple-400 bg-purple-500/10" },
  { icon: Users, title: "Workforce Engine", desc: "Skills matching & turnover prediction", color: "text-emerald-400 bg-emerald-500/10" },
  { icon: Bot, title: "AI Copilot", desc: "Chat with your project data live", color: "text-cyan-400 bg-cyan-500/10" },
];

const stats = [
  { value: "20+", label: "AI Modules" },
  { value: "86%+", label: "ML Accuracy" },
  { value: "6", label: "ML Models" },
  { value: "$0", label: "To Start" },
];

export default function LandingPage() {
  const [mode, setMode] = useState<"landing" | "login" | "signup">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Welcome back!");
        router.push("/dashboard");
      }
    } catch {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signUp(email, password, name);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Account created! Check your email to confirm.");
        setMode("login");
      }
    } catch {
      toast.error("Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (mode === "login" || mode === "signup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="bg-card border border-border rounded-2xl p-8">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {mode === "login" ? "Sign in to CivilAI" : "Join CivilAI today"}
                </p>
              </div>
            </div>

            {/* Google OAuth */}
            <Button
              variant="outline"
              className="w-full mb-4"
              onClick={signInWithGoogle}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </Button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Form */}
            <form onSubmit={mode === "login" ? handleLogin : handleSignUp} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Smith"
                    required
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full gradient-blue text-white border-0 py-3 rounded-xl"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <ArrowRight className="w-4 h-4 mr-2" />
                }
                {mode === "login" ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <div className="mt-6 space-y-3">
              {mode === "login" ? (
                <p className="text-sm text-center text-muted-foreground">
                  Don't have an account?{" "}
                  <button onClick={() => setMode("signup")} className="text-blue-400 hover:text-blue-300">
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="text-blue-400 hover:text-blue-300">
                    Sign in
                  </button>
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                Secured by Supabase Auth
              </div>
              <button
                onClick={() => setMode("landing")}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                ← Back to home
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 border-b border-border bg-background/80 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg">CivilAI</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setMode("login")}>Sign In</Button>
          <Button className="gradient-blue text-white border-0" onClick={() => setMode("signup")}>
            Get Started
          </Button>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-8 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            <Bot className="w-4 h-4" />
            AI-Powered Construction Management
          </span>
          <h1 className="text-5xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
            Build Smarter
            <br />
            <span className="gradient-text">with CivilAI</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            The only construction management platform powered by AI.
            Predict delays, prevent overruns, and manage everything in one place.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="gradient-blue text-white border-0 px-8" onClick={() => setMode("signup")}>
              Start Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/dashboard")}>
              View Demo
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-4 gap-8 max-w-2xl mx-auto mt-20"
        >
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-8 bg-secondary/20">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">Everything you need</h2>
          <p className="text-muted-foreground">20+ AI modules covering every aspect of construction management</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="bg-card border border-border rounded-2xl p-6"
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

      {/* CTA */}
      <section className="py-20 px-8 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}>
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to transform your projects?</h2>
          <p className="text-muted-foreground mb-8">Join construction companies using AI to build better</p>
          <Button size="lg" className="gradient-blue text-white border-0 px-10" onClick={() => setMode("signup")}>
            Get Started Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </section>
    </div>
  );
}