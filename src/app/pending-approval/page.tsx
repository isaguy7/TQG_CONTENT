"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* noop */
    }
    // Also clear the cached role cookie client-side via a page reload
    // through the login route — the middleware won't set a new cookie
    // until next sign-in.
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-[22px] font-semibold tracking-tight text-white/90">
          TQG Studio
        </div>
        <div className="mt-8 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-6">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/15 border border-amber-400/25 flex items-center justify-center mb-3">
            <span className="text-amber-300 text-lg">⌛</span>
          </div>
          <div className="text-[14px] font-semibold text-white/90 mb-1">
            Waiting for admin approval
          </div>
          <p className="text-[12px] text-white/60 leading-relaxed">
            Your account is registered but not yet approved. Isa will review
            new accounts and grant access. You&apos;ll be able to log in
            again here once that happens.
          </p>
          {email ? (
            <div className="mt-4 text-[11px] text-white/40 font-mono">
              Signed in as {email}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={async () => {
              setChecking(true);
              try {
                await fetch("/api/auth/refresh-role", { method: "POST" });
              } catch {
                /* noop */
              }
              // Bounce through / so middleware re-evaluates the role with
              // a fresh DB lookup — if the admin approved, this puts us
              // on the dashboard.
              router.push("/");
              router.refresh();
            }}
            disabled={checking}
            className="px-3 py-1.5 rounded-md text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check status"}
          </button>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="px-3 py-1.5 rounded-md text-[12px] border border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
