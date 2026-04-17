"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  FileText,
  CheckCircle2,
  Users,
  BookOpen,
  TrendingUp,
} from "lucide-react";

type DashboardStats = {
  posts: {
    total: number;
    by_status: Record<string, number>;
    published_this_week: number;
  };
  figures: { total: number; posted_about: number; this_week: number };
  hadith: { attached_total: number; corpus_total: number };
  quran: { ayahs: number };
};

export function DashboardMetrics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
        Stats failed: {error}
      </div>
    );
  }
  if (!stats) {
    return <MetricsSkeleton />;
  }

  const inProgress =
    (stats.posts.by_status.idea || 0) +
    (stats.posts.by_status.drafting || 0) +
    (stats.posts.by_status.review || 0);
  const readyOrScheduled =
    (stats.posts.by_status.ready || 0) +
    (stats.posts.by_status.scheduled || 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Metric
        label="Posts total"
        value={stats.posts.total}
        hint={`${stats.posts.by_status.published || 0} published`}
        icon={FileText}
        href="/content"
      />
      <Metric
        label="In progress"
        value={inProgress}
        hint="ideas + drafting + review"
        icon={TrendingUp}
        accent
        href="/content"
      />
      <Metric
        label="Ready / scheduled"
        value={readyOrScheduled}
        hint="queued to go out"
        icon={CheckCircle2}
        href="/content"
      />
      <Metric
        label="Published this week"
        value={stats.posts.published_this_week}
        hint={`${stats.figures.this_week} figures covered`}
        icon={TrendingUp}
      />
      <Metric
        label="Figures"
        value={stats.figures.total}
        hint={`${stats.figures.posted_about} posted about`}
        icon={Users}
        href="/figures"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof FileText;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        accent
          ? "bg-primary/10 border-primary/25 hover:border-primary/50"
          : "bg-white/[0.04] border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.06]"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="section-label">{label}</span>
        <Icon
          className={cn(
            "w-3.5 h-3.5",
            accent ? "text-primary-bright" : "text-white/30"
          )}
        />
      </div>
      <div
        className={cn(
          "text-[28px] font-semibold tracking-tight tabular-nums leading-none",
          accent ? "text-primary-bright" : "text-white/95"
        )}
      >
        {value.toLocaleString()}
      </div>
      {hint ? (
        <div className="mt-2 text-[11px] text-white/45">{hint}</div>
      ) : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 h-[104px]"
        >
          <div className="h-2 bg-white/[0.04] rounded w-20 mb-3" />
          <div className="h-7 bg-white/[0.04] rounded w-12 mb-3" />
          <div className="h-2 bg-white/[0.03] rounded w-24" />
        </div>
      ))}
    </div>
  );
}

export function ConnectPlatformCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <ConnectCard
        platform="LinkedIn"
        description="See real impressions, follower counts, and engagement for LinkedIn personal + TQG Page."
        cta="Connect LinkedIn"
      />
      <ConnectCard
        platform="X (Twitter)"
        description="Surface X analytics, best-performing tweets, and follower growth."
        cta="Connect X"
      />
      <ConnectCard
        platform="Instagram + Facebook"
        description="Track Reels reach and cross-posted performance via Meta Business."
        cta="Connect Meta"
      />
      <TypefullyCard />
    </div>
  );
}

function ConnectCard({
  platform,
  description,
  cta,
}: {
  platform: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-dashed border-white/[0.12] p-4 flex flex-col">
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-white/85 mb-1">
          {platform}
        </div>
        <p className="text-[12px] text-white/50 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        disabled
        className="mt-3 text-[11px] font-medium text-white/40 px-2 py-1 rounded border border-white/[0.08] self-start cursor-not-allowed"
        title="OAuth integration not built yet"
      >
        {cta} · soon
      </button>
    </div>
  );
}

type TypefullyActivity = {
  available: boolean;
  reason?: string;
  published?: Array<{ id: string | number; scheduled_date?: string | null }>;
  scheduled?: Array<{ id: string | number; scheduled_date?: string | null }>;
};

function TypefullyCard() {
  const [data, setData] = useState<TypefullyActivity | null>(null);
  useEffect(() => {
    fetch("/api/typefully/activity")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ available: false, reason: "fetch_error" }));
  }, []);

  return (
    <div
      className={cn(
        "rounded-lg p-4 border flex flex-col",
        data?.available
          ? "bg-primary/10 border-primary/30"
          : "bg-white/[0.03] border-dashed border-white/[0.12]"
      )}
    >
      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <BookOpen
            className={cn(
              "w-3.5 h-3.5",
              data?.available ? "text-primary-bright" : "text-white/30"
            )}
          />
          <div className="text-[13px] font-semibold text-white/85">
            Typefully
          </div>
        </div>
        {data?.available ? (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="text-[18px] font-semibold text-white/95 tabular-nums">
                {data.scheduled?.length || 0}
              </span>
              <span className="text-white/50">scheduled</span>
            </div>
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="text-[18px] font-semibold text-white/95 tabular-nums">
                {data.published?.length || 0}
              </span>
              <span className="text-white/50">recently published</span>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-white/50 leading-relaxed">
            Schedule and publish drafts directly. Set{" "}
            <code className="font-mono text-[11px]">TYPEFULLY_API_KEY</code> in
            .env.local.
          </p>
        )}
      </div>
    </div>
  );
}
