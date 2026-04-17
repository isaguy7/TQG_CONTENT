import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import {
  DashboardMetrics,
  ConnectPlatformCards,
} from "@/components/DashboardMetrics";
import { RecentPostsLive } from "@/components/RecentPostsLive";
import {
  LiveWeeklyAndAlerts,
  FigureRecommendation,
} from "@/components/DashboardLive";
import { ArrowRight, FileText, Film, Video } from "lucide-react";

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Live snapshot of your content pipeline"
    >
      <div className="space-y-5">
        <section>
          <div className="section-label mb-2">Pipeline</div>
          <DashboardMetrics />
        </section>

        <section>
          <div className="section-label mb-2">Platforms</div>
          <ConnectPlatformCards />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3">
            <RecentPostsLive />
          </div>
          <div className="lg:col-span-2 space-y-3">
            <LiveWeeklyAndAlerts />
            <FigureRecommendation />
            <QuickCreate />
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function QuickCreate() {
  const items: Array<{
    href: string;
    label: string;
    description: string;
    icon: typeof FileText;
  }> = [
    {
      href: "/content",
      label: "New post",
      description: "Start a draft for any platform",
      icon: FileText,
    },
    {
      href: "/clips/new",
      label: "New clip batch",
      description: "Match recitation to ayahs, render",
      icon: Film,
    },
    {
      href: "/video/new",
      label: "New video project",
      description: "Transcribe, match, extract clips",
      icon: Video,
    },
  ];
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-4">
      <div className="section-label mb-3">Quick create</div>
      <div className="space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3 px-2 py-2 rounded hover:bg-white/[0.04] transition-colors group"
            >
              <Icon className="w-4 h-4 text-white/50 group-hover:text-primary-bright transition-colors" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-white/85 group-hover:text-white">
                  {it.label}
                </div>
                <div className="text-[11px] text-white/40">
                  {it.description}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-white/25 group-hover:text-white/60 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
