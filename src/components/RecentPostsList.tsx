import Link from "next/link";
import { cn } from "@/lib/utils";

export type RecentPost = {
  id: string;
  title: string;
  date: string;
  platform: "LinkedIn" | "X" | "TQG Page" | "Instagram" | "Facebook";
  impressions: number;
  engagementRate: number;
  tier1: boolean;
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function RecentPostsList({ posts }: { posts: RecentPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.05] border border-white/[0.08] p-5 backdrop-blur-md text-center">
        <div className="text-[13px] text-white/85 mb-1">
          Your workspace is clear.
        </div>
        <div className="text-[12px] text-white/55">
          Capture an idea or publish a post to see performance here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Recent posts</span>
        <Link
          href="/content"
          className="text-[11px] text-white/40 hover:text-white/70"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-1">
        {posts.map((p) => (
          <li key={p.id}>
            <Link
              href={`/content/${p.id}`}
              className={cn(
                "flex items-center gap-3 py-2 pl-3 pr-2 rounded hover:bg-white/[0.03] transition-colors",
                p.tier1
                  ? "border-l-2 border-primary-hover"
                  : "border-l-2 border-white/[0.08]"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-white/85 truncate">
                  {p.title}
                </div>
                <div className="text-[11px] text-white/35 mt-0.5">
                  {p.date} · {p.platform}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] text-white/80 tabular-nums">
                  {formatNumber(p.impressions)}
                </div>
                <div className="text-[11px] text-white/35 tabular-nums">
                  {p.engagementRate.toFixed(1)}%
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
