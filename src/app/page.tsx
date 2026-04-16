import { PageShell } from "@/components/PageShell";
import { MetricCard } from "@/components/MetricCard";
import { PlatformCard } from "@/components/PlatformCard";
import { RecentPostsList, type RecentPost } from "@/components/RecentPostsList";
import { WeeklyTargets, HookPerformance } from "@/components/WeeklyTargets";
import { GapAlert } from "@/components/GapAlert";
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

const gapAlerts = [
  "No X clip posted in the last 3 days — algorithm momentum cooling.",
  "3 Sahabah posts in a row. Next post: surface a Prophet or scholar.",
  "TQG Page has 0 posts this week (target: 3).",
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

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <PlatformCard
          platform="LinkedIn Personal"
          handle="@isakhan"
          followers="1,900"
          metrics={[
            { label: "Impressions", value: "8.4k" },
            { label: "Clicks", value: "312" },
            { label: "Engagement", value: "3.8%" },
            { label: "Growth/wk", value: "+42" },
          ]}
        />
        <PlatformCard
          platform="TQG LinkedIn Page"
          handle="The Quran Group"
          followers="528"
          metrics={[
            { label: "Impressions", value: "2.1k" },
            { label: "Clicks", value: "48" },
            { label: "Engagement", value: "2.1%" },
            { label: "Growth/wk", value: "+11" },
          ]}
        />
        <PlatformCard
          platform="X / TQG"
          handle="@TheQuranGroup"
          followers="13"
          metrics={[
            { label: "Impressions", value: "1.2k" },
            { label: "Best tweet", value: "284" },
            { label: "Mode", value: "Singles" },
            { label: "Threads at", value: "1,000" },
          ]}
          footnote="Threads deferred until 1k followers. Daily single + image at 12pm BST."
          footnoteTone="muted"
        />
        <PlatformCard
          platform="Instagram / Facebook"
          handle="Cross-posted Reels"
          metrics={[
            { label: "Reels posted", value: "4" },
            { label: "Impressions", value: "708" },
            { label: "Strategy", value: "Cross-post" },
            { label: "Priority", value: "Low" },
          ]}
          footnote="Meta Business Suite scheduler."
          footnoteTone="muted"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <RecentPostsList posts={recentPosts} />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <WeeklyTargets
            targets={[
              { label: "LinkedIn originals", actual: 1, target: 2 },
              { label: "TQG reposts", actual: 2, target: 3 },
              { label: "X tweets", actual: 4, target: 7 },
              { label: "X clips", actual: 0, target: 3 },
              { label: "IG / FB Reels", actual: 0, target: 3 },
            ]}
          />
          <HookPerformance tier1Avg={4117} tier2Avg={475} />
          <GapAlert messages={gapAlerts} />
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="section-label mb-3">Quick create</div>
            <div className="space-y-1.5">
              <QuickLink href="/content/new" label="New post" />
              <QuickLink href="/clips/new" label="New clip batch" />
              <QuickLink href="/video/new" label="New video project" />
            </div>
          </div>
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
