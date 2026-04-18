import { PageShell } from "@/components/PageShell";
import { MetricCard } from "@/components/MetricCard";
import { RecentPostsList, type RecentPost } from "@/components/RecentPostsList";
import { HookPerformance } from "@/components/WeeklyTargets";
import {
  LiveWeeklyAndAlerts,
  FigureRecommendation,
} from "@/components/DashboardLive";
import { IntegrationsBar } from "@/components/IntegrationsBar";
import { TypefullyAutoSync } from "@/components/TypefullyAutoSync";
import Link from "next/link";

const recentPosts: RecentPost[] = [
  {
    id: "1",
    title: "Every Quran on earth goes back to one man's decision",
    date: "Apr 14",
    platform: "LinkedIn",
    impressions: 7196,
    engagementRate: 4.8,
    tier1: true,
  },
  {
    id: "2",
    title: "They feared his hands when he raised them",
    date: "Apr 11",
    platform: "LinkedIn",
    impressions: 3120,
    engagementRate: 3.9,
    tier1: true,
  },
  {
    id: "3",
    title: "Khalid ibn al-Walid was one of the greatest commanders",
    date: "Apr 9",
    platform: "LinkedIn",
    impressions: 542,
    engagementRate: 1.2,
    tier1: false,
  },
  {
    id: "4",
    title: "The Battle of Badr changed everything",
    date: "Apr 6",
    platform: "TQG Page",
    impressions: 412,
    engagementRate: 1.5,
    tier1: false,
  },
  {
    id: "5",
    title: "Show me where the marketplace is",
    date: "Apr 3",
    platform: "LinkedIn",
    impressions: 2034,
    engagementRate: 3.4,
    tier1: true,
  },
];

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Lifetime and weekly metrics across every platform"
    >
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Lifetime impressions"
          value="142.8k"
          hint="All platforms combined"
        />
        <MetricCard
          label="Total followers"
          value="2,453"
          hint="LinkedIn + TQG + X + IG/FB"
        />
        <MetricCard
          label="This week"
          value="12.4k"
          delta="+18.3%"
          deltaDirection="up"
          hint="Impressions vs last week"
        />
        <MetricCard
          label="Engagement rate"
          value="3.2%"
          delta="+0.4%"
          deltaDirection="up"
          hint="7-day avg vs prior 7-day"
        />
      </section>

      <section className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="section-label">Connected platforms</span>
          <Link
            href="/settings"
            className="text-[11px] text-white/40 hover:text-white/70"
          >
            Manage in Settings →
          </Link>
        </div>
        <IntegrationsBar />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <RecentPostsList posts={recentPosts} />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <LiveWeeklyAndAlerts />
          <HookPerformance tier1Avg={4117} tier2Avg={475} />
          <FigureRecommendation />
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="section-label mb-3">Quick create</div>
            <div className="space-y-1.5">
              <QuickLink href="/content/new" label="New post" />
              <QuickLink href="/clips/new" label="New clip batch" />
              <QuickLink href="/content/new?video=1" label="Transcribe video" />
            </div>
          </div>
          <TypefullyAutoSync />
        </div>
      </section>
    </PageShell>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.04] text-[13px] text-white/70 hover:text-white/90 transition-colors"
    >
      <span>{label}</span>
      <span className="text-white/25">→</span>
    </Link>
  );
}
