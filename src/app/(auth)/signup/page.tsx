"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signUp } from "./actions";
import { cn } from "@/lib/utils";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

function deriveSlug(email: string): string {
  const local = email.split("@")[0] ?? "";
  const slug = local
    .toLowerCase()
    .replace(/[._]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 55);
  if (!slug) return "";
  return `${slug}-workspace`.slice(0, 63);
}

type SlugStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "invalid"; reason: string };

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-derive slug + workspace name as user types email — only until they
  // touch the slug field manually.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(deriveSlug(email));
  }, [email, slugTouched]);

  useEffect(() => {
    if (!workspaceName) {
      const local = email.split("@")[0] ?? "";
      if (local) setWorkspaceName(`${local}'s Workspace`);
    }
    // intentionally not depending on workspaceName so user edits stick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Debounced slug availability check.
  useEffect(() => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (!slug) {
      setSlugStatus({ state: "idle" });
      return;
    }
    if (!SLUG_PATTERN.test(slug)) {
      setSlugStatus({
        state: "invalid",
        reason:
          "Use lowercase letters, digits, and hyphens. Must start and end with a letter or digit.",
      });
      return;
    }
    setSlugStatus({ state: "checking" });
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/org/slug-available?slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          available: boolean;
          reason?: string;
        };
        if (json.available) setSlugStatus({ state: "available" });
        else
          setSlugStatus({
            state: json.reason === "invalid_format" ? "invalid" : "taken",
            reason: json.reason ?? "",
          });
      } catch {
        // Network error — leave status idle so submit can still try; server
        // action will reject if truly taken.
        setSlugStatus({ state: "idle" });
      }
    }, 350);
    return () => {
      if (slugTimer.current) clearTimeout(slugTimer.current);
    };
  }, [slug]);

  const passwordMismatch = useMemo(
    () => confirm.length > 0 && password !== confirm,
    [password, confirm]
  );

  const canSubmit =
    !busy &&
    email.length > 3 &&
    password.length >= 8 &&
    !passwordMismatch &&
    workspaceName.trim().length > 0 &&
    workspaceName.trim().length <= 100 &&
    slug.length > 0 &&
    slugStatus.state !== "taken" &&
    slugStatus.state !== "invalid";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.set("email", email.trim());
    formData.set("password", password);
    formData.set("workspace_name", workspaceName.trim());
    formData.set("workspace_slug", slug.trim());

    const result = await signUp(formData);
    if (!result.success) {
      setBusy(false);
      if (result.error === "slug_taken") {
        setSlugStatus({ state: "taken" });
        setError("That workspace URL is already taken — pick another.");
      } else if (result.error === "validation") {
        setError(result.message ?? "Please check the form fields.");
      } else if (result.error === "signup_failed") {
        setError(result.message ?? "Couldn't create your account. Try again.");
      } else {
        setError("Something went wrong. Try again.");
      }
      return;
    }

    // Server created the auth user; sign in client-side so cookies land,
    // then redirect to the onboarding wizard.
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setBusy(false);
      setError(`Account created but sign-in failed: ${signInError.message}`);
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-[22px] font-semibold tracking-tight text-white/90">
            TQG Studio
          </div>
          <div className="text-[12px] text-white/45 mt-1">
            Create your workspace
          </div>
        </div>

        <form
          onSubmit={onSubmit}
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
              placeholder="At least 8 characters"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="confirm"
              className="text-[11px] uppercase tracking-wider text-white/50"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              className={cn(
                "w-full px-3 py-2 rounded-md bg-black/40 border text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none disabled:opacity-50",
                passwordMismatch
                  ? "border-danger/60 focus:border-danger"
                  : "border-white/[0.1] focus:border-white/30"
              )}
            />
            {passwordMismatch ? (
              <p className="text-[11px] text-danger">Passwords don&apos;t match.</p>
            ) : null}
          </div>

          <div className="space-y-1 pt-2 border-t border-white/[0.06]">
            <label
              htmlFor="workspace_name"
              className="text-[11px] uppercase tracking-wider text-white/50"
            >
              Workspace name
            </label>
            <input
              id="workspace_name"
              type="text"
              required
              maxLength={100}
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={busy}
              className="w-full px-3 py-2 rounded-md bg-black/40 border border-white/[0.1] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
              placeholder="My Workspace"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="workspace_slug"
              className="text-[11px] uppercase tracking-wider text-white/50"
            >
              Workspace URL
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-white/40 shrink-0">tqg/</span>
              <input
                id="workspace_slug"
                type="text"
                required
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                }}
                disabled={busy}
                className={cn(
                  "flex-1 px-3 py-2 rounded-md bg-black/40 border text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none disabled:opacity-50 font-mono",
                  slugStatus.state === "taken" || slugStatus.state === "invalid"
                    ? "border-danger/60 focus:border-danger"
                    : slugStatus.state === "available"
                      ? "border-emerald-500/40 focus:border-emerald-400"
                      : "border-white/[0.1] focus:border-white/30"
                )}
                placeholder="my-workspace"
              />
            </div>
            <SlugFeedback status={slugStatus} />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>

          {error ? (
            <div className="text-[12px] text-danger">{error}</div>
          ) : null}

          <p className="text-[11px] text-white/40 text-center leading-relaxed pt-2 border-t border-white/[0.06]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-white/70 underline underline-offset-2 hover:text-white"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function SlugFeedback({ status }: { status: SlugStatus }) {
  if (status.state === "idle") {
    return (
      <p className="text-[11px] text-white/35">
        Lowercase letters, digits, hyphens. Visible in URLs.
      </p>
    );
  }
  if (status.state === "checking") {
    return <p className="text-[11px] text-white/45">Checking availability…</p>;
  }
  if (status.state === "available") {
    return (
      <p className="text-[11px] text-emerald-300">Available — looks good.</p>
    );
  }
  if (status.state === "taken") {
    return <p className="text-[11px] text-danger">Already taken — pick another.</p>;
  }
  return <p className="text-[11px] text-danger">{status.reason}</p>;
}
