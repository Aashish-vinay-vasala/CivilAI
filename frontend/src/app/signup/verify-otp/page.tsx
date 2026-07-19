"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL;

// Matches the primary button treatment used across the dashboard (e.g. the
// "New Project" button) instead of a flat Tailwind fill.
const ctaPrimaryStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
  boxShadow: "0 0 20px rgba(0,212,255,0.15)",
};

export default function VerifyOtpPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async () => {
    if (!user?.email || code.length < 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({ email: user.email, token: code, type: "email" });
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }
    try {
      await axios.post(`${API}/api/v1/auth/otp/confirm`);
    } catch {
      // The dashboard guard re-checks profile.otp_verified on load anyway.
    }
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-card p-8 text-center"
      >
        <div className="flex items-center justify-center gap-2.5 mb-6">
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
        <h1 className="text-xl font-bold text-foreground mb-2">Check your email</h1>
        <p className="text-sm text-muted-foreground mb-6">
          We sent a 6-digit code to {user?.email ?? "your email"}. Enter it below to finish setting up your account.
        </p>
        <Input
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center text-lg tracking-[0.5em] mb-4 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
          maxLength={6}
        />
        <Button className="w-full text-white transition-all hover:scale-[1.02]" style={ctaPrimaryStyle} onClick={handleVerify} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
        </Button>
      </motion.div>
    </div>
  );
}
