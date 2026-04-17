"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WeeklyTargets } from "@/components/WeeklyTargets";
import { GapAlert } from "@/components/GapAlert";

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
  };
  alerts: Array<{ kind: string; message: string }>;
};

type Recommendation = {
  id: string;
  name_en: string;
  name_ar?: string | null;
  title?: string | null;
  type: string;
  reason: string;
};

export function LiveWeeklyAndAlerts() {
  const [calendar, setCalendar] = useState<CalendarResp | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then(setCalendar)
      .catch(() => setCalendar(null));
  }, []);

  if (!calendar) return null;
  const c = calendar.calendar;
  return (
    <>
      <WeeklyTargets
        targets={[
          {
            label: "LinkedIn originals",
            actual: c.linkedin_originals_actual,
            target: c.linkedin_originals_target,
          },
          {
            label: "TQG reposts",
            actual: c.tqg_reposts_actual,
            target: c.tqg_reposts_target,
          },
          {
            label: "X tweets",
            actual: c.x_posts_actual,
            target: c.x_posts_target,
          },
          {
            label: "X clips",
            actual: c.x_video_clips_actual,
            target: c.x_video_clips_target,
          },
        ]}
      />
      {calendar.alerts.length > 0 ? (
        <GapAlert messages={calendar.alerts.map((a) => a.message)} />
      ) : null}
    </>
  );
}

export function FigureRecommendation() {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    fetch("/api/figures/recommend")
      .then((r) => r.json())
      .then((j) => setRecs(j.recommendations || []))
      .catch(() => setRecs([]));
  }, []);

  if (!recs) return null;
  if (recs.length === 0) return null;

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="section-label mb-3">Figure recommendation</div>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/figures`}
              className="block px-2 py-1.5 rounded border border-transparent hover:border-white/[0.08] hover:bg-white/[0.04]"
            >
              <div className="text-[12px] text-white/85 font-medium">
                {r.name_en}
                {r.name_ar ? (
                  <span className="ml-1 text-white/40 font-normal">
                    · {r.name_ar}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-white/40">{r.reason}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
