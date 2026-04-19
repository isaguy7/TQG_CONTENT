"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const errorMsg = search.get("error");
  const nextPath = search.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
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

        <form
          onSubmit={submit}
          className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-5 space-y-3"
        >
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-[11px] uppercase tracking-wider text-white/50"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-[11px] uppercase tracking-wider text-white/50"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          {error || errorMsg ? (
            <div className="text-[12px] text-danger">
              {error || decodeURIComponent(errorMsg || "")}
            </div>
          ) : null}

          <p className="text-[11px] text-white/40 text-center leading-relaxed pt-2 border-t border-white/[0.06]">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-white/70 underline underline-offset-2 hover:text-white"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
