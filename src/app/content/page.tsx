"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";

type PostRow = {
  id: string;
  title: string | null;
  status: "idea" | "drafting" | "review" | "ready" | "scheduled" | "published";
  platform: string;
  updated_at: string;
};

const statusBorder: Record<PostRow["status"], string> = {
  idea: "border-l-2 border-white/10",
  drafting: "border-l-2 border-status-drafting",
  review: "border-l-2 border-status-drafting",
  ready: "border-l-2 border-status-ready",
  scheduled: "border-l-2 border-status-published",
  published: "border-l-2 border-status-published",
};

export default function ContentListPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { posts } = (await res.json()) as { posts: PostRow[] };
      setPosts(posts);
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
          <button
            onClick={createDraft}
            disabled={creating}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            {creating ? "Creating…" : "New post"}
          </button>
        </div>

        {loading ? (
          <div className="text-[13px] text-white/40">Loading…</div>
        ) : error ? (
          <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[13px] text-white/40">
            No posts yet. Click &apos;New post&apos; to create a draft.
          </div>
        ) : (
          <ul className="space-y-1">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/content/${p.id}`}
                  className={cn(
                    "block pl-3 pr-4 py-3 rounded hover:bg-white/[0.03] transition-colors",
                    statusBorder[p.status]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-white/90 truncate">
                        {p.title || "Untitled"}
                      </div>
                      <div className="text-[11px] text-white/40 mt-0.5">
                        {p.platform} · updated {formatTime(p.updated_at)}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function StatusBadge({ status }: { status: PostRow["status"] }) {
  const map: Record<PostRow["status"], { label: string; tone: string }> = {
    idea: { label: "idea", tone: "bg-white/[0.05] text-white/45" },
    drafting: { label: "drafting", tone: "bg-warning/[0.15] text-warning" },
    review: { label: "review", tone: "bg-warning/[0.15] text-warning" },
    ready: { label: "ready", tone: "bg-primary/[0.2] text-primary-bright" },
    scheduled: {
      label: "scheduled",
      tone: "bg-status-published/[0.2] text-status-published",
    },
    published: {
      label: "published",
      tone: "bg-status-published/[0.2] text-status-published",
    },
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
