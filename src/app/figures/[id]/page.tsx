import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { FigureTypeBadge } from "@/components/FigureTypeBadge";
import { getSupabaseServer } from "@/lib/supabase";
import { StartPostButton } from "./StartPostButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Figure = {
  id: string;
  name_en: string;
  name_ar: string | null;
  type: string;
  era: string | null;
  bio_short: string;
  themes: string[];
  hook_angles: Array<{ category: string; text: string }>;
  notable_events: Array<{ event: string; description: string }>;
  quran_refs: string[];
  posts_written: number;
  last_posted_at: string | null;
};

type PostRow = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
};

const STATUS_TONES: Record<string, string> = {
  idea: "bg-white/[0.05] text-white/45",
  drafting: "bg-warning/[0.15] text-warning",
  review: "bg-warning/[0.15] text-warning",
  ready: "bg-primary/[0.2] text-primary-bright",
  scheduled: "bg-status-published/[0.2] text-status-published",
  published: "bg-status-published/[0.2] text-status-published",
};

function renderDescription(description: string, eventLabel: string) {
  const phrase = "verify on sunnah.com";
  const idx = description.toLowerCase().indexOf(phrase);
  if (idx === -1) return <>{description}</>;

  const before = description.slice(0, idx);
  const matched = description.slice(idx, idx + phrase.length);
  const after = description.slice(idx + phrase.length);
  const url = `https://sunnah.com/search?q=${encodeURIComponent(eventLabel)}`;

  return (
    <>
      {before}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-bright hover:underline"
      >
        {matched}
      </a>
      {after}
    </>
  );
}

function quranLink(ref: string): string | null {
  const match = ref.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const [, surah, ayah] = match;
  return `https://quran.com/${surah}/${ayah}`;
}

export default async function FigureDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = getSupabaseServer();

  const [figureRes, postsRes] = await Promise.all([
    db
      .from("islamic_figures")
      .select("*")
      .eq("id", params.id)
      .maybeSingle(),
    db
      .from("posts")
      .select("id,title,status,updated_at")
      .eq("figure_id", params.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (!figureRes.data) {
    notFound();
  }

  const figure = figureRes.data as Figure;
  const posts = (postsRes.data as PostRow[] | null) || [];

  return (
    <PageShell
      title={figure.name_en}
      description={figure.era || "Islamic figure"}
      actions={
        <Link
          href="/figures"
          className="px-3 py-1.5 rounded-md text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
        >
          ← All figures
        </Link>
      }
    >
      <div className="max-w-3xl space-y-8">
        {/* Header */}
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold text-white/90 leading-tight">
                {figure.name_en}
              </h2>
              {figure.name_ar ? (
                <p
                  className="text-[14px] text-white/60 mt-1"
                  dir="rtl"
                  lang="ar"
                >
                  {figure.name_ar}
                </p>
              ) : null}
            </div>
            <FigureTypeBadge type={figure.type} />
          </div>
          <p className="text-[13px] leading-relaxed text-white/70">
            {figure.bio_short}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {figure.themes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[11px] text-white/60"
              >
                {t}
              </span>
            ))}
          </div>
        </section>

        {/* Hook angles */}
        {figure.hook_angles?.length ? (
          <section>
            <div className="section-label mb-3">Hook angles</div>
            <div className="space-y-2">
              {figure.hook_angles.map((h, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.08em] text-primary-bright/80 font-medium mb-2">
                    {h.category}
                  </div>
                  <p className="text-[13px] text-white/80 leading-relaxed">
                    {h.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Notable events */}
        {figure.notable_events?.length ? (
          <section>
            <div className="section-label mb-3">Notable events</div>
            <div className="space-y-2">
              {figure.notable_events.map((e, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4"
                >
                  <h3 className="text-[13px] font-medium text-white/90 mb-1.5">
                    {e.event}
                  </h3>
                  <p className="text-[12px] text-white/60 leading-relaxed">
                    {renderDescription(e.description, e.event)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Quran references */}
        {figure.quran_refs?.length ? (
          <section>
            <div className="section-label mb-3">Quran references</div>
            <div className="flex flex-wrap gap-2">
              {figure.quran_refs.map((ref) => {
                const url = quranLink(ref);
                return url ? (
                  <a
                    key={ref}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white/90"
                  >
                    {ref}
                  </a>
                ) : (
                  <span
                    key={ref}
                    className="inline-flex items-center rounded bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 text-[12px] text-white/70"
                  >
                    {ref}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Posts about this figure */}
        <section>
          <div className="section-label mb-3">
            Posts about this figure ({posts.length})
          </div>
          {posts.length === 0 ? (
            <p className="text-[12px] text-white/40">No posts yet.</p>
          ) : (
            <div className="space-y-1">
              {posts.map((p) => (
                <Link
                  key={p.id}
                  href={`/content/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] border border-white/[0.06] px-3 py-2 hover:bg-white/[0.05]"
                >
                  <span className="text-[13px] text-white/80 truncate">
                    {p.title || "Untitled draft"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium ${
                        STATUS_TONES[p.status] || "bg-white/[0.05] text-white/45"
                      }`}
                    >
                      {p.status}
                    </span>
                    <span className="text-[11px] text-white/40">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Start a post */}
        <section className="pt-4 border-t border-white/[0.06]">
          <StartPostButton figureId={figure.id} />
        </section>
      </div>
    </PageShell>
  );
}
