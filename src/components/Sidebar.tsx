"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TypefullyAutoSync } from "@/components/TypefullyAutoSync";

type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string | null;
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/content", label: "Content" },
  { href: "/figures", label: "Figures" },
  { href: "/clips", label: "Clips" },
  { href: "/hadith", label: "References" },
  { href: "/calendar", label: "Calendar" },
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
  performance?: Record<string, unknown> | null;
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
  const router = useRouter();
  const [recent, setRecent] = useState<RecentPost[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const load = () => {
    fetch("/api/posts?limit=5")
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j) => {
        const items = (j.posts || []) as RecentPost[];
        setRecent(items.filter((p) => !p.deleted_at).slice(0, 5));
      })
      .catch(() => setRecent([]));
  };

  useEffect(() => {
    load();
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((j) => setMe(j.user || null))
      .catch(() => setMe(null));
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-48 shrink-0 bg-sidebar border-r border-white/[0.06] flex flex-col">
      <TypefullyAutoSync onDone={load} />
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
                "relative block pl-4 pr-3 py-2 text-[13px] rounded transition-colors",
                active
                  ? "bg-primary/[0.08] text-white/95"
                  : "text-white/55 hover:text-white/90 hover:bg-white/[0.025]"
              )}
            >
              {/* 2px accent-green left bar marks the current route. Kept
                  absolute so the text baselines line up between active /
                  inactive items. */}
              {active ? (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary-bright" />
              ) : null}
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
          recent.map((d) => {
            const isTypefully = Boolean(
              d.performance &&
                ((d.performance as Record<string, unknown>)
                  .imported_from_typefully ||
                  Array.isArray(
                    (d.performance as Record<string, unknown>)
                      .typefully_draft_ids
                  ))
            );
            return (
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
                {isTypefully ? (
                  <span
                    className="shrink-0 text-[8px] text-white/35 uppercase tracking-wider border border-white/[0.08] rounded px-1"
                    title="Typefully"
                  >
                    TF
                  </span>
                ) : null}
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
            );
          })
        )}
      </div>

      {me ? (
        <div className="px-3 py-3 border-t border-white/[0.06] flex items-center gap-2">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatar_url}
              alt=""
              className="w-7 h-7 rounded-full object-cover bg-white/[0.05]"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/[0.06] text-[10px] flex items-center justify-center text-white/60">
              {(me.full_name || me.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-white/85 truncate">
              {me.full_name || me.email}
            </div>
            <div className="text-[10px] text-white/35 truncate">
              {me.provider || "signed in"}
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="text-[10px] text-white/40 hover:text-white/85 disabled:opacity-40"
            title="Sign out"
          >
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      ) : (
        <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-white/30">
          v0.5 · polish + flow
        </div>
      )}
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
