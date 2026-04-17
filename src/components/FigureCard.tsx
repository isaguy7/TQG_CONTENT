import Link from "next/link";
import { FigureTypeBadge } from "./FigureTypeBadge";

export type FigureCardData = {
  id: string;
  name_en: string;
  name_ar: string | null;
  type: string;
  era: string | null;
  themes: string[];
  posts_written: number;
  last_posted_at: string | null;
};

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function FigureCard({ figure }: { figure: FigureCardData }) {
  const neverPosted = figure.posts_written === 0;
  return (
    <Link
      href={`/figures/${figure.id}`}
      className="group block rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.05] hover:border-white/[0.1] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-white/90 leading-tight truncate">
            {figure.name_en}
          </h3>
          {figure.name_ar ? (
            <p
              className="text-[12px] text-white/50 mt-1 leading-tight truncate"
              dir="rtl"
              lang="ar"
            >
              {figure.name_ar}
            </p>
          ) : null}
        </div>
        <FigureTypeBadge type={figure.type} />
      </div>
      {figure.era ? (
        <p className="text-[11px] text-white/40 mb-3">{figure.era}</p>
      ) : null}
      <div className="flex flex-wrap gap-1 mb-3">
        {figure.themes.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/60"
          >
            {t}
          </span>
        ))}
      </div>
      <div className="text-[11px] pt-2 border-t border-white/[0.04]">
        {neverPosted ? (
          <span className="text-amber-400">Never posted</span>
        ) : (
          <span className="text-white/50">
            {figure.posts_written} post{figure.posts_written === 1 ? "" : "s"}
            {figure.last_posted_at ? (
              <span className="text-white/30">
                {" · "}
                {relativeDate(figure.last_posted_at)}
              </span>
            ) : null}
          </span>
        )}
      </div>
    </Link>
  );
}
