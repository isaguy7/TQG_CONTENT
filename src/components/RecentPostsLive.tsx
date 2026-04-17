"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Post = {
  id: string;
  title: string | null;
  platform: string;
  status: "idea" | "drafting" | "review" | "ready" | "scheduled" | "published";
  updated_at: string;
  published_at: string | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
};

const STATUS_TONE: Record<Post["status"], string> = {
  idea: "bg-white/[0.06] text-white/55",
  drafting: "bg-warning/15 text-warning",
  review: "bg-warning/15 text-warning",
  ready: "bg-primary/20 text-primary-bright",
  scheduled: "bg-status-published/20 text-status-published",
  published: "bg-status-published/20 text-status-published",
};

export function RecentPostsLive() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/posts?limit=5")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => setPosts((j.posts as Post[]) || []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Recent posts</span>
        <Link
          href="/content"
          className="text-[11px] text-white/50 hover:text-white/85"
        >
          View all →
        </Link>
      </div>
      {error ? (
        <div className="text-[12px] text-danger">Load failed: {error}</div>
      ) : posts === null ? (
        <div className="text-[12px] text-white/40">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="text-[12px] text-white/40 py-2">
          No posts yet.{" "}
          <Link
            href="/content"
            className="text-primary-bright hover:underline underline-offset-2"
          >
            Create your first draft →
          </Link>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/content/${p.id}`}
                className="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-white/90 truncate">
                    {p.title || "Untitled"}
                  </div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    {PLATFORM_LABEL[p.platform] || p.platform} ·{" "}
                    {formatTime(p.published_at || p.updated_at)}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
                    STATUS_TONE[p.status]
                  )}
                >
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
