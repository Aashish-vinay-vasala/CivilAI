"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Shield,
  TrendingUp,
  Users,
  FileText,
  Bot,
  ArrowRight,
  CheckCircle,
  DollarSign,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const features = [
  { icon: DollarSign, title: "Cost Intelligence", desc: "AI predicts overruns before they happen", color: "text-blue-400 bg-blue-500/10" },
  { icon: Calendar, title: "Delay Prediction", desc: "Smart scheduling with weather & resource AI", color: "text-orange-400 bg-orange-500/10" },
  { icon: Shield, title: "Safety Monitor", desc: "Real-time risk scoring & OSHA reporting", color: "text-red-400 bg-red-500/10" },
  { icon: FileText, title: "Document AI", desc: "OCR + VLM for any document format", color: "text-purple-400 bg-purple-500/10" },
  { icon: Users, title: "Workforce Engine", desc: "Skills matching & turnover prediction", color: "text-emerald-400 bg-emerald-500/10" },
  { icon: Bot, title: "AI Copilot", desc: "Chat with your project data live", color: "text-cyan-400 bg-cyan-500/10" },
];

const stats = [
  { value: "20+", label: "AI Modules" },
  { value: "100+", label: "Features" },
  { value: "12", label: "ML Models" },
  { value: "$0", label: "To Start" },
];

export default function LandingPage() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard");
    }, 1000);
  };

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
          <Button variant="ghost" onClick={() => setIsLogin(true)}>
            Sign In
          </Button>
          <Button
            className="gradient-blue text-white border-0"
            onClick={() => setIsLogin(true)}
          >
            Get Started
          </Button>
        </div>
      </motion.nav>

      {!isLogin ? (
        <>
          {/* Hero */}
          <section className="pt-32 pb-20 px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
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
                <Button
                  size="lg"
                  className="gradient-blue text-white border-0 px-8"
                  onClick={() => setIsLogin(true)}
                >
                  Start Free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
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
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Everything you need
              </h2>
              <p className="text-muted-foreground">
                20+ AI modules covering every aspect of construction management
              </p>
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Ready to transform your projects?
              </h2>
              <p className="text-muted-foreground mb-8">
                Join construction companies using AI to build better
              </p>
              <Button
                size="lg"
                className="gradient-blue text-white border-0 px-10"
                onClick={() => setIsLogin(true)}
              >
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </section>
        </>
      ) : (
        /* Login Form */
        <div className="min-h-screen flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Welcome back</h2>
                  <p className="text-xs text-muted-foreground">Sign in to CivilAI</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full gradient-blue text-white border-0 py-3 rounded-xl"
                >
                  {loading ? "Signing in..." : "Sign In"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  Demo: any email & password works
                </div>
                <button
                  onClick={() => setIsLogin(false)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  ← Back to home
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}