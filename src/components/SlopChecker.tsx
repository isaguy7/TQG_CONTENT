"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type SlopResp =
  | { available: true; issues: string[]; score: number; tokens: number; cost: number }
  | { available: false; reason: string };

export function SlopChecker({
  content,
  postId,
}: {
  content: string;
  postId: string;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    issues: string[];
    score: number;
    cost: number;
    tokens: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/claude/usage")
      .then((r) => r.json())
      .then((j) => {
        if (!cancel) setAvailable(Boolean(j.available));
      })
      .catch(() => {
        if (!cancel) setAvailable(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (available !== true) return null;

  const run = async () => {
    if (!content.trim()) {
      setError("Draft is empty.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/slop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, post_id: postId }),
      });
      const j: SlopResp = await res.json();
      if (!j.available) {
        setError(j.reason);
        setResult(null);
        return;
      }
      setResult({
        issues: j.issues,
        score: j.score,
        cost: j.cost,
        tokens: j.tokens,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor =
    result && result.score >= 75
      ? "text-emerald-400"
      : result && result.score >= 50
        ? "text-amber-400"
        : "text-danger";

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="section-label">AI slop check</span>
        <div className="flex items-center gap-2">
          {result ? (
            <span className="text-[11px] text-white/40 tabular-nums">
              {result.tokens.toLocaleString()} tok · ${result.cost.toFixed(4)}
            </span>
          ) : null}
          <button
            onClick={run}
            disabled={loading}
            className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            {loading ? "Scanning…" : "Check for AI slop"}
          </button>
        </div>
      </div>
      {error ? <div className="text-[12px] text-danger mb-2">{error}</div> : null}
      {result ? (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[12px] text-white/60">Humanness</span>
            <span className={cn("text-[14px] font-semibold tabular-nums", scoreColor)}>
              {result.score}/100
            </span>
          </div>
          {result.issues.length === 0 ? (
            <div className="text-[12px] text-emerald-400">
              No AI-sounding phrases flagged.
            </div>
          ) : (
            <ul className="space-y-1">
              {result.issues.map((issue, i) => (
                <li
                  key={`${i}-${issue}`}
                  className="text-[12px] text-white/80 px-2 py-1 rounded bg-danger/[0.08] border border-danger/20"
                >
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
