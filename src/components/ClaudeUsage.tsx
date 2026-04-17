"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type UsageResp = {
  available: boolean;
  totalCostUsd: number;
  capUsd: number;
  over: boolean;
  byFeature: Record<string, { count: number; cost: number }>;
  recent: Array<{
    id: string;
    feature: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    created_at: string;
  }>;
};

export function ClaudeUsage() {
  const [data, setData] = useState<UsageResp | null>(null);

  useEffect(() => {
    fetch("/api/claude/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="text-[12px] text-white/40">Loading usage…</div>
    );
  }
  if (!data.available) {
    return (
      <div className="text-[12px] text-white/50">
        Set <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> in{" "}
        <code className="font-mono text-[11px]">.env.local</code> to enable
        in-app hook generation, platform conversion, and AI-slop checking.
      </div>
    );
  }

  const pct = data.capUsd > 0
    ? Math.min(100, (data.totalCostUsd / data.capUsd) * 100)
    : 0;
  const color = data.over
    ? "bg-danger"
    : pct > 75
      ? "bg-amber-400"
      : "bg-emerald-400";

  const features = Object.entries(data.byFeature).sort(
    (a, b) => b[1].cost - a[1].cost
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[12px] text-white/70">
            Spend this month
          </span>
          <span
            className={cn(
              "text-[13px] tabular-nums font-medium",
              data.over ? "text-danger" : "text-white/85"
            )}
          >
            ${data.totalCostUsd.toFixed(4)} / ${data.capUsd.toFixed(2)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={cn("h-full transition-all", color)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {features.length > 0 ? (
        <div>
          <div className="section-label mb-2">By feature</div>
          <ul className="space-y-1">
            {features.map(([name, stats]) => (
              <li
                key={name}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="text-white/70">{name}</span>
                <span className="text-white/50 tabular-nums">
                  {stats.count} calls · ${stats.cost.toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.recent.length > 0 ? (
        <div>
          <div className="section-label mb-2">Recent calls</div>
          <ul className="space-y-1">
            {data.recent.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[1fr_auto_auto] gap-2 text-[11px] text-white/60"
              >
                <span className="truncate">{r.feature}</span>
                <span className="tabular-nums">
                  {r.input_tokens + r.output_tokens} tok
                </span>
                <span className="tabular-nums">
                  ${Number(r.estimated_cost_usd).toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
