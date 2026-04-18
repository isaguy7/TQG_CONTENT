"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { GapAlert } from "@/components/GapAlert";
import { cn } from "@/lib/utils";

type LocalPost = {
  id: string;
  title: string | null;
  platform: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  figure_id: string | null;
  labels: string[] | null;
  source: "local";
  typefully?: boolean;
};

type TypefullyDraftView = {
  id: string;
  title: string;
  platform: string;
  scheduled_for: string | null;
  share_url: string | null;
  source: "typefully";
};

type CalendarItem = LocalPost | TypefullyDraftView;

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
  posts: LocalPost[];
  typefully_drafts: TypefullyDraftView[];
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
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

    const allItems: CalendarItem[] = [...data.posts, ...data.typefully_drafts];

    const cells: Array<{
      date: Date | null;
      items: CalendarItem[];
    }> = [];

    // leading blanks
    for (let i = 0; i < startDow; i++) cells.push({ date: null, items: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month, d));
      const dayItems = allItems.filter((p) => {
        const raw =
          p.source === "local"
            ? p.published_at || p.scheduled_for
            : p.scheduled_for;
        if (!raw) return false;
        const pd = new Date(raw);
        return (
          pd.getUTCFullYear() === date.getUTCFullYear() &&
          pd.getUTCMonth() === date.getUTCMonth() &&
          pd.getUTCDate() === date.getUTCDate()
        );
      });
      cells.push({ date, items: dayItems });
    }
    // trailing blanks to complete final week
    while (cells.length % 7 !== 0) cells.push({ date: null, items: [] });
    return cells;
  }, [data]);

  const movePost = useCallback(
    async (postId: string, dateStr: string) => {
      setMoveError(null);
      // Preserve existing time of day if present, otherwise default 08:00 UTC.
      const post =
        data?.posts.find((p) => p.id === postId) || null;
      let isoTime = "T08:00:00.000Z";
      const prev = post?.scheduled_for || post?.published_at;
      if (prev) {
        const d = new Date(prev);
        if (!isNaN(d.getTime())) {
          isoTime = `T${String(d.getUTCHours()).padStart(2, "0")}:${String(
            d.getUTCMinutes()
          ).padStart(2, "0")}:00.000Z`;
        }
      }
      const newScheduled = `${dateStr}${isoTime}`;
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_for: newScheduled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMoveError((j as { error?: string }).error || `HTTP ${res.status}`);
        setTimeout(() => setMoveError(null), 3000);
        return;
      }
      load();
    },
    [data, load]
  );

  const onDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
  };
  const onDragOver = (dateStr: string) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== dateStr) setDropTarget(dateStr);
  };
  const onDrop = (dateStr: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setDropTarget(null);
    if (!id) return;
    movePost(id, dateStr);
  };

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


          {moveError ? (
            <div className="rounded-lg bg-danger/[0.08] border border-danger/30 p-3 text-[12px] text-danger">
              Move failed: {moveError}
            </div>
          ) : null}

          <div className="flex items-center gap-3 text-[11px] text-white/45">
            <span>Drag local posts to reschedule.</span>
            {data.typefully_drafts.length > 0 ? (
              <span>
                {data.typefully_drafts.length} Typefully draft
                {data.typefully_drafts.length === 1 ? "" : "s"} shown (manage in
                Typefully).
              </span>
            ) : null}
          </div>

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
                const isDropTarget = dropTarget === dateStr;
                return (
                  <div
                    key={dateStr}
                    onDragOver={onDragOver(dateStr)}
                    onDrop={onDrop(dateStr)}
                    onDragLeave={() => {
                      if (dropTarget === dateStr) setDropTarget(null);
                    }}
                    className={cn(
                      "min-h-[96px] p-1.5 border-r border-b border-white/[0.04] text-[11px]",
                      isToday && "ring-1 ring-primary-bright/40 bg-primary/5",
                      isDropTarget &&
                        "ring-2 ring-primary-bright/80 bg-primary/10"
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
                    </div>
                    <div className="space-y-0.5">
                      {c.items.length === 0 ? (
                        <Link
                          href={`/content/new?date=${dateStr}`}
                          className="block text-[10px] text-white/25 hover:text-white/60 border border-dashed border-white/[0.06] rounded px-1 py-0.5 text-center"
                        >
                          + New post
                        </Link>
                      ) : (
                        c.items.map((item) => {
                          if (item.source === "typefully") {
                            return (
                              <a
                                key={item.id}
                                href={item.share_url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Typefully draft — ${item.title}`}
                                className={cn(
                                  "block text-[10px] px-1 py-0.5 rounded border truncate italic",
                                  PLATFORM_COLORS[item.platform] ||
                                    "bg-white/[0.05] text-white/70 border-white/[0.1]"
                                )}
                              >
                                <span className="text-[9px] mr-1 opacity-60">
                                  TF
                                </span>
                                {item.title}
                              </a>
                            );
                          }
                          const isDragging = dragId === item.id;
                          return (
                            <Link
                              key={item.id}
                              href={`/content/${item.id}`}
                              draggable
                              onDragStart={onDragStart(item.id)}
                              onDragEnd={onDragEnd}
                              className={cn(
                                "block text-[10px] px-1 py-0.5 rounded border truncate cursor-grab active:cursor-grabbing",
                                PLATFORM_COLORS[item.platform] ||
                                  "bg-white/[0.05] text-white/70 border-white/[0.1]",
                                isDragging && "opacity-40"
                              )}
                              title={item.title || "(untitled)"}
                            >
                              {item.typefully ? (
                                <span className="text-[9px] mr-1 opacity-60">
                                  TF
                                </span>
                              ) : null}
                              {item.title || "(untitled)"}
                            </Link>
                          );
                        })
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

          {data.alerts.length > 0 ? (
            <GapAlert messages={data.alerts.map((a) => a.message)} />
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
