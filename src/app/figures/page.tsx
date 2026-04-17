"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import { Users, Sparkles, BookOpen, Scroll } from "lucide-react";

type Figure = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  era: string | null;
  bio_short: string;
  themes: string[];
  posts_written: number;
  last_posted_at: string | null;
};

const TYPE_META: Record<
  Figure["type"],
  { label: string; tone: string; icon: typeof Users }
> = {
  sahabi: {
    label: "Sahabi",
    tone: "bg-primary/15 text-primary-bright border-primary/30",
    icon: Users,
  },
  prophet: {
    label: "Prophet",
    tone: "bg-amber-500/15 text-amber-300 border-amber-400/30",
    icon: Sparkles,
  },
  scholar: {
    label: "Scholar",
    tone: "bg-sky-500/15 text-sky-300 border-sky-400/30",
    icon: BookOpen,
  },
  tabii: {
    label: "Tabi'i",
    tone: "bg-indigo-500/15 text-indigo-300 border-indigo-400/30",
    icon: Scroll,
  },
};

const FILTERS: Array<{ key: "all" | Figure["type"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "sahabi", label: "Sahabah" },
  { key: "prophet", label: "Prophets" },
  { key: "scholar", label: "Scholars" },
  { key: "tabii", label: "Tabi'in" },
];

export default function FiguresPage() {
  const router = useRouter();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Figure["type"]>("all");
  const [query, setQuery] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/figures")
      .then((r) => r.json())
      .then((j) => {
        setFigures(j.figures || []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return figures.filter((f) => {
      if (filter !== "all" && f.type !== filter) return false;
      if (!q) return true;
      return (
        f.name_en.toLowerCase().includes(q) ||
        (f.name_ar || "").toLowerCase().includes(q) ||
        (f.title || "").toLowerCase().includes(q) ||
        f.themes.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [figures, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: figures.length };
    for (const f of figures) c[f.type] = (c[f.type] || 0) + 1;
    return c;
  }, [figures]);

  const startPost = async (figure: Figure) => {
    setCreatingId(figure.id);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: figure.name_en,
          platform: "linkedin",
          figure_id: figure.id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { post } = (await res.json()) as { post: { id: string } };
      router.push(`/content/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreatingId(null);
    }
  };

  return (
    <PageShell
      title="Islamic Figures"
      description="Sahabah, prophets, scholars, tabi'in"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key] || 0;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white/[0.03] text-white/65 border-white/[0.08] hover:bg-white/[0.06] hover:text-white/90"
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
            placeholder="Search figures, titles, themes…"
            className="w-60 bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 rounded-md px-3 py-1.5 text-[12px] text-white/85 placeholder-white/30 focus:outline-none transition-colors"
          />
        </div>

        {loading ? (
          <div className="text-[13px] text-white/40">Loading figures…</div>
        ) : error ? (
          <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-[13px] text-white/40">
            No figures match that filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((f) => {
              const meta = TYPE_META[f.type];
              const Icon = meta.icon;
              return (
                <div
                  key={f.id}
                  className="group relative rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-primary/40 hover:bg-white/[0.06] transition-colors p-4 flex flex-col"
                >
                  <Link
                    href={`/figures/${f.id}`}
                    className="flex-1 block"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-white/95 leading-tight truncate">
                          {f.name_en}
                        </div>
                        {f.name_ar ? (
                          <div className="text-[13px] text-white/50 font-arabic mt-0.5">
                            {f.name_ar}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border",
                          meta.tone
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </div>
                    {f.title ? (
                      <div className="text-[11px] text-white/55 mb-2 italic">
                        {f.title}
                      </div>
                    ) : null}
                    <p className="text-[12px] text-white/70 leading-relaxed line-clamp-3 mb-3">
                      {f.bio_short}
                    </p>
                    {f.themes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {f.themes.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.05] text-white/60 border border-white/[0.06]"
                          >
                            {t}
                          </span>
                        ))}
                        {f.themes.length > 4 ? (
                          <span className="px-1.5 py-0.5 text-[10px] text-white/40">
                            +{f.themes.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </Link>
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] text-white/40">
                    <span>
                      {f.posts_written} post
                      {f.posts_written === 1 ? "" : "s"}
                      {f.last_posted_at
                        ? ` · last ${formatDate(f.last_posted_at)}`
                        : ""}
                    </span>
                    <button
                      onClick={() => startPost(f)}
                      disabled={creatingId === f.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded text-[11px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 font-medium"
                    >
                      {creatingId === f.id ? "Creating…" : "Write about →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}
