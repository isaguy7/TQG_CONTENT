"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import {
  FigureQuranSection,
  FigureHadithSection,
} from "@/components/FigureRefsPanel";
import { cn } from "@/lib/utils";

type Figure = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  era: string | null;
  bio_short: string;
  themes: string[];
  hook_angles: unknown;
  notable_events: unknown;
  quran_refs: string[];
  posts_written: number;
  last_posted_at: string | null;
};

const TYPE_LABEL: Record<Figure["type"], string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

const TYPE_COLOR: Record<Figure["type"], string> = {
  sahabi: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  prophet: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  scholar: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  tabii: "bg-violet-500/15 text-violet-200 border-violet-400/30",
};

export default function FigureDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [figure, setFigure] = useState<Figure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quranImported, setQuranImported] = useState(true);
  const [creatingPost, setCreatingPost] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/figures/${params.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFigure(json.figure as Figure);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Check if quran_cache has any rows; if empty we nudge the user toward
    // the importer instead of letting searches fall silently flat.
    fetch("/api/quran/search?q=the&limit=1")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((j) => setQuranImported((j.results || []).length > 0))
      .catch(() => setQuranImported(false));
  }, []);

  const startPostAboutFigure = async () => {
    if (!figure) return;
    setCreatingPost(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `About ${figure.name_en}`,
          platform: "linkedin",
          figure_id: figure.id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { post } = await res.json();
      router.push(`/content/${post.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreatingPost(false);
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
      <PageShell title="Figure not found">
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

  return (
    <PageShell
      title={figure.name_en}
      description={figure.title || TYPE_LABEL[figure.type]}
      actions={
        <button
          onClick={startPostAboutFigure}
          disabled={creatingPost}
          className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {creatingPost ? "Creating…" : "Start post about this figure"}
        </button>
      }
    >
      <div className="max-w-3xl space-y-5">
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[22px] font-semibold text-white/90">
                {figure.name_en}
              </div>
              {figure.name_ar ? (
                <div
                  dir="rtl"
                  className="text-[18px] text-white/70 mt-1"
                >
                  {figure.name_ar}
                </div>
              ) : null}
              {figure.title ? (
                <div className="text-[12px] text-white/55 mt-1">
                  {figure.title}
                </div>
              ) : null}
            </div>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded-full border text-[11px] uppercase tracking-wider shrink-0",
                TYPE_COLOR[figure.type]
              )}
            >
              {TYPE_LABEL[figure.type]}
            </span>
          </div>
          {figure.era ? (
            <div className="text-[12px] text-white/50 mb-3">
              Era: {figure.era}
            </div>
          ) : null}
          <p className="text-[13px] text-white/80 leading-relaxed">
            {figure.bio_short}
          </p>
          {figure.themes.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {figure.themes.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/65"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-4 text-[11px] text-white/50">
            <span>
              Posts written:{" "}
              <span className="text-white/85 tabular-nums">
                {figure.posts_written}
              </span>
            </span>
            {figure.last_posted_at ? (
              <span>
                Last posted:{" "}
                <span className="text-white/85">
                  {new Date(figure.last_posted_at).toLocaleDateString()}
                </span>
              </span>
            ) : (
              <span className="text-amber-300/80">Never posted about</span>
            )}
          </div>
        </section>

        <FigureQuranSection
          figureId={figure.id}
          figureName={figure.name_en}
          quranImported={quranImported}
        />

        <FigureHadithSection
          figureId={figure.id}
          figureName={figure.name_en}
        />
      </div>
    </PageShell>
  );
}
