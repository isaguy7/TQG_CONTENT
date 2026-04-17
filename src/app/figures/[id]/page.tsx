"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import { ArrowLeft, PenLine } from "lucide-react";

type HookAngle = { angle?: string; example?: string } | string;
type NotableEvent = { title?: string; summary?: string; year?: string } | string;

type Figure = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  era: string | null;
  bio_short: string;
  themes: string[];
  hook_angles: HookAngle[];
  notable_events: NotableEvent[];
  quran_refs: string[];
  posts_written: number;
  last_posted_at: string | null;
};

type PostRow = {
  id: string;
  title: string | null;
  status: string;
  platform: string;
  updated_at: string;
};

const TYPE_LABEL: Record<Figure["type"], string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

const TYPE_TONE: Record<Figure["type"], string> = {
  sahabi: "bg-primary/15 text-primary-bright border-primary/30",
  prophet: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  scholar: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  tabii: "bg-indigo-500/15 text-indigo-300 border-indigo-400/30",
};

export default function FigureDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [figure, setFigure] = useState<Figure | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const fRes = await fetch(`/api/figures/${params.id}`);
        if (!fRes.ok) throw new Error(`Figure ${fRes.status}`);
        const { figure } = (await fRes.json()) as { figure: Figure };
        setFigure(figure);

        const pRes = await fetch(`/api/posts?figure_id=${params.id}`);
        if (pRes.ok) {
          const { posts } = (await pRes.json()) as { posts: PostRow[] };
          setPosts(posts.filter((p) => (p as unknown as { figure_id?: string }).figure_id === params.id || true));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id]);

  const startPost = async () => {
    if (!figure) return;
    setCreating(true);
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
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="text-[13px] text-white/40">Loading figure…</div>
      </PageShell>
    );
  }

  if (error || !figure) {
    return (
      <PageShell title="Not found">
        <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
          {error || "Figure not found"}
        </div>
        <Link
          href="/figures"
          className="inline-block mt-3 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
        >
          Back to figures
        </Link>
      </PageShell>
    );
  }

  const figurePosts = posts.filter(
    (p) => (p as unknown as { figure_id?: string }).figure_id === figure.id
  );

  return (
    <PageShell
      title={figure.name_en}
      description={figure.title || TYPE_LABEL[figure.type]}
      actions={
        <>
          <Link
            href="/figures"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <button
            onClick={startPost}
            disabled={creating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            <PenLine className="w-3.5 h-3.5" />
            {creating ? "Creating…" : "Start post about this figure"}
          </button>
        </>
      }
    >
      <div className="max-w-3xl space-y-5">
        <section className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border",
                    TYPE_TONE[figure.type]
                  )}
                >
                  {TYPE_LABEL[figure.type]}
                </span>
                {figure.era ? (
                  <span className="text-[11px] text-white/50">{figure.era}</span>
                ) : null}
              </div>
              {figure.name_ar ? (
                <div className="text-[20px] text-white/80 font-arabic mb-1">
                  {figure.name_ar}
                </div>
              ) : null}
              <div className="text-[13px] text-white/80 leading-relaxed">
                {figure.bio_short}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[22px] font-semibold text-white/90 tabular-nums">
                {figure.posts_written}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                posts written
              </div>
              {figure.last_posted_at ? (
                <div className="text-[11px] text-white/50 mt-1">
                  Last {formatDate(figure.last_posted_at)}
                </div>
              ) : null}
            </div>
          </div>

          {figure.themes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/[0.05]">
              {figure.themes.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary-bright border border-primary/20"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {figure.hook_angles.length > 0 ? (
          <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
            <div className="section-label mb-3">Hook angles</div>
            <ul className="space-y-2">
              {figure.hook_angles.map((h, i) => {
                const text = typeof h === "string" ? h : h.angle || "";
                const example =
                  typeof h === "object" && h !== null ? h.example : null;
                return (
                  <li key={i} className="text-[13px] text-white/80 leading-relaxed">
                    <div>
                      <span className="text-primary-bright">·</span> {text}
                    </div>
                    {example ? (
                      <div className="mt-0.5 ml-3 text-[12px] text-white/50 italic">
                        “{example}”
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {figure.notable_events.length > 0 ? (
          <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
            <div className="section-label mb-3">Notable events</div>
            <ul className="space-y-3">
              {figure.notable_events.map((e, i) => {
                const title = typeof e === "string" ? e : e.title || "";
                const summary =
                  typeof e === "object" && e !== null ? e.summary : null;
                const year =
                  typeof e === "object" && e !== null ? e.year : null;
                return (
                  <li key={i}>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[13px] font-medium text-white/85">
                        {title}
                      </div>
                      {year ? (
                        <span className="text-[11px] text-white/40 tabular-nums">
                          {year}
                        </span>
                      ) : null}
                    </div>
                    {summary ? (
                      <div className="text-[12px] text-white/60 mt-0.5 leading-relaxed">
                        {summary}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {figure.quran_refs.length > 0 ? (
          <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
            <div className="section-label mb-3">Quran references</div>
            <div className="flex flex-wrap gap-1.5">
              {figure.quran_refs.map((q) => (
                <span
                  key={q}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/[0.04] text-white/75 border border-white/[0.08]"
                >
                  {q}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {figurePosts.length > 0 ? (
          <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
            <div className="section-label mb-3">
              Posts about {figure.name_en}
            </div>
            <ul className="space-y-1">
              {figurePosts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/content/${p.id}`}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-[13px] text-white/85 truncate">
                      {p.title || "Untitled"}
                    </span>
                    <span className="text-[11px] text-white/40">
                      {p.platform} · {p.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
