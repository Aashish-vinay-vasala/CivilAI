"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Redirect target for both Google OAuth and email-confirmation links. The
 * role picked on /signup was stashed in sessionStorage before the redirect
 * (query params aren't reliably carried through either round trip). From
 * here: exchange the PKCE code for a session, set the role server-side, then
 * route to OTP verification (Google signups always start otp_verified=false
 * — see migration 041) or straight to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setError(errorDescription);
        return;
      }

      // PKCE flow: the redirect carries a one-time `code` that must be
      // exchanged for a session explicitly — getSession() alone won't do it.
      const code = params.get("code");
      let result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.getSession();

      if ((result.error || !result.data.session) && code) {
        // The code is single-use. If a duplicate call already consumed it
        // (e.g. React Strict Mode double-firing this effect in dev) and that
        // one actually succeeded, we're already signed in — check before
        // reporting a false failure.
        console.error("exchangeCodeForSession failed, checking for an existing session:", result.error);
        result = await supabase.auth.getSession();
      }

      const { data, error: exchangeError } = result;

      if (exchangeError || !data.session) {
        setError("Sign-in did not complete. Please try again.");
        return;
      }

      // Only present for a fresh signup (see signUpWithGoogle) — a returning
      // login via Google leaves this unset so their existing role is untouched.
      const role = sessionStorage.getItem("civilai_signup_role");
      sessionStorage.removeItem("civilai_signup_role");

      if (role) {
        try {
          await axios.post(`${API}/api/v1/auth/complete-signup`, { role });
        } catch {
          // Non-fatal — role defaults to 'viewer' server-side if this fails.
        }
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("otp_verified")
        .eq("id", data.session.user.id)
        .single();

      if (profile && profile.otp_verified === false) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: data.session.user.email!,
          options: { shouldCreateUser: false },
        });
        if (otpError) {
          setError(`Couldn't send your verification code: ${otpError.message}`);
          return;
        }
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
