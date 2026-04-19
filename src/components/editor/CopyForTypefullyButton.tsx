"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CopyForTypefullyButtonProps {
  /** Returns the current editor's plain text. Called on click — so
   *  reads the latest content, not a captured-at-mount snapshot. */
  getText: () => string;
}

type Feedback =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "error"; message: string };

export function CopyForTypefullyButton({ getText }: CopyForTypefullyButtonProps) {
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const reset = (delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback({ kind: "idle" }), delayMs);
  };

  const handleClick = async () => {
    const text = getText();
    if (!text.trim()) return; // disabled-guard; double-check in case caller bypasses

    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard?.writeText
      ) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setFeedback({ kind: "copied" });
      reset(2000);
    } catch (err) {
      setFeedback({
        kind: "error",
        message: err instanceof Error ? err.message : "Copy failed",
      });
      reset(3000);
    }
  };

  // Disabled when the editor is empty so users don't copy whitespace.
  const disabled = feedback.kind === "idle" && getText().trim().length === 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
        feedback.kind === "copied"
          ? "bg-[#1B5E20]/20 text-[#4CAF50] border border-[#1B5E20]/40"
          : feedback.kind === "error"
            ? "bg-danger/15 text-danger border border-danger/30"
            : "bg-white/[0.05] text-white/80 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white/95 disabled:opacity-40 disabled:cursor-not-allowed"
      )}
      aria-label="Copy post content for Typefully"
    >
      {feedback.kind === "copied" ? (
        <>
          <Check className="w-3 h-3" />
          <span>Copied</span>
        </>
      ) : feedback.kind === "error" ? (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy failed — select manually</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy for Typefully</span>
        </>
      )}
    </button>
  );
}
