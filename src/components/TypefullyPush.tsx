"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type PushResp = {
  drafts: Array<{
    platform: string;
    content: string;
    available: boolean;
    reason?: string;
    draftId?: string | number;
    shareUrl?: string | null;
  }>;
};

type Schedule = "draft" | "next-free-slot" | "custom";

export function TypefullyPush({
  postId,
  content,
  platform,
  imageUrl,
  onScheduled,
}: {
  postId: string;
  content: string;
  platform: string;
  imageUrl?: string | null;
  onScheduled?: () => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [schedule, setSchedule] = useState<Schedule>("draft");
  const [customDate, setCustomDate] = useState<string>("");
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<PushResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/typefully/status")
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

  if (available === null || available === false) return null;

  const doPush = async (mode: "single" | "multi") => {
    if (!content.trim()) {
      setError("Draft is empty.");
      return;
    }
    setPushing(true);
    setError(null);
    try {
      const scheduleValue =
        schedule === "draft"
          ? undefined
          : schedule === "next-free-slot"
            ? "next-free-slot"
            : customDate
              ? new Date(customDate).toISOString()
              : undefined;

      // Typefully doesn't expose a media upload endpoint on v1 yet — we
      // append the image URL to the draft body so the scheduler can see it.
      const composed = imageUrl
        ? `${content}\n\nImage: ${imageUrl}`
        : content;

      const res = await fetch("/api/typefully/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: postId,
          mode,
          content: composed,
          platform,
          schedule: scheduleValue,
          image_url: imageUrl,
        }),
      });
      const j: PushResp = await res.json();
      setResult(j);
      if (j.drafts.some((d) => d.available) && onScheduled) onScheduled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPushing(false);
    }
  };

  return (
    <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Push to Typefully</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        <label className="flex items-center gap-2">
          <span className="text-white/50">Schedule:</span>
          <select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as Schedule)}
            className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
          >
            <option value="draft">Save as draft</option>
            <option value="next-free-slot">Next free slot</option>
            <option value="custom">Custom time…</option>
          </select>
        </label>
        {schedule === "custom" ? (
          <input
            type="datetime-local"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
          />
        ) : null}
        <div className="flex-1" />
        <button
          onClick={() => doPush("single")}
          disabled={pushing}
          className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/85 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
        >
          {pushing ? "Pushing…" : "Push this platform"}
        </button>
        <button
          onClick={() => doPush("multi")}
          disabled={pushing}
          className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          Push to all platforms
        </button>
      </div>

      {error ? <div className="text-[12px] text-danger mb-2">{error}</div> : null}

      {result ? (
        <ul className="space-y-1">
          {result.drafts.map((d, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center justify-between gap-3 p-2 rounded text-[12px] border",
                d.available
                  ? "bg-emerald-500/[0.06] border-emerald-400/20"
                  : "bg-danger/[0.06] border-danger/20"
              )}
            >
              <span className="font-medium text-white/80 uppercase tracking-wider text-[10px]">
                {d.platform}
              </span>
              <span className="flex-1 truncate text-white/70">
                {d.available
                  ? d.shareUrl || `Draft #${d.draftId}`
                  : d.reason}
              </span>
              {d.shareUrl ? (
                <a
                  href={d.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] underline underline-offset-2 text-white/70 hover:text-white"
                >
                  Open
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
