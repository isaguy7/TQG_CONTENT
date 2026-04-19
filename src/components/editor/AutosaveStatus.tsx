"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutosaveState } from "./hooks/useAutosave";

export interface AutosaveStatusProps {
  state: AutosaveState;
  /** Called when the user clicks Retry on a failed save. Parent wires
   *  this to the autosave hook's flushSave or a re-triggerSave. */
  onRetry?: () => void;
}

function formatRelative(saved: Date, now: Date): string {
  const diffMs = now.getTime() - saved.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const sameDay =
    saved.getFullYear() === now.getFullYear() &&
    saved.getMonth() === now.getMonth() &&
    saved.getDate() === now.getDate();
  if (sameDay) {
    return saved.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return saved.toLocaleDateString();
}

export function AutosaveStatus({ state, onRetry }: AutosaveStatusProps) {
  // Tick every 10s so the relative-time string doesn't stale out while
  // the user reads it. Only mounted when we're in the 'saved' branch to
  // avoid wasted intervals.
  const [, tick] = useState(0);
  useEffect(() => {
    if (state.status !== "saved") return;
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [state.status]);

  // Initial idle state: render nothing (no "Not saved" noise before any
  // edit has happened).
  if (state.status === "idle" && !state.lastSavedAt) return null;

  if (state.status === "saving") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] text-white/55"
        aria-live="polite"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Saving…</span>
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] text-danger"
        role="alert"
      >
        <AlertCircle className="w-3 h-3" />
        <span>Save failed: {state.error?.message ?? "unknown error"}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "ml-1 rounded border border-danger/40 px-1.5 py-0.5",
              "text-[10px] uppercase tracking-wider",
              "hover:bg-danger/10"
            )}
          >
            Retry
          </button>
        ) : null}
      </span>
    );
  }

  // saved branch
  const relative = state.lastSavedAt
    ? formatRelative(state.lastSavedAt, new Date())
    : "";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400"
      aria-live="polite"
    >
      <Check className="w-3 h-3" />
      <span>Saved {relative}</span>
    </span>
  );
}
