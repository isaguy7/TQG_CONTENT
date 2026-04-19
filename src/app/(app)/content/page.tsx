"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { TypefullyAutoSync } from "@/components/TypefullyAutoSync";
import { cn } from "@/lib/utils";

type PostStatus =
  | "idea"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"
  | "archived";

type PostRow = {
  id: string;
  title: string | null;
  status: PostStatus;
  platform: string;
  platforms?: string[] | null;
  updated_at: string;
  deleted_at: string | null;
  labels?: string[] | null;
  final_content?: string | null;
};

const statusBorder: Record<PostStatus, string> = {
  idea: "border-l-2 border-white/10",
  draft: "border-l-2 border-status-drafting",
  scheduled: "border-l-2 border-status-published",
  published: "border-l-2 border-status-published",
  failed: "border-l-2 border-danger/60",
  archived: "border-l-2 border-white/5",
};

type Toast = { message: string; undo?: () => void; id: number } | null;

// Simplified 4-stage pipeline for V10 — kanban rewrite in §4 restructures
// around the new status model (failed/archived aren't pipeline stages).
const PIPELINE: PostStatus[] = [
  "idea",
  "draft",
  "scheduled",
  "published",
];

export default function ContentListPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [deleted, setDeleted] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [stageFilter, setStageFilter] = useState<PostStatus | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, undo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ message, undo, id });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 6000);
  };

  const refresh = useCallback(async () => {
    try {
      const [aliveRes, trashRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/posts?deleted=true"),
      ]);
      if (!aliveRes.ok) throw new Error(`HTTP ${aliveRes.status}`);
      const { posts } = await aliveRes.json();
      const trashJson = trashRes.ok ? await trashRes.json() : { posts: [] };
      setPosts(posts);
      setDeleted(trashJson.posts || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDraft = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled draft", platform: "linkedin" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { post } = (await res.json()) as { post: PostRow };
      router.push(`/content/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  const duplicatePost = async (p: PostRow) => {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${p.title || "Untitled"} (copy)`,
        platform: p.platform,
        final_content: p.final_content || null,
      }),
    });
    if (res.ok) {
      showToast(`Duplicated "${p.title || "Untitled"}"`);
      refresh();
    } else {
      showToast("Duplicate failed");
    }
  };

  const moveToTrash = async (p: PostRow) => {
    if (
      !confirm(
        `Move "${p.title || "Untitled"}" to trash? You can restore it within 7 days.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/posts/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast("Delete failed");
      return;
    }
    showToast("Moved to trash", async () => {
      await fetch(`/api/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_at: null }),
      });
      refresh();
    });
    refresh();
  };

  const restore = async (p: PostRow) => {
    await fetch(`/api/posts/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleted_at: null }),
    });
    showToast(`Restored "${p.title || "Untitled"}"`);
    refresh();
  };

  const deletePermanent = async (p: PostRow) => {
    if (
      !confirm(
        `Permanently delete "${p.title || "Untitled"}"? This cannot be undone.`
      )
    ) {
      return;
    }
    await fetch(`/api/posts/${p.id}?permanent=true`, { method: "DELETE" });
    refresh();
  };

  const counts = posts.reduce<Record<PostStatus, number>>(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    { idea: 0, draft: 0, scheduled: 0, published: 0, failed: 0, archived: 0 }
  );
  const filtered = stageFilter
    ? posts.filter((p) => p.status === stageFilter)
    : posts;

  return (
    <PageShell
      title="Content"
      description="Drafts, reviews, and published posts"
    >
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="section-label">
            {posts.length} post{posts.length === 1 ? "" : "s"}
          </div>
          <div className="flex items-center gap-2">
            <TypefullyAutoSync onDone={refresh} />
            <button
              onClick={createDraft}
              disabled={creating}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {creating ? "Creating…" : "New post"}
            </button>
          </div>
        </div>

        <StatusPipeline
          counts={counts}
          active={stageFilter}
          onPick={(s) => setStageFilter((prev) => (prev === s ? null : s))}
        />

        {loading ? (
          <div className="text-[13px] text-white/40">Loading…</div>
        ) : error ? (
          <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState onCreate={createDraft} creating={creating} />
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-[12px] text-white/40">
            No posts in{" "}
            <span className="text-white/70 font-medium">{stageFilter}</span>.{" "}
            <button
              className="underline underline-offset-2 hover:text-white/80"
              onClick={() => setStageFilter(null)}
            >
              Clear filter
            </button>
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((p) => (
              <PostRowItem
                key={p.id}
                post={p}
                onDuplicate={() => duplicatePost(p)}
                onTrash={() => moveToTrash(p)}
              />
            ))}
          </ul>
        )}

        {deleted.length > 0 ? (
          <section className="mt-8 pt-6 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">
                Recently deleted ({deleted.length})
              </span>
              <span className="text-[11px] text-white/40">
                Auto-purged after 7 days
              </span>
            </div>
            <ul className="space-y-1">
              {deleted.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 rounded border border-white/[0.04] bg-white/[0.02] opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-white/75 truncate line-through decoration-white/30">
                      {p.title || "Untitled"}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">
                      {p.platform} · deleted{" "}
                      {p.deleted_at ? formatRelative(p.deleted_at) : "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(p)}
                    className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.04]"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => deletePermanent(p)}
                    className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/40 hover:text-danger hover:border-danger/40"
                  >
                    Delete forever
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {toast ? (
          <div
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 z-40",
              "flex items-center gap-3 px-4 py-2.5 rounded-lg bg-black/90 border border-white/[0.1]",
              "text-[12px] text-white/85 shadow-xl"
            )}
          >
            <span>{toast.message}</span>
            {toast.undo ? (
              <button
                onClick={() => {
                  const u = toast.undo!;
                  setToast(null);
                  u();
                }}
                className="px-2 py-0.5 rounded text-[11px] text-primary-bright hover:text-white border border-primary/40 hover:bg-primary/20"
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

function PostRowItem({
  post,
  onDuplicate,
  onTrash,
}: {
  post: PostRow;
  onDuplicate: () => void;
  onTrash: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <li
      className={cn(
        "relative flex items-stretch pl-3 pr-2 py-2.5 rounded-md transition-all duration-150",
        "hover:bg-white/[0.04] hover:-translate-y-[1px] hover:shadow-md hover:shadow-black/20",
        statusBorder[post.status]
      )}
    >
      <Link
        href={`/content/${post.id}`}
        className="flex-1 min-w-0 flex items-center justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-white/90 truncate">
            {post.title || "Untitled"}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5 flex items-center gap-2">
            <span>
              {post.platform} · updated {formatTime(post.updated_at)}
            </span>
            {post.labels && post.labels.length > 0 ? (
              <span className="flex gap-1">
                {post.labels.slice(0, 3).map((l) => (
                  <span
                    key={l}
                    className="px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] text-white/70"
                  >
                    {l}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        </div>
        <StatusBadge status={post.status} />
      </Link>
      <div
        ref={ref}
        className="relative ml-1 self-center"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Post actions"
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className="px-2 py-1 rounded text-white/40 hover:text-white/85 hover:bg-white/[0.05] text-[14px] leading-none"
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-white/[0.08] bg-black/95 shadow-xl py-1">
            <Link
              href={`/content/${post.id}`}
              className="block px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.05]"
              onClick={() => setMenuOpen(false)}
            >
              Open full editor
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                onDuplicate();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/[0.05]"
            >
              Duplicate
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onTrash();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-danger hover:bg-danger/[0.08]"
            >
              Move to trash
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const map: Record<PostStatus, { label: string; tone: string }> = {
    idea: { label: "idea", tone: "bg-white/[0.05] text-white/45" },
    draft: { label: "draft", tone: "bg-warning/[0.15] text-warning" },
    scheduled: {
      label: "scheduled",
      tone: "bg-status-published/[0.2] text-status-published",
    },
    published: {
      label: "published",
      tone: "bg-status-published/[0.2] text-status-published",
    },
    failed: { label: "failed", tone: "bg-danger/[0.15] text-danger" },
    archived: { label: "archived", tone: "bg-white/[0.03] text-white/30" },
  };
  const { label, tone } = map[status];
  return (
    <span
      className={cn(
        "shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
        tone
      )}
    >
      {label}
    </span>
  );
}

const STAGE_LABEL: Record<PostStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

const STAGE_DOT: Record<PostStatus, string> = {
  idea: "bg-white/35",
  draft: "bg-warning",
  scheduled: "bg-status-published",
  published: "bg-status-published",
  failed: "bg-danger",
  archived: "bg-white/20",
};

function StatusPipeline({
  counts,
  active,
  onPick,
}: {
  counts: Record<PostStatus, number>;
  active: PostStatus | null;
  onPick: (s: PostStatus) => void;
}) {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {PIPELINE.map((stage, idx) => {
          const isActive = active === stage;
          const count = counts[stage];
          return (
            <div key={stage} className="flex items-center gap-1">
              <button
                onClick={() => onPick(stage)}
                className={cn(
                  "group flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors",
                  isActive
                    ? "bg-white/[0.08] ring-1 ring-white/15"
                    : "hover:bg-white/[0.04]"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-2 h-2 rounded-full transition-all",
                    count > 0 ? STAGE_DOT[stage] : "ring-1 ring-inset ring-white/20 bg-transparent"
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] uppercase tracking-wider",
                    isActive ? "text-white/90" : "text-white/55 group-hover:text-white/85"
                  )}
                >
                  {STAGE_LABEL[stage]}
                </span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    count === 0 ? "text-white/25" : "text-white/70"
                  )}
                >
                  {count}
                </span>
              </button>
              {idx < PIPELINE.length - 1 ? (
                <span className="text-white/15 select-none">›</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
        <span className="text-primary-bright text-lg">✍︎</span>
      </div>
      <div className="text-[14px] font-semibold text-white/90 mb-1">
        Your drafts live here
      </div>
      <p className="text-[12px] text-white/55 max-w-xs mx-auto leading-relaxed mb-4">
        Start a new post from scratch or transcribe a video to use as a
        source. The editor picks up the rest.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {creating ? "Creating…" : "New blank post"}
        </button>
        <Link
          href="/content/new"
          className="px-3 py-1.5 rounded-md text-[12px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.04]"
        >
          From a video URL
        </Link>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
