"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const errorMsg = search.get("error");
  const nextPath = search.get("next") || "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPending(false);
    try {
      const supabase = createClient();
      if (mode === "signin") {
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
      } else {
        // Sign up — the DB trigger stamps the profile as 'pending'. We
        // don't redirect; we surface a confirmation message instead.
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: displayName.trim() || null },
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          setBusy(false);
          return;
        }
        setPending(true);
        setBusy(false);
      }
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
            {mode === "signin" ? "Sign in to continue" : "Request access"}
          </div>
        </div>

        <div className="mb-3 flex rounded-md bg-white/[0.03] border border-white/[0.08] p-1 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setPending(false);
              setError(null);
            }}
            className={cn(
              "flex-1 py-1.5 rounded transition-colors",
              mode === "signin"
                ? "bg-white/[0.08] text-white/95"
                : "text-white/55 hover:text-white/80"
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setPending(false);
              setError(null);
            }}
            className={cn(
              "flex-1 py-1.5 rounded transition-colors",
              mode === "signup"
                ? "bg-white/[0.08] text-white/95"
                : "text-white/55 hover:text-white/80"
            )}
          >
            Create account
          </button>
        </div>

        {pending ? (
          <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] p-4 text-[12px] text-emerald-100/90 leading-relaxed">
            <div className="text-[13px] font-semibold text-white/90 mb-1">
              Account created
            </div>
            An admin needs to approve your access before you can use TQG
            Studio. You&apos;ll be able to sign in here once that happens.
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-5 space-y-3"
          >
            {mode === "signup" ? (
              <div className="space-y-1">
                <label
                  htmlFor="displayName"
                  className="text-[11px] uppercase tracking-wider text-white/50"
                >
                  Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
                  placeholder="How should we address you?"
                />
              </div>
            ) : null}

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
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={
                busy ||
                !email ||
                !password ||
                (mode === "signup" && !displayName.trim())
              }
              className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {busy
                ? mode === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>

            {error || errorMsg ? (
              <div className="text-[12px] text-danger">
                {error || decodeURIComponent(errorMsg || "")}
              </div>
            ) : null}

            <p className="text-[11px] text-white/40 text-center leading-relaxed pt-1">
              {mode === "signin"
                ? "Connect LinkedIn and X from Settings after signing in."
                : "New accounts need admin approval before they can use the app."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
