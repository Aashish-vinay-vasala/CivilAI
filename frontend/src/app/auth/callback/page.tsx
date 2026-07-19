"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Google OAuth redirect target. The role picked on /signup was stashed in
 * sessionStorage before the redirect (query params aren't reliably carried
 * through Google's OAuth round trip). From here: set the role server-side,
 * then route to OTP verification (Google signups always start
 * otp_verified=false — see migration 041) or straight to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError("Sign-in did not complete. Please try again.");
        return;
      }

      const role = sessionStorage.getItem("civilai_signup_role") ?? "viewer";
      sessionStorage.removeItem("civilai_signup_role");

      try {
        await axios.post(`${API}/api/v1/auth/complete-signup`, { role });
      } catch {
        // Non-fatal — role defaults to 'viewer' server-side if this fails.
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("otp_verified")
        .eq("id", data.session.user.id)
        .single();

      if (profile && profile.otp_verified === false) {
        await supabase.auth.signInWithOtp({ email: data.session.user.email!, options: { shouldCreateUser: false } });
        router.replace("/signup/verify-otp");
      } else {
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-muted-foreground text-sm">Finishing sign-in...</p>
          </>
        )}
      </div>
    </div>
  );
}
