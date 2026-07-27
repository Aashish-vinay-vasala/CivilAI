"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

const ctaPrimaryStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(0,100,160,0.2))",
  border: "1px solid rgba(0,212,255,0.3)",
  boxShadow: "0 0 20px rgba(0,212,255,0.15)",
};

type Step = "email" | "code" | "password";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { requestPasswordReset, verifyPasswordResetOtp, updatePassword } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (!email) {
      toast.error("Enter your email");
      return;
    }
    setSubmitting(true);
    const { error } = await requestPasswordReset(email);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reset code sent — check your email");
    setStep("code");
  };

  const handleVerifyCode = async () => {
    if (code.length < 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setSubmitting(true);
    const { error } = await verifyPasswordResetOtp(email, code);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStep("password");
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(email, newPassword);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm glass-card p-8"
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

        {step === "email" && (
          <>
            <h1 className="text-2xl font-bold text-foreground mb-1">Reset your password</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your account email and we&apos;ll send you a code to reset your password.
            </p>
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Email"
                className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
              />
              <Button className="w-full text-white transition-all hover:scale-[1.02]" style={ctaPrimaryStyle} onClick={handleSendCode} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset code"}
              </Button>
            </div>
          </>
        )}

        {step === "code" && (
          <>
            <h1 className="text-2xl font-bold text-foreground mb-1">Enter your code</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We sent a 6-digit code to <span className="text-foreground">{email}</span>.
            </p>
            <div className="space-y-3">
              <Input
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg tracking-[0.5em] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
                maxLength={6}
              />
              <Button className="w-full text-white transition-all hover:scale-[1.02]" style={ctaPrimaryStyle} onClick={handleVerifyCode} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify code"}
              </Button>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={submitting}
                className="w-full text-xs text-muted-foreground hover:text-cyan-400 transition-colors disabled:opacity-50"
              >
                Didn&apos;t get a code? Resend
              </button>
            </div>
          </>
        )}

        {step === "password" && (
          <>
            <h1 className="text-2xl font-bold text-foreground mb-1">Choose a new password</h1>
            <p className="text-sm text-muted-foreground mb-6">It must be different from your current password.</p>
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="New password"
                className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                className="focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
              />
              <Button className="w-full text-white transition-all hover:scale-[1.02]" style={ctaPrimaryStyle} onClick={handleSetPassword} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change password"}
              </Button>
            </div>
          </>
        )}

        <p className="text-sm text-muted-foreground mt-6 text-center">
          <Link href="/login" className="text-cyan-400 hover:underline">
            Back to login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
