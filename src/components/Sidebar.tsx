"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  Clapperboard,
  Clock3,
  FileText,
  LayoutDashboard,
  Lightbulb,
  PlayCircle,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TypefullyAutoSync } from "@/components/TypefullyAutoSync";

type Me = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string | null;
};

const nav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/figures", label: "Figures", icon: BookOpen },
  { href: "/clips", label: "Clips", icon: Clapperboard },
  { href: "/queue", label: "Render queue", icon: PlayCircle },
  { href: "/hadith", label: "References", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

type PostStatus =
  | "idea"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "archived";

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
  draft: "bg-amber-400",
  scheduled: "bg-sky-400",
  published: "bg-sky-400",
  failed: "bg-red-400",
  archived: "bg-white/20",
};

const statusLabel: Record<PostStatus, string> = {
  idea: "idea",
  draft: "draft",
  scheduled: "scheduled",
  published: "published",
  failed: "failed",
  archived: "archived",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [recent, setRecent] = useState<RecentPost[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaText, setIdeaText] = useState("");
  const [ideaSaving, setIdeaSaving] = useState(false);
  const [ideaMsg, setIdeaMsg] = useState<string | null>(null);
  const [ideaCreatedId, setIdeaCreatedId] = useState<string | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);

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

  const captureIdea = async () => {
    const note = ideaText.trim();
    if (!note) {
      setIdeaMsg("Add a quick note first.");
      return;
    }
    setIdeaSaving(true);
    setIdeaMsg(null);
    setIdeaCreatedId(null);
    try {
      const title = note.split(/\n/, 1)[0].slice(0, 120) || "New idea";
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, final_content: note }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { post?: { id?: string } };
      setIdeaMsg("Captured in Ideas");
      setIdeaCreatedId(j.post?.id || null);
      setIdeaText("");
      load();
    } catch (err) {
      setIdeaMsg((err as Error).message);
    } finally {
      setIdeaSaving(false);
    }
  };

  return (
    <>
      <aside className="relative w-16 shrink-0 bg-sidebar/90 border-r border-white/[0.06] flex flex-col items-center py-4 gap-3 backdrop-blur-md">
        <TypefullyAutoSync onDone={load} />
        <div className="w-10 h-10 rounded-xl bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-[11px] font-semibold text-white/90 shadow-lg shadow-black/30">
          TQG
        </div>

        <nav className="flex-1 flex flex-col gap-2 mt-3">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200",
                  active
                    ? "bg-[#1B5E20]/15 text-white ring-1 ring-[#1B5E20]/60 shadow-[0_0_14px_rgba(27,94,32,0.5)]"
                    : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="sr-only">{label}</span>
                <span className="pointer-events-none absolute left-14 z-20 rounded-lg bg-white/10 backdrop-blur-md px-2 py-1 text-[11px] text-white/85 opacity-0 shadow-xl shadow-black/30 transition-opacity duration-150 group-hover:opacity-100">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 pb-2">
          <button
            onClick={() => setRecentOpen((v) => !v)}
            className="group relative flex items-center justify-center w-10 h-10 rounded-xl text-white/70 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
          >
            <Clock3 className="w-5 h-5" />
            <span className="sr-only">Recent drafts</span>
            <span className="pointer-events-none absolute left-14 z-20 rounded-lg bg-white/10 backdrop-blur-md px-2 py-1 text-[11px] text-white/85 opacity-0 shadow-xl shadow-black/30 transition-opacity duration-150 group-hover:opacity-100">
              Recent drafts
            </span>
          </button>

          <button
            onClick={() => setIdeaOpen(true)}
            className="group relative flex items-center justify-center w-10 h-10 rounded-xl text-amber-50 bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 border border-emerald-400/40 hover:from-emerald-500/35 hover:to-cyan-500/35 transition-all shadow-lg shadow-emerald-500/25"
          >
            <Lightbulb className="w-5 h-5" />
            <span className="sr-only">Idea inbox</span>
            <span className="pointer-events-none absolute left-14 z-20 rounded-lg bg-white/10 backdrop-blur-md px-2 py-1 text-[11px] text-white/85 opacity-0 shadow-xl shadow-black/30 transition-opacity duration-150 group-hover:opacity-100">
              Idea inbox
            </span>
          </button>

          {me ? (
            <button
              onClick={signOut}
              disabled={signingOut}
              className="group relative flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/80 hover:border-emerald-400/50 hover:text-emerald-50 transition-all"
              title={me.full_name || me.email || "Account"}
            >
              {me.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.avatar_url}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                (me.full_name || me.email || "?").slice(0, 1).toUpperCase()
              )}
              <span className="pointer-events-none absolute left-14 z-20 rounded-lg bg-white/10 backdrop-blur-md px-2 py-1 text-[11px] text-white/85 opacity-0 shadow-xl shadow-black/30 transition-opacity duration-150 group-hover:opacity-100">
                {signingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          ) : null}
        </div>
      </aside>

      {ideaOpen ? (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIdeaOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-16 top-6 w-[320px] rounded-2xl border border-white/[0.12] bg-white/[0.12] backdrop-blur-xl shadow-2xl shadow-emerald-500/25 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.08em] text-white/60">
                  Idea inbox
                </div>
                <div className="text-[13px] text-white/85">
                  Capture a spark, promote later.
                </div>
              </div>
              <button
                onClick={() => setIdeaOpen(false)}
                className="text-[11px] text-white/50 hover:text-white/80"
              >
                Close
              </button>
            </div>
            <textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="Drop a thought, hook, or fragment…"
              className="w-full rounded-xl bg-black/30 border border-white/[0.12] px-3 py-2 text-[13px] text-white/85 placeholder-white/35 focus:outline-none focus:border-emerald-400/60 min-h-[120px]"
            />
            {ideaMsg ? (
              <div className="text-[12px] text-emerald-100 bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-2 py-1">
                {ideaMsg}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                onClick={captureIdea}
                disabled={ideaSaving}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-[12px] font-semibold hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 transition-all"
              >
                {ideaSaving ? "Saving…" : "Save to Ideas"}
              </button>
              {ideaCreatedId ? (
                <Link
                  href={`/content/${ideaCreatedId}`}
                  className="text-[12px] text-white/75 underline underline-offset-2 hover:text-white"
                  onClick={() => setIdeaOpen(false)}
                >
                  Open draft →
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {recentOpen ? (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setRecentOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-16 top-20 w-[360px] rounded-2xl border border-white/[0.12] bg-white/[0.1] backdrop-blur-xl shadow-2xl shadow-black/30 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-[12px] uppercase tracking-[0.08em] text-white/60">
                Recent drafts
              </div>
              <Link
                href="/content"
                className="text-[11px] text-white/65 underline underline-offset-2 hover:text-white"
              >
                View all
              </Link>
            </div>
            {recent === null ? (
              <div className="text-[12px] text-white/55">Loading…</div>
            ) : recent.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.18] bg-black/30 p-3 text-[12px] text-white/60 text-center">
                Your workspace is clear. Capture an idea or draft a post.
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((d) => {
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
                      className="block rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2 hover:border-emerald-400/50 hover:bg-emerald-500/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "shrink-0 w-2 h-2 rounded-full",
                            statusDot[d.status]
                          )}
                        />
                        <span className="text-[13px] text-white/90 truncate">
                          {d.title || "Untitled"}
                        </span>
                        {isTypefully ? (
                          <span className="shrink-0 text-[9px] text-white/50 uppercase tracking-wider border border-white/[0.15] rounded px-1.5">
                            TF
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-white/45 mt-0.5 flex items-center gap-2">
                        <span className="uppercase tracking-wide">
                          {statusLabel[d.status]}
                        </span>
                        <span>·</span>
                        <span>{formatRelative(d.updated_at)}</span>
                        {d.labels && d.labels.length > 0 ? (
                          <span className="truncate">
                            · {d.labels.slice(0, 2).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
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
