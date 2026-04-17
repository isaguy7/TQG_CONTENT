"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Hook = { category: string; text: string };
type HookResponse =
  | {
      available: true;
      hooks: Hook[];
      tokens: number;
      cost: number;
    }
  | { available: false; reason: string };

export function HookGenerator({
  postId,
  onPick,
}: {
  postId: string;
  onPick: (hook: Hook) => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/claude/usage")
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        setAvailable(Boolean(j.available));
      })
      .catch(() => {
        if (!cancel) setAvailable(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const j: HookResponse = await res.json();
      if (!j.available) {
        setError(j.reason || "unavailable");
        setHooks(null);
        return;
      }
      setHooks(j.hooks);
      setCost(j.cost);
      setTokens(j.tokens);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (available === null) return null;
  if (available === false) return null;

  const grouped = groupByCategory(hooks || []);

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Hook generator</span>
        <div className="flex items-center gap-2">
          {cost != null ? (
            <span className="text-[11px] text-white/40 tabular-nums">
              {tokens?.toLocaleString()} tok · ${cost.toFixed(4)}
            </span>
          ) : null}
          <button
            onClick={run}
            disabled={loading}
            className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            {loading ? "Generating…" : hooks ? "Regenerate" : "Generate hooks"}
          </button>
        </div>
      </div>
      {error ? (
        <div className="text-[12px] text-danger mb-2">{error}</div>
      ) : null}
      {!hooks && !loading ? (
        <div className="text-[12px] text-white/40">
          Click Generate to get 10-15 Tier 1 hooks for this post.
        </div>
      ) : null}
      {hooks && hooks.length === 0 ? (
        <div className="text-[12px] text-white/50">
          Model returned no hooks. Try regenerating.
        </div>
      ) : null}
      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div
                className={cn(
                  "text-[10px] uppercase tracking-wider mb-1",
                  isTier1(cat) ? "text-primary-bright" : "text-white/40"
                )}
              >
                {cat} {isTier1(cat) ? "· Tier 1" : ""}
              </div>
              <ul className="space-y-1">
                {items.map((h, i) => (
                  <li key={`${cat}-${i}`}>
                    <button
                      onClick={() => onPick(h)}
                      className="w-full text-left px-2 py-1.5 rounded text-[12px] text-white/85 hover:text-white hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]"
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const TIER_1 = new Set([
  "contrast",
  "provocative",
  "scene",
  "curiosity",
  "refusal",
  "loss",
]);
function isTier1(cat: string) {
  return TIER_1.has(cat.toLowerCase());
}

function groupByCategory(hooks: Hook[]): Record<string, Hook[]> {
  const out: Record<string, Hook[]> = {};
  for (const h of hooks) {
    const cat = (h.category || "other").toLowerCase();
    if (!out[cat]) out[cat] = [];
    out[cat].push(h);
  }
  return out;
}
