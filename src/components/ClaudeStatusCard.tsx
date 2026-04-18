"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type UsageResp = {
  available: boolean;
  totalCostUsd: number;
  capUsd: number;
  over: boolean;
};

/**
 * Small dashboard card summarising Claude API status — there/not-there,
 * monthly spend vs cap. Functions as a surface-check so the user can see
 * at a glance whether hooks / slop / convert features are powered.
 */
export function ClaudeStatusCard() {
  const [data, setData] = useState<UsageResp | null>(null);

  useEffect(() => {
    fetch("/api/claude/usage", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const connected = Boolean(data?.available);
  const pct =
    data && data.available && data.capUsd > 0
      ? Math.min(100, (data.totalCostUsd / data.capUsd) * 100)
      : 0;
  const barColor = data?.over
    ? "bg-danger"
    : pct > 75
      ? "bg-amber-400"
      : "bg-emerald-400";

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="section-label">Claude AI</span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px]",
            connected ? "text-emerald-300" : "text-white/45"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connected ? "bg-emerald-400" : "bg-white/25"
            )}
          />
          {connected ? "Active" : "Inactive"}
        </span>
      </div>

      {data && data.available ? (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-white/55">
              Monthly spend
            </span>
            <span className="text-[12px] text-white/85 tabular-nums font-medium">
              ${data.totalCostUsd.toFixed(2)} /{" "}
              <span className="text-white/55">${data.capUsd.toFixed(0)}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className={cn("h-full transition-all", barColor)}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill>hooks</Pill>
            <Pill>convert</Pill>
            <Pill>slop check</Pill>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-white/55 leading-relaxed">
          Set <code className="font-mono text-[10px]">ANTHROPIC_API_KEY</code>{" "}
          to power hook generation, cross-platform conversion, and AI-slop
          checking inside the post editor.
        </p>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-[10px] text-primary-bright">
      {children}
    </span>
  );
}
