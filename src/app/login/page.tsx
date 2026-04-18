"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const search = useSearchParams();
  const errorMsg = search.get("error");
  const nextPath = search.get("next") || "/";
  const [busy, setBusy] = useState<"linkedin" | "x" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: "linkedin" | "x") => {
    setBusy(provider);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo =
        `${window.location.origin}/auth/callback` +
        (nextPath && nextPath !== "/"
          ? `?next=${encodeURIComponent(nextPath)}`
          : "");

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider === "linkedin" ? "linkedin_oidc" : "twitter",
        options: {
          redirectTo,
          scopes:
            provider === "linkedin"
              ? "openid profile email w_member_social"
              : "tweet.read tweet.write users.read offline.access",
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setBusy(null);
      }
      // On success the browser is redirected to the provider; nothing else
      // to do here.
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-[22px] font-semibold tracking-tight text-white/90">
            TQG Studio
          </div>
          <div className="text-[12px] text-white/45 mt-1">
            Sign in to continue
          </div>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-5 space-y-3">
          <button
            onClick={() => signIn("linkedin")}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-md bg-[#0A66C2] text-white text-[13px] font-medium hover:bg-[#004182] transition-colors disabled:opacity-50"
          >
            <LinkedInIcon />
            {busy === "linkedin"
              ? "Redirecting…"
              : "Sign in with LinkedIn"}
          </button>

          <button
            onClick={() => signIn("x")}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-md bg-black text-white text-[13px] font-medium border border-white/[0.12] hover:bg-white/[0.04] transition-colors disabled:opacity-50"
          >
            <XIcon />
            {busy === "x" ? "Redirecting…" : "Sign in with X"}
          </button>

          {error || errorMsg ? (
            <div className="text-[12px] text-danger">
              {error || decodeURIComponent(errorMsg || "")}
            </div>
          ) : null}

          <p className="text-[11px] text-white/40 text-center leading-relaxed pt-1">
            Signing in connects your account so TQG Studio can post on your
            behalf. You can revoke access any time from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.37V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2H21.5l-7.6 8.685L23 22h-7.04l-5.51-7.21L4.13 22H.87l8.13-9.29L1 2h7.21l4.98 6.58L18.24 2Zm-1.23 18h1.95L7.06 4H5.01l12 16Z" />
    </svg>
  );
}
