"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") || "/";
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(nextPath);
    router.refresh();
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
        <form
          onSubmit={signIn}
          className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-5 space-y-4"
        >
          <label className="block">
            <span className="text-[11px] text-white/55">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-white/[0.03] border border-white/[0.08] rounded px-3 py-2 text-[13px] text-white/90 focus:outline-none focus:border-white/[0.2]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-white/55">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-white/[0.03] border border-white/[0.08] rounded px-3 py-2 text-[13px] text-white/90 focus:outline-none focus:border-white/[0.2]"
            />
          </label>
          {error ? (
            <div className="text-[12px] text-danger">{error}</div>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="text-[11px] text-white/35 text-center leading-relaxed">
            Accounts are created by the admin in the Supabase dashboard.
            Sign-up is disabled.
          </div>
        </form>
      </div>
    </div>
  );
}
