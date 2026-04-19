import { PageShell } from "@/components/PageShell";
import { MetricCard } from "@/components/MetricCard";
import { RecentPostsList, type RecentPost } from "@/components/RecentPostsList";
import { HookPerformance } from "@/components/WeeklyTargets";
import {
  LiveWeeklyAndAlerts,
  FigureRecommendation,
} from "@/components/DashboardLive";
import { IntegrationsBar } from "@/components/IntegrationsBar";
import { ClaudeStatusCard } from "@/components/ClaudeStatusCard";
import { ProviderTokenCapture } from "@/components/ProviderTokenCapture";
import { TypefullyAutoSync } from "@/components/TypefullyAutoSync";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server";
import { listConnections } from "@/lib/oauth-connections";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const conns = user ? await listConnections(user.id) : [];
  const hasActiveConnection = conns.some((c) => c.status === "active");

  const noConnHint = "Connect LinkedIn or X in Settings";

  return (
    <PageShell
      title="Dashboard"
      description="Lifetime and weekly metrics across every platform"
    >
      <ProviderTokenCapture />
      <TypefullyAutoSync />
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Lifetime impressions"
          value={hasActiveConnection ? "142.8k" : "—"}
          hint={hasActiveConnection ? "All platforms combined" : noConnHint}
        />
        <MetricCard
          label="Total followers"
          value={hasActiveConnection ? "2,453" : "—"}
          hint={
            hasActiveConnection
              ? "LinkedIn + TQG + X + IG/FB"
              : noConnHint
          }
        />
        <MetricCard
          label="This week"
          value={hasActiveConnection ? "12.4k" : "—"}
          delta={hasActiveConnection ? "+18.3%" : undefined}
          deltaDirection={hasActiveConnection ? "up" : undefined}
          hint={
            hasActiveConnection ? "Impressions vs last week" : noConnHint
          }
        />
        <MetricCard
          label="Engagement rate"
          value={hasActiveConnection ? "3.2%" : "—"}
          delta={hasActiveConnection ? "+0.4%" : undefined}
          deltaDirection={hasActiveConnection ? "up" : undefined}
          hint={
            hasActiveConnection
              ? "7-day avg vs prior 7-day"
              : noConnHint
          }
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
          {hasActiveConnection ? (
            <RecentPostsList posts={recentPosts} />
          ) : (
            <div className="rounded-2xl bg-white/[0.05] border border-white/[0.08] p-5 backdrop-blur-md shadow-lg shadow-black/20 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/40 mb-2">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="section-label mb-2">Recent posts</div>
              <p className="text-[13px] text-white/70 leading-relaxed">
                Your dashboard is quiet. Connect LinkedIn or X in{" "}
                <Link
                  href="/settings"
                  className="underline underline-offset-2 text-white/85 hover:text-white"
                >
                  Settings
                </Link>{" "}
                and capture an idea to fill this space.
              </p>
            </div>
          )}
        </div>
        <div className="lg:col-span-2 space-y-3">
          <LiveWeeklyAndAlerts />
          {hasActiveConnection ? (
            <HookPerformance tier1Avg={4117} tier2Avg={475} />
          ) : null}
          <FigureRecommendation />
          <ClaudeStatusCard />
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
            <div className="section-label mb-3">Quick create</div>
            <div className="space-y-1.5">
              <QuickLink href="/content/new" label="New post" />
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
