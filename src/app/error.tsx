"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console in dev and in Vercel runtime logs
    // in prod. Sentry integration deferred to M2.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B5E20]/20 text-[#4CAF50] shadow-[0_0_14px_rgba(27,94,32,0.5)]">
            <AlertTriangle size={20} strokeWidth={2.25} />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">
            Something went wrong
          </h1>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-zinc-400">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#256a2b] focus:outline-none focus:ring-2 focus:ring-[#4CAF50]/60 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Go home
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-center text-xs text-zinc-500">
            Error ID: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
