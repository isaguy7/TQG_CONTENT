"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";

type CalendarResp = {
  calendar: {
    week_start: string;
    linkedin_originals_target: number;
    linkedin_originals_actual: number;
    tqg_reposts_target: number;
    tqg_reposts_actual: number;
    x_posts_target: number;
    x_posts_actual: number;
    x_video_clips_target: number;
    x_video_clips_actual: number;
    figures_covered: string[];
    topics_covered: string[];
  };
  alerts: Array<{ kind: string; message: string }>;
  posts: Array<{
    id: string;
    title: string | null;
    platform: string;
    status: string;
    scheduled_for: string | null;
    published_at: string | null;
    figure_id: string | null;
  }>;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "bg-sky-500/20 text-sky-300 border-sky-400/30",
  x: "bg-white/10 text-white/80 border-white/20",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-400/30",
  facebook: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
};

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const grid = useMemo(() => {
    if (!data) return null;
    const start = new Date(data.calendar.week_start + "T00:00:00Z");
    const days: Array<{ date: Date; posts: typeof data.posts }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const dayPosts = data.posts.filter((p) => {
        const raw = p.published_at || p.scheduled_for;
        if (!raw) return false;
        const pd = new Date(raw);
        return (
          pd.getUTCFullYear() === d.getUTCFullYear() &&
          pd.getUTCMonth() === d.getUTCMonth() &&
          pd.getUTCDate() === d.getUTCDate()
        );
      });
      days.push({ date: d, posts: dayPosts });
    }
    return days;
  }, [data]);

  return (
    <PageShell
      title="Calendar"
      description="Weekly grid, gap alerts, live counters"
    >
      {error ? (
        <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
          Failed to load calendar: {error}
        </div>
      ) : !data ? (
        <div className="text-[13px] text-white/40">Loading calendar…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[13px] text-white/70">
              Week of{" "}
              <span className="text-white/95 font-medium">
                {formatWeek(data.calendar.week_start)}
              </span>
            </div>
            <Link
              href="/content/new"
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              + New post
            </Link>
          </div>
          {data.alerts.length > 0 ? (
            <div className="rounded-lg bg-amber-500/[0.08] border border-amber-400/30 p-3 space-y-1">
              <div className="section-label text-amber-200">Gap alerts</div>
              {data.alerts.map((a, i) => (
                <div key={i} className="text-[12px] text-amber-100/85">
                  · {a.message}
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-7 gap-2">
            {grid?.map((d, i) => {
              const dateStr = d.date.toISOString().slice(0, 10);
              return (
                <div
                  key={dateStr}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2 min-h-[140px]"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-white/50">
                      {DAYS[i]}
                    </span>
                    <span className="text-[11px] tabular-nums text-white/70">
                      {d.date.getUTCDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {d.posts.length === 0 ? (
                      <Link
                        href="/content/new"
                        className="block text-[10px] text-white/30 hover:text-white/60 border border-dashed border-white/[0.08] rounded px-1.5 py-1 text-center"
                      >
                        + Post
                      </Link>
                    ) : (
                      d.posts.map((p) => (
                        <Link
                          key={p.id}
                          href={`/content/${p.id}`}
                          className={cn(
                            "block text-[11px] px-1.5 py-1 rounded border truncate",
                            PLATFORM_COLORS[p.platform] ||
                              "bg-white/[0.05] text-white/70 border-white/[0.1]"
                          )}
                          title={p.title || "(untitled)"}
                        >
                          {p.title || "(untitled)"}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TargetBox
              label="LinkedIn originals"
              actual={data.calendar.linkedin_originals_actual}
              target={data.calendar.linkedin_originals_target}
            />
            <TargetBox
              label="TQG reposts"
              actual={data.calendar.tqg_reposts_actual}
              target={data.calendar.tqg_reposts_target}
            />
            <TargetBox
              label="X tweets"
              actual={data.calendar.x_posts_actual}
              target={data.calendar.x_posts_target}
            />
            <TargetBox
              label="X clips"
              actual={data.calendar.x_video_clips_actual}
              target={data.calendar.x_video_clips_target}
            />
          </div>

          {data.calendar.figures_covered.length > 0 ? (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="section-label mb-2">Figures covered this week</div>
              <div className="flex flex-wrap gap-1.5">
                {data.calendar.figures_covered.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/70"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

function formatWeek(iso: string): string {
  try {
    const start = new Date(iso + "T00:00:00Z");
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    return `${fmt(start)} – ${fmt(end)}`;
  } catch {
    return iso;
  }
}

function TargetBox({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number;
}) {
  const done = actual >= target;
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[11px] text-white/50 mb-1">{label}</div>
      <div
        className={cn(
          "text-[16px] font-semibold tabular-nums",
          done ? "text-primary-bright" : "text-white/85"
        )}
      >
        {actual}/{target}
      </div>
    </div>
  );
}
