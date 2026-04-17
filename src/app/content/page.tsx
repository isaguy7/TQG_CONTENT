"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  ArrowRight,
  User,
  BookOpen,
  Inbox,
} from "lucide-react";
import { PlatformIcon as PlatformGlyph } from "@/components/PlatformIcon";

type PostStatus =
  | "idea"
  | "drafting"
  | "review"
  | "ready"
  | "scheduled"
  | "published";

type Post = {
  id: string;
  title: string | null;
  final_content: string | null;
  status: PostStatus;
  platform: string;
  figure_id: string | null;
  updated_at: string;
};

type Figure = { id: string; name_en: string };

type FilterKey = "all" | PostStatus;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "idea", label: "Ideas" },
  { key: "drafting", label: "Drafting" },
  { key: "review", label: "Review" },
  { key: "ready", label: "Ready" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
];

const STATUS_TONE: Record<PostStatus, string> = {
  idea: "bg-white/[0.06] text-white/55",
  drafting: "bg-warning/15 text-warning",
  review: "bg-warning/15 text-warning",
  ready: "bg-primary/20 text-primary-bright",
  scheduled: "bg-status-published/20 text-status-published",
  published: "bg-status-published/20 text-status-published",
};

const STATUS_BORDER: Record<PostStatus, string> = {
  idea: "border-l-2 border-white/15",
  drafting: "border-l-2 border-status-drafting",
  review: "border-l-2 border-status-drafting",
  ready: "border-l-2 border-status-ready",
  scheduled: "border-l-2 border-status-published",
  published: "border-l-2 border-status-published",
};

export default function ContentListPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [figuresById, setFiguresById] = useState<Record<string, string>>({});
  const [hadithCounts, setHadithCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [postsRes, figuresRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/figures"),
      ]);
      if (!postsRes.ok) throw new Error(`Posts HTTP ${postsRes.status}`);
      const { posts } = (await postsRes.json()) as { posts: Post[] };
      setPosts(posts);
      if (figuresRes.ok) {
        const { figures } = (await figuresRes.json()) as { figures: Figure[] };
        const byId: Record<string, string> = {};
        for (const f of figures) byId[f.id] = f.name_en;
        setFiguresById(byId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/posts/${selectedId}`)
      .then((r) => r.json())
      .then((j) => {
        const refs = (j.hadith_refs as unknown[]) || [];
        setHadithCounts((prev) => ({ ...prev, [selectedId]: refs.length }));
      })
      .catch(() => {});
  }, [selectedId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const p of posts) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return (
        (p.title || "").toLowerCase().includes(q) ||
        (p.final_content || "").toLowerCase().includes(q)
      );
    });
  }, [posts, filter, query]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) || null,
    [filtered, selectedId]
  );

  const createDraft = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled draft", platform: "linkedin" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { post } = (await res.json()) as { post: Post };
      router.push(`/content/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <PageShell
      title="Content"
      description="Drafts, reviews, and published posts"
      actions={
        <button
          onClick={createDraft}
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
          {creating ? "Creating…" : "New post"}
        </button>
      }
      rightPanel={
        <PreviewPanel
          post={selected}
          figureName={
            selected?.figure_id ? figuresById[selected.figure_id] : null
          }
          hadithCount={selected ? hadithCounts[selected.id] : undefined}
          onClose={() => setSelectedId(null)}
        />
      }
    >
      <div className="flex flex-col h-full space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key] || 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white/[0.03] text-white/60 border-white/[0.08] hover:bg-white/[0.06] hover:text-white/90"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    active ? "text-primary-foreground/70" : "text-white/35"
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
          <div className="flex-1" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or body…"
            className="w-56 bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 rounded-md px-3 py-1.5 text-[12px] text-white/85 placeholder-white/30 focus:outline-none transition-colors"
          />
        </div>

        {loading ? (
          <div className="text-[13px] text-white/40">Loading…</div>
        ) : error ? (
          <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} onCreate={createDraft} />
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((p) => {
              const charCount = (p.final_content || "").length;
              const figureName = p.figure_id
                ? figuresById[p.figure_id]
                : null;
              const isSelected = p.id === selectedId;
              return (
                <li key={p.id}>
                  <div
                    onClick={() => setSelectedId(p.id)}
                    onDoubleClick={() => router.push(`/content/${p.id}`)}
                    className={cn(
                      "group cursor-pointer rounded-md px-3 py-3 pl-4 transition-colors",
                      STATUS_BORDER[p.status],
                      isSelected
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <PlatformGlyph
                        platform={p.platform}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-white/90 truncate">
                          {p.title || "Untitled"}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-white/45">
                          <span>{formatDate(p.updated_at)}</span>
                          {figureName ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="inline-flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                {figureName}
                              </span>
                            </>
                          ) : null}
                          {charCount > 0 ? (
                            <>
                              <span className="text-white/20">·</span>
                              <span className="tabular-nums">
                                {charCount.toLocaleString()} chars
                              </span>
                            </>
                          ) : null}
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
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function EmptyState({
  filter,
  onCreate,
}: {
  filter: FilterKey;
  onCreate: () => void;
}) {
  const copy =
    filter === "all"
      ? {
          title: "No posts yet",
          body: "Start your first draft to see it here.",
        }
      : {
          title: `Nothing in ${filter}`,
          body: "Try a different filter, or create a new draft.",
        };
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <Inbox className="w-6 h-6 text-white/25 mx-auto mb-3" />
      <div className="text-[14px] text-white/75 font-medium mb-1">
        {copy.title}
      </div>
      <div className="text-[12px] text-white/45 mb-4">{copy.body}</div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
      >
        <Plus className="w-3.5 h-3.5" />
        New draft
      </button>
    </div>
  );
}

function PreviewPanel({
  post,
  figureName,
  hadithCount,
  onClose,
}: {
  post: Post | null;
  figureName: string | null | undefined;
  hadithCount: number | undefined;
  onClose: () => void;
}) {
  if (!post) {
    return (
      <div className="p-5 text-[12px] text-white/40 leading-relaxed">
        <div className="section-label mb-2">Preview</div>
        Click a post on the left to peek at it here. Double-click to open the
        full editor.
      </div>
    );
  }

  const preview =
    (post.final_content || "").slice(0, 240) +
    ((post.final_content || "").length > 240 ? "…" : "");

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Preview</span>
        <button
          onClick={onClose}
          className="text-[11px] text-white/45 hover:text-white/85"
        >
          ×
        </button>
      </div>

      <div className="text-[15px] font-semibold text-white/95 mb-2 leading-snug">
        {post.title || "Untitled"}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
            STATUS_TONE[post.status]
          )}
        >
          {post.status}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
          <PlatformGlyph platform={post.platform} size="xs" />
          {post.platform}
        </span>
      </div>

      {figureName ? (
        <div className="flex items-center gap-1.5 text-[11px] text-white/55 mb-3">
          <User className="w-3 h-3 text-white/35" />
          {figureName}
        </div>
      ) : null}

      {typeof hadithCount === "number" && hadithCount > 0 ? (
        <div className="flex items-center gap-1.5 text-[11px] text-white/55 mb-3">
          <BookOpen className="w-3 h-3 text-white/35" />
          {hadithCount} hadith reference{hadithCount === 1 ? "" : "s"}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto mb-4">
        {post.final_content ? (
          <div className="text-[12px] text-white/75 leading-relaxed whitespace-pre-wrap">
            {preview}
          </div>
        ) : (
          <div className="text-[12px] text-white/35 italic">
            No draft content yet.
          </div>
        )}
      </div>

      <Link
        href={`/content/${post.id}`}
        className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
      >
        Open full editor
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <div className="text-[10px] text-white/30 mt-2 text-center">
        Updated {formatDate(post.updated_at)}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
