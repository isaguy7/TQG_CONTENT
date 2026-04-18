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

const SUGGESTED_SLOTS: Record<string, Array<{ label: string; dayOffset: number; hour: number; minute: number }>> = {
  linkedin: [
    { label: "Tue 08:00 BST (best)", dayOffset: 2, hour: 8, minute: 0 },
    { label: "Wed 08:30 BST", dayOffset: 3, hour: 8, minute: 30 },
    { label: "Thu 09:00 BST", dayOffset: 4, hour: 9, minute: 0 },
  ],
  x: [
    { label: "Today 12:00 BST", dayOffset: 0, hour: 12, minute: 0 },
    { label: "Tomorrow 12:00 BST", dayOffset: 1, hour: 12, minute: 0 },
  ],
  instagram: [
    { label: "Today 19:00 BST", dayOffset: 0, hour: 19, minute: 0 },
    { label: "Tomorrow 11:00 BST", dayOffset: 1, hour: 11, minute: 0 },
  ],
  facebook: [{ label: "Tomorrow 13:00 BST", dayOffset: 1, hour: 13, minute: 0 }],
};

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function nextSlot(dayOffset: number, hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setDate(now.getDate() + dayOffset);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

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
      </div>

      {(SUGGESTED_SLOTS[platform] || []).length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
          <span className="uppercase tracking-wider">Best times</span>
          {(SUGGESTED_SLOTS[platform] || []).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setSchedule("custom");
                setCustomDate(
                  formatLocalDateTime(nextSlot(s.dayOffset, s.hour, s.minute))
                );
              }}
              className="px-2 py-0.5 rounded border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
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
