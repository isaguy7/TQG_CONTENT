"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/content", label: "Content" },
  { href: "/figures", label: "Figures" },
  { href: "/clips", label: "Clips" },
  { href: "/video", label: "Video" },
  { href: "/hadith", label: "References" },
  { href: "/calendar", label: "Calendar" },
  { href: "/convert", label: "Convert" },
  { href: "/settings", label: "Settings" },
];

type PostStatus =
  | "idea"
  | "drafting"
  | "review"
  | "ready"
  | "scheduled"
  | "published";

type RecentPost = {
  id: string;
  title: string | null;
  status: PostStatus;
  updated_at: string;
  deleted_at: string | null;
  labels: string[] | null;
};

const statusDot: Record<PostStatus, string> = {
  idea: "bg-white/25",
  drafting: "bg-amber-400",
  review: "bg-amber-400",
  ready: "bg-emerald-400",
  scheduled: "bg-sky-400",
  published: "bg-sky-400",
};

const statusLabel: Record<PostStatus, string> = {
  idea: "idea",
  drafting: "drafting",
  review: "review",
  ready: "ready",
  scheduled: "scheduled",
  published: "published",
};

export function Sidebar() {
  const pathname = usePathname();
  const [recent, setRecent] = useState<RecentPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/posts?limit=5")
        .then((r) => (r.ok ? r.json() : { posts: [] }))
        .then((j) => {
          if (cancelled) return;
          const items = (j.posts || []) as RecentPost[];
          setRecent(items.filter((p) => !p.deleted_at).slice(0, 5));
        })
        .catch(() => {
          if (!cancelled) setRecent([]);
        });
    };
    load();
    // Re-fetch when the user navigates back to the app or on interval so the
    // sidebar reflects new drafts created in other tabs.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  return (
    <aside className="w-48 shrink-0 bg-sidebar border-r border-white/[0.06] flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.06]">
        <span className="text-[13px] font-semibold tracking-tight text-white/90">
          TQG Studio
        </span>
      </div>

      <nav className="pt-3 pb-4 px-2">
        {nav.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "block px-3 py-1.5 text-[13px] rounded transition-colors",
                active
                  ? "bg-white/[0.04] text-white/90"
                  : "text-white/55 hover:text-white/90 hover:bg-white/[0.02]"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pt-2 pb-1.5 flex items-center justify-between">
        <span className="section-label">Recent</span>
        <Link
          href="/content"
          className="text-[10px] text-white/35 hover:text-white/70"
        >
          all
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {recent === null ? (
          <div className="px-3 py-2 text-[11px] text-white/35">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-white/35">
            No drafts yet.
          </div>
        ) : (
          recent.map((d) => (
            <Link
              key={d.id}
              href={`/content/${d.id}`}
              className="block pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors"
              title={statusLabel[d.status]}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "shrink-0 w-1.5 h-1.5 rounded-full",
                    statusDot[d.status]
                  )}
                />
                <span className="text-[12px] text-white/80 truncate leading-tight">
                  {d.title || "Untitled"}
                </span>
              </div>
              <div className="text-[10px] text-white/30 mt-0.5 pl-[0.875rem] flex items-center gap-2">
                <span className="uppercase tracking-wider">
                  {statusLabel[d.status]}
                </span>
                <span>·</span>
                <span>{formatRelative(d.updated_at)}</span>
              </div>
              {d.labels && d.labels.length > 0 ? (
                <div className="pl-[0.875rem] mt-1 flex flex-wrap gap-1">
                  {d.labels.slice(0, 2).map((l) => (
                    <span
                      key={l}
                      className="px-1 py-[1px] rounded-sm text-[9px] bg-white/[0.05] border border-white/[0.06] text-white/60"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-white/30">
        v0.3 · V3 refinements
      </div>
    </aside>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
