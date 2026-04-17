"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    labels: string[] | null;
  }>;
  month: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "bg-sky-500/20 text-sky-300 border-sky-400/30",
  x: "bg-white/10 text-white/80 border-white/20",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-400/30",
  facebook: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
};

function parseMonth(m: string): { year: number; month: number } {
  const [y, mm] = m.split("-").map(Number);
  return { year: y, month: mm - 1 };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarResp | null>(null);
  const today = useMemo(() => new Date(), []);
  const [monthKey, setMonthKey] = useState(
    formatMonth(today.getUTCFullYear(), today.getUTCMonth())
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/calendar?month=${monthKey}`);
    const j = (await res.json()) as CalendarResp;
    setData(j);
  }, [monthKey]);

  useEffect(() => {
    load();
  }, [load]);

  const grid = useMemo(() => {
    if (!data) return null;
    const { year, month } = parseMonth(data.month);
    const first = new Date(Date.UTC(year, month, 1));
    const startDow = (first.getUTCDay() + 6) % 7; // Mon-start
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const cells: Array<{
      date: Date | null;
      posts: typeof data.posts;
    }> = [];

    // leading blanks
    for (let i = 0; i < startDow; i++) cells.push({ date: null, posts: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month, d));
      const dayPosts = data.posts.filter((p) => {
        const raw = p.published_at || p.scheduled_for;
        if (!raw) return false;
        const pd = new Date(raw);
        return (
          pd.getUTCFullYear() === date.getUTCFullYear() &&
          pd.getUTCMonth() === date.getUTCMonth() &&
          pd.getUTCDate() === date.getUTCDate()
        );
      });
      cells.push({ date, posts: dayPosts });
    }
    // trailing blanks to complete final week
    while (cells.length % 7 !== 0) cells.push({ date: null, posts: [] });
    return cells;
  }, [data]);

  // Flag days where >3 days passed with no LinkedIn post.
  const staleDays = useMemo(() => {
    if (!data || !grid) return new Set<string>();
    const stale = new Set<string>();
    // Find every day cell that is in the past and count days since last
    // LinkedIn activity; flag if >= 3.
    const todayMid = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate()
      )
    );
    const liDates = data.posts
      .filter((p) => p.platform === "linkedin")
      .map((p) => new Date(p.published_at || p.scheduled_for || 0))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    for (const c of grid) {
      if (!c.date) continue;
      if (c.date.getTime() > todayMid.getTime()) continue;
      const lastBefore = liDates
        .filter((d) => d.getTime() <= c.date!.getTime())
        .pop();
      const days = lastBefore
        ? Math.floor(
            (c.date.getTime() - lastBefore.getTime()) / (24 * 3600 * 1000)
          )
        : Math.floor(
            (c.date.getTime() - todayMid.getTime() + 30 * 24 * 3600 * 1000) /
              (24 * 3600 * 1000)
          );
      if (days >= 3) stale.add(c.date.toISOString().slice(0, 10));
    }
    return stale;
  }, [data, grid, today]);

  const nextMonth = () => {
    const { year, month } = parseMonth(monthKey);
    const next = new Date(Date.UTC(year, month + 1, 1));
    setMonthKey(formatMonth(next.getUTCFullYear(), next.getUTCMonth()));
  };
  const prevMonth = () => {
    const { year, month } = parseMonth(monthKey);
    const prev = new Date(Date.UTC(year, month - 1, 1));
    setMonthKey(formatMonth(prev.getUTCFullYear(), prev.getUTCMonth()));
  };

  const monthLabel = useMemo(() => {
    if (!data) return "";
    const { year, month } = parseMonth(data.month);
    return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  }, [data]);

  return (
    <PageShell
      title="Calendar"
      description="Month grid, gap alerts, weekly targets"
      actions={
        <>
          <button
            onClick={prevMonth}
            className="px-2 py-1 rounded text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
          >
            ←
          </button>
          <span className="text-[13px] text-white/80 px-2 min-w-[120px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="px-2 py-1 rounded text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
          >
            →
          </button>
        </>
      }
    >
      {!data ? (
        <div className="text-[13px] text-white/40">Loading calendar…</div>
      ) : (
        <div className="space-y-4">
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TargetBar
              label="LinkedIn originals"
              actual={data.calendar.linkedin_originals_actual}
              target={data.calendar.linkedin_originals_target}
            />
            <TargetBar
              label="TQG reposts"
              actual={data.calendar.tqg_reposts_actual}
              target={data.calendar.tqg_reposts_target}
            />
            <TargetBar
              label="X tweets"
              actual={data.calendar.x_posts_actual}
              target={data.calendar.x_posts_target}
            />
            <TargetBar
              label="X clips"
              actual={data.calendar.x_video_clips_actual}
              target={data.calendar.x_video_clips_target}
            />
          </section>

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

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-7 bg-white/[0.03] border-b border-white/[0.06]">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/45 text-center"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid?.map((c, i) => {
                if (!c.date) {
                  return (
                    <div
                      key={`blank-${i}`}
                      className="min-h-[96px] border-r border-b border-white/[0.04] bg-white/[0.01]"
                    />
                  );
                }
                const dateStr = c.date.toISOString().slice(0, 10);
                const isToday =
                  dateStr ===
                  today.toISOString().slice(0, 10);
                const isPast = c.date < today;
                const isStale = staleDays.has(dateStr);
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "min-h-[96px] p-1.5 border-r border-b border-white/[0.04] text-[11px]",
                      isToday && "ring-1 ring-primary-bright/40 bg-primary/5",
                      isStale &&
                        c.posts.length === 0 &&
                        "bg-amber-500/[0.05]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "tabular-nums",
                          isToday
                            ? "text-primary-bright font-semibold"
                            : "text-white/65"
                        )}
                      >
                        {c.date.getUTCDate()}
                      </span>
                      {isStale && c.posts.length === 0 ? (
                        <span
                          className="text-[9px] text-amber-300/80"
                          title="3+ days without LinkedIn activity"
                        >
                          !
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-0.5">
                      {c.posts.length === 0 ? (
                        !isPast ? (
                          <Link
                            href={`/content/new?date=${dateStr}`}
                            className="block text-[10px] text-white/25 hover:text-white/60 border border-dashed border-white/[0.06] rounded px-1 py-0.5 text-center"
                          >
                            +
                          </Link>
                        ) : null
                      ) : (
                        c.posts.map((p) => (
                          <Link
                            key={p.id}
                            href={`/content/${p.id}`}
                            className={cn(
                              "block text-[10px] px-1 py-0.5 rounded border truncate",
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
          </div>

          {data.calendar.figures_covered.length > 0 ? (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="section-label mb-2">
                Figures covered this week
              </div>
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

function TargetBar({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const done = actual >= target;
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] text-white/50">{label}</div>
        <div
          className={cn(
            "text-[13px] font-semibold tabular-nums",
            done ? "text-primary-bright" : "text-white/85"
          )}
        >
          {actual}/{target}
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            done ? "bg-primary-bright" : "bg-white/50"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
