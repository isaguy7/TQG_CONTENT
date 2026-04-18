"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  linkedinToFacebook,
  linkedinToInstagram,
  linkedinToX,
} from "@/lib/platform-convert";
import {
  PLATFORMS,
  type PlatformId,
} from "@/lib/platform-rules";

type Props = {
  content: string;
  fromPlatform: string;
  postId?: string | null;
};

const CONVERT_TARGETS: PlatformId[] = ["linkedin", "x", "instagram", "facebook"];

type CardState =
  | { state: "idle"; text: string; source: "local" | "empty" }
  | { state: "loading"; text: string; source: "local" }
  | { state: "ready"; text: string; source: "local" | "claude"; tokens?: number; cost?: number }
  | { state: "error"; text: string; source: "local"; error: string };

function deterministicConvert(
  content: string,
  from: string,
  to: PlatformId
): string {
  if (!content.trim()) return "";
  if (to === from) return content;
  if (from === "linkedin") {
    if (to === "x") return linkedinToX(content);
    if (to === "instagram") return linkedinToInstagram(content);
    if (to === "facebook") return linkedinToFacebook(content);
  }
  // Generic truncation fallback for other source platforms.
  const limit = PLATFORMS[to].charLimit;
  if (content.length <= limit) return content;
  return content.slice(0, limit - 1).trimEnd() + "…";
}

export function ConvertPreviews({ content, fromPlatform, postId }: Props) {
  const targets = useMemo(
    () => CONVERT_TARGETS.filter((t) => t !== fromPlatform),
    [fromPlatform]
  );
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/claude/usage")
      .then((r) => r.json())
      .then((j) => setClaudeAvailable(Boolean(j.available) && !j.over))
      .catch(() => setClaudeAvailable(false));
  }, []);

  // Reset deterministic preview when source content changes.
  useEffect(() => {
    const next: Record<string, CardState> = {};
    for (const t of targets) {
      const text = deterministicConvert(content, fromPlatform, t);
      next[t] = text
        ? { state: "idle", text, source: "local" }
        : { state: "idle", text: "", source: "empty" };
    }
    setCards(next);
  }, [content, fromPlatform, targets]);

  const runClaude = useCallback(
    async (target: PlatformId) => {
      if (!content.trim()) return;
      setCards((prev) => ({
        ...prev,
        [target]: { state: "loading", text: prev[target]?.text || "", source: "local" },
      }));
      try {
        const res = await fetch("/api/claude/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            from_platform: fromPlatform,
            to_platform: target,
            post_id: postId || null,
          }),
        });
        const j = await res.json();
        if (!j.available) {
          setCards((prev) => ({
            ...prev,
            [target]: {
              state: "error",
              text: prev[target]?.text || "",
              source: "local",
              error: j.reason || "unavailable",
            },
          }));
          return;
        }
        setCards((prev) => ({
          ...prev,
          [target]: {
            state: "ready",
            text: j.converted || prev[target]?.text || "",
            source: "claude",
            tokens: j.tokens,
            cost: j.cost,
          },
        }));
      } catch (err) {
        setCards((prev) => ({
          ...prev,
          [target]: {
            state: "error",
            text: prev[target]?.text || "",
            source: "local",
            error: (err as Error).message,
          },
        }));
      }
    },
    [content, fromPlatform, postId]
  );

  const copy = async (target: string, text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(`${PLATFORMS[target as PlatformId].label} copied`);
      setTimeout(() => setCopyMsg(null), 1500);
    } catch {
      setCopyMsg("Copy failed");
      setTimeout(() => setCopyMsg(null), 1500);
    }
  };

  if (targets.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="section-label">
          Convert to other platforms{" "}
          {claudeAvailable ? (
            <span className="text-primary-bright">· AI enabled</span>
          ) : (
            <span className="text-white/35">· deterministic</span>
          )}
        </div>
        {copyMsg ? (
          <span className="text-[11px] text-primary-bright">{copyMsg}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {targets.map((t) => {
          const card = cards[t] || { state: "idle", text: "", source: "empty" };
          const limit = PLATFORMS[t].charLimit;
          const over = card.text.length > limit;
          return (
            <div
              key={t}
              className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-white/80">
                    {PLATFORMS[t].label}
                  </span>
                  {card.source === "claude" ? (
                    <span className="text-[9px] uppercase tracking-wider text-primary-bright">
                      AI
                    </span>
                  ) : card.source === "local" ? (
                    <span className="text-[9px] uppercase tracking-wider text-white/35">
                      auto
                    </span>
                  ) : null}
                </div>
                <span
                  className={
                    over
                      ? "text-[10px] tabular-nums text-danger"
                      : "text-[10px] tabular-nums text-white/40"
                  }
                >
                  {card.text.length} / {limit.toLocaleString()}
                </span>
              </div>
              {card.state === "loading" ? (
                <div className="text-[11px] text-white/45">Rewriting…</div>
              ) : card.state === "error" ? (
                <div className="text-[11px] text-danger">{card.error}</div>
              ) : card.text ? (
                <div className="text-[11px] text-white/80 whitespace-pre-wrap leading-relaxed min-h-[60px]">
                  {card.text}
                </div>
              ) : (
                <div className="text-[11px] text-white/35 min-h-[60px]">
                  Type in the draft to preview.
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                {claudeAvailable ? (
                  <button
                    onClick={() => runClaude(t)}
                    disabled={!content.trim() || card.state === "loading"}
                    className="px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
                  >
                    {card.source === "claude" ? "Re-run AI" : "Rewrite with AI"}
                  </button>
                ) : (
                  <span className="text-[10px] text-white/30">auto only</span>
                )}
                <button
                  onClick={() => copy(t, card.text)}
                  disabled={!card.text.trim()}
                  className="px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/80 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
                >
                  Copy
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
