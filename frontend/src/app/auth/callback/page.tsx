"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    (async () => {
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      router.replace("/dashboard");
    })();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
    </div>
  );
}
